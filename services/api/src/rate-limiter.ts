// Twitter API rate limiter with circuit breaker

import { logger } from './logger';

interface RateLimitState {
  isLimited: boolean;
  resetAt: number;
  consecutiveFailures: number;
}

const state: RateLimitState = {
  isLimited: false,
  resetAt: 0,
  consecutiveFailures: 0,
};

// Circuit breaker - stops all write attempts after too many consecutive failures
const CIRCUIT_BREAKER_THRESHOLD = 5; // Open circuit after 5 consecutive failures
const CIRCUIT_BREAKER_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes cooldown when circuit opens
let circuitOpen = false;
let circuitOpenedAt = 0;

export function isCircuitOpen(): boolean {
  if (!circuitOpen) return false;

  // Auto-close circuit after cooldown
  if (Date.now() - circuitOpenedAt > CIRCUIT_BREAKER_COOLDOWN_MS) {
    circuitOpen = false;
    circuitOpenedAt = 0;
    logger.info('Circuit breaker auto-closed after cooldown');
    return false;
  }

  return true;
}

function checkCircuitBreaker(): void {
  if (state.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && !circuitOpen) {
    circuitOpen = true;
    circuitOpenedAt = Date.now();
    logger.error('Circuit breaker OPEN - too many consecutive failures', {
      failures: state.consecutiveFailures,
      cooldownMinutes: CIRCUIT_BREAKER_COOLDOWN_MS / 60000,
    });
  }
}

// Minimum wait between any Twitter write operations (posts, replies)
const MIN_WRITE_INTERVAL_MS = 10000; // 10 seconds between writes
let lastWriteTime = 0;

// Extra buffer after rate limit clears before attempting writes
// Reads can happen immediately, but writes need more cooling time
const WRITE_BUFFER_MS = 60000; // 1 minute buffer for writes after rate limit clears
let rateLimitClearedAt = 0;

// Check if we're currently rate limited
export function isRateLimited(): boolean {
  if (!state.isLimited) return false;
  if (Date.now() > state.resetAt) {
    state.isLimited = false;
    rateLimitClearedAt = Date.now();
    // Don't reset consecutiveFailures - keep escalating if we keep hitting limits
    logger.info('Global rate limit cleared');
    return false;
  }
  return true;
}

// Record a rate limit hit (429 error)
export function recordRateLimit(resetTimestamp?: number): void {
  state.consecutiveFailures++;
  state.isLimited = true;

  if (resetTimestamp) {
    state.resetAt = resetTimestamp * 1000;
  } else {
    // Exponential backoff: 1min, 2min, 4min, 8min, max 15min
    const backoffMinutes = Math.min(Math.pow(2, state.consecutiveFailures - 1), 15);
    state.resetAt = Date.now() + backoffMinutes * 60 * 1000;
  }

  const waitSeconds = Math.round((state.resetAt - Date.now()) / 1000);
  logger.warn('Global rate limit activated', {
    waitSeconds,
    consecutiveFailures: state.consecutiveFailures,
  });

  // Check if we should open the circuit breaker
  checkCircuitBreaker();
}

// Record a successful API call - decay failures slowly
export function recordSuccess(): void {
  if (state.consecutiveFailures > 0) {
    state.consecutiveFailures = Math.max(0, state.consecutiveFailures - 1);
  }
  // Clear the buffer once we have a successful call
  rateLimitClearedAt = 0;
}

// Record a generic failure (non-rate-limit errors)
export function recordFailure(reason?: string): void {
  state.consecutiveFailures++;
  logger.warn('Twitter API failure recorded', {
    reason,
    consecutiveFailures: state.consecutiveFailures,
  });
  checkCircuitBreaker();
}

// Reset failures after sustained success (call after multiple successful ops)
export function resetFailures(): void {
  state.consecutiveFailures = 0;
}

// Force reset all rate limit state (for recovery)
export function forceReset(): void {
  state.isLimited = false;
  state.resetAt = 0;
  state.consecutiveFailures = 0;
  rateLimitClearedAt = 0;
  lastWriteTime = 0;
  circuitOpen = false;
  circuitOpenedAt = 0;
  logger.info('Rate limiter force reset (including circuit breaker)');
}

// Check if we can make a write operation (post, reply)
export function canWrite(): boolean {
  // Circuit breaker takes precedence
  if (isCircuitOpen()) return false;

  if (isRateLimited()) return false;

  // After rate limit clears, wait a fixed buffer before writes
  // Don't scale with failures - that causes a death spiral
  if (rateLimitClearedAt > 0 && Date.now() - rateLimitClearedAt < WRITE_BUFFER_MS) {
    return false;
  }

  return Date.now() - lastWriteTime >= MIN_WRITE_INTERVAL_MS;
}

// Record a write operation
export function recordWrite(): void {
  lastWriteTime = Date.now();
}

// Get time until next write is allowed (ms)
export function getWriteCooldown(): number {
  // Circuit breaker takes precedence - return remaining cooldown
  if (circuitOpen) {
    const remaining = CIRCUIT_BREAKER_COOLDOWN_MS - (Date.now() - circuitOpenedAt);
    if (remaining > 0) {
      return remaining;
    }
  }

  // Check rate limit
  if (state.isLimited && Date.now() < state.resetAt) {
    return state.resetAt - Date.now();
  }

  // Check post-rate-limit buffer
  if (rateLimitClearedAt > 0) {
    const bufferRemaining = WRITE_BUFFER_MS - (Date.now() - rateLimitClearedAt);
    if (bufferRemaining > 0) {
      return bufferRemaining;
    }
  }

  // Check minimum interval between writes
  const sinceLast = Date.now() - lastWriteTime;
  return Math.max(0, MIN_WRITE_INTERVAL_MS - sinceLast);
}

// Wait until we can write
export async function waitForWrite(): Promise<void> {
  // Loop until we can actually write (handles all conditions)
  while (!canWrite()) {
    const cooldown = getWriteCooldown();
    if (cooldown > 0) {
      logger.info('Waiting for write cooldown', { seconds: Math.round(cooldown / 1000) });
      await new Promise(r => setTimeout(r, Math.min(cooldown + 100, 30000))); // Cap at 30s chunks
    } else {
      // Small delay to prevent tight loop
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Helper to wrap Twitter API calls with rate limit handling
export async function withRateLimit<T>(
  operation: () => Promise<T>,
  isWrite: boolean = false
): Promise<T | null> {
  if (isRateLimited()) {
    logger.debug('Skipping due to rate limit');
    return null;
  }

  if (isWrite && !canWrite()) {
    await waitForWrite();
  }

  try {
    const result = await operation();
    recordSuccess();
    if (isWrite) recordWrite();
    return result;
  } catch (err: unknown) {
    const error = err as { code?: number; status?: number; rateLimit?: { reset?: number }; message?: string };

    if (error.code === 429 || error.status === 429 || error.message?.includes('429')) {
      recordRateLimit(error.rateLimit?.reset);
      return null;
    }
    throw err;
  }
}
