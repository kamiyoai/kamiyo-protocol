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
  minimumNumberOfFinalizationConfirmations?: number;
  minimumNumberOfNodeReplications?: number;
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
      opts?: { epochsNum?: number }
    ) => Promise<{ UAL?: string }>;
    submitToParanet?: (ual: string, paranetUal: string, opts?: Record<string, unknown>) => Promise<unknown>;
    get: (ual: string, opts?: Record<string, unknown>) => Promise<unknown>;
  };
};

export class OriginTrailDKGClient implements DKGClient {
  private readonly dkg: DkgJsClient;
  private readonly paranetUal?: string;
  private readonly minimumNumberOfFinalizationConfirmations?: number;
  private readonly minimumNumberOfNodeReplications?: number;

  constructor(
    dkg: DkgJsClient,
    opts?: {
      paranetUal?: string;
      minimumNumberOfFinalizationConfirmations?: number;
      minimumNumberOfNodeReplications?: number;
    }
  ) {
    this.dkg = dkg;
    this.paranetUal = opts?.paranetUal;
    this.minimumNumberOfFinalizationConfirmations =
      opts?.minimumNumberOfFinalizationConfirmations;
    this.minimumNumberOfNodeReplications = opts?.minimumNumberOfNodeReplications;
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
      ...(typeof this.minimumNumberOfFinalizationConfirmations === 'number'
        ? { minimumNumberOfFinalizationConfirmations: this.minimumNumberOfFinalizationConfirmations }
        : {}),
      ...(typeof this.minimumNumberOfNodeReplications === 'number'
        ? { minimumNumberOfNodeReplications: this.minimumNumberOfNodeReplications }
        : {}),
    });
    const ual = (
      (result as any)?.UAL ??
      (result as any)?.ual ??
      (result as any)?.data?.UAL ??
      (result as any)?.data?.ual
    );

    if (!ual || typeof ual !== 'string') {
      const status = (result as any)?.operation?.publish?.status ?? 'unknown';
      throw new Error(`DKG publish response missing UAL (publishStatus=${status})`);
    }

    return ual;
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

  return new OriginTrailDKGClient(dkg, {
    paranetUal: config.paranetUal,
    minimumNumberOfFinalizationConfirmations: config.minimumNumberOfFinalizationConfirmations,
    minimumNumberOfNodeReplications: config.minimumNumberOfNodeReplications,
  });
}
