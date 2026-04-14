import { createHash } from 'node:crypto';
import type { Job } from '../types/index.js';

const DELIVERY_UNIT_ID = 'delivery';
const DELIVERY_GOAL_ID = 'goal_delivery_paid_jobs';

type CompanyTicketPayload = {
  ticketId?: string;
  source: string;
  sourceRef: string;
  unitId: string;
  goalId?: string;
  title: string;
  description?: string;
  status?: string;
  priority?: number;
  expectedGrossUsd?: number;
  expectedCostUsd?: number;
  expectedNetUsd?: number;
  confidence?: number;
  urgency?: number;
  requiresApproval?: boolean;
  approvalReason?: string;
  assignedAgentId?: string | null;
  executionPath?: string;
  metadata?: Record<string, unknown>;
};

type CompanyTicketEventPayload = {
  eventType: string;
  status?: string;
  source?: string;
  sourceRef?: string;
  receiptId?: string | null;
  settlementRef?: string | null;
  idempotencyKey?: string | null;
  payload?: Record<string, unknown>;
};

function buildCompanyUrl(path: string): string {
  const baseUrl =
    process.env.KEIRO_COMPANION_INTERNAL_URL?.trim() ||
    process.env.COMPANION_INTERNAL_URL?.trim() ||
    process.env.COMPANION_API_URL?.trim() ||
    '';
  if (!baseUrl) return '';
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function getCompanyToken(): string {
  return (
    process.env.KEIRO_COMPANY_INTERNAL_TOKEN?.trim() ||
    process.env.COMPANY_INTERNAL_TOKEN?.trim() ||
    process.env.REVENUE_INTERNAL_TOKEN?.trim() ||
    process.env.COMPANION_INTERNAL_TOKEN?.trim() ||
    ''
  );
}

function paymentUsd(job: Job): number {
  return Number.isFinite(job.payment) ? job.payment : 0;
}

async function postCompany(path: string, payload: Record<string, unknown>): Promise<void> {
  const url = buildCompanyUrl(path);
  const token = getCompanyToken();
  if (!url || !token) return;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(body || `company_http_${response.status}`);
    }
  } catch (error) {
    console.error('Failed to sync company control plane', {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function getKeiroCompanyTicketId(jobId: string): string {
  const digest = createHash('sha256')
    .update(`keiro-job:${jobId.trim()}`)
    .digest('hex')
    .slice(0, 18);
  return `ctk_${digest}`;
}

export function getKeiroCompanyGoalId(): string {
  return DELIVERY_GOAL_ID;
}

export async function syncKeiroJobTicket(
  job: Job,
  overrides: Partial<CompanyTicketPayload> = {}
): Promise<string> {
  const ticketId = overrides.ticketId || getKeiroCompanyTicketId(job.id);
  const expectedGrossUsd = paymentUsd(job);
  const expectedCostUsd = overrides.expectedCostUsd ?? 0;
  const expectedNetUsd =
    overrides.expectedNetUsd ?? (expectedGrossUsd > 0 ? expectedGrossUsd - expectedCostUsd : 0);

  await postCompany('/api/internal/company/tickets', {
    ticketId,
    source: 'keiro-job',
    sourceRef: job.id,
    unitId: DELIVERY_UNIT_ID,
    goalId: DELIVERY_GOAL_ID,
    title: overrides.title ?? job.title,
    description: overrides.description ?? job.description,
    status: overrides.status ?? job.status,
    priority: overrides.priority ?? 7,
    expectedGrossUsd: overrides.expectedGrossUsd ?? expectedGrossUsd,
    expectedCostUsd,
    expectedNetUsd,
    confidence: overrides.confidence ?? 0.65,
    urgency: overrides.urgency ?? (job.status === 'open' ? 0.55 : 0.75),
    requiresApproval: overrides.requiresApproval ?? false,
    approvalReason: overrides.approvalReason,
    assignedAgentId: overrides.assignedAgentId ?? job.assignedAgent ?? null,
    executionPath: overrides.executionPath ?? 'keiro',
    metadata: {
      poster: job.poster,
      posterAddress: job.posterAddress,
      payment: job.payment,
      paymentToken: job.paymentToken,
      requiredTier: job.requiredTier,
      minimumCreditScore: job.minimumCreditScore,
      objectiveSpec: job.objectiveSpec,
      ...overrides.metadata,
    },
  });

  return ticketId;
}

export async function syncKeiroJobEvent(
  job: Job,
  payload: CompanyTicketEventPayload
): Promise<string> {
  const ticketId = getKeiroCompanyTicketId(job.id);
  await syncKeiroJobTicket(job, {
    status: payload.status ?? job.status,
    assignedAgentId: job.assignedAgent ?? null,
  });
  await postCompany(`/api/internal/company/tickets/${ticketId}/events`, {
    eventType: payload.eventType,
    status: payload.status ?? job.status,
    source: payload.source ?? 'keiro',
    sourceRef: payload.sourceRef ?? job.id,
    receiptId: payload.receiptId ?? null,
    settlementRef: payload.settlementRef ?? null,
    idempotencyKey: payload.idempotencyKey ?? null,
    payload: payload.payload ?? {},
  });
  return ticketId;
}
