import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { randomUUID } from 'crypto';
import type { UAL, QualityDispute, QualityStake, InferenceProvenance } from './types.js';
import type { QualityStakingManager } from './quality-staking.js';
import type { OracleProtocolManager } from './oracle-protocol.js';
import type { InferenceProvenanceTracker } from './inference-provenance.js';

/**
 * Handles disputes and re-evaluation for quality assessments.
 */
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

    // Verify asset has been assessed
    const stake = this.stakingManager.getStake(assetUal);
    if (!stake) {
      throw new Error(`No quality stake found for asset: ${assetUal}`);
    }

    if (stake.status === 'pending') {
      throw new Error('Cannot dispute pending assessment');
    }

    // Check dispute window (7 days from verification)
    const verifiedAt = stake.verificationDeadline; // Approximate
    const disputeWindow = 7 * 24 * 3600;
    const now = Math.floor(Date.now() / 1000);

    if (now > verifiedAt + disputeWindow) {
      throw new Error('Dispute window has expired');
    }

    // Check for existing dispute
    const existingDispute = this.getDisputeForAsset(assetUal);
    if (existingDispute && existingDispute.status === 'open') {
      throw new Error(`Active dispute already exists: ${existingDispute.disputeId}`);
    }

    const disputeId = randomUUID();
    const reveals = this.oracleManager.getReveals(assetUal);
    const originalScore =
      reveals.length > 0
        ? Math.round(reveals.reduce((sum, r) => sum + r.overallScore, 0) / reveals.length)
        : 0;

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

  async resolveDispute(params: {
    disputeId: string;
    newScore: number;
    oracleCount: number;
  }): Promise<QualityDispute> {
    const { disputeId, newScore, oracleCount } = params;

    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute not found: ${disputeId}`);
    }

    if (dispute.status !== 'open') {
      throw new Error(`Dispute already resolved: ${dispute.status}`);
    }

    dispute.newScore = newScore;
    dispute.resolvedAt = Math.floor(Date.now() / 1000);

    // Determine if dispute was successful
    const scoreDiff = Math.abs(newScore - dispute.originalScore);
    const significantChange = scoreDiff >= 15; // 15+ point change = significant

    if (significantChange) {
      dispute.status = 'resolved';

      // Update stake status based on new score
      await this.stakingManager.resolveQualityAssessment({
        assetUal: dispute.assetUal,
        medianScore: newScore,
        oracleCount,
      });
    } else {
      dispute.status = 'rejected';
    }

    return dispute;
  }

  async processInferenceRefunds(params: {
    disputedAssets: UAL[];
  }): Promise<Array<{
    inferenceId: string;
    refundProportion: number;
    escrowPda?: PublicKey;
  }>> {
    const { disputedAssets } = params;
    const refunds: Array<{
      inferenceId: string;
      refundProportion: number;
      escrowPda?: PublicKey;
    }> = [];

    // Find all inferences that used disputed assets
    for (const assetUal of disputedAssets) {
      const inferences = this.provenanceTracker.getInferencesUsingAsset(assetUal);

      for (const inference of inferences) {
        // Skip if no escrow attached
        if (!inference.escrowPda) continue;

        const refundProportion = this.provenanceTracker.calculateDisputeRefund({
          inferenceId: inference.inferenceId,
          disputedAssets,
        });

        if (refundProportion > 0) {
          refunds.push({
            inferenceId: inference.inferenceId,
            refundProportion,
            escrowPda: inference.escrowPda,
          });
        }
      }
    }

    return refunds;
  }

  getDispute(disputeId: string): QualityDispute | undefined {
    return this.disputes.get(disputeId);
  }

  getDisputeForAsset(assetUal: UAL): QualityDispute | undefined {
    return Array.from(this.disputes.values()).find(
      (d) => d.assetUal === assetUal
    );
  }

  getOpenDisputes(): QualityDispute[] {
    return Array.from(this.disputes.values()).filter(
      (d) => d.status === 'open'
    );
  }

  getDisputesByChallenger(challenger: PublicKey): QualityDispute[] {
    return Array.from(this.disputes.values()).filter((d) =>
      d.challenger.equals(challenger)
    );
  }

  getDisputeStats(): {
    total: number;
    open: number;
    resolved: number;
    rejected: number;
    avgScoreChange: number;
  } {
    const all = Array.from(this.disputes.values());
    const resolved = all.filter((d) => d.status === 'resolved');

    const avgScoreChange =
      resolved.length > 0
        ? resolved.reduce(
            (sum, d) => sum + Math.abs((d.newScore || 0) - d.originalScore),
            0
          ) / resolved.length
        : 0;

    return {
      total: all.length,
      open: all.filter((d) => d.status === 'open').length,
      resolved: resolved.length,
      rejected: all.filter((d) => d.status === 'rejected').length,
      avgScoreChange: Math.round(avgScoreChange * 10) / 10,
    };
  }
}
