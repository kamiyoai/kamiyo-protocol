/**
 * Multi-RPC failover utility
 *
 * Provides connection pooling with automatic health checks and failover
 * for Solana RPC endpoints without requiring any specific provider.
 */

import { Connection, Commitment } from '@solana/web3.js';

export interface RpcEndpoint {
  url: string;
  weight?: number;
}

export interface RpcPoolConfig {
  endpoints: (string | RpcEndpoint)[];
  commitment?: Commitment;
  healthCheckIntervalMs?: number;
  connectionTimeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

interface PooledConnection {
  connection: Connection;
  url: string;
  weight: number;
  healthy: boolean;
  latency: number;
  errors: number;
  lastCheck: number;
}

const DEFAULT_CONFIG = {
  commitment: 'confirmed' as Commitment,
  healthCheckIntervalMs: 30000,
  connectionTimeoutMs: 10000,
  maxRetries: 3,
  retryDelayMs: 500,
};

const PUBLIC_ENDPOINTS = {
  'mainnet-beta': [
    'https://api.mainnet-beta.solana.com',
    'https://solana-api.projectserum.com',
  ],
  devnet: [
    'https://api.devnet.solana.com',
  ],
};

export class RpcPool {
  private connections: PooledConnection[] = [];
  private idx = 0;
  private healthInterval: ReturnType<typeof setInterval> | null = null;
  private readonly config: Required<Omit<RpcPoolConfig, 'endpoints'>> & { endpoints: RpcEndpoint[] };
  private ready = false;

  constructor(config: RpcPoolConfig) {
    const endpoints = config.endpoints.map(ep =>
      typeof ep === 'string' ? { url: ep, weight: 1 } : { url: ep.url, weight: ep.weight ?? 1 }
    );

    this.config = {
      endpoints,
      commitment: config.commitment ?? DEFAULT_CONFIG.commitment,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? DEFAULT_CONFIG.healthCheckIntervalMs,
      connectionTimeoutMs: config.connectionTimeoutMs ?? DEFAULT_CONFIG.connectionTimeoutMs,
      maxRetries: config.maxRetries ?? DEFAULT_CONFIG.maxRetries,
      retryDelayMs: config.retryDelayMs ?? DEFAULT_CONFIG.retryDelayMs,
    };
  }

  /**
   * Create a pool from environment or defaults
   */
  static fromEnv(cluster: 'mainnet-beta' | 'devnet' = 'mainnet-beta'): RpcPool {
    const envUrls = process.env.SOLANA_RPC_URLS?.split(',').map(u => u.trim()).filter(Boolean);
    const primaryUrl = process.env.SOLANA_RPC_URL;

    const endpoints: string[] = [];

    if (envUrls && envUrls.length > 0) {
      endpoints.push(...envUrls);
    } else if (primaryUrl) {
      endpoints.push(primaryUrl);
    }

    endpoints.push(...PUBLIC_ENDPOINTS[cluster]);

    const uniqueEndpoints = [...new Set(endpoints)];

    return new RpcPool({ endpoints: uniqueEndpoints });
  }

  async init(): Promise<void> {
    if (this.ready) return;

    for (const ep of this.config.endpoints) {
      this.connections.push({
        connection: new Connection(ep.url, {
          commitment: this.config.commitment,
          confirmTransactionInitialTimeout: this.config.connectionTimeoutMs,
        }),
        url: ep.url,
        weight: ep.weight,
        healthy: false,
        latency: Infinity,
        errors: 0,
        lastCheck: 0,
      });
    }

    await this.checkHealth();

    if (!this.connections.some(c => c.healthy)) {
      throw new Error('RpcPool: No healthy connections after initialization');
    }

    this.healthInterval = setInterval(
      () => this.checkHealth(),
      this.config.healthCheckIntervalMs
    );

    this.ready = true;
  }

  private async checkHealth(): Promise<void> {
    const checks = this.connections.map(async conn => {
      const start = Date.now();
      try {
        await Promise.race([
          conn.connection.getLatestBlockhash(),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error('timeout')), 5000)
          ),
        ]);
        conn.healthy = true;
        conn.latency = Date.now() - start;
        conn.lastCheck = Date.now();
        conn.errors = 0;
      } catch {
        conn.healthy = false;
        conn.latency = Infinity;
        conn.lastCheck = Date.now();
        conn.errors++;
      }
    });

    await Promise.allSettled(checks);

    this.connections.sort((a, b) => {
      if (a.healthy !== b.healthy) return a.healthy ? -1 : 1;
      const aScore = a.latency / a.weight;
      const bScore = b.latency / b.weight;
      return aScore - bScore;
    });
  }

  /**
   * Get a healthy connection (round-robin among healthy endpoints)
   */
  getConnection(): Connection {
    if (!this.ready) {
      throw new Error('RpcPool: Not initialized. Call init() first.');
    }

    const healthy = this.connections.filter(c => c.healthy);

    if (healthy.length === 0) {
      if (this.connections.length > 0) {
        return this.connections[0].connection;
      }
      throw new Error('RpcPool: No connections available');
    }

    const conn = healthy[this.idx % healthy.length];
    this.idx = (this.idx + 1) % healthy.length;
    return conn.connection;
  }

  /**
   * Execute a function with automatic retry and failover
   */
  async execute<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
    if (!this.ready) {
      throw new Error('RpcPool: Not initialized. Call init() first.');
    }

    let lastError: Error | null = null;
    const tried = new Set<string>();

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      let available = this.connections.filter(c => c.healthy && !tried.has(c.url));
      if (available.length === 0) {
        tried.clear();
        available = this.connections;
      }

      const conn = available[0] || this.connections[attempt % this.connections.length];
      tried.add(conn.url);

      try {
        const result = await fn(conn.connection);
        conn.errors = 0;
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        conn.errors++;

        if (conn.errors >= 3) {
          conn.healthy = false;
        }

        if (attempt < this.config.maxRetries - 1) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    throw new Error(
      `RpcPool: All ${this.config.maxRetries} attempts failed. Last error: ${lastError?.message}`
    );
  }

  /**
   * Report an error for a connection (marks unhealthy after 3 errors)
   */
  reportError(connection: Connection): void {
    const conn = this.connections.find(c => c.connection === connection);
    if (conn) {
      conn.errors++;
      if (conn.errors >= 3) {
        conn.healthy = false;
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    total: number;
    healthy: number;
    avgLatency: number;
    endpoints: Array<{
      url: string;
      healthy: boolean;
      latency: number;
      errors: number;
    }>;
  } {
    const healthy = this.connections.filter(c => c.healthy);
    return {
      total: this.connections.length,
      healthy: healthy.length,
      avgLatency: healthy.length
        ? healthy.reduce((sum, c) => sum + c.latency, 0) / healthy.length
        : Infinity,
      endpoints: this.connections.map(c => ({
        url: c.url.replace(/api-key=[^&]+/gi, 'api-key=***'),
        healthy: c.healthy,
        latency: c.latency,
        errors: c.errors,
      })),
    };
  }

  isInitialized(): boolean {
    return this.ready;
  }

  shutdown(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
    this.connections = [];
    this.ready = false;
    this.idx = 0;
  }
}

/**
 * Create a single Connection with automatic fallback
 *
 * Simpler alternative when you don't need full pool management.
 * Tries endpoints in order until one works.
 */
export async function createResilientConnection(
  endpoints: string[],
  commitment: Commitment = 'confirmed'
): Promise<Connection> {
  for (const url of endpoints) {
    try {
      const conn = new Connection(url, commitment);
      await conn.getLatestBlockhash();
      return conn;
    } catch {
      continue;
    }
  }

  throw new Error(
    `Failed to connect to any RPC endpoint: ${endpoints.join(', ')}`
  );
}
