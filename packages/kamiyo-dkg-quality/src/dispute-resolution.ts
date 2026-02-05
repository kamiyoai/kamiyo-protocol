import { PublicKey } from '@solana/web3.js';
import { randomUUID } from 'crypto';
import type { UAL, QualityDispute } from './types.js';
import type { QualityStakingManager } from './quality-staking.js';
import type { OracleProtocolManager } from './oracle-protocol.js';
import type { InferenceProvenanceTracker } from './inference-provenance.js';
import {
  StakeNotFoundError,
  CannotDisputePendingError,
  DisputeWindowExpiredError,
  DisputeAlreadyExistsError,
  DisputeNotFoundError,
  DisputeAlreadyResolvedError,
} from './errors.js';

export class DisputeResolutionManager {
  private disputes: Map<string, QualityDispute> = new Map();
  private stakingManager: QualityStakingManager;
  private oracleManager: OracleProtocolManager;
  private provenanceTracker: InferenceProvenanceTracker;

  constructor(
    stakingManager: QualityStakingManager,
    oracleManager: OracleProtocolManager,
    provenanceTracker: InferenceProvenanceTracker
  ) {
    this.stakingManager = stakingManager;
    this.oracleManager = oracleManager;
    this.provenanceTracker = provenanceTracker;
  }

  async fileDispute(params: {
    assetUal: UAL;
    challenger: PublicKey;
    reason: string;
    evidenceUal?: UAL;
  }): Promise<QualityDispute> {
    const { assetUal, challenger, reason, evidenceUal } = params;

    const stake = this.stakingManager.getStake(assetUal);
    if (!stake) throw new StakeNotFoundError(assetUal);
    if (stake.status === 'pending') throw new CannotDisputePendingError();

    const verifiedAt = stake.verificationDeadline;
    const disputeWindow = 7 * 24 * 3600;
    const now = Math.floor(Date.now() / 1000);
    if (now > verifiedAt + disputeWindow) throw new DisputeWindowExpiredError(assetUal);

    const existingDispute = this.getDisputeForAsset(assetUal);
    if (existingDispute && existingDispute.status === 'open') throw new DisputeAlreadyExistsError(assetUal, existingDispute.disputeId);

    const disputeId = randomUUID();
    const reveals = this.oracleManager.getReveals(assetUal);
    const originalScore = reveals.length > 0 ? Math.round(reveals.reduce((sum, r) => sum + r.overallScore, 0) / reveals.length) : 0;

    const dispute: QualityDispute = {
      assetUal,
      disputeId,
      challenger,
      evidenceUal,
      reason,
      status: 'open',
      originalScore,
      createdAt: now,
    };

    this.disputes.set(disputeId, dispute);
    return dispute;
  }

  async resolveDispute(params: { disputeId: string; newScore: number; oracleCount: number; }): Promise<QualityDispute> {
    const { disputeId, newScore, oracleCount } = params;

    const dispute = this.disputes.get(disputeId);
    if (!dispute) throw new DisputeNotFoundError(disputeId);
    if (dispute.status !== 'open') throw new DisputeAlreadyResolvedError(disputeId, dispute.status);

    dispute.newScore = newScore;
    dispute.resolvedAt = Math.floor(Date.now() / 1000);

    const scoreDiff = Math.abs(newScore - dispute.originalScore);
    const significantChange = scoreDiff >= 15;

    if (significantChange) {
      dispute.status = 'resolved';
      await this.stakingManager.resolveQualityAssessment({ assetUal: dispute.assetUal, medianScore: newScore, oracleCount });
    } else {
      dispute.status = 'rejected';
    }

    return dispute;
  }

  async processInferenceRefunds(params: { disputedAssets: UAL[]; }): Promise<Array<{ inferenceId: string; refundProportion: number; escrowPda?: PublicKey; }>> {
    const { disputedAssets } = params;
    const refunds: Array<{ inferenceId: string; refundProportion: number; escrowPda?: PublicKey; }> = [];

    for (const assetUal of disputedAssets) {
      const inferences = this.provenanceTracker.getInferencesUsingAsset(assetUal);
      for (const inference of inferences) {
        if (!inference.escrowPda) continue;
        const refundProportion = this.provenanceTracker.calculateDisputeRefund({ inferenceId: inference.inferenceId, disputedAssets });
        if (refundProportion > 0) {
          refunds.push({ inferenceId: inference.inferenceId, refundProportion, escrowPda: inference.escrowPda });
        }
      }
    }

    return refunds;
  }

  getDispute(disputeId: string): QualityDispute | undefined { return this.disputes.get(disputeId); }

  getDisputeForAsset(assetUal: UAL): QualityDispute | undefined { return Array.from(this.disputes.values()).find((d) => d.assetUal === assetUal); }

  getOpenDisputes(): QualityDispute[] { return Array.from(this.disputes.values()).filter((d) => d.status === 'open'); }

  getDisputesByChallenger(challenger: PublicKey): QualityDispute[] { return Array.from(this.disputes.values()).filter((d) => d.challenger.equals(challenger)); }

  getDisputeStats(): { total: number; open: number; resolved: number; rejected: number; avgScoreChange: number; } {
    const all = Array.from(this.disputes.values());
    const resolved = all.filter((d) => d.status === 'resolved');
    const avgScoreChange = resolved.length > 0 ? resolved.reduce((sum, d) => sum + Math.abs((d.newScore || 0) - d.originalScore), 0) / resolved.length : 0;
    return { total: all.length, open: all.filter((d) => d.status === 'open').length, resolved: resolved.length, rejected: all.filter((d) => d.status === 'rejected').length, avgScoreChange: Math.round(avgScoreChange * 10) / 10 };
  }
}
