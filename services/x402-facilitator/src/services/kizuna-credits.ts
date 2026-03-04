import { getConfig } from '../config';

export type KizunaCreditsDebitResult = {
  debitedMicro: string;
  balanceMicro: string;
  idempotent: boolean;
};

function getCreditsInternalBaseUrl(): string {
  const config = getConfig();
  const raw = config.CREDITS_INTERNAL_URL.replace(/\/+$/, '');
  if (raw.endsWith('/api/credits/internal')) return raw;
  if (raw.endsWith('/api/credits')) return `${raw}/internal`;
  return `${raw}/api/credits/internal`;
}

export async function getKizunaCreditsBalance(wallet: string): Promise<bigint> {
  const config = getConfig();
  const response = await fetch(
    `${getCreditsInternalBaseUrl()}/balance?wallet=${encodeURIComponent(wallet)}`,
    {
      method: 'GET',
      headers: {
        authorization: `Bearer ${config.KIZUNA_INTERNAL_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload && typeof payload === 'object' && typeof (payload as any).error?.message === 'string'
        ? (payload as any).error.message
        : `HTTP ${response.status}`;
    throw new Error(`credits_balance_failed:${message}`);
  }

  const body = (await response.json()) as { balanceMicro?: string | number };
  const raw = typeof body.balanceMicro === 'number' ? String(body.balanceMicro) : String(body.balanceMicro || '0');
  return BigInt(raw);
}

export async function debitKizunaCredits(params: {
  wallet: string;
  amountMicro: string;
  referenceId: string;
}): Promise<KizunaCreditsDebitResult> {
  const config = getConfig();
  const response = await fetch(`${getCreditsInternalBaseUrl()}/debit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.KIZUNA_INTERNAL_TOKEN}`,
    },
    body: JSON.stringify({
      wallet: params.wallet,
      amountMicro: params.amountMicro,
      endpoint: 'kizuna-repay',
      referenceId: params.referenceId,
      description: 'Kizuna debt repayment',
    }),
  });

  const body = (await response.json().catch(() => null)) as {
    debitedMicro?: string | number;
    balanceMicro?: string | number;
    idempotent?: boolean;
    error?: { code?: string; message?: string };
  } | null;

  if (!response.ok) {
    const code = body?.error?.code || `HTTP_${response.status}`;
    const message = body?.error?.message || `HTTP ${response.status}`;
    throw new Error(`credits_debit_failed:${code}:${message}`);
  }

  return {
    debitedMicro: typeof body?.debitedMicro === 'number' ? String(body.debitedMicro) : String(body?.debitedMicro || '0'),
    balanceMicro: typeof body?.balanceMicro === 'number' ? String(body.balanceMicro) : String(body?.balanceMicro || '0'),
    idempotent: !!body?.idempotent,
  };
}
