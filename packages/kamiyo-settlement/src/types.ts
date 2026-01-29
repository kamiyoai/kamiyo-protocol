import type { Connection, Keypair, PublicKey } from '@solana/web3.js';
import type { Violation } from './violations.js';

export enum SettlementStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Contested = 'contested',
  Escalated = 'escalated',
  Resolved = 'resolved',
  DefaultedToAgent = 'defaulted_to_agent',
  DefaultedToProvider = 'defaulted_to_provider',
}

export interface SettlementClientConfig {
  connection: Connection;
  wallet?: Keypair;
  programId?: PublicKey;
}

export interface SettlementRequest {
  paymentRef: string;
  provider: PublicKey;
  violation: Violation;
}

export interface SettlementResult {
  settlementId: string;
  txSignature: string;
  status: SettlementStatus;
  refundPercent: number;
}

export interface SettlementState {
  id: string;
  paymentRef: string;
  agent: PublicKey;
  provider: PublicKey;
  violation: Violation;
  status: SettlementStatus;
  refundPercent: number;
  createdAt: number;
  respondByDeadline: number;
  resolvedAt?: number;
  oracleScore?: number;
}

export interface SettlementResponse {
  accept: boolean;
  evidence?: string;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  paymentAmount?: number;
  provider?: PublicKey;
}
