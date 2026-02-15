import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import type {
  IAgentRuntime,
  Service,
  TrustEngineService,
  TrustInteraction,
  KamiyoEventType,
  KamiyoNetwork,
} from '../types';
import { EVIDENCE_MAP, NETWORKS } from '../types';

/** Snapshot of on-chain agent state for diff-based evidence generation */
interface AgentSnapshot {
  stakeAmount: number;
  totalEscrows: number;
  successfulEscrows: number;
  disputedEscrows: number;
  reputation: number;
  isActive: boolean;
  violationCount: number;
  disputesWon: number;
  disputesLost: number;
  syncedAt: number;
}

/**
 * KamiyoTrustEvidenceBridge — the core service bridging KAMIYO on-chain data
 * into plugin-trust's TrustEvidence system.
 *
 * On start: grabs TrustEngine via runtime.getService('trust-engine').
 * On sync: diffs current on-chain state against last snapshot, generates
 * TrustEvidence records for changes, and pushes them via recordInteraction().
 *
 * Gracefully degrades if plugin-trust is not installed.
 */
export class KamiyoTrustEvidenceBridge implements Service {
  name = 'kamiyo-trust-evidence-bridge';
  description = 'Bridges KAMIYO on-chain events to ElizaOS plugin-trust TrustInteraction records';

  private runtime: IAgentRuntime | null = null;
  private trustEngine: TrustEngineService | null = null;
  private recordInteraction: ((interaction: TrustInteraction) => Promise<void>) | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  async start(runtime: IAgentRuntime): Promise<void> {
    this.runtime = runtime;

    await this.attachTrustEngine(runtime);

    // Start periodic sync if configured
    const syncMode = runtime.getSetting('KAMIYO_TRUST_EVIDENCE_SYNC') || 'manual';
    if (syncMode === 'periodic') {
      const interval = parseInt(runtime.getSetting('KAMIYO_TRUST_SYNC_INTERVAL') || '300000', 10);
      this.syncInterval = setInterval(() => this.syncOnChainEvidence().catch(() => {}), interval);
    }
  }

  private async attachTrustEngine(runtime: IAgentRuntime): Promise<void> {
    try {
      const engine = await resolveTrustEngine(runtime);
      if (!engine) return;
      this.trustEngine = engine as TrustEngineService;
      this.recordInteraction = resolveRecordInteraction(engine);
    } catch {
      // plugin-trust not installed — graceful degradation
    }
  }

  async stop(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.runtime = null;
    this.trustEngine = null;
    this.recordInteraction = null;
  }

  /** Whether plugin-trust's TrustEngine is available */
  get hasTrustEngine(): boolean {
    return this.recordInteraction !== null;
  }

  /**
   * Sync on-chain KAMIYO state → TrustInteraction records.
   * Diffs against last snapshot to only record changes.
   *
   * Returns the generated evidence records (useful for actions that want to
   * report what was synced, even without plugin-trust).
   */
  async syncOnChainEvidence(entityId?: string): Promise<TrustInteraction[]> {
    if (!this.runtime) return [];

    const onChain = await this.fetchOnChainState(entityId);
    if (!onChain) return [];

    const stateKey = `kamiyo_trust_snapshot_${onChain.ownerKey}`;
    const previous = (await this.runtime.getState?.(stateKey)) as AgentSnapshot | undefined;
    const current = onChain.snapshot;

    const weight = parseFloat(this.runtime.getSetting('KAMIYO_TRUST_EVIDENCE_WEIGHT') || '1.0');

    const eventCounts = this.diffToEventCounts(previous || null, current);
    const records: TrustInteraction[] = Object.entries(eventCounts)
      .filter(([, count]) => count > 0)
      .map(([event, count]) => {
        const mapping = EVIDENCE_MAP[event as KamiyoEventType];
        const scaled = clampImpact(mapping.impact * weight * Math.min(count, 10));
        return {
          // Align with plugin-trust's semantics: we are recording evidence *about* the entity.
          sourceEntityId: entityId || onChain.ownerKey,
          targetEntityId: this.runtime!.agentId,
          type: mapping.type,
          timestamp: Date.now(),
          impact: Math.round(scaled),
          details: {
            description: mapping.description,
            metadata: {
              source: 'kamiyo-on-chain',
              dimension: mapping.dimension,
              kamiyoEvent: event,
              count,
              stakeSOL: current.stakeAmount / 1e9,
              reputation: current.reputation,
            },
          },
          context: {
            evaluatorId: this.runtime!.agentId,
            source: 'kamiyo-on-chain',
            dimension: mapping.dimension,
            kamiyoEvent: event,
          },
        };
      });

    // Push to TrustEngine if available
    if (this.recordInteraction) {
      for (const record of records) {
        try {
          await this.recordInteraction(record);
        } catch {
          // Individual record failure shouldn't block the rest
        }
      }
    }

    // Save snapshot for next diff
    await this.runtime.setState?.(stateKey, current);

    return records;
  }

  /**
   * Record a single KAMIYO event as a TrustInteraction.
   * Used by evaluators/actions that know exactly what happened.
   */
  async recordEvent(
    event: KamiyoEventType,
    sourceEntityId: string,
    context?: Record<string, unknown>
  ): Promise<TrustInteraction | null> {
    if (!this.runtime) return null;

    const mapping = EVIDENCE_MAP[event];
    const weight = parseFloat(this.runtime.getSetting('KAMIYO_TRUST_EVIDENCE_WEIGHT') || '1.0');

    const record: TrustInteraction = {
      sourceEntityId,
      targetEntityId: this.runtime.agentId,
      type: mapping.type,
      timestamp: Date.now(),
      impact: Math.round(clampImpact(mapping.impact * weight)),
      details: {
        description: mapping.description,
        metadata: {
          source: 'kamiyo-on-chain',
          dimension: mapping.dimension,
          kamiyoEvent: event,
          ...context,
        },
      },
      context: {
        evaluatorId: this.runtime.agentId,
        source: 'kamiyo-on-chain',
        dimension: mapping.dimension,
        kamiyoEvent: event,
      },
    };

    if (this.recordInteraction) {
      try {
        await this.recordInteraction(record);
      } catch {
        // Graceful failure
      }
    }

    return record;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchOnChainState(entityAddress?: string) {
    if (!this.runtime) return null;

    const network = (this.runtime.getSetting('KAMIYO_NETWORK') as KamiyoNetwork) || 'mainnet';
    const { rpcUrl, programId } = NETWORKS[network];

    let ownerKey: PublicKey;
    if (entityAddress) {
      ownerKey = new PublicKey(entityAddress);
    } else {
      const pk = this.runtime.getSetting('SOLANA_PRIVATE_KEY');
      if (!pk) return null;
      try {
        const secret = parseSecretKey(pk);
        if (!secret) return null;
        ownerKey = Keypair.fromSecretKey(secret).publicKey;
      } catch {
        return null;
      }
    }

    try {
      const connection = new Connection(rpcUrl, 'confirmed');
      const { KamiyoClient } = await import('@kamiyo/sdk');

      const wallet: Wallet = {
        publicKey: ownerKey,
        signTransaction: async () => { throw new Error('Read-only'); },
        signAllTransactions: async () => { throw new Error('Read-only'); },
      } as unknown as Wallet;

      const client = new KamiyoClient({
        connection,
        wallet,
        programId: new PublicKey(programId),
      });

      const [agentPda] = client.getAgentPDA(ownerKey);
      const agent = await client.getAgent(agentPda);
      if (!agent) return null;

      // Fetch reputation record
      const [repPda] = client.getReputationPDA(ownerKey);
      const rep = await client.getReputation(repPda).catch(() => null);

      const snapshot: AgentSnapshot = {
        stakeAmount: agent.stakeAmount?.toNumber() || 0,
        totalEscrows: agent.totalEscrows?.toNumber() || 0,
        successfulEscrows: agent.successfulEscrows?.toNumber() || 0,
        disputedEscrows: agent.disputedEscrows?.toNumber() || 0,
        reputation: agent.reputation?.toNumber() || 0,
        isActive: agent.isActive ?? false,
        violationCount: (agent as any).violationCount || 0,
        disputesWon: rep?.disputesWon?.toNumber() || 0,
        disputesLost: rep?.disputesLost?.toNumber() || 0,
        syncedAt: Date.now(),
      };

      return { snapshot, ownerKey: ownerKey.toBase58() };
    } catch {
      return null;
    }
  }

  /**
   * Diff two snapshots to determine which KAMIYO events occurred.
   * Returns event counts to record (aggregated for performance).
   */
  private diffToEventCounts(prev: AgentSnapshot | null, curr: AgentSnapshot): Partial<Record<KamiyoEventType, number>> {
    const counts: Partial<Record<KamiyoEventType, number>> = {};

    if (!prev) {
      // First sync — record agent registration + current state
      counts.agent_registered = 1;
      if (curr.successfulEscrows > 0) counts.escrow_released = Math.min(curr.successfulEscrows, 10);
      if (curr.disputedEscrows > 0) counts.escrow_disputed = Math.min(curr.disputedEscrows, 5);
      if (curr.disputesWon > 0) counts.dispute_won = Math.min(curr.disputesWon, 5);
      if (curr.disputesLost > 0) counts.dispute_lost = Math.min(curr.disputesLost, 5);
      return counts;
    }

    // Diff-based: only record new changes
    const newReleased = curr.successfulEscrows - prev.successfulEscrows;
    if (newReleased > 0) counts.escrow_released = Math.min(newReleased, 20);

    const newDisputed = curr.disputedEscrows - prev.disputedEscrows;
    if (newDisputed > 0) counts.escrow_disputed = Math.min(newDisputed, 20);

    const newWon = curr.disputesWon - prev.disputesWon;
    if (newWon > 0) counts.dispute_won = Math.min(newWon, 20);

    const newLost = curr.disputesLost - prev.disputesLost;
    if (newLost > 0) counts.dispute_lost = Math.min(newLost, 20);

    if (curr.stakeAmount > prev.stakeAmount) {
      counts.stake_increased = 1;
    } else if (curr.stakeAmount < prev.stakeAmount) {
      // Distinguish slash from voluntary decrease
      if (curr.violationCount > prev.violationCount) {
        counts.agent_slashed = 1;
      } else {
        counts.stake_decreased = 1;
      }
    }

    return counts;
  }
}

export const kamiyoTrustEvidenceBridgeService = new KamiyoTrustEvidenceBridge();

function clampImpact(value: number): number {
  if (value > 100) return 100;
  if (value < -100) return -100;
  return value;
}

function parseSecretKey(raw: string): Uint8Array | null {
  const input = raw.trim();

  if (input.startsWith('[')) {
    try {
      const arr = JSON.parse(input) as unknown;
      if (!Array.isArray(arr)) return null;
      const nums = arr.map(n => Number(n));
      if (nums.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return null;
      return Uint8Array.from(nums);
    } catch {
      return null;
    }
  }

  if (input.includes(',')) {
    const parts = input.split(',').map(s => s.trim()).filter(Boolean);
    const nums = parts.map(n => Number(n));
    if (nums.length < 32) return null;
    if (nums.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return null;
    return Uint8Array.from(nums);
  }

  try {
    const buf = Buffer.from(input, 'base64');
    if (buf.length < 32) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function resolveTrustEngine(runtime: IAgentRuntime): Promise<unknown> {
  try {
    const direct = runtime.getService?.('trust-engine');
    if (direct) return direct;
  } catch {
    // ignore
  }

  const load = (runtime as any).getServiceLoadPromise as ((name: string) => Promise<unknown>) | undefined;
  if (!load) return null;

  try {
    return await load('trust-engine');
  } catch {
    return null;
  }
}

function resolveRecordInteraction(engine: unknown): ((interaction: TrustInteraction) => Promise<void>) | null {
  if (!engine || typeof engine !== 'object') return null;

  const direct = (engine as any).recordInteraction;
  if (typeof direct === 'function') return direct.bind(engine);

  const inner = (engine as any).trustEngine?.recordInteraction;
  if (typeof inner === 'function') return inner.bind((engine as any).trustEngine);

  return null;
}
