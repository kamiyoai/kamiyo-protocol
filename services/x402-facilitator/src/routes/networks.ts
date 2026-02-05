import { Router } from 'express';

const SUPPORTED_NETWORKS = [
  {
    name: 'solana',
    chainId: 'solana:mainnet',
    assets: [
      { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
    ],
  },
];

export function createNetworksRouter(): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({ networks: SUPPORTED_NETWORKS });
  });
  return router;
}
