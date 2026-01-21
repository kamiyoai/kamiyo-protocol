/**
 * PayAI Reputation Network Adapter
 *
 * Bridges Kamiyo ZK reputation proofs to PayAI ecosystem (Freelance AI, Bazaar, CT Agent).
 * Tracks reputation from escrow outcomes with cross-platform portability.
 */

import type { ReputationProofData, ReputationHeaders, ParsedReputationHeaders } from './reputation-extension';
import {
  encodeReputationHeaders,
  parseReputationHeaders,
  decodeReputationProof,
  DEFAULT_TIERS,
  getTierForThreshold,
  calculateReputationPrice,
} from './reputation-extension';

// Re-export for convenience
export { DEFAULT_TIERS, getTierForThreshold, calculateReputationPrice };

/**
 * Reputation sources in PayAI ecosystem.
 */
export enum ReputationSource {
  FreelanceAI = 'freelance_ai',
  Bazaar = 'bazaar',
  CTAgent = 'ct_agent',
  Direct = 'direct', // Direct Kamiyo escrows
}

/**
 * Escrow outcome affecting reputation.
 */
export enum EscrowOutcome {
  Released = 'released',        // Clean release, +rep for provider
  DisputeWonAgent = 'dispute_won_agent',     // Agent won dispute, -rep for provider
  DisputeWonProvider = 'dispute_won_provider', // Provider won, -rep for agent (frivolous)
  DisputePartial = 'dispute_partial',   // Partial refund, neutral
  Expired = 'expired',          // Timelock expired, -rep for provider
}

/**
 * Reputation delta calculation based on escrow outcome.
 */
export interface ReputationDelta {
  agentDelta: number;
  providerDelta: number;
  reason: string;
}

/**
 * Calculate reputation change from escrow outcome.
 *
 * Rules:
 * - Clean release: +5 provider, +1 agent
 * - Agent wins dispute (quality < 50): -10 provider
 * - Provider wins dispute (quality > 80): -5 agent (frivolous dispute)
 * - Partial dispute: neutral
 * - Expired: -3 provider
 */
export function calculateReputationDelta(
  outcome: EscrowOutcome,
  qualityScore?: number
): ReputationDelta {
  switch (outcome) {
    case EscrowOutcome.Released:
      return {
        agentDelta: 1,
        providerDelta: 5,
        reason: 'Clean escrow release',
      };

    case EscrowOutcome.DisputeWonAgent:
      return {
        agentDelta: 0,
        providerDelta: -10,
        reason: `Dispute lost by provider (quality: ${qualityScore ?? 'N/A'})`,
      };

    case EscrowOutcome.DisputeWonProvider:
      return {
        agentDelta: -5,
        providerDelta: 2,
        reason: 'Frivolous dispute by agent',
      };

    case EscrowOutcome.DisputePartial:
      return {
        agentDelta: 0,
        providerDelta: -2,
        reason: `Partial dispute resolution (quality: ${qualityScore ?? 'N/A'})`,
      };

    case EscrowOutcome.Expired:
      return {
        agentDelta: 0,
        providerDelta: -3,
        reason: 'Escrow timelock expired',
      };
  }
}

/**
 * Local reputation store.
 * Tracks accumulated reputation across PayAI ecosystem.
 * Production: sync with on-chain state.
 */
export interface ReputationRecord {
  publicKey: string;
  score: number;
  totalEscrows: number;
  successfulEscrows: number;
  disputedEscrows: number;
  sources: Map<ReputationSource, number>;
  lastUpdated: number;
  commitment?: string;
  secret?: bigint;
}

/**
 * Reputation tracker for PayAI ecosystem.
 */
export class PayAIReputationTracker {
  private records = new Map<string, ReputationRecord>();

  /**
   * Get or create reputation record for an agent.
   */
  getRecord(publicKey: string): ReputationRecord {
    let record = this.records.get(publicKey);
    if (!record) {
      record = {
        publicKey,
        score: 50, // Start at neutral
        totalEscrows: 0,
        successfulEscrows: 0,
        disputedEscrows: 0,
        sources: new Map(),
        lastUpdated: Date.now(),
      };
      this.records.set(publicKey, record);
    }
    return record;
  }

  /**
   * Update reputation based on escrow outcome.
   */
  updateReputation(
    publicKey: string,
    outcome: EscrowOutcome,
    source: ReputationSource,
    qualityScore?: number
  ): ReputationRecord {
    const record = this.getRecord(publicKey);
    const delta = calculateReputationDelta(outcome, qualityScore);

    // Determine if this agent is provider or consumer
    // For simplicity, assume publicKey is provider for now
    const scoreDelta = delta.providerDelta;

    record.score = Math.max(0, Math.min(100, record.score + scoreDelta));
    record.totalEscrows++;

    if (outcome === EscrowOutcome.Released) {
      record.successfulEscrows++;
    } else if (
      outcome === EscrowOutcome.DisputeWonAgent ||
      outcome === EscrowOutcome.DisputeWonProvider ||
      outcome === EscrowOutcome.DisputePartial
    ) {
      record.disputedEscrows++;
    }

    // Track source contribution
    const sourceScore = record.sources.get(source) || 0;
    record.sources.set(source, sourceScore + scoreDelta);

    record.lastUpdated = Date.now();
    return record;
  }

  /**
   * Get success rate as percentage.
   */
  getSuccessRate(publicKey: string): number {
    const record = this.getRecord(publicKey);
    if (record.totalEscrows === 0) return 50;
    return Math.round((record.successfulEscrows / record.totalEscrows) * 100);
  }

  /**
   * Get combined score across sources.
   */
  getCombinedScore(publicKey: string): number {
    return this.getRecord(publicKey).score;
  }

  /**
   * Serialize for storage.
   */
  serialize(): string {
    const data: Array<[string, Omit<ReputationRecord, 'sources'> & { sources: Array<[string, number]> }]> = [];
    for (const [key, record] of this.records) {
      data.push([key, {
        ...record,
        sources: Array.from(record.sources.entries()),
      }]);
    }
    return JSON.stringify(data);
  }

  /**
   * Deserialize from storage.
   */
  static deserialize(json: string): PayAIReputationTracker {
    const tracker = new PayAIReputationTracker();
    const data = JSON.parse(json) as Array<[string, Omit<ReputationRecord, 'sources'> & { sources: Array<[string, number]> }]>;
    for (const [key, record] of data) {
      tracker.records.set(key, {
        ...record,
        sources: new Map(record.sources as Array<[ReputationSource, number]>),
      });
    }
    return tracker;
  }
}

/**
 * PayAI x402 reputation middleware integration.
 * Wraps reputation headers for PayAI-specific use cases.
 */
export interface PayAIReputationConfig {
  /** Minimum reputation for access */
  minThreshold?: number;
  /** Source to record transactions under */
  source: ReputationSource;
  /** Reputation tracker instance */
  tracker?: PayAIReputationTracker;
  /** Whether to require proof for all requests */
  requireProof?: boolean;
}

/**
 * Create PayAI-specific reputation headers.
 * Includes source information for cross-platform tracking.
 */
export function createPayAIReputationHeaders(
  proof: ReputationProofData,
  source: ReputationSource
): ReputationHeaders & { 'X-PayAI-Reputation-Source': string } {
  const baseHeaders = encodeReputationHeaders(proof);
  return {
    ...baseHeaders,
    'X-PayAI-Reputation-Source': source,
  };
}

/**
 * Parse PayAI reputation headers including source.
 */
export function parsePayAIReputationHeaders(
  headers: Record<string, string | string[] | undefined>
): (ParsedReputationHeaders & { source?: ReputationSource }) | null {
  const base = parseReputationHeaders(headers);
  if (!base) return null;

  const source = headers['X-PayAI-Reputation-Source'] || headers['x-payai-reputation-source'];
  const sourceStr = Array.isArray(source) ? source[0] : source;

  return {
    ...base,
    source: sourceStr as ReputationSource | undefined,
  };
}

/**
 * Verify reputation meets PayAI requirements.
 */
export function verifyPayAIReputation(
  headers: Record<string, string | string[] | undefined>,
  config: PayAIReputationConfig
): { valid: boolean; threshold?: number; source?: ReputationSource; reason?: string } {
  const parsed = parsePayAIReputationHeaders(headers);

  if (!parsed) {
    if (config.requireProof) {
      return { valid: false, reason: 'Reputation proof required' };
    }
    return { valid: true };
  }

  if (config.minThreshold && parsed.threshold < config.minThreshold) {
    return {
      valid: false,
      threshold: parsed.threshold,
      source: parsed.source,
      reason: `Reputation ${parsed.threshold} below required ${config.minThreshold}`,
    };
  }

  return {
    valid: true,
    threshold: parsed.threshold,
    source: parsed.source,
  };
}

/**
 * Calculate price with PayAI reputation discount.
 */
export function calculatePayAIPrice(
  basePrice: number,
  threshold: number | null,
  source?: ReputationSource
): {
  price: number;
  discount: number;
  tier: string;
  creditLimit?: number;
} {
  if (threshold === null) {
    return {
      price: basePrice,
      discount: 0,
      tier: 'untrusted',
      creditLimit: 0,
    };
  }

  const result = calculateReputationPrice(basePrice, threshold, DEFAULT_TIERS);

  // Bonus discount for cross-platform reputation
  let bonusDiscount = 0;
  if (source === ReputationSource.FreelanceAI && threshold >= 70) {
    bonusDiscount = basePrice * 0.02; // Extra 2% for Freelance AI veterans
  }

  return {
    price: result.price - bonusDiscount,
    discount: result.discount + bonusDiscount,
    tier: result.tier.name,
    creditLimit: result.tier.creditLimit,
  };
}

/**
 * Build 402 response for PayAI with full pricing breakdown.
 */
export function buildPayAI402Response(
  basePrice: number,
  agentThreshold: number | null,
  source?: ReputationSource
): {
  x402Version: 1;
  basePrice: number;
  yourPrice: number;
  yourTier: string;
  yourDiscount: number;
  source?: string;
  creditLimit?: number;
  tiers: Array<{ name: string; minThreshold: number; price: number; discountPercent: number }>;
  ecosystem: 'payai';
  supportedSources: string[];
} {
  const pricing = calculatePayAIPrice(basePrice, agentThreshold, source);

  return {
    x402Version: 1,
    basePrice,
    yourPrice: pricing.price,
    yourTier: pricing.tier,
    yourDiscount: pricing.discount,
    source,
    creditLimit: pricing.creditLimit,
    tiers: DEFAULT_TIERS.map((t) => ({
      name: t.name,
      minThreshold: t.minThreshold,
      price: basePrice * (1 - t.discountPercent / 100),
      discountPercent: t.discountPercent,
    })),
    ecosystem: 'payai',
    supportedSources: Object.values(ReputationSource),
  };
}

/**
 * Express middleware for PayAI reputation-gated endpoints.
 */
export function payaiReputationMiddleware(config: PayAIReputationConfig) {
  return async (
    req: { headers: Record<string, string | string[] | undefined> },
    res: { status: (code: number) => { json: (body: unknown) => void }; setHeader: (k: string, v: string) => void },
    next: () => void
  ): Promise<void> => {
    const result = verifyPayAIReputation(req.headers, config);

    if (!result.valid) {
      res.setHeader('X-402-Reputation-Required', 'true');
      res.setHeader('X-402-Reputation-Min-Threshold', String(config.minThreshold || 0));
      res.setHeader('X-PayAI-Reputation-Source', config.source);
      res.status(402).json({
        error: 'Reputation requirement not met',
        reason: result.reason,
        ecosystem: 'payai',
        source: config.source,
        minThreshold: config.minThreshold,
      });
      return;
    }

    // TODO: Track active interactions when config.tracker provided.
    // Actual reputation update happens after escrow resolution via updateReputation().

    next();
  };
}

/**
 * Aggregate reputation across multiple sources.
 * Weighted average based on transaction volume.
 */
export function aggregateReputation(
  records: Array<{ source: ReputationSource; score: number; weight: number }>
): number {
  if (records.length === 0) return 50;

  let totalWeight = 0;
  let weightedSum = 0;

  for (const record of records) {
    weightedSum += record.score * record.weight;
    totalWeight += record.weight;
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;
}
