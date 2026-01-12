/**
 * LRU cache with TTL and stale-while-revalidate.
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  staleAt?: number;
  size: number;
  hits: number;
  createdAt: number;
  lastAccessedAt: number;
}

export interface CacheConfig {
  maxSize: number;
  maxEntries: number;
  defaultTTL: number;
  staleWhileRevalidate?: number;
  onEvict?: (key: string, entry: CacheEntry<unknown>) => void;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  entries: number;
  size: number;
  evictions: number;
}

export interface Cache<T = unknown> {
  get(key: string): T | undefined;
  set(key: string, value: T, ttl?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
  keys(): string[];
  stats(): CacheStats;
}

// LRU Cache implementation
export class LRUCache<T = unknown> implements Cache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private config: CacheConfig;
  private totalSize = 0;
  private statsData = { hits: 0, misses: 0, evictions: 0 };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize ?? 100 * 1024 * 1024, // 100MB
      maxEntries: config.maxEntries ?? 10000,
      defaultTTL: config.defaultTTL ?? 300000, // 5 minutes
      staleWhileRevalidate: config.staleWhileRevalidate,
      onEvict: config.onEvict,
    };
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.statsData.misses++;
      return undefined;
    }

    const now = Date.now();
    if (now >= entry.expiresAt) {
      this.delete(key);
      this.statsData.misses++;
      return undefined;
    }

    this.cache.delete(key);
    entry.hits++;
    entry.lastAccessedAt = now;
    this.cache.set(key, entry);

    this.statsData.hits++;
    return entry.value;
  }

  getWithMeta(key: string): { value: T; stale: boolean } | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.statsData.misses++;
      return undefined;
    }

    const now = Date.now();
    if (now >= entry.expiresAt) {
      this.delete(key);
      this.statsData.misses++;
      return undefined;
    }

    this.cache.delete(key);
    entry.hits++;
    entry.lastAccessedAt = now;
    this.cache.set(key, entry);

    this.statsData.hits++;

    const stale = entry.staleAt !== undefined && now >= entry.staleAt;
    return { value: entry.value, stale };
  }

  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const actualTTL = ttl ?? this.config.defaultTTL;
    const size = this.estimateSize(value);

    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Evict if necessary
    this.evictIfNeeded(size);

    const entry: CacheEntry<T> = {
      value,
      expiresAt: now + actualTTL,
      staleAt: this.config.staleWhileRevalidate ? now + actualTTL - this.config.staleWhileRevalidate : undefined,
      size,
      hits: 0,
      createdAt: now,
      lastAccessedAt: now,
    };

    this.cache.set(key, entry);
    this.totalSize += size;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() >= entry.expiresAt) {
      this.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.totalSize -= entry.size;
    this.cache.delete(key);
    this.config.onEvict?.(key, entry as CacheEntry<unknown>);
    return true;
  }

  clear(): void {
    if (this.config.onEvict) {
      for (const [key, entry] of this.cache) {
        this.config.onEvict(key, entry as CacheEntry<unknown>);
      }
    }
    this.cache.clear();
    this.totalSize = 0;
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  stats(): CacheStats {
    const total = this.statsData.hits + this.statsData.misses;
    return {
      hits: this.statsData.hits,
      misses: this.statsData.misses,
      hitRate: total > 0 ? this.statsData.hits / total : 0,
      entries: this.cache.size,
      size: this.totalSize,
      evictions: this.statsData.evictions,
    };
  }

  private evictIfNeeded(newSize: number): void {
    // Evict by size
    while (this.totalSize + newSize > this.config.maxSize && this.cache.size > 0) {
      const oldest = this.cache.keys().next().value;
      if (oldest) {
        this.delete(oldest);
        this.statsData.evictions++;
      }
    }

    // Evict by count
    while (this.cache.size >= this.config.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest) {
        this.delete(oldest);
        this.statsData.evictions++;
      }
    }
  }

  private estimateSize(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'string') return value.length * 2;
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 4;
    if (Buffer.isBuffer(value)) return value.length;
    if (ArrayBuffer.isView(value)) return value.byteLength;

    // Estimate object size via JSON
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 1024; // Default estimate
    }
  }

  // Cleanup expired entries
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      if (now >= entry.expiresAt) {
        this.delete(key);
        pruned++;
      }
    }

    return pruned;
  }
}

// Response cache for API calls
export interface ResponseCacheKey {
  endpoint: string;
  method: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export class ResponseCache {
  private cache: LRUCache<unknown>;

  constructor(config?: Partial<CacheConfig>) {
    this.cache = new LRUCache(config);
  }

  private hashKey(key: ResponseCacheKey): string {
    const parts = [key.endpoint, key.method];
    if (key.body) parts.push(JSON.stringify(key.body));
    if (key.headers) parts.push(JSON.stringify(key.headers));
    return parts.join('|');
  }

  get<T>(key: ResponseCacheKey): T | undefined {
    return this.cache.get(this.hashKey(key)) as T | undefined;
  }

  getWithRevalidation<T>(key: ResponseCacheKey): { value: T; needsRevalidation: boolean } | undefined {
    const result = this.cache.getWithMeta(this.hashKey(key));
    if (!result) return undefined;
    return { value: result.value as T, needsRevalidation: result.stale };
  }

  set<T>(key: ResponseCacheKey, value: T, ttl?: number): void {
    this.cache.set(this.hashKey(key), value, ttl);
  }

  invalidate(key: ResponseCacheKey): boolean {
    return this.cache.delete(this.hashKey(key));
  }

  invalidateByEndpoint(endpoint: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(endpoint)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  stats(): CacheStats {
    return this.cache.stats();
  }

  clear(): void {
    this.cache.clear();
  }
}

// Memoization helper
export function memoize<T extends (...args: unknown[]) => unknown>(
  fn: T,
  options: {
    cache?: LRUCache;
    keyFn?: (...args: Parameters<T>) => string;
    ttl?: number;
  } = {}
): T {
  const cache = options.cache ?? new LRUCache({ maxEntries: 1000 });
  const keyFn = options.keyFn ?? ((...args) => JSON.stringify(args));

  return ((...args: Parameters<T>) => {
    const key = keyFn(...args);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const result = fn(...args);
    cache.set(key, result, options.ttl);
    return result;
  }) as T;
}

// Async memoization with deduplication
export function memoizeAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: {
    cache?: LRUCache;
    keyFn?: (...args: Parameters<T>) => string;
    ttl?: number;
  } = {}
): T {
  const cache = options.cache ?? new LRUCache({ maxEntries: 1000 });
  const inflight = new Map<string, Promise<unknown>>();
  const keyFn = options.keyFn ?? ((...args) => JSON.stringify(args));

  return (async (...args: Parameters<T>) => {
    const key = keyFn(...args);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const pending = inflight.get(key);
    if (pending) return pending;

    const promise = fn(...args).then((result) => {
      inflight.delete(key);
      cache.set(key, result, options.ttl);
      return result;
    }).catch((err) => {
      inflight.delete(key);
      throw err;
    });

    inflight.set(key, promise);
    return promise;
  }) as T;
}
