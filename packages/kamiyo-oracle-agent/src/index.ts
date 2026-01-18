import type { Plugin } from './types';

import {
  evaluateDisputeAction,
  submitVoteAction,
  checkPerformanceAction,
  claimRewardsAction,
} from './actions';

import {
  oracleStatusProvider,
  pendingDisputesProvider,
  performanceProvider,
} from './providers';

import {
  voteQualityEvaluator,
  riskAssessmentEvaluator,
} from './evaluators';

import {
  disputeListenerService,
  autoVoterService,
  rewardClaimerService,
} from './services';

/**
 * KAMIYO Oracle Agent Plugin
 *
 * An autonomous oracle agent that participates in KAMIYO dispute resolution.
 * Uses LLM reasoning to evaluate service quality and submits cryptographically
 * signed votes to the blockchain.
 *
 * Features:
 * - Monitors blockchain for disputed escrows
 * - Evaluates service quality using LLM (Claude/GPT)
 * - Calibrates votes based on confidence and risk
 * - Submits Ed25519-signed votes on-chain
 * - Tracks performance and manages risk exposure
 * - Auto-claims accumulated rewards
 *
 * Configuration (via runtime settings):
 * - SOLANA_RPC_URL: RPC endpoint
 * - ORACLE_PRIVATE_KEY: Base64-encoded private key
 * - HELIUS_API_KEY: Optional, for real-time webhook updates
 * - ANTHROPIC_API_KEY: For LLM evaluation
 * - MIN_CONFIDENCE_TO_VOTE: low|medium|high (default: medium)
 * - MAX_PENDING_DISPUTES: Max concurrent disputes (default: 5)
 * - RISK_TOLERANCE: low|medium|high (default: medium)
 * - AUTO_VOTE_ENABLED: true|false (default: true)
 * - POLL_INTERVAL_MS: Polling interval (default: 30000)
 */
export const kamiyoOraclePlugin: Plugin = {
  name: 'kamiyo-oracle',
  description: 'Autonomous oracle agent for KAMIYO dispute resolution with LLM-powered quality evaluation',

  actions: [
    evaluateDisputeAction,
    submitVoteAction,
    checkPerformanceAction,
    claimRewardsAction,
  ],

  providers: [
    oracleStatusProvider,
    pendingDisputesProvider,
    performanceProvider,
  ],

  evaluators: [
    voteQualityEvaluator,
    riskAssessmentEvaluator,
  ],

  services: [
    disputeListenerService,
    autoVoterService,
    rewardClaimerService,
  ],
};

export default kamiyoOraclePlugin;

// Re-export types and utilities
export * from './types';
export * from './config';
export * from './lib';
export * from './actions';
export * from './providers';
export * from './evaluators';
export * from './services';
