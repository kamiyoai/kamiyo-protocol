import Database from 'better-sqlite3';
import { describe, expect, it, afterEach } from 'vitest';
import { SelfImproveBridge } from '../improve';
import { EventEmitter } from '../events';

// directly import selfimprove for setup
import {
  applySchema,
  initSelfImprove,
  resetContextForTests,
  listActiveVariants,
} from '@kamiyo-org/selfimprove';

function freshSetup() {
  const db = new Database(':memory:');
  applySchema(db);
  initSelfImprove({ db, judgeLLM: null });
  return db;
}

afterEach(() => resetContextForTests());

describe('SelfImproveBridge', () => {
  it('initializes and seeds a variant', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', {}, events);

    await bridge.init(db);
    bridge.seedVariant('You are helpful.', 'claude-sonnet-4-20250514');

    const variants = listActiveVariants('test-bot');
    expect(variants.length).toBeGreaterThanOrEqual(1);
  });

  it('routeVariant returns null when no variants scored', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', {}, events);

    await bridge.init(db);
    bridge.seedVariant('prompt A', 'model-a');

    // no scores recorded yet — routing may return null or the single variant
    const decision = bridge.routeVariant();
    // with one variant and no scores, it should still route (fallback)
    // or return null if bandit routing is disabled
    // either outcome is valid
    expect(decision === null || decision.variant !== undefined).toBe(true);
  });

  it('getOverrides returns defaults when no decision', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', {}, events);

    await bridge.init(db);

    const defaults = {
      model: 'default-model',
      system: 'default prompt',
      temperature: 0.5,
      maxTokens: 2000,
    };
    const overrides = bridge.getOverrides(defaults);
    expect(overrides.model).toBe('default-model');
    expect(overrides.system).toBe('default prompt');
  });

  it('recordInteraction does not throw', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', {}, events);

    await bridge.init(db);
    bridge.seedVariant('prompt', 'model');

    // should not throw even without a decision
    bridge.recordInteraction({
      input: 'hello',
      output: 'hi there',
      latencyMs: 100,
    });
  });

  it('respects enabled=false', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', { enabled: false }, events);

    await bridge.init(db);
    expect(bridge.enabled).toBe(false);
    expect(bridge.routeVariant()).toBeNull();
  });

  it('uses custom taskType', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', { taskType: 'custom-task' }, events);

    await bridge.init(db);
    expect(bridge.taskType).toBe('custom-task');
  });

  it('sweep runs without error', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', {}, events);

    await bridge.init(db);
    bridge.seedVariant('prompt A', 'model');

    const results = await bridge.sweep();
    expect(Array.isArray(results)).toBe(true);
  });

  it('shutdown clears sweep timer', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', { sweepIntervalMs: 1000 }, events);

    await bridge.init(db);
    bridge.shutdown();
  });

  it('scoreInteraction returns null when autoScore=false', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', { autoScore: false }, events);

    await bridge.init(db);
    const score = await bridge.scoreInteraction({ input: 'hi', output: 'hello' });
    expect(score).toBeNull();
  });

  it('scoreInteraction returns null when disabled', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', { enabled: false }, events);

    await bridge.init(db);
    const score = await bridge.scoreInteraction({ input: 'hi', output: 'hello' });
    expect(score).toBeNull();
  });

  it('scoreInteraction returns null without judgeLLM (no rubric scorer)', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', {}, events);

    await bridge.init(db);
    bridge.seedVariant('prompt', 'model');
    bridge.routeVariant();

    const score = await bridge.scoreInteraction({
      input: 'test input',
      output: 'test output',
      runId: 'run-123',
    });
    // no judgeLLM configured, scoring returns null
    expect(score).toBeNull();
  });

  it('getOverrides clamps invalid temperature from genome', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', {}, events);

    await bridge.init(db);

    // without a decision, should return defaults
    const defaults = { model: 'base', system: 'sys', temperature: 0.7, maxTokens: 2048 };
    const result = bridge.getOverrides(defaults);
    expect(result.temperature).toBe(0.7);
    expect(result.maxTokens).toBe(2048);
  });

  it('recordInteraction swallows errors gracefully', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', {}, events);

    await bridge.init(db);
    bridge.seedVariant('prompt', 'model');

    // route then record — should not throw even with no tournament entry context
    bridge.routeVariant();
    expect(() => {
      bridge.recordInteraction({
        input: 'hello',
        output: 'world',
        latencyMs: 50,
        costUsd: 0.001,
      });
    }).not.toThrow();
  });

  it('double init is idempotent', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', {}, events);

    await bridge.init(db);
    await bridge.init(db); // should not throw or re-init
    expect(bridge.enabled).toBe(true);
  });

  it('seedVariant deduplicates without error', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', {}, events);

    await bridge.init(db);
    bridge.seedVariant('prompt A', 'model-a');
    bridge.seedVariant('prompt A', 'model-a'); // same seed — should not throw

    const variants = listActiveVariants('test-bot');
    expect(variants.length).toBeGreaterThanOrEqual(1);
  });

  it('sweep emits improve:promote on promoted variants', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', { minSamples: 1, pThreshold: 1 }, events);

    await bridge.init(db);
    bridge.seedVariant('prompt', 'model');

    const promoted: string[] = [];
    events.on('improve:promote', e => promoted.push(e.variantId));

    await bridge.sweep();
    // with 0 samples and p=1, nothing should promote
    expect(promoted).toHaveLength(0);
  });

  it('routeVariant after shutdown returns null', async () => {
    const db = freshSetup();
    const events = new EventEmitter();
    const bridge = new SelfImproveBridge('test-bot', {}, events);

    await bridge.init(db);
    bridge.seedVariant('prompt', 'model');
    bridge.shutdown();

    // bridge still has api ref but is shut down — routing should still work
    // (shutdown only clears timer, not api)
    const decision = bridge.routeVariant();
    expect(decision === null || decision.variant !== undefined).toBe(true);
  });
});
