import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';
import { WorkingMemory } from '../memory/working';
import { EpisodicMemory } from '../memory/episodic';
import { SemanticMemory } from '../memory/semantic';
import { Compactor } from '../memory/compactor';
import { applyAgentSchema } from '../schema';

function freshDb() {
  const db = new Database(':memory:');
  applyAgentSchema(db);
  return db;
}

describe('WorkingMemory', () => {
  it('tracks messages and estimates tokens', () => {
    const wm = new WorkingMemory({ maxTokens: 1000 });
    wm.push({ role: 'user', content: 'hello world' });
    wm.push({ role: 'assistant', content: 'hi there' });

    expect(wm.length).toBe(2);
    expect(wm.estimateTokens()).toBeGreaterThan(0);
    expect(wm.getMessages()).toHaveLength(2);
  });

  it('detects compaction need', () => {
    const wm = new WorkingMemory({ maxTokens: 10 }); // tiny limit
    wm.push({ role: 'user', content: 'a very long message that exceeds the token limit easily' });
    expect(wm.needsCompaction()).toBe(true);
  });

  it('truncates to keep N messages', () => {
    const wm = new WorkingMemory();
    for (let i = 0; i < 10; i++) {
      wm.push({ role: 'user', content: `msg ${i}` });
    }
    const removed = wm.truncate(3);
    expect(removed).toHaveLength(7);
    expect(wm.length).toBe(3);
  });

  it('sliding window drops until under threshold', () => {
    const wm = new WorkingMemory({ maxTokens: 20 });
    for (let i = 0; i < 10; i++) {
      wm.push({ role: 'user', content: `message number ${i} with some content` });
    }
    const removed = wm.slideWindow();
    expect(removed.length).toBeGreaterThan(0);
    expect(wm.length).toBeLessThan(10);
  });

  it('getAll includes compacted summary', () => {
    const wm = new WorkingMemory();
    wm.setCompactedSummary('Previous conversation about weather');
    wm.push({ role: 'user', content: 'continue' });

    const all = wm.getAll();
    expect(all[0].role).toBe('system');
    expect(all[0].content).toBe('Previous conversation about weather');
    expect(all[1].content).toBe('continue');
  });

  it('clear resets everything', () => {
    const wm = new WorkingMemory();
    wm.setSystemContext('sys');
    wm.setCompactedSummary('sum');
    wm.push({ role: 'user', content: 'hi' });
    wm.clear();
    expect(wm.length).toBe(0);
    expect(wm.getCompactedSummary()).toBeNull();
    expect(wm.getSystemContext()).toBe('');
  });
});

describe('EpisodicMemory', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = freshDb();
  });

  it('stores and retrieves episodes', () => {
    const mem = new EpisodicMemory(db, 'agent-1');
    const id = mem.store({ input: 'hello', output: 'world' });

    expect(typeof id).toBe('string');
    const ep = mem.getById(id);
    expect(ep).not.toBeNull();
    expect(ep!.input).toBe('hello');
    expect(ep!.output).toBe('world');
  });

  it('recalls recent episodes', () => {
    const mem = new EpisodicMemory(db, 'agent-1');
    mem.store({ input: 'a', output: 'b' });
    mem.store({ input: 'c', output: 'd' });

    const recent = mem.recent(5);
    expect(recent).toHaveLength(2);
  });

  it('counts episodes', () => {
    const mem = new EpisodicMemory(db, 'agent-1');
    expect(mem.count()).toBe(0);
    mem.store({ input: 'x', output: 'y' });
    expect(mem.count()).toBe(1);
  });

  it('isolates by agent id', () => {
    const mem1 = new EpisodicMemory(db, 'agent-1');
    const mem2 = new EpisodicMemory(db, 'agent-2');
    mem1.store({ input: 'a', output: 'b' });
    mem2.store({ input: 'c', output: 'd' });

    expect(mem1.count()).toBe(1);
    expect(mem2.count()).toBe(1);
  });

  it('FTS5 search finds matching episodes', () => {
    const mem = new EpisodicMemory(db, 'agent-1');
    mem.store({ input: 'weather forecast', output: 'sunny tomorrow' });
    mem.store({ input: 'stock price', output: 'AAPL at 180' });

    const results = mem.recall({ query: 'weather' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].input).toContain('weather');
  });

  it('FTS5 handles special characters in query safely', () => {
    const mem = new EpisodicMemory(db, 'agent-1');
    mem.store({ input: 'hello world', output: 'test' });

    // these should not throw — FTS5 operators are sanitized
    expect(() => mem.recall({ query: 'NOT OR AND' })).not.toThrow();
    expect(() => mem.recall({ query: '***' })).not.toThrow();
    expect(() => mem.recall({ query: '"unmatched' })).not.toThrow();
    expect(() => mem.recall({ query: '' })).not.toThrow();
  });

  it('empty FTS query returns empty array', () => {
    const mem = new EpisodicMemory(db, 'agent-1');
    mem.store({ input: 'hello', output: 'world' });
    const results = mem.recall({ query: '!!!' });
    expect(results).toHaveLength(0);
  });

  it('stores with all optional fields', () => {
    const mem = new EpisodicMemory(db, 'agent-1');
    const id = mem.store({
      input: 'test',
      output: 'result',
      summary: 'test interaction',
      tags: ['tag1', 'tag2'],
      qualityScore: 0.85,
      variantId: 'v-123',
      runId: 'run-1',
      turns: 3,
      toolsUsed: ['search', 'calc'],
      durationMs: 1500,
    });

    const ep = mem.getById(id);
    expect(ep!.summary).toBe('test interaction');
    expect(ep!.tags).toBe('tag1,tag2');
    expect(ep!.quality_score).toBe(0.85);
  });
});

describe('SemanticMemory', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = freshDb();
  });

  it('set and get facts', () => {
    const mem = new SemanticMemory(db, 'agent-1');
    mem.set('user.name', 'Alice');

    expect(mem.getValue('user.name')).toBe('Alice');
  });

  it('upserts on conflict', () => {
    const mem = new SemanticMemory(db, 'agent-1');
    mem.set('pref', 'a');
    mem.set('pref', 'b');

    expect(mem.getValue('pref')).toBe('b');
    expect(mem.count()).toBe(1);
  });

  it('deletes facts', () => {
    const mem = new SemanticMemory(db, 'agent-1');
    mem.set('key', 'val');
    expect(mem.delete('key')).toBe(true);
    expect(mem.getValue('key')).toBeNull();
    expect(mem.delete('nonexistent')).toBe(false);
  });

  it('lists with prefix filter', () => {
    const mem = new SemanticMemory(db, 'agent-1');
    mem.set('user.name', 'Alice');
    mem.set('user.age', '30');
    mem.set('system.version', '1.0');

    const userFacts = mem.list({ prefix: 'user.' });
    expect(userFacts).toHaveLength(2);
  });

  it('searches by substring', () => {
    const mem = new SemanticMemory(db, 'agent-1');
    mem.set('preference', 'dark mode');
    mem.set('language', 'English');

    const results = mem.search('dark');
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe('dark mode');
  });

  it('confidence filtering', () => {
    const mem = new SemanticMemory(db, 'agent-1');
    mem.set('high', 'yes', { confidence: 0.9 });
    mem.set('low', 'maybe', { confidence: 0.3 });

    const confident = mem.list({ minConfidence: 0.5 });
    expect(confident).toHaveLength(1);
    expect(confident[0].key).toBe('high');
  });

  it('toContext formats facts', () => {
    const mem = new SemanticMemory(db, 'agent-1');
    mem.set('user.name', 'Alice');
    mem.set('user.lang', 'English');

    const ctx = mem.toContext();
    expect(ctx).toContain('Known facts:');
    expect(ctx).toContain('user.name: Alice');
  });

  it('isolates by agent id', () => {
    const mem1 = new SemanticMemory(db, 'agent-1');
    const mem2 = new SemanticMemory(db, 'agent-2');
    mem1.set('key', 'val1');
    mem2.set('key', 'val2');

    expect(mem1.getValue('key')).toBe('val1');
    expect(mem2.getValue('key')).toBe('val2');
  });

  it('throws on empty key', () => {
    const mem = new SemanticMemory(db, 'agent-1');
    expect(() => mem.set('', 'val')).toThrow('non-empty');
  });

  it('clamps confidence to 0-1', () => {
    const mem = new SemanticMemory(db, 'agent-1');
    mem.set('over', 'val', { confidence: 5.0 });
    mem.set('under', 'val', { confidence: -2.0 });

    expect(mem.get('over')!.confidence).toBe(1);
    expect(mem.get('under')!.confidence).toBe(0);
  });

  it('toContext accepts custom minConfidence', () => {
    const mem = new SemanticMemory(db, 'agent-1');
    mem.set('low', 'val', { confidence: 0.2 });
    mem.set('mid', 'val', { confidence: 0.6 });

    expect(mem.toContext(0.1)).toContain('low');
    expect(mem.toContext(0.5)).not.toContain('low');
  });
});

describe('Compactor', () => {
  it('truncate strategy drops old messages', async () => {
    const wm = new WorkingMemory({ maxTokens: 10, strategy: 'truncate' });
    for (let i = 0; i < 10; i++) {
      wm.push({ role: 'user', content: `long message ${i} with extra padding text` });
    }

    const compactor = new Compactor();
    await compactor.compact(wm);
    expect(wm.length).toBe(4);
  });

  it('sliding-window strategy reduces until under threshold', async () => {
    const wm = new WorkingMemory({ maxTokens: 50, strategy: 'sliding-window' });
    for (let i = 0; i < 20; i++) {
      wm.push({ role: 'user', content: `message ${i} with some content` });
    }

    const compactor = new Compactor();
    await compactor.compact(wm);
    expect(wm.length).toBeLessThan(20);
  });

  it('summarize strategy falls back to truncation without provider', async () => {
    const wm = new WorkingMemory({ maxTokens: 10, strategy: 'summarize' });
    for (let i = 0; i < 10; i++) {
      wm.push({ role: 'user', content: `message ${i} with some padding` });
    }

    const compactor = new Compactor(); // no provider
    await compactor.compact(wm);
    expect(wm.length).toBe(2); // keeps last 2
  });

  it('skips compaction when not needed', async () => {
    const wm = new WorkingMemory({ maxTokens: 100_000 });
    wm.push({ role: 'user', content: 'short' });

    const compactor = new Compactor();
    await compactor.compact(wm);
    expect(wm.length).toBe(1);
  });

  it('summarize falls back to truncation on LLM error', async () => {
    const wm = new WorkingMemory({ maxTokens: 10, strategy: 'summarize' });
    for (let i = 0; i < 10; i++) {
      wm.push({ role: 'user', content: `message ${i} with padding` });
    }

    const failingProvider = {
      name: 'fail',
      defaultModel: 'fail',
      async chat() {
        throw new Error('LLM unavailable');
      },
    };

    const compactor = new Compactor({ provider: failingProvider });
    await compactor.compact(wm);
    // should not throw, should fall back to keeping last 2
    expect(wm.length).toBe(2);
    expect(wm.getCompactedSummary()).toBeNull();
  });

  it('summarize with mock LLM sets compacted summary', async () => {
    const wm = new WorkingMemory({ maxTokens: 10, strategy: 'summarize' });
    for (let i = 0; i < 10; i++) {
      wm.push({ role: 'user', content: `message ${i} with padding` });
    }

    const mockProvider = {
      name: 'mock',
      defaultModel: 'mock',
      async chat() {
        return {
          text: 'Summary of conversation.',
          toolCalls: [],
          usage: { inputTokens: 10, outputTokens: 5 },
          stopReason: 'end' as const,
        };
      },
    };

    const compactor = new Compactor({ provider: mockProvider });
    await compactor.compact(wm);
    expect(wm.length).toBe(2);
    expect(wm.getCompactedSummary()).toBe('Summary of conversation.');
  });
});
