import { RateLimitError, isRetryableError } from './errors';
import { createLogger } from './logger';

const log = createLogger('retry');

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterMs: 500,
};

function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = Math.random() * config.jitterMs;
  return cappedDelay + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (!isRetryableError(error)) {
        log.error(`${operationName} failed with non-retryable error`, lastError);
        throw error;
      }

      // Check if rate limited with specific delay
      if (error instanceof RateLimitError) {
        const delay = error.retryAfterMs;
        log.warn(`${operationName} rate limited, waiting ${delay}ms`, {
          attempt,
          maxAttempts: fullConfig.maxAttempts,
        });
        await sleep(delay);
        continue;
      }

      // Check if we have more attempts
      if (attempt >= fullConfig.maxAttempts) {
        log.error(`${operationName} failed after ${attempt} attempts`, lastError);
        throw error;
      }

      // Calculate and apply delay
      const delay = calculateDelay(attempt, fullConfig);
      log.warn(`${operationName} failed, retrying in ${Math.round(delay)}ms`, {
        attempt,
        maxAttempts: fullConfig.maxAttempts,
        error: lastError.message,
      });
      await sleep(delay);
    }
  }

  throw lastError || new Error(`${operationName} failed after all retries`);
}

/**
 * Circuit breaker state
 */
interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuitStates = new Map<string, CircuitState>();

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
};

export async function withCircuitBreaker<T>(
  operation: () => Promise<T>,
  circuitName: string,
  config: Partial<CircuitBreakerConfig> = {}
): Promise<T> {
  const fullConfig = { ...DEFAULT_CIRCUIT_CONFIG, ...config };

  let state = circuitStates.get(circuitName);
  if (!state) {
    state = { failures: 0, lastFailure: 0, isOpen: false };
    circuitStates.set(circuitName, state);
  }

  // Check if circuit is open
  if (state.isOpen) {
    const timeSinceFailure = Date.now() - state.lastFailure;
    if (timeSinceFailure < fullConfig.resetTimeoutMs) {
      throw new Error(`Circuit ${circuitName} is open, try again later`);
    }
    // Reset circuit after timeout
    state.isOpen = false;
    state.failures = 0;
    log.info(`Circuit ${circuitName} reset after timeout`);
  }

  try {
    const result = await operation();
    // Success - reset failure count
    state.failures = 0;
    return result;
  } catch (error) {
    state.failures++;
    state.lastFailure = Date.now();

    if (state.failures >= fullConfig.failureThreshold) {
      state.isOpen = true;
      log.error(`Circuit ${circuitName} opened after ${state.failures} failures`);
    }

    throw error;
  }
}

export function resetCircuit(circuitName: string): void {
  circuitStates.delete(circuitName);
}
