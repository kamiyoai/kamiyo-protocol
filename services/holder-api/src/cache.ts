interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class Cache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 5 * 60 * 1000) {
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

export const balanceCache = new Cache<number>(5 * 60 * 1000);

let cacheCleanupInterval: NodeJS.Timeout | null = null;

export function startCacheCleanup(): void {
  if (cacheCleanupInterval) return;
  cacheCleanupInterval = setInterval(() => {
    balanceCache.cleanup();
  }, 10 * 60 * 1000);
}

export function stopCacheCleanup(): void {
  if (cacheCleanupInterval) {
    clearInterval(cacheCleanupInterval);
    cacheCleanupInterval = null;
  }
}

startCacheCleanup();
