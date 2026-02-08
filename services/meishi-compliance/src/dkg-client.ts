import type { DKGAssetPayload, DKGClient } from '@kamiyo/meishi/dkg';

export interface HttpDKGClientConfig {
  apiUrl: string;
  apiKey?: string;
}

async function requestJson<T>(
  url: string,
  body: Record<string, unknown>,
  apiKey?: string
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DKG API error ${response.status}: ${text.slice(0, 500)}`);
  }

  return (await response.json()) as T;
}

/**
 * Thin HTTP wrapper for DKG query/get/publish.
 * Endpoint paths are aligned with common dkg-engine API deployments:
 * - POST /publish { content, options }
 * - POST /query { sparql }
 * - POST /get { ual }
 */
export class HttpDKGClient implements DKGClient {
  private readonly apiUrl: string;
  private readonly apiKey?: string;

  constructor(config: HttpDKGClientConfig) {
    this.apiUrl = config.apiUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
  }

  async query(sparql: string): Promise<unknown[]> {
    const data = await requestJson<{ results?: unknown[]; data?: unknown[] }>(
      `${this.apiUrl}/query`,
      { sparql },
      this.apiKey
    );
    return data.results ?? data.data ?? [];
  }

  async get(ual: string): Promise<{ content: unknown; metadata?: Record<string, unknown> }> {
    const data = await requestJson<{ content?: unknown; asset?: unknown; metadata?: Record<string, unknown> }>(
      `${this.apiUrl}/get`,
      { ual },
      this.apiKey
    );
    return {
      content: data.content ?? data.asset ?? null,
      metadata: data.metadata,
    };
  }

  async publish(content: DKGAssetPayload, options?: { epochs?: number }): Promise<string> {
    const data = await requestJson<{ ual?: string; data?: { ual?: string } }>(
      `${this.apiUrl}/publish`,
      { content, options },
      this.apiKey
    );
    const ual = data.ual ?? data.data?.ual;
    if (!ual) {
      throw new Error('DKG publish response missing UAL');
    }
    return ual;
  }
}
