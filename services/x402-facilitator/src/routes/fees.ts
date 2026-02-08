import { Router } from 'express';
import { getConfig } from '../config';
import { isBaseEnabled } from '../services/base-settlement';
import { SOLANA_MAINNET_CAIP2, BASE_MAINNET_CAIP2 } from '../protocol/networks';

export function createFeesRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const config = getConfig();

    const fees: Record<string, unknown> = {
      settlement: { feeBps: config.SETTLEMENT_FEE_BPS, feePercent: `${config.SETTLEMENT_FEE_BPS / 100}%` },
      escrow: { feeBps: config.ESCROW_FEE_BPS, feePercent: `${config.ESCROW_FEE_BPS / 100}%` },
      dispute: { feeBps: config.DISPUTE_FEE_BPS, feePercent: `${config.DISPUTE_FEE_BPS / 100}%` },
      asset: 'USDC',
      networks: [SOLANA_MAINNET_CAIP2]
    };

    if (isBaseEnabled()) {
      (fees.networks as string[]).push(BASE_MAINNET_CAIP2);
    }

    res.json(fees);
  });

  return router;
}
