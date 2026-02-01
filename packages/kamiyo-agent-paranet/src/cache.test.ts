// Tests for cache module

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LRUCache,
  MemoryCacheAdapter,
  RedisCacheAdapter,
  CacheInvalidator,
  createCacheWithInvalidation,
  DEFAULT_CACHE_CONFIG,
} from './cache';
import { nullLogger } from './logger';

describe('MemoryCacheAdapter', () => {
  let adapter: MemoryCacheAdapter<string>;

  beforeEach(() => {
    adapter = new MemoryCacheAdapter<string>();
  });

  it('should set and get values', async () => {
    await adapter.set('key1', 'value1', 60000);
    const result = await adapter.get('key1');
    expect(result).toBe('value1');
  });

  it('should return undefined for missing keys', async () => {
    const result = await adapter.get('nonexistent');
    expect(result).toBeUndefined();
  });

  it('should expire values after TTL', async () => {
    await adapter.set('key1', 'value1', 10); // 10ms TTL
    await new Promise(resolve => setTimeout(resolve, 20));
    const result = await adapter.get('key1');
    expect(result).toBeUndefined();
  });

  it('should delete values', async () => {
    await adapter.set('key1', 'value1', 60000);
    const deleted = await adapter.delete('key1');
    expect(deleted).toBe(true);
    expect(await adapter.get('key1')).toBeUndefined();
  });

  it('should check if key exists', async () => {
    await adapter.set('key1', 'value1', 60000);
    expect(await adapter.has('key1')).toBe(true);
    expect(await adapter.has('nonexistent')).toBe(false);
  });

  it('should clear all values', async () => {
    await adapter.set('key1', 'value1', 60000);
    await adapter.set('key2', 'value2', 60000);
    await adapter.clear();
    expect(await adapter.size()).toBe(0);
  });

  it('should return size', async () => {
    await adapter.set('key1', 'value1', 60000);
    await adapter.set('key2', 'value2', 60000);
    expect(await adapter.size()).toBe(2);
  });

  it('should return keys', async () => {
    await adapter.set('key1', 'value1', 60000);
    await adapter.set('key2', 'value2', 60000);
    const keys = await adapter.keys();
    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
  });
});

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>({ maxSize: 3, defaultTTLMs: 60000 }, nullLogger);
  });

  it('should set and get values', async () => {
    await cache.set('key1', 'value1');
    const result = await cache.get('key1');
    expect(result).toBe('value1');
  });

  it('should track hits and misses', async () => {
    await cache.set('key1', 'value1');
    await cache.get('key1'); // hit
    await cache.get('nonexistent'); // miss

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('should evict LRU entry when at capacity', async () => {
    // Use sync methods to avoid timing issues with lastAccessed
    cache.setSync('key1', 'value1');
    await new Promise(r => setTimeout(r, 5));
    cache.setSync('key2', 'value2');
    await new Promise(r => setTimeout(r, 5));
    cache.setSync('key3', 'value3');
    await new Promise(r => setTimeout(r, 5));

    // Access key1 to make it recently used
    cache.getSync('key1');
    await new Promise(r => setTimeout(r, 5));

    // Add fourth item - should evict key2 (least recently used)
    cache.setSync('key4', 'value4');

    expect(cache.getSync('key1')).toBe('value1');
    expect(cache.getSync('key2')).toBeUndefined(); // evicted
    expect(cache.getSync('key3')).toBe('value3');
    expect(cache.getSync('key4')).toBe('value4');
  });

  it('should use sync methods for memory adapter', () => {
    cache.setSync('key1', 'value1');
    const result = cache.getSync('key1');
    expect(result).toBe('value1');
  });

  it('should prune expired entries', async () => {
    cache = new LRUCache<string>({ maxSize: 10, defaultTTLMs: 10 }, nullLogger);
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');

    await new Promise(resolve => setTimeout(resolve, 20));

    const pruned = await cache.prune();
    expect(pruned).toBe(2);
  });

  it('should clear all entries', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.clear();
    expect(cache.getStats().size).toBe(0);
  });
});

describe('CacheInvalidator', () => {
  let cache: LRUCache<string>;
  let invalidator: CacheInvalidator<string>;

  beforeEach(() => {
    const result = createCacheWithInvalidation<string>(
      { maxSize: 100, defaultTTLMs: 60000 },
      nullLogger
    );
    cache = result.cache;
    invalidator = result.invalidator;
  });

  it('should invalidate by tag', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.set('key3', 'value3');

    invalidator.register('key1', ['group1']);
    invalidator.register('key2', ['group1']);
    invalidator.register('key3', ['group2']);

    const count = await invalidator.invalidateByTag('group1');
    expect(count).toBe(2);
    expect(await cache.get('key1')).toBeUndefined();
    expect(await cache.get('key2')).toBeUndefined();
    expect(await cache.get('key3')).toBe('value3');
  });

  it('should invalidate by global ID', async () => {
    const globalId = 'eip155:8453:0x1234567890123456789012345678901234567890:1';
    await cache.set(globalId, 'score-data');
    invalidator.register(globalId, [`globalId:${globalId}`]);

    const count = await invalidator.invalidateByGlobalId(globalId);
    expect(count).toBe(1);
    expect(await cache.get(globalId)).toBeUndefined();
  });

  it('should return 0 for non-existent tag', async () => {
    const count = await invalidator.invalidateByTag('nonexistent');
    expect(count).toBe(0);
  });
});

describe('RedisCacheAdapter', () => {
  it('should construct with config', () => {
    const adapter = new RedisCacheAdapter<string>(
      { host: 'localhost', port: 6379 },
      nullLogger
    );
    expect(adapter).toBeDefined();
  });

  it('should use custom key prefix', () => {
    const adapter = new RedisCacheAdapter<string>(
      { host: 'localhost', port: 6379, keyPrefix: 'custom:' },
      nullLogger
    );
    expect(adapter).toBeDefined();
  });

  // Integration tests with actual Redis would go here
  // Skip if REDIS_URL not set
  describe.skipIf(!process.env.REDIS_URL)('with Redis connection', () => {
    let adapter: RedisCacheAdapter<{ name: string; value: number }>;

    beforeEach(async () => {
      const url = new URL(process.env.REDIS_URL!);
      adapter = new RedisCacheAdapter(
        {
          host: url.hostname,
          port: parseInt(url.port) || 6379,
          password: url.password || undefined,
          keyPrefix: 'test:kamiyo:',
        },
        nullLogger
      );
      await adapter.connect();
      await adapter.clear();
    });

    it('should set and get complex values', async () => {
      const value = { name: 'test', value: 42 };
      await adapter.set('complex', value, 60000);
      const result = await adapter.get('complex');
      expect(result).toEqual(value);
    });

    it('should handle TTL expiration', async () => {
      await adapter.set('expiring', { name: 'temp', value: 1 }, 1000);
      expect(await adapter.has('expiring')).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(await adapter.has('expiring')).toBe(false);
    });

    it('should invalidate by pattern', async () => {
      await adapter.set('user:1', { name: 'alice', value: 1 }, 60000);
      await adapter.set('user:2', { name: 'bob', value: 2 }, 60000);
      await adapter.set('other:1', { name: 'other', value: 3 }, 60000);

      const count = await adapter.invalidateByPattern('user:*');
      expect(count).toBe(2);
      expect(await adapter.get('user:1')).toBeUndefined();
      expect(await adapter.get('other:1')).toBeDefined();
    });
  });
});

describe('DEFAULT_CACHE_CONFIG', () => {
  it('should have reasonable defaults', () => {
    expect(DEFAULT_CACHE_CONFIG.maxSize).toBe(5000); // Increased to reduce eviction frequency
    expect(DEFAULT_CACHE_CONFIG.defaultTTLMs).toBe(5 * 60 * 1000);
  });
});
