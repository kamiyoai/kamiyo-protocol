import { Keypair } from '@solana/web3.js';
import {
  createPaymentHeader,
  createSignedPayment,
  evaluateFacilitatorPolicy,
  getRequirementAmountRaw,
  normalizeFacilitatorPolicy,
  parseUsdcAmountUsd,
  selectPreferredRequirement,
  withPaymentHeaders,
  type FacilitatorPolicy,
} from '@kamiyo/x402-client';

import type { SwarmOpportunity, SwarmOpportunityAssignment } from './opportunities.js';

export type SwarmJobExecutionResult = {
  agentId: string;
  opportunityId: string;
  source: string;
  status: 'executed' | 'failed' | 'skipped';
  reason?: string;
  endpoint?: string;
  paid: boolean;
  paymentAmountUsd?: number;
  paymentNetwork?: string;
  paymentTransactionId?: string;
  httpStatus?: number;
  realizedRevenueSol: number;
  realizedRevenueUsd: number;
  output?: unknown;
  error?: string;
};

type HttpRequestConfig = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  body?: string;
};

type X402Requirement = {
  scheme?: string;
  network: string;
  amount?: string | number;
  maxAmountRequired?: string | number;
  resource?: string;
  payTo?: string;
  description?: string;
};

type MarketplaceActionStep = {
  name: string;
  url: string;
  method: HttpRequestConfig['method'];
  headers: Record<string, string>;
  body?: unknown;
  required: boolean;
};

type SourceAuth = {
  apiKey?: string;
  authHeader?: string;
};

export type SourceAuthMap = Partial<Record<'relevance' | 'agent_ai' | 'kore' | 'near_market', SourceAuth>>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMethod(value: unknown): HttpRequestConfig['method'] {
  if (typeof value !== 'string') return 'POST';
  const method = value.toUpperCase();
  if (method === 'GET' || method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    return method;
  }
  return 'POST';
}

function toHeaders(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};

  const headers: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record)) {
    const headerValue = asString(raw);
    if (!headerValue) continue;
    headers[key] = headerValue;
  }
  return headers;
}

function requestConfigForOpportunity(opportunity: SwarmOpportunity): HttpRequestConfig {
  const metadata = asRecord(opportunity.metadata);
  const request = asRecord(metadata?.request);

  const method = normalizeMethod(request?.method);
  const headers = toHeaders(request?.headers);
  const rawBody = request?.body;

  if (!headers['content-type'] && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let body: string | undefined;
  if (rawBody !== undefined) {
    body = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
  } else if (method !== 'GET') {
    body = JSON.stringify({
      opportunityId: opportunity.id,
      source: opportunity.source,
      title: opportunity.title,
      summary: opportunity.summary,
    });
  }

  return { method, headers, body };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

function extractRevenueFromPayload(payload: unknown, solPriceUsd: number): { sol: number; usd: number } {
  const root = asRecord(payload);
  if (!root) return { sol: 0, usd: 0 };

  const payout = asRecord(root.payout) ?? asRecord(root.payment) ?? null;
  const revenueSol =
    asNumber(root.realizedRevenueSol) ??
    asNumber(root.netRevenueSol) ??
    asNumber(root.payoutSol) ??
    asNumber(root.rewardSol) ??
    asNumber(root.earnedSol) ??
    asNumber(payout?.sol) ??
    0;

  const revenueUsd =
    asNumber(root.realizedRevenueUsd) ??
    asNumber(root.netRevenueUsd) ??
    asNumber(root.payoutUsd) ??
    asNumber(root.rewardUsd) ??
    asNumber(root.earnedUsd) ??
    asNumber(payout?.usd) ??
    asNumber(payout?.usdc) ??
    (revenueSol > 0 ? revenueSol * solPriceUsd : 0);

  return {
    sol: revenueSol > 0 ? revenueSol : revenueUsd > 0 && solPriceUsd > 0 ? revenueUsd / solPriceUsd : 0,
    usd: revenueUsd > 0 ? revenueUsd : revenueSol > 0 ? revenueSol * solPriceUsd : 0,
  };
}

function parseX402Body(raw: unknown): {
  accepts: X402Requirement[];
  facilitator?: string;
} {
  const root = asRecord(raw);
  const acceptsRaw = Array.isArray(root?.accepts) ? root.accepts : [];
  const accepts: X402Requirement[] = [];

  for (const value of acceptsRaw) {
    const requirement = asRecord(value);
    if (!requirement) continue;

    const network = asString(requirement.network);
    if (!network) continue;

    accepts.push({
      scheme: asString(requirement.scheme) ?? undefined,
      network,
      amount: requirement.amount as string | number | undefined,
      maxAmountRequired: requirement.maxAmountRequired as string | number | undefined,
      resource: asString(requirement.resource) ?? undefined,
      payTo: asString(requirement.payTo) ?? undefined,
      description: asString(requirement.description) ?? undefined,
    });
  }

  return {
    accepts,
    facilitator: asString(root?.facilitator) ?? undefined,
  };
}

function sourceAuthHeaders(source: SwarmOpportunity['source'], auth: SourceAuthMap | undefined): Record<string, string> {
  if (!auth) return {};
  if (source !== 'relevance' && source !== 'agent_ai' && source !== 'kore' && source !== 'near_market') {
    return {};
  }
  const sourceAuth = auth[source];
  if (!sourceAuth?.apiKey) return {};

  const header = (sourceAuth.authHeader ?? 'authorization').trim();
  if (!header) return {};
  const value =
    header.toLowerCase() === 'authorization' && !/^bearer\s+/i.test(sourceAuth.apiKey)
      ? `Bearer ${sourceAuth.apiKey}`
      : sourceAuth.apiKey;

  return { [header]: value };
}

function formatNearAmount(value: number): string {
  const fixed = value.toFixed(4);
  return fixed.replace(/\.?0+$/, '');
}

function nearMarketJobIdFromStep(params: {
  opportunity: SwarmOpportunity;
  step: MarketplaceActionStep;
}): string | null {
  const metadata = asRecord(params.opportunity.metadata);
  const nearMarket = asRecord(metadata?.nearMarket);
  const explicit =
    asString(nearMarket?.jobId) ??
    asString(metadata?.rawId);
  if (explicit) return explicit;

  try {
    const parsed = new URL(params.step.url);
    const match = parsed.pathname.match(/\/v1\/jobs\/([^/]+)\/bids\/?$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function nearMarketBidLimits(opportunity: SwarmOpportunity): {
  minBidNear: number;
  maxBidNear: number;
  budgetNear: number | null;
} {
  const metadata = asRecord(opportunity.metadata);
  const nearMarket = asRecord(metadata?.nearMarket);
  const minBidNear = Math.max(0, asNumber(nearMarket?.minBidNear) ?? 0);
  const rawMaxBidNear = asNumber(nearMarket?.maxBidNear);
  const maxBidNear = rawMaxBidNear != null && rawMaxBidNear > 0 ? rawMaxBidNear : Number.POSITIVE_INFINITY;
  const budgetNear = asNumber(nearMarket?.budgetNear);
  return {
    minBidNear,
    maxBidNear,
    budgetNear: budgetNear != null && budgetNear > 0 ? budgetNear : null,
  };
}

function pickNearMarketBidAmount(payload: unknown): number | null {
  if (!Array.isArray(payload)) return null;
  let next: number | null = null;
  for (const row of payload) {
    const record = asRecord(row);
    if (!record) continue;
    const amount = asNumber(record.amount);
    if (amount == null || amount <= 0) continue;
    next = next == null ? amount : Math.min(next, amount);
  }
  return next;
}

async function maybeApplyNearMarketUndercut(params: {
  opportunity: SwarmOpportunity;
  step: MarketplaceActionStep;
  sourceHeaders: Record<string, string>;
  timeoutMs: number;
}): Promise<MarketplaceActionStep> {
  if (params.opportunity.source !== 'near_market') return params.step;
  if (params.step.name !== 'apply' || params.step.method !== 'POST') return params.step;

  const body = asRecord(params.step.body);
  if (!body) return params.step;
  const currentBidNear = asNumber(body.amount);
  if (currentBidNear == null || currentBidNear <= 0) return params.step;

  const jobId = nearMarketJobIdFromStep({
    opportunity: params.opportunity,
    step: params.step,
  });
  if (!jobId) return params.step;

  let baseUrl: string;
  try {
    const parsed = new URL(params.step.url);
    baseUrl = `${parsed.protocol}//${parsed.host}`;
  } catch {
    return params.step;
  }

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/v1/jobs/${jobId}/bids`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          ...params.sourceHeaders,
        },
      },
      params.timeoutMs
    );
    if (!response.ok) return params.step;
    const payload = await parseResponsePayload(response);
    const lowestBidNear = pickNearMarketBidAmount(payload);
    if (lowestBidNear == null || lowestBidNear <= 0) return params.step;

    const { minBidNear, maxBidNear, budgetNear } = nearMarketBidLimits(params.opportunity);
    const undercutNear = Math.max(0, lowestBidNear - 0.0001);
    let bidCapNear = maxBidNear;
    if (budgetNear != null) {
      bidCapNear = Math.min(bidCapNear, Math.max(0, budgetNear - 0.0001));
    }
    if (!Number.isFinite(bidCapNear) || bidCapNear <= 0) return params.step;

    const nextBidNear = Math.max(minBidNear, Math.min(bidCapNear, undercutNear));
    if (!Number.isFinite(nextBidNear) || nextBidNear <= 0) return params.step;
    if (nextBidNear >= currentBidNear - 0.00005) return params.step;

    return {
      ...params.step,
      body: {
        ...body,
        amount: formatNearAmount(nextBidNear),
      },
    };
  } catch {
    return params.step;
  }
}

function parseMarketplaceActionStep(name: string, value: unknown): MarketplaceActionStep | null {
  const urlFromString = asString(value);
  if (urlFromString) {
    return {
      name,
      url: urlFromString,
      method: 'POST',
      headers: {},
      required: true,
    };
  }

  const record = asRecord(value);
  if (!record) return null;

  const url = asString(record.url) ?? asString(record.endpoint) ?? asString(record.href) ?? asString(record.link);
  if (!url) return null;

  return {
    name,
    url,
    method: normalizeMethod(record.method),
    headers: toHeaders(record.headers),
    body: record.body,
    required: typeof record.required === 'boolean' ? record.required : true,
  };
}

function marketplaceActionSteps(opportunity: SwarmOpportunity): MarketplaceActionStep[] {
  if (
    opportunity.source !== 'relevance' &&
    opportunity.source !== 'agent_ai' &&
    opportunity.source !== 'kore' &&
    opportunity.source !== 'near_market'
  ) {
    return [];
  }

  const metadata = asRecord(opportunity.metadata);
  const actions = asRecord(metadata?.actions);
  const record = asRecord(metadata?.marketplaceRecord);

  const keyMap: Array<{ name: string; keys: string[] }> = [
    { name: 'apply', keys: ['apply', 'applyUrl', 'applicationUrl'] },
    { name: 'accept', keys: ['accept', 'acceptUrl'] },
    { name: 'start', keys: ['start', 'startUrl'] },
    { name: 'complete', keys: ['complete', 'completeUrl', 'submitUrl'] },
    { name: 'claim', keys: ['claim', 'claimUrl', 'payoutUrl'] },
  ];

  const steps: MarketplaceActionStep[] = [];

  for (const key of keyMap) {
    let step: MarketplaceActionStep | null = null;
    for (const candidate of key.keys) {
      if (actions && candidate in actions) {
        step = parseMarketplaceActionStep(key.name, actions[candidate]);
      }
      if (!step && record && candidate in record) {
        step = parseMarketplaceActionStep(key.name, record[candidate]);
      }
      if (step) break;
    }

    if (step) steps.push(step);
  }

  if (steps.length === 0 && opportunity.url) {
    steps.push({
      name: 'execute',
      url: opportunity.url,
      method: 'POST',
      headers: {},
      required: true,
    });
  }

  return steps;
}

function expectedRevenueSol(
  opportunity: SwarmOpportunity,
  assignment: SwarmOpportunityAssignment,
  solPriceUsd: number
): number | null {
  if (assignment.expectedRewardSol != null && assignment.expectedRewardSol > 0) {
    return assignment.expectedRewardSol;
  }
  if (opportunity.payoutSolEstimate != null && opportunity.payoutSolEstimate > 0) {
    return opportunity.payoutSolEstimate;
  }
  if (opportunity.payoutUsd != null && opportunity.payoutUsd > 0 && solPriceUsd > 0) {
    return opportunity.payoutUsd / solPriceUsd;
  }
  return null;
}

function marginCheck(params: {
  expectedRevenueSol: number | null;
  estimatedCostSol: number;
  minMarginSol: number;
  requireExpectedRevenue: boolean;
}): {
  ok: boolean;
  marginSol: number | null;
  reason?: string;
} {
  const { expectedRevenueSol, estimatedCostSol, minMarginSol, requireExpectedRevenue } = params;

  if (expectedRevenueSol == null) {
    if (requireExpectedRevenue) {
      return { ok: false, marginSol: null, reason: 'expected_revenue_unknown' };
    }
    return { ok: true, marginSol: null };
  }

  const marginSol = expectedRevenueSol - estimatedCostSol;
  if (marginSol < minMarginSol) {
    return { ok: false, marginSol, reason: 'below_profit_margin' };
  }

  return { ok: true, marginSol };
}

function marketplaceSettlementMode(opportunity: SwarmOpportunity): 'immediate' | 'deferred' {
  const metadata = asRecord(opportunity.metadata);
  const mode = asString(metadata?.settlementMode)?.toLowerCase();
  return mode === 'deferred' ? 'deferred' : 'immediate';
}

async function executeMarketplaceLifecycle(params: {
  agentId: string;
  opportunity: SwarmOpportunity;
  assignment: SwarmOpportunityAssignment;
  steps: MarketplaceActionStep[];
  timeoutMs: number;
  sourceAuth: SourceAuthMap | undefined;
  expectedRevenueSol: number | null;
  minMarginSol: number;
  estimatedFeeSol: number;
  requireExpectedRevenue: boolean;
  solPriceUsd: number;
}): Promise<SwarmJobExecutionResult> {
  const { agentId, opportunity, assignment } = params;
  const settlementMode = marketplaceSettlementMode(opportunity);
  const common = {
    agentId,
    opportunityId: opportunity.id,
    source: opportunity.source,
    endpoint: opportunity.url,
  };

  const costEstimate = params.estimatedFeeSol * Math.max(1, params.steps.length);
  const margin = marginCheck({
    expectedRevenueSol: params.expectedRevenueSol,
    estimatedCostSol: costEstimate,
    minMarginSol: params.minMarginSol,
    requireExpectedRevenue: params.requireExpectedRevenue,
  });

  if (!margin.ok) {
    return {
      ...common,
      status: 'skipped',
      reason: margin.reason,
      paid: false,
      realizedRevenueSol: 0,
      realizedRevenueUsd: 0,
      output: {
        expectedRevenueSol: params.expectedRevenueSol,
        estimatedCostSol: costEstimate,
        minMarginSol: params.minMarginSol,
        marginSol: margin.marginSol,
      },
    };
  }

  const sourceHeaders = sourceAuthHeaders(opportunity.source, params.sourceAuth);
  const stepOutputs: Array<Record<string, unknown>> = [];

  for (const rawStep of params.steps) {
    const step = await maybeApplyNearMarketUndercut({
      opportunity,
      step: rawStep,
      sourceHeaders,
      timeoutMs: params.timeoutMs,
    });
    const method = step.method;
    const mergedHeaders: Record<string, string> = {
      ...sourceHeaders,
      ...step.headers,
    };
    if (method !== 'GET' && !mergedHeaders['content-type'] && !mergedHeaders['Content-Type']) {
      mergedHeaders['Content-Type'] = 'application/json';
    }

    const bodyPayload = step.body ?? {
      opportunityId: opportunity.id,
      assignmentId: assignment.opportunityId,
      agentId,
      source: opportunity.source,
      action: step.name,
    };

    try {
      const response = await fetchWithTimeout(
        step.url,
        {
          method,
          headers: mergedHeaders,
          body: method === 'GET' ? undefined : JSON.stringify(bodyPayload),
        },
        params.timeoutMs
      );
      const payload = await parseResponsePayload(response);

      stepOutputs.push({
        action: step.name,
        url: step.url,
        status: response.status,
        ok: response.ok,
        payload,
      });

      if (!response.ok && step.required) {
        return {
          ...common,
          status: 'failed',
          reason: `marketplace_${step.name}_failed`,
          httpStatus: response.status,
          paid: false,
          realizedRevenueSol: 0,
          realizedRevenueUsd: 0,
          output: { steps: stepOutputs },
        };
      }
    } catch (error) {
      if (step.required) {
        return {
          ...common,
          status: 'failed',
          reason: `marketplace_${step.name}_error`,
          paid: false,
          realizedRevenueSol: 0,
          realizedRevenueUsd: 0,
          error: error instanceof Error ? error.message : String(error),
          output: { steps: stepOutputs },
        };
      }

      stepOutputs.push({
        action: step.name,
        url: step.url,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let revenue = { sol: 0, usd: 0 };
  for (let i = stepOutputs.length - 1; i >= 0; i -= 1) {
    const payload = stepOutputs[i].payload;
    revenue = extractRevenueFromPayload(payload, params.solPriceUsd);
    if (revenue.sol > 0 || revenue.usd > 0) break;
  }

  const realizedRevenueSol =
    revenue.sol > 0
      ? revenue.sol
      : settlementMode === 'deferred'
        ? 0
        : params.expectedRevenueSol != null
          ? params.expectedRevenueSol
          : 0;
  const realizedRevenueUsd =
    revenue.usd > 0 ? revenue.usd : realizedRevenueSol > 0 ? realizedRevenueSol * params.solPriceUsd : 0;

  return {
    ...common,
    status: 'executed',
    paid: false,
    realizedRevenueSol,
    realizedRevenueUsd,
    output: {
      steps: stepOutputs,
      settlementMode,
      estimatedCostSol: costEstimate,
      marginSol: margin.marginSol,
    },
  };
}

export async function executeAssignedOpportunity(params: {
  agentId: string;
  opportunity: SwarmOpportunity;
  assignment: SwarmOpportunityAssignment;
  signer: Keypair;
  timeoutMs: number;
  solPriceUsd: number;
  minMarginSol: number;
  estimatedFeeSol: number;
  requireExpectedRevenue: boolean;
  sourceAuth?: SourceAuthMap;
  x402Enabled: boolean;
  x402MaxPriceUsd: number;
  x402PreferredNetwork: string;
  x402FacilitatorPolicy: FacilitatorPolicy | string;
}): Promise<SwarmJobExecutionResult> {
  const { agentId, opportunity, assignment } = params;
  const metadata = asRecord(opportunity.metadata);
  const executionMode = asString(metadata?.executionMode);
  const expectedRevenue = expectedRevenueSol(opportunity, assignment, params.solPriceUsd);

  if (executionMode === 'lead') {
    return {
      agentId,
      opportunityId: opportunity.id,
      source: opportunity.source,
      status: 'skipped',
      reason: 'discovery_lead_non_executable',
      paid: false,
      realizedRevenueSol: 0,
      realizedRevenueUsd: 0,
      output: { source: opportunity.source, title: opportunity.title },
    };
  }

  const marketplaceSteps = marketplaceActionSteps(opportunity);
  if (
    marketplaceSteps.length > 0 &&
    (opportunity.source === 'relevance' ||
      opportunity.source === 'agent_ai' ||
      opportunity.source === 'kore' ||
      opportunity.source === 'near_market')
  ) {
    return executeMarketplaceLifecycle({
      agentId,
      opportunity,
      assignment,
      steps: marketplaceSteps,
      timeoutMs: params.timeoutMs,
      sourceAuth: params.sourceAuth,
      expectedRevenueSol: expectedRevenue,
      minMarginSol: params.minMarginSol,
      estimatedFeeSol: params.estimatedFeeSol,
      requireExpectedRevenue: params.requireExpectedRevenue,
      solPriceUsd: params.solPriceUsd,
    });
  }

  if (!opportunity.url) {
    return {
      agentId,
      opportunityId: opportunity.id,
      source: opportunity.source,
      status: 'skipped',
      reason: 'missing_opportunity_url',
      paid: false,
      realizedRevenueSol: 0,
      realizedRevenueUsd: 0,
    };
  }

  const request = requestConfigForOpportunity(opportunity);
  const common = {
    agentId,
    opportunityId: opportunity.id,
    source: opportunity.source,
    endpoint: opportunity.url,
  };

  const nonX402Margin = marginCheck({
    expectedRevenueSol: expectedRevenue,
    estimatedCostSol: params.estimatedFeeSol,
    minMarginSol: params.minMarginSol,
    requireExpectedRevenue: params.requireExpectedRevenue,
  });

  if (opportunity.source !== 'x402' && !nonX402Margin.ok) {
    return {
      ...common,
      status: 'skipped',
      reason: nonX402Margin.reason,
      paid: false,
      realizedRevenueSol: 0,
      realizedRevenueUsd: 0,
      output: {
        expectedRevenueSol: expectedRevenue,
        estimatedCostSol: params.estimatedFeeSol,
        minMarginSol: params.minMarginSol,
        marginSol: nonX402Margin.marginSol,
      },
    };
  }

  try {
    const initial = await fetchWithTimeout(
      opportunity.url,
      {
        method: request.method,
        headers: {
          ...sourceAuthHeaders(opportunity.source, params.sourceAuth),
          ...request.headers,
        },
        body: request.method === 'GET' ? undefined : request.body,
      },
      params.timeoutMs
    );

    if (opportunity.source === 'x402' && initial.status === 402) {
      if (!params.x402Enabled) {
        return {
          ...common,
          status: 'skipped',
          reason: 'x402_disabled',
          paid: false,
          httpStatus: initial.status,
          realizedRevenueSol: 0,
          realizedRevenueUsd: 0,
        };
      }

      const body = await parseResponsePayload(initial);
      const requirementInfo = parseX402Body(body);
      if (requirementInfo.accepts.length === 0) {
        return {
          ...common,
          status: 'failed',
          reason: 'x402_requirement_missing',
          paid: false,
          httpStatus: initial.status,
          realizedRevenueSol: 0,
          realizedRevenueUsd: 0,
          output: body,
        };
      }

      const facilitatorDecision = evaluateFacilitatorPolicy(
        requirementInfo.facilitator,
        normalizeFacilitatorPolicy(params.x402FacilitatorPolicy)
      );
      if (!facilitatorDecision.allowed) {
        return {
          ...common,
          status: 'skipped',
          reason: facilitatorDecision.reason ?? 'facilitator_policy_rejected',
          paid: false,
          httpStatus: initial.status,
          realizedRevenueSol: 0,
          realizedRevenueUsd: 0,
          output: {
            facilitator: requirementInfo.facilitator,
            policy: facilitatorDecision.policy,
          },
        };
      }

      const selectedRequirement = selectPreferredRequirement(
        requirementInfo.accepts,
        params.x402PreferredNetwork
      );
      const amountRaw = getRequirementAmountRaw(selectedRequirement);
      if (!amountRaw) {
        return {
          ...common,
          status: 'failed',
          reason: 'x402_amount_missing',
          paid: false,
          httpStatus: initial.status,
          realizedRevenueSol: 0,
          realizedRevenueUsd: 0,
        };
      }

      const amountUsd = parseUsdcAmountUsd(amountRaw);
      if (amountUsd == null || amountUsd <= 0) {
        return {
          ...common,
          status: 'failed',
          reason: 'x402_amount_invalid',
          paid: false,
          httpStatus: initial.status,
          realizedRevenueSol: 0,
          realizedRevenueUsd: 0,
        };
      }

      if (amountUsd > params.x402MaxPriceUsd) {
        return {
          ...common,
          status: 'skipped',
          reason: 'x402_price_exceeds_cap',
          paid: false,
          paymentAmountUsd: amountUsd,
          paymentNetwork: selectedRequirement.network,
          httpStatus: initial.status,
          realizedRevenueSol: 0,
          realizedRevenueUsd: 0,
        };
      }

      const x402Margin = marginCheck({
        expectedRevenueSol: expectedRevenue,
        estimatedCostSol: params.estimatedFeeSol + amountUsd / params.solPriceUsd,
        minMarginSol: params.minMarginSol,
        requireExpectedRevenue: params.requireExpectedRevenue,
      });
      if (!x402Margin.ok) {
        return {
          ...common,
          status: 'skipped',
          reason: x402Margin.reason,
          paid: false,
          paymentAmountUsd: amountUsd,
          paymentNetwork: selectedRequirement.network,
          httpStatus: initial.status,
          realizedRevenueSol: 0,
          realizedRevenueUsd: 0,
          output: {
            expectedRevenueSol: expectedRevenue,
            estimatedCostSol: params.estimatedFeeSol + amountUsd / params.solPriceUsd,
            minMarginSol: params.minMarginSol,
            marginSol: x402Margin.marginSol,
          },
        };
      }

      const transactionId = `swarm-job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const payment = createSignedPayment(params.signer, transactionId, opportunity.url, amountRaw);
      const paymentHeader = createPaymentHeader(payment, params.signer, selectedRequirement.network);

      const paidResponse = await fetchWithTimeout(
        opportunity.url,
        {
          method: request.method,
          headers: withPaymentHeaders(
            paymentHeader,
            {
              ...sourceAuthHeaders(opportunity.source, params.sourceAuth),
              ...request.headers,
            }
          ),
          body: request.method === 'GET' ? undefined : request.body,
        },
        params.timeoutMs
      );

      const payload = await parseResponsePayload(paidResponse);
      if (!paidResponse.ok) {
        return {
          ...common,
          status: 'failed',
          reason: 'x402_request_failed',
          paid: true,
          paymentAmountUsd: amountUsd,
          paymentNetwork: selectedRequirement.network,
          paymentTransactionId: transactionId,
          httpStatus: paidResponse.status,
          realizedRevenueSol: 0,
          realizedRevenueUsd: 0,
          output: payload,
        };
      }

      const revenue = extractRevenueFromPayload(payload, params.solPriceUsd);
      const realizedRevenueSol =
        revenue.sol > 0
          ? revenue.sol
          : opportunity.source === 'x402'
            ? 0
            : expectedRevenue ?? 0;
      const realizedRevenueUsd = revenue.usd > 0 ? revenue.usd : realizedRevenueSol * params.solPriceUsd;

      return {
        ...common,
        status: 'executed',
        paid: true,
        paymentAmountUsd: amountUsd,
        paymentNetwork: selectedRequirement.network,
        paymentTransactionId: transactionId,
        httpStatus: paidResponse.status,
        realizedRevenueSol,
        realizedRevenueUsd,
        output: payload,
      };
    }

    const payload = await parseResponsePayload(initial);
    if (!initial.ok) {
      return {
        ...common,
        status: 'failed',
        reason: 'request_failed',
        paid: false,
        httpStatus: initial.status,
        realizedRevenueSol: 0,
        realizedRevenueUsd: 0,
        output: payload,
      };
    }

    const revenue = extractRevenueFromPayload(payload, params.solPriceUsd);
    const realizedRevenueSol =
      revenue.sol > 0
        ? revenue.sol
        : opportunity.source === 'x402'
          ? 0
          : expectedRevenue ?? 0;
    const realizedRevenueUsd = revenue.usd > 0 ? revenue.usd : realizedRevenueSol * params.solPriceUsd;

    return {
      ...common,
      status: 'executed',
      paid: false,
      httpStatus: initial.status,
      realizedRevenueSol,
      realizedRevenueUsd,
      output: payload,
    };
  } catch (error) {
    return {
      ...common,
      status: 'failed',
      reason: 'request_error',
      paid: false,
      realizedRevenueSol: 0,
      realizedRevenueUsd: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
