export const kamiyo = {
  url: 'https://kamiyo.ai/api/v1/x402',
};

export const kamiyoDiscovery = {
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
  accessType: 'GATED',
  fee: 0,
  addresses: {
    BASE: [
      {
        address: '0x742d35cc6634c0532925a3b844bc9e7595f0bee4',
        tokens: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'],
        dateOfFirstTransaction: new Date('2025-01-01'),
      },
    ],
    POLYGON: [
      {
        address: '0x742d35cc6634c0532925a3b844bc9e7595f0bee4',
        tokens: ['0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'],
        dateOfFirstTransaction: new Date('2025-01-01'),
      },
    ],
    SOLANA: [
      {
        address: 'KAMiYo7XwXVQcFhkfhC4RHApURAcqRHF8tF9WoZHkYR',
        tokens: ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],
        dateOfFirstTransaction: new Date('2025-01-01'),
      },
    ],
  },
};
