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

// Signal types enum
export enum SignalType {
  BUY = 0,
  SELL = 1,
  HOLD = 2,
  ALERT = 3,
}
