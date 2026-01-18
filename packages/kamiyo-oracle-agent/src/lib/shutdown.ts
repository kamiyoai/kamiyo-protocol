import { createLogger } from './logger';

const log = createLogger('shutdown');

export type ShutdownPhase = 'running' | 'stopping' | 'stopped';

export interface ShutdownHandler {
  name: string;
  priority: number; // Lower = runs first
  handler: () => Promise<void>;
  timeoutMs?: number;
}

export interface ShutdownOptions {
  timeoutMs: number;
  forceAfterMs: number;
}

const DEFAULT_OPTIONS: ShutdownOptions = {
  timeoutMs: 30000,
  forceAfterMs: 45000,
};

class ShutdownCoordinator {
  private phase: ShutdownPhase = 'running';
  private handlers: ShutdownHandler[] = [];
  private shutdownPromise: Promise<void> | null = null;
  private options: ShutdownOptions;

  constructor(options: Partial<ShutdownOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Register a shutdown handler
   */
  register(handler: ShutdownHandler): void {
    if (this.phase !== 'running') {
      log.warn('Cannot register handler during shutdown', { name: handler.name });
      return;
    }

    this.handlers.push(handler);
    this.handlers.sort((a, b) => a.priority - b.priority);

    log.debug('Shutdown handler registered', {
      name: handler.name,
      priority: handler.priority,
    });
  }

  /**
   * Unregister a shutdown handler
   */
  unregister(name: string): boolean {
    const index = this.handlers.findIndex((h) => h.name === name);
    if (index >= 0) {
      this.handlers.splice(index, 1);
      log.debug('Shutdown handler unregistered', { name });
      return true;
    }
    return false;
  }

  /**
   * Check if shutdown is in progress
   */
  isShuttingDown(): boolean {
    return this.phase !== 'running';
  }

  /**
   * Get current shutdown phase
   */
  getPhase(): ShutdownPhase {
    return this.phase;
  }

  /**
   * Initiate graceful shutdown
   */
  async shutdown(reason: string = 'requested'): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.phase = 'stopping';
    log.info('Graceful shutdown initiated', {
      reason,
      handlers: this.handlers.length,
    });

    this.shutdownPromise = this.executeShutdown();
    return this.shutdownPromise;
  }

  /**
   * Wait for shutdown to complete (or timeout)
   */
  async waitForShutdown(): Promise<void> {
    if (this.shutdownPromise) {
      await this.shutdownPromise;
    }
  }

  private async executeShutdown(): Promise<void> {
    const startTime = Date.now();
    const results: Array<{ name: string; success: boolean; error?: string }> = [];

    // Force shutdown timer
    const forceTimeout = setTimeout(() => {
      log.error('Force shutdown triggered', new Error('Shutdown timeout exceeded'));
      process.exit(1);
    }, this.options.forceAfterMs);

    try {
      for (const handler of this.handlers) {
        if (Date.now() - startTime > this.options.timeoutMs) {
          log.warn('Shutdown timeout reached, skipping remaining handlers');
          break;
        }

        const handlerTimeout = handler.timeoutMs || 10000;
        const result = await this.executeHandler(handler, handlerTimeout);
        results.push(result);
      }
    } finally {
      clearTimeout(forceTimeout);
    }

    this.phase = 'stopped';

    const failed = results.filter((r) => !r.success);
    const elapsed = Date.now() - startTime;

    if (failed.length > 0) {
      log.warn('Shutdown completed with errors', {
        total: results.length,
        failed: failed.length,
        elapsed,
        errors: failed.map((f) => f.name),
      });
    } else {
      log.info('Shutdown completed', {
        total: results.length,
        elapsed,
      });
    }
  }

  private async executeHandler(
    handler: ShutdownHandler,
    timeoutMs: number
  ): Promise<{ name: string; success: boolean; error?: string }> {
    const startTime = Date.now();

    try {
      log.debug('Executing shutdown handler', { name: handler.name });

      await Promise.race([
        handler.handler(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Handler timeout after ${timeoutMs}ms`)),
            timeoutMs
          )
        ),
      ]);

      log.debug('Shutdown handler completed', {
        name: handler.name,
        elapsed: Date.now() - startTime,
      });

      return { name: handler.name, success: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);

      log.error('Shutdown handler failed', new Error(error), {
        name: handler.name,
        elapsed: Date.now() - startTime,
      });

      return { name: handler.name, success: false, error };
    }
  }
}

// Singleton instance
let coordinator: ShutdownCoordinator | null = null;

/**
 * Get or create the shutdown coordinator
 */
export function getShutdownCoordinator(
  options?: Partial<ShutdownOptions>
): ShutdownCoordinator {
  if (!coordinator) {
    coordinator = new ShutdownCoordinator(options);
  }
  return coordinator;
}

/**
 * Register a shutdown handler
 */
export function onShutdown(
  name: string,
  handler: () => Promise<void>,
  priority: number = 50,
  timeoutMs?: number
): void {
  getShutdownCoordinator().register({ name, handler, priority, timeoutMs });
}

/**
 * Check if shutdown is in progress
 */
export function isShuttingDown(): boolean {
  return coordinator?.isShuttingDown() ?? false;
}

/**
 * Initiate graceful shutdown
 */
export function initiateShutdown(reason?: string): Promise<void> {
  return getShutdownCoordinator().shutdown(reason);
}

/**
 * Setup process signal handlers for graceful shutdown
 */
export function setupShutdownHandlers(): void {
  const handleSignal = (signal: string) => {
    log.info('Received shutdown signal', { signal });
    getShutdownCoordinator().shutdown(signal);
  };

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));

  process.on('uncaughtException', (err) => {
    log.error('Uncaught exception', err);
    getShutdownCoordinator().shutdown('uncaughtException').then(() => {
      process.exit(1);
    });
  });

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)));
  });

  log.info('Shutdown handlers installed');
}

/**
 * Priority constants for common shutdown order
 */
export const ShutdownPriority = {
  CRITICAL: 10,      // Stop accepting new work
  HIGH: 30,          // Stop background tasks
  NORMAL: 50,        // Stop main services
  LOW: 70,           // Cleanup tasks
  FINAL: 90,         // Close connections, flush logs
} as const;

