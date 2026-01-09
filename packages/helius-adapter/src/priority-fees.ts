import { PublicKey, Connection } from '@solana/web3.js';
import {
  PriorityFeeEstimate, PriorityFeeLevels, FeeStrategy,
  HeliusPriorityFeeResponse, HeliusAdapterError
} from './types';
import { FEE_STRATEGIES, COMPUTE_UNITS, DEFAULTS, HELIUS_ENDPOINTS } from './constants';

interface CacheEntry {
  estimate: PriorityFeeEstimate;
  ts: number;
}

const BASE_FEE = 5000;
const MAX_CACHE = 1000;

export class PriorityFeeCalculator {
  private readonly apiKey: string;
  private readonly cluster: 'mainnet-beta' | 'devnet';
  private readonly ttl: number;
  private readonly timeout: number;
  private cache = new Map<string, CacheEntry>();

  constructor(
    apiKey: string,
    cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta',
    ttl = DEFAULTS.FEE_CACHE_TTL_MS,
    timeout = DEFAULTS.CONNECTION_TIMEOUT_MS
  ) {
    this.apiKey = apiKey;
    this.cluster = cluster;
    this.ttl = ttl;
    this.timeout = timeout;
  }

  async getEstimate(accounts: PublicKey[]): Promise<PriorityFeeEstimate> {
    const key = accounts.map(a => a.toBase58()).sort().join(',');
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.ts < this.ttl) {
      return cached.estimate;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeout);

    try {
      const res = await fetch(`${HELIUS_ENDPOINTS[this.cluster]}/?api-key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'fee',
          method: 'getPriorityFeeEstimate',
          params: [{
            accountKeys: accounts.map(a => a.toBase58()),
            options: { includeAllPriorityFeeLevels: true, recommended: true, evaluateEmptySlotAsZero: true }
          }]
        }),
        signal: ctrl.signal
      });

      if (!res.ok) throw new HeliusAdapterError(`API error: ${res.status}`, 'API_ERROR');

      const data = await res.json() as HeliusPriorityFeeResponse;
      if (data.error) throw new HeliusAdapterError(`API error: ${data.error.message}`, 'API_ERROR');

      const r = data.result;
      const levels: PriorityFeeLevels = r.priorityFeeLevels ?? {
        min: 0,
        low: Math.floor(r.priorityFeeEstimate * 0.5),
        medium: r.priorityFeeEstimate,
        high: Math.floor(r.priorityFeeEstimate * 1.5),
        veryHigh: Math.floor(r.priorityFeeEstimate * 2.5),
        unsafeMax: Math.floor(r.priorityFeeEstimate * 5)
      };

      const estimate: PriorityFeeEstimate = {
        levels,
        recommended: r.priorityFeeEstimate,
        percentiles: r.percentiles ?? {},
        timestamp: Date.now()
      };

      if (this.cache.size >= MAX_CACHE) {
        const oldest = this.cache.keys().next().value;
        if (oldest) this.cache.delete(oldest);
      }

      this.cache.set(key, { estimate, ts: Date.now() });
      return estimate;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new HeliusAdapterError(`Timeout after ${this.timeout}ms`, 'TIMEOUT');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async calculateFee(accounts: PublicKey[], strategy: FeeStrategy = 'standard'): Promise<number> {
    const est = await this.getEstimate(accounts);
    const cfg = FEE_STRATEGIES[strategy];
    return Math.min(Math.ceil(est.recommended * cfg.multiplier), cfg.maxFee);
  }

  async getOperationFee(
    op: keyof typeof COMPUTE_UNITS,
    pda: PublicKey,
    extra: PublicKey[] = [],
    strategy: FeeStrategy = 'standard'
  ): Promise<{ priorityFee: number; computeUnits: number; totalFee: number }> {
    const fee = await this.calculateFee([pda, ...extra], strategy);
    const cu = COMPUTE_UNITS[op];
    const microPerCU = Math.ceil((fee * 1_000_000) / cu);
    const totalPriority = Math.ceil((microPerCU * cu) / 1_000_000);
    return { priorityFee: microPerCU, computeUnits: cu, totalFee: BASE_FEE + totalPriority };
  }

  async getAllStrategyFees(accounts: PublicKey[]): Promise<Record<FeeStrategy, number>> {
    const est = await this.getEstimate(accounts);
    const result: Record<FeeStrategy, number> = { economy: 0, standard: 0, fast: 0, urgent: 0, critical: 0 };

    for (const [name, cfg] of Object.entries(FEE_STRATEGIES)) {
      result[name as FeeStrategy] = Math.min(Math.ceil(est.recommended * cfg.multiplier), cfg.maxFee);
    }
    return result;
  }

  async getHistoricalFees(
    conn: Connection,
    programId: PublicKey,
    sample = 50
  ): Promise<{ average: number; median: number; min: number; max: number; samples: number; errors: number }> {
    const sigs = await conn.getSignaturesForAddress(programId, { limit: sample });
    const fees: number[] = [];
    let errs = 0;

    for (const s of sigs) {
      try {
        const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
        if (tx?.meta?.fee) {
          const pf = tx.meta.fee - BASE_FEE;
          if (pf > 0) fees.push(pf);
        }
      } catch { errs++; }
    }

    if (fees.length === 0) return { average: 1000, median: 1000, min: 0, max: 0, samples: 0, errors: errs };

    const sorted = fees.sort((a, b) => a - b);
    return {
      average: Math.ceil(fees.reduce((a, b) => a + b, 0) / fees.length),
      median: sorted[Math.floor(sorted.length / 2)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      samples: fees.length,
      errors: errs
    };
  }

  clearCache(): void { this.cache.clear(); }

  getCacheStats(): { size: number; entries: Array<{ key: string; age: number }> } {
    const now = Date.now();
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([k, v]) => ({
        key: k.slice(0, 20) + '...',
        age: now - v.ts
      }))
    };
  }
}
