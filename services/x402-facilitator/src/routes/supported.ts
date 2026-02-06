import { Router, Request } from 'express';
import { Keypair } from '@solana/web3.js';
import { isBaseEnabled, getBaseFacilitatorAddress } from '../services/base-settlement';

interface SupportedKind {
  x402Version: number;
  scheme: string;
  network: string;
}

interface SupportedResponse {
  kinds: SupportedKind[];
  extensions: string[];
  signers: Record<string, string[]>;
}

export function createSupportedRouter(facilitatorKeypair: Keypair): Router {
  const router = Router();

  router.get('/', (_req: Request, res) => {
    const kinds: SupportedKind[] = [
      { x402Version: 2, scheme: 'exact', network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' }
    ];

    const signers: Record<string, string[]> = {
      'solana:*': [facilitatorKeypair.publicKey.toBase58()]
    };

    if (isBaseEnabled()) {
      kinds.push({ x402Version: 2, scheme: 'exact', network: 'eip155:8453' });
      const baseAddr = getBaseFacilitatorAddress();
      if (baseAddr) {
        signers['eip155:*'] = [baseAddr];
      }
    }

    const response: SupportedResponse = {
      kinds,
      extensions: [],
      signers
    };

    res.json(response);
  });

  return router;
}
