import { createLogger, LRUCache } from './lib';

const log = createLogger('kyoshin:holder-gate');

export type HolderGateReason =
  | 'eligible'
  | 'not_linked'
  | 'insufficient_holdings'
  | 'unconfigured'
  | 'error';

export interface HolderGateStatus {
  eligible: boolean;
  linked: boolean;
  reason: HolderGateReason;
  wallet: string | null;
  balance: number | null;
  tier: string | null;
  minTokensRequired: number | null;
}

export interface HolderGateClientConfig {
  baseUrl: string;
  secret: string;
  timeoutMs: number;
  cacheTtlMs: number;
}

type HolderGateApiResponse = {
  twitterId: string;
  linked: boolean;
  wallet: string | null;
  balance: number | null;
  tier: string;
  minTokensRequired: number;
  eligible: boolean;
};

export class HolderGateClient {
  private baseUrl: string;
  private secret: string;
  private timeoutMs: number;
  private cache: LRUCache<HolderGateStatus>;
  private cacheTtlMs: number;

  constructor(config: HolderGateClientConfig) {
    this.baseUrl = config.baseUrl.trim();
    this.secret = config.secret.trim();
    this.timeoutMs = config.timeoutMs;
    this.cacheTtlMs = config.cacheTtlMs;
    this.cache = new LRUCache<HolderGateStatus>({ maxSize: 10_000, ttlMs: config.cacheTtlMs });
  }

  async checkTwitterAuthor(twitterId: string | null): Promise<HolderGateStatus> {
    if (!twitterId) {
      return {
        eligible: false,
        linked: false,
        reason: 'error',
        wallet: null,
        balance: null,
        tier: null,
        minTokensRequired: null,
      };
    }

    if (!this.baseUrl || !this.secret) {
      return {
        eligible: false,
        linked: false,
        reason: 'unconfigured',
        wallet: null,
        balance: null,
        tier: null,
        minTokensRequired: null,
      };
    }

    const cacheKey = `twitter:${twitterId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const url = new URL(`/internal/holders/twitter/${encodeURIComponent(twitterId)}`, this.baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.secret}` },
        signal: controller.signal,
      });

      if (!res.ok) {
        const status: HolderGateStatus = {
          eligible: false,
          linked: false,
          reason: 'error',
          wallet: null,
          balance: null,
          tier: null,
          minTokensRequired: null,
        };
        this.cache.set(cacheKey, status, this.cacheTtlMs);
        log.warn('Holder gate request failed', { statusCode: res.status });
        return status;
      }

      const data = (await res.json()) as HolderGateApiResponse;
      const status: HolderGateStatus = {
        eligible: !!data.eligible,
        linked: !!data.linked,
        reason: data.eligible ? 'eligible' : data.linked ? 'insufficient_holdings' : 'not_linked',
        wallet: data.wallet ?? null,
        balance: typeof data.balance === 'number' ? data.balance : null,
        tier: typeof data.tier === 'string' ? data.tier : null,
        minTokensRequired: typeof data.minTokensRequired === 'number' ? data.minTokensRequired : null,
      };

      this.cache.set(cacheKey, status, this.cacheTtlMs);
      return status;
    } catch (err) {
      const status: HolderGateStatus = {
        eligible: false,
        linked: false,
        reason: 'error',
        wallet: null,
        balance: null,
        tier: null,
        minTokensRequired: null,
      };
      this.cache.set(cacheKey, status, Math.min(this.cacheTtlMs, 60_000));
      log.warn('Holder gate request error', { error: String(err) });
      return status;
    } finally {
      clearTimeout(timeout);
    }
  }
}

