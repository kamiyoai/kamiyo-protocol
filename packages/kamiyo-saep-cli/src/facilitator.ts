/**
 * Thin HTTP client for the `/kizuna/adapters/saep/*` routes on the x402
 * facilitator. The CLI does not embed the facilitator code — it talks to the
 * deployed service so operators don't need DB access.
 */

export interface FacilitatorOptions {
  baseUrl: string;
  internalToken: string;
}

export function facilitatorFromEnv(): FacilitatorOptions {
  const baseUrl = (process.env.KAMIYO_FACILITATOR_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    ''
  );
  const internalToken = process.env.KAMIYO_INTERNAL_TOKEN ?? '';
  return { baseUrl, internalToken };
}

async function call(
  method: 'GET' | 'POST',
  options: FacilitatorOptions,
  path: string,
  body?: unknown
): Promise<{ status: number; body: unknown }> {
  if (!options.internalToken) {
    throw new Error('KAMIYO_INTERNAL_TOKEN is required for this command');
  }
  const url = `${options.baseUrl}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${options.internalToken}`,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

export const facilitator = {
  underwrite(opts: FacilitatorOptions, body: Record<string, unknown>) {
    return call('POST', opts, '/kizuna/adapters/saep/underwrite', body);
  },
  reservation(opts: FacilitatorOptions, id: string) {
    return call('GET', opts, `/kizuna/adapters/saep/reservations/${encodeURIComponent(id)}`);
  },
  settle(opts: FacilitatorOptions, body: Record<string, unknown>) {
    return call('POST', opts, '/kizuna/adapters/saep/settlement-ingest', body);
  },
  health(opts: FacilitatorOptions) {
    return call('GET', opts, '/kizuna/adapters/saep/health');
  },
  decision(opts: FacilitatorOptions, reservationId: string) {
    return call(
      'GET',
      opts,
      `/kizuna/adapters/saep/decisions/${encodeURIComponent(reservationId)}`
    );
  },
  snapshot(opts: FacilitatorOptions, taskPda: string, cluster: string) {
    return call(
      'GET',
      opts,
      `/kizuna/adapters/saep/snapshots/${encodeURIComponent(taskPda)}?cluster=${encodeURIComponent(cluster)}`
    );
  },
};
