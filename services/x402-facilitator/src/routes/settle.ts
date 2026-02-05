import { Router, Request, Response } from 'express';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { decodePaymentHeader, verifyPaymentAuth, isPaymentFresh, parsePaymentScheme } from '../services/signature';
import { settlePayment, toBaseUnits } from '../services/settlement';
import { isAddress } from 'ethers';
import { settlePaymentBase, isBaseEnabled } from '../services/base-settlement';
import { calculateFeeDiscountPct, applyDiscount } from '../services/reputation';
import { getConfig } from '../config';
import { insertSettlement, updateSettlementConfirmed, updateSettlementStatus, insertFeeLedger, getSettlementStats, getWalletDisputeStats, getWalletAverageQuality, getMonthlyVolume } from '../db/queries';
import { calculateReputationScore } from '../services/reputation';
import { SettleRequest } from '../types';

function getSupportedNetworks(): string[] {
  const networks = ['solana:mainnet'];
  if (isBaseEnabled()) networks.push('eip155:8453');
  return networks;
}

export function createSettleRouter(connection: Connection, facilitatorKeypair: Keypair): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const { paymentHeader, merchantWallet, amount, asset } = req.body as SettleRequest;

    if (!paymentHeader || !merchantWallet || amount == null) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    const normalizedAsset = asset || 'USDC';
    if (normalizedAsset !== 'USDC') {
      res.status(400).json({ success: false, error: 'Only USDC supported' });
      return;
    }

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ success: false, error: 'Invalid amount' });
      return;
    }

    const scheme = parsePaymentScheme(paymentHeader);
    if (!scheme || !getSupportedNetworks().includes(scheme.network)) {
      res.status(400).json({ success: false, error: 'Unsupported network' });
      return;
    }

    const isBase = scheme.network === 'eip155:8453';

    const payment = decodePaymentHeader(paymentHeader);
    if (!payment) {
      res.status(400).json({ success: false, error: 'Malformed payment header' });
      return;
    }

    const config = getConfig();

    if (!isPaymentFresh(payment, config.MAX_PAYMENT_AGE_MS)) {
      res.status(400).json({ success: false, error: 'Payment expired' });
      return;
    }

    if (!verifyPaymentAuth(payment)) {
      res.status(400).json({ success: false, error: 'Invalid signature' });
      return;
    }

    if (amount > config.MAX_SETTLEMENT_AMOUNT) {
      res.status(400).json({ success: false, error: 'Amount exceeds limit' });
      return;
    }

    if (toBaseUnits(parseFloat(payment.amount)) !== toBaseUnits(amount)) {
      res.status(400).json({ success: false, error: 'Amount mismatch with signed payload' });
      return;
    }

    if ((req as any).merchantWallet !== merchantWallet) {
      res.status(403).json({ success: false, error: 'Merchant wallet does not match API key' });
      return;
    }

    if (isBase) {
      if (!isAddress(merchantWallet)) {
        res.status(400).json({ success: false, error: 'Invalid Base wallet address' });
        return;
      }
    } else {
      try {
        new PublicKey(merchantWallet);
      } catch {
        res.status(400).json({ success: false, error: 'Invalid Solana wallet address' });
        return;
      }
    }

    const settlement = await insertSettlement(
      merchantWallet,
      payment.payer,
      amount,
      0,
      'USDC',
      '',
      'pending',
      scheme.network
    );

    try {
      const [stats, disputeStats, avgQuality, monthlyVol] = await Promise.all([
        getSettlementStats(merchantWallet),
        getWalletDisputeStats(merchantWallet),
        getWalletAverageQuality(merchantWallet),
        getMonthlyVolume(merchantWallet)
      ]);

      const repScore = calculateReputationScore(
        stats.totalSettlements,
        disputeStats.filed,
        disputeStats.won,
        avgQuality
      );
      const discountPct = calculateFeeDiscountPct(repScore, monthlyVol);
      const effectiveFeeBps = applyDiscount(config.SETTLEMENT_FEE_BPS, discountPct);

      let onchain: { txHash: string; fee: number; net: number };

      if (isBase) {
        onchain = await settlePaymentBase(merchantWallet, amount, effectiveFeeBps);
      } else {
        onchain = await settlePayment(
          connection,
          facilitatorKeypair,
          new PublicKey(merchantWallet),
          amount,
          effectiveFeeBps
        );
      }

      await updateSettlementConfirmed(settlement.id, onchain.txHash, onchain.fee);
      await insertFeeLedger(settlement.id, null, 'settlement', onchain.fee, onchain.txHash);

      res.json({
        success: true,
        txHash: onchain.txHash,
        amount,
        fee: onchain.fee,
        net: onchain.net,
        network: scheme.network,
        feeDiscount: discountPct > 0 ? { discountPct, effectiveFeeBps, reason: `reputation=${repScore}, volume=${monthlyVol}` } : undefined
      });
    } catch (err: any) {
      await updateSettlementStatus(settlement.id, 'failed');
      res.status(500).json({ success: false, error: `Settlement failed: ${err.message}` });
    }
  });

  return router;
}
