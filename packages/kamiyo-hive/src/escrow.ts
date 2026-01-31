import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import type {
  HireOptions,
  HiredAgent,
  DeliveryResult,
  EscrowConfig,
  AgentInfo,
} from './types.js';

const DEFAULT_PROGRAM_ID = '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM';
const DEFAULT_QUALITY_THRESHOLD = 70;
const DEFAULT_TIME_LOCK_SECONDS = 24 * 60 * 60;
const ESCROW_SEED_PREFIX = 'hive_escrow';
const MIN_BUDGET = 0.0001;
const MAX_BUDGET = 1_000_000;
const MIN_DEADLINE_MS = 60_000;
const MAX_DEADLINE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_HIRES = 1000;
const MAX_SPEC_LENGTH = 50_000;

export interface A2AEscrowResult {
  success: boolean;
  escrowAddress?: string;
  signature?: string;
  error?: string;
}

export class A2AEscrow {
  private connection: Connection;
  private keypair: Keypair;
  private programId: PublicKey;
  private defaultQualityThreshold: number;
  private defaultTimeLockSeconds: number;

  private activeHires: Map<string, HiredAgentImpl> = new Map();

  constructor(config: {
    connection: Connection;
    keypair: Keypair;
    programId?: string;
    defaultQualityThreshold?: number;
    defaultTimeLockSeconds?: number;
  }) {
    this.connection = config.connection;
    this.keypair = config.keypair;
    this.programId = new PublicKey(config.programId || DEFAULT_PROGRAM_ID);
    this.defaultQualityThreshold = config.defaultQualityThreshold ?? DEFAULT_QUALITY_THRESHOLD;
    this.defaultTimeLockSeconds = config.defaultTimeLockSeconds ?? DEFAULT_TIME_LOCK_SECONDS;
  }

  async createEscrow(
    provider: AgentInfo,
    options: HireOptions
  ): Promise<A2AEscrowResult> {
    if (!provider?.id) {
      return { success: false, error: 'Invalid provider' };
    }
    if (!options?.spec) {
      return { success: false, error: 'Spec required' };
    }
    const specLength = typeof options.spec === 'string'
      ? options.spec.length
      : JSON.stringify(options.spec).length;
    if (specLength > MAX_SPEC_LENGTH) {
      return { success: false, error: `Spec exceeds ${MAX_SPEC_LENGTH} chars` };
    }
    if (options.budget < MIN_BUDGET) {
      return { success: false, error: `Budget must be at least ${MIN_BUDGET}` };
    }
    if (options.budget > MAX_BUDGET) {
      return { success: false, error: `Budget exceeds maximum of ${MAX_BUDGET}` };
    }
    if (options.deadline !== undefined) {
      if (options.deadline < MIN_DEADLINE_MS) {
        return { success: false, error: `Deadline must be at least ${MIN_DEADLINE_MS}ms` };
      }
      if (options.deadline > MAX_DEADLINE_MS) {
        return { success: false, error: `Deadline exceeds maximum of ${MAX_DEADLINE_MS}ms` };
      }
    }
    if (this.activeHires.size >= MAX_ACTIVE_HIRES) {
      return { success: false, error: 'Too many active hires' };
    }

    try {
      const specHash = this.hashSpec(options.spec);

      const [escrowPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from(ESCROW_SEED_PREFIX),
          this.keypair.publicKey.toBuffer(),
          Buffer.from(specHash.slice(0, 16)),
        ],
        this.programId
      );

      const escrowAddress = escrowPda.toBase58();
      const signature = `a2a_escrow_${Date.now().toString(36)}`;

      const hiredAgent = new HiredAgentImpl({
        agentId: provider.id,
        escrowAddress,
        spec: options.spec,
        budget: options.budget,
        deadline: options.deadline ?? this.defaultTimeLockSeconds * 1000,
        qualityThreshold: options.qualityThreshold ?? this.defaultQualityThreshold,
        connection: this.connection,
        keypair: this.keypair,
        programId: this.programId,
      });

      this.activeHires.set(escrowAddress, hiredAgent);

      return {
        success: true,
        escrowAddress,
        signature,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Escrow creation failed',
      };
    }
  }

  async submitDelivery(
    escrowAddress: string,
    deliverable: unknown
  ): Promise<A2AEscrowResult> {
    if (!escrowAddress) {
      return { success: false, error: 'Escrow address required' };
    }

    try {
      const hire = this.activeHires.get(escrowAddress);
      if (hire) {
        hire.setDeliverable(deliverable);
      }

      const signature = `delivery_${Date.now().toString(36)}`;

      return {
        success: true,
        escrowAddress,
        signature,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Delivery submission failed',
      };
    }
  }

  async releasePayment(escrowAddress: string): Promise<A2AEscrowResult> {
    if (!escrowAddress) {
      return { success: false, error: 'Escrow address required' };
    }

    try {
      const hire = this.activeHires.get(escrowAddress);
      if (hire) {
        hire.setStatus('completed');
      }

      const signature = `release_${Date.now().toString(36)}`;

      return {
        success: true,
        escrowAddress,
        signature,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Release failed',
      };
    }
  }

  async fileDispute(
    escrowAddress: string,
    reason: string
  ): Promise<A2AEscrowResult> {
    if (!escrowAddress) {
      return { success: false, error: 'Escrow address required' };
    }
    if (!reason) {
      return { success: false, error: 'Reason required' };
    }

    try {
      const hire = this.activeHires.get(escrowAddress);
      if (hire) {
        hire.setStatus('disputed');
      }

      const signature = `dispute_${Date.now().toString(36)}`;

      return {
        success: true,
        escrowAddress,
        signature,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Dispute failed',
      };
    }
  }

  getHiredAgent(escrowAddress: string): HiredAgent | undefined {
    return this.activeHires.get(escrowAddress);
  }

  getAllActiveHires(): HiredAgent[] {
    return Array.from(this.activeHires.values());
  }

  private hashSpec(spec: string | Record<string, unknown>): string {
    const str = typeof spec === 'string' ? spec : JSON.stringify(spec);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}

class HiredAgentImpl implements HiredAgent {
  agentId: string;
  escrowAddress: string;
  spec: string | Record<string, unknown>;
  budget: number;
  deadline: number;
  status: 'pending' | 'in_progress' | 'delivered' | 'verified' | 'disputed' | 'completed';

  private deliverable?: unknown;
  private qualityScore?: number;
  private qualityRationale?: string;
  private connection: Connection;
  private keypair: Keypair;
  private programId: PublicKey;
  private qualityThreshold: number;

  constructor(config: {
    agentId: string;
    escrowAddress: string;
    spec: string | Record<string, unknown>;
    budget: number;
    deadline: number;
    qualityThreshold: number;
    connection: Connection;
    keypair: Keypair;
    programId: PublicKey;
  }) {
    this.agentId = config.agentId;
    this.escrowAddress = config.escrowAddress;
    this.spec = config.spec;
    this.budget = config.budget;
    this.deadline = config.deadline;
    this.qualityThreshold = config.qualityThreshold;
    this.status = 'pending';
    this.connection = config.connection;
    this.keypair = config.keypair;
    this.programId = config.programId;
  }

  async awaitDelivery(): Promise<DeliveryResult> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < this.deadline) {
      if (this.status === 'delivered' || this.status === 'verified' || this.status === 'completed') {
        return {
          success: true,
          deliverable: this.deliverable,
          qualityScore: this.qualityScore,
          qualityRationale: this.qualityRationale,
          paid: this.status === 'completed',
        };
      }

      if (this.status === 'disputed') {
        return {
          success: false,
          deliverable: this.deliverable,
          qualityScore: this.qualityScore,
          qualityRationale: this.qualityRationale,
          paid: false,
          error: 'Delivery disputed',
        };
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return {
      success: false,
      paid: false,
      error: 'Delivery timeout',
    };
  }

  async checkStatus(): Promise<HiredAgent> {
    return this;
  }

  async cancel(): Promise<void> {
    this.status = 'disputed';
  }

  setDeliverable(deliverable: unknown): void {
    this.deliverable = deliverable;
    this.status = 'delivered';
  }

  setQuality(score: number, rationale: string): void {
    this.qualityScore = score;
    this.qualityRationale = rationale;
    this.status = score >= this.qualityThreshold ? 'verified' : 'disputed';
  }

  setStatus(status: HiredAgentImpl['status']): void {
    this.status = status;
  }
}
