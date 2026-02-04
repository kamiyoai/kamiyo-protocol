/**
 * Graceful Shutdown Manager
 *
 * Tracks in-flight operations and waits for completion on shutdown.
 */

import { createLogger } from './logger';

const log = createLogger('nika:shutdown');

export interface ShutdownHandler {
  name: string;
  handler: () => Promise<void>;
  priority: number; // Lower = runs first
}

export class ShutdownManager {
  private handlers: ShutdownHandler[] = [];
  private inFlightOps: Map<string, { startedAt: number; description: string }> = new Map();
  private isShuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;
  private timeoutMs: number;

  constructor(timeoutMs = 30000) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Register a shutdown handler.
   */
  register(name: string, handler: () => Promise<void>, priority = 10): void {
    this.handlers.push({ name, handler, priority });
    this.handlers.sort((a, b) => a.priority - b.priority);
    log.debug('Shutdown handler registered', { name, priority });
  }

  /**
   * Track the start of an in-flight operation.
   * Returns a function to call when the operation completes.
   */
  trackOperation(id: string, description: string): () => void {
    if (this.isShuttingDown) {
      log.warn('Operation started during shutdown', { id, description });
    }

    this.inFlightOps.set(id, {
      startedAt: Date.now(),
      description,
    });

    log.debug('Operation started', { id, description, inFlight: this.inFlightOps.size });

    return () => {
      this.inFlightOps.delete(id);
      log.debug('Operation completed', { id, inFlight: this.inFlightOps.size });
    };
  }

  /**
   * Check if shutdown is in progress.
   */
  isShutdown(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Get count of in-flight operations.
   */
  getInFlightCount(): number {
    return this.inFlightOps.size;
  }

  /**
   * Get details of in-flight operations.
   */
  getInFlightOps(): Array<{ id: string; description: string; durationMs: number }> {
    const now = Date.now();
    return Array.from(this.inFlightOps.entries()).map(([id, op]) => ({
      id,
      description: op.description,
      durationMs: now - op.startedAt,
    }));
  }

  /**
   * Initiate graceful shutdown.
   */
  async shutdown(signal: string): Promise<void> {
    if (this.shutdownPromise) {
      log.warn('Shutdown already in progress');
      return this.shutdownPromise;
    }

    this.isShuttingDown = true;
    log.info('Initiating graceful shutdown', { signal });

    this.shutdownPromise = this.executeShutdown();
    return this.shutdownPromise;
  }

  private async executeShutdown(): Promise<void> {
    const startTime = Date.now();

    // Wait for in-flight operations
    await this.waitForInFlightOps();

    // Run shutdown handlers
    for (const handler of this.handlers) {
      try {
        log.debug('Running shutdown handler', { name: handler.name });
        await Promise.race([
          handler.handler(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Handler timeout')), 5000)
          ),
        ]);
        log.debug('Shutdown handler completed', { name: handler.name });
      } catch (error) {
        log.error('Shutdown handler failed', {
          name: handler.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const duration = Date.now() - startTime;
    log.info('Graceful shutdown complete', { durationMs: duration });
  }

  private async waitForInFlightOps(): Promise<void> {
    if (this.inFlightOps.size === 0) {
      log.debug('No in-flight operations');
      return;
    }

    log.info('Waiting for in-flight operations', { count: this.inFlightOps.size });

    const deadline = Date.now() + this.timeoutMs;
    const checkInterval = 100;

    while (this.inFlightOps.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));

      if (this.inFlightOps.size > 0) {
        const remaining = deadline - Date.now();
        if (remaining % 5000 < checkInterval) {
          log.info('Still waiting for operations', {
            count: this.inFlightOps.size,
            remainingMs: remaining,
            ops: this.getInFlightOps().map((o) => o.description),
          });
        }
      }
    }

    if (this.inFlightOps.size > 0) {
      log.warn('Timeout waiting for operations, forcing shutdown', {
        count: this.inFlightOps.size,
        ops: this.getInFlightOps(),
      });
    }
  }
}

// Singleton instance
let shutdownManager: ShutdownManager | null = null;

export function getShutdownManager(): ShutdownManager {
  if (!shutdownManager) {
    shutdownManager = new ShutdownManager();
  }
  return shutdownManager;
}

export function initializeShutdownManager(timeoutMs?: number): ShutdownManager {
  shutdownManager = new ShutdownManager(timeoutMs);
  return shutdownManager;
}
