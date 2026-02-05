import { Router, Request, Response } from 'express';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { decodePaymentHeader, verifyPaymentAuth, isPaymentFresh, parsePaymentScheme } from '../services/signature';
import { createEscrow, releaseEscrow, calculateRefundPercent } from '../services/escrow';
import { calculateFee, toBaseUnits } from '../services/settlement';
import { getConfig } from '../config';
import { insertEscrowRecord, getEscrowByAddress, updateEscrowRelease, insertFeeLedger } from '../db/queries';
import { EscrowCreateRequest, EscrowReleaseRequest } from '../types';

export function createEscrowRouter(connection: Connection, facilitatorKeypair: Keypair): Router {
  const router = Router();

  router.post('/create', async (req: Request, res: Response) => {
    const { paymentHeader, merchantWallet, amount, sessionId, timeLockSeconds, asset } = req.body as EscrowCreateRequest & { asset?: string };

    if (!paymentHeader || !merchantWallet || amount == null || !sessionId) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    if ((req as any).merchantWallet !== merchantWallet) {
      res.status(403).json({ success: false, error: 'Merchant wallet does not match API key' });
      return;
    }

    const normalizedAsset = asset || 'USDC';
    if (normalizedAsset !== 'USDC') {
      res.status(400).json({ success: false, error: 'Only USDC supported' });
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

    if (toBaseUnits(parseFloat(payment.amount)) !== toBaseUnits(amount)) {
      res.status(400).json({ success: false, error: 'Amount mismatch with signed payload' });
      return;
    }

    let payerKey: PublicKey;
    try {
      payerKey = new PublicKey(payment.payer);
    } catch {
      res.status(400).json({ success: false, error: 'Invalid payer wallet' });
      return;
    }

    try {
      const result = await createEscrow(connection, facilitatorKeypair, payerKey, amount, sessionId, timeLockSeconds);
      const fee = calculateFee(amount, config.ESCROW_FEE_BPS);

      const record = await insertEscrowRecord(
        result.escrowAddress,
        payment.payer,
        merchantWallet,
        amount,
        fee,
        sessionId,
        new Date(result.expiresAt)
      );

      await insertFeeLedger(null, record.id, 'escrow', fee, result.txHash);

      res.json({ success: true, escrowAddress: result.escrowAddress, txHash: result.txHash, amount, fee, expiresAt: result.expiresAt });
    } catch (err: any) {
      res.status(500).json({ success: false, error: `Escrow creation failed: ${err.message}` });
    }
  });

  router.post('/release', async (req: Request, res: Response) => {
    const { escrowAddress, qualityScore } = req.body as EscrowReleaseRequest;

    if (!escrowAddress) {
      res.status(400).json({ success: false, error: 'Missing escrowAddress' });
      return;
    }

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
    if (score < 0 || score > 100) {
      res.status(400).json({ success: false, error: 'Quality score must be 0-100' });
      return;
    }

    try {
      const result = await releaseEscrow(connection, facilitatorKeypair, escrowAddress, score);
      const refundPercent = calculateRefundPercent(score);
      const merchantReceived = record.amount * (1 - refundPercent / 100);
      const payerRefunded = record.amount * (refundPercent / 100);

      await updateEscrowRelease(escrowAddress, score, result.txHash, 'released');

      res.json({ success: true, txHash: result.txHash, qualityScore: score, refundPercentage: refundPercent, merchantReceived, payerRefunded });
    } catch (err: any) {
      res.status(500).json({ success: false, error: `Release failed: ${err.message}` });
    }
  });

  router.get('/:address', async (req: Request, res: Response) => {
    const record = await getEscrowByAddress(req.params.address);
    if (!record) {
      res.status(404).json({ error: 'Escrow not found' });
      return;
    }
    res.json(record);
  });

  return router;
}
