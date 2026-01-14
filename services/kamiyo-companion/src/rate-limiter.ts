// Twitter API rate limiter

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
}

// Record a successful API call - decay failures slowly
export function recordSuccess(): void {
  if (state.consecutiveFailures > 0) {
    state.consecutiveFailures = Math.max(0, state.consecutiveFailures - 1);
  }
  // Clear the buffer once we have a successful call
  rateLimitClearedAt = 0;
}

// Reset failures after sustained success (call after multiple successful ops)
export function resetFailures(): void {
  state.consecutiveFailures = 0;
}

// Check if we can make a write operation (post, reply)
export function canWrite(): boolean {
  if (isRateLimited()) return false;

  // After rate limit clears, wait extra buffer before writes
  // Scale buffer with consecutive failures for extra safety
  const bufferMultiplier = Math.min(state.consecutiveFailures + 1, 3);
  const requiredBuffer = WRITE_BUFFER_MS * bufferMultiplier;
  if (rateLimitClearedAt > 0 && Date.now() - rateLimitClearedAt < requiredBuffer) {
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
  if (isRateLimited()) {
    return state.resetAt - Date.now();
  }
  const sinceLast = Date.now() - lastWriteTime;
  return Math.max(0, MIN_WRITE_INTERVAL_MS - sinceLast);
}

// Wait until we can write
export async function waitForWrite(): Promise<void> {
  const cooldown = getWriteCooldown();
  if (cooldown > 0) {
    await new Promise(r => setTimeout(r, cooldown));
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
