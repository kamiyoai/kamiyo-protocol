import { PublicKey, Connection } from '@solana/web3.js';
import { BlindfoldClient } from './client';
import { CardTier, CARD_TIERS, PaymentResponse } from './types';

export interface ReputationStats {
  successfulAgreements: number;
  totalAgreements: number;
  disputesWon: number;
  disputesLost: number;
}

export interface ReputationProof {
  agentPk: string;
  commitment: string;
  proofBytes: Uint8Array;
  threshold: number;
}

export interface ExclusionProof {
  agentPk: string;
  root: string;
  siblings: string[];
}

export interface GatedPaymentParams {
  amount: number;
  currency: 'SOL' | 'USDC' | 'USDT';
  recipientEmail: string;
  reputationProof: ReputationProof;
  exclusionProof?: ExclusionProof;
}

export interface GatedPaymentResult {
  payment: PaymentResponse;
  tier: CardTier;
  limit: number;
}

export class ReputationGate {
  private client: BlindfoldClient;

  constructor(config?: { baseUrl?: string; apiKey?: string }) {
    this.client = new BlindfoldClient(config);
  }

  getTierForScore(score: number): CardTier {
    for (let i = CARD_TIERS.length - 1; i >= 0; i--) {
      if (score >= CARD_TIERS[i].reputationThreshold) {
        return CARD_TIERS[i].tier;
      }
    }
    return 'basic';
  }

  getLimitForTier(tier: CardTier): number {
    const config = CARD_TIERS.find((t) => t.tier === tier);
    return config?.limit ?? 100;
  }

  getThresholdForTier(tier: CardTier): number {
    const config = CARD_TIERS.find((t) => t.tier === tier);
    return config?.reputationThreshold ?? 0;
  }

  computeSuccessRate(stats: ReputationStats): number {
    if (stats.totalAgreements === 0) return 0;
    return Math.floor((stats.successfulAgreements * 100) / stats.totalAgreements);
  }

  async createGatedPayment(params: GatedPaymentParams): Promise<GatedPaymentResult> {
    const { amount, currency, recipientEmail, reputationProof, exclusionProof } = params;

    const tier = this.getTierForScore(reputationProof.threshold);
    const limit = this.getLimitForTier(tier);

    if (amount > limit) {
      throw new Error(`Amount $${amount} exceeds tier limit $${limit} for ${tier}`);
    }

    const payment = await this.client.createPayment({
      amount,
      currency,
      recipientEmail,
      useZkProof: true,
      agentPk: reputationProof.agentPk,
      reputationCommitment: reputationProof.commitment,
      reputationProof: Buffer.from(reputationProof.proofBytes).toString('base64'),
      requestedTier: tier,
    });

    return { payment, tier, limit };
  }

  formatProofForApi(proof: ReputationProof): {
    agent_pk: string;
    reputation_commitment: string;
    reputation_proof: string;
    requested_tier: CardTier;
    requires_reputation_check: boolean;
  } {
    return {
      agent_pk: proof.agentPk,
      reputation_commitment: proof.commitment,
      reputation_proof: Buffer.from(proof.proofBytes).toString('base64'),
      requested_tier: this.getTierForScore(proof.threshold),
      requires_reputation_check: true,
    };
  }

  formatExclusionForApi(proof: ExclusionProof): {
    agent_pk: string;
    exclusion_root: string;
    exclusion_proof_siblings: string;
  } {
    return {
      agent_pk: proof.agentPk,
      exclusion_root: proof.root,
      exclusion_proof_siblings: JSON.stringify(proof.siblings),
    };
  }
}

export function verifyThresholdMet(stats: ReputationStats, threshold: number): boolean {
  if (stats.totalAgreements === 0) return threshold === 0;
  const rate = Math.floor((stats.successfulAgreements * 100) / stats.totalAgreements);
  return rate >= threshold;
}

export function getTierFromThreshold(threshold: number): CardTier {
  if (threshold >= 95) return 'elite';
  if (threshold >= 85) return 'premium';
  if (threshold >= 70) return 'standard';
  return 'basic';
}

export const TIER_THRESHOLDS: Record<CardTier, number> = {
  basic: 0,
  standard: 70,
  premium: 85,
  elite: 95,
};

export const TIER_LIMITS: Record<CardTier, number> = {
  basic: 100,
  standard: 500,
  premium: 2000,
  elite: 10000,
};
