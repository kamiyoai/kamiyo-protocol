import { Router, Request, Response } from 'express';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { decodePaymentHeader, verifyPaymentAuth, isPaymentFresh, parsePaymentScheme } from '../services/signature';
import { settlePayment, toBaseUnits } from '../services/settlement';
import { isAddress } from 'ethers';
import { settlePaymentBase, isBaseEnabled } from '../services/base-settlement';
import { calculateFeeDiscountPct, applyDiscount } from '../services/reputation';
import { getConfig } from '../config';
import {
  insertSettlement,
  updateSettlementConfirmed,
  updateSettlementStatus,
  insertFeeLedger,
  getSettlementStats,
  getWalletDisputeStats,
  getWalletAverageQuality,
  getMonthlyVolume,
  reservePaymentNonce,
} from '../db/queries';
import { calculateReputationScore } from '../services/reputation';
import { canonicalizeNetwork, isSupportedNetwork, BASE_MAINNET_CAIP2, isValidPayerForNetwork } from '../protocol/networks';
import { matchesUsdcAmount, parseSettleInput } from '../protocol/request-compat';

function sendSettleFailure(
  res: Response,
  status: number,
  reason: string,
  message: string,
  network: string,
  payer?: string
): void {
  res.status(status).json({
    success: false,
    errorReason: reason,
    errorMessage: message,
    error: message,
    payer,
    transaction: '',
    txHash: '',
    network,
  });
}

export function createSettleRouter(connection: Connection, facilitatorKeypair: Keypair): Router {
  const router = Router();
  const getErrorMessage = (err: unknown): string =>
    err instanceof Error ? err.message : 'unknown error';

  router.post('/', async (req: Request, res: Response) => {
    const parsedInput = parseSettleInput(req.body);
    if (!parsedInput.ok) {
      sendSettleFailure(res, 400, 'invalid_request', parsedInput.error, 'unknown:unknown');
      return;
    }

    const {
      mode,
      paymentHeader,
      merchantWallet,
      amount: legacyAmount,
      asset,
      requirementAmountRaw,
      requirementNetwork,
      requirementResource,
    } = parsedInput.value;

    const normalizedAsset = asset || 'USDC';
    if (normalizedAsset !== 'USDC') {
      sendSettleFailure(res, 400, 'unsupported_asset', 'Only USDC supported', 'unknown:unknown');
      return;
    }

    const scheme = parsePaymentScheme(paymentHeader);
    const network = scheme ? canonicalizeNetwork(scheme.network) : null;
    if (!scheme || !network || !isSupportedNetwork(network, isBaseEnabled())) {
      sendSettleFailure(res, 400, 'unsupported_network', 'Unsupported network', network || 'unknown:unknown');
      return;
    }

    if (requirementNetwork) {
      const requiredNetwork = canonicalizeNetwork(requirementNetwork);
      if (!requiredNetwork || requiredNetwork !== network) {
        sendSettleFailure(res, 400, 'network_mismatch', 'paymentRequirements.network does not match payment payload network', network);
        return;
      }
    }

    if (mode === 'legacy' && (legacyAmount == null || !Number.isFinite(legacyAmount) || legacyAmount <= 0)) {
      sendSettleFailure(res, 400, 'invalid_amount', 'Invalid amount', network);
      return;
    }

    const isBase = network === BASE_MAINNET_CAIP2;

    const payment = decodePaymentHeader(paymentHeader);
    if (!payment) {
      sendSettleFailure(res, 400, 'invalid_payment_payload', 'Malformed payment header', network);
      return;
    }

    const config = getConfig();

    if (!isPaymentFresh(payment, config.MAX_PAYMENT_AGE_MS)) {
      sendSettleFailure(res, 400, 'payment_expired', 'Payment expired', network, payment.payer);
      return;
    }

    if (!verifyPaymentAuth(payment)) {
      sendSettleFailure(res, 400, 'invalid_signature', 'Invalid signature', network, payment.payer);
      return;
    }

    if (!isValidPayerForNetwork(payment.payer, network)) {
      sendSettleFailure(res, 400, 'invalid_payer_wallet', 'Invalid payer wallet for network', network, payment.payer);
      return;
    }

    const signedAmount = parseFloat(payment.amount);
    if (!Number.isFinite(signedAmount) || signedAmount <= 0) {
      sendSettleFailure(res, 400, 'invalid_amount', 'Invalid amount', network, payment.payer);
      return;
    }

    if (!matchesUsdcAmount(signedAmount, requirementAmountRaw)) {
      sendSettleFailure(res, 400, 'amount_mismatch', 'Amount mismatch with payment requirements', network, payment.payer);
      return;
    }

    if (
      requirementResource &&
      payment.resource &&
      requirementResource !== payment.resource
    ) {
      sendSettleFailure(
        res,
        400,
        'resource_mismatch',
        'Resource mismatch with payment requirements',
        network,
        payment.payer
      );
      return;
    }

    const amount = mode === 'x402' ? signedAmount : (legacyAmount as number);

    if (amount > config.MAX_SETTLEMENT_AMOUNT) {
      sendSettleFailure(res, 400, 'amount_exceeds_limit', 'Amount exceeds limit', network, payment.payer);
      return;
    }

    if (mode === 'legacy' && toBaseUnits(signedAmount) !== toBaseUnits(amount)) {
      sendSettleFailure(res, 400, 'amount_mismatch', 'Amount mismatch with signed payload', network, payment.payer);
      return;
    }

    if ((req as any).merchantWallet !== merchantWallet) {
      sendSettleFailure(res, 403, 'merchant_mismatch', 'Merchant wallet does not match API key', network, payment.payer);
      return;
    }

    if (isBase) {
      if (!isAddress(merchantWallet)) {
        sendSettleFailure(res, 400, 'invalid_wallet', 'Invalid Base wallet address', network, payment.payer);
        return;
      }
    } else {
      try {
        new PublicKey(merchantWallet);
      } catch {
        sendSettleFailure(res, 400, 'invalid_wallet', 'Invalid Solana wallet address', network, payment.payer);
        return;
      }
    }

    const nonceReserved = await reservePaymentNonce(
      payment.payer,
      payment.nonce,
      'settle',
      network,
      payment.resource || requirementResource || '',
      amount
    );
    if (!nonceReserved) {
      sendSettleFailure(res, 409, 'replayed_payment', 'Payment nonce already used', network, payment.payer);
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
      network
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
        transaction: onchain.txHash,
        payer: payment.payer,
        txHash: onchain.txHash,
        amount,
        fee: onchain.fee,
        net: onchain.net,
        network,
        feeDiscount: discountPct > 0 ? { discountPct, effectiveFeeBps, reason: `reputation=${repScore}, volume=${monthlyVol}` } : undefined
      });
    } catch (err) {
      await updateSettlementStatus(settlement.id, 'failed');
      sendSettleFailure(
        res,
        500,
        'settlement_failed',
        `Settlement failed: ${getErrorMessage(err)}`,
        network,
        payment.payer
      );
    }
  });

  return router;
}
