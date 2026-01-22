import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import type {
  UAL,
  QualityStake,
  QualityStakeStatus,
  PublisherReputation,
  OracleInfo,
  OracleCommitment,
  QualityAssessment,
  InferenceProvenance,
  QualityDispute,
} from './types.js';

export interface SerializedQualityStake {
  assetUal: string;
  publisher: string;
  stakeAmount: string;
  createdAt: number;
  verificationDeadline: number;
  status: QualityStakeStatus;
  escrowPda: string;
}

export interface SerializedPublisherReputation {
  publisher: string;
  totalAssets: number;
  verifiedAssets: number;
  disputedAssets: number;
  contestedAssets: number;
  averageQualityScore: number;
  totalStakeSlashed: string;
  totalStakeReturned: string;
  memberSince: number;
}

export interface SerializedOracleInfo {
  oracleId: string;
  stake: string;
  totalAssessments: number;
  correctAssessments: number;
  slashedAmount: string;
  rewardedAmount: string;
  registeredAt: number;
  active: boolean;
}

export interface SerializedOracleCommitment {
  assetUal: string;
  oracleId: string;
  commitment: string;
  committedAt: number;
}

export interface SerializedQualityAssessment {
  assetUal: string;
  oracleId: string;
  scores: {
    factualAccuracy: number;
    sourceQuality: number;
    completeness: number;
    consistency: number;
  };
  overallScore: number;
  commitment: string;
  salt?: string;
  revealedAt?: number;
}

export interface SerializedInferenceProvenance {
  inferenceId: string;
  timestamp: number;
  agent: string;
  usedAssets: Array<{
    assetUal: string;
    qualityScore: number;
    publisherReputation: number;
    weight: number;
  }>;
  confidence: number;
  escrowPda?: string;
}

export interface SerializedQualityDispute {
  assetUal: string;
  disputeId: string;
  challenger: string;
  evidenceUal?: string;
  reason: string;
  status: 'open' | 'resolved' | 'rejected';
  originalScore: number;
  newScore?: number;
  createdAt: number;
  resolvedAt?: number;
}

export interface QualityOracleStore {
  // Stakes
  getStake(assetUal: UAL): Promise<SerializedQualityStake | null>;
  setStake(stake: SerializedQualityStake): Promise<void>;
  getStakesByStatus(status: QualityStakeStatus): Promise<SerializedQualityStake[]>;
  getAllStakes(): Promise<SerializedQualityStake[]>;

  // Reputations
  getReputation(publisher: string): Promise<SerializedPublisherReputation | null>;
  setReputation(reputation: SerializedPublisherReputation): Promise<void>;

  // Oracles
  getOracle(oracleId: string): Promise<SerializedOracleInfo | null>;
  setOracle(oracle: SerializedOracleInfo): Promise<void>;
  getActiveOracles(): Promise<SerializedOracleInfo[]>;

  // Commitments
  getCommitments(assetUal: UAL): Promise<SerializedOracleCommitment[]>;
  addCommitment(commitment: SerializedOracleCommitment): Promise<void>;

  // Assessments (reveals)
  getAssessments(assetUal: UAL): Promise<SerializedQualityAssessment[]>;
  addAssessment(assessment: SerializedQualityAssessment): Promise<void>;

  // Inference provenance
  getProvenance(inferenceId: string): Promise<SerializedInferenceProvenance | null>;
  setProvenance(provenance: SerializedInferenceProvenance): Promise<void>;
  getProvenanceByAsset(assetUal: UAL): Promise<SerializedInferenceProvenance[]>;
  getProvenanceByAgent(agent: string): Promise<SerializedInferenceProvenance[]>;

  // Disputes
  getDispute(disputeId: string): Promise<SerializedQualityDispute | null>;
  setDispute(dispute: SerializedQualityDispute): Promise<void>;
  getDisputeByAsset(assetUal: UAL): Promise<SerializedQualityDispute | null>;
  getOpenDisputes(): Promise<SerializedQualityDispute[]>;

  // Lifecycle
  init(): Promise<void>;
  close(): Promise<void>;
}

export class InMemoryStore implements QualityOracleStore {
  private stakes = new Map<string, SerializedQualityStake>();
  private reputations = new Map<string, SerializedPublisherReputation>();
  private oracles = new Map<string, SerializedOracleInfo>();
  private commitments = new Map<string, SerializedOracleCommitment[]>();
  private assessments = new Map<string, SerializedQualityAssessment[]>();
  private provenances = new Map<string, SerializedInferenceProvenance>();
  private provenanceByAsset = new Map<string, string[]>();
  private provenanceByAgent = new Map<string, string[]>();
  private disputes = new Map<string, SerializedQualityDispute>();
  private disputeByAsset = new Map<string, string>();

  async init(): Promise<void> {}
  async close(): Promise<void> {}

  // Stakes
  async getStake(assetUal: UAL): Promise<SerializedQualityStake | null> {
    return this.stakes.get(assetUal) || null;
  }

  async setStake(stake: SerializedQualityStake): Promise<void> {
    this.stakes.set(stake.assetUal, stake);
  }

  async getStakesByStatus(status: QualityStakeStatus): Promise<SerializedQualityStake[]> {
    return Array.from(this.stakes.values()).filter((s) => s.status === status);
  }

  async getAllStakes(): Promise<SerializedQualityStake[]> {
    return Array.from(this.stakes.values());
  }

  // Reputations
  async getReputation(publisher: string): Promise<SerializedPublisherReputation | null> {
    return this.reputations.get(publisher) || null;
  }

  async setReputation(reputation: SerializedPublisherReputation): Promise<void> {
    this.reputations.set(reputation.publisher, reputation);
  }

  // Oracles
  async getOracle(oracleId: string): Promise<SerializedOracleInfo | null> {
    return this.oracles.get(oracleId) || null;
  }

  async setOracle(oracle: SerializedOracleInfo): Promise<void> {
    this.oracles.set(oracle.oracleId, oracle);
  }

  async getActiveOracles(): Promise<SerializedOracleInfo[]> {
    return Array.from(this.oracles.values()).filter((o) => o.active);
  }

  // Commitments
  async getCommitments(assetUal: UAL): Promise<SerializedOracleCommitment[]> {
    return this.commitments.get(assetUal) || [];
  }

  async addCommitment(commitment: SerializedOracleCommitment): Promise<void> {
    const existing = this.commitments.get(commitment.assetUal) || [];
    existing.push(commitment);
    this.commitments.set(commitment.assetUal, existing);
  }

  // Assessments
  async getAssessments(assetUal: UAL): Promise<SerializedQualityAssessment[]> {
    return this.assessments.get(assetUal) || [];
  }

  async addAssessment(assessment: SerializedQualityAssessment): Promise<void> {
    const existing = this.assessments.get(assessment.assetUal) || [];
    existing.push(assessment);
    this.assessments.set(assessment.assetUal, existing);
  }

  // Provenance
  async getProvenance(inferenceId: string): Promise<SerializedInferenceProvenance | null> {
    return this.provenances.get(inferenceId) || null;
  }

  async setProvenance(provenance: SerializedInferenceProvenance): Promise<void> {
    this.provenances.set(provenance.inferenceId, provenance);

    // Index by asset
    for (const asset of provenance.usedAssets) {
      const existing = this.provenanceByAsset.get(asset.assetUal) || [];
      if (!existing.includes(provenance.inferenceId)) {
        existing.push(provenance.inferenceId);
        this.provenanceByAsset.set(asset.assetUal, existing);
      }
    }

    // Index by agent
    const agentInferences = this.provenanceByAgent.get(provenance.agent) || [];
    if (!agentInferences.includes(provenance.inferenceId)) {
      agentInferences.push(provenance.inferenceId);
      this.provenanceByAgent.set(provenance.agent, agentInferences);
    }
  }

  async getProvenanceByAsset(assetUal: UAL): Promise<SerializedInferenceProvenance[]> {
    const ids = this.provenanceByAsset.get(assetUal) || [];
    return ids.map((id) => this.provenances.get(id)!).filter(Boolean);
  }

  async getProvenanceByAgent(agent: string): Promise<SerializedInferenceProvenance[]> {
    const ids = this.provenanceByAgent.get(agent) || [];
    return ids.map((id) => this.provenances.get(id)!).filter(Boolean);
  }

  // Disputes
  async getDispute(disputeId: string): Promise<SerializedQualityDispute | null> {
    return this.disputes.get(disputeId) || null;
  }

  async setDispute(dispute: SerializedQualityDispute): Promise<void> {
    this.disputes.set(dispute.disputeId, dispute);
    this.disputeByAsset.set(dispute.assetUal, dispute.disputeId);
  }

  async getDisputeByAsset(assetUal: UAL): Promise<SerializedQualityDispute | null> {
    const id = this.disputeByAsset.get(assetUal);
    return id ? this.disputes.get(id) || null : null;
  }

  async getOpenDisputes(): Promise<SerializedQualityDispute[]> {
    return Array.from(this.disputes.values()).filter((d) => d.status === 'open');
  }
}

export function serializePublicKey(pk: PublicKey): string {
  return pk.toBase58();
}

export function deserializePublicKey(str: string): PublicKey {
  return new PublicKey(str);
}

export function serializeBN(bn: BN): string {
  return bn.toString();
}

export function deserializeBN(str: string): BN {
  return new BN(str);
}

export function serializeStake(stake: QualityStake): SerializedQualityStake {
  return {
    assetUal: stake.assetUal,
    publisher: serializePublicKey(stake.publisher),
    stakeAmount: serializeBN(stake.stakeAmount),
    createdAt: stake.createdAt,
    verificationDeadline: stake.verificationDeadline,
    status: stake.status,
    escrowPda: serializePublicKey(stake.escrowPda),
  };
}

export function deserializeStake(data: SerializedQualityStake): QualityStake {
  return {
    assetUal: data.assetUal,
    publisher: deserializePublicKey(data.publisher),
    stakeAmount: deserializeBN(data.stakeAmount),
    createdAt: data.createdAt,
    verificationDeadline: data.verificationDeadline,
    status: data.status,
    escrowPda: deserializePublicKey(data.escrowPda),
  };
}

export function serializeReputation(rep: PublisherReputation): SerializedPublisherReputation {
  return {
    publisher: serializePublicKey(rep.publisher),
    totalAssets: rep.totalAssets,
    verifiedAssets: rep.verifiedAssets,
    disputedAssets: rep.disputedAssets,
    contestedAssets: rep.contestedAssets,
    averageQualityScore: rep.averageQualityScore,
    totalStakeSlashed: serializeBN(rep.totalStakeSlashed),
    totalStakeReturned: serializeBN(rep.totalStakeReturned),
    memberSince: rep.memberSince,
  };
}

export function deserializeReputation(data: SerializedPublisherReputation): PublisherReputation {
  return {
    publisher: deserializePublicKey(data.publisher),
    totalAssets: data.totalAssets,
    verifiedAssets: data.verifiedAssets,
    disputedAssets: data.disputedAssets,
    contestedAssets: data.contestedAssets,
    averageQualityScore: data.averageQualityScore,
    totalStakeSlashed: deserializeBN(data.totalStakeSlashed),
    totalStakeReturned: deserializeBN(data.totalStakeReturned),
    memberSince: data.memberSince,
  };
}

export function serializeOracleInfo(info: OracleInfo): SerializedOracleInfo {
  return {
    oracleId: serializePublicKey(info.oracleId),
    stake: serializeBN(info.stake),
    totalAssessments: info.totalAssessments,
    correctAssessments: info.correctAssessments,
    slashedAmount: serializeBN(info.slashedAmount),
    rewardedAmount: serializeBN(info.rewardedAmount),
    registeredAt: info.registeredAt,
    active: info.active,
  };
}

export function deserializeOracleInfo(data: SerializedOracleInfo): OracleInfo {
  return {
    oracleId: deserializePublicKey(data.oracleId),
    stake: deserializeBN(data.stake),
    totalAssessments: data.totalAssessments,
    correctAssessments: data.correctAssessments,
    slashedAmount: deserializeBN(data.slashedAmount),
    rewardedAmount: deserializeBN(data.rewardedAmount),
    registeredAt: data.registeredAt,
    active: data.active,
  };
}
