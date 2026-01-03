/**
 * Custom error types for @mitama/x402-client
 */

export type X402ErrorCode =
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REJECTED'
  | 'ESCROW_CREATION_FAILED'
  | 'ESCROW_NOT_FOUND'
  | 'ESCROW_EXPIRED'
  | 'ESCROW_ALREADY_USED'
  | 'SLA_VIOLATION'
  | 'DISPUTE_FAILED'
  | 'DISPUTE_REJECTED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'INVALID_PAYMENT_REQUIREMENT'
  | 'INSUFFICIENT_FUNDS'
  | 'PRICE_EXCEEDED'
  | 'INVALID_CONFIG'
  | 'INVALID_INPUT'
  | 'SIGNATURE_FAILED'
  | 'CIRCUIT_OPEN'
  | 'UNKNOWN';

export class X402Error extends Error {
  readonly code: X402ErrorCode;
  readonly statusCode?: number;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;
  readonly originalCause?: Error;

  constructor(
    code: X402ErrorCode,
    message: string,
    options?: {
      statusCode?: number;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'X402Error';
    this.code = code;
    this.statusCode = options?.statusCode;
    this.details = options?.details;
    this.originalCause = options?.cause;

    // Determine if error is retryable
    this.retryable = RETRYABLE_CODES.has(code);

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, X402Error);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      retryable: this.retryable,
    };
  }

  static fromResponse(response: Response, body?: unknown): X402Error {
    const statusCode = response.status;
    let code: X402ErrorCode;
    let message: string;

    switch (statusCode) {
      case 400:
        code = 'INVALID_INPUT';
        message = 'Bad request';
        break;
      case 401:
        code = 'PAYMENT_REQUIRED';
        message = 'Unauthorized - payment required';
        break;
      case 402:
        code = 'PAYMENT_REQUIRED';
        message = 'Payment required';
        break;
      case 403:
        code = 'PAYMENT_REJECTED';
        message = 'Payment rejected or insufficient';
        break;
      case 404:
        code = 'ESCROW_NOT_FOUND';
        message = 'Resource not found';
        break;
      case 408:
        code = 'TIMEOUT';
        message = 'Request timeout';
        break;
      case 429:
        code = 'NETWORK_ERROR';
        message = 'Rate limited';
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        code = 'NETWORK_ERROR';
        message = `Server error: ${statusCode}`;
        break;
      default:
        code = 'UNKNOWN';
        message = `HTTP ${statusCode}: ${response.statusText}`;
    }

    // Try to extract message from body
    if (body && typeof body === 'object') {
      const bodyObj = body as Record<string, unknown>;
      if (typeof bodyObj.error === 'string') {
        message = bodyObj.error;
      } else if (typeof bodyObj.message === 'string') {
        message = bodyObj.message;
      }
    }

    return new X402Error(code, message, { statusCode, details: body as Record<string, unknown> });
  }

  static paymentRequired(details?: Record<string, unknown>): X402Error {
    return new X402Error('PAYMENT_REQUIRED', 'Payment required to access resource', {
      statusCode: 402,
      details,
    });
  }

  static paymentFailed(reason: string, cause?: Error): X402Error {
    return new X402Error('PAYMENT_FAILED', `Payment failed: ${reason}`, { cause });
  }

  static escrowCreationFailed(reason: string, cause?: Error): X402Error {
    return new X402Error('ESCROW_CREATION_FAILED', `Escrow creation failed: ${reason}`, { cause });
  }

  static insufficientFunds(required: number, available: number): X402Error {
    return new X402Error(
      'INSUFFICIENT_FUNDS',
      `Insufficient funds: required ${required} SOL, available ${available} SOL`,
      { details: { required, available } }
    );
  }

  static priceExceeded(price: number, maxPrice: number): X402Error {
    return new X402Error(
      'PRICE_EXCEEDED',
      `Price ${price} SOL exceeds maximum ${maxPrice} SOL`,
      { details: { price, maxPrice } }
    );
  }

  static slaViolation(violations: string[], qualityScore: number): X402Error {
    return new X402Error(
      'SLA_VIOLATION',
      `SLA violated: ${violations.join('; ')}`,
      { details: { violations, qualityScore } }
    );
  }

  static timeout(operation: string, timeoutMs: number): X402Error {
    return new X402Error(
      'TIMEOUT',
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      { details: { operation, timeoutMs } }
    );
  }

  static invalidInput(field: string, reason: string): X402Error {
    return new X402Error(
      'INVALID_INPUT',
      `Invalid input for '${field}': ${reason}`,
      { details: { field, reason } }
    );
  }

  static circuitOpen(): X402Error {
    return new X402Error(
      'CIRCUIT_OPEN',
      'Circuit breaker is open. Service temporarily unavailable.'
    );
  }
}

const RETRYABLE_CODES = new Set<X402ErrorCode>([
  'TIMEOUT',
  'NETWORK_ERROR',
]);

/**
 * Type guard to check if an error is an X402Error
 */
export function isX402Error(error: unknown): error is X402Error {
  return error instanceof X402Error;
}

/**
 * Wrap unknown errors as X402Error
 */
export function wrapError(error: unknown, context?: string): X402Error {
  if (isX402Error(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const prefix = context ? `[${context}] ` : '';

  // Detect error type from message
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('timeout')) {
    return new X402Error('TIMEOUT', `${prefix}${message}`, {
      cause: error instanceof Error ? error : undefined,
    });
  }

  if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
    return new X402Error('NETWORK_ERROR', `${prefix}${message}`, {
      cause: error instanceof Error ? error : undefined,
    });
  }

  if (lowerMessage.includes('insufficient')) {
    return new X402Error('INSUFFICIENT_FUNDS', `${prefix}${message}`, {
      cause: error instanceof Error ? error : undefined,
    });
  }

  return new X402Error('UNKNOWN', `${prefix}${message}`, {
    cause: error instanceof Error ? error : undefined,
  });
}
