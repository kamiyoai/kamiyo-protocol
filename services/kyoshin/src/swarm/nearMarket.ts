type NearMarketJob = {
  jobId: string;
  title: string;
  workerAgentId: string;
  awardedBidId?: string;
  budgetAmount?: number;
  budgetToken?: string;
  completedAt: string;
  raw: Record<string, unknown>;
};

type NearMarketBid = {
  bidId: string;
  jobId?: string;
  status?: string;
  bidderAgentId?: string;
  amountNear?: number;
};

export type NearMarketAcceptedBid = {
  bidId: string;
  jobId: string;
  amountNear: number | null;
};

export type NearMarketTrackedBid = {
  bidId: string;
  jobId: string;
  status: string;
  amountNear: number | null;
};

export type NearMarketAssignment = {
  assignmentId: string;
  status: string;
  deliverableUrl?: string;
  deliverableHash?: string;
};

export type NearMarketJobDetail = {
  jobId: string;
  title: string;
  description: string;
  status: string;
  myAssignments: NearMarketAssignment[];
  raw: Record<string, unknown>;
};

export type NearMarketSettlement = {
  settlementId: string;
  jobId: string;
  jobTitle: string;
  bidId?: string;
  amountNear: number;
  amountUsd: number;
  amountSol: number;
  completedAt: string;
  raw: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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

async function fetchJson(params: {
  url: string;
  apiKey: string;
  timeoutMs: number;
}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const response = await fetch(params.url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: /^bearer\s+/i.test(params.apiKey) ? params.apiKey : `Bearer ${params.apiKey}`,
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

async function postJson(params: {
  url: string;
  apiKey: string;
  timeoutMs: number;
  body: unknown;
}): Promise<{ status: number; payload: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const response = await fetch(params.url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: /^bearer\s+/i.test(params.apiKey) ? params.apiKey : `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(params.body),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload: unknown = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { text };
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return { status: response.status, payload };
  } finally {
    clearTimeout(timer);
  }
}

function parseCompletedJobs(payload: unknown): NearMarketJob[] {
  if (!Array.isArray(payload)) return [];
  const jobs: NearMarketJob[] = [];

  for (const item of payload) {
    const row = asRecord(item);
    if (!row) continue;
    const jobId = asString(row.job_id) ?? asString(row.jobId);
    const title = asString(row.title) ?? 'Untitled job';
    const workerAgentId = asString(row.worker_agent_id) ?? asString(row.workerAgentId);
    const completedAt =
      asString(row.updated_at) ??
      asString(row.updatedAt) ??
      asString(row.created_at) ??
      asString(row.createdAt);
    if (!jobId || !workerAgentId || !completedAt) continue;

    jobs.push({
      jobId,
      title,
      workerAgentId,
      awardedBidId: asString(row.awarded_bid_id) ?? asString(row.awardedBidId),
      budgetAmount: asNumber(row.budget_amount) ?? asNumber(row.budgetAmount),
      budgetToken: asString(row.budget_token) ?? asString(row.budgetToken),
      completedAt: new Date(completedAt).toISOString(),
      raw: row,
    });
  }

  return jobs;
}

function parseJobBids(payload: unknown): NearMarketBid[] {
  if (!Array.isArray(payload)) return [];
  const bids: NearMarketBid[] = [];

  for (const item of payload) {
    const row = asRecord(item);
    if (!row) continue;
    const bidId = asString(row.bid_id) ?? asString(row.bidId) ?? asString(row.id);
    if (!bidId) continue;
    bids.push({
      bidId,
      jobId: asString(row.job_id) ?? asString(row.jobId),
      status: asString(row.status),
      bidderAgentId: asString(row.bidder_agent_id) ?? asString(row.bidderAgentId),
      amountNear: asNumber(row.amount),
    });
  }

  return bids;
}

function parseAcceptedBids(payload: unknown): NearMarketAcceptedBid[] {
  return parseJobBids(payload)
    .filter(bid => bid.status === 'accepted' && bid.jobId)
    .map(bid => ({
      bidId: bid.bidId,
      jobId: bid.jobId as string,
      amountNear: bid.amountNear ?? null,
    }));
}

function parseJobDetail(payload: unknown): NearMarketJobDetail | null {
  const row = asRecord(payload);
  if (!row) return null;
  const jobId = asString(row.job_id) ?? asString(row.jobId);
  if (!jobId) return null;

  const assignmentsRaw = Array.isArray(row.my_assignments)
    ? row.my_assignments
    : Array.isArray(row.myAssignments)
      ? row.myAssignments
      : [];
  const myAssignments: NearMarketAssignment[] = [];
  for (const item of assignmentsRaw) {
    const assignment = asRecord(item);
    if (!assignment) continue;
    const assignmentId =
      asString(assignment.assignment_id) ?? asString(assignment.assignmentId) ?? '';
    const status = asString(assignment.status) ?? 'unknown';
    if (!assignmentId) continue;
    myAssignments.push({
      assignmentId,
      status,
      deliverableUrl: asString(assignment.deliverable_url) ?? asString(assignment.deliverableUrl),
      deliverableHash: asString(assignment.deliverable_hash) ?? asString(assignment.deliverableHash),
    });
  }

  return {
    jobId,
    title: asString(row.title) ?? 'Untitled job',
    description: asString(row.description) ?? '',
    status: asString(row.status) ?? 'unknown',
    myAssignments,
    raw: row,
  };
}

export async function listNearMarketAcceptedBids(params: {
  baseUrl: string;
  apiKey: string;
  limit: number;
  timeoutMs: number;
}): Promise<NearMarketAcceptedBid[]> {
  const payload = await fetchJson({
    url: `${params.baseUrl}/v1/agents/me/bids?limit=${Math.max(1, Math.min(300, params.limit))}`,
    apiKey: params.apiKey,
    timeoutMs: params.timeoutMs,
  });
  return parseAcceptedBids(payload);
}

export async function listNearMarketTrackedBids(params: {
  baseUrl: string;
  apiKey: string;
  limit: number;
  timeoutMs: number;
  statuses?: string[];
}): Promise<NearMarketTrackedBid[]> {
  const payload = await fetchJson({
    url: `${params.baseUrl}/v1/agents/me/bids?limit=${Math.max(1, Math.min(300, params.limit))}`,
    apiKey: params.apiKey,
    timeoutMs: params.timeoutMs,
  });
  const statusFilter = new Set((params.statuses ?? []).map(status => status.toLowerCase()).filter(Boolean));
  return parseJobBids(payload)
    .filter(bid => Boolean(bid.jobId))
    .filter(bid =>
      statusFilter.size === 0
        ? true
        : statusFilter.has((bid.status ?? '').toLowerCase())
    )
    .map(bid => ({
      bidId: bid.bidId,
      jobId: bid.jobId as string,
      status: bid.status ?? 'unknown',
      amountNear: bid.amountNear ?? null,
    }));
}

export async function fetchNearMarketJobDetail(params: {
  baseUrl: string;
  apiKey: string;
  jobId: string;
  timeoutMs: number;
}): Promise<NearMarketJobDetail | null> {
  const payload = await fetchJson({
    url: `${params.baseUrl}/v1/jobs/${params.jobId}`,
    apiKey: params.apiKey,
    timeoutMs: params.timeoutMs,
  });
  return parseJobDetail(payload);
}

export async function submitNearMarketDeliverable(params: {
  baseUrl: string;
  apiKey: string;
  jobId: string;
  deliverableUrl: string;
  deliverableHash: string;
  timeoutMs: number;
}): Promise<{ status: number; payload: unknown }> {
  return postJson({
    url: `${params.baseUrl}/v1/jobs/${params.jobId}/submit`,
    apiKey: params.apiKey,
    timeoutMs: params.timeoutMs,
    body: {
      deliverable_url: params.deliverableUrl,
      deliverable_hash: params.deliverableHash,
    },
  });
}

export async function withdrawNearMarketBid(params: {
  baseUrl: string;
  apiKey: string;
  bidId: string;
  timeoutMs: number;
}): Promise<{ status: number; payload: unknown }> {
  return postJson({
    url: `${params.baseUrl}/v1/bids/${params.bidId}/withdraw`,
    apiKey: params.apiKey,
    timeoutMs: params.timeoutMs,
    body: {},
  });
}

async function resolveBidAmountNear(params: {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  job: NearMarketJob;
  agentId: string;
}): Promise<{ amountNear: number | null; bidId?: string }> {
  const bidsPayload = await fetchJson({
    url: `${params.baseUrl}/v1/jobs/${params.job.jobId}/bids`,
    apiKey: params.apiKey,
    timeoutMs: params.timeoutMs,
  });
  const bids = parseJobBids(bidsPayload);
  if (bids.length === 0) return { amountNear: null };

  if (params.job.awardedBidId) {
    const awarded = bids.find(bid => bid.bidId === params.job.awardedBidId) ?? null;
    if (awarded?.amountNear != null && awarded.amountNear > 0) {
      return { amountNear: awarded.amountNear, bidId: awarded.bidId };
    }
  }

  const mine = bids.find(bid => bid.bidderAgentId === params.agentId && bid.amountNear != null) ?? null;
  if (mine?.amountNear != null && mine.amountNear > 0) {
    return { amountNear: mine.amountNear, bidId: mine.bidId };
  }

  return { amountNear: null };
}

export async function collectNearMarketSettlements(params: {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  limit: number;
  timeoutMs: number;
  nearPriceUsd: number;
  solPriceUsd: number;
}): Promise<NearMarketSettlement[]> {
  const jobsPayload = await fetchJson({
    url:
      `${params.baseUrl}/v1/jobs?worker_agent_id=${encodeURIComponent(params.agentId)}` +
      `&status=completed&sort=updated_at&order=desc&limit=${Math.max(1, Math.min(100, params.limit))}`,
    apiKey: params.apiKey,
    timeoutMs: params.timeoutMs,
  });
  const jobs = parseCompletedJobs(jobsPayload);

  const settlements: NearMarketSettlement[] = [];
  for (const job of jobs) {
    if (job.workerAgentId !== params.agentId) continue;

    let amountNear: number | null = null;
    let bidId = job.awardedBidId;
    try {
      const resolved = await resolveBidAmountNear({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        timeoutMs: params.timeoutMs,
        job,
        agentId: params.agentId,
      });
      amountNear = resolved.amountNear;
      bidId = resolved.bidId ?? bidId;
    } catch {
      amountNear = null;
    }

    if (amountNear == null || amountNear <= 0) {
      const token = (job.budgetToken ?? '').toUpperCase();
      if (token === 'NEAR' && job.budgetAmount != null && job.budgetAmount > 0) {
        amountNear = job.budgetAmount;
      } else {
        continue;
      }
    }

    const amountUsd = amountNear * params.nearPriceUsd;
    const amountSol = params.solPriceUsd > 0 ? amountUsd / params.solPriceUsd : 0;
    if (!Number.isFinite(amountSol) || amountSol <= 0) continue;

    settlements.push({
      settlementId: `${job.jobId}:${bidId ?? 'unknown'}`,
      jobId: job.jobId,
      jobTitle: job.title,
      bidId,
      amountNear,
      amountUsd,
      amountSol,
      completedAt: job.completedAt,
      raw: job.raw,
    });
  }

  return settlements;
}
