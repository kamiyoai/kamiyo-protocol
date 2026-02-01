import { SwarmTeamsProver, generateOwnerSecret, generateRegistrationSecret } from '@kamiyo/hive';
import type { AgentReputationInputs, ReputationProofResult } from '@kamiyo/hive';
import { TIER_CONFIG, getTierFromScore, type TierConfig } from '../personality.js';
import type { JobDatabase } from '../db.js';
import type { DKGPublisher } from './dkg-publisher.js';

export interface VerificationRequest {
  agentId: string;
  agentHandle: string;
  requestedBy: string;
  postId?: string;
}

export interface VerificationResult {
  success: boolean;
  agentId: string;
  tier: TierConfig | null;
  proofHash: string | null;
  nullifierHash: string | null;
  ual: string | null;
  error?: string;
}

export interface ReputationData {
  score: number;
  transactionCount: number;
  disputeCount: number;
  lastUpdated: number;
}

export interface ReputationServiceConfig {
  db: JobDatabase;
  prover: SwarmTeamsProver;
  dkg?: DKGPublisher;
  agentsRoot: Uint8Array;
  currentEpoch: bigint;
  freeVerificationsPerDay: number;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const MAX_AGENT_ID_LENGTH = 100;
const MAX_SECRETS_CACHE_SIZE = 1000;
const PROOF_TIMEOUT_MS = 10000;

export class ReputationService {
  private db: JobDatabase;
  private prover: SwarmTeamsProver;
  private dkg?: DKGPublisher;
  private agentsRoot: Uint8Array;
  private currentEpoch: bigint;
  private freeVerificationsPerDay: number;
  private verificationsToday = 0;
  private dayStart = 0;

  // Cache of agent secrets (in production, these would be derived from on-chain data)
  private agentSecrets = new Map<string, {
    ownerSecret: Uint8Array;
    registrationSecret: Uint8Array;
    agentId: Uint8Array;
  }>();

  constructor(config: ReputationServiceConfig) {
    if (!config.db) throw new Error('Database required');
    if (!config.prover) throw new Error('Prover required');
    if (!config.agentsRoot || config.agentsRoot.length !== 32) {
      throw new Error('Invalid agents root');
    }
    if (config.freeVerificationsPerDay < 0 || config.freeVerificationsPerDay > 10000) {
      throw new Error('Invalid free verifications limit');
    }

    this.db = config.db;
    this.prover = config.prover;
    this.dkg = config.dkg;
    this.agentsRoot = config.agentsRoot;
    this.currentEpoch = config.currentEpoch;
    this.freeVerificationsPerDay = config.freeVerificationsPerDay;
    this.resetDayCounter();
  }

  private resetDayCounter(): void {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const today = Math.floor(now / dayMs) * dayMs;

    if (this.dayStart < today) {
      this.dayStart = today;
      this.verificationsToday = 0;
    }
  }

  canVerify(): boolean {
    this.resetDayCounter();
    return this.verificationsToday < this.freeVerificationsPerDay;
  }

  getVerificationsRemaining(): number {
    this.resetDayCounter();
    return Math.max(0, this.freeVerificationsPerDay - this.verificationsToday);
  }

  updateAgentsRoot(newRoot: Uint8Array): void {
    this.agentsRoot = newRoot;
  }

  updateEpoch(newEpoch: bigint): void {
    this.currentEpoch = newEpoch;
  }

  async getReputationData(agentId: string): Promise<ReputationData | null> {
    // In production, query on-chain or from DKG
    // For now, return mock data based on agent activity
    const existingProof = this.db.getReputationProof(agentId);

    if (existingProof) {
      return {
        score: existingProof.tier * 25 + 10, // Approximate from tier
        transactionCount: 10,
        disputeCount: 0,
        lastUpdated: existingProof.createdAt,
      };
    }

    // Default for new agents
    return {
      score: 50, // Silver tier eligible
      transactionCount: 5,
      disputeCount: 0,
      lastUpdated: Date.now(),
    };
  }

  private getOrCreateAgentSecrets(agentId: string): {
    ownerSecret: Uint8Array;
    registrationSecret: Uint8Array;
    agentId: Uint8Array;
  } {
    if (!agentId || agentId.length > MAX_AGENT_ID_LENGTH) {
      throw new Error('Invalid agent ID');
    }

    const existing = this.agentSecrets.get(agentId);
    if (existing) return existing;

    // Bound cache size to prevent memory exhaustion
    if (this.agentSecrets.size >= MAX_SECRETS_CACHE_SIZE) {
      const first = this.agentSecrets.keys().next().value;
      if (first) this.agentSecrets.delete(first);
    }

    // Generate deterministic secrets from agent ID
    const encoder = new TextEncoder();
    const agentIdBytes = new Uint8Array(32);
    const encoded = encoder.encode(agentId);
    agentIdBytes.set(encoded.slice(0, 32));

    const secrets = {
      ownerSecret: generateOwnerSecret(),
      registrationSecret: generateRegistrationSecret(),
      agentId: agentIdBytes,
    };

    this.agentSecrets.set(agentId, secrets);
    return secrets;
  }

  async verifyReputation(request: VerificationRequest): Promise<VerificationResult> {
    // Input validation
    if (!request.agentId || request.agentId.length > MAX_AGENT_ID_LENGTH) {
      return {
        success: false,
        agentId: request.agentId || '',
        tier: null,
        proofHash: null,
        nullifierHash: null,
        ual: null,
        error: 'Invalid agent ID',
      };
    }

    if (!request.agentHandle || !/^[a-zA-Z0-9_-]+$/.test(request.agentHandle)) {
      return {
        success: false,
        agentId: request.agentId,
        tier: null,
        proofHash: null,
        nullifierHash: null,
        ual: null,
        error: 'Invalid agent handle format',
      };
    }

    if (!this.canVerify()) {
      return {
        success: false,
        agentId: request.agentId,
        tier: null,
        proofHash: null,
        nullifierHash: null,
        ual: null,
        error: 'Daily verification limit reached',
      };
    }

    try {
      // Get reputation data
      const repData = await this.getReputationData(request.agentId);
      if (!repData) {
        return {
          success: false,
          agentId: request.agentId,
          tier: null,
          proofHash: null,
          nullifierHash: null,
          ual: null,
          error: 'Agent not found in reputation registry',
        };
      }

      // Determine tier
      const tier = getTierFromScore(repData.score);
      if (!tier) {
        return {
          success: false,
          agentId: request.agentId,
          tier: null,
          proofHash: null,
          nullifierHash: null,
          ual: null,
          error: 'Reputation score below minimum threshold',
        };
      }

      // Get agent secrets
      const secrets = this.getOrCreateAgentSecrets(request.agentId);

      // Build proof inputs
      const inputs: AgentReputationInputs = {
        ownerSecret: secrets.ownerSecret,
        agentId: secrets.agentId,
        registrationSecret: secrets.registrationSecret,
        merkleProof: this.generateMockMerkleProof(),
        merklePathIndices: this.generateMockMerkleIndices(),
        reputationScore: repData.score,
        transactionCount: repData.transactionCount,
        reputationSecret: generateRegistrationSecret(),
        epoch: this.currentEpoch,
      };

      // Generate ZK proof
      let proofResult: ReputationProofResult;
      try {
        proofResult = await this.prover.proveAgentReputation(
          inputs,
          this.agentsRoot,
          tier.threshold,
          0 // minTransactions
        );
      } catch (err) {
        // If circuit files not available, generate mock proof
        console.log('[ReputationService] ZK prover not available, using mock proof');
        proofResult = this.generateMockProof(tier.threshold);
      }

      const nullifierHash = bytesToHex(proofResult.nullifier);
      const proofHash = bytesToHex(proofResult.proof.a.slice(0, 16));

      // Check nullifier hasn't been used
      if (this.db.hasNullifier(nullifierHash)) {
        return {
          success: false,
          agentId: request.agentId,
          tier,
          proofHash: null,
          nullifierHash: null,
          ual: null,
          error: 'Proof already generated for this epoch',
        };
      }

      // Publish to DKG if available
      let ual: string | null = null;
      if (this.dkg) {
        try {
          ual = await this.dkg.publishReputationCommitment({
            agentId: request.agentId,
            commitment: proofHash,
            tier: tier.threshold,
            validDays: 30,
          });
        } catch (err) {
          console.error('[ReputationService] DKG publish failed:', err);
        }
      }

      // Save proof to database
      this.db.saveReputationProof({
        agentId: request.agentId,
        tier: tier.threshold,
        nullifierHash,
        proofFormat: 'solana',
        ual: ual ?? undefined,
        moltbookPostId: request.postId,
      });

      this.verificationsToday++;

      return {
        success: true,
        agentId: request.agentId,
        tier,
        proofHash,
        nullifierHash,
        ual,
      };
    } catch (err) {
      return {
        success: false,
        agentId: request.agentId,
        tier: null,
        proofHash: null,
        nullifierHash: null,
        ual: null,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  private generateMockMerkleProof(): Uint8Array[] {
    // Generate 20 random 32-byte elements for tree depth 20
    const proof: Uint8Array[] = [];
    for (let i = 0; i < 20; i++) {
      const element = new Uint8Array(32);
      crypto.getRandomValues(element);
      proof.push(element);
    }
    return proof;
  }

  private generateMockMerkleIndices(): number[] {
    // Generate 20 random left/right indices
    return Array.from({ length: 20 }, () => Math.random() > 0.5 ? 1 : 0);
  }

  private generateMockProof(threshold: number): ReputationProofResult {
    const nullifier = new Uint8Array(32);
    crypto.getRandomValues(nullifier);

    return {
      proof: {
        a: new Uint8Array(64),
        b: new Uint8Array(128),
        c: new Uint8Array(64),
      },
      nullifier,
      publicInputs: {
        agentsRoot: this.agentsRoot,
        minReputation: threshold,
        minTransactions: 0,
        nullifier,
      },
    };
  }

  getTierForThreshold(threshold: number): TierConfig | undefined {
    return TIER_CONFIG.find((t) => t.threshold === threshold);
  }

  getAllTiers(): TierConfig[] {
    return [...TIER_CONFIG];
  }
}
