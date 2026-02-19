import { Connection, Keypair, Transaction } from '@solana/web3.js';

type JsonObject = Record<string, unknown>;

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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as JsonObject;

  if (!response.ok) {
    const error = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`;
    throw new Error(error);
  }

  return payload as T;
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
}): Promise<FundryUserPosition> {
  const { apiBase, poolAddress, wallet } = params;
  const base = normalizeApiBase(apiBase);
  const query = new URLSearchParams({ wallet }).toString();
  return fetchJson<FundryUserPosition>(`${base}/api/staking/pools/${poolAddress}/user-position?${query}`);
}

export async function claimFundryStakingPeriods(params: {
  connection: Connection;
  apiBase: string;
  poolAddress: string;
  signer: Keypair;
  periodNumbers: number[];
}): Promise<FundryClaimResult[]> {
  const { connection, apiBase, poolAddress, signer } = params;
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
      }
    );

    const tx = Transaction.from(Buffer.from(prepared.transaction, 'base64'));
    tx.partialSign(signer);
    const signedTxBase64 = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString('base64');

    const submitResult = await fetchJson<unknown>(`${base}/api/staking/stake/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction: signedTxBase64 }),
    });

    const signature = extractSignature(submitResult);
    if (signature) {
      await connection.confirmTransaction(signature, 'confirmed').catch(() => null);
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
