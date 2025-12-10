import { PublicKey } from '@solana/web3.js';

export interface EscrowAccount {
  agent: PublicKey;
  api: PublicKey;
  amount: number;
  status: EscrowStatus;
  createdAt: number;
  expiresAt: number;
  transactionId: string;
  bump: number;
  qualityScore?: number;
  refundPercentage?: number;
}

export enum EscrowStatus {
  Active = 'Active',
  Released = 'Released',
  Disputed = 'Disputed',
  Resolved = 'Resolved'
}

export interface EntityReputation {
  entity: PublicKey;
  entityType: EntityType;
  totalTransactions: number;
  disputesFiled: number;
  disputesWon: number;
  disputesPartial: number;
  disputesLost: number;
  averageQualityReceived: number;
  reputationScore: number;
  createdAt: number;
  lastUpdated: number;
  bump: number;
}

export enum EntityType {
  Agent = 'Agent',
  Provider = 'Provider'
}

export interface CreateEscrowParams {
  api: string;
  amount: number;
  timeLock?: number;
  transactionId?: string;
}

export interface FileDisputeParams {
  escrowAddress: string;
  qualityScore: number;
  evidence: Record<string, unknown>;
  refundPercentage: number;
}

export interface QualityAssessment {
  qualityScore: number;
  refundPercentage: number;
  completeness: number;
  freshness: number;
  schemaCompliance: number;
  rationale: string;
}
