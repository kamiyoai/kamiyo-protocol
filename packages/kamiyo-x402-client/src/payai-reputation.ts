import type { ReputationProofData, DynamicCreditTracker } from './reputation-extension';
import {
  buildReputationPayload,
  checkReputationRequirement,
  DEFAULT_TIERS,
  getTierForThreshold,
  calculateReputationPrice,
} from './reputation-extension';
import type { KamiyoReputationPayload, ExtensionDeclaration } from './v2/types';

export { DEFAULT_TIERS, getTierForThreshold, calculateReputationPrice };

export enum ReputationSource {
  FreelanceAI = 'freelance_ai',
  Bazaar = 'bazaar',
  CTAgent = 'ct_agent',
  Direct = 'direct',
}

export enum EscrowOutcome {
  Released = 'released',
  DisputeWonAgent = 'dispute_won_agent',
  DisputeWonProvider = 'dispute_won_provider',
  DisputePartial = 'dispute_partial',
  Expired = 'expired',
}

export interface ReputationDelta {
  agentDelta: number;
  providerDelta: number;
  reason: string;
}

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

export class PayAIReputationTracker {
  private records = new Map<string, ReputationRecord>();
  private creditTracker: DynamicCreditTracker | null = null;

  linkCreditTracker(tracker: DynamicCreditTracker): void {
    this.creditTracker = tracker;
  }

  getRecord(publicKey: string): ReputationRecord {
    let record = this.records.get(publicKey);
    if (!record) {
      record = {
        publicKey,
        score: 50,
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

  async updateReputation(
    publicKey: string,
    outcome: EscrowOutcome,
    source: ReputationSource,
    qualityScore?: number
  ): Promise<ReputationRecord> {
    const record = this.getRecord(publicKey);
    const delta = calculateReputationDelta(outcome, qualityScore);
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

    const sourceScore = record.sources.get(source) || 0;
    record.sources.set(source, sourceScore + scoreDelta);

    record.lastUpdated = Date.now();

    if (this.creditTracker && record.commitment) {
      let creditOutcome: 'released' | 'dispute_won' | 'dispute_lost';
      if (outcome === EscrowOutcome.Released) {
        creditOutcome = 'released';
      } else if (outcome === EscrowOutcome.DisputeWonAgent) {
        creditOutcome = 'dispute_won';
      } else {
        creditOutcome = 'dispute_lost';
      }
      await this.creditTracker.recordEscrowOutcome(record.commitment, creditOutcome, qualityScore);
    }

    return record;
  }

  getSuccessRate(publicKey: string): number {
    const record = this.getRecord(publicKey);
    if (record.totalEscrows === 0) return 50;
    return Math.round((record.successfulEscrows / record.totalEscrows) * 100);
  }

  getCombinedScore(publicKey: string): number {
    return this.getRecord(publicKey).score;
  }

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

export function createPayAIReputationPayload(
  proof: ReputationProofData,
  source: ReputationSource
): { extensions: Record<string, ExtensionDeclaration>; source: string } {
  const payload = buildReputationPayload(proof);
  return {
    extensions: payload,
    source,
  };
}

export interface PayAIReputationConfig {
  minThreshold?: number;
  source: ReputationSource;
  tracker?: PayAIReputationTracker;
  requireProof?: boolean;
}

export function verifyPayAIReputation(
  extensions: Record<string, unknown> | undefined,
  config: PayAIReputationConfig
): { valid: boolean; threshold?: number; source?: ReputationSource; reason?: string } {
  const result = checkReputationRequirement(extensions, {
    minThreshold: config.minThreshold || 0,
    required: config.requireProof ?? false,
  });

  return {
    valid: result.valid,
    threshold: result.threshold,
    source: config.source,
    reason: result.reason,
  };
}

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

  let bonusDiscount = 0;
  if (source === ReputationSource.FreelanceAI && threshold >= 70) {
    bonusDiscount = basePrice * 0.02;
  }

  return {
    price: result.price - bonusDiscount,
    discount: result.discount + bonusDiscount,
    tier: result.tier.name,
    creditLimit: result.tier.creditLimit,
  };
}

export function buildPayAI402Response(
  basePrice: number,
  agentThreshold: number | null,
  source?: ReputationSource
): {
  x402Version: 2;
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
    x402Version: 2,
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

export function payaiReputationMiddleware(config: PayAIReputationConfig) {
  return async (
    req: { body?: { extensions?: Record<string, unknown> } },
    res: { status: (code: number) => { json: (body: unknown) => void } },
    next: () => void
  ): Promise<void> => {
    const extensions = req.body?.extensions;
    const result = verifyPayAIReputation(extensions, config);

    if (!result.valid) {
      res.status(402).json({
        error: 'Reputation requirement not met',
        reason: result.reason,
        ecosystem: 'payai',
        source: config.source,
        minThreshold: config.minThreshold,
      });
      return;
    }

    next();
  };
}

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
