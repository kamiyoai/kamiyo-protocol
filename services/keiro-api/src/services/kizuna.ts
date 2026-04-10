import type { Agent, Job } from '../types/index.js';

type KizunaLane = 'enterprise' | 'crypto-fast';

type ReserveJobHoldResponse = {
  escrowRef: string;
  decisionId: string;
  lane: KizunaLane;
  poolId: string;
  amountMicro: string;
  fundingMode: string;
};

type SettleJobHoldResponse = {
  settlementRef: string;
  debtId: string | null;
  billableEventId: string | null;
};

function getBaseUrl(): string {
  return (
    process.env.KEIRO_KIZUNA_INTERNAL_URL?.trim() ||
    process.env.KIZUNA_INTERNAL_URL?.trim() ||
    process.env.FACILITATOR_URL?.trim() ||
    ''
  ).replace(/\/+$/, '');
}

function getToken(): string {
  return process.env.KEIRO_KIZUNA_INTERNAL_TOKEN?.trim() || process.env.KIZUNA_INTERNAL_TOKEN?.trim() || '';
}

function toAmountMicro(payment: number): string {
  return Math.max(0, Math.round(payment * 1_000_000)).toString();
}

function getLane(): KizunaLane {
  return process.env.KEIRO_KIZUNA_LANE === 'crypto-fast' ? 'crypto-fast' : 'enterprise';
}

function getNetwork(): string {
  return process.env.KEIRO_KIZUNA_NETWORK?.trim() || 'solana';
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const baseUrl = getBaseUrl();
  const token = getToken();
  if (!baseUrl || !token) {
    throw new Error('kizuna_unavailable');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let error = `kizuna_http_${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) error = payload.error;
    } catch {
      // ignore parse failures
    }
    throw new Error(error);
  }

  return response.json() as Promise<T>;
}

export function isKizunaJobSettlementConfigured(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  return getBaseUrl() !== '' && getToken() !== '';
}

export async function reserveJobHold(params: {
  job: Job;
  agent: Agent;
  idempotencyKey: string;
}): Promise<ReserveJobHoldResponse> {
  if (process.env.NODE_ENV === 'test') {
    return {
      escrowRef: `kizuna_res_${params.job.id}`,
      decisionId: `kizuna_decision_${params.job.id}`,
      lane: getLane(),
      poolId: process.env.KEIRO_KIZUNA_POOL_ID?.trim() || 'enterprise-main',
      amountMicro: toAmountMicro(params.job.payment),
      fundingMode: 'none',
    };
  }

  return postJson<ReserveJobHoldResponse>('/kizuna/internal/jobs/reservations', {
    agentId: params.agent.id,
    payerWallet: params.agent.walletAddress,
    jobId: params.job.id,
    requestNonce: params.idempotencyKey,
    network: getNetwork(),
    lane: getLane(),
    poolId: process.env.KEIRO_KIZUNA_POOL_ID?.trim() || null,
    amountMicro: toAmountMicro(params.job.payment),
    paymentToken: params.job.paymentToken,
  });
}

export async function releaseJobHold(params: {
  escrowRef: string;
  reason?: 'released' | 'expired';
}): Promise<void> {
  if (process.env.NODE_ENV === 'test') return;

  await postJson('/kizuna/internal/jobs/reservations/release', {
    reservationId: params.escrowRef,
    reason: params.reason || 'released',
  });
}

export async function settleJobHold(params: {
  job: Job;
  escrowRef: string;
  auditRef: string;
}): Promise<SettleJobHoldResponse> {
  if (process.env.NODE_ENV === 'test') {
    return {
      settlementRef: `kizuna_settlement_${params.job.id}`,
      debtId: `kizuna_debt_${params.job.id}`,
      billableEventId: `kizuna_billable_${params.job.id}`,
    };
  }

  return postJson<SettleJobHoldResponse>('/kizuna/internal/jobs/reservations/settle', {
    reservationId: params.escrowRef,
    merchantWallet: params.job.posterAddress,
    amount: params.job.payment,
    paymentToken: params.job.paymentToken,
    auditRef: params.auditRef,
    feeAmount: 0,
  });
}
