import { Connection, Commitment } from '@solana/web3.js';
import { ConnectionPoolConfig, ConnectionError } from './types';
import { DEFAULTS, HELIUS_ENDPOINTS } from './constants';

interface PooledConn {
  conn: Connection;
  endpoint: string;
  healthy: boolean;
  lastCheck: number;
  latency: number;
  errors: number;
}

export class ConnectionPool {
  private conns: PooledConn[] = [];
  private idx = 0;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private readonly cfg: Required<ConnectionPoolConfig>;
  private readonly apiKey: string;
  private readonly cluster: 'mainnet-beta' | 'devnet';
  private readonly commitment: Commitment;
  private ready = false;
  private starting = false;

  constructor(
    apiKey: string,
    cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta',
    commitment: Commitment = 'confirmed',
    config: ConnectionPoolConfig = {}
  ) {
    this.apiKey = apiKey;
    this.cluster = cluster;
    this.commitment = commitment;
    this.cfg = {
      maxConnections: config.maxConnections ?? DEFAULTS.MAX_CONNECTIONS,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? DEFAULTS.HEALTH_CHECK_INTERVAL_MS,
      connectionTimeoutMs: config.connectionTimeoutMs ?? DEFAULTS.CONNECTION_TIMEOUT_MS
    };
  }

  async init(): Promise<void> {
    if (this.ready) return;
    if (this.starting) throw new ConnectionError('Pool init in progress');

    this.starting = true;

    try {
      const base = HELIUS_ENDPOINTS[this.cluster];
      const endpoints = this.buildEndpoints(base);

      for (const ep of endpoints) {
        this.conns.push({
          conn: new Connection(ep, {
            commitment: this.commitment,
            confirmTransactionInitialTimeout: this.cfg.connectionTimeoutMs
          }),
          endpoint: ep,
          healthy: false,
          lastCheck: 0,
          latency: Infinity,
          errors: 0
        });
      }

      await this.checkHealth();

      if (!this.conns.some(c => c.healthy)) {
        throw new ConnectionError('No healthy connections after init');
      }

      this.checkInterval = setInterval(() => this.checkHealth(), this.cfg.healthCheckIntervalMs);
      this.ready = true;
    } catch (e) {
      this.conns = [];
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
      throw e instanceof ConnectionError ? e : new ConnectionError(
        `Pool init failed: ${e instanceof Error ? e.message : String(e)}`,
        e instanceof Error ? e : undefined
      );
    } finally {
      this.starting = false;
    }
  }

  private buildEndpoints(base: string): string[] {
    const eps: string[] = [`${base}/?api-key=${this.apiKey}`];

    if (this.cfg.maxConnections > 1) {
      eps.push(`${base}/?api-key=${this.apiKey}`);
    }
    if (this.cfg.maxConnections > 2 && this.cluster === 'mainnet-beta') {
      eps.push('https://api.mainnet-beta.solana.com');
    }

    return eps.slice(0, this.cfg.maxConnections);
  }

  private async checkHealth(): Promise<void> {
    const checks = this.conns.map(async (p) => {
      const start = Date.now();
      try {
        await Promise.race([
          p.conn.getLatestBlockhash(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
        ]);
        p.healthy = true;
        p.latency = Date.now() - start;
        p.lastCheck = Date.now();
        p.errors = 0;
      } catch {
        p.healthy = false;
        p.latency = Infinity;
        p.lastCheck = Date.now();
        p.errors++;
      }
    });

    await Promise.allSettled(checks);
    this.conns.sort((a, b) => {
      if (a.healthy !== b.healthy) return a.healthy ? -1 : 1;
      return a.latency - b.latency;
    });
  }

  getConnection(): Connection {
    if (!this.ready) throw new ConnectionError('Pool not initialized');

    const healthy = this.conns.filter(c => c.healthy);

    if (healthy.length === 0) {
      if (this.conns.length > 0) return this.conns[0].conn;
      throw new ConnectionError('No connections in pool');
    }

    const conn = healthy[this.idx % healthy.length];
    this.idx = (this.idx + 1) % healthy.length;
    return conn.conn;
  }

  async execute<T>(fn: (conn: Connection) => Promise<T>, maxRetries = DEFAULTS.MAX_RETRIES): Promise<T> {
    let lastErr: Error | null = null;
    const tried = new Set<string>();

    for (let i = 0; i < maxRetries; i++) {
      let healthy = this.conns.filter(c => c.healthy && !tried.has(c.endpoint));
      if (healthy.length === 0) tried.clear();

      const p = healthy[0] || this.conns[i % this.conns.length];
      tried.add(p.endpoint);

      try {
        const result = await fn(p.conn);
        p.errors = 0;
        return result;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        p.errors++;
        if (p.errors >= 3) p.healthy = false;

        if (i < maxRetries - 1) {
          await new Promise(r => setTimeout(r, DEFAULTS.RETRY_DELAY_MS * Math.pow(2, i)));
        }
      }
    }

    throw new ConnectionError(`All attempts failed after ${maxRetries} retries`, lastErr ?? undefined);
  }

  reportError(conn: Connection): void {
    const p = this.conns.find(c => c.conn === conn);
    if (p) {
      p.errors++;
      if (p.errors >= 3) p.healthy = false;
    }
  }

  getStats(): {
    total: number;
    healthy: number;
    avgLatency: number;
    connections: Array<{ endpoint: string; healthy: boolean; latency: number; errorCount: number }>;
  } {
    const healthy = this.conns.filter(c => c.healthy);
    return {
      total: this.conns.length,
      healthy: healthy.length,
      avgLatency: healthy.length ? healthy.reduce((s, c) => s + c.latency, 0) / healthy.length : Infinity,
      connections: this.conns.map(c => ({
        endpoint: c.endpoint.replace(/api-key=[^&]+/, 'api-key=***'),
        healthy: c.healthy,
        latency: c.latency,
        errorCount: c.errors
      }))
    };
  }

  isInitialized(): boolean { return this.ready; }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.conns = [];
    this.ready = false;
    this.idx = 0;
  }
}
