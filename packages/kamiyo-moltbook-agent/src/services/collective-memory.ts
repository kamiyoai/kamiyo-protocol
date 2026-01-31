import type { JobDatabase } from '../db.js';
import type { DKGPublisher } from './dkg-publisher.js';

export interface MemoryEvent {
  id: number;
  eventType: MemoryEventType;
  agentId: string;
  data: Record<string, unknown>;
  ual: string | null;
  createdAt: number;
  syncedAt: number | null;
}

export type MemoryEventType =
  | 'reputation_verified'
  | 'trust_edge_created'
  | 'badge_issued'
  | 'job_completed'
  | 'escrow_released'
  | 'dispute_resolved';

export interface CollectiveMemoryConfig {
  db: JobDatabase;
  dkg?: DKGPublisher;
  batchSize: number;
  syncIntervalMs: number;
}

export interface MemoryQuery {
  eventType?: MemoryEventType;
  agentId?: string;
  since?: number;
  limit?: number;
}

export interface MemoryStats {
  totalEvents: number;
  syncedEvents: number;
  pendingSync: number;
  byType: Record<MemoryEventType, number>;
}

export class CollectiveMemory {
  private db: JobDatabase;
  private dkg?: DKGPublisher;
  private batchSize: number;
  private syncIntervalMs: number;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  // In-memory event buffer for fast queries
  private eventBuffer: MemoryEvent[] = [];
  private nextId = 1;

  constructor(config: CollectiveMemoryConfig) {
    this.db = config.db;
    this.dkg = config.dkg;
    this.batchSize = config.batchSize;
    this.syncIntervalMs = config.syncIntervalMs;
  }

  recordEvent(
    eventType: MemoryEventType,
    agentId: string,
    data: Record<string, unknown>
  ): number {
    // Validate inputs
    if (!agentId || agentId.length > 100) {
      throw new Error('Invalid agent ID');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
      throw new Error('Agent ID must be alphanumeric');
    }

    // Sanitize data - limit depth and size
    const sanitizedData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key.length <= 50 && typeof value !== 'function') {
        sanitizedData[key] = typeof value === 'string' ? value.slice(0, 1000) : value;
      }
    }

    const event: MemoryEvent = {
      id: this.nextId++,
      eventType,
      agentId,
      data: sanitizedData,
      ual: null,
      createdAt: Date.now(),
      syncedAt: null,
    };

    this.eventBuffer.push(event);

    // Keep buffer bounded
    if (this.eventBuffer.length > 10000) {
      this.eventBuffer = this.eventBuffer.slice(-5000);
    }

    return event.id;
  }

  recordVerification(
    agentId: string,
    tier: string,
    proofHash: string
  ): number {
    return this.recordEvent('reputation_verified', agentId, {
      tier,
      proofHash,
      timestamp: Date.now(),
    });
  }

  recordTrustEdge(
    fromAgent: string,
    toAgent: string,
    trustLevel: number
  ): number {
    return this.recordEvent('trust_edge_created', fromAgent, {
      toAgent,
      trustLevel,
      timestamp: Date.now(),
    });
  }

  recordBadge(
    agentId: string,
    badgeType: string,
    tier: number
  ): number {
    return this.recordEvent('badge_issued', agentId, {
      badgeType,
      tier,
      timestamp: Date.now(),
    });
  }

  recordJobCompletion(
    buyerId: string,
    sellerId: string,
    amount: number,
    qualityScore: number
  ): number {
    return this.recordEvent('job_completed', sellerId, {
      buyerId,
      amount,
      qualityScore,
      timestamp: Date.now(),
    });
  }

  recordEscrowRelease(
    agentId: string,
    escrowAddress: string,
    amount: number
  ): number {
    return this.recordEvent('escrow_released', agentId, {
      escrowAddress,
      amount,
      timestamp: Date.now(),
    });
  }

  recordDisputeResolution(
    agentId: string,
    escrowId: string,
    outcome: string,
    refundPercentage: number
  ): number {
    return this.recordEvent('dispute_resolved', agentId, {
      escrowId,
      outcome,
      refundPercentage,
      timestamp: Date.now(),
    });
  }

  queryEvents(query: MemoryQuery): MemoryEvent[] {
    let results = this.eventBuffer;

    if (query.eventType) {
      results = results.filter((e) => e.eventType === query.eventType);
    }

    if (query.agentId) {
      results = results.filter((e) => e.agentId === query.agentId);
    }

    if (query.since) {
      results = results.filter((e) => e.createdAt >= query.since!);
    }

    // Sort by most recent first
    results = results.sort((a, b) => b.createdAt - a.createdAt);

    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  getAgentHistory(agentId: string, limit = 50): MemoryEvent[] {
    return this.queryEvents({ agentId, limit });
  }

  getRecentEvents(limit = 100): MemoryEvent[] {
    return this.queryEvents({ limit });
  }

  getEventsByType(eventType: MemoryEventType, limit = 50): MemoryEvent[] {
    return this.queryEvents({ eventType, limit });
  }

  getPendingSyncEvents(): MemoryEvent[] {
    return this.eventBuffer.filter((e) => e.syncedAt === null);
  }

  getStats(): MemoryStats {
    const byType: Record<MemoryEventType, number> = {
      reputation_verified: 0,
      trust_edge_created: 0,
      badge_issued: 0,
      job_completed: 0,
      escrow_released: 0,
      dispute_resolved: 0,
    };

    for (const event of this.eventBuffer) {
      byType[event.eventType]++;
    }

    const synced = this.eventBuffer.filter((e) => e.syncedAt !== null).length;

    return {
      totalEvents: this.eventBuffer.length,
      syncedEvents: synced,
      pendingSync: this.eventBuffer.length - synced,
      byType,
    };
  }

  async syncToDKG(): Promise<{ synced: number; failed: number }> {
    if (!this.dkg) {
      return { synced: 0, failed: 0 };
    }

    const pending = this.getPendingSyncEvents().slice(0, this.batchSize);
    let synced = 0;
    let failed = 0;

    for (const event of pending) {
      try {
        const ual = await this.publishEventToDKG(event);
        if (ual) {
          event.ual = ual;
          event.syncedAt = Date.now();
          synced++;
        } else {
          failed++;
        }
      } catch (err) {
        console.error(`[CollectiveMemory] Sync failed for event ${event.id}:`, err);
        failed++;
      }
    }

    return { synced, failed };
  }

  private async publishEventToDKG(event: MemoryEvent): Promise<string | null> {
    if (!this.dkg) return null;

    switch (event.eventType) {
      case 'reputation_verified':
        return this.dkg.publishVerificationAttestation({
          agentId: event.agentId,
          agentHandle: event.agentId,
          tier: String(event.data.tier),
          proofHash: String(event.data.proofHash),
        });

      case 'trust_edge_created':
        return this.dkg.publishTrustEdge({
          trustorId: event.agentId,
          trusteeId: String(event.data.toAgent),
          trustLevel: Number(event.data.trustLevel) || 50,
          trustType: 'endorses',
          stakeAmount: 0,
        });

      case 'badge_issued':
        return this.dkg.publishBadge({
          agentId: event.agentId,
          badgeType: String(event.data.badgeType),
          tier: Number(event.data.tier) || 0,
          badgeId: `${event.agentId}-${event.data.badgeType}-${event.createdAt}`,
        });

      case 'job_completed':
        return this.dkg.publishTransactionRecord({
          buyerId: String(event.data.buyerId),
          sellerId: event.agentId,
          amount: Number(event.data.amount) || 0,
          currency: 'SOL',
          qualityScore: Number(event.data.qualityScore) || 0,
          escrowAddress: String(event.data.escrowAddress || 'unknown'),
        });

      default:
        // Other event types don't have specific DKG publishers yet
        return null;
    }
  }

  startAutoSync(): void {
    if (this.syncTimer) return;

    this.syncTimer = setInterval(async () => {
      const result = await this.syncToDKG();
      if (result.synced > 0 || result.failed > 0) {
        console.log(`[CollectiveMemory] Synced ${result.synced}, failed ${result.failed}`);
      }
    }, this.syncIntervalMs);
  }

  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  formatEventSummary(event: MemoryEvent): string {
    const date = new Date(event.createdAt).toISOString().split('T')[0];

    switch (event.eventType) {
      case 'reputation_verified':
        return `[${date}] @${event.agentId} verified as ${event.data.tier} tier`;
      case 'trust_edge_created':
        return `[${date}] @${event.agentId} trusts @${event.data.toAgent} (${event.data.trustLevel}%)`;
      case 'badge_issued':
        return `[${date}] @${event.agentId} earned ${event.data.badgeType} badge (tier ${event.data.tier})`;
      case 'job_completed':
        return `[${date}] @${event.agentId} completed job for @${event.data.buyerId} (${event.data.amount} SOL, ${event.data.qualityScore}/100)`;
      case 'escrow_released':
        return `[${date}] Escrow released to @${event.agentId} (${event.data.amount} SOL)`;
      case 'dispute_resolved':
        return `[${date}] Dispute resolved for @${event.agentId}: ${event.data.outcome}`;
      default:
        return `[${date}] ${event.eventType} for @${event.agentId}`;
    }
  }

  formatAgentTimeline(agentId: string, limit = 10): string {
    const events = this.getAgentHistory(agentId, limit);

    if (events.length === 0) {
      return `No recorded events for @${agentId}`;
    }

    const lines = events.map((e) => this.formatEventSummary(e));
    return `## Timeline for @${agentId}\n\n${lines.join('\n')}`;
  }
}
