// Graceful shutdown handlers for KAMIYO Agent Paranet

import { getLogger } from './logger';
import type { Logger } from './logger';
import { getMetrics, resetMetrics } from './metrics';
import { getDefaultExecutor } from './resilience';

export interface ShutdownHandler {
  name: string;
  handler: () => Promise<void> | void;
  priority?: number;
}

export interface ShutdownManagerConfig {
  timeoutMs?: number;
  logger?: Logger;
}

export class ShutdownManager {
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private logger: Logger;
  private timeoutMs: number;
  private processHandlersInstalled = false;

  constructor(config: ShutdownManagerConfig = {}) {
    this.logger = config.logger || getLogger();
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  register(handler: ShutdownHandler): void {
    this.handlers.push(handler);
    this.handlers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    this.logger.debug('Registered shutdown handler', { name: handler.name, priority: handler.priority ?? 0 });
  }

  unregister(name: string): boolean {
    const idx = this.handlers.findIndex(h => h.name === name);
    if (idx >= 0) {
      this.handlers.splice(idx, 1);
      return true;
    }
    return false;
  }

  installProcessHandlers(): void {
    if (this.processHandlersInstalled) return;

    const shutdown = async (signal: string) => {
      this.logger.info('Received shutdown signal', { signal });
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    this.processHandlersInstalled = true;
    this.logger.debug('Process shutdown handlers installed');
  }

  async shutdown(): Promise<{ success: boolean; errors: string[] }> {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return { success: true, errors: [] };
    }

    this.isShuttingDown = true;
    this.logger.info('Starting graceful shutdown', { handlers: this.handlers.length });

    const errors: string[] = [];
    const timeoutPromise = new Promise<'timeout'>(resolve =>
      setTimeout(() => resolve('timeout'), this.timeoutMs)
    );

    for (const { name, handler } of this.handlers) {
      try {
        const handlerPromise = Promise.resolve(handler());
        const result = await Promise.race([handlerPromise, timeoutPromise]);

        if (result === 'timeout') {
          errors.push(`${name}: timeout`);
          this.logger.warn('Shutdown handler timed out', { name });
        } else {
          this.logger.debug('Shutdown handler completed', { name });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${name}: ${msg}`);
        this.logger.error('Shutdown handler failed', { name, error: msg });
      }
    }

    this.logger.info('Graceful shutdown completed', { errors: errors.length });
    return { success: errors.length === 0, errors };
  }

  get shuttingDown(): boolean {
    return this.isShuttingDown;
  }
}

let defaultManager: ShutdownManager | null = null;

export function getDefaultShutdownManager(): ShutdownManager {
  if (!defaultManager) {
    defaultManager = new ShutdownManager();
  }
  return defaultManager;
}

export function setDefaultShutdownManager(manager: ShutdownManager): void {
  defaultManager = manager;
}

export function registerShutdownHandler(handler: ShutdownHandler): void {
  getDefaultShutdownManager().register(handler);
}

export function installProcessShutdownHandlers(): void {
  getDefaultShutdownManager().installProcessHandlers();
}

export async function gracefulShutdown(): Promise<{ success: boolean; errors: string[] }> {
  return getDefaultShutdownManager().shutdown();
}

// Built-in handlers for common cleanup tasks

export function createCacheShutdownHandler<T>(
  cache: { clear(): Promise<void> },
  name = 'cache'
): ShutdownHandler {
  return {
    name,
    priority: 10,
    handler: async () => {
      await cache.clear();
    },
  };
}

export function createRedisShutdownHandler(
  adapter: { disconnect(): Promise<void> },
  name = 'redis'
): ShutdownHandler {
  return {
    name,
    priority: 20,
    handler: async () => {
      await adapter.disconnect();
    },
  };
}

export function createMetricsShutdownHandler(): ShutdownHandler {
  return {
    name: 'metrics',
    priority: 5,
    handler: () => {
      const metrics = getMetrics();
      if (metrics) {
        resetMetrics();
      }
    },
  };
}

export function createCircuitBreakerShutdownHandler(): ShutdownHandler {
  return {
    name: 'circuit-breaker',
    priority: 15,
    handler: () => {
      const executor = getDefaultExecutor();
      if (executor) {
        executor.reset();
      }
    },
  };
}
