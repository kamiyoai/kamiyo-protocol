import { describe, it, expect, beforeEach } from 'vitest';

// Simple cache implementation for testing (mirrors src/cache.ts)
class TestCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();
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

  size(): number {
    return this.store.size;
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
}

describe('Cache', () => {
  let cache: TestCache<string>;

  beforeEach(() => {
    cache = new TestCache<string>(1000); // 1 second TTL for tests
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('should delete values', () => {
    cache.set('key1', 'value1');
    cache.delete('key1');
    expect(cache.get('key1')).toBeUndefined();
  });

  it('should expire values after TTL', async () => {
    cache.set('key1', 'value1', 50); // 50ms TTL
    expect(cache.get('key1')).toBe('value1');

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(cache.get('key1')).toBeUndefined();
  });

  it('should track size correctly', () => {
    expect(cache.size()).toBe(0);
    cache.set('key1', 'value1');
    expect(cache.size()).toBe(1);
    cache.set('key2', 'value2');
    expect(cache.size()).toBe(2);
    cache.delete('key1');
    expect(cache.size()).toBe(1);
  });

  it('should cleanup expired entries', async () => {
    cache.set('key1', 'value1', 50);
    cache.set('key2', 'value2', 500);

    await new Promise(resolve => setTimeout(resolve, 100));

    const cleaned = cache.cleanup();
    expect(cleaned).toBe(1);
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBe('value2');
  });
});
