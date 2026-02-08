import { Router } from 'express';
import { isBaseEnabled, getBaseFacilitatorAddress, BASE_USDC, BASE_USDC_DECIMALS } from '../services/base-settlement';
import { SOLANA_MAINNET_CAIP2, BASE_MAINNET_CAIP2 } from '../protocol/networks';

interface NetworkInfo {
  name: string;
  chainId: string;
  assets: { symbol: string; address: string; decimals: number }[];
  facilitator?: string | null;
}

const SOLANA_NETWORK: NetworkInfo = {
  name: 'solana',
  chainId: SOLANA_MAINNET_CAIP2,
  assets: [
    { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 }
  ]
};

export function createNetworksRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const networks: NetworkInfo[] = [SOLANA_NETWORK];

    if (isBaseEnabled()) {
      networks.push({
        name: 'base',
        chainId: BASE_MAINNET_CAIP2,
        assets: [{ symbol: 'USDC', address: BASE_USDC, decimals: BASE_USDC_DECIMALS }],
        facilitator: getBaseFacilitatorAddress()
      });
    }

    res.json({ networks });
  });

  return router;
}
