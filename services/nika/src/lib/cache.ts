/**
 * Simple LRU cache for Nika service
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface LRUCacheConfig {
  maxSize: number;
  ttlMs: number;
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private config: LRUCacheConfig;

  constructor(config: Partial<LRUCacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize ?? 1000,
      ttlMs: config.ttlMs ?? 5 * 60 * 1000,
    };
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    // Remove if exists to update position
    this.cache.delete(key);

    // Evict oldest if at capacity
    while (this.cache.size >= this.config.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.config.ttlMs),
    });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  // Remove expired entries
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }
}
