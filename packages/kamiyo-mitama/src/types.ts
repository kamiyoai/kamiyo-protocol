/*
 * Type definitions for KAMIYO Agent Collaboration SDK
 */

import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

// Program ID - must match the deployed program and IDL
export const MITAMA_PROGRAM_ID = new PublicKey(
  'DqEHULYq79diHGa4jKNdBnnQR4Ge8zAfYiRYzPHhF5Km'
);

// Account structures matching the on-chain program
export interface AgentRegistry {
  authority: PublicKey;
  agentsRoot: Uint8Array; // 32 bytes
  agentCount: number;
  signalCount: number;
  swarmActionCount: number;
  epoch: BN;
  minStake: BN;
  minSignalConfidence: number;
  bump: number;
  paused: boolean;
  minSignalCollateral: BN; // Minimum KAMIYO collateral for signals
}

export interface Agent {
  registry: PublicKey;
  identityCommitment: Uint8Array; // 32 bytes
  stake: BN;
  registeredSlot: BN;
  signalCount: number;
  swarmVotes: number;
  active: boolean;
  bump: number;
  // Collateral fields
  collateralAmount: BN;
  collateralLockedAt: BN;
  slashedAmount: BN;
  violationCount: number;
}

export interface Signal {
  registry: PublicKey;
  nullifier: Uint8Array; // 32 bytes
  commitment: Uint8Array; // 32 bytes
  submittedSlot: BN;
  revealed: boolean;
  bump: number;
}

export interface SwarmAction {
  registry: PublicKey;
  proposerNullifier: Uint8Array; // 32 bytes
  actionHash: Uint8Array; // 32 bytes
  threshold: number;
  votesFor: number;
  votesAgainst: number;
  weightedVotesFor: BN;
  weightedVotesAgainst: BN;
  createdSlot: BN;
  deadlineSlot: BN;
  executed: boolean;
  bump: number;
}

export interface NullifierRecord {
  epoch: BN;
  nullifier: Uint8Array; // 32 bytes
  bump: number;
}

export interface VoteNullifier {
  action: PublicKey;
  nullifier: Uint8Array; // 32 bytes
  bump: number;
}

export interface VoteRecord {
  swarmAction: PublicKey;
  voteNullifier: Uint8Array; // 32 bytes
  voteCommitment: Uint8Array; // 32 bytes
  revealed: boolean;
  voteValue: number; // 0 = not revealed, 1 = yes, 2 = no
  bump: number;
}

export interface SignalAggregator {
  registry: PublicKey;
  epoch: BN;
  totalSignals: number;
  longCount: number;
  shortCount: number;
  neutralCount: number;
  totalConfidence: number;
  totalMagnitude: number;
  lastUpdatedSlot: BN;
  bump: number;
}

export interface WithdrawalRequest {
  agent: PublicKey;
  requester: PublicKey;
  amount: BN;
  requestSlot: BN;
  unlockSlot: BN;
  claimed: boolean;
  bump: number;
}

export interface IdentityLink {
  zkAgent: PublicKey;
  kamiyoAgent: PublicKey;
  owner: PublicKey;
  stakedAmount: BN;
  stakeMultiplier: BN;
  linkedSlot: BN;
  active: boolean;
  bump: number;
}

// Config types
export interface RegistryConfig {
  minStake: BN;
  minSignalConfidence: number;
  maxTotalStake: BN; // TVL cap - 0 means unlimited
  maxStakePerAgent: BN; // Max stake per agent - 0 means unlimited
  minSignalCollateral: BN; // Minimum KAMIYO collateral for signals (0 = no requirement)
}

// Collateral withdrawal request
export interface CollateralWithdrawal {
  agent: PublicKey;
  requester: PublicKey;
  amount: BN;
  requestTime: BN;
  unlockTime: BN;
  claimed: boolean;
  bump: number;
}

// Proof data
export interface Groth16Proof {
  a: Uint8Array; // 64 bytes
  b: Uint8Array; // 128 bytes
  c: Uint8Array; // 64 bytes
}

// Private inputs for proof generation
export interface AgentIdentityInputs {
  ownerSecret: Uint8Array; // 32 bytes - private
  agentId: Uint8Array; // 32 bytes - private
  registrationSecret: Uint8Array; // 32 bytes - random secret from registration
  merkleProof: Uint8Array[]; // Merkle path to root (20 elements for tree depth 20)
  merklePathIndices: number[]; // Left(0)/Right(1) indices (20 elements)
}

export interface PrivateSignalInputs {
  signalType: number; // 0=price, 1=volume, 2=sentiment, etc.
  direction: number; // 0=short, 1=long, 2=neutral
  confidence: number; // 0-100
  magnitude: number; // 0-100 signal strength
  stakeAmount: bigint; // Agent's stake amount
  secret: Uint8Array; // 32 bytes - random blinding factor
}

export interface SwarmVoteInputs extends AgentIdentityInputs {
  vote: boolean; // true = approve, false = reject
  voteSalt: Uint8Array; // 32 bytes - random salt for vote commitment
}

// Events
export interface RegistryInitializedEvent {
  registry: PublicKey;
  authority: PublicKey;
  minStake: BN;
}

export interface AgentRegisteredEvent {
  registry: PublicKey;
  agent: PublicKey;
  identityCommitment: Uint8Array;
  stake: BN;
}

export interface AgentsRootUpdatedEvent {
  registry: PublicKey;
  newRoot: Uint8Array;
  agentCount: number;
  epoch: BN;
}

export interface SignalSubmittedEvent {
  registry: PublicKey;
  nullifier: Uint8Array;
  commitment: Uint8Array;
  slot: BN;
}

export interface SwarmActionCreatedEvent {
  registry: PublicKey;
  actionHash: Uint8Array;
  threshold: number;
  deadlineSlot: BN;
}

export interface SwarmVoteCastEvent {
  action: PublicKey;
  nullifier: Uint8Array;
  vote: boolean;
  votesFor: number;
  votesAgainst: number;
}

export interface SwarmActionExecutedEvent {
  action: PublicKey;
  actionHash: Uint8Array;
  votesFor: number;
  votesAgainst: number;
}

// Collateral events
export interface CollateralDepositedEvent {
  agent: PublicKey;
  amount: BN;
  totalCollateral: BN;
}

export interface CollateralWithdrawalRequestedEvent {
  agent: PublicKey;
  amount: BN;
  unlockTime: BN;
}

export interface CollateralWithdrawalClaimedEvent {
  agent: PublicKey;
  amount: BN;
}

export interface AgentSlashedEvent {
  agent: PublicKey;
  amount: BN;
  reason: string;
  violationCount: number;
}

export interface MinSignalCollateralUpdatedEvent {
  registry: PublicKey;
  minSignalCollateral: BN;
}

// Slash reason enum
export enum SlashReason {
  SignalCommitmentMismatch = 0,
  VoteCommitmentMismatch = 1,
  ConsensusDeviation = 2,
  AdminReportedAbuse = 3,
}

// Collateral constants
export const COLLATERAL_WITHDRAWAL_TIMELOCK = 7 * 24 * 60 * 60; // 7 days in seconds
export const BASE_SLASH_RATE_BPS = 1000; // 10%
export const SLASH_ESCALATION_BPS = 500; // 5% per violation
export const MAX_SLASH_RATE_BPS = 5000; // 50%

// Signal types enum
export enum SignalType {
  BUY = 0,
  SELL = 1,
  HOLD = 2,
  ALERT = 3,
}

// $KAMIYO Token Constants
export const KAMIYO_MINT = 'Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump';
export const KAMIYO_DECIMALS = 6;
export const KAMIYO_INITIAL_SUPPLY = 1_000_000_000_000_000n; // 1B * 10^6

// Fee structure (1% burn on all fees)
export const BURN_RATE_BPS = 100; // 1% = 100 basis points

// Protocol fee amounts (in raw token units with decimals)
export const PROTOCOL_FEES = {
  REGISTER_AGENT: 1000_000_000n, // 1000 KAMIYO
  SUBMIT_SIGNAL: 100_000_000n, // 100 KAMIYO
  CREATE_SWARM_ACTION: 500_000_000n, // 500 KAMIYO
} as const;

// Calculated burn amounts (1% of fee)
export const BURN_AMOUNTS = {
  REGISTER_AGENT: 10_000_000n, // 10 KAMIYO
  SUBMIT_SIGNAL: 1_000_000n, // 1 KAMIYO
  CREATE_SWARM_ACTION: 5_000_000n, // 5 KAMIYO
} as const;

// Burn statistics from API
export interface KamiyoBurnStats {
  totalBurnedKamiyo: string;
  totalBurnedKamiyoFormatted: string;
  totalUsdValue: number;
  burnCount: number;
  burns24h: number;
  pendingBurns: number;
}

// Token statistics
export interface KamiyoTokenStats {
  mint: string;
  decimals: number;
  initialSupply: string;
  initialSupplyFormatted: string;
  currentSupply: string;
  currentSupplyFormatted: string;
  burned: string;
  burnedFormatted: string;
  burnPercent: string;
  burnBreakdown: {
    onChain: {
      amount: string;
      formatted: string;
    };
    apiUsage: {
      amount: string;
      formatted: string;
      usdValue: number;
      burnCount: number;
    };
  };
}

// Burn record from API
export interface KamiyoBurnRecord {
  id: number;
  source: 'api_credits' | 'api_x402' | 'on_chain';
  wallet: string | null;
  endpoint: string | null;
  usdValue: number;
  kamiyoAmount: string;
  kamiyoFormatted: string;
  status: 'pending' | 'executed' | 'batched';
  txSignature: string | null;
  createdAt: number;
}
