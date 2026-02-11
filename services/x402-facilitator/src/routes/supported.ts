import { Router, Request } from 'express';
import { Keypair } from '@solana/web3.js';
import { isBaseEnabled, getBaseFacilitatorAddress } from '../services/base-settlement';
import { SOLANA_MAINNET_CAIP2, BASE_MAINNET_CAIP2 } from '../protocol/networks';

interface SupportedKind {
  x402Version: number;
  scheme: string;
  network: string;
  extra?: Record<string, unknown>;
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
      {
        x402Version: 2,
        scheme: 'exact',
        network: SOLANA_MAINNET_CAIP2,
        extra: { feePayer: facilitatorKeypair.publicKey.toBase58() },
      },
    ];

    const signers: Record<string, string[]> = {
      'solana:*': [facilitatorKeypair.publicKey.toBase58()]
    };

    if (isBaseEnabled()) {
      kinds.push({ x402Version: 2, scheme: 'exact', network: BASE_MAINNET_CAIP2 });
      const baseAddr = getBaseFacilitatorAddress();
      if (baseAddr) {
        signers['eip155:*'] = [baseAddr];
      }
    }

    const response: SupportedResponse = {
      kinds,
      extensions: ['discovery', 'kamiyo-session'],
      signers
    };

    res.json(response);
  });

  return router;
}
