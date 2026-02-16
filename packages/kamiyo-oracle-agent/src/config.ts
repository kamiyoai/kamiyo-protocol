import { z } from 'zod';
import type { IAgentRuntime, OracleConfig } from './types';

const configSchema = z.object({
  network: z.enum(['mainnet', 'devnet']).default('devnet'),
  rpcUrl: z.string().url().default('https://api.devnet.solana.com'),
  heliusApiKey: z.string().optional(),
  privateKey: z.string().min(1, 'ORACLE_PRIVATE_KEY is required'),
  minConfidenceToVote: z.enum(['low', 'medium', 'high']).default('medium'),
  maxPendingDisputes: z.coerce.number().positive().default(5),
  evaluationModel: z.string().default('claude-3-5-sonnet-20241022'),
  riskTolerance: z.enum(['low', 'medium', 'high']).default('medium'),
  autoVoteEnabled: z.coerce.boolean().default(true),
  pollIntervalMs: z.coerce.number().positive().default(30000),
});

export function validateConfig(runtime: IAgentRuntime): OracleConfig {
  const raw = {
    network: runtime.getSetting('KAMIYO_NETWORK') || runtime.getSetting('NETWORK'),
    rpcUrl: runtime.getSetting('SOLANA_RPC_URL') || runtime.getSetting('RPC_URL'),
    heliusApiKey: runtime.getSetting('HELIUS_API_KEY'),
    privateKey: runtime.getSetting('ORACLE_PRIVATE_KEY') || runtime.getSetting('PRIVATE_KEY'),
    minConfidenceToVote: runtime.getSetting('MIN_CONFIDENCE_TO_VOTE'),
    maxPendingDisputes: runtime.getSetting('MAX_PENDING_DISPUTES'),
    evaluationModel: runtime.getSetting('EVALUATION_MODEL'),
    riskTolerance: runtime.getSetting('RISK_TOLERANCE'),
    autoVoteEnabled: runtime.getSetting('AUTO_VOTE_ENABLED'),
    pollIntervalMs: runtime.getSetting('POLL_INTERVAL_MS'),
  };

  return configSchema.parse(raw);
}

export function getNetworkConfig(runtime: IAgentRuntime) {
  const network = runtime.getSetting('KAMIYO_NETWORK') || 'devnet';
  const rpcUrl = runtime.getSetting('SOLANA_RPC_URL') ||
    (network === 'mainnet'
      ? 'https://api.mainnet-beta.solana.com'
      : 'https://api.devnet.solana.com');

  return { network, rpcUrl };
}

// KAMIYO Program IDs (from programs/kamiyo/src/lib.rs declare_id!)
export const PROGRAM_IDS = {
  mainnet: '3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr',
  devnet: '3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr',
} as const;

// Protocol constants
export const ORACLE_CONSTANTS = {
  MIN_STAKE_LAMPORTS: 1_000_000_000, // 1 SOL
  SLASH_PERCENTAGE: 10,
  MAX_SCORE_DEVIATION: 15,
  REVEAL_DELAY_SECONDS: 300, // 5 minutes
  REWARD_PERCENTAGE: 1,
  MAX_ORACLES_PER_REGISTRY: 7,
  MIN_CONSENSUS_ORACLES: 3,
  VIOLATION_LIMIT: 3,
} as const;

// Quality score to refund mapping
export const QUALITY_TIERS = [
  { min: 80, max: 100, agentRefund: 0, providerPayment: 100 },
  { min: 65, max: 79, agentRefund: 35, providerPayment: 65 },
  { min: 50, max: 64, agentRefund: 75, providerPayment: 25 },
  { min: 0, max: 49, agentRefund: 100, providerPayment: 0 },
] as const;

export function getRefundPercentage(qualityScore: number): number {
  const tier = QUALITY_TIERS.find(t => qualityScore >= t.min && qualityScore <= t.max);
  return tier?.agentRefund ?? 100;
}
