/**
 * Tsudzuki (続き - "Continuation/Persistence")
 * Handles transient errors and retries with exponential backoff
 */

export interface TsudzukiConfig {
  maxRetries: number;
  initialDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  retryableErrors: string[];
}

export const DEFAULT_TSUDZUKI_CONFIG: TsudzukiConfig = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  retryableErrors: [
    'Transaction was not confirmed',
    'Blockhash not found',
    'Node is unhealthy',
    'timeout',
    'fetch failed',
    '429', // Rate limit
    '503', // Service unavailable
    '504', // Gateway timeout
  ],
};

export class Tsudzuki {
  private config: TsudzukiConfig;

  constructor(config: Partial<TsudzukiConfig> = {}) {
    this.config = { ...DEFAULT_TSUDZUKI_CONFIG, ...config };
  }

  /**
   * Check if error is retryable
   * Returns true for transient network/RPC errors, false for permanent failures
   */
  private isRetryableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    const errorString = error.toString().toLowerCase();

    // Check if any retryable error pattern matches
    const isRetryable = this.config.retryableErrors.some((pattern) => {
      const lowerPattern = pattern.toLowerCase();
      return errorMessage.includes(lowerPattern) || errorString.includes(lowerPattern);
    });

    // Never retry permanent errors even if message matches pattern
    const isPermanent =
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('forbidden') ||
      errorMessage.includes('not found') ||
      errorMessage.includes('invalid signature') ||
      errorMessage.includes('insufficient funds') ||
      errorMessage.includes('account not found') ||
      errorString.includes('401') ||
      errorString.includes('403');

    return isRetryable && !isPermanent;
  }

  /**
   * Calculate delay for retry attempt with exponential backoff and jitter
   * Jitter prevents thundering herd when multiple clients retry simultaneously
   */
  private calculateDelay(attempt: number): number {
    const baseDelay =
      this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt);

    const cappedDelay = Math.min(baseDelay, this.config.maxDelay);

    // Add jitter: random value between 0% and 25% of the delay
    const jitter = cappedDelay * 0.25 * Math.random();

    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Sleep for specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
        lastError = error as Error;

        // Don't retry if this is the last attempt
        if (attempt === this.config.maxRetries) {
          break;
        }

        // Check if error is retryable
        if (!this.isRetryableError(lastError)) {
          throw lastError; // Non-retryable error, fail immediately
        }

        // Calculate delay and wait before retry
        const delay = this.calculateDelay(attempt);
        console.warn(
          `${context ? `[${context}] ` : ''}Attempt ${attempt + 1}/${this.config.maxRetries + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`
        );

        await this.sleep(delay);
      }
    }

    // All retries exhausted
    throw new Error(
      `${context ? `[${context}] ` : ''}Failed after ${this.config.maxRetries + 1} attempts: ${lastError?.message}`
    );
  }

  /**
   * Execute with custom retry count
   */
  async executeWithRetries<T>(
    fn: () => Promise<T>,
    retries: number,
    context?: string
  ): Promise<T> {
    const originalMaxRetries = this.config.maxRetries;
    this.config.maxRetries = retries;

    try {
      return await this.execute(fn, context);
    } finally {
      this.config.maxRetries = originalMaxRetries;
    }
  }
}

/**
 * Retry wrapper for common operations
 */
export class RetryableOperations {
  private retryHandler: Tsudzuki;

  constructor(config: Partial<TsudzukiConfig> = {}) {
    this.retryHandler = new Tsudzuki(config);
  }

  /**
   * Send transaction with retry
   */
  async sendTransaction<T>(
    sendFn: () => Promise<T>,
    context: string = 'Send Transaction'
  ): Promise<T> {
    return this.retryHandler.execute(sendFn, context);
  }

  /**
   * Fetch account data with retry
   */
  async fetchAccount<T>(
    fetchFn: () => Promise<T>,
    context: string = 'Fetch Account'
  ): Promise<T> {
    return this.retryHandler.execute(fetchFn, context);
  }

  /**
   * Confirm transaction with retry
   */
  async confirmTransaction<T>(
    confirmFn: () => Promise<T>,
    context: string = 'Confirm Transaction'
  ): Promise<T> {
    return this.retryHandler.execute(confirmFn, context);
  }

  /**
   * Get retry handler
   */
  getTsudzuki(): Tsudzuki {
    return this.retryHandler;
  }
}

/**
 * Circuit breaker for preventing repeated failures
 */
export class Mamori {
  private failureCount: number = 0;
  private successCount: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private nextAttemptTime: number = 0;

  constructor(
    private failureThreshold: number = 5,
    private successThreshold: number = 2,
    private timeout: number = 60000 // 1 minute
  ) {}

  /**
   * Check if circuit breaker allows execution
   */
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

    // half-open state
    return true;
  }

  /**
   * Record successful execution
   */
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

  /**
   * Record failed execution
   */
  recordFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.nextAttemptTime = Date.now() + this.timeout;
    }
  }

  /**
   * Get current state
   */
  getState(): string {
    return this.state;
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = 0;
  }
}

/**
 * Transaction batch handler with retry
 */
export class BatchHandler {
  private retryHandler: Tsudzuki;
  private circuitBreaker: Mamori;

  constructor(
    retryConfig: Partial<TsudzukiConfig> = {},
    circuitBreakerConfig?: {
      failureThreshold?: number;
      successThreshold?: number;
      timeout?: number;
    }
  ) {
    this.retryHandler = new Tsudzuki(retryConfig);
    this.circuitBreaker = new Mamori(
      circuitBreakerConfig?.failureThreshold,
      circuitBreakerConfig?.successThreshold,
      circuitBreakerConfig?.timeout
    );
  }

  /**
   * Execute batch of operations with retry and circuit breaker
   */
  async executeBatch<T>(
    operations: Array<() => Promise<T>>,
    options: {
      parallel?: boolean;
      stopOnError?: boolean;
      context?: string;
    } = {}
  ): Promise<Array<{ success: boolean; result?: T; error?: Error }>> {
    const { parallel = false, stopOnError = false, context = 'Batch Operation' } = options;

    if (!this.circuitBreaker.canExecute()) {
      throw new Error('Circuit breaker is open. Operations temporarily suspended.');
    }

    const results: Array<{ success: boolean; result?: T; error?: Error }> = [];

    try {
      if (parallel) {
        // Execute all operations in parallel
        const promises = operations.map((op, index) =>
          this.retryHandler
            .execute(op, `${context} #${index + 1}`)
            .then((result) => ({ success: true as const, result }))
            .catch((error) => ({ success: false as const, error: error as Error }))
        );

        results.push(...(await Promise.all(promises)));
      } else {
        // Execute operations sequentially
        for (let i = 0; i < operations.length; i++) {
          try {
            const result = await this.retryHandler.execute(
              operations[i],
              `${context} #${i + 1}`
            );
            results.push({ success: true, result });
          } catch (error) {
            results.push({ success: false, error: error as Error });

            if (stopOnError) {
              break;
            }
          }
        }
      }

      // Check if all operations failed
      const allFailed = results.every((r) => !r.success);
      if (allFailed) {
        this.circuitBreaker.recordFailure();
      } else {
        this.circuitBreaker.recordSuccess();
      }

      return results;
    } catch (error) {
      this.circuitBreaker.recordFailure();
      throw error;
    }
  }

  /**
   * Get circuit breaker state
   */
  getMamoriState(): string {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset circuit breaker
   */
  resetMamori(): void {
    this.circuitBreaker.reset();
  }
}
