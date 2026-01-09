import { Keypair } from '@solana/web3.js';
import { Shield } from '@kamiyo/sdk';

export interface AgentStats {
  successful: number;
  total: number;
  disputesWon: number;
  disputesLost: number;
}

export interface Agent {
  id: string;
  name: string;
  keypair: Keypair;
  evmAddress: string;
  shield: Shield;
  stats: AgentStats;
  stake: number;
  isBlacklisted: boolean;
}

export interface Oracle {
  id: string;
  keypair: Keypair;
  weight: number;
  reputation: number;
  violations: number;
}

export interface SLAParams {
  quality: number;
  latency: number;
  availability: number;
}

export interface DeliveryResult {
  quality: number;
  latency: number;
  availability: number;
  timestamp: number;
}

export interface QualityAssessment {
  rawScore: number;
  adjustedScore: number;
  violations: string[];
  passed: boolean;
}

export type EscrowStatus = 'pending' | 'active' | 'released' | 'disputed' | 'resolved';

export interface Escrow {
  id: string;
  consumer: Agent;
  provider: Agent;
  amount: number;
  sla: SLAParams;
  status: EscrowStatus;
  createdAt: number;
  expiresAt: number;
  delivery?: DeliveryResult;
  assessment?: QualityAssessment;
  resolution?: DisputeResolution;
}

export interface OracleVote {
  oracle: Oracle;
  commitment: string;
  blinding: string;
  score: number;
  revealed: boolean;
  timestamp: number;
}

export interface DisputeResolution {
  escrowId: string;
  votes: OracleVote[];
  medianScore: number;
  refundPct: number;
  consumerRefund: number;
  providerPayout: number;
  oracleRewards: Map<string, number>;
  oracleSlashes: Map<string, number>;
  resolvedAt: number;
}

export interface ProtocolMetrics {
  totalEscrows: number;
  activeEscrows: number;
  releasedEscrows: number;
  disputedEscrows: number;
  resolvedEscrows: number;
  totalVolume: number;
  totalRefunds: number;
  averageQuality: number;
  disputeRate: number;
  oracleAccuracy: number;
}

export type LogLevel = 'step' | 'ok' | 'warn' | 'fail' | 'dim' | 'header' | 'phase';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}
