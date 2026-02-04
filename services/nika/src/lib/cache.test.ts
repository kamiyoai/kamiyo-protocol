import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LRUCache } from './cache';

describe('LRUCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves values', () => {
    const cache = new LRUCache<string>();
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('returns undefined for missing keys', () => {
    const cache = new LRUCache<string>();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('evicts oldest entry when at capacity', () => {
    const cache = new LRUCache<string>({ maxSize: 2 });
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    expect(cache.get('key1')).toBeUndefined(); // evicted
    expect(cache.get('key2')).toBe('value2');
    expect(cache.get('key3')).toBe('value3');
  });

  it('updates LRU order on get', () => {
    const cache = new LRUCache<string>({ maxSize: 2 });
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    // Access key1 to make it most recently used
    cache.get('key1');

    // Add key3, should evict key2 (oldest)
    cache.set('key3', 'value3');

    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBeUndefined();
    expect(cache.get('key3')).toBe('value3');
  });

  it('expires entries after TTL', () => {
    const cache = new LRUCache<string>({ ttlMs: 1000 });
    cache.set('key1', 'value1');

    expect(cache.get('key1')).toBe('value1');

    vi.advanceTimersByTime(1001);

    expect(cache.get('key1')).toBeUndefined();
  });

  it('allows custom TTL per entry', () => {
    const cache = new LRUCache<string>({ ttlMs: 10000 });
    cache.set('key1', 'value1', 500); // 500ms TTL

    vi.advanceTimersByTime(501);

    expect(cache.get('key1')).toBeUndefined();
  });

  it('has() returns true for existing non-expired entries', () => {
    const cache = new LRUCache<string>();
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('missing')).toBe(false);
  });

  it('has() returns false for expired entries', () => {
    const cache = new LRUCache<string>({ ttlMs: 1000 });
    cache.set('key1', 'value1');

    vi.advanceTimersByTime(1001);

    expect(cache.has('key1')).toBe(false);
  });

  it('delete() removes entries', () => {
    const cache = new LRUCache<string>();
    cache.set('key1', 'value1');
    expect(cache.delete('key1')).toBe(true);
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.delete('missing')).toBe(false);
  });

  it('clear() removes all entries', () => {
    const cache = new LRUCache<string>();
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('key1')).toBeUndefined();
  });

  it('size returns current count', () => {
    const cache = new LRUCache<string>();
    expect(cache.size).toBe(0);
    cache.set('key1', 'value1');
    expect(cache.size).toBe(1);
    cache.set('key2', 'value2');
    expect(cache.size).toBe(2);
  });

  it('prune() removes expired entries', () => {
    const cache = new LRUCache<string>({ ttlMs: 1000 });
    cache.set('key1', 'value1');
    cache.set('key2', 'value2', 2000); // longer TTL

    vi.advanceTimersByTime(1500);

    const pruned = cache.prune();
    expect(pruned).toBe(1);
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBe('value2');
  });

  it('overwrites existing key', () => {
    const cache = new LRUCache<string>();
    cache.set('key1', 'value1');
    cache.set('key1', 'value2');
    expect(cache.get('key1')).toBe('value2');
    expect(cache.size).toBe(1);
  });
});
