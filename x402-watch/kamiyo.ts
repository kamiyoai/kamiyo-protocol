import { Network, AccessType } from '../types';
import { USDC_BASE_TOKEN, USDC_POLYGON_TOKEN, USDC_SOLANA_TOKEN } from '../constants';

import type { Facilitator, FacilitatorConfig } from '../types';

export const kamiyo: FacilitatorConfig = {
  url: 'https://kamiyo.ai/api/v1/x402',
};

export const kamiyoDiscovery: FacilitatorConfig = {
  url: 'https://kamiyo.ai/api/v1/x402',
};

export const kamiyoFacilitator = {
  id: 'kamiyo',
  metadata: {
    name: 'KAMIYO',
    image: 'https://x402scan.com/kamiyo.png',
    docsUrl: 'https://kamiyo.ai/docs',
    color: '#00D4AA',
  },
  config: kamiyo,
  discoveryConfig: kamiyoDiscovery,
  facilitatorUrl: 'https://kamiyo.ai/api/v1/x402',
  accessType: AccessType.GATED,
  fee: 0,
  addresses: {
    [Network.BASE]: [
      {
        address: '0x742d35cc6634c0532925a3b844bc9e7595f0bee4',
        tokens: [USDC_BASE_TOKEN],
        dateOfFirstTransaction: new Date('2025-01-01'),
      },
    ],
    [Network.POLYGON]: [
      {
        address: '0x742d35cc6634c0532925a3b844bc9e7595f0bee4',
        tokens: [USDC_POLYGON_TOKEN],
        dateOfFirstTransaction: new Date('2025-01-01'),
      },
    ],
    [Network.SOLANA]: [
      {
        address: 'KAMiYo7XwXVQcFhkfhC4RHApURAcqRHF8tF9WoZHkYR',
        tokens: [USDC_SOLANA_TOKEN],
        dateOfFirstTransaction: new Date('2025-01-01'),
      },
    ],
  },
} as const satisfies Facilitator;
