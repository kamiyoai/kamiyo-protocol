import { Router } from 'express';
import { getConfig } from '../config';

export function createFeesRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const config = getConfig();
    res.json({
      settlement: { feeBps: config.SETTLEMENT_FEE_BPS, feePercent: `${config.SETTLEMENT_FEE_BPS / 100}%` },
      escrow: { feeBps: config.ESCROW_FEE_BPS, feePercent: `${config.ESCROW_FEE_BPS / 100}%` },
      asset: 'USDC',
      network: 'solana:mainnet',
    });
  });

  return router;
}
