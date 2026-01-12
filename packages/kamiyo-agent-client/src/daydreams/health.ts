/**
 * K8s-compatible liveness and readiness probes.
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message?: string;
  latencyMs?: number;
  lastCheck: number;
  error?: string;
}

export interface HealthReport {
  status: HealthStatus;
  version: string;
  uptime: number;
  timestamp: number;
  components: ComponentHealth[];
}

export type HealthCheck = () => Promise<ComponentHealth>;

export interface HealthCheckerConfig {
  version: string;
  checkInterval?: number;
  checkTimeout?: number;
}

export class HealthChecker {
  private checks = new Map<string, HealthCheck>();
  private lastReport: HealthReport | null = null;
  private startTime = Date.now();
  private config: Required<HealthCheckerConfig>;
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(config: HealthCheckerConfig) {
    this.config = {
      ...config,
      checkInterval: config.checkInterval ?? 30000,
      checkTimeout: config.checkTimeout ?? 5000,
    };
  }

  register(name: string, check: HealthCheck): void {
    this.checks.set(name, check);
  }

  unregister(name: string): void {
    this.checks.delete(name);
  }

  async check(): Promise<HealthReport> {
    const components: ComponentHealth[] = [];
    let overallStatus: HealthStatus = 'healthy';

    for (const [name, check] of this.checks) {
      const start = Date.now();

      try {
        const result = await Promise.race([
          check(),
          new Promise<ComponentHealth>((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), this.config.checkTimeout)
          ),
        ]);

        components.push({
          ...result,
          latencyMs: Date.now() - start,
          lastCheck: Date.now(),
        });

        if (result.status === 'unhealthy') {
          overallStatus = 'unhealthy';
        } else if (result.status === 'degraded' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      } catch (err) {
        components.push({
          name,
          status: 'unhealthy',
          error: err instanceof Error ? err.message : String(err),
          latencyMs: Date.now() - start,
          lastCheck: Date.now(),
        });
        overallStatus = 'unhealthy';
      }
    }

    this.lastReport = {
      status: overallStatus,
      version: this.config.version,
      uptime: Date.now() - this.startTime,
      timestamp: Date.now(),
      components,
    };

    return this.lastReport;
  }

  // Kubernetes liveness probe
  async isLive(): Promise<boolean> {
    // Basic liveness - service is running
    return true;
  }

  // Kubernetes readiness probe
  async isReady(): Promise<boolean> {
    const report = await this.check();
    return report.status !== 'unhealthy';
  }

  getLastReport(): HealthReport | null {
    return this.lastReport;
  }

  startPeriodicChecks(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.check().catch(console.error);
    }, this.config.checkInterval);

    // Initial check
    this.check().catch(console.error);
  }

  stopPeriodicChecks(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}

// Pre-built health checks
export const healthChecks = {
  // Solana RPC connection
  solanaRpc: (connection: { getSlot: () => Promise<number> }): HealthCheck => async () => {
    try {
      const slot = await connection.getSlot();
      return {
        name: 'solana_rpc',
        status: 'healthy',
        message: `Current slot: ${slot}`,
        lastCheck: Date.now(),
      };
    } catch (err) {
      return {
        name: 'solana_rpc',
        status: 'unhealthy',
        error: err instanceof Error ? err.message : String(err),
        lastCheck: Date.now(),
      };
    }
  },

  // Memory usage
  memory: (thresholds: { degraded: number; unhealthy: number } = { degraded: 0.8, unhealthy: 0.95 }): HealthCheck => async () => {
    const used = process.memoryUsage();
    const heapUsedPercent = used.heapUsed / used.heapTotal;

    let status: HealthStatus = 'healthy';
    if (heapUsedPercent >= thresholds.unhealthy) {
      status = 'unhealthy';
    } else if (heapUsedPercent >= thresholds.degraded) {
      status = 'degraded';
    }

    return {
      name: 'memory',
      status,
      message: `Heap: ${Math.round(heapUsedPercent * 100)}% (${Math.round(used.heapUsed / 1024 / 1024)}MB / ${Math.round(used.heapTotal / 1024 / 1024)}MB)`,
      lastCheck: Date.now(),
    };
  },

  // Storage provider
  storage: (storage: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown) => Promise<void> }): HealthCheck => async () => {
    const testKey = '__health_check__';
    const testValue = Date.now();

    try {
      await storage.set(testKey, testValue);
      const retrieved = await storage.get(testKey);

      if (retrieved !== testValue) {
        return {
          name: 'storage',
          status: 'unhealthy',
          error: 'Storage read/write mismatch',
          lastCheck: Date.now(),
        };
      }

      return {
        name: 'storage',
        status: 'healthy',
        lastCheck: Date.now(),
      };
    } catch (err) {
      return {
        name: 'storage',
        status: 'unhealthy',
        error: err instanceof Error ? err.message : String(err),
        lastCheck: Date.now(),
      };
    }
  },

  // ZK prover availability
  zkProver: (prover: { isAvailable?: () => boolean }): HealthCheck => async () => {
    const available = prover.isAvailable?.() ?? true;

    return {
      name: 'zk_prover',
      status: available ? 'healthy' : 'degraded',
      message: available ? 'Prover available' : 'Prover not available',
      lastCheck: Date.now(),
    };
  },

  // Circuit breaker status
  circuitBreakers: (getBreakers: () => Map<string, { state: string }>): HealthCheck => async () => {
    const breakers = getBreakers();
    let openCount = 0;
    let halfOpenCount = 0;

    for (const breaker of breakers.values()) {
      if (breaker.state === 'open') openCount++;
      if (breaker.state === 'half-open') halfOpenCount++;
    }

    let status: HealthStatus = 'healthy';
    if (openCount > breakers.size / 2) {
      status = 'unhealthy';
    } else if (openCount > 0 || halfOpenCount > 0) {
      status = 'degraded';
    }

    return {
      name: 'circuit_breakers',
      status,
      message: `Open: ${openCount}, Half-open: ${halfOpenCount}, Total: ${breakers.size}`,
      lastCheck: Date.now(),
    };
  },

  // Generic HTTP endpoint
  httpEndpoint: (url: string, expectedStatus: number = 200): HealthCheck => async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.status === expectedStatus) {
        return {
          name: `http_${new URL(url).hostname}`,
          status: 'healthy',
          lastCheck: Date.now(),
        };
      }

      return {
        name: `http_${new URL(url).hostname}`,
        status: 'degraded',
        message: `Unexpected status: ${response.status}`,
        lastCheck: Date.now(),
      };
    } catch (err) {
      return {
        name: `http_${new URL(url).hostname}`,
        status: 'unhealthy',
        error: err instanceof Error ? err.message : String(err),
        lastCheck: Date.now(),
      };
    }
  },

  // Custom check wrapper
  custom: (name: string, check: () => Promise<{ healthy: boolean; message?: string }>): HealthCheck => async () => {
    try {
      const result = await check();
      return {
        name,
        status: result.healthy ? 'healthy' : 'unhealthy',
        message: result.message,
        lastCheck: Date.now(),
      };
    } catch (err) {
      return {
        name,
        status: 'unhealthy',
        error: err instanceof Error ? err.message : String(err),
        lastCheck: Date.now(),
      };
    }
  },
};

// HTTP handler for health endpoints
export function createHealthHandlers(checker: HealthChecker): {
  health: () => Promise<{ status: number; body: HealthReport }>;
  live: () => Promise<{ status: number; body: { status: string } }>;
  ready: () => Promise<{ status: number; body: { status: string } }>;
} {
  return {
    health: async () => {
      const report = await checker.check();
      return {
        status: report.status === 'healthy' ? 200 : report.status === 'degraded' ? 200 : 503,
        body: report,
      };
    },

    live: async () => {
      const live = await checker.isLive();
      return {
        status: live ? 200 : 503,
        body: { status: live ? 'ok' : 'fail' },
      };
    },

    ready: async () => {
      const ready = await checker.isReady();
      return {
        status: ready ? 200 : 503,
        body: { status: ready ? 'ok' : 'fail' },
      };
    },
  };
}
