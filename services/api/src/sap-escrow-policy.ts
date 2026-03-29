import { PublicKey } from '@solana/web3.js';

function parseConfiguredList(configured: string | undefined): string[] {
  return [...new Set(
    (configured || '')
      .split(/[,\n]/)
      .map((value) => value.trim())
      .filter(Boolean)
  )];
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getSapEscrowAllowedApis(): string[] {
  return parseConfiguredList(process.env.SAP_ESCROW_ALLOWED_APIS);
}

export function getSapEscrowMaxAmountSol(): number {
  return parsePositiveNumber(process.env.SAP_ESCROW_MAX_AMOUNT_SOL, 0);
}

export function isSapEscrowExecutionEnabled(): boolean {
  return getSapEscrowAllowedApis().length > 0 && getSapEscrowMaxAmountSol() > 0;
}

export function validateSapEscrowArgs(args: Record<string, unknown>):
  | { ok: true }
  | { ok: false; statusCode: number; code: string; message: string } {
  if (!isSapEscrowExecutionEnabled()) {
    return {
      ok: false,
      statusCode: 503,
      code: 'SAP_ESCROW_DISABLED',
      message: 'SAP create_escrow is disabled until allowlisted APIs and a spend cap are configured',
    };
  }

  const api = typeof args.api === 'string' ? args.api.trim() : '';
  if (!api) {
    return {
      ok: false,
      statusCode: 400,
      code: 'INVALID_REQUEST',
      message: 'api provider address is required',
    };
  }

  try {
    new PublicKey(api);
  } catch {
    return {
      ok: false,
      statusCode: 400,
      code: 'INVALID_REQUEST',
      message: 'api provider address must be a valid Solana public key',
    };
  }

  const allowedApis = new Set(getSapEscrowAllowedApis());
  if (!allowedApis.has(api)) {
    return {
      ok: false,
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'api provider is not allowlisted for SAP escrow execution',
    };
  }

  const amount = args.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      statusCode: 400,
      code: 'INVALID_REQUEST',
      message: 'amount must be a positive number',
    };
  }

  const maxAmountSol = getSapEscrowMaxAmountSol();
  if (amount > maxAmountSol) {
    return {
      ok: false,
      statusCode: 403,
      code: 'FORBIDDEN',
      message: `amount exceeds SAP escrow max of ${maxAmountSol} SOL`,
    };
  }

  return { ok: true };
}
