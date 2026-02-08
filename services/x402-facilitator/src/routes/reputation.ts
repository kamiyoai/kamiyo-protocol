import { Router, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { isAddress } from 'ethers';
import { buildReputationRecord, VOLUME_TIERS } from '../services/reputation';
import {
  getSettlementStats,
  getWalletDisputeStats,
  getWalletAverageQuality,
  getMonthlyVolume,
} from '../db/queries';

export function createReputationRouter(): Router {
  const router = Router();

  function isSupportedWallet(wallet: string): boolean {
    try {
      new PublicKey(wallet);
      return true;
    } catch {
      return isAddress(wallet);
    }
  }

  router.get('/:wallet', async (req: Request, res: Response) => {
    const { wallet } = req.params;

    if (!isSupportedWallet(wallet)) {
      res.status(400).json({ error: 'Invalid wallet address' });
      return;
    }

    try {
      const [stats, disputeStats, avgQuality, monthlyVol] = await Promise.all([
        getSettlementStats(wallet),
        getWalletDisputeStats(wallet),
        getWalletAverageQuality(wallet),
        getMonthlyVolume(wallet),
      ]);

      const record = buildReputationRecord(wallet, {
        totalTransactions: stats.totalSettlements,
        disputesFiled: disputeStats.filed,
        disputesWon: disputeStats.won,
        disputesLost: disputeStats.lost,
        averageQuality: avgQuality,
        monthlyVolume: monthlyVol,
      });

      res.json(record);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to build reputation' });
    }
  });

  router.get('/', (_req: Request, res: Response) => {
    res.json({ volumeTiers: VOLUME_TIERS });
  });

  return router;
}
