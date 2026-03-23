import { createHash } from 'crypto';

export type KizunaLane = 'enterprise' | 'crypto-fast';

export interface KizunaRequestHashInput {
  agentId: string;
  repayWallet: string;
  payerWallet: string;
  requestNonce: string;
  network: string;
  requestedMicro: string;
  resource?: string | null;
  payTo?: string | null;
  lane: KizunaLane;
  poolId: string;
  collateralAccount?: string | null;
}

type UnknownRecord = Record<string, unknown>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (!value || typeof value !== 'object') return value;

  const record = value as UnknownRecord;
  const sorted: UnknownRecord = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = canonicalize(record[key]);
  }
  return sorted;
}

export function canonicalString(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function hashKizunaRequest(input: KizunaRequestHashInput): string {
  const normalized = {
    agentId: input.agentId.trim(),
    repayWallet: input.repayWallet.trim(),
    payerWallet: input.payerWallet.trim(),
    requestNonce: input.requestNonce.trim(),
    network: input.network.trim(),
    requestedMicro: input.requestedMicro.trim(),
    resource: input.resource?.trim() || '',
    payTo: input.payTo?.trim() || '',
    lane: input.lane,
    poolId: input.poolId.trim(),
    collateralAccount: input.collateralAccount?.trim() || '',
  };

  return createHash('sha256').update(canonicalString(normalized)).digest('hex');
}
