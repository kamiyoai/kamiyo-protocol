// LRU cache with size limits, TTL support, and optional Redis backend

import { LIMITS } from './shared';
import { getLogger } from './logger';
import type { Logger } from './logger';
import { updateCacheSize, recordCacheAccess } from './metrics';

export interface CacheEntry<T> {
  value: T;
  expires: number;
  lastAccessed: number;
}

export interface CacheConfig {
  maxSize: number;
  defaultTTLMs: number;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: LIMITS.maxCacheSize,
  defaultTTLMs: 5 * 60 * 1000, // 5 minutes
};

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
}

// Cache adapter interface for pluggable backends
export interface CacheAdapter<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  size(): Promise<number>;
  keys(): Promise<string[]>;
}

// In-memory adapter (default)
export class MemoryCacheAdapter<T> implements CacheAdapter<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();

  async get(key: string): Promise<T | undefined> {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }
    entry.lastAccessed = Date.now();
    return entry.value;
  }

  async set(key: string, value: T, ttlMs: number): Promise<void> {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttlMs,
      lastAccessed: Date.now(),
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async size(): Promise<number> {
    return this.cache.size;
  }

  async keys(): Promise<string[]> {
    return Array.from(this.cache.keys());
  }

  // Memory-specific: get entry for LRU eviction
  getEntry(key: string): CacheEntry<T> | undefined {
    return this.cache.get(key);
  }

  entries(): IterableIterator<[string, CacheEntry<T>]> {
    return this.cache.entries();
  }
}

// Redis cache adapter configuration
export interface RedisCacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  tls?: boolean;
}

// Redis adapter (requires ioredis to be installed)
// Uses shared connection pool to prevent connection exhaustion
export class RedisCacheAdapter<T> implements CacheAdapter<T> {
  private client: RedisClient | null = null;
  private config: RedisCacheConfig;
  private keyPrefix: string;
  private logger: Logger;
  private connected = false;

  constructor(config: RedisCacheConfig, logger?: Logger) {
    this.config = config;
    this.keyPrefix = config.keyPrefix || 'kamiyo:paranet:';
    this.logger = logger || getLogger();
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // Use shared connection pool instead of creating new connection per adapter
      this.client = await getSharedRedisClient(this.config, this.logger);
      this.connected = true;
    } catch (err) {
      this.logger.error('Redis connection failed', { error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    // Don't actually disconnect - we're using shared pool
    // The shared client is managed separately via closeSharedRedisClient()
    this.connected = false;
    this.client = null;
    this.logger.debug('Redis adapter released (shared connection remains open)');
  }

  private prefixKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get(key: string): Promise<T | undefined> {
    if (!this.client || !this.connected) {
      await this.connect();
    }

    const data = await this.client!.get(this.prefixKey(key));
    if (!data) return undefined;

    try {
      return JSON.parse(data) as T;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: T, ttlMs: number): Promise<void> {
    if (!this.client || !this.connected) {
      await this.connect();
    }

    const ttlSeconds = Math.ceil(ttlMs / 1000);
    await this.client!.setex(this.prefixKey(key), ttlSeconds, JSON.stringify(value));
  }

  async delete(key: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      await this.connect();
    }

    const result = await this.client!.del(this.prefixKey(key));
    return result > 0;
  }

  async has(key: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      await this.connect();
    }

    const exists = await this.client!.exists(this.prefixKey(key));
    return exists > 0;
  }

  async clear(): Promise<void> {
    if (!this.client || !this.connected) {
      await this.connect();
    }

    const keys = await this.client!.keys(`${this.keyPrefix}*`);
    if (keys.length > 0) {
      await this.client!.del(...keys);
    }
  }

  async size(): Promise<number> {
    if (!this.client || !this.connected) {
      await this.connect();
    }

    const keys = await this.client!.keys(`${this.keyPrefix}*`);
    return keys.length;
  }

  async keys(): Promise<string[]> {
    if (!this.client || !this.connected) {
      await this.connect();
    }

    const keys = await this.client!.keys(`${this.keyPrefix}*`);
    return keys.map(k => k.replace(this.keyPrefix, ''));
  }

  // Invalidate by pattern
  async invalidateByPattern(pattern: string): Promise<number> {
    if (!this.client || !this.connected) {
      await this.connect();
    }

    const keys = await this.client!.keys(`${this.keyPrefix}${pattern}`);
    if (keys.length === 0) return 0;

    await this.client!.del(...keys);
    return keys.length;
  }
}

// Type for Redis client (minimal interface)
interface RedisClient {
  connect(): Promise<void>;
  quit(): Promise<void>;
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<void>;
  del(...keys: string[]): Promise<number>;
  exists(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

// Shared Redis client pool to prevent connection exhaustion
let sharedRedisClient: RedisClient | null = null;
let sharedRedisConfig: RedisCacheConfig | null = null;

async function getSharedRedisClient(config: RedisCacheConfig, logger: Logger): Promise<RedisClient> {
  // Check if config changed (different host/port = new connection)
  const configChanged = !sharedRedisConfig ||
    sharedRedisConfig.host !== config.host ||
    sharedRedisConfig.port !== config.port ||
    sharedRedisConfig.db !== config.db;

  if (sharedRedisClient && !configChanged) {
    return sharedRedisClient;
  }

  // Close existing connection if config changed
  if (sharedRedisClient && configChanged) {
    try {
      await sharedRedisClient.quit();
    } catch {
      // Ignore disconnect errors
    }
    sharedRedisClient = null;
  }

  // Create new shared connection
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Redis = await import('ioredis' as any).then((m: any) => m.default || m);
    sharedRedisClient = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db || 0,
      tls: config.tls ? {} : undefined,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    }) as RedisClient;

    await sharedRedisClient.connect();
    sharedRedisConfig = { ...config };
    logger.info('Shared Redis client connected', { host: config.host, port: config.port });

    return sharedRedisClient;
  } catch (err) {
    logger.error('Shared Redis connection failed', { error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

// Close the shared Redis connection (call during shutdown)
export async function closeSharedRedisClient(): Promise<void> {
  if (sharedRedisClient) {
    try {
      await sharedRedisClient.quit();
    } catch {
      // Ignore disconnect errors
    }
    sharedRedisClient = null;
    sharedRedisConfig = null;
  }
}

export class LRUCache<T> {
  private adapter: CacheAdapter<T>;
  private memoryAdapter: MemoryCacheAdapter<T> | null = null;
  private config: CacheConfig;
  private logger: Logger;
  private stats: CacheStats = { size: 0, hits: 0, misses: 0, evictions: 0 };

  constructor(config: Partial<CacheConfig> = {}, logger?: Logger, adapter?: CacheAdapter<T>) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.logger = logger || getLogger();

    if (adapter) {
      this.adapter = adapter;
    } else {
      this.memoryAdapter = new MemoryCacheAdapter<T>();
      this.adapter = this.memoryAdapter;
    }
  }

  async get(key: string): Promise<T | undefined> {
    const value = await this.adapter.get(key);

    if (value === undefined) {
      this.stats.misses++;
      recordCacheAccess(false, 'get');
      return undefined;
    }

    this.stats.hits++;
    recordCacheAccess(true, 'get');
    return value;
  }

  // Synchronous get for backward compatibility (only works with memory adapter)
  getSync(key: string): T | undefined {
    if (!this.memoryAdapter) {
      throw new Error('Synchronous get only available with memory adapter');
    }

    const entry = this.memoryAdapter.getEntry(key);
    if (!entry) {
      this.stats.misses++;
      recordCacheAccess(false, 'get');
      return undefined;
    }

    if (Date.now() > entry.expires) {
      this.memoryAdapter.delete(key);
      this.stats.misses++;
      recordCacheAccess(false, 'get');
      return undefined;
    }

    entry.lastAccessed = Date.now();
    this.stats.hits++;
    recordCacheAccess(true, 'get');
    return entry.value;
  }

  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    // Validate key length to prevent memory abuse
    if (key.length > 512) {
      this.logger.warn('Cache key too long', { keyLength: key.length });
      return;
    }

    // Evict if at capacity (only for memory adapter)
    if (this.memoryAdapter) {
      const size = await this.adapter.size();
      if (size >= this.config.maxSize && !(await this.adapter.has(key))) {
        await this.evictLRU();
      }
    }

    await this.adapter.set(key, value, ttlMs ?? this.config.defaultTTLMs);
    this.stats.size = await this.adapter.size();
    updateCacheSize(1);
  }

  // Synchronous set for backward compatibility
  setSync(key: string, value: T, ttlMs?: number): void {
    if (!this.memoryAdapter) {
      throw new Error('Synchronous set only available with memory adapter');
    }

    // Evict if at capacity
    const entries = Array.from(this.memoryAdapter.entries());
    if (entries.length >= this.config.maxSize && !this.memoryAdapter.getEntry(key)) {
      this.evictLRUSync();
    }

    this.memoryAdapter.set(key, value, ttlMs ?? this.config.defaultTTLMs);
    this.stats.size = entries.length + 1;
    updateCacheSize(1);
  }

  async delete(key: string): Promise<boolean> {
    const deleted = await this.adapter.delete(key);
    this.stats.size = await this.adapter.size();
    if (deleted) updateCacheSize(-1);
    return deleted;
  }

  async has(key: string): Promise<boolean> {
    return this.adapter.has(key);
  }

  async clear(): Promise<void> {
    const prevSize = this.stats.size;
    await this.adapter.clear();
    this.stats.size = 0;
    updateCacheSize(-prevSize);
    this.logger.debug('Cache cleared');
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  // Remove expired entries (memory adapter only)
  async prune(): Promise<number> {
    if (!this.memoryAdapter) {
      return 0;
    }

    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.memoryAdapter.entries()) {
      if (now > entry.expires) {
        await this.adapter.delete(key);
        pruned++;
      }
    }

    this.stats.size = await this.adapter.size();
    if (pruned > 0) {
      this.logger.debug('Cache pruned', { pruned });
      updateCacheSize(-pruned);
    }
    return pruned;
  }

  private async evictLRU(): Promise<void> {
    if (!this.memoryAdapter) return;

    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.memoryAdapter.entries()) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      await this.adapter.delete(oldestKey);
      this.stats.evictions++;
      this.stats.size = await this.adapter.size();
      updateCacheSize(-1);
      this.logger.debug('Cache evicted LRU entry', { key: oldestKey.substring(0, 30) });
    }
  }

  private evictLRUSync(): void {
    if (!this.memoryAdapter) return;

    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.memoryAdapter.entries()) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.memoryAdapter.delete(oldestKey);
      this.stats.evictions++;
      this.logger.debug('Cache evicted LRU entry', { key: oldestKey.substring(0, 30) });
    }
  }
}

// Cache invalidation helper
export class CacheInvalidator<T> {
  private cache: LRUCache<T>;
  private patterns: Map<string, Set<string>> = new Map();

  constructor(cache: LRUCache<T>) {
    this.cache = cache;
  }

  // Register a key with tags for group invalidation
  register(key: string, tags: string[]): void {
    for (const tag of tags) {
      if (!this.patterns.has(tag)) {
        this.patterns.set(tag, new Set());
      }
      this.patterns.get(tag)!.add(key);
    }
  }

  // Invalidate all keys with a given tag
  async invalidateByTag(tag: string): Promise<number> {
    const keys = this.patterns.get(tag);
    if (!keys) return 0;

    let invalidated = 0;
    for (const key of keys) {
      if (await this.cache.delete(key)) {
        invalidated++;
      }
    }

    return invalidated;
  }

  // Invalidate by global ID (for write operations)
  async invalidateByGlobalId(globalId: string): Promise<number> {
    return this.invalidateByTag(`globalId:${globalId}`);
  }
}

// Create cache with invalidation support
export function createCacheWithInvalidation<T>(
  config?: Partial<CacheConfig>,
  logger?: Logger,
  adapter?: CacheAdapter<T>
): { cache: LRUCache<T>; invalidator: CacheInvalidator<T> } {
  const cache = new LRUCache<T>(config, logger, adapter);
  const invalidator = new CacheInvalidator(cache);
  return { cache, invalidator };
}

// Create Redis-backed cache
export function createRedisCache<T>(
  redisConfig: RedisCacheConfig,
  cacheConfig?: Partial<CacheConfig>,
  logger?: Logger
): { cache: LRUCache<T>; adapter: RedisCacheAdapter<T>; invalidator: CacheInvalidator<T> } {
  const adapter = new RedisCacheAdapter<T>(redisConfig, logger);
  const cache = new LRUCache<T>(cacheConfig, logger, adapter);
  const invalidator = new CacheInvalidator(cache);
  return { cache, adapter, invalidator };
}
