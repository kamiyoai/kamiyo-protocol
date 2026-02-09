import type { DKGAssetPayload, DKGClient } from '@kamiyo/meishi/dkg';

export interface HttpDKGClientConfig {
  apiUrl: string;
  apiKey?: string;
}

export interface OriginTrailDKGClientConfig {
  endpoint: string;
  port?: number;
  blockchain: 'base:8453' | 'gnosis:100' | 'otp:2043';
  rpcUrl?: string;
  privateKey?: string;
  paranetUal?: string;
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

type DkgJsClient = {
  graph: {
    query: (
      query: string,
      type: 'SELECT' | 'CONSTRUCT' | 'ASK',
      opts?: { repository?: string; paranetUAL?: string }
    ) => Promise<{ data?: unknown[] }>;
  };
  blockchain?: {
    getWalletAddress: (opts?: Record<string, unknown>) => Promise<string>;
    getWalletBalances: (opts?: Record<string, unknown>) => Promise<{ blockchainToken: string; trac: string }>;
  };
  asset: {
    create: (
      content: { public: Record<string, unknown>; private?: Record<string, unknown> },
      opts?: { epochsNum?: number; paranetUAL?: string }
    ) => Promise<{ UAL?: string }>;
    get: (ual: string, opts?: Record<string, unknown>) => Promise<unknown>;
  };
};

export class OriginTrailDKGClient implements DKGClient {
  private readonly dkg: DkgJsClient;
  private readonly paranetUal?: string;

  constructor(dkg: DkgJsClient, paranetUal?: string) {
    this.dkg = dkg;
    this.paranetUal = paranetUal;
  }

  async query(sparql: string): Promise<unknown[]> {
    const result = await this.dkg.graph.query(sparql, 'SELECT', {
      repository: 'publicKnowledgeAssets',
      ...(this.paranetUal ? { paranetUAL: this.paranetUal } : {}),
    });
    return Array.isArray(result?.data) ? result.data : [];
  }

  async get(ual: string): Promise<{ content: unknown; metadata?: Record<string, unknown> }> {
    const content = await this.dkg.asset.get(ual, {
      contentType: 'all',
      ...(this.paranetUal ? { paranetUAL: this.paranetUal } : {}),
    });
    return { content };
  }

  async publish(content: DKGAssetPayload, options?: { epochs?: number }): Promise<string> {
    const result = await this.dkg.asset.create(content, {
      ...(options?.epochs ? { epochsNum: options.epochs } : {}),
      ...(this.paranetUal ? { paranetUAL: this.paranetUal } : {}),
    });
    if (!result?.UAL) {
      throw new Error('DKG publish response missing UAL');
    }
    return result.UAL;
  }

  async getWalletAddress(): Promise<string | null> {
    if (!this.dkg.blockchain?.getWalletAddress) return null;
    try {
      const address = await this.dkg.blockchain.getWalletAddress();
      return typeof address === 'string' && address.length > 0 ? address : null;
    } catch {
      return null;
    }
  }

  async getWalletBalances(): Promise<{ blockchainToken: string; trac: string } | null> {
    if (!this.dkg.blockchain?.getWalletBalances) return null;
    const balances = await this.dkg.blockchain.getWalletBalances();
    if (!balances || typeof balances !== 'object') return null;
    return balances;
  }
}

export async function createOriginTrailDKGClient(config: OriginTrailDKGClientConfig): Promise<OriginTrailDKGClient> {
  const DKG = await import('dkg.js').then((m: any) => m?.default ?? m);
  const dkg: DkgJsClient = new DKG({
    endpoint: config.endpoint,
    port: config.port ?? 8900,
    blockchain: {
      name: config.blockchain,
      rpc: config.rpcUrl,
      ...(config.privateKey ? { privateKey: config.privateKey } : { publicKey: 'readonly' }),
    },
    maxNumberOfRetries: 5,
    frequency: 2,
    nodeApiVersion: '/v1',
  });

  return new OriginTrailDKGClient(dkg, config.paranetUal);
}
