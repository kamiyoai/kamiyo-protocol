import { Router, Request, Response } from 'express';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { decodePaymentHeader, verifyPaymentAuth, isPaymentFresh, parsePaymentScheme } from '../services/signature';
import { createEscrow, releaseEscrow, calculateRefundPercent } from '../services/escrow';
import { calculateFee, toBaseUnits } from '../services/settlement';
import { getConfig } from '../config';
import { insertEscrowRecord, getEscrowByAddress, updateEscrowRelease, insertFeeLedger, reservePaymentNonce } from '../db/queries';
import { EscrowCreateRequest, EscrowReleaseRequest } from '../types';
import { canonicalizeNetwork, isSolanaMainnet } from '../protocol/networks';
import { parseSignedUsdcAmount } from '../protocol/request-compat';

function round6(n: number): number { return Math.round(n * 1e6) / 1e6; }

export function createEscrowRouter(connection: Connection, operatorKeypair: Keypair): Router {
  const router = Router();

  router.post('/create', async (req: Request, res: Response) => {
    const { paymentHeader, merchantWallet, amount, sessionId, timeLockSeconds, asset } = req.body as EscrowCreateRequest & { asset?: string };

    if (!paymentHeader || !merchantWallet || amount == null || !sessionId) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    try { new PublicKey(merchantWallet); } catch { res.status(400).json({ success: false, error: 'Invalid merchant wallet' }); return; }

    if ((req as any).merchantWallet !== merchantWallet) {
      res.status(403).json({ success: false, error: 'Merchant wallet does not match API key' });
      return;
    }

    const normalizedAsset = asset || 'USDC';
    if (normalizedAsset !== 'USDC') {
      res.status(400).json({ success: false, error: 'Only USDC supported' });
      return;
    }

    if (typeof paymentHeader !== 'string' || paymentHeader.length > 4096) {
      res.status(400).json({ success: false, error: 'Invalid payment header' });
      return;
    }

    const scheme = parsePaymentScheme(paymentHeader);
    if (!scheme || !isSolanaMainnet(scheme.network)) {
      res.status(400).json({ success: false, error: 'Unsupported network' });
      return;
    }
    const canonicalNetwork = canonicalizeNetwork(scheme.network) || scheme.network;

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

    const bodyAmount = typeof amount === 'string' ? Number(amount) : amount;
    if (!Number.isFinite(bodyAmount) || bodyAmount <= 0 || bodyAmount > 1_000_000_000) {
      res.status(400).json({ success: false, error: 'Invalid amount' });
      return;
    }

    const signedAmountRaw = Number(payment.amount);
    if (!Number.isFinite(signedAmountRaw) || signedAmountRaw <= 0) {
      res.status(400).json({ success: false, error: 'Invalid signed amount' });
      return;
    }

    const signedAmount = parseSignedUsdcAmount(payment.amount, String(Math.round(bodyAmount * 1_000_000)));
    if (signedAmount == null || toBaseUnits(signedAmount) !== toBaseUnits(bodyAmount)) {
      res.status(400).json({ success: false, error: 'Amount mismatch with signed payload' });
      return;
    }

    const nonceReserved = await reservePaymentNonce(
      payment.payer,
      payment.nonce,
      'escrow',
      canonicalNetwork,
      payment.resource || '',
      bodyAmount
    );
    if (!nonceReserved) {
      res.status(409).json({ success: false, error: 'Payment nonce already used' });
      return;
    }

    if (typeof sessionId !== 'string' || sessionId.length < 1 || sessionId.length > 256) {
      res.status(400).json({ success: false, error: 'Invalid sessionId' });
      return;
    }

    let payerKey: PublicKey;
    try {
      payerKey = new PublicKey(payment.payer);
    } catch {
      res.status(400).json({ success: false, error: 'Invalid payer wallet' });
      return;
    }

    const lockSeconds = (() => {
      const v = typeof timeLockSeconds === 'number' ? timeLockSeconds : 86_400;
      const min = 60;
      const max = 30 * 24 * 3600;
      return Math.max(min, Math.min(max, v));
    })();

    try {
      const created = await createEscrow(connection, operatorKeypair, payerKey, bodyAmount, sessionId, lockSeconds);
      const fee = calculateFee(bodyAmount, config.ESCROW_FEE_BPS);

      const record = await insertEscrowRecord(
        created.escrowAddress,
        payment.payer,
        merchantWallet,
        round6(bodyAmount),
        round6(fee),
        sessionId,
        new Date(created.expiresAt)
      );

      await insertFeeLedger(null, record.id, 'escrow', round6(fee), created.txHash);

      res.json({ success: true, escrowAddress: created.escrowAddress, txHash: created.txHash, amount: round6(bodyAmount), fee: round6(fee), expiresAt: created.expiresAt });
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message : 'Escrow creation failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post('/release', async (req: Request, res: Response) => {
    const { escrowAddress, qualityScore } = req.body as EscrowReleaseRequest;

    if (!escrowAddress) {
      res.status(400).json({ success: false, error: 'Missing escrowAddress' });
      return;
    }

    try { new PublicKey(escrowAddress); } catch { res.status(400).json({ success: false, error: 'Invalid escrow address' }); return; }

    const record = await getEscrowByAddress(escrowAddress);
    if (!record) {
      res.status(404).json({ success: false, error: 'Escrow not found' });
      return;
    }

    if ((req as any).merchantWallet !== record.merchantWallet) {
      res.status(403).json({ success: false, error: 'Not authorized for this escrow' });
      return;
    }

    if (record.status !== 'active') {
      res.status(400).json({ success: false, error: `Escrow is ${record.status}, not active` });
      return;
    }

    const score = qualityScore ?? 100;
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      res.status(400).json({ success: false, error: 'Quality score must be 0-100' });
      return;
    }

    try {
      const result = await releaseEscrow(connection, operatorKeypair, escrowAddress, score);
      const refundPercent = calculateRefundPercent(score);
      const merchantReceived = round6(record.amount * (1 - refundPercent / 100));
      const payerRefunded = round6(record.amount * (refundPercent / 100));

      await updateEscrowRelease(escrowAddress, score, result.txHash, 'released');

      res.json({ success: true, txHash: result.txHash, qualityScore: score, refundPercentage: refundPercent, merchantReceived, payerRefunded });
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message : 'Release failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  router.get('/:address', async (req: Request, res: Response) => {
    try {
      new PublicKey(req.params.address);
    } catch {
      res.status(400).json({ error: 'Invalid escrow address' });
      return;
    }

    try {
      const record = await getEscrowByAddress(req.params.address);
      if (!record) {
        res.status(404).json({ error: 'Escrow not found' });
        return;
      }
      res.json(record);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch escrow' });
    }
  });

  return router;
}
