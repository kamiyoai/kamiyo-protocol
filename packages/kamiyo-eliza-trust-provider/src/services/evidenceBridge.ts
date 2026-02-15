import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import type {
  IAgentRuntime,
  Service,
  TrustEngineService,
  TrustEvidenceRecord,
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
  description = 'Bridges KAMIYO on-chain events to ElizaOS plugin-trust TrustEvidence records';

  private runtime: IAgentRuntime | null = null;
  private trustEngine: TrustEngineService | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  async start(runtime: IAgentRuntime): Promise<void> {
    this.runtime = runtime;

    // Try to grab plugin-trust's TrustEngine service
    try {
      const engine = runtime.getService?.('trust-engine');
      if (engine && typeof (engine as any).recordInteraction === 'function') {
        this.trustEngine = engine as TrustEngineService;
      }
    } catch {
      // plugin-trust not installed — graceful degradation
    }

    // Start periodic sync if configured
    const syncMode = runtime.getSetting('KAMIYO_TRUST_EVIDENCE_SYNC') || 'manual';
    if (syncMode === 'periodic') {
      const interval = parseInt(runtime.getSetting('KAMIYO_TRUST_SYNC_INTERVAL') || '300000', 10);
      this.syncInterval = setInterval(() => this.syncOnChainEvidence().catch(() => {}), interval);
    }
  }

  async stop(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.runtime = null;
    this.trustEngine = null;
  }

  /** Whether plugin-trust's TrustEngine is available */
  get hasTrustEngine(): boolean {
    return this.trustEngine !== null;
  }

  /**
   * Sync on-chain KAMIYO state → TrustEvidence records.
   * Diffs against last snapshot to only record changes.
   *
   * Returns the generated evidence records (useful for actions that want to
   * report what was synced, even without plugin-trust).
   */
  async syncOnChainEvidence(entityId?: string): Promise<TrustEvidenceRecord[]> {
    if (!this.runtime) return [];

    const onChain = await this.fetchOnChainState(entityId);
    if (!onChain) return [];

    const stateKey = `kamiyo_trust_snapshot_${onChain.ownerKey}`;
    const previous = (await this.runtime.getState?.(stateKey)) as AgentSnapshot | undefined;
    const current = onChain.snapshot;

    const events = this.diffToEvents(previous || null, current);
    const weight = parseFloat(this.runtime.getSetting('KAMIYO_TRUST_EVIDENCE_WEIGHT') || '1.0');

    const records: TrustEvidenceRecord[] = events.map(event => {
      const mapping = EVIDENCE_MAP[event];
      return {
        sourceEntityId: this.runtime!.agentId,
        targetEntityId: entityId || onChain.ownerKey,
        type: mapping.type,
        impact: Math.round(mapping.impact * weight),
        weight: 1,
        description: mapping.description,
        verified: true, // on-chain data is inherently verifiable
        context: {
          source: 'kamiyo-on-chain',
          dimension: mapping.dimension,
          kamiyoEvent: event,
          stakeSOL: current.stakeAmount / 1e9,
          reputation: current.reputation,
        },
      };
    });

    // Push to TrustEngine if available
    if (this.trustEngine) {
      for (const record of records) {
        try {
          await this.trustEngine.recordInteraction(record);
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
   * Record a single KAMIYO event as TrustEvidence.
   * Used by evaluators/actions that know exactly what happened.
   */
  async recordEvent(
    event: KamiyoEventType,
    targetEntityId: string,
    context?: Record<string, unknown>
  ): Promise<TrustEvidenceRecord | null> {
    if (!this.runtime) return null;

    const mapping = EVIDENCE_MAP[event];
    const weight = parseFloat(this.runtime.getSetting('KAMIYO_TRUST_EVIDENCE_WEIGHT') || '1.0');

    const record: TrustEvidenceRecord = {
      sourceEntityId: this.runtime.agentId,
      targetEntityId,
      type: mapping.type,
      impact: Math.round(mapping.impact * weight),
      weight: 1,
      description: mapping.description,
      verified: true,
      context: {
        source: 'kamiyo-on-chain',
        dimension: mapping.dimension,
        kamiyoEvent: event,
        ...context,
      },
    };

    if (this.trustEngine) {
      try {
        await this.trustEngine.recordInteraction(record);
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
        ownerKey = Keypair.fromSecretKey(Buffer.from(pk, 'base64')).publicKey;
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
   * Returns array of event types to record.
   */
  private diffToEvents(prev: AgentSnapshot | null, curr: AgentSnapshot): KamiyoEventType[] {
    const events: KamiyoEventType[] = [];

    if (!prev) {
      // First sync — record agent registration + current state
      events.push('agent_registered');
      if (curr.successfulEscrows > 0) {
        for (let i = 0; i < Math.min(curr.successfulEscrows, 10); i++) {
          events.push('escrow_released');
        }
      }
      if (curr.disputedEscrows > 0) {
        for (let i = 0; i < Math.min(curr.disputedEscrows, 5); i++) {
          events.push('escrow_disputed');
        }
      }
      if (curr.disputesWon > 0) {
        for (let i = 0; i < Math.min(curr.disputesWon, 5); i++) {
          events.push('dispute_won');
        }
      }
      if (curr.disputesLost > 0) {
        for (let i = 0; i < Math.min(curr.disputesLost, 5); i++) {
          events.push('dispute_lost');
        }
      }
      return events;
    }

    // Diff-based: only record new changes
    const newReleased = curr.successfulEscrows - prev.successfulEscrows;
    for (let i = 0; i < Math.max(0, newReleased); i++) {
      events.push('escrow_released');
    }

    const newDisputed = curr.disputedEscrows - prev.disputedEscrows;
    for (let i = 0; i < Math.max(0, newDisputed); i++) {
      events.push('escrow_disputed');
    }

    const newWon = curr.disputesWon - prev.disputesWon;
    for (let i = 0; i < Math.max(0, newWon); i++) {
      events.push('dispute_won');
    }

    const newLost = curr.disputesLost - prev.disputesLost;
    for (let i = 0; i < Math.max(0, newLost); i++) {
      events.push('dispute_lost');
    }

    if (curr.stakeAmount > prev.stakeAmount) {
      events.push('stake_increased');
    } else if (curr.stakeAmount < prev.stakeAmount) {
      // Distinguish slash from voluntary decrease
      if (curr.violationCount > prev.violationCount) {
        events.push('agent_slashed');
      } else {
        events.push('stake_decreased');
      }
    }

    return events;
  }
}

export const kamiyoTrustEvidenceBridgeService = new KamiyoTrustEvidenceBridge();
