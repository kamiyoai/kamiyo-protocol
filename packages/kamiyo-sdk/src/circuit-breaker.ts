/**
 * Circuit breaker for protecting against cascading failures
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failing fast, all requests rejected immediately
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 */

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms to wait before trying half-open (default: 30000) */
  resetTimeoutMs?: number;
  /** Number of successful requests in half-open to close circuit (default: 2) */
  successThreshold?: number;
  /** Optional name for logging */
  name?: string;
  /** Callback when state changes */
  onStateChange?: (state: CircuitState, prevState: CircuitState) => void;
}

const DEFAULT_CONFIG: Required<Omit<CircuitBreakerConfig, 'onStateChange' | 'name'>> = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  successThreshold: 2,
};

export class CircuitBreakerOpenError extends Error {
  constructor(name: string, retryAfterMs: number) {
    super(`Circuit breaker '${name}' is open. Retry after ${retryAfterMs}ms`);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private readonly config: Required<Omit<CircuitBreakerConfig, 'onStateChange' | 'name'>>;
  private readonly name: string;
  private readonly onStateChange?: (state: CircuitState, prev: CircuitState) => void;

  constructor(config?: CircuitBreakerConfig) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? DEFAULT_CONFIG.failureThreshold,
      resetTimeoutMs: config?.resetTimeoutMs ?? DEFAULT_CONFIG.resetTimeoutMs,
      successThreshold: config?.successThreshold ?? DEFAULT_CONFIG.successThreshold,
    };
    this.name = config?.name ?? 'default';
    this.onStateChange = config?.onStateChange;
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      const retryAfter = this.getRetryAfterMs();
      throw new CircuitBreakerOpenError(this.name, retryAfter);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Check if request can proceed
   */
  canExecute(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.transition('half_open');
        return true;
      }
      return false;
    }

    // half_open: allow limited requests
    return true;
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    if (this.state === 'half_open') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transition('closed');
      }
    } else if (this.state === 'closed') {
      this.failures = 0;
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half_open') {
      this.transition('open');
    } else if (this.state === 'closed' && this.failures >= this.config.failureThreshold) {
      this.transition('open');
    }
  }

  /**
   * Get time until retry is allowed (0 if not open)
   */
  getRetryAfterMs(): number {
    if (this.state !== 'open') return 0;
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.config.resetTimeoutMs - elapsed);
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats(): {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime: number;
    retryAfterMs: number;
  } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      retryAfterMs: this.getRetryAfterMs(),
    };
  }

  /**
   * Force reset to closed state
   */
  reset(): void {
    this.transition('closed');
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
  }

  private transition(newState: CircuitState): void {
    const prevState = this.state;
    if (prevState === newState) return;

    this.state = newState;

    if (newState === 'closed') {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === 'half_open') {
      this.successes = 0;
    }

    this.onStateChange?.(newState, prevState);
  }
}

/**
 * Pre-configured circuit breaker for ZK verification
 *
 * More aggressive settings since ZK failures usually indicate
 * a systemic issue (missing artifacts, corrupted files, etc.)
 */
export function createZkCircuitBreaker(
  onStateChange?: (state: CircuitState, prev: CircuitState) => void
): CircuitBreaker {
  return new CircuitBreaker({
    name: 'zk-verification',
    failureThreshold: 3,
    resetTimeoutMs: 60000,
    successThreshold: 1,
    onStateChange,
  });
}

/**
 * Registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  get(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker({ ...config, name });
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  getStats(): Record<string, ReturnType<CircuitBreaker['getStats']>> {
    const stats: Record<string, ReturnType<CircuitBreaker['getStats']>> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

/** Global registry instance */
export const circuitBreakers = new CircuitBreakerRegistry();
