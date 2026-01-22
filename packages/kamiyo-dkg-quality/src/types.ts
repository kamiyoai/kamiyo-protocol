import type { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

// Format: did:dkg:{network}/{contract}/{tokenId}
export type UAL = string;

export interface QualityScores {
  factualAccuracy: number;
  sourceQuality: number;
  completeness: number;
  consistency: number;
}

export interface AggregatedQuality extends QualityScores {
  overallScore: number;
  weights: QualityScores;
}

export interface QualityStake {
  assetUal: UAL;
  publisher: PublicKey;
  stakeAmount: BN;
  createdAt: number;
  verificationDeadline: number;
  status: QualityStakeStatus;
  escrowPda: PublicKey;
}

export type QualityStakeStatus =
  | 'pending'      // Awaiting oracle assessment
  | 'verified'     // Quality >= 80, stake returned
  | 'disputed'     // Quality < 50, stake slashed
  | 'contested';   // Quality 50-79, partial return

export interface QualityAssessment {
  assetUal: UAL;
  oracleId: PublicKey;
  scores: QualityScores;
  overallScore: number;
  commitment: string;
  salt?: string;
  revealedAt?: number;
}

export interface OracleCommitment {
  assetUal: UAL;
  oracleId: PublicKey;
  commitment: string;
  committedAt: number;
}

export interface PublisherReputation {
  publisher: PublicKey;
  totalAssets: number;
  verifiedAssets: number;
  disputedAssets: number;
  contestedAssets: number;
  averageQualityScore: number;
  totalStakeSlashed: BN;
  totalStakeReturned: BN;
  memberSince: number;
}

export interface OracleInfo {
  oracleId: PublicKey;
  stake: BN;
  totalAssessments: number;
  correctAssessments: number;
  slashedAmount: BN;
  rewardedAmount: BN;
  registeredAt: number;
  active: boolean;
}

export interface QualityMetadata {
  qualityScore: number;
  verifiedAt: number;
  oracleConsensus: number;
  publisherReputation: number;
  stakeAmount: string;
  verificationTx: string;
  status: QualityStakeStatus;
}

export interface QualityStakingConfig {
  verificationWindowHours: number;
  minStakeAmount: BN;
  verifiedThreshold: number;
  disputedThreshold: number;
  oracleRewardBps: number;
  protocolFeeBps: number;
}

export interface OracleProtocolConfig {
  minOracleStake: BN;
  commitWindowMinutes: number;
  revealWindowMinutes: number;
  minOraclesRequired: number;
  outlierThresholdPercent: number;
  slashingPercent: number;
  maxViolations: number;
}

export interface QualityQuery {
  sparql: string;
  qualityRequirements: {
    minOverallScore?: number;
    minFactualAccuracy?: number;
    minSourceQuality?: number;
    excludeDisputed?: boolean;
    maxAgeHours?: number;
  };
  escrow?: {
    maxPayment: number;
    qualityThreshold: number;
  };
}

export interface QualityQueryResult<T = unknown> {
  data: T;
  metadata: {
    qualityScore: number;
    verifiedAt: number;
    publisherReputation: number;
    assetUal: UAL;
  };
}

export interface InferenceProvenance {
  inferenceId: string;
  timestamp: number;
  agent: PublicKey;
  usedAssets: Array<{
    assetUal: UAL;
    qualityScore: number;
    publisherReputation: number;
    weight: number;
  }>;
  confidence: number;
  escrowPda?: PublicKey;
}

export interface QualityDispute {
  assetUal: UAL;
  disputeId: string;
  challenger: PublicKey;
  evidenceUal?: UAL;
  reason: string;
  status: 'open' | 'resolved' | 'rejected';
  originalScore: number;
  newScore?: number;
  createdAt: number;
  resolvedAt?: number;
}

export const DEFAULT_QUALITY_WEIGHTS: QualityScores = {
  factualAccuracy: 40,
  sourceQuality: 25,
  completeness: 20,
  consistency: 15,
};

export const DEFAULT_STAKING_CONFIG: QualityStakingConfig = {
  verificationWindowHours: 72,
  minStakeAmount: new BN(100_000_000), // 0.1 SOL
  verifiedThreshold: 80,
  disputedThreshold: 50,
  oracleRewardBps: 500,  // 5%
  protocolFeeBps: 100,   // 1%
};

export const DEFAULT_ORACLE_CONFIG: OracleProtocolConfig = {
  minOracleStake: new BN(1_000_000_000_000), // 1000 SOL
  commitWindowMinutes: 60,
  revealWindowMinutes: 30,
  minOraclesRequired: 3,
  outlierThresholdPercent: 20,
  slashingPercent: 10,
  maxViolations: 3,
};
