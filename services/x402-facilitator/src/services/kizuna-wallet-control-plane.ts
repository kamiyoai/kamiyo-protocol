import { getConfig } from '../config';

export type KizunaMandateLimits = {
  agentId: string;
  passportAddress: string;
  mandateVersion: number;
  validFrom: string;
  validUntil: string;
  caps: {
    singleMicro: string;
    dailyMicro: string;
    monthlyMicro: string;
    humanApprovalMicro: string;
  };
};

export async function syncKizunaMandate(params: {
  agentId: string;
  passportAddress?: string | null;
  networks?: Array<'base' | 'solana'>;
}): Promise<void> {
  const config = getConfig();
  const baseUrl = config.WALLET_CONTROL_PLANE_URL.replace(/\/+$/, '');

  const path = params.passportAddress
    ? `/v1/mandates/${encodeURIComponent(params.passportAddress)}/sync`
    : `/v1/agents/${encodeURIComponent(params.agentId)}/mandate/sync`;

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.KIZUNA_INTERNAL_TOKEN}`,
    },
    body: JSON.stringify({
      networks: params.networks && params.networks.length > 0 ? params.networks : undefined,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload && typeof payload === 'object' && typeof (payload as any).error === 'string'
        ? (payload as any).error
        : `HTTP ${response.status}`;
    throw new Error(`wallet_control_plane_sync_failed:${message}`);
  }
}

export async function getKizunaMandateLimits(agentId: string): Promise<KizunaMandateLimits | null> {
  const config = getConfig();
  const baseUrl = config.WALLET_CONTROL_PLANE_URL.replace(/\/+$/, '');

  const response = await fetch(
    `${baseUrl}/v1/agents/${encodeURIComponent(agentId)}/mandate/limits`,
    {
      method: 'GET',
      headers: {
        authorization: `Bearer ${config.KIZUNA_INTERNAL_TOKEN}`,
      },
    }
  );

  if (response.status === 404) return null;

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload && typeof payload === 'object' && typeof (payload as any).error === 'string'
        ? (payload as any).error
        : `HTTP ${response.status}`;
    throw new Error(`wallet_control_plane_limits_failed:${message}`);
  }

  return response.json() as Promise<KizunaMandateLimits>;
}
