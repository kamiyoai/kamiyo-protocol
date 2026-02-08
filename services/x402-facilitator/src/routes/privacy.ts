import * as crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { Keypair, PublicKey } from '@solana/web3.js';
import { decodePaymentHeader, verifyPaymentAuth, isPaymentFresh, parsePaymentScheme } from '../services/signature';
import { toBaseUnits } from '../services/settlement';
import { calculateFeeDiscountPct, applyDiscount, calculateReputationScore } from '../services/reputation';
import {
  isPrivacyEnabled,
  getPrivacyTierConfig,
  getEligiblePrivacyTier,
  generateShadowProof,
  routePrivateTransfer,
  calculateRelayerFee,
  PRIVACY_TIERS,
  SHADOWPAY_RELAYER_FEE_BPS,
} from '../services/privacy';
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
  updateSettlementShadowProof,
  getSettlementByNullifierFull,
  reservePaymentNonce,
} from '../db/queries';
import { PrivateSettleRequest, PrivateSettleResponse } from '../types';
import { isSolanaMainnet, SOLANA_MAINNET_CAIP2 } from '../protocol/networks';

export function createPrivacyRouter(_facilitatorConnection: unknown, facilitatorKeypair: Keypair): Router {
  const router = Router();

  router.post('/settle', async (req: Request, res: Response<PrivateSettleResponse>) => {
    try {
      if (!isPrivacyEnabled()) {
        res.status(503).json({ success: false, error: 'Privacy settlements not enabled' });
        return;
      }

      const { paymentHeader, merchantWallet, amount, asset } = req.body as PrivateSettleRequest;
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
      if (!scheme || !isSolanaMainnet(scheme.network)) {
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

      try { new PublicKey(merchantWallet); } catch { res.status(400).json({ success: false, error: 'Invalid wallet address' }); return; }

      const salt = crypto.createHash('sha256').update(paymentHeader).digest(); // deterministic for idempotency
      const shadowProof = generateShadowProof(payment.payer, merchantWallet, amount, salt);
      const existing = await getSettlementByNullifierFull(shadowProof.nullifier);
      if (existing) {
        const storedRelayerFee = calculateRelayerFee(Number(existing.amount), SHADOWPAY_RELAYER_FEE_BPS);
        const feeAmount = Number(existing.fee_amount || 0);
        const net = Math.round((Number(existing.amount) - feeAmount - storedRelayerFee) * 1e6) / 1e6;
        res.json({
          success: true,
          shadowCommitment: existing.shadow_commitment || shadowProof.commitment,
          shadowNullifier: shadowProof.nullifier,
          relayerFee: storedRelayerFee,
          amount: Number(existing.amount),
          fee: feeAmount,
          net,
          privacyTier: (existing as any).privacy_tier || undefined,
        });
        return;
      }

      const nonceReserved = await reservePaymentNonce(
        payment.payer,
        payment.nonce,
        'privacy',
        SOLANA_MAINNET_CAIP2,
        payment.resource || '',
        amount
      );
      if (!nonceReserved) {
        res.status(409).json({ success: false, error: 'Payment nonce already used' });
        return;
      }

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

      const eligibleTier = getEligiblePrivacyTier(repScore);
      if (eligibleTier === 'none') {
        res.status(403).json({ success: false, error: 'Reputation too low for private settlements' });
        return;
      }

      const requestedTier = (req.body as PrivateSettleRequest).privacyTier || eligibleTier;
      const tierConfig = getPrivacyTierConfig(requestedTier);

      if (repScore < tierConfig.minReputationScore) {
        res.status(403).json({ success: false, error: `Reputation ${repScore} below ${tierConfig.tier} tier minimum (${tierConfig.minReputationScore})` });
        return;
      }

      if (amount > tierConfig.maxTransferAmount) {
        res.status(400).json({ success: false, error: `Amount exceeds ${tierConfig.tier} tier limit (${tierConfig.maxTransferAmount})` });
        return;
      }

      const discountPct = calculateFeeDiscountPct(repScore, monthlyVol);
      const effectiveFeeBps = applyDiscount(config.SETTLEMENT_FEE_BPS, discountPct);

      const relayerFee = calculateRelayerFee(amount, SHADOWPAY_RELAYER_FEE_BPS);
      const estimatedFee = Math.ceil(((amount * effectiveFeeBps) / 10_000) * 1e6) / 1e6;
      if (estimatedFee + relayerFee >= amount) {
        res.status(400).json({ success: false, error: 'Amount too small after fees' });
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
        SOLANA_MAINNET_CAIP2
      );

      try {
        const privateResult = await routePrivateTransfer(facilitatorKeypair, merchantWallet, amount);
        if (!privateResult.success) {
          await updateSettlementStatus(settlement.id, 'failed');
          res.status(500).json({ success: false, error: `Private transfer failed: ${privateResult.error}` });
          return;
        }

        const fee = Math.ceil(((amount * effectiveFeeBps) / 10_000) * 1e6) / 1e6;
        const net = Math.round((amount - fee - relayerFee) * 1e6) / 1e6;

        await updateSettlementConfirmed(settlement.id, privateResult.signature || '', fee);
        await updateSettlementShadowProof(settlement.id, shadowProof.commitment, shadowProof.nullifier, tierConfig.tier);
        await insertFeeLedger(settlement.id, null, 'private_settlement', fee, privateResult.signature || null);

        res.json({
          success: true,
          shadowCommitment: shadowProof.commitment,
          shadowNullifier: shadowProof.nullifier,
          relayerFee,
          amount,
          fee,
          net,
          privacyTier: tierConfig.tier,
        });
      } catch (err: any) {
        await updateSettlementStatus(settlement.id, 'failed');
        res.status(500).json({ success: false, error: `Settlement failed: ${err.message}` });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Private settlement failed' });
    }
  });

  router.get('/tiers', (_req: Request, res: Response) => {
    const enabled = isPrivacyEnabled();
    res.json({
      enabled,
      tiers: PRIVACY_TIERS.filter((t) => t.tier !== 'none').map((t) => ({
        tier: t.tier,
        minReputationScore: t.minReputationScore,
        maxTransferAmount: t.maxTransferAmount,
        relayerFeeBps: t.relayerFeeBps,
      })),
    });
  });

  return router;
}
