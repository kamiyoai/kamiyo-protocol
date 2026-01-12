/**
 * Retry with exponential backoff and jitter.
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: 'none' | 'full' | 'decorrelated';
  retryOn?: (error: Error, attempt: number) => boolean;
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 10000,
  jitter: 'full',
};

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly lastError: Error,
    public readonly attempts: number,
    public readonly totalTimeMs: number
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

// Retry conditions
export const retryConditions = {
  always: () => true,
  never: () => false,

  onNetworkError: (error: Error) => {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('socket') ||
      msg.includes('fetch failed')
    );
  },

  onServerError: (error: Error) => {
    const msg = error.message.toLowerCase();
    return msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504');
  },

  onRetryable: (error: Error) => {
    return retryConditions.onNetworkError(error) || retryConditions.onServerError(error);
  },

  maxAttempts:
    (max: number) =>
    (_error: Error, attempt: number) =>
      attempt < max,

  compose:
    (...conditions: Array<(error: Error, attempt: number) => boolean>) =>
    (error: Error, attempt: number) =>
      conditions.some((c) => c(error, attempt)),
};

function calculateDelay(attempt: number, config: RetryConfig, prevDelay?: number): number {
  const exponential = config.baseDelayMs * Math.pow(2, attempt);

  switch (config.jitter) {
    case 'none':
      return Math.min(exponential, config.maxDelayMs);

    case 'full':
      return Math.floor(Math.random() * Math.min(exponential, config.maxDelayMs));

    case 'decorrelated': {
      const prev = prevDelay || config.baseDelayMs;
      const delay = Math.floor(Math.random() * (prev * 3 - config.baseDelayMs) + config.baseDelayMs);
      return Math.min(delay, config.maxDelayMs);
    }

    default:
      return Math.min(exponential, config.maxDelayMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const shouldRetry = cfg.retryOn || retryConditions.onRetryable;

  let lastError: Error | null = null;
  let prevDelay: number | undefined;
  const startTime = Date.now();

  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= cfg.maxAttempts - 1 || !shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      const delay = calculateDelay(attempt, cfg, prevDelay);
      prevDelay = delay;

      cfg.onRetry?.(lastError, attempt + 1, delay);

      await sleep(delay);
    }
  }

  throw new RetryError(
    `All ${cfg.maxAttempts} retry attempts failed`,
    lastError!,
    cfg.maxAttempts,
    Date.now() - startTime
  );
}

export async function retryWithResult<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attempts = 0;

  const cfg: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const shouldRetry = cfg.retryOn || retryConditions.onRetryable;

  let lastError: Error | null = null;
  let prevDelay: number | undefined;

  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    attempts++;
    try {
      const result = await fn();
      return {
        success: true,
        result,
        attempts,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= cfg.maxAttempts - 1 || !shouldRetry(lastError, attempt)) {
        return {
          success: false,
          error: lastError,
          attempts,
          totalTimeMs: Date.now() - startTime,
        };
      }

      const delay = calculateDelay(attempt, cfg, prevDelay);
      prevDelay = delay;

      cfg.onRetry?.(lastError, attempt + 1, delay);

      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError || new Error('Unknown error'),
    attempts,
    totalTimeMs: Date.now() - startTime,
  };
}

// Retry with deadline
export async function retryWithDeadline<T>(
  fn: () => Promise<T>,
  deadlineMs: number,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const deadline = Date.now() + deadlineMs;

  const wrappedRetryOn = (error: Error, attempt: number) => {
    if (Date.now() >= deadline) return false;
    const shouldRetry = config.retryOn || retryConditions.onRetryable;
    return shouldRetry(error, attempt);
  };

  return retry(fn, { ...config, retryOn: wrappedRetryOn });
}

// Retry with timeout per attempt
export async function retryWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const wrappedFn = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fn(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  };

  return retry(wrappedFn, config);
}

// Bulkhead pattern - limit concurrent operations
export class Bulkhead {
  private running = 0;
  private queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  constructor(
    private maxConcurrent: number,
    private maxQueue: number = 100
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return Promise.resolve();
    }

    if (this.queue.length >= this.maxQueue) {
      return Promise.reject(new Error('Bulkhead queue full'));
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
    });
  }

  private release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next.resolve();
    }
  }

  get stats() {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueue: this.maxQueue,
    };
  }
}

// Timeout wrapper
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message?: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message || `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

// Deadline context
export class DeadlineContext {
  private deadline: number;

  constructor(timeoutMs: number) {
    this.deadline = Date.now() + timeoutMs;
  }

  get remaining(): number {
    return Math.max(0, this.deadline - Date.now());
  }

  get exceeded(): boolean {
    return Date.now() >= this.deadline;
  }

  check(): void {
    if (this.exceeded) {
      throw new Error('Deadline exceeded');
    }
  }

  async wrap<T>(promise: Promise<T>): Promise<T> {
    return withTimeout(promise, this.remaining, 'Deadline exceeded');
  }
}
