/**
 * Error classification - retryable vs permanent.
 */

/**
 * Base error with metadata.
 */
export class NikaError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly metadata: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    retryable: boolean,
    metadata: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'NikaError';
    this.code = code;
    this.retryable = retryable;
    this.metadata = metadata;
  }
}

/**
 * Transient error that should be retried.
 */
export class RetryableError extends NikaError {
  public readonly suggestedDelayMs: number;

  constructor(
    message: string,
    code: string,
    suggestedDelayMs = 1000,
    metadata: Record<string, unknown> = {}
  ) {
    super(message, code, true, metadata);
    this.name = 'RetryableError';
    this.suggestedDelayMs = suggestedDelayMs;
  }
}

/**
 * Permanent error that should not be retried.
 */
export class PermanentError extends NikaError {
  constructor(message: string, code: string, metadata: Record<string, unknown> = {}) {
    super(message, code, false, metadata);
    this.name = 'PermanentError';
  }
}

/**
 * Rate limit error with retry-after information.
 */
export class RateLimitError extends RetryableError {
  public readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, metadata: Record<string, unknown> = {}) {
    super(
      `Rate limited. Retry after ${retryAfterSeconds} seconds`,
      'RATE_LIMITED',
      retryAfterSeconds * 1000,
      metadata
    );
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Authentication error.
 */
export class AuthenticationError extends PermanentError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, 'AUTH_FAILED', metadata);
    this.name = 'AuthenticationError';
  }
}

/**
 * Validation error.
 */
export class ValidationError extends PermanentError {
  public readonly field?: string;

  constructor(message: string, field?: string, metadata: Record<string, unknown> = {}) {
    super(message, 'VALIDATION_FAILED', { ...metadata, field });
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Content blocked by moderation.
 */
export class ModerationError extends PermanentError {
  public readonly reasons: string[];

  constructor(reasons: string[], metadata: Record<string, unknown> = {}) {
    super(`Content blocked: ${reasons.join(', ')}`, 'MODERATION_BLOCKED', {
      ...metadata,
      reasons,
    });
    this.name = 'ModerationError';
    this.reasons = reasons;
  }
}

/**
 * Circuit breaker open.
 */
export class CircuitOpenError extends RetryableError {
  constructor(serviceName: string, metadata: Record<string, unknown> = {}) {
    super(
      `Circuit breaker open for ${serviceName}`,
      'CIRCUIT_OPEN',
      60000, // Suggest 60s wait
      { ...metadata, service: serviceName }
    );
    this.name = 'CircuitOpenError';
  }
}

/**
 * Timeout error.
 */
export class TimeoutError extends RetryableError {
  constructor(operation: string, timeoutMs: number, metadata: Record<string, unknown> = {}) {
    super(`Operation ${operation} timed out after ${timeoutMs}ms`, 'TIMEOUT', 5000, {
      ...metadata,
      operation,
      timeoutMs,
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Classify an error from Twitter API.
 */
export function classifyTwitterError(error: unknown): NikaError {
  if (error instanceof NikaError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const errorObj = error as { code?: number; data?: { status?: number } };
  const statusCode = errorObj.code || errorObj.data?.status;

  // Rate limit
  if (statusCode === 429 || message.toLowerCase().includes('rate limit')) {
    // Try to extract retry-after
    const retryMatch = message.match(/(\d+)\s*seconds?/i);
    const retryAfter = retryMatch ? parseInt(retryMatch[1], 10) : 60;
    return new RateLimitError(retryAfter, { originalError: message });
  }

  // Authentication errors
  if (statusCode === 401 || statusCode === 403) {
    return new AuthenticationError(message, { statusCode });
  }

  // Not found
  if (statusCode === 404) {
    return new PermanentError('Resource not found', 'NOT_FOUND', { statusCode });
  }

  // Bad request / validation
  if (statusCode === 400) {
    return new ValidationError(message, undefined, { statusCode });
  }

  // Duplicate content
  if (message.includes('duplicate') || message.includes('already posted')) {
    return new PermanentError('Duplicate content', 'DUPLICATE_CONTENT');
  }

  // Server errors - retryable
  if (statusCode && statusCode >= 500) {
    return new RetryableError(message, 'SERVER_ERROR', 5000, { statusCode });
  }

  // Network errors - retryable
  if (
    message.includes('ECONNREFUSED') ||
    message.includes('ENOTFOUND') ||
    message.includes('ETIMEDOUT') ||
    message.includes('network') ||
    message.includes('socket')
  ) {
    return new RetryableError(message, 'NETWORK_ERROR', 2000);
  }

  // Default to retryable for unknown errors
  return new RetryableError(message, 'UNKNOWN_ERROR', 5000);
}

/**
 * Classify an error from Anthropic API.
 */
export function classifyAnthropicError(error: unknown): NikaError {
  if (error instanceof NikaError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const errorObj = error as { status?: number };
  const statusCode = errorObj.status;

  // Rate limit
  if (statusCode === 429) {
    return new RateLimitError(60, { originalError: message });
  }

  // Auth errors
  if (statusCode === 401) {
    return new AuthenticationError('Invalid Anthropic API key', { statusCode });
  }

  // Bad request
  if (statusCode === 400) {
    return new PermanentError(message, 'INVALID_REQUEST', { statusCode });
  }

  // Overloaded
  if (statusCode === 529 || message.includes('overloaded')) {
    return new RetryableError('Anthropic API overloaded', 'API_OVERLOADED', 30000);
  }

  // Server errors
  if (statusCode && statusCode >= 500) {
    return new RetryableError(message, 'SERVER_ERROR', 5000, { statusCode });
  }

  return new RetryableError(message, 'UNKNOWN_ERROR', 5000);
}

/**
 * Check if an error is retryable.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof NikaError) {
    return error.retryable;
  }

  const classified = classifyTwitterError(error);
  return classified.retryable;
}

/**
 * Get suggested delay for retrying an error.
 */
export function getRetryDelay(error: unknown): number {
  if (error instanceof RetryableError) {
    return error.suggestedDelayMs;
  }

  if (error instanceof RateLimitError) {
    return error.retryAfterSeconds * 1000;
  }

  return 5000;
}
