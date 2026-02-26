import { Connection, Keypair, Transaction } from '@solana/web3.js';

type JsonObject = Record<string, unknown>;
const DEFAULT_HTTP_TIMEOUT_MS = 15_000;
const DEFAULT_CONFIRM_TIMEOUT_MS = 30_000;
const DEFAULT_HTTP_RETRY_ATTEMPTS = 3;
const DEFAULT_HTTP_RETRY_BASE_DELAY_MS = 350;
const DEFAULT_HTTP_RETRY_MAX_DELAY_MS = 5_000;
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

type HttpError = Error & {
  status?: number;
  retryAfterMs?: number;
  retryable?: boolean;
};

type FetchJsonInit = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  retryLabel?: string;
};

export type FundryClaimablePeriod = {
  periodNumber: number;
  amountRaw?: string;
  amount?: number;
  amountFormatted?: string;
};

export type FundryUserPosition = {
  wallet: string;
  poolAddress: string;
  rewards: {
    claimablePeriods: FundryClaimablePeriod[];
    totalClaimable: number | string;
    totalClaimableRaw?: string;
    totalClaimableFormatted?: string;
  };
};

export type FundryClaimResult = {
  periodNumber: number;
  signature: string | null;
  amountFormatted?: string;
  submitResult: unknown;
};

function normalizeApiBase(apiBase: string): string {
  return apiBase.replace(/\/+$/, '');
}

async function fetchJson<T>(
  url: string,
  init?: FetchJsonInit
): Promise<T> {
  const {
    timeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
    retries = DEFAULT_HTTP_RETRY_ATTEMPTS,
    retryBaseDelayMs = DEFAULT_HTTP_RETRY_BASE_DELAY_MS,
    retryMaxDelayMs = DEFAULT_HTTP_RETRY_MAX_DELAY_MS,
    retryLabel = 'fundry_http',
    ...requestInit
  } = init ?? {};
  const maxRetries = Math.max(0, Math.trunc(retries));
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...requestInit,
        signal: controller.signal,
      });
      const raw = await response.text();
      const payload = parseJsonPayload(raw);
      const payloadObj = asJsonObject(payload);

      if (!response.ok) {
        const error = new Error(
          typeof payloadObj.error === 'string' ? payloadObj.error : `HTTP ${response.status}`
        ) as HttpError;
        error.status = response.status;
        error.retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
        error.retryable = RETRYABLE_HTTP_STATUSES.has(response.status);
        throw error;
      }

      return payload as T;
    } catch (error) {
      const normalized = normalizeFetchError(error, timeoutMs);
      const shouldRetry = attempt < maxRetries && isRetryableError(normalized);
      if (!shouldRetry) {
        throw normalized;
      }
      const backoffMs = computeRetryDelayMs({
        error: normalized,
        attempt,
        retryBaseDelayMs,
        retryMaxDelayMs,
      });
      const statusSuffix =
        isHttpError(normalized) && normalized.status ? ` status=${normalized.status}` : '';
      console.warn(
        `[fundry-staking] retry ${retryLabel} attempt=${attempt + 1}/${maxRetries}${statusSuffix} waitMs=${backoffMs}`
      );
      await sleep(backoffMs);
      lastError = normalized;
    } finally {
      clearTimeout(timer);
    }
  }

  throw (lastError instanceof Error ? lastError : new Error(String(lastError)));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (timeoutMs <= 0) return promise;
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function extractSignature(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const data = result as JsonObject;
  const signature =
    typeof data.signature === 'string'
      ? data.signature
      : typeof data.txSignature === 'string'
        ? data.txSignature
        : typeof data.transactionSignature === 'string'
          ? data.transactionSignature
          : null;
  return signature;
}

function parseLamportsString(value: unknown): bigint | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return BigInt(trimmed);
}

function parseLamportsNumber(value: unknown): bigint | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  if (Number.isInteger(value) && value >= 1_000_000) return BigInt(value);
  return BigInt(Math.floor(value * 1e9));
}

function parseJsonPayload(raw: string): unknown {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function asJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object') return {};
  return value as JsonObject;
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return;
  const trimmed = value.trim();
  if (!trimmed) return;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const dateMs = Date.parse(trimmed);
  if (!Number.isFinite(dateMs)) return;
  const delay = dateMs - Date.now();
  if (delay <= 0) return;
  return delay;
}

function isHttpError(error: unknown): error is HttpError {
  if (!(error instanceof Error)) return false;
  return (
    typeof (error as HttpError).status === 'number' ||
    typeof (error as HttpError).retryable === 'boolean'
  );
}

function normalizeFetchError(error: unknown, timeoutMs: number): Error {
  if (error instanceof Error && error.name === 'AbortError') {
    const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`) as HttpError;
    timeoutError.retryable = true;
    return timeoutError;
  }
  if (error instanceof Error) return error;
  return new Error(String(error));
}

function isRetryableError(error: Error): boolean {
  if (isHttpError(error)) {
    if (error.retryable === true) return true;
    if (typeof error.status === 'number') return RETRYABLE_HTTP_STATUSES.has(error.status);
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('socket')
  );
}

function computeRetryDelayMs(params: {
  error: Error;
  attempt: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
}): number {
  const { error, attempt, retryBaseDelayMs, retryMaxDelayMs } = params;
  if (isHttpError(error) && typeof error.retryAfterMs === 'number' && error.retryAfterMs > 0) {
    return Math.min(error.retryAfterMs, retryMaxDelayMs);
  }

  const raw = Math.min(retryBaseDelayMs * Math.pow(2, attempt), retryMaxDelayMs);
  const jitter = raw * (0.5 + Math.random() * 0.5);
  return Math.max(25, Math.round(jitter));
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getClaimableLamports(position: FundryUserPosition): bigint {
  const rewards = position.rewards ?? ({} as FundryUserPosition['rewards']);

  const byRawTotal = parseLamportsString(rewards.totalClaimableRaw);
  if (byRawTotal != null) return byRawTotal;

  const byRawPeriods = (rewards.claimablePeriods ?? [])
    .map(period => parseLamportsString(period.amountRaw))
    .reduce<bigint>((sum, lamports) => sum + (lamports ?? 0n), 0n);
  if (byRawPeriods > 0n) return byRawPeriods;

  const fromTotalString = parseLamportsString(rewards.totalClaimable);
  if (fromTotalString != null) return fromTotalString;

  const fromTotalNumber = parseLamportsNumber(rewards.totalClaimable);
  if (fromTotalNumber != null) return fromTotalNumber;

  const fromPeriodNumbers = (rewards.claimablePeriods ?? [])
    .map(period => parseLamportsNumber(period.amount))
    .reduce<bigint>((sum, lamports) => sum + (lamports ?? 0n), 0n);
  return fromPeriodNumbers;
}

export async function readFundryUserPosition(params: {
  apiBase: string;
  poolAddress: string;
  wallet: string;
  timeoutMs?: number;
  retries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
}): Promise<FundryUserPosition> {
  const { apiBase, poolAddress, wallet, timeoutMs, retries, retryBaseDelayMs, retryMaxDelayMs } =
    params;
  const base = normalizeApiBase(apiBase);
  const query = new URLSearchParams({ wallet }).toString();
  return fetchJson<FundryUserPosition>(
    `${base}/api/staking/pools/${poolAddress}/user-position?${query}`,
    {
      timeoutMs,
      retries,
      retryBaseDelayMs,
      retryMaxDelayMs,
      retryLabel: 'read_user_position',
    }
  );
}

export async function claimFundryStakingPeriods(params: {
  connection: Connection;
  apiBase: string;
  poolAddress: string;
  signer: Keypair;
  periodNumbers: number[];
  requestTimeoutMs?: number;
  confirmTimeoutMs?: number;
  retries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
}): Promise<FundryClaimResult[]> {
  const {
    connection,
    apiBase,
    poolAddress,
    signer,
    requestTimeoutMs,
    confirmTimeoutMs = DEFAULT_CONFIRM_TIMEOUT_MS,
    retries,
    retryBaseDelayMs,
    retryMaxDelayMs,
  } = params;
  const base = normalizeApiBase(apiBase);
  const claims: FundryClaimResult[] = [];
  const uniquePeriods = [...new Set(params.periodNumbers)].filter(n => Number.isInteger(n) && n >= 0);

  for (const periodNumber of uniquePeriods) {
    const prepared = await fetchJson<{ transaction: string; amountFormatted?: string }>(
      `${base}/api/staking/periods/claim`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: signer.publicKey.toBase58(),
          poolAddress,
          periodNumber,
        }),
        timeoutMs: requestTimeoutMs,
        retries,
        retryBaseDelayMs,
        retryMaxDelayMs,
        retryLabel: `prepare_claim:${periodNumber}`,
      }
    );

    const tx = Transaction.from(Buffer.from(prepared.transaction, 'base64'));
    tx.partialSign(signer);
    const signedTxBase64 = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString('base64');

    const submitResult = await fetchJson<unknown>(`${base}/api/staking/stake/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction: signedTxBase64 }),
      timeoutMs: requestTimeoutMs,
      retries,
      retryBaseDelayMs,
      retryMaxDelayMs,
      retryLabel: `submit_claim:${periodNumber}`,
    });

    const signature = extractSignature(submitResult);
    if (signature) {
      await withTimeout(
        connection.confirmTransaction(signature, 'confirmed').catch(() => null),
        confirmTimeoutMs,
        `confirm transaction timed out after ${confirmTimeoutMs}ms`
      ).catch(() => null);
    }

    claims.push({
      periodNumber,
      signature,
      amountFormatted: prepared.amountFormatted,
      submitResult,
    });
  }

  return claims;
}
