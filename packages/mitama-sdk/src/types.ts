/**
 * Type definitions for Mitama Protocol
 */

import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

// Program ID
export const MITAMA_PROGRAM_ID = new PublicKey(
  "8z97gUtmy43FXLs5kWvqDAA6BjsHYDwKXFoM6LsngXoC"
);

// Agent Types
export enum AgentType {
  Trading = 0,
  Service = 1,
  Oracle = 2,
  Custom = 3,
}

// Agreement (Escrow) Status
export enum AgreementStatus {
  Active = 0,
  Released = 1,
  Disputed = 2,
  Resolved = 3,
}

// Oracle Types
export enum OracleType {
  Ed25519 = 0,
  Switchboard = 1,
  Custom = 2,
}

// Entity Types (for reputation)
export enum EntityType {
  Agent = 0,
  Provider = 1,
}

// Verification Levels
export enum VerificationLevel {
  Basic = 0,
  Staked = 1,
  Social = 2,
  KYC = 3,
}

// Agent Identity Account
export interface AgentIdentity {
  owner: PublicKey;
  name: string;
  agentType: AgentType;
  reputation: BN;
  stakeAmount: BN;
  isActive: boolean;
  createdAt: BN;
  lastActive: BN;
  totalEscrows: BN;
  successfulEscrows: BN;
  disputedEscrows: BN;
  bump: number;
}

// Agreement (Escrow) Account
export interface Agreement {
  agent: PublicKey;
  api: PublicKey;
  amount: BN;
  status: AgreementStatus;
  createdAt: BN;
  expiresAt: BN;
  transactionId: string;
  bump: number;
  qualityScore: number | null;
  refundPercentage: number | null;
  oracleSubmissions: OracleSubmission[];
  tokenMint: PublicKey | null;
  escrowTokenAccount: PublicKey | null;
  tokenDecimals: number;
}

// Oracle Submission
export interface OracleSubmission {
  oracle: PublicKey;
  qualityScore: number;
  submittedAt: BN;
}

// Oracle Configuration
export interface OracleConfig {
  pubkey: PublicKey;
  oracleType: OracleType;
  weight: number;
}

// Oracle Registry
export interface OracleRegistry {
  admin: PublicKey;
  oracles: OracleConfig[];
  minConsensus: number;
  maxScoreDeviation: number;
  createdAt: BN;
  updatedAt: BN;
  bump: number;
}

// Entity Reputation
export interface EntityReputation {
  entity: PublicKey;
  entityType: EntityType;
  totalTransactions: BN;
  disputesFiled: BN;
  disputesWon: BN;
  disputesPartial: BN;
  disputesLost: BN;
  averageQualityReceived: number;
  reputationScore: number;
  createdAt: BN;
  lastUpdated: BN;
  bump: number;
}

// Create Agent Parameters
export interface CreateAgentParams {
  name: string;
  agentType: AgentType;
  stakeAmount: BN;
}

// Create Agreement Parameters
export interface CreateAgreementParams {
  provider: PublicKey;
  amount: BN;
  timeLockSeconds: BN;
  transactionId: string;
  tokenMint?: PublicKey;
}

// Resolution Result
export interface ResolutionResult {
  qualityScore: number;
  refundPercentage: number;
  refundAmount: BN;
  paymentAmount: BN;
}

// Quality-Based Refund Scale
export const QUALITY_REFUND_SCALE = {
  // 0-49% quality: Full refund (100%)
  POOR: { minQuality: 0, maxQuality: 49, refund: 100 },
  // 50-64% quality: 75% refund
  BELOW_AVERAGE: { minQuality: 50, maxQuality: 64, refund: 75 },
  // 65-79% quality: 35% refund
  AVERAGE: { minQuality: 65, maxQuality: 79, refund: 35 },
  // 80-100% quality: No refund (full payment)
  GOOD: { minQuality: 80, maxQuality: 100, refund: 0 },
} as const;

// Constants
export const MIN_TIME_LOCK_SECONDS = 3600; // 1 hour
export const MAX_TIME_LOCK_SECONDS = 2_592_000; // 30 days
export const MIN_STAKE_AMOUNT = 100_000_000; // 0.1 SOL
export const MAX_ORACLES = 5;
export const MIN_CONSENSUS_ORACLES = 2;
export const MAX_SCORE_DEVIATION = 15;
