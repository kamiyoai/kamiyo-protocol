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
  bidderAgentId?: string;
  amountNear?: number;
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
        authorization: /^bearer\s+/i.test(params.apiKey)
          ? params.apiKey
          : `Bearer ${params.apiKey}`,
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
      bidderAgentId: asString(row.bidder_agent_id) ?? asString(row.bidderAgentId),
      amountNear: asNumber(row.amount),
    });
  }

  return bids;
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
