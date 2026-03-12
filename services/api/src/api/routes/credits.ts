// Prepaid credits - alternative to x402 for paid API access

import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  getCreditAccount,
  getCreditBalance,
  getCreditDeposits,
  getCreditUsage,
  depositCredits,
  kamiyoToCredits,
  creditsToUsd,
  isDepositProcessed,
  getCreditStats,
} from '../../db';
import { emitFairscaleFusionEvent } from '../../fairscale-fusion-emitter';
import { logger } from '../../logger';
import { getSolanaConnection } from '../../solana';
import { getCreditsCapability } from '../../core-capabilities';

const router: IRouter = Router();

const TRANSFER_TOLERANCE = 0.99; // allow 1% slippage when matching sender

let connection: Connection | null = null;

function isValidSolanaAddress(addr: string): boolean {
  if (!addr || addr.length < 32 || addr.length > 44) return false;
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}

export function initCreditsRoutes(): void {
  const capability = getCreditsCapability();
  if (!capability.enabled) {
    connection = null;
    return;
  }

  connection = getSolanaConnection();
  logger.info('Credits initialized', { treasury: capability.treasuryWallet?.slice(0, 8) });
}

router.get('/info', (_req: Request, res: Response) => {
  const capability = getCreditsCapability();

  res.json({
    enabled: capability.enabled,
    state: capability.state,
    reason: capability.reason,
    treasuryWallet: capability.treasuryWallet,
    tokenMint: capability.tokenMint,
    rate: capability.rate,
    pricing: capability.pricing,
  });
});

router.get('/balance', (req: Request, res: Response) => {
  const wallet = req.query.wallet as string;
  if (!wallet || !isValidSolanaAddress(wallet)) {
    return res.status(400).json({ error: { code: 'INVALID_WALLET', message: 'Valid Solana address required' } });
  }

  const account = getCreditAccount(wallet);
  const balanceMicro = account?.balance_micro || 0;

  res.json({
    wallet,
    balanceUsd: creditsToUsd(balanceMicro),
    totalDeposited: account ? creditsToUsd(account.total_deposited_micro) : 0,
    totalSpent: account ? creditsToUsd(account.total_spent_micro) : 0,
  });
});

router.post('/verify', async (req: Request, res: Response) => {
  const capability = getCreditsCapability();
  if (!connection || !capability.enabled || !capability.treasuryWallet || !capability.tokenMint) {
    return res.status(503).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Credits deposit verification is disabled' },
    });
  }

  const { wallet, txSignature } = req.body;
  if (!wallet || !isValidSolanaAddress(wallet)) {
    return res.status(400).json({ error: { code: 'INVALID_WALLET', message: 'Valid Solana address required' } });
  }
  if (!txSignature || typeof txSignature !== 'string' || txSignature.length < 80) {
    return res.status(400).json({ error: { code: 'INVALID_TX', message: 'Valid transaction signature required' } });
  }

  if (isDepositProcessed(txSignature)) {
    return res.status(409).json({ error: { code: 'ALREADY_PROCESSED', message: 'Transaction already processed' } });
  }

  try {
    const tx = await connection.getParsedTransaction(txSignature, { maxSupportedTransactionVersion: 0 });
    if (!tx) {
      return res.status(404).json({ error: { code: 'TX_NOT_FOUND', message: 'Transaction not found' } });
    }
    if (tx.meta?.err) {
      return res.status(400).json({ error: { code: 'TX_FAILED', message: 'Transaction failed on chain' } });
    }

    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    let kamiyoAmount = 0;
    let senderWallet = '';

    for (const post of postBalances) {
      if (post.mint !== capability.tokenMint || post.owner !== capability.treasuryWallet) continue;

      const pre = preBalances.find((p) => p.accountIndex === post.accountIndex && p.mint === capability.tokenMint);
      const transferred = (post.uiTokenAmount.uiAmount || 0) - (pre?.uiTokenAmount.uiAmount || 0);

      if (transferred > 0) {
        kamiyoAmount = transferred;
        for (const otherPre of preBalances) {
          if (otherPre.mint !== capability.tokenMint || otherPre.owner === capability.treasuryWallet) continue;
          const otherPost = postBalances.find((p) => p.accountIndex === otherPre.accountIndex);
          const diff = (otherPre.uiTokenAmount.uiAmount || 0) - (otherPost?.uiTokenAmount.uiAmount || 0);
          if (diff >= transferred * TRANSFER_TOLERANCE) {
            senderWallet = otherPre.owner || '';
            break;
          }
        }
        break;
      }
    }

    if (kamiyoAmount === 0) {
      return res.status(400).json({ error: { code: 'NO_TRANSFER', message: 'No KAMIYO transfer to treasury found' } });
    }
    if (senderWallet && senderWallet !== wallet) {
      return res.status(400).json({ error: { code: 'WALLET_MISMATCH', message: 'Sender does not match wallet' } });
    }

    const creditsMicro = kamiyoToCredits(kamiyoAmount);
    if (creditsMicro === 0) {
      return res.status(400).json({ error: { code: 'AMOUNT_TOO_SMALL', message: 'Amount too small' } });
    }

    const success = depositCredits(wallet, txSignature, String(kamiyoAmount), creditsMicro);
    if (!success) {
      return res.status(409).json({ error: { code: 'ALREADY_PROCESSED', message: 'Transaction already processed' } });
    }

    const newBalance = getCreditBalance(wallet);
    await emitFairscaleFusionEvent({
      wallet,
      serviceId: 'credits.deposit.v1',
      qualityScore: 100,
      refundPct: 0,
      timestampMs: Date.now(),
      proofHash: `credits_deposit_${txSignature}`,
      metadata: {
        txSignature,
        kamiyoAmount,
        creditsUsd: creditsToUsd(creditsMicro),
        balanceUsd: creditsToUsd(newBalance),
      },
    });
    logger.info('Deposit processed', { wallet: wallet.slice(0, 8), amount: kamiyoAmount, usd: creditsToUsd(creditsMicro) });

    res.json({
      success: true,
      kamiyoAmount,
      creditsUsd: creditsToUsd(creditsMicro),
      balanceUsd: creditsToUsd(newBalance),
    });
  } catch (err) {
    logger.error('Deposit verification failed', { error: String(err), wallet: wallet.slice(0, 8) });
    res.status(500).json({ error: { code: 'VERIFICATION_FAILED', message: 'Failed to verify' } });
  }
});

router.get('/history', (req: Request, res: Response) => {
  const wallet = req.query.wallet as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  if (!wallet) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'wallet query parameter required' },
    });
    return;
  }

  const deposits = getCreditDeposits(wallet, limit);
  const usage = getCreditUsage(wallet, limit);

  res.json({
    wallet,
    deposits: deposits.map((d) => ({
      id: d.id,
      kamiyoAmount: d.kamiyo_amount,
      creditsUsd: creditsToUsd(d.credit_amount_micro),
      txSignature: d.tx_signature,
      createdAt: d.created_at,
    })),
    usage: usage.map((u) => ({
      id: u.id,
      endpoint: u.endpoint,
      amountUsd: creditsToUsd(u.amount_micro),
      description: u.description,
      createdAt: u.created_at,
    })),
  });
});

router.get('/stats', (_req: Request, res: Response) => {
  const stats = getCreditStats();

  res.json({
    totalAccounts: stats.totalAccounts,
    totalDepositedUsd: creditsToUsd(stats.totalDepositedMicro),
    totalSpentUsd: creditsToUsd(stats.totalSpentMicro),
    activeAccountsLast24h: stats.activeAccounts,
    enabled: getCreditsCapability().enabled,
  });
});

export default router;
