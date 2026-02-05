import { Router, Request, Response } from 'express';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { decodePaymentHeader, verifyPaymentAuth, isPaymentFresh, parsePaymentScheme } from '../services/signature';
import { settlePayment, toBaseUnits } from '../services/settlement';
import { calculateFeeDiscountPct, applyDiscount } from '../services/reputation';
import { getConfig } from '../config';
import { insertSettlement, updateSettlementConfirmed, updateSettlementStatus, insertFeeLedger, getSettlementStats, getWalletDisputeStats, getWalletAverageQuality, getMonthlyVolume } from '../db/queries';
import { calculateReputationScore } from '../services/reputation';
import { SettleRequest } from '../types';

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
    if (!scheme || scheme.network !== 'solana:mainnet') {
      res.status(400).json({ success: false, error: 'Unsupported network' });
      return;
    }

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

    let merchantKey: PublicKey;
    try {
      merchantKey = new PublicKey(merchantWallet);
    } catch {
      res.status(400).json({ success: false, error: 'Invalid wallet address' });
      return;
    }

    const settlement = await insertSettlement(
      merchantWallet,
      payment.payer,
      amount,
      0,
      'USDC',
      '',
      'pending',
      'solana:mainnet'
    );

    try {
      const [stats, disputeStats, avgQuality, monthlyVol] = await Promise.all([
        getSettlementStats(merchantWallet),
        getWalletDisputeStats(merchantWallet),
        getWalletAverageQuality(merchantWallet),
        getMonthlyVolume(merchantWallet),
      ]);

      const repScore = calculateReputationScore(
        stats.totalSettlements,
        disputeStats.filed,
        disputeStats.won,
        avgQuality
      );
      const discountPct = calculateFeeDiscountPct(repScore, monthlyVol);
      const effectiveFeeBps = applyDiscount(config.SETTLEMENT_FEE_BPS, discountPct);

      const result = await settlePayment(
        connection,
        facilitatorKeypair,
        merchantKey,
        amount,
        effectiveFeeBps
      );

      await updateSettlementConfirmed(settlement.id, result.txHash, result.fee);
      await insertFeeLedger(settlement.id, null, 'settlement', result.fee, result.txHash);

      res.json({
        success: true,
        txHash: result.txHash,
        amount,
        fee: result.fee,
        net: result.net,
        feeDiscount: discountPct > 0 ? { discountPct, effectiveFeeBps, reason: `reputation=${repScore}, volume=${monthlyVol}` } : undefined,
      });
    } catch (err: any) {
      await updateSettlementStatus(settlement.id, 'failed');
      res.status(500).json({ success: false, error: `Settlement failed: ${err.message}` });
    }
  });

  return router;
}
