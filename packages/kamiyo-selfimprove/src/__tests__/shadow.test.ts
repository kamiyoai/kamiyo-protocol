import { describe, expect, it } from 'vitest';

async function runWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

describe('shadow/concurrency', () => {
  it('respects concurrency cap', async () => {
    const active: number[] = [];
    let peak = 0;
    const items = [1, 2, 3, 4, 5, 6];
    await runWithLimit(items, 2, async n => {
      active.push(n);
      peak = Math.max(peak, active.length);
      await new Promise(r => setTimeout(r, 5));
      active.splice(active.indexOf(n), 1);
      return n;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('preserves order in results array', async () => {
    const items = [10, 20, 30, 40];
    const results = await runWithLimit(items, 2, async n => n * 2);
    expect(results).toEqual([20, 40, 60, 80]);
  });

  it('runs serially when limit is 1', async () => {
    const order: number[] = [];
    await runWithLimit([1, 2, 3], 1, async n => {
      order.push(n);
      await new Promise(r => setTimeout(r, 1));
      order.push(-n);
      return n;
    });
    expect(order).toEqual([1, -1, 2, -2, 3, -3]);
  });

  it('handles empty input', async () => {
    const results = await runWithLimit<number, number>([], 3, async n => n);
    expect(results).toEqual([]);
  });

  it('caps worker count at items.length', async () => {
    const items = [1, 2];
    let maxConcurrent = 0;
    let active = 0;
    await runWithLimit(items, 10, async n => {
      active++;
      maxConcurrent = Math.max(maxConcurrent, active);
      await new Promise(r => setTimeout(r, 2));
      active--;
      return n;
    });
    expect(maxConcurrent).toBeLessThanOrEqual(items.length);
  });
});

describe('shadow/hash', () => {
  it('same input produces identical hash', async () => {
    const { createHash } = await import('crypto');
    const a = createHash('sha256').update('hello').digest('hex');
    const b = createHash('sha256').update('hello').digest('hex');
    expect(a).toBe(b);
  });

  it('different inputs produce different hashes', async () => {
    const { createHash } = await import('crypto');
    const a = createHash('sha256').update('hello').digest('hex');
    const b = createHash('sha256').update('world').digest('hex');
    expect(a).not.toBe(b);
  });
});
