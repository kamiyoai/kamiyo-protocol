import { Router } from 'express';
import { getConfig } from '../config';
import { isBaseEnabled } from '../services/base-settlement';

export function createFeesRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const config = getConfig();

    const fees: Record<string, unknown> = {
      settlement: { feeBps: config.SETTLEMENT_FEE_BPS, feePercent: `${config.SETTLEMENT_FEE_BPS / 100}%` },
      escrow: { feeBps: config.ESCROW_FEE_BPS, feePercent: `${config.ESCROW_FEE_BPS / 100}%` },
      asset: 'USDC',
      networks: ['solana:mainnet']
    };

    if (isBaseEnabled()) {
      (fees.networks as string[]).push('eip155:8453');
    }

    res.json(fees);
  });

  return router;
}
