/**
 * Production utilities for vibe trading: retry, timeout, circuit breaker, logging.
 */

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export const nullLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export function createConsoleLogger(prefix: string): Logger {
  const fmt = (level: string, msg: string, data?: Record<string, unknown>) => {
    const ts = new Date().toISOString();
    const base = `[${ts}] [${level}] [${prefix}] ${msg}`;
    return data ? `${base} ${JSON.stringify(data)}` : base;
  };
  return {
    debug: (msg, data) => console.debug(fmt('DEBUG', msg, data)),
    info: (msg, data) => console.info(fmt('INFO', msg, data)),
    warn: (msg, data) => console.warn(fmt('WARN', msg, data)),
    error: (msg, data) => console.error(fmt('ERROR', msg, data)),
  };
}

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  retryOn?: (error: Error) => boolean;
}

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  timeoutMs: 30000,
};

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class RetryExhaustedError extends Error {
  lastError: Error;
  attempts: number;

  constructor(message: string, lastError: Error, attempts: number) {
    super(message);
    this.name = 'RetryExhaustedError';
    this.lastError = lastError;
    this.attempts = attempts;
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  operation: string,
  opts: Partial<RetryOptions> = {},
  logger: Logger = nullLogger
): Promise<T> {
  const options = { ...DEFAULT_RETRY, ...opts };
  let lastError: Error = new Error('No attempts made');

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      const result = await withTimeout(fn(), options.timeoutMs, operation);
      if (attempt > 1) {
        logger.info(`${operation} succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const shouldRetry = options.retryOn ? options.retryOn(lastError) : true;
      const isLastAttempt = attempt === options.maxAttempts;

      if (!shouldRetry || isLastAttempt) {
        logger.error(`${operation} failed after ${attempt} attempts`, {
          error: lastError.message,
          attempts: attempt,
        });
        break;
      }

      const delay = Math.min(
        options.baseDelayMs * Math.pow(2, attempt - 1),
        options.maxDelayMs
      );

      logger.warn(`${operation} failed, retrying in ${delay}ms`, {
        attempt,
        error: lastError.message,
      });

      await sleep(delay);
    }
  }

  throw new RetryExhaustedError(
    `${operation} failed after ${options.maxAttempts} attempts: ${lastError.message}`,
    lastError,
    options.maxAttempts
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

const DEFAULT_CIRCUIT: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 3,
};

export class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private failures = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private options: CircuitBreakerOptions;
  private logger: Logger;

  constructor(opts: Partial<CircuitBreakerOptions> = {}, logger: Logger = nullLogger) {
    this.options = { ...DEFAULT_CIRCUIT, ...opts };
    this.logger = logger;
  }

  async execute<T>(fn: () => Promise<T>, operation: string): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.options.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenAttempts = 0;
        this.logger.info(`Circuit breaker half-open for ${operation}`);
      } else {
        throw new Error(`Circuit breaker open for ${operation}`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.options.halfOpenMaxAttempts) {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.logger.info('Circuit breaker closed after successful half-open attempts');
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.logger.warn('Circuit breaker opened from half-open state');
    } else if (this.failures >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.logger.warn(`Circuit breaker opened after ${this.failures} failures`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.halfOpenAttempts = 0;
  }
}

export class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    return new Promise(resolve => {
      const release = () => {
        const next = this.queue.shift();
        if (next) {
          next();
        } else {
          this.locked = false;
        }
      };

      if (this.locked) {
        this.queue.push(() => resolve(release));
      } else {
        this.locked = true;
        resolve(release);
      }
    });
  }
}

export interface Metrics {
  strategiesCreated: number;
  strategiesActivated: number;
  strategiesFailed: number;
  strategiesClosed: number;
  ordersPlaced: number;
  ordersFilled: number;
  ordersFailed: number;
  stopLossTriggered: number;
  takeProfitTriggered: number;
  totalPnl: number;
  apiErrors: number;
  parseErrors: number;
}

export function createMetrics(): Metrics {
  return {
    strategiesCreated: 0,
    strategiesActivated: 0,
    strategiesFailed: 0,
    strategiesClosed: 0,
    ordersPlaced: 0,
    ordersFilled: 0,
    ordersFailed: 0,
    stopLossTriggered: 0,
    takeProfitTriggered: 0,
    totalPnl: 0,
    apiErrors: 0,
    parseErrors: 0,
  };
}
