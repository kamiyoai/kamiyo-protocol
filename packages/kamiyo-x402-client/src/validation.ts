/**
 * Input validation for @kamiyo/x402-client
 */

import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { X402Error } from './errors';

// Validation constants
export const LIMITS = {
  MIN_AMOUNT_LAMPORTS: 1000, // 0.000001 SOL
  MAX_AMOUNT_LAMPORTS: 1_000_000_000_000, // 1000 SOL
  MIN_AMOUNT_SOL: 0.000001,
  MAX_AMOUNT_SOL: 1000,
  MIN_TIME_LOCK_SECONDS: 60, // 1 minute
  MAX_TIME_LOCK_SECONDS: 2_592_000, // 30 days
  MIN_QUALITY_THRESHOLD: 0,
  MAX_QUALITY_THRESHOLD: 100,
  MAX_TRANSACTION_ID_LENGTH: 64,
  MIN_TRANSACTION_ID_LENGTH: 1,
  MAX_URL_LENGTH: 2048,
  MAX_TIMEOUT_MS: 300_000, // 5 minutes
  MIN_TIMEOUT_MS: 1000, // 1 second
} as const;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a Solana public key
 */
export function validatePublicKey(
  value: unknown,
  field: string
): ValidationResult {
  if (!value) {
    return { valid: false, error: `${field} is required` };
  }

  try {
    if (value instanceof PublicKey) {
      return { valid: true };
    }

    if (typeof value === 'string') {
      new PublicKey(value);
      return { valid: true };
    }

    return { valid: false, error: `${field} must be a valid public key` };
  } catch {
    return { valid: false, error: `${field} is not a valid public key` };
  }
}

/**
 * Validate amount in SOL
 */
export function validateAmountSol(
  amount: unknown,
  field: string = 'amount'
): ValidationResult {
  if (typeof amount !== 'number') {
    return { valid: false, error: `${field} must be a number` };
  }

  if (!Number.isFinite(amount)) {
    return { valid: false, error: `${field} must be a finite number` };
  }

  if (amount < LIMITS.MIN_AMOUNT_SOL) {
    return {
      valid: false,
      error: `${field} must be at least ${LIMITS.MIN_AMOUNT_SOL} SOL`,
    };
  }

  if (amount > LIMITS.MAX_AMOUNT_SOL) {
    return {
      valid: false,
      error: `${field} must not exceed ${LIMITS.MAX_AMOUNT_SOL} SOL`,
    };
  }

  return { valid: true };
}

/**
 * Validate amount in lamports
 */
export function validateAmountLamports(
  amount: unknown,
  field: string = 'amount'
): ValidationResult {
  if (typeof amount !== 'number' && typeof amount !== 'bigint') {
    return { valid: false, error: `${field} must be a number` };
  }

  const numAmount = Number(amount);

  if (!Number.isFinite(numAmount)) {
    return { valid: false, error: `${field} must be a finite number` };
  }

  if (numAmount < LIMITS.MIN_AMOUNT_LAMPORTS) {
    return {
      valid: false,
      error: `${field} must be at least ${LIMITS.MIN_AMOUNT_LAMPORTS} lamports`,
    };
  }

  if (numAmount > LIMITS.MAX_AMOUNT_LAMPORTS) {
    return {
      valid: false,
      error: `${field} must not exceed ${LIMITS.MAX_AMOUNT_LAMPORTS} lamports`,
    };
  }

  return { valid: true };
}

/**
 * Validate time lock in seconds
 */
export function validateTimeLock(
  seconds: unknown,
  field: string = 'timeLock'
): ValidationResult {
  if (typeof seconds !== 'number') {
    return { valid: false, error: `${field} must be a number` };
  }

  if (!Number.isInteger(seconds)) {
    return { valid: false, error: `${field} must be an integer` };
  }

  if (seconds < LIMITS.MIN_TIME_LOCK_SECONDS) {
    return {
      valid: false,
      error: `${field} must be at least ${LIMITS.MIN_TIME_LOCK_SECONDS} seconds (${LIMITS.MIN_TIME_LOCK_SECONDS / 60} minutes)`,
    };
  }

  if (seconds > LIMITS.MAX_TIME_LOCK_SECONDS) {
    return {
      valid: false,
      error: `${field} must not exceed ${LIMITS.MAX_TIME_LOCK_SECONDS} seconds (${LIMITS.MAX_TIME_LOCK_SECONDS / 86400} days)`,
    };
  }

  return { valid: true };
}

/**
 * Validate quality threshold (0-100)
 */
export function validateQualityThreshold(
  threshold: unknown,
  field: string = 'qualityThreshold'
): ValidationResult {
  if (typeof threshold !== 'number') {
    return { valid: false, error: `${field} must be a number` };
  }

  if (!Number.isInteger(threshold)) {
    return { valid: false, error: `${field} must be an integer` };
  }

  if (threshold < LIMITS.MIN_QUALITY_THRESHOLD || threshold > LIMITS.MAX_QUALITY_THRESHOLD) {
    return {
      valid: false,
      error: `${field} must be between ${LIMITS.MIN_QUALITY_THRESHOLD} and ${LIMITS.MAX_QUALITY_THRESHOLD}`,
    };
  }

  return { valid: true };
}

/**
 * Validate transaction ID
 */
export function validateTransactionId(
  id: unknown,
  field: string = 'transactionId'
): ValidationResult {
  if (typeof id !== 'string') {
    return { valid: false, error: `${field} must be a string` };
  }

  if (id.length < LIMITS.MIN_TRANSACTION_ID_LENGTH) {
    return { valid: false, error: `${field} cannot be empty` };
  }

  if (id.length > LIMITS.MAX_TRANSACTION_ID_LENGTH) {
    return {
      valid: false,
      error: `${field} must not exceed ${LIMITS.MAX_TRANSACTION_ID_LENGTH} characters`,
    };
  }

  // Only allow alphanumeric, dash, underscore
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return {
      valid: false,
      error: `${field} may only contain alphanumeric characters, dashes, and underscores`,
    };
  }

  return { valid: true };
}

/**
 * Validate URL
 */
export function validateUrl(
  url: unknown,
  field: string = 'url'
): ValidationResult {
  if (typeof url !== 'string') {
    return { valid: false, error: `${field} must be a string` };
  }

  if (url.length > LIMITS.MAX_URL_LENGTH) {
    return {
      valid: false,
      error: `${field} must not exceed ${LIMITS.MAX_URL_LENGTH} characters`,
    };
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: `${field} must use http or https protocol` };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `${field} is not a valid URL` };
  }
}

/**
 * Validate timeout in milliseconds
 */
export function validateTimeout(
  ms: unknown,
  field: string = 'timeout'
): ValidationResult {
  if (typeof ms !== 'number') {
    return { valid: false, error: `${field} must be a number` };
  }

  if (!Number.isInteger(ms)) {
    return { valid: false, error: `${field} must be an integer` };
  }

  if (ms < LIMITS.MIN_TIMEOUT_MS) {
    return {
      valid: false,
      error: `${field} must be at least ${LIMITS.MIN_TIMEOUT_MS}ms`,
    };
  }

  if (ms > LIMITS.MAX_TIMEOUT_MS) {
    return {
      valid: false,
      error: `${field} must not exceed ${LIMITS.MAX_TIMEOUT_MS}ms`,
    };
  }

  return { valid: true };
}

/**
 * Assert validation passes, throw X402Error if not
 */
export function assertValid(result: ValidationResult, field: string): void {
  if (!result.valid) {
    throw X402Error.invalidInput(field, result.error || 'Invalid value');
  }
}

/**
 * Validate multiple fields at once
 */
export function validateAll(
  validations: Array<{ result: ValidationResult; field: string }>
): ValidationResult {
  for (const { result, field } of validations) {
    if (!result.valid) {
      return { valid: false, error: `${field}: ${result.error}` };
    }
  }
  return { valid: true };
}

/**
 * Sanitize transaction ID
 */
export function sanitizeTransactionId(id: string): string {
  // Remove any characters that aren't alphanumeric, dash, or underscore
  return id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, LIMITS.MAX_TRANSACTION_ID_LENGTH);
}

/**
 * Generate a unique transaction ID
 */
export function generateTransactionId(prefix: string = 'kamiyo'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${timestamp}-${random}`;
}
