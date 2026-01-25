// matlantis-style LRU eviction when memory constrained
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class Cache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 5 * 60 * 1000) { // 5 minutes default
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.store.set(key, { value, expiresAt });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  // Cleanup expired entries (call periodically)
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  size(): number {
    return this.store.size;
  }
}

// Tier cache - 5 minute TTL
export const tierCache = new Cache<string>(5 * 60 * 1000);

// Token balance cache - 5 minute TTL
export const balanceCache = new Cache<number>(5 * 60 * 1000);

// Cleanup caches every 10 minutes
let cacheCleanupInterval: NodeJS.Timeout | null = null;

export function startCacheCleanup(): void {
  if (cacheCleanupInterval) return;
  cacheCleanupInterval = setInterval(() => {
    tierCache.cleanup();
    balanceCache.cleanup();
  }, 10 * 60 * 1000);
}

export function stopCacheCleanup(): void {
  if (cacheCleanupInterval) {
    clearInterval(cacheCleanupInterval);
    cacheCleanupInterval = null;
  }
}

// Auto-start cleanup (for backwards compatibility)
startCacheCleanup();
