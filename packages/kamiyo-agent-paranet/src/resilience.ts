// Retry and circuit breaker patterns for DKG operations

import { getLogger, createTimer } from './logger';
import type { Logger } from './logger';

// Retry configuration
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 10000,
  jitterFactor: 0.2,
};

// Circuit breaker configuration
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenRequests: 1,
};

// Calculate delay with exponential backoff and jitter
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = capped * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.max(0, capped + jitter);
}

// Check if error is retryable
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network errors, timeouts, and server errors are retryable
    if (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('etimedout') ||
      message.includes('network') ||
      message.includes('socket') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504') ||
      message.includes('429') // Rate limit
    ) {
      return true;
    }
  }
  return false;
}

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry wrapper
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  logger?: Logger
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const log = logger || getLogger();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === fullConfig.maxRetries || !isRetryableError(error)) {
        throw lastError;
      }

      const delay = calculateDelay(attempt, fullConfig);
      log.debug('Retrying operation', { attempt: attempt + 1, maxRetries: fullConfig.maxRetries, delay, error: lastError.message });
      await sleep(delay);
    }
  }

  throw lastError;
}

// Circuit breaker states
type CircuitState = 'closed' | 'open' | 'half-open';

// Circuit breaker implementation
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenSuccesses: number = 0;
  private config: CircuitBreakerConfig;
  private logger: Logger;

  constructor(config: Partial<CircuitBreakerConfig> = {}, logger?: Logger) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.logger = logger || getLogger();
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === 'open') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.config.resetTimeoutMs) {
        this.state = 'half-open';
        this.halfOpenSuccesses = 0;
        this.logger.info('Circuit breaker transitioning to half-open');
      } else {
        throw new CircuitOpenError(`Circuit breaker is open. Retry after ${Math.ceil((this.config.resetTimeoutMs - timeSinceFailure) / 1000)}s`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.config.halfOpenRequests) {
        this.state = 'closed';
        this.failures = 0;
        this.logger.info('Circuit breaker closed after successful half-open requests');
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      this.logger.warn('Circuit breaker opened after half-open failure');
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      this.logger.warn('Circuit breaker opened after reaching failure threshold', { failures: this.failures });
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.halfOpenSuccesses = 0;
    this.logger.info('Circuit breaker manually reset');
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// Combined retry with circuit breaker
export class ResilientExecutor {
  private circuitBreaker: CircuitBreaker;
  private retryConfig: RetryConfig;
  private logger: Logger;

  constructor(
    retryConfig: Partial<RetryConfig> = {},
    circuitBreakerConfig: Partial<CircuitBreakerConfig> = {},
    logger?: Logger
  ) {
    this.logger = logger || getLogger();
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig, this.logger);
  }

  async execute<T>(operation: () => Promise<T>, operationName?: string): Promise<T> {
    const timer = createTimer();
    const log = this.logger.child({ operation: operationName || 'unknown' });

    try {
      const result = await this.circuitBreaker.execute(() =>
        withRetry(operation, this.retryConfig, log)
      );
      log.debug('Operation succeeded', { duration: timer() });
      return result;
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        log.warn('Operation blocked by circuit breaker', { duration: timer() });
      } else {
        log.error('Operation failed after retries', { duration: timer(), error: error instanceof Error ? error.message : String(error) });
      }
      throw error;
    }
  }

  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  resetCircuit(): void {
    this.circuitBreaker.reset();
  }

  reset(): void {
    this.circuitBreaker.reset();
  }
}

// Default executor instance
let defaultExecutor: ResilientExecutor | null = null;

export function getDefaultExecutor(): ResilientExecutor {
  if (!defaultExecutor) {
    defaultExecutor = new ResilientExecutor();
  }
  return defaultExecutor;
}

export function setDefaultExecutor(executor: ResilientExecutor): void {
  defaultExecutor = executor;
}
