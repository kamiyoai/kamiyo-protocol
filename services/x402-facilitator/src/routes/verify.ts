import { Router, Request, Response } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { decodePaymentHeader, verifyPaymentAuth, isPaymentFresh, parsePaymentScheme } from '../services/signature';
import { getUsdcBalance } from '../services/settlement';
import { getConfig } from '../config';
import { VerifyRequest, VerifyResponse } from '../types';

export function createVerifyRouter(connection: Connection): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const { paymentHeader, resource, maxAmount } = req.body as VerifyRequest;
    if (!paymentHeader) {
      res.status(400).json({ valid: false, error: 'Missing paymentHeader' });
      return;
    }

    const scheme = parsePaymentScheme(paymentHeader);
    if (!scheme || scheme.network !== 'solana:mainnet') {
      res.status(400).json({ valid: false, error: 'Unsupported network' });
      return;
    }

    const payment = decodePaymentHeader(paymentHeader);
    if (!payment) {
      res.status(400).json({ valid: false, error: 'Malformed payment header' });
      return;
    }

    const config = getConfig();

    if (!isPaymentFresh(payment, config.MAX_PAYMENT_AGE_MS)) {
      res.status(400).json({ valid: false, error: 'Payment expired' });
      return;
    }

    if (!verifyPaymentAuth(payment)) {
      res.status(400).json({ valid: false, error: 'Invalid signature' });
      return;
    }

    const amount = parseFloat(payment.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      res.status(400).json({ valid: false, error: 'Invalid amount' });
      return;
    }

    if (maxAmount && amount > maxAmount) {
      res.status(400).json({ valid: false, error: 'Amount exceeds maximum' });
      return;
    }

    if (amount > config.MAX_SETTLEMENT_AMOUNT) {
      res.status(400).json({ valid: false, error: 'Amount exceeds facilitator limit' });
      return;
    }

    if (resource && payment.resource && resource !== payment.resource) {
      res.status(400).json({ valid: false, error: 'Resource mismatch' });
      return;
    }

    let payerKey: PublicKey;
    try {
      payerKey = new PublicKey(payment.payer);
    } catch {
      res.status(400).json({ valid: false, error: 'Invalid payer wallet' });
      return;
    }

    let balance = 0;
    try {
      balance = await getUsdcBalance(connection, payerKey);
    } catch {
      res.status(502).json({ valid: false, error: 'Balance lookup failed' });
      return;
    }

    const sufficient = balance >= amount;
    const response: VerifyResponse = {
      valid: true,
      payer: payment.payer,
      amount: payment.amount,
      resource: payment.resource || resource || '',
      balance,
      sufficient,
    };

    if (!sufficient) response.error = 'Insufficient USDC balance';
    res.json(response);
  });

  return router;
}
