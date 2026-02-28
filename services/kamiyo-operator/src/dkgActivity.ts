import { AgentParanetClient, type ParanetConfig } from '@kamiyo/agent-paranet';

export type DkgActivityEventType =
  | 'fee_vault_claim'
  | 'kyoshin_staking_claim'
  | 'staking_period_deposit'
  | 'kyoshin_route_deposit'
  | 'meishi_passport_create'
  | 'meishi_mandate_update'
  | 'meishi_audit_record';

export interface DkgActivityEvent {
  type: DkgActivityEventType;
  signature?: string;
  signatures?: string[];
  amountLamports?: string;
}

export interface PublishDkgActivityInput {
  tickId: string;
  observedAt: string;
  mode: 'propose' | 'execute';
  agentId: string;
  agentName: string;
  events: DkgActivityEvent[];
}

export interface DkgActivityPublishResult {
  enabled: boolean;
  published: boolean;
  source: string;
  agentId: string;
  eventCount: number;
  signatures: string[];
  reason?: string;
  error?: string;
  ual?: string;
  score?: number;
  classification?: string;
}

export interface DkgActivityPublisherConfig {
  enabled: boolean;
  endpoint?: string;
  port: number;
  blockchain: ParanetConfig['blockchain'];
  privateKey?: string;
  paranetUAL?: string;
  source: string;
  jurisdiction: string;
  epochs: number;
}

type ScoreWeights = Record<DkgActivityEventType, number>;

const SCORE_WEIGHTS: ScoreWeights = {
  fee_vault_claim: 20,
  kyoshin_staking_claim: 16,
  staking_period_deposit: 14,
  kyoshin_route_deposit: 18,
  meishi_passport_create: 12,
  meishi_mandate_update: 12,
  meishi_audit_record: 16,
};

function classifyScore(score: number): string {
  if (score >= 80) return 'minimal';
  if (score >= 60) return 'limited';
  if (score >= 40) return 'high';
  return 'unacceptable';
}

function propertyValue(name: string, value: unknown): Record<string, unknown> {
  return {
    '@type': 'PropertyValue',
    name,
    value,
  };
}

function collectSignatures(events: DkgActivityEvent[]): string[] {
  const values = new Set<string>();
  for (const event of events) {
    if (event.signature) values.add(event.signature);
    if (Array.isArray(event.signatures)) {
      for (const signature of event.signatures) {
        if (typeof signature === 'string' && signature.length > 0) values.add(signature);
      }
    }
  }
  return [...values];
}

function summarizeEvents(events: DkgActivityEvent[]): string {
  const counts = new Map<DkgActivityEventType, number>();
  for (const event of events) {
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  }

  const parts: string[] = [];
  if (counts.get('fee_vault_claim')) {
    parts.push(`fee claims=${counts.get('fee_vault_claim')}`);
  }
  if (counts.get('kyoshin_staking_claim')) {
    parts.push(`kyoshin claims=${counts.get('kyoshin_staking_claim')}`);
  }
  if (counts.get('staking_period_deposit')) {
    parts.push(`operator feeds=${counts.get('staking_period_deposit')}`);
  }
  if (counts.get('kyoshin_route_deposit')) {
    parts.push(`kyoshin routes=${counts.get('kyoshin_route_deposit')}`);
  }
  if (counts.get('meishi_passport_create')) {
    parts.push(`meishi passports=${counts.get('meishi_passport_create')}`);
  }
  if (counts.get('meishi_mandate_update')) {
    parts.push(`meishi mandates=${counts.get('meishi_mandate_update')}`);
  }
  if (counts.get('meishi_audit_record')) {
    parts.push(`meishi audits=${counts.get('meishi_audit_record')}`);
  }
  return parts.length > 0 ? parts.join(' | ') : 'no execution events';
}

function computeScore(events: DkgActivityEvent[], signatureCount: number): number {
  let score = 40;
  for (const event of events) {
    score += SCORE_WEIGHTS[event.type] ?? 8;
  }
  score += Math.min(12, signatureCount * 2);

  const hasClaim = events.some(event => event.type === 'fee_vault_claim' || event.type === 'kyoshin_staking_claim');
  const hasStakeRoute = events.some(
    event => event.type === 'staking_period_deposit' || event.type === 'kyoshin_route_deposit'
  );
  if (hasClaim && hasStakeRoute) {
    score += 6;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function isRateLimitError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('429');
}

function normalizeDkgEndpoint(endpoint: string): string {
  const value = endpoint.trim();
  if (!value) return value;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) {
    return value;
  }
  return `http://${value}`;
}

function buildReviewAsset(params: {
  input: PublishDkgActivityInput;
  score: number;
  classification: string;
  source: string;
  jurisdiction: string;
  signatures: string[];
}): Record<string, unknown> {
  const { input, score, classification, source, jurisdiction, signatures } = params;
  const signaturePreview = signatures.slice(0, 3).join(', ');
  const reviewBody = [
    `Kamiyo operator runtime audit tick=${input.tickId}.`,
    `Signals: ${summarizeEvents(input.events)}.`,
    signaturePreview ? `Tx signatures: ${signaturePreview}.` : 'No chain signatures in this tick.',
  ].join(' ');

  return {
    '@context': ['https://schema.org/'],
    '@type': 'Review',
    name: 'ComplianceAudit',
    itemReviewed: {
      '@type': 'SoftwareApplication',
      identifier: input.agentId,
      name: input.agentName,
    },
    author: {
      '@type': 'Organization',
      identifier: `kamiyo:${source}`,
      name: 'Kamiyo Operator',
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: score,
      bestRating: 100,
      worstRating: 0,
    },
    reviewBody,
    additionalProperty: [
      propertyValue('classification', classification),
      propertyValue('jurisdiction', jurisdiction),
      propertyValue('auditType', 'triggered'),
      propertyValue('source', source),
      propertyValue('tickId', input.tickId),
      propertyValue(
        'eventTypes',
        input.events
          .map(event => event.type)
          .filter((value, index, list) => list.indexOf(value) === index)
          .join(',')
      ),
      propertyValue('eventCount', input.events.length),
      propertyValue('signatureCount', signatures.length),
    ],
    datePublished: input.observedAt,
    ...(signatures[0]
      ? {
          isBasedOn: {
            '@type': 'DigitalDocument',
            '@id': `https://solscan.io/tx/${signatures[0]}`,
          },
        }
      : {}),
  };
}

export class DkgActivityPublisher {
  private clientPromise: Promise<AgentParanetClient> | null = null;

  constructor(private readonly config: DkgActivityPublisherConfig) {}

  private async getClient(): Promise<AgentParanetClient> {
    if (this.clientPromise) return this.clientPromise;
    const endpoint = this.config.endpoint?.trim();
    const privateKey = this.config.privateKey?.trim();

    if (!endpoint || !privateKey) {
      throw new Error('Missing DKG endpoint/private key');
    }

    this.clientPromise = AgentParanetClient.create({
      dkgEndpoint: normalizeDkgEndpoint(endpoint),
      dkgPort: this.config.port,
      blockchain: this.config.blockchain,
      privateKey,
      ...(this.config.paranetUAL ? { paranetUAL: this.config.paranetUAL } : {}),
    });
    return this.clientPromise;
  }

  async publish(input: PublishDkgActivityInput): Promise<DkgActivityPublishResult> {
    const base: DkgActivityPublishResult = {
      enabled: this.config.enabled,
      published: false,
      source: this.config.source,
      agentId: input.agentId,
      eventCount: input.events.length,
      signatures: collectSignatures(input.events),
    };

    if (!this.config.enabled) {
      return { ...base, reason: 'disabled' };
    }
    if (input.mode !== 'execute') {
      return { ...base, reason: 'propose_mode' };
    }
    if (input.events.length === 0) {
      return { ...base, reason: 'no_events' };
    }
    if (!this.config.endpoint || !this.config.privateKey) {
      return { ...base, reason: 'missing_config' };
    }

    const score = computeScore(input.events, base.signatures.length);
    const classification = classifyScore(score);
    const asset = buildReviewAsset({
      input,
      score,
      classification,
      source: this.config.source,
      jurisdiction: this.config.jurisdiction,
      signatures: base.signatures,
    });

    try {
      const client = await this.getClient();
      const result = await client.rawDKG.asset.create(
        { public: asset },
        {
          epochsNum: this.config.epochs,
          ...(this.config.paranetUAL ? { paranetUAL: this.config.paranetUAL } : {}),
        }
      );

      return {
        ...base,
        published: true,
        score,
        classification,
        ual: result.UAL,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...base,
        reason: isRateLimitError(message) ? 'rate_limited' : 'publish_failed',
        error: message,
        score,
        classification,
      };
    }
  }
}

export function createDkgActivityPublisher(config: DkgActivityPublisherConfig): DkgActivityPublisher {
  return new DkgActivityPublisher(config);
}
