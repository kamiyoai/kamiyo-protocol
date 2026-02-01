// Tests for graceful shutdown handlers

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ShutdownManager,
  createCacheShutdownHandler,
  createMetricsShutdownHandler,
  createCircuitBreakerShutdownHandler,
} from './shutdown';
import { nullLogger } from './logger';

describe('ShutdownManager', () => {
  let manager: ShutdownManager;

  beforeEach(() => {
    manager = new ShutdownManager({ logger: nullLogger, timeoutMs: 1000 });
  });

  it('should execute handlers in priority order', async () => {
    const order: string[] = [];

    manager.register({
      name: 'low',
      priority: 1,
      handler: () => { order.push('low'); },
    });

    manager.register({
      name: 'high',
      priority: 10,
      handler: () => { order.push('high'); },
    });

    manager.register({
      name: 'medium',
      priority: 5,
      handler: () => { order.push('medium'); },
    });

    await manager.shutdown();

    expect(order).toEqual(['high', 'medium', 'low']);
  });

  it('should handle async handlers', async () => {
    let completed = false;

    manager.register({
      name: 'async',
      handler: async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        completed = true;
      },
    });

    await manager.shutdown();

    expect(completed).toBe(true);
  });

  it('should catch handler errors', async () => {
    manager.register({
      name: 'failing',
      handler: () => {
        throw new Error('Handler failed');
      },
    });

    manager.register({
      name: 'succeeding',
      handler: () => {},
    });

    const result = await manager.shutdown();

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('failing');
  });

  it('should timeout slow handlers', async () => {
    const quickManager = new ShutdownManager({ logger: nullLogger, timeoutMs: 50 });

    quickManager.register({
      name: 'slow',
      handler: async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      },
    });

    const result = await quickManager.shutdown();

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('timeout');
  });

  it('should prevent double shutdown', async () => {
    let callCount = 0;

    manager.register({
      name: 'counter',
      handler: () => { callCount++; },
    });

    await manager.shutdown();
    await manager.shutdown();

    expect(callCount).toBe(1);
  });

  it('should unregister handlers', () => {
    manager.register({ name: 'test', handler: () => {} });
    expect(manager.unregister('test')).toBe(true);
    expect(manager.unregister('nonexistent')).toBe(false);
  });

  it('should track shutting down state', async () => {
    expect(manager.shuttingDown).toBe(false);
    const promise = manager.shutdown();
    expect(manager.shuttingDown).toBe(true);
    await promise;
    expect(manager.shuttingDown).toBe(true);
  });
});

describe('Built-in shutdown handlers', () => {
  it('createCacheShutdownHandler should clear cache', async () => {
    const mockCache = { clear: vi.fn().mockResolvedValue(undefined) };
    const handler = createCacheShutdownHandler(mockCache);

    expect(handler.name).toBe('cache');
    expect(handler.priority).toBe(10);

    await handler.handler();

    expect(mockCache.clear).toHaveBeenCalledTimes(1);
  });

  it('createMetricsShutdownHandler should reset metrics', () => {
    const handler = createMetricsShutdownHandler();

    expect(handler.name).toBe('metrics');
    expect(handler.priority).toBe(5);

    // Should not throw even if metrics not initialized
    expect(() => handler.handler()).not.toThrow();
  });

  it('createCircuitBreakerShutdownHandler should reset circuit breaker', () => {
    const handler = createCircuitBreakerShutdownHandler();

    expect(handler.name).toBe('circuit-breaker');
    expect(handler.priority).toBe(15);

    // Should not throw
    expect(() => handler.handler()).not.toThrow();
  });
});

describe('Shutdown integration', () => {
  it('should run all handlers in correct order during shutdown', async () => {
    const manager = new ShutdownManager({ logger: nullLogger, timeoutMs: 5000 });
    const order: string[] = [];

    // Cache handler (priority 10)
    const mockCache = {
      clear: vi.fn().mockImplementation(async () => {
        order.push('cache');
      }),
    };
    manager.register(createCacheShutdownHandler(mockCache));

    // Circuit breaker handler (priority 15)
    manager.register({
      ...createCircuitBreakerShutdownHandler(),
      handler: () => { order.push('circuit-breaker'); },
    });

    // Metrics handler (priority 5)
    manager.register({
      ...createMetricsShutdownHandler(),
      handler: () => { order.push('metrics'); },
    });

    // Custom high-priority handler
    manager.register({
      name: 'connections',
      priority: 25,
      handler: () => { order.push('connections'); },
    });

    const result = await manager.shutdown();

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(order).toEqual(['connections', 'circuit-breaker', 'cache', 'metrics']);
  });

  it('should continue executing handlers after one fails', async () => {
    const manager = new ShutdownManager({ logger: nullLogger, timeoutMs: 5000 });
    const executed: string[] = [];

    manager.register({
      name: 'first',
      priority: 20,
      handler: () => { executed.push('first'); },
    });

    manager.register({
      name: 'failing',
      priority: 15,
      handler: () => {
        executed.push('failing');
        throw new Error('Handler error');
      },
    });

    manager.register({
      name: 'last',
      priority: 10,
      handler: () => { executed.push('last'); },
    });

    const result = await manager.shutdown();

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(executed).toEqual(['first', 'failing', 'last']);
  });
});
