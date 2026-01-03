/**
 * Retry handler with exponential backoff and circuit breaker
 */

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryablePatterns: string[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryablePatterns: [
    'timeout',
    'fetch failed',
    'network error',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    '429', // Rate limit
    '502', // Bad gateway
    '503', // Service unavailable
    '504', // Gateway timeout
    'blockhash not found',
    'transaction was not confirmed',
    'node is unhealthy',
  ],
};

// Errors that should never be retried
const NON_RETRYABLE_PATTERNS = [
  'unauthorized',
  'forbidden',
  'invalid signature',
  'insufficient funds',
  'account not found',
  'invalid public key',
  'program error',
  '400',
  '401',
  '403',
  '404',
];

export class RetryHandler {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Check if an error is retryable
   */
  isRetryable(error: Error): boolean {
    const message = error.message.toLowerCase();
    const errorStr = String(error).toLowerCase();

    // Check for permanent failures first
    for (const pattern of NON_RETRYABLE_PATTERNS) {
      if (message.includes(pattern) || errorStr.includes(pattern)) {
        return false;
      }
    }

    // Check for retryable patterns
    for (const pattern of this.config.retryablePatterns) {
      const lowerPattern = pattern.toLowerCase();
      if (message.includes(lowerPattern) || errorStr.includes(lowerPattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    const baseDelay = this.config.initialDelayMs *
      Math.pow(this.config.backoffMultiplier, attempt);
    const cappedDelay = Math.min(baseDelay, this.config.maxDelayMs);
    // Add 0-25% jitter to prevent thundering herd
    const jitter = cappedDelay * 0.25 * Math.random();
    return Math.floor(cappedDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute function with retry logic
   */
  async execute<T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Last attempt - don't retry
        if (attempt === this.config.maxRetries) {
          break;
        }

        // Non-retryable error - fail immediately
        if (!this.isRetryable(lastError)) {
          throw lastError;
        }

        const delay = this.calculateDelay(attempt);
        const prefix = context ? `[${context}] ` : '';
        console.warn(
          `${prefix}Attempt ${attempt + 1}/${this.config.maxRetries + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`
        );

        await this.sleep(delay);
      }
    }

    const prefix = context ? `[${context}] ` : '';
    throw new Error(
      `${prefix}Failed after ${this.config.maxRetries + 1} attempts: ${lastError?.message}`
    );
  }
}

/**
 * Circuit breaker to prevent cascading failures
 */
export class CircuitBreaker {
  private failureCount = 0;
  private successCount = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private nextAttemptTime = 0;

  constructor(
    private failureThreshold: number = 5,
    private successThreshold: number = 2,
    private resetTimeoutMs: number = 60000
  ) {}

  canExecute(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      if (Date.now() >= this.nextAttemptTime) {
        this.state = 'half-open';
        this.successCount = 0;
        return true;
      }
      return false;
    }

    // half-open: allow one request through
    return true;
  }

  recordSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'closed';
        this.successCount = 0;
      }
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.nextAttemptTime = Date.now() + this.resetTimeoutMs;
    }
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = 0;
  }
}

/**
 * Combined retry handler with circuit breaker
 */
export class ResilientExecutor {
  private retryHandler: RetryHandler;
  private circuitBreaker: CircuitBreaker;

  constructor(
    retryConfig?: Partial<RetryConfig>,
    circuitBreakerConfig?: {
      failureThreshold?: number;
      successThreshold?: number;
      resetTimeoutMs?: number;
    }
  ) {
    this.retryHandler = new RetryHandler(retryConfig);
    this.circuitBreaker = new CircuitBreaker(
      circuitBreakerConfig?.failureThreshold,
      circuitBreakerConfig?.successThreshold,
      circuitBreakerConfig?.resetTimeoutMs
    );
  }

  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    if (!this.circuitBreaker.canExecute()) {
      throw new Error(
        `Circuit breaker is open. Service temporarily unavailable. State: ${this.circuitBreaker.getState()}`
      );
    }

    try {
      const result = await this.retryHandler.execute(fn, context);
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (error) {
      this.circuitBreaker.recordFailure();
      throw error;
    }
  }

  getCircuitState(): string {
    return this.circuitBreaker.getState();
  }

  resetCircuit(): void {
    this.circuitBreaker.reset();
  }
}
