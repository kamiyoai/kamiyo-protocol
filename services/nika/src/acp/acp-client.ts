import { createLogger, withRetry } from '../lib';

const log = createLogger('nika:acp:client');

export interface AcpClientConfig {
  apiUrl: string;
  apiKey: string;
}

export interface AcpMeResponse {
  walletAddress: string;
  name?: string;
  description?: string;
  tokenAddress?: string;
  jobs?: Array<{
    name: string;
    priceV2?: { type: string; value: number };
    slaMinutes?: number;
    requiredFunds?: boolean;
    deliverable?: string;
    requirement?: Record<string, unknown>;
  }>;
}

export interface AcpMarketplaceAgentOffering {
  name: string;
  description?: string;
  price: number;
  priceType: string;
  requiredFunds?: boolean;
  requirement?: unknown;
}

export interface AcpMarketplaceAgent {
  id: string;
  name: string;
  description?: string;
  walletAddress: string;
  twitterHandle?: string;
  jobOfferings?: AcpMarketplaceAgentOffering[];
  resources?: unknown[];
  metrics?: unknown;
}

export interface AcceptOrRejectParams {
  accept: boolean;
  reason?: string;
}

export interface RequestPaymentParams {
  content: string;
  payableDetail?: {
    amount: number;
    tokenAddress: string;
    recipient: string;
  };
}

export interface DeliverJobParams {
  deliverable: string | { type: string; value: unknown };
  payableDetail?: { amount: number; tokenAddress: string };
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function redact(str: string): string {
  if (!str) return '';
  if (str.length <= 8) return '[REDACTED]';
  return `${str.slice(0, 4)}…${str.slice(-4)}`;
}

export class AcpClient {
  private apiUrl: string;
  private apiKey: string;

  constructor(config: AcpClientConfig) {
    this.apiUrl = normalizeBaseUrl(config.apiUrl);
    this.apiKey = config.apiKey.trim();
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const url = new URL(path.replace(/^\//, ''), this.apiUrl);

    const res = await fetch(url, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        ...(init?.headers ?? {}),
      },
    });

    const text = await res.text();
    if (!res.ok) {
      const snippet = text.slice(0, 800);
      throw new Error(`ACP API error (${res.status}): ${snippet}`);
    }

    if (!text.trim()) return {} as T;

    const parsed = JSON.parse(text) as any;
    return (parsed?.data?.data ?? parsed?.data ?? parsed) as T;
  }

  async getMe(): Promise<AcpMeResponse> {
    return await withRetry(
      async () => this.requestJson<AcpMeResponse>('/acp/me', { method: 'GET' }),
      { maxAttempts: 2, initialDelayMs: 800 }
    );
  }

  async searchAgents(query: string): Promise<AcpMarketplaceAgent[]> {
    const q = query.trim();
    if (!q) return [];

    const data = await withRetry(
      async () =>
        this.requestJson<unknown>(`/acp/agents?query=${encodeURIComponent(q)}`, {
          method: 'GET',
        }),
      { maxAttempts: 2, initialDelayMs: 800 }
    );

    if (!Array.isArray(data)) return [];

    return data.filter((v): v is AcpMarketplaceAgent => {
      if (!v || typeof v !== 'object') return false;
      const a = v as any;
      return typeof a.walletAddress === 'string' && typeof a.name === 'string';
    });
  }

  async acceptOrRejectJob(jobId: number, params: AcceptOrRejectParams): Promise<void> {
    try {
      await withRetry(
        async () =>
          this.requestJson(`/acp/providers/jobs/${jobId}/accept`, {
            method: 'POST',
            body: JSON.stringify(params),
          }),
        { maxAttempts: 2, initialDelayMs: 800 }
      );
    } catch (error) {
      log.error('acceptOrRejectJob failed', {
        jobId,
        accept: params.accept,
        reason: params.reason,
        apiKey: redact(this.apiKey),
        error: String(error),
      });
      throw error;
    }
  }

  async requestPayment(jobId: number, params: RequestPaymentParams): Promise<void> {
    await withRetry(
      async () =>
        this.requestJson(`/acp/providers/jobs/${jobId}/requirement`, {
          method: 'POST',
          body: JSON.stringify(params),
        }),
      { maxAttempts: 2, initialDelayMs: 800 }
    );
  }

  async deliverJob(jobId: number, params: DeliverJobParams): Promise<void> {
    await withRetry(
      async () =>
        this.requestJson(`/acp/providers/jobs/${jobId}/deliverable`, {
          method: 'POST',
          body: JSON.stringify(params),
        }),
      { maxAttempts: 2, initialDelayMs: 800 }
    );
  }
}
