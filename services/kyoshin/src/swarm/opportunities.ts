import fs from 'node:fs';
import { z } from 'zod';

import type {
  SwarmAgentProfile,
  SwarmJobSource,
  SwarmMarketplaceSource,
  SwarmRegistry,
} from './types.js';

export type SwarmOpportunitySource =
  | 'x402'
  | 'relevance'
  | 'agent_ai'
  | 'kore'
<<<<<<< HEAD
=======
  | 'near_market'
>>>>>>> origin/kamiyo/kyoshin-exec-canary
  | 'direct'
  | 'internal';

export type SwarmOpportunity = {
  id: string;
  source: SwarmOpportunitySource;
  title: string;
  summary: string;
  url?: string;
  confidence: number;
  roleHints: string[];
  tags: string[];
  payoutUsd: number | null;
  payoutSolEstimate: number | null;
  createdAt: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
};

export type SwarmOpportunityAssignment = {
  opportunityId: string;
  agentId: string;
  score: number;
  roleFit: number;
  valueScore: number;
  confidence: number;
  expectedRewardSol: number | null;
  reason: string;
};

export type SwarmOpportunityIntake = {
  at: string;
  discovered: number;
  accepted: number;
  leadConversions: {
    generated: number;
    accepted: number;
    rejected: number;
  };
  assignments: SwarmOpportunityAssignment[];
  opportunities: SwarmOpportunity[];
  sourceStats: Array<{
    source: string;
    discovered: number;
    accepted: number;
    rejected?: number;
    error?: string;
  }>;
};

<<<<<<< HEAD
export type MarketplaceFeedConfig = {
  source: 'relevance' | 'agent_ai' | 'kore';
  url: string;
  apiKey?: string;
  authHeader?: string;
=======
type NearMarketAdapterConfig = {
  enabled: boolean;
  agentId?: string;
  nearPriceUsd: number;
  minBudgetNear: number;
  maxBudgetNear: number;
  bidDiscountBps: number;
  minBidNear: number;
  maxBidNear: number;
  maxExistingBids: number;
  etaSeconds: number;
  allowCompetition: boolean;
  proposalTemplate: string;
  minMarginSol: number;
};

export type MarketplaceFeedConfig = {
  source: 'relevance' | 'agent_ai' | 'kore' | 'near_market';
  url: string;
  apiKey?: string;
  authHeader?: string;
  nearMarketAdapter?: NearMarketAdapterConfig;
>>>>>>> origin/kamiyo/kyoshin-exec-canary
};

export type LeadConversionPolicy = {
  enabled: boolean;
  maxConversions: number;
  defaultPayoutUsd: number;
  requireEndpoint: boolean;
  simulateOnly: boolean;
  estimatedFeeSol: number;
  minConfidence: number;
  validateSourceContracts: boolean;
};

const nonEmptyString = z.preprocess(
  value => (typeof value === 'string' ? value.trim() : value),
  z.string().min(1)
);

const optionalNonEmptyString = z.preprocess(
  value => (typeof value === 'string' ? value.trim() || undefined : value),
  z.string().min(1).optional()
);

const nonNegativeNumber = z.coerce.number().finite().min(0);

const rawOpportunitySchema = z.object({
  id: optionalNonEmptyString,
  source: optionalNonEmptyString,
  title: nonEmptyString,
  summary: optionalNonEmptyString,
  description: optionalNonEmptyString,
  url: optionalNonEmptyString,
  confidence: z.coerce.number().min(0).max(1).default(0.6),
  roleHints: z.array(nonEmptyString).default([]),
  tags: z.array(nonEmptyString).default([]),
  status: z.enum(['open', 'closed']).default('open'),
  payoutUsd: nonNegativeNumber.optional(),
  payoutSol: nonNegativeNumber.optional(),
  payout: z
    .object({
      amount: nonNegativeNumber,
      currency: nonEmptyString,
    })
    .optional(),
  createdAt: optionalNonEmptyString,
  expiresAt: optionalNonEmptyString,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const feedSchema = z.object({
  opportunities: z.array(rawOpportunitySchema).default([]),
});

const feedOrArraySchema = z.union([
  feedSchema,
  z.array(rawOpportunitySchema).transform(opportunities => ({ opportunities })),
]);

const leadContractActionSchema = z.union([
  z.string().url(),
  z
    .object({
      url: z.string().url().optional(),
      endpoint: z.string().url().optional(),
      href: z.string().url().optional(),
      link: z.string().url().optional(),
      method: z.string().min(1).optional(),
      headers: z.record(z.string(), z.string()).optional(),
      body: z.unknown().optional(),
      required: z.boolean().optional(),
    })
    .superRefine((value, ctx) => {
      if (!value.url && !value.endpoint && !value.href && !value.link) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'missing action endpoint',
        });
      }
    }),
]);

const leadContractConversionSchema = z
  .object({
    url: z.string().url().optional(),
    endpoint: z.string().url().optional(),
    x402Url: z.string().url().optional(),
    apiUrl: z.string().url().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.url && !value.endpoint && !value.x402Url && !value.apiUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'missing conversion endpoint',
      });
    }
  });

const leadContractBaseSchema = z.object({
  endpoint: z.string().url(),
  actions: z.record(z.string(), z.unknown()).default({}),
  conversion: z.record(z.string(), z.unknown()).default({}),
  marketplaceRecord: z.record(z.string(), z.unknown()).optional(),
});

type RawOpportunity = z.infer<typeof rawOpportunitySchema>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => (typeof item === 'string' ? [item.trim()] : [])).filter(Boolean);
}

function normalizeSource(value: string | undefined): SwarmOpportunitySource {
  const source = (value ?? 'direct').trim().toLowerCase();
  if (source === 'x402') return 'x402';
  if (source === 'relevance' || source === 'relevance_ai') return 'relevance';
  if (source === 'agent.ai' || source === 'agentai' || source === 'agent_ai') return 'agent_ai';
  if (source === 'kore' || source === 'kore_ai') return 'kore';
<<<<<<< HEAD
=======
  if (source === 'near_market' || source === 'near-market' || source === 'nearai' || source === 'near') {
    return 'near_market';
  }
>>>>>>> origin/kamiyo/kyoshin-exec-canary
  if (source === 'internal') return 'internal';
  return 'direct';
}

function stableOpportunityId(raw: RawOpportunity, index: number, sourceLabel: string): string {
  if (raw.id) return raw.id;
  const title = raw.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
  return `${sourceLabel}-${title || 'opportunity'}-${index + 1}`;
}

function parseIsoOrUndefined(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

function estimatePayoutUsd(raw: RawOpportunity, solPriceUsd: number): number | null {
  if (typeof raw.payoutUsd === 'number') return raw.payoutUsd;
  if (typeof raw.payoutSol === 'number') return raw.payoutSol * solPriceUsd;
  if (raw.payout) {
    const currency = raw.payout.currency.toUpperCase();
    if (currency === 'USD' || currency === 'USDC') return raw.payout.amount;
    if (currency === 'SOL') return raw.payout.amount * solPriceUsd;
  }
  return null;
}

function estimatePayoutSol(raw: RawOpportunity, solPriceUsd: number): number | null {
  if (typeof raw.payoutSol === 'number') return raw.payoutSol;
  if (typeof raw.payoutUsd === 'number') return raw.payoutUsd / solPriceUsd;
  if (raw.payout) {
    const currency = raw.payout.currency.toUpperCase();
    if (currency === 'SOL') return raw.payout.amount;
    if (currency === 'USD' || currency === 'USDC') return raw.payout.amount / solPriceUsd;
  }
  return null;
}

function normalizeOpportunity(params: {
  raw: RawOpportunity;
  index: number;
  sourceLabel: string;
  solPriceUsd: number;
}): SwarmOpportunity | null {
  const { raw, index, sourceLabel, solPriceUsd } = params;
  if (raw.status === 'closed') return null;

  const expiresAt = parseIsoOrUndefined(raw.expiresAt);
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) return null;

  const source = normalizeSource(raw.source ?? sourceLabel);
  const id = stableOpportunityId(raw, index, source);
  const createdAt = parseIsoOrUndefined(raw.createdAt) ?? new Date().toISOString();
  const summary = raw.summary ?? raw.description ?? 'No summary provided.';

  return {
    id,
    source,
    title: raw.title,
    summary,
    url: raw.url,
    confidence: raw.confidence,
    roleHints: Array.from(new Set(raw.roleHints.map(v => v.toLowerCase()))),
    tags: Array.from(new Set(raw.tags.map(v => v.toLowerCase()))),
    payoutUsd: estimatePayoutUsd(raw, solPriceUsd),
    payoutSolEstimate: estimatePayoutSol(raw, solPriceUsd),
    createdAt,
    expiresAt,
    metadata: raw.metadata,
  };
}

async function loadFeedFromUrl(params: {
  url: string;
  timeoutMs: number;
  headers?: Record<string, string>;
}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const response = await fetch(params.url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(params.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function loadFeedFromPath(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

function dedupeOpportunities(opportunities: SwarmOpportunity[]): SwarmOpportunity[] {
  const deduped = new Map<string, SwarmOpportunity>();
  for (const opportunity of opportunities) {
    const key = `${opportunity.source}:${opportunity.id}`.toLowerCase();
    const current = deduped.get(key);
    if (!current) {
      deduped.set(key, opportunity);
      continue;
    }

    const currentValue = current.payoutSolEstimate ?? -1;
    const nextValue = opportunity.payoutSolEstimate ?? -1;
    if (nextValue > currentValue) deduped.set(key, opportunity);
  }
  return Array.from(deduped.values());
}

function hasValidAction(actions: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    if (!(key in actions)) continue;
    if (leadContractActionSchema.safeParse(actions[key]).success) return true;
  }
  return false;
}

function hasValidConversion(conversion: Record<string, unknown>): boolean {
  return leadContractConversionSchema.safeParse(conversion).success;
}

function validateLeadContract(params: {
  source: SwarmOpportunitySource;
  endpoint: string;
  metadata: Record<string, unknown> | null;
}): {
  ok: boolean;
  reason?: string;
} {
  const parsed = leadContractBaseSchema.safeParse({
    endpoint: params.endpoint,
    actions: asRecord(params.metadata?.actions) ?? {},
    conversion: asRecord(params.metadata?.conversion) ?? {},
    marketplaceRecord: asRecord(params.metadata?.marketplaceRecord) ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, reason: 'invalid_contract_base' };
  }

  const actions = parsed.data.actions;
  const conversion = parsed.data.conversion;
  const marketplaceRecord = parsed.data.marketplaceRecord ?? {};
  const hasAction = hasValidAction(actions, ['apply', 'accept', 'start', 'complete', 'claim']);
  const hasConversion = hasValidConversion(conversion);

  if (params.source === 'relevance') {
    if (!hasAction && !hasConversion) {
      return { ok: false, reason: 'relevance_contract_missing_actions' };
    }
    return { ok: true };
  }

  if (params.source === 'agent_ai') {
    const hasLeadCapture =
      typeof marketplaceRecord.leadMagnetId === 'string' ||
      typeof marketplaceRecord.lead_capture_form_id === 'string' ||
      typeof marketplaceRecord.leadCaptureId === 'string';
    if (!hasAction && !hasConversion && !hasLeadCapture) {
      return { ok: false, reason: 'agent_ai_contract_missing_lead_capture' };
    }
    return { ok: true };
  }

  if (params.source === 'kore') {
    const hasWorkflowId =
      typeof marketplaceRecord.workflowId === 'string' ||
      typeof marketplaceRecord.taskId === 'string' ||
      typeof marketplaceRecord.listingId === 'string';
    if (!hasAction && !hasConversion && !hasWorkflowId) {
      return { ok: false, reason: 'kore_contract_missing_workflow' };
    }
    return { ok: true };
  }

  if (params.source === 'x402' || params.source === 'direct' || params.source === 'internal') {
    return { ok: true };
  }

  return { ok: false, reason: 'unsupported_source' };
}

function firstDefinedString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const parsed = asString(value);
    if (parsed) return parsed;
  }
  return undefined;
}

function findLeadConversionEndpoint(opportunity: SwarmOpportunity): string | undefined {
  const metadata = asRecord(opportunity.metadata);
  const conversion = asRecord(metadata?.conversion);
  const actions = asRecord(metadata?.actions);
  const apply = asRecord(actions?.apply);
  const complete = asRecord(actions?.complete);
  const claim = asRecord(actions?.claim);

  return firstDefinedString(
    conversion?.url,
    conversion?.endpoint,
    conversion?.x402Url,
    conversion?.apiUrl,
    apply?.url,
    complete?.url,
    claim?.url,
    metadata?.endpoint,
    metadata?.apiUrl,
    opportunity.url
  );
}

function inferConversionSource(opportunity: SwarmOpportunity): SwarmOpportunitySource {
  const metadata = asRecord(opportunity.metadata);
  const conversion = asRecord(metadata?.conversion);
  const paymentRail = firstDefinedString(
    conversion?.paymentRail,
    conversion?.rail,
    metadata?.paymentRail,
    metadata?.rail
  )?.toLowerCase();

  const endpoint = findLeadConversionEndpoint(opportunity)?.toLowerCase() ?? '';
  const tags = opportunity.tags.map(tag => tag.toLowerCase());
  if (
    paymentRail === 'x402' ||
    paymentRail === 'machine-pay' ||
    endpoint.includes('x402') ||
    tags.includes('x402')
  ) {
    return 'x402';
  }
  return 'direct';
}

function buildLeadConversions(params: {
  opportunities: SwarmOpportunity[];
  policy: LeadConversionPolicy;
  solPriceUsd: number;
}): {
  opportunities: SwarmOpportunity[];
  attempted: number;
  rejected: number;
} {
  if (!params.policy.enabled || params.policy.maxConversions <= 0) {
    return {
      opportunities: [],
      attempted: 0,
      rejected: 0,
    };
  }

  const converted: SwarmOpportunity[] = [];
  let attempted = 0;
  let rejected = 0;
  for (const opportunity of params.opportunities) {
    if (converted.length >= params.policy.maxConversions) break;
    const metadata = asRecord(opportunity.metadata);
    const executionMode = asString(metadata?.executionMode);
    if (executionMode !== 'lead') continue;
    attempted += 1;

    const endpoint = findLeadConversionEndpoint(opportunity);
    if (params.policy.requireEndpoint && !endpoint) {
      rejected += 1;
      continue;
    }
    if (!endpoint) {
      rejected += 1;
      continue;
    }

    if (params.policy.validateSourceContracts) {
      const contractValidation = validateLeadContract({
        source: opportunity.source,
        endpoint,
        metadata,
      });
      if (!contractValidation.ok) {
        rejected += 1;
        continue;
      }
    }

    const source = params.policy.simulateOnly ? 'internal' : inferConversionSource(opportunity);
    const payoutUsd = opportunity.payoutUsd ?? params.policy.defaultPayoutUsd;
    const payoutSolEstimate =
      opportunity.payoutSolEstimate ??
      (payoutUsd > 0 && params.solPriceUsd > 0 ? payoutUsd / params.solPriceUsd : null);
    const confidence = Math.min(
      0.95,
      Math.max(params.policy.minConfidence, opportunity.confidence * 0.9)
    );
    const nowIso = new Date().toISOString();

    converted.push({
      id: `${opportunity.id}:converted:${source}`,
      source,
      title: `${opportunity.title} (converted contract)`,
      summary: params.policy.simulateOnly
        ? `Auto-converted lead from ${opportunity.source} into simulation-only contract path for dry-run validation.`
        : `Auto-converted lead from ${opportunity.source} into executable ${source} contract path.`,
      url: endpoint,
      confidence,
      roleHints: opportunity.roleHints,
      tags: Array.from(new Set([...opportunity.tags, 'converted', `from:${opportunity.source}`])),
      payoutUsd,
      payoutSolEstimate,
      createdAt: nowIso,
      expiresAt: opportunity.expiresAt,
      metadata: {
        ...metadata,
        executionMode: params.policy.simulateOnly ? 'lead' : 'api',
        conversion: {
          fromOpportunityId: opportunity.id,
          fromSource: opportunity.source,
          generatedAt: nowIso,
          generatedBy: 'swarm_lead_converter_v1',
          simulateOnly: params.policy.simulateOnly,
          estimatedFeeSol: params.policy.estimatedFeeSol,
          simulatedNetSol:
            payoutSolEstimate != null ? payoutSolEstimate - params.policy.estimatedFeeSol : null,
        },
      },
    });
  }

  return {
    opportunities: converted,
    attempted,
    rejected,
  };
}

function filterRankedOpportunities(params: {
  opportunities: SwarmOpportunity[];
  minRewardUsd: number;
  maxOpen: number;
}): SwarmOpportunity[] {
  const filtered = params.opportunities.filter(opportunity => {
    if (opportunity.payoutUsd == null) {
      if (
        opportunity.source === 'agent_ai' ||
        opportunity.source === 'kore' ||
        opportunity.source === 'relevance'
      ) {
        return true;
      }
      return params.minRewardUsd <= 0;
    }
    return opportunity.payoutUsd >= params.minRewardUsd;
  });

  filtered.sort((a, b) => {
<<<<<<< HEAD
    const payoutA = a.payoutSolEstimate ?? -1;
    const payoutB = b.payoutSolEstimate ?? -1;
    if (payoutB !== payoutA) return payoutB - payoutA;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
=======
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const payoutA = a.payoutSolEstimate ?? -1;
    const payoutB = b.payoutSolEstimate ?? -1;
    if (payoutB !== payoutA) return payoutB - payoutA;
>>>>>>> origin/kamiyo/kyoshin-exec-canary
    return a.id.localeCompare(b.id);
  });

  return filtered.slice(0, Math.max(1, params.maxOpen));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function roleFitScore(agent: SwarmAgentProfile, opportunity: SwarmOpportunity): number {
  const role = agent.role.toLowerCase();
  const roleHints = new Set(opportunity.roleHints.map(value => value.toLowerCase()));
  if (roleHints.has(role)) return 1;

  let score = 0;
  const roleTokens = new Set(tokenize(agent.role));
  const mandateTokens = new Set(tokenize(agent.mandate));
  const opportunityTokens = new Set(
    tokenize(`${opportunity.title} ${opportunity.summary} ${opportunity.tags.join(' ')}`)
  );

  for (const token of roleTokens) {
    if (opportunityTokens.has(token)) score += 0.2;
  }
  for (const token of mandateTokens) {
    if (opportunityTokens.has(token)) score += 0.08;
  }

  if (roleHints.size > 0) {
    for (const hint of roleHints) {
      for (const token of roleTokens) {
        if (hint.includes(token)) score += 0.25;
      }
    }
  }

  return Math.min(1, score);
}

function valueScore(opportunity: SwarmOpportunity): number {
  if (opportunity.payoutSolEstimate == null) return 0.3;
  return Math.min(1, opportunity.payoutSolEstimate / 0.2);
}

function jobSourceForOpportunity(source: SwarmOpportunity['source']): SwarmJobSource {
  if (source === 'x402') return 'x402';
  if (source === 'relevance') return 'relevance';
  if (source === 'agent_ai') return 'agent_ai';
  if (source === 'kore') return 'kore';
<<<<<<< HEAD
=======
  if (source === 'near_market') return 'near_market';
>>>>>>> origin/kamiyo/kyoshin-exec-canary
  if (source === 'internal') return 'internal';
  return 'direct_api';
}

function marketplaceSourceFromOpportunity(
  source: SwarmOpportunity['source']
): SwarmMarketplaceSource | null {
  if (source === 'relevance') return 'relevance';
  if (source === 'agent_ai') return 'agent_ai';
  if (source === 'kore') return 'kore';
<<<<<<< HEAD
=======
  if (source === 'near_market') return 'near_market';
>>>>>>> origin/kamiyo/kyoshin-exec-canary
  return null;
}

function marketplaceStateScore(state: string): number {
  if (state === 'approved') return 1;
  if (state === 'submitted') return 0.75;
  if (state === 'draft') return 0.5;
  if (state === 'not_listed') return 0.2;
  return 0.1;
}

function channelFit(
  agent: SwarmAgentProfile,
  opportunity: SwarmOpportunity
): {
  score: number;
  reason: string;
} {
  const source = jobSourceForOpportunity(opportunity.source);
  if (!agent.jobSources.includes(source)) {
    return { score: 0, reason: `channel=disabled:${source}` };
  }

  const marketplaceSource = marketplaceSourceFromOpportunity(opportunity.source);
  if (!marketplaceSource) {
    return { score: 1, reason: `channel=enabled:${source}` };
  }

  const profile = agent.marketplaceProfiles.find(item => item.source === marketplaceSource) ?? null;
  const state = profile?.state ?? 'not_listed';
  const score = marketplaceStateScore(state);
  return {
    score,
    reason: `channel=${source} state=${state}`,
  };
}

function assignmentScore(params: {
  agent: SwarmAgentProfile;
  opportunity: SwarmOpportunity;
  sourceQualityBySource?: Partial<Record<SwarmOpportunitySource, number>>;
}): SwarmOpportunityAssignment {
  const { agent, opportunity } = params;
  const channel = channelFit(agent, opportunity);
  if (channel.score <= 0) {
    return {
      opportunityId: opportunity.id,
      agentId: agent.id,
      score: 0,
      roleFit: 0,
      valueScore: 0,
      confidence: opportunity.confidence,
      expectedRewardSol: opportunity.payoutSolEstimate,
      reason: channel.reason,
    };
  }

  const roleFit = roleFitScore(agent, opportunity);
  const value = valueScore(opportunity);
  const confidence = opportunity.confidence;
  const sourceQualityRaw = params.sourceQualityBySource?.[opportunity.source];
  const sourceQuality =
    typeof sourceQualityRaw === 'number' && Number.isFinite(sourceQualityRaw)
      ? Math.max(0.3, Math.min(1.4, sourceQualityRaw))
      : 1;
  const score =
    (roleFit * 0.45 + value * 0.2 + confidence * 0.1 + channel.score * 0.25) * sourceQuality;

  return {
    opportunityId: opportunity.id,
    agentId: agent.id,
    score,
    roleFit,
    valueScore: value,
    confidence,
    expectedRewardSol: opportunity.payoutSolEstimate,
    reason: `role_fit=${roleFit.toFixed(2)} value=${value.toFixed(2)} confidence=${confidence.toFixed(2)} channel_fit=${channel.score.toFixed(2)} source_quality=${sourceQuality.toFixed(2)} ${channel.reason}`,
  };
}

function assignOpportunities(params: {
  registry: SwarmRegistry;
  opportunities: SwarmOpportunity[];
  assignmentLimit: number;
  sourceQualityBySource?: Partial<Record<SwarmOpportunitySource, number>>;
}): SwarmOpportunityAssignment[] {
  const activeAgents = params.registry.agents.filter(agent => agent.status === 'active');
  if (activeAgents.length === 0 || params.opportunities.length === 0) return [];

  const candidates: SwarmOpportunityAssignment[] = [];
  for (const opportunity of params.opportunities) {
    for (const agent of activeAgents) {
      candidates.push(
        assignmentScore({
          agent,
          opportunity,
          sourceQualityBySource: params.sourceQualityBySource,
        })
      );
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.opportunityId.localeCompare(b.opportunityId);
  });

  const assignments: SwarmOpportunityAssignment[] = [];
  const usedOpportunities = new Set<string>();
  const usedAgents = new Set<string>();

  for (const candidate of candidates) {
    if (assignments.length >= params.assignmentLimit) break;
    if (usedOpportunities.has(candidate.opportunityId)) continue;
    if (usedAgents.has(candidate.agentId)) continue;
    if (candidate.score <= 0) continue;

    assignments.push(candidate);
    usedOpportunities.add(candidate.opportunityId);
    usedAgents.add(candidate.agentId);
  }

  return assignments;
}

function findFirstArray(root: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = root[key];
    if (Array.isArray(value)) return value;
    const nested = asRecord(value);
    if (nested && Array.isArray(nested.items)) return nested.items;
    if (nested && Array.isArray(nested.results)) return nested.results;
  }
  return [];
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return undefined;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = asNumber(record[key]);
    if (value != null) return value;
  }
  return undefined;
}

type MarketplaceActionDescriptor = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  required?: boolean;
};

function normalizeMarketplaceAction(
  value: unknown,
  defaultMethod = 'POST'
): MarketplaceActionDescriptor | null {
  const asUrl = asString(value);
  if (asUrl) {
    return { url: asUrl, method: defaultMethod };
  }

  const record = asRecord(value);
  if (!record) return null;
  const url = pickString(record, ['url', 'endpoint', 'href', 'link']);
  if (!url) return null;

  const method = pickString(record, ['method', 'httpMethod']) ?? defaultMethod;
  const required = typeof record.required === 'boolean' ? record.required : true;
  const headers = asRecord(record.headers) as Record<string, string> | null;

  return {
    url,
    method,
    headers: headers ?? undefined,
    body: record.body,
    required,
  };
}

function parseMarketplaceActions(
  record: Record<string, unknown>
): Record<string, MarketplaceActionDescriptor> {
  const actions: Record<string, MarketplaceActionDescriptor> = {};
  const actionMap = asRecord(record.actions) ?? asRecord(record.workflow) ?? {};

  const candidates: Array<{ name: string; keys: string[]; defaultMethod?: string }> = [
    { name: 'apply', keys: ['apply', 'applyUrl', 'applicationUrl'], defaultMethod: 'POST' },
    { name: 'accept', keys: ['accept', 'acceptUrl'], defaultMethod: 'POST' },
    { name: 'start', keys: ['start', 'startUrl'], defaultMethod: 'POST' },
    { name: 'complete', keys: ['complete', 'completeUrl', 'submitUrl'], defaultMethod: 'POST' },
    { name: 'claim', keys: ['claim', 'claimUrl', 'payoutUrl'], defaultMethod: 'POST' },
  ];

  for (const candidate of candidates) {
    let parsed: MarketplaceActionDescriptor | null = null;
    for (const key of candidate.keys) {
      if (key in actionMap) {
        parsed = normalizeMarketplaceAction(actionMap[key], candidate.defaultMethod);
      } else if (key in record) {
        parsed = normalizeMarketplaceAction(record[key], candidate.defaultMethod);
      }
      if (parsed) break;
    }

    if (parsed) actions[candidate.name] = parsed;
  }

  return actions;
}

<<<<<<< HEAD
function parseMarketplaceItem(params: {
  source: 'relevance' | 'agent_ai' | 'kore';
  record: Record<string, unknown>;
  index: number;
}): RawOpportunity | null {
=======
function formatNearAmount(value: number): string {
  const fixed = value.toFixed(4);
  return fixed.replace(/\.?0+$/, '');
}

function fillProposalTemplate(template: string, values: Record<string, string>): string {
  let next = template;
  for (const [key, value] of Object.entries(values)) {
    next = next.replaceAll(`{${key}}`, value);
  }
  return next;
}

function parseNearMarketItem(params: {
  record: Record<string, unknown>;
  index: number;
  feedUrl: string;
  adapter: NearMarketAdapterConfig;
}): RawOpportunity | null {
  const { record, index, adapter } = params;
  if (!adapter.enabled) return null;

  const jobId = pickString(record, ['job_id', 'jobId', 'id']) ?? `near-market-${index + 1}`;
  const creatorAgentId = pickString(record, ['creator_agent_id', 'creatorAgentId']);
  if (adapter.agentId && creatorAgentId && creatorAgentId === adapter.agentId) {
    return null;
  }

  const statusRaw = pickString(record, ['status', 'state']) ?? 'open';
  if (/closed|filled|archived|inactive|completed|expired|judging|in_progress|filling/i.test(statusRaw)) {
    return null;
  }

  const jobType = (pickString(record, ['job_type', 'jobType']) ?? 'standard').toLowerCase();
  if (!adapter.allowCompetition && jobType === 'competition') {
    return null;
  }

  const existingBids = Math.max(0, Math.trunc(pickNumber(record, ['bid_count', 'bidCount']) ?? 0));
  if (existingBids > adapter.maxExistingBids) {
    return null;
  }

  const budgetAmount = pickNumber(record, ['budget_amount', 'budgetAmount']);
  const budgetToken = (pickString(record, ['budget_token', 'budgetToken']) ?? 'NEAR').toUpperCase();
  if (budgetAmount == null || budgetAmount <= 0) return null;

  const budgetNear = budgetToken === 'NEAR'
    ? budgetAmount
    : budgetToken === 'USDC' || budgetToken === 'USD'
      ? budgetAmount / adapter.nearPriceUsd
      : null;
  if (budgetNear == null || !Number.isFinite(budgetNear) || budgetNear <= 0) return null;
  if (budgetNear < adapter.minBudgetNear || budgetNear > adapter.maxBudgetNear) return null;

  const rawBidNear = budgetNear * (adapter.bidDiscountBps / 10_000);
  const bidNear = Math.max(adapter.minBidNear, Math.min(adapter.maxBidNear, rawBidNear));
  if (!Number.isFinite(bidNear) || bidNear <= 0 || bidNear >= budgetNear) return null;

  const title = pickString(record, ['title', 'name', 'task', 'job', 'listing', 'label']);
  if (!title) return null;
  const summary =
    pickString(record, ['summary', 'description', 'overview', 'brief', 'details']) ??
    'No summary provided.';
  const createdAt =
    pickString(record, ['created_at', 'createdAt', 'updated_at', 'updatedAt']) ??
    new Date().toISOString();
  const createdAtMs = Date.parse(createdAt);
  const ageHours =
    Number.isFinite(createdAtMs) && createdAtMs > 0
      ? Math.max(0, (Date.now() - createdAtMs) / 3_600_000)
      : 24;
  const freshnessBoost = ageHours <= 1 ? 0.2 : ageHours <= 6 ? 0.12 : ageHours <= 24 ? 0.04 : -0.08;
  const competitionPenalty = Math.min(0.35, existingBids * 0.02);
  const confidence = Math.max(0.25, Math.min(0.92, 0.55 + freshnessBoost - competitionPenalty));

  const feedUrl = new URL(params.feedUrl);
  const baseUrl = `${feedUrl.protocol}//${feedUrl.host}`;
  const applicationPath = jobType === 'competition' ? 'entries' : 'bids';
  const applyUrl = `${baseUrl}/v1/jobs/${jobId}/${applicationPath}`;
  const publicUrl = `${baseUrl}/jobs/${jobId}`;
  const proposal = fillProposalTemplate(adapter.proposalTemplate, {
    job_id: jobId,
    title,
    budget_near: formatNearAmount(budgetNear),
    bid_near: formatNearAmount(bidNear),
    budget_token: budgetToken,
  });

  return {
    id: jobId,
    source: 'near_market',
    title,
    summary,
    description: summary,
    url: publicUrl,
    status: 'open',
    confidence,
    roleHints: Array.from(
      new Set([
        ...arrayOfStrings(record.roleHints),
        ...arrayOfStrings(record.roles),
        'execution',
      ])
    ),
    tags: Array.from(
      new Set([
        ...arrayOfStrings(record.tags),
        ...arrayOfStrings(record.skills),
        ...arrayOfStrings(record.capabilities),
        'near',
        'near_market',
        'marketplace',
      ])
    ),
    payoutUsd: bidNear * adapter.nearPriceUsd,
    payoutSol: undefined,
    payout: {
      amount: bidNear,
      currency: 'NEAR',
    },
    createdAt,
    expiresAt: pickString(record, ['expires_at', 'expiresAt', 'deadline']),
    metadata: {
      source: 'near_market',
      executionMode: 'api',
      settlementMode: 'deferred',
      actions: {
        apply: {
          url: applyUrl,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: {
            amount: formatNearAmount(bidNear),
            eta_seconds: adapter.etaSeconds,
            proposal,
          },
        },
      },
      rawId: jobId,
      marketplaceRecord: record,
      nearMarket: {
        jobId,
        bidderAgentId: adapter.agentId,
        creatorAgentId,
        budgetNear,
        bidNear,
        minBidNear: adapter.minBidNear,
        maxBidNear: adapter.maxBidNear,
        budgetToken,
        existingBids,
        jobType,
        applicationPath,
        minMarginSol: adapter.minMarginSol,
      },
    },
  };
}

function parseMarketplaceItem(params: {
  source: 'relevance' | 'agent_ai' | 'kore' | 'near_market';
  record: Record<string, unknown>;
  index: number;
  feed: MarketplaceFeedConfig;
}): RawOpportunity | null {
  if (params.source === 'near_market') {
    return parseNearMarketItem({
      record: params.record,
      index: params.index,
      feedUrl: params.feed.url,
      adapter: params.feed.nearMarketAdapter ?? {
        enabled: false,
        nearPriceUsd: 4,
        minBudgetNear: 0,
        maxBudgetNear: Number.POSITIVE_INFINITY,
        bidDiscountBps: 7000,
        minBidNear: 0,
        maxBidNear: Number.POSITIVE_INFINITY,
        maxExistingBids: Number.MAX_SAFE_INTEGER,
        etaSeconds: 3600,
        allowCompetition: false,
        proposalTemplate: 'Automated delivery.',
        minMarginSol: 0,
      },
    });
  }

>>>>>>> origin/kamiyo/kyoshin-exec-canary
  const { source, record, index } = params;
  const id =
    pickString(record, ['id', 'jobId', 'taskId', 'listingId', 'slug']) ?? `${source}-${index + 1}`;
  const title = pickString(record, ['title', 'name', 'task', 'job', 'listing', 'label']);
  if (!title) return null;

  const summary =
    pickString(record, ['summary', 'description', 'overview', 'brief', 'details']) ??
    'No summary provided.';
  const endpoint = pickString(record, [
    'endpoint',
    'apiUrl',
    'url',
    'link',
    'publicUrl',
    'marketplaceUrl',
  ]);
  const statusRaw = pickString(record, ['status', 'state']) ?? 'open';
  const status = /closed|filled|archived|inactive/i.test(statusRaw) ? 'closed' : 'open';

  const pricing = asRecord(record.pricing);
  const payout = asRecord(record.payout) ?? asRecord(record.reward);
  const payoutUsd =
    pickNumber(record, ['payoutUsd', 'payout_usd', 'rewardUsd', 'budgetUsd', 'priceUsd']) ??
    pickNumber(pricing ?? {}, ['usd', 'amountUsd', 'priceUsd', 'amount']) ??
    pickNumber(payout ?? {}, ['usd', 'amountUsd']);
  const payoutSol =
    pickNumber(record, ['payoutSol', 'rewardSol']) ??
    pickNumber(pricing ?? {}, ['sol', 'amountSol']) ??
    pickNumber(payout ?? {}, ['sol', 'amountSol']);

  const payoutCurrency =
    pickString(pricing ?? {}, ['currency']) ??
    pickString(payout ?? {}, ['currency']) ??
    (payoutUsd != null ? 'USD' : payoutSol != null ? 'SOL' : undefined);

  const roleHints = Array.from(
    new Set([
      ...arrayOfStrings(record.roleHints),
      ...arrayOfStrings(record.roles),
      pickString(record, ['role', 'category', 'vertical']) ?? '',
    ])
  ).filter(Boolean);

  const tags = Array.from(
    new Set([
      ...arrayOfStrings(record.tags),
      ...arrayOfStrings(record.skills),
      ...arrayOfStrings(record.capabilities),
      source,
      'marketplace',
    ])
  ).filter(Boolean);

  const createdAt =
    pickString(record, ['createdAt', 'created_at', 'publishedAt', 'updatedAt']) ??
    new Date().toISOString();
  const expiresAt = pickString(record, ['expiresAt', 'deadline', 'expiry']);
  const actions = parseMarketplaceActions(record);

  const executionMode =
    Object.keys(actions).length > 0
      ? 'api'
      : source === 'relevance'
        ? endpoint && /\/api\/|\.json$|x402/i.test(endpoint)
          ? 'api'
          : 'lead'
        : 'lead';

  const confidence =
    pickNumber(record, ['confidence', 'matchScore']) ??
    (source === 'relevance' ? 0.68 : source === 'agent_ai' ? 0.56 : 0.54);

  return {
    id,
    source,
    title,
    summary,
    description: summary,
    url: endpoint,
    confidence,
    roleHints,
    tags,
    status,
    payoutUsd,
    payoutSol,
    payout:
      payoutCurrency && (payoutUsd != null || payoutSol != null)
        ? {
            amount: payoutUsd ?? (payoutSol as number),
            currency: payoutCurrency,
          }
        : undefined,
    createdAt,
    expiresAt,
    metadata: {
      source,
      executionMode,
      actions,
      rawId: id,
      marketplaceRecord: record,
    },
  };
}

function parseMarketplaceFeed(params: {
<<<<<<< HEAD
  source: 'relevance' | 'agent_ai' | 'kore';
  payload: unknown;
}): RawOpportunity[] {
=======
  feed: MarketplaceFeedConfig;
  payload: unknown;
}): RawOpportunity[] {
  const source = params.feed.source;
>>>>>>> origin/kamiyo/kyoshin-exec-canary
  const rootRecord = asRecord(params.payload);
  const items = Array.isArray(params.payload)
    ? params.payload
    : rootRecord
      ? findFirstArray(rootRecord, [
          'opportunities',
          'jobs',
          'tasks',
          'listings',
          'results',
          'data',
          'items',
          'agents',
        ])
      : [];

  const opportunities: RawOpportunity[] = [];
  items.forEach((item, index) => {
    const record = asRecord(item);
    if (!record) return;

    const parsed = parseMarketplaceItem({
<<<<<<< HEAD
      source: params.source,
      record,
      index,
=======
      source,
      record,
      index,
      feed: params.feed,
>>>>>>> origin/kamiyo/kyoshin-exec-canary
    });
    if (parsed) opportunities.push(parsed);
  });

  return opportunities;
}

function authHeaders(config: MarketplaceFeedConfig): Record<string, string> {
  if (!config.apiKey) return {};
  const header = (config.authHeader ?? 'authorization').trim();
  if (!header) return {};

  const value =
    header.toLowerCase() === 'authorization' && !/^bearer\s+/i.test(config.apiKey)
      ? `Bearer ${config.apiKey}`
      : config.apiKey;

  return { [header]: value };
}

export async function collectSwarmOpportunities(params: {
  registry: SwarmRegistry;
  feedPath?: string;
  feedUrls: string[];
  marketplaceFeeds?: MarketplaceFeedConfig[];
  leadConversionPolicy?: LeadConversionPolicy;
<<<<<<< HEAD
  disabledSources?: SwarmOpportunitySource[];
=======
  extraOpportunities?: SwarmOpportunity[];
  disabledSources?: SwarmOpportunitySource[];
  excludedOpportunityIds?: string[];
>>>>>>> origin/kamiyo/kyoshin-exec-canary
  sourceQualityBySource?: Partial<Record<SwarmOpportunitySource, number>>;
  minRewardUsd: number;
  maxOpen: number;
  assignmentLimit: number;
  solPriceUsd: number;
  fetchTimeoutMs: number;
}): Promise<SwarmOpportunityIntake> {
  const sourceStats: SwarmOpportunityIntake['sourceStats'] = [];
  const normalized: SwarmOpportunity[] = [];

  if (params.feedPath && fs.existsSync(params.feedPath)) {
    try {
      const parsed = feedOrArraySchema.parse(loadFeedFromPath(params.feedPath));
      const opportunities = parsed.opportunities
        .map((raw, index) =>
          normalizeOpportunity({
            raw,
            index,
            sourceLabel: 'internal',
            solPriceUsd: params.solPriceUsd,
          })
        )
        .filter((value): value is SwarmOpportunity => value != null);
      sourceStats.push({
        source: 'file',
        discovered: parsed.opportunities.length,
        accepted: opportunities.length,
      });
      normalized.push(...opportunities);
    } catch (error) {
      sourceStats.push({
        source: 'file',
        discovered: 0,
        accepted: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const url of params.feedUrls) {
    const label = `url:${url}`;
    try {
      const parsed = feedOrArraySchema.parse(
        await loadFeedFromUrl({
          url,
          timeoutMs: params.fetchTimeoutMs,
        })
      );
      const opportunities = parsed.opportunities
        .map((raw, index) =>
          normalizeOpportunity({
            raw,
            index,
            sourceLabel: 'direct',
            solPriceUsd: params.solPriceUsd,
          })
        )
        .filter((value): value is SwarmOpportunity => value != null);
      sourceStats.push({
        source: label,
        discovered: parsed.opportunities.length,
        accepted: opportunities.length,
      });
      normalized.push(...opportunities);
    } catch (error) {
      sourceStats.push({
        source: label,
        discovered: 0,
        accepted: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const feed of params.marketplaceFeeds ?? []) {
    const label = `${feed.source}:${feed.url}`;
    try {
      const payload = await loadFeedFromUrl({
        url: feed.url,
        timeoutMs: params.fetchTimeoutMs,
        headers: authHeaders(feed),
      });
<<<<<<< HEAD
      const raw = parseMarketplaceFeed({ source: feed.source, payload });
=======
      const raw = parseMarketplaceFeed({ feed, payload });
>>>>>>> origin/kamiyo/kyoshin-exec-canary
      const opportunities = raw
        .map((entry, index) =>
          normalizeOpportunity({
            raw: entry,
            index,
            sourceLabel: feed.source,
            solPriceUsd: params.solPriceUsd,
          })
        )
        .filter((value): value is SwarmOpportunity => value != null);
      sourceStats.push({ source: label, discovered: raw.length, accepted: opportunities.length });
      normalized.push(...opportunities);
    } catch (error) {
      sourceStats.push({
        source: label,
        discovered: 0,
        accepted: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

<<<<<<< HEAD
=======
  if (params.extraOpportunities?.length) {
    normalized.push(...params.extraOpportunities);
    sourceStats.push({
      source: 'intake',
      discovered: params.extraOpportunities.length,
      accepted: params.extraOpportunities.length,
    });
  }

>>>>>>> origin/kamiyo/kyoshin-exec-canary
  const deduped = dedupeOpportunities(normalized);
  const convertedLeadResult = buildLeadConversions({
    opportunities: deduped,
    policy: params.leadConversionPolicy ?? {
      enabled: false,
      maxConversions: 0,
      defaultPayoutUsd: 0,
      requireEndpoint: true,
      simulateOnly: false,
      estimatedFeeSol: 0,
      minConfidence: 0.55,
      validateSourceContracts: true,
    },
    solPriceUsd: params.solPriceUsd,
  });
  const convertedLeads = convertedLeadResult.opportunities;
  const merged = dedupeOpportunities([...deduped, ...convertedLeads]);
  const disabledSources = new Set(
    (params.disabledSources ?? []).map(source => source.toLowerCase())
  );
<<<<<<< HEAD
  const gated = merged.filter(
    opportunity => !disabledSources.has(opportunity.source.toLowerCase())
=======
  const excludedOpportunityIds = new Set(
    (params.excludedOpportunityIds ?? []).map(id => id.trim()).filter(Boolean)
  );
  const gated = merged.filter(
    opportunity =>
      !disabledSources.has(opportunity.source.toLowerCase()) &&
      !excludedOpportunityIds.has(opportunity.id)
>>>>>>> origin/kamiyo/kyoshin-exec-canary
  );
  const opportunities = filterRankedOpportunities({
    opportunities: gated,
    minRewardUsd: params.minRewardUsd,
    maxOpen: params.maxOpen,
  });

  const convertedIds = new Set(convertedLeads.map(opportunity => opportunity.id));
  const acceptedLeadConversions = opportunities.filter(opportunity =>
    convertedIds.has(opportunity.id)
  ).length;
  if (convertedLeads.length > 0 || params.leadConversionPolicy?.enabled) {
    sourceStats.push({
      source: 'lead_conversion',
      discovered: convertedLeadResult.attempted,
      accepted: acceptedLeadConversions,
      rejected: convertedLeadResult.rejected,
    });
  }

  const assignments = assignOpportunities({
    registry: params.registry,
    opportunities,
    assignmentLimit: params.assignmentLimit,
    sourceQualityBySource: params.sourceQualityBySource,
  });

  return {
    at: new Date().toISOString(),
    discovered: normalized.length,
    accepted: opportunities.length,
    leadConversions: {
      generated: convertedLeads.length,
      accepted: acceptedLeadConversions,
      rejected: convertedLeadResult.rejected,
    },
    assignments,
    opportunities,
    sourceStats,
  };
}
