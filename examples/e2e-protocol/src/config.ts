import { PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

export const RPC = {
  solana: {
    mainnet: 'https://api.mainnet-beta.solana.com',
    devnet: 'https://api.devnet.solana.com',
  },
  monad: {
    testnet: 'https://monad-testnet.drpc.org',
    mainnet: 'https://monad-mainnet.drpc.org',
  },
} as const;

export const DEFAULTS = {
  escrow: {
    timeLockSeconds: 3600,
    minAmount: 0.001,
    maxAmount: 1000,
  },
  sla: {
    qualityThreshold: 80,
    maxLatencyMs: 300,
    minAvailability: 95,
  },
  oracle: {
    minQuorum: 3,
    highValueQuorum: 5,
    highValueThreshold: 100,
    maxScoreDeviation: 20,
    commitRevealDelay: 300,
  },
  reputation: {
    eligibilityThreshold: 65,
    blacklistThreshold: 5,
    slashAmount: 0.05,
  },
  refund: {
    tiers: [
      { minScore: 80, refundPct: 0 },
      { minScore: 65, refundPct: 35 },
      { minScore: 50, refundPct: 75 },
      { minScore: 0, refundPct: 100 },
    ],
  },
} as const;

export interface DemoConfig {
  network: 'mainnet' | 'devnet';
  monadNetwork: 'testnet' | 'mainnet';
  scenarios: ('good' | 'degraded' | 'poor')[];
  agentCount: number;
  oracleCount: number;
  verbose: boolean;
  live: boolean;
}

export function parseArgs(): DemoConfig {
  const args = process.argv.slice(2);
  const config: DemoConfig = {
    network: 'devnet',
    monadNetwork: 'testnet',
    scenarios: ['good', 'degraded', 'poor'],
    agentCount: 4,
    oracleCount: 5,
    verbose: false,
    live: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mainnet':
        config.network = 'mainnet';
        break;
      case '--monad-mainnet':
        config.monadNetwork = 'mainnet';
        break;
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
      case '--live':
        config.live = true;
        break;
      case '--agents':
        config.agentCount = parseInt(args[++i], 10) || 4;
        break;
      case '--oracles':
        config.oracleCount = parseInt(args[++i], 10) || 5;
        break;
      case '--scenario':
        const s = args[++i];
        if (s === 'all') {
          config.scenarios = ['good', 'degraded', 'poor'];
        } else if (['good', 'degraded', 'poor'].includes(s)) {
          config.scenarios = [s as 'good' | 'degraded' | 'poor'];
        }
        break;
    }
  }

  return config;
}
