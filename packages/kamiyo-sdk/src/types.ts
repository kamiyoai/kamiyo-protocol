/**
 * Type definitions for Kamiyo Protocol
 */

import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

// Program ID
export const KAMIYO_PROGRAM_ID = new PublicKey(
  "3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr"
);

/** @deprecated Use KAMIYO_PROGRAM_ID instead */
export const PROGRAM_ID = KAMIYO_PROGRAM_ID;

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

export type PoCHChain = "solana" | "base";
export type PoCHEnforcementMode = "observe" | "soft" | "gate_high_impact";

export interface PoCHContributionInput {
  identityDid: string;
  contentHash: string;
  createdAt?: string;
  contributionType:
    | "knowledge_artifact"
    | "creative_work"
    | "attested_action"
    | "research_note"
    | "custom";
  provenanceRefs?: string[];
  contextMetadata?: Record<string, unknown>;
  scoreBundleCommitment?: string;
  oracleRoundId?: string;
  proofStatementId?: string;
  chainAnchors?: {
    solanaTxId?: string;
    baseTxHash?: string;
  };
}

export interface PoCHPublished {
  success: boolean;
  assetDid: string;
  ual?: string;
}

export interface PoCHChallengeRequest {
  assetDid: string;
  identityDid: string;
  chain: PoCHChain;
  policyId: string;
  contentHash?: string;
}

export interface PoCHScoreBundle {
  policyId: string;
  uniquenessScore: number;
  graphDivergence: number;
  clusterOverlapRisk: number;
  nonMembershipSignal: boolean;
  evaluatedAt: string;
}

export interface PoCHChallenge {
  challengeId: string;
  assetDid: string;
  identityDid: string;
  chain: PoCHChain;
  policyId: string;
  scoreBundle: PoCHScoreBundle;
  scoreBundleCommitment: string;
  createdAt: string;
}

export interface PoCHProofSubmission {
  challengeId: string;
  assetDid: string;
  identityDid: string;
  chain: PoCHChain;
  zkProof: string;
  identityNullifier: string;
}

export interface PoCHOracleCommitInput {
  challengeId: string;
  oracleId: string;
  commitmentHash: string;
}

export interface PoCHOracleRevealInput {
  challengeId: string;
  oracleId: string;
  authenticityVerdict: boolean;
  uniquenessVerdict: boolean;
  confidence?: number;
  salt: string;
}

export interface PoCHSubmissionReceipt {
  accepted: boolean;
  challengeId: string;
  assetDid: string;
  identityDid: string;
  chain: PoCHChain;
  verifiedAt: string;
  proofStatementId: string;
  pending?: boolean;
  finalizeReason?: string;
  oracleRoundId?: string;
}

export interface PoCHStatus {
  identityDid: string;
  chain: PoCHChain;
  status: "pending" | "verified" | "rejected" | "disputed";
  scoreBundleCommitment?: string;
  oracleRoundId?: string;
  proofStatementId?: string;
  updatedAt: string;
}

export interface PoCHActionCheck {
  identityDid: string;
  chain: PoCHChain;
  action: "stake_amplification" | "premium_attestation" | "high_trust_agent_action";
}

export interface PoCHGateDecision {
  allowed: boolean;
  mode: PoCHEnforcementMode;
  reason?: string;
  status?: PoCHStatus;
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

export interface PoCHSubmissionAccount {
  owner: PublicKey;
  assetDid: string;
  identityDid: string;
  chain: string;
  policyId: string;
  scoreBundleCommitment: Uint8Array;
  challengeId: string;
  proofVerified: boolean;
  hasBlockingDispute: boolean;
  finalized: boolean;
  accepted: boolean;
  createdAt: BN;
  updatedAt: BN;
  bump: number;
}

export interface PoCHStatusAccount {
  owner: PublicKey;
  identityDid: string;
  chain: string;
  status: number;
  scoreBundleCommitment: Uint8Array;
  oracleRoundId: string;
  proofStatementId: string;
  updatedAt: BN;
  bump: number;
}

export interface PoCHCommitmentAccount {
  owner: PublicKey;
  submission: PublicKey;
  chain: string;
  policyId: string;
  challengeId: string;
  scoreBundleCommitment: Uint8Array;
  committedAt: BN;
  bump: number;
}

export interface PoCHPenaltyStateAccount {
  owner: PublicKey;
  adverseCount: number;
  slashTier: number;
  restrictionExpiresAt: BN | null;
  lastOutcomeAt: BN;
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
  oracleCommitments: OracleCommitment[];
  tokenMint: PublicKey | null;
  escrowTokenAccount: PublicKey | null;
  tokenDecimals: number;
  disputedAt: BN | null;
  commitPhaseEndsAt: BN | null;
}

// Oracle Submission
export interface OracleSubmission {
  oracle: PublicKey;
  qualityScore: number;
  submittedAt: BN;
}

// Oracle Commitment (for commit-reveal voting)
export interface OracleCommitment {
  oracle: PublicKey;
  commitmentHash: Uint8Array;
  committedAt: BN;
  revealed: boolean;
}

// Oracle Configuration
export interface OracleConfig {
  pubkey: PublicKey;
  oracleType: OracleType;
  weight: number;
  stakeAmount: BN;
  violationCount: number;
  totalRewards: BN;
  disputesParticipated: number;
  consensusVotes: number;
  registeredAt: BN;
  withdrawalRequestedAt: BN;
  status: number; // 0 = active, 1 = pending withdrawal, 2 = suspended
}

// Oracle Status
export enum OracleStatus {
  Active = 0,
  PendingWithdrawal = 1,
  Suspended = 2,
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
  publicRegistration: boolean;
  totalStake: BN;
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

// Protocol Configuration Account
export interface ProtocolConfig {
  admin: PublicKey;
  treasury: PublicKey;
  agreementFeeBps: number;    // Fee on agreement creation (basis points)
  disputeFeeBps: number;      // Fee on disputed amount (basis points)
  disputeBaseFee: BN;         // Base fee for initiating dispute
  identityFee: BN;            // Fee for creating agent identity
  totalFeesCollected: BN;     // Running total of fees collected
  isActive: boolean;
  createdAt: BN;
  updatedAt: BN;
  bump: number;
}

// Protocol Config Update Parameters
export interface UpdateProtocolConfigParams {
  newTreasury?: PublicKey;
  newAgreementFeeBps?: number;
  newDisputeFeeBps?: number;
  newDisputeBaseFee?: BN;
  newIdentityFee?: BN;
}

// Initialize Oracle Registry Parameters
export interface InitializeOracleRegistryParams {
  minConsensus: number;
  maxScoreDeviation: number;
}

// Blacklist Registry Account
export interface BlacklistRegistry {
  authority: PublicKey;
  root: Uint8Array;
  leafCount: BN;
  lastUpdated: BN;
  bump: number;
}

// Constants
export const MIN_TIME_LOCK_SECONDS = 3600; // 1 hour
export const MAX_TIME_LOCK_SECONDS = 2_592_000; // 30 days
export const MIN_STAKE_AMOUNT = 100_000_000; // 0.1 SOL
export const MAX_ORACLES = 50;
export const MIN_CONSENSUS_ORACLES = 3;
export const MAX_SCORE_DEVIATION = 15;

// Commit-Reveal Constants
export const COMMIT_PHASE_DURATION = 300; // 5 minutes

// Protocol Fee Defaults
export const DEFAULT_AGREEMENT_FEE_BPS = 50;      // 0.5%
export const DEFAULT_DISPUTE_FEE_BPS = 100;       // 1%
export const DEFAULT_DISPUTE_BASE_FEE = 10_000_000; // 0.01 SOL
export const DEFAULT_IDENTITY_FEE = 5_000_000;    // 0.005 SOL
export const MAX_FEE_BPS = 500;                   // 5% max

// ============================================
// Companion Escrow Program Types (kamiyo-escrow)
// ============================================

export const KAMIYO_ESCROW_PROGRAM_ID_MAINNET = new PublicKey(
  "FVnvAs8bahMwAvjcLq5ZrXksuu5Qeu2MRkbjwB9mua3u"
);

export const KAMIYO_ESCROW_PROGRAM_ID_DEVNET = new PublicKey(
  "EqScj2SUahLLUuP56s77yK6bPr3VEPoTyDecjvyoBtxT"
);

// Backwards-compatible default.
export const KAMIYO_ESCROW_PROGRAM_ID = KAMIYO_ESCROW_PROGRAM_ID_MAINNET;

// Companion Escrow Status
export enum CompanionEscrowStatus {
  Active = 0,
  Disputed = 1,
  Resolved = 2,
  Released = 3,
  Refunded = 4,
}

// Companion Escrow Account
export interface CompanionEscrow {
  user: PublicKey;
  treasury: PublicKey;
  sessionId: Uint8Array;
  amount: BN;
  createdAt: BN;
  bump: number;
  status: CompanionEscrowStatus;
  rating: number | null;
  disputedAt: BN | null;
  commitPhaseEndsAt: BN | null;
  oracleCommitments: CompanionOracleCommitment[];
  oracleSubmissions: CompanionOracleSubmission[];
  qualityScore: number | null;
  refundPercentage: number | null;
}

// Companion Oracle Commitment (for commit-reveal)
export interface CompanionOracleCommitment {
  oracle: PublicKey;
  commitmentHash: Uint8Array;
  committedAt: BN;
  revealed: boolean;
}

// Companion Oracle Submission
export interface CompanionOracleSubmission {
  oracle: PublicKey;
  qualityScore: number;
  submittedAt: BN;
}

// Companion Escrow Oracle Config
export interface CompanionEscrowOracleConfig {
  admin: PublicKey;
  registeredOracles: PublicKey[];
  minConsensus: number;
  maxScoreDeviation: number;
  commitDuration: BN;
  revealDuration: BN;
  bump: number;
}

// Companion Escrow Constants
export const COMPANION_ESCROW_COMMIT_PHASE_DURATION = 300; // 5 minutes
export const COMPANION_ESCROW_REVEAL_PHASE_DURATION = 1800; // 30 minutes
export const COMPANION_ESCROW_MIN_CONSENSUS_ORACLES = 3;
export const COMPANION_ESCROW_MAX_SCORE_DEVIATION = 15;
export const COMPANION_ESCROW_MAX_ORACLES_PER_ESCROW = 5;
export const COMPANION_ESCROW_TIMEOUT = 7 * 24 * 60 * 60; // 7 days

// Dispute Resolution Parameters
export interface DisputeResolutionParams {
  escrowPda: PublicKey;
  evidenceHash?: Uint8Array;
}

// Commit Vote Parameters
export interface CommitVoteParams {
  escrowPda: PublicKey;
  commitmentHash: Uint8Array;
}

// Reveal Vote Parameters
export interface RevealVoteParams {
  escrowPda: PublicKey;
  qualityScore: number;
  salt: Uint8Array;
}

// Dispute Consensus Result
export interface DisputeConsensusResult {
  medianScore: number;
  validSubmissions: CompanionOracleSubmission[];
  outliers: PublicKey[];
  refundPercentage: number;
}
