/**
 * ZK Reputation Module for Daydreams Agents
 *
 * Privacy-preserving reputation proofs using Groth16.
 * Agents prove tier qualification without revealing actual score.
 */

import {
  DarkForestProver,
  getTierThreshold,
  getQualifyingTier,
  qualifiesForTier,
  type GeneratedProof,
  type Commitment,
  type TierLevel,
  type TierName,
  TIER_NAMES,
  TIER_THRESHOLDS,
} from '@kamiyo/kamiyo-swarmteams';

export interface ReputationMemory {
  commitment: string | null;
  score: number | null;
  tier: TierLevel;
  proofHistory: ProofRecord[];
  verifiedPeers: Record<string, PeerReputation>;
  initialized: boolean;
}

const MAX_PROOF_HISTORY = 100;
const MAX_VERIFIED_PEERS = 500;

export interface ProofRecord {
  id: string;
  threshold: number;
  tier: TierLevel;
  commitment: string;
  timestamp: number;
  verifiedBy?: string;
}

export interface PeerReputation {
  agentId: string;
  commitment: string;
  tier: TierLevel;
  verifiedAt: number;
  proofValid: boolean;
}

export interface GenerateCommitmentInput {
  score: number;
}

export interface GenerateCommitmentOutput {
  commitment: string;
  tier: TierLevel;
  tierName: TierName;
}

export interface ProveReputationInput {
  threshold?: number;
  tier?: TierLevel;
}

export interface ProveReputationOutput {
  success: boolean;
  proof?: SerializedProof;
  commitment?: string;
  threshold: number;
  tier: TierLevel;
  tierName: TierName;
  error?: string;
}

export interface VerifyProofInput {
  proof: SerializedProof;
  commitment: string;
  threshold: number;
  agentId?: string;
}

export interface VerifyProofOutput {
  valid: boolean;
  tier: TierLevel;
  tierName: TierName;
  error?: string;
}

export interface SerializedProof {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
  publicInputs: string[];
  commitment: string;
}

function serializeProof(proof: GeneratedProof): SerializedProof {
  return {
    a: [proof.a[0].toString(), proof.a[1].toString()],
    b: [
      [proof.b[0][0].toString(), proof.b[0][1].toString()],
      [proof.b[1][0].toString(), proof.b[1][1].toString()],
    ],
    c: [proof.c[0].toString(), proof.c[1].toString()],
    publicInputs: proof.publicInputs.map((i) => i.toString()),
    commitment: proof.commitment,
  };
}

function deserializeProof(serialized: SerializedProof): GeneratedProof {
  return {
    a: [BigInt(serialized.a[0]), BigInt(serialized.a[1])],
    b: [
      [BigInt(serialized.b[0][0]), BigInt(serialized.b[0][1])],
      [BigInt(serialized.b[1][0]), BigInt(serialized.b[1][1])],
    ],
    c: [BigInt(serialized.c[0]), BigInt(serialized.c[1])],
    publicInputs: serialized.publicInputs.map((s) => BigInt(s)),
    commitment: serialized.commitment,
  };
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface CachedProof {
  proof: SerializedProof;
  threshold: number;
  tier: TierLevel;
  commitment: string;
  expiresAt: number;
}

const DEFAULT_PROOF_CACHE_TTL = 3600000; // 1 hour
const MAX_CACHED_PROOFS = 10;

export class ReputationManager {
  private prover: DarkForestProver | null = null;
  private memory: ReputationMemory;
  private secret: bigint | null = null;
  private proofCache = new Map<number, CachedProof>();
  private proofCacheTTL: number;

  constructor(opts: { proofCacheTTL?: number } = {}) {
    this.memory = this.createInitialMemory();
    this.proofCacheTTL = opts.proofCacheTTL ?? DEFAULT_PROOF_CACHE_TTL;
  }

  private createInitialMemory(): ReputationMemory {
    return {
      commitment: null,
      score: null,
      tier: 0,
      proofHistory: [],
      verifiedPeers: {},
      initialized: false,
    };
  }

  clearSecret(): void {
    this.secret = null;
  }

  private async ensureProver(): Promise<DarkForestProver> {
    if (!this.prover) {
      if (!DarkForestProver.isAvailable()) {
        throw new Error('DarkForest circuit artifacts not available');
      }
      this.prover = new DarkForestProver();
      await this.prover.init();
    }
    return this.prover;
  }

  getMemory(): ReputationMemory {
    return this.memory;
  }

  isInitialized(): boolean {
    return this.memory.initialized;
  }

  async generateCommitment(input: GenerateCommitmentInput): Promise<GenerateCommitmentOutput> {
    const { score } = input;

    if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100) {
      throw new Error('Score must be an integer between 0 and 100');
    }

    const prover = await this.ensureProver();
    const commitment = await prover.generateCommitment(score);

    const tier = getQualifyingTier(score);
    const tierName = TIER_NAMES[tier];

    this.memory.commitment = '0x' + commitment.value.toString(16).padStart(64, '0');
    this.secret = commitment.secret;
    this.memory.score = score;
    this.memory.tier = tier;
    this.memory.initialized = true;

    return {
      commitment: this.memory.commitment,
      tier,
      tierName,
    };
  }

  async proveReputation(input: ProveReputationInput): Promise<ProveReputationOutput> {
    if (!this.memory.initialized || this.memory.score === null || this.secret === null) {
      const tier = input.tier ?? 0;
      return {
        success: false,
        threshold: input.threshold ?? getTierThreshold(tier as TierLevel),
        tier: tier as TierLevel,
        tierName: TIER_NAMES[tier as TierLevel],
        error: 'Reputation not initialized. Call generateCommitment first.',
      };
    }

    let threshold: number;
    let tier: TierLevel;

    if (input.tier !== undefined) {
      tier = input.tier;
      threshold = getTierThreshold(tier);
    } else if (input.threshold !== undefined) {
      threshold = input.threshold;
      tier = getQualifyingTier(threshold);
    } else {
      tier = this.memory.tier;
      threshold = getTierThreshold(tier);
    }

    const tierName = TIER_NAMES[tier];

    if (this.memory.score < threshold) {
      return {
        success: false,
        threshold,
        tier,
        tierName,
        error: `Insufficient reputation for threshold ${threshold}`,
      };
    }

    // Check cache
    const cached = this.proofCache.get(threshold);
    if (cached && cached.expiresAt > Date.now() && cached.commitment === this.memory.commitment) {
      return {
        success: true,
        proof: cached.proof,
        commitment: cached.commitment,
        threshold: cached.threshold,
        tier: cached.tier,
        tierName,
      };
    }

    try {
      const prover = await this.ensureProver();

      const proof = await prover.generateProof({
        score: this.memory.score,
        secret: this.secret,
        threshold,
      });

      const serialized = serializeProof(proof);

      // Cache the proof
      if (this.proofCache.size >= MAX_CACHED_PROOFS) {
        const oldest = this.proofCache.keys().next().value;
        if (oldest !== undefined) this.proofCache.delete(oldest);
      }
      this.proofCache.set(threshold, {
        proof: serialized,
        threshold,
        tier,
        commitment: proof.commitment,
        expiresAt: Date.now() + this.proofCacheTTL,
      });

      const record: ProofRecord = {
        id: generateId('proof'),
        threshold,
        tier,
        commitment: proof.commitment,
        timestamp: Date.now(),
      };

      if (this.memory.proofHistory.length >= MAX_PROOF_HISTORY) {
        this.memory.proofHistory.shift();
      }
      this.memory.proofHistory.push(record);

      return {
        success: true,
        proof: serialized,
        commitment: proof.commitment,
        threshold,
        tier,
        tierName,
      };
    } catch (err) {
      return {
        success: false,
        threshold,
        tier,
        tierName,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  clearProofCache(): void {
    this.proofCache.clear();
  }

  async verifyProof(input: VerifyProofInput): Promise<VerifyProofOutput> {
    const { proof, commitment, threshold, agentId } = input;

    if (!proof || typeof commitment !== 'string' || typeof threshold !== 'number') {
      return {
        valid: false,
        tier: 0,
        tierName: 'Default',
        error: 'Invalid input: proof, commitment, and threshold are required',
      };
    }

    const prover = await this.ensureProver();
    const deserialized = deserializeProof(proof);

    if (deserialized.commitment !== commitment) {
      return {
        valid: false,
        tier: 0,
        tierName: 'Default',
        error: 'Commitment mismatch',
      };
    }

    const result = await prover.verifyProof(deserialized);
    const tier = getQualifyingTier(threshold);
    const tierName = TIER_NAMES[tier];

    if (result.valid && agentId) {
      const peerIds = Object.keys(this.memory.verifiedPeers);
      if (peerIds.length >= MAX_VERIFIED_PEERS && !this.memory.verifiedPeers[agentId]) {
        const oldest = peerIds.reduce((a, b) =>
          this.memory.verifiedPeers[a].verifiedAt < this.memory.verifiedPeers[b].verifiedAt ? a : b
        );
        delete this.memory.verifiedPeers[oldest];
      }

      this.memory.verifiedPeers[agentId] = {
        agentId,
        commitment,
        tier,
        verifiedAt: Date.now(),
        proofValid: true,
      };
    }

    return {
      valid: result.valid,
      tier,
      tierName,
      error: result.error,
    };
  }

  getTier(): { tier: TierLevel; name: TierName } {
    return {
      tier: this.memory.tier,
      name: TIER_NAMES[this.memory.tier],
    };
  }

  getVerifiedPeers(): PeerReputation[] {
    return Object.values(this.memory.verifiedPeers);
  }

  canProve(threshold: number): boolean {
    if (!this.memory.initialized || this.memory.score === null) {
      return false;
    }
    return this.memory.score >= threshold;
  }

  canProveTier(tier: TierLevel): boolean {
    return this.canProve(getTierThreshold(tier));
  }
}

export const reputationActions = {
  generateCommitment: {
    name: 'kamiyo.generateCommitment',
    description: 'Generate a ZK commitment to your reputation score. This creates a Poseidon hash binding your score to a secret, enabling future privacy-preserving proofs.',
    schema: {
      type: 'object' as const,
      properties: {
        score: {
          type: 'number',
          description: 'Reputation score (0-100)',
          minimum: 0,
          maximum: 100,
        },
      },
      required: ['score'],
    },
  },
  proveReputation: {
    name: 'kamiyo.proveReputation',
    description: 'Generate a ZK proof that your reputation meets a threshold. Proves tier qualification without revealing actual score.',
    schema: {
      type: 'object' as const,
      properties: {
        threshold: {
          type: 'number',
          description: 'Minimum score threshold to prove (0-100)',
        },
        tier: {
          type: 'number',
          description: 'Tier level to prove (0=Default, 1=Bronze, 2=Silver, 3=Gold, 4=Platinum)',
          enum: [0, 1, 2, 3, 4],
        },
      },
    },
  },
  verifyProof: {
    name: 'kamiyo.verifyProof',
    description: 'Verify another agent\'s ZK reputation proof. Confirms they meet the claimed threshold without learning their actual score.',
    schema: {
      type: 'object' as const,
      properties: {
        proof: {
          type: 'object',
          description: 'Serialized Groth16 proof',
        },
        commitment: {
          type: 'string',
          description: 'Expected commitment (hex string)',
        },
        threshold: {
          type: 'number',
          description: 'Threshold the proof claims to satisfy',
        },
        agentId: {
          type: 'string',
          description: 'Optional agent ID to track verified peers',
        },
      },
      required: ['proof', 'commitment', 'threshold'],
    },
  },
  getReputationTier: {
    name: 'kamiyo.getReputationTier',
    description: 'Get your current reputation tier based on initialized score.',
    schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  canProveTier: {
    name: 'kamiyo.canProveTier',
    description: 'Check if you can generate a proof for a specific tier.',
    schema: {
      type: 'object' as const,
      properties: {
        tier: {
          type: 'number',
          description: 'Tier level to check (0-4)',
          enum: [0, 1, 2, 3, 4],
        },
      },
      required: ['tier'],
    },
  },
  getVerifiedPeers: {
    name: 'kamiyo.getVerifiedPeers',
    description: 'Get list of peers whose reputation proofs you have verified.',
    schema: {
      type: 'object' as const,
      properties: {},
    },
  },
};

export {
  getTierThreshold,
  getQualifyingTier,
  qualifiesForTier,
  TIER_NAMES,
  TIER_THRESHOLDS,
};
export type { TierLevel, TierName };
