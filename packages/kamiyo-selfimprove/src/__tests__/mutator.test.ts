import { describe, expect, it } from 'vitest';
import { type AgentGenome } from '../genome';
import { crossoverGenomes, jitterGenome } from '../mutator';

const BASE: AgentGenome = {
  promptTemplate: 'You are helpful.',
  modelId: 'claude-sonnet-4-6',
  toolAllowlist: ['search'],
  temperature: 0.7,
  maxTokens: 500,
  systemGuardrails: 'no PII',
};

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('variants/mutator/jitter', () => {
  it('stays within temperature bounds [0,2]', () => {
    for (let i = 0; i < 50; i++) {
      const j = jitterGenome({ ...BASE, temperature: 1.95 }, { temperatureDelta: 0.5 });
      expect(j.temperature).toBeGreaterThanOrEqual(0);
      expect(j.temperature).toBeLessThanOrEqual(2);
    }
  });

  it('produces integer maxTokens >= 1', () => {
    const j = jitterGenome(BASE, { maxTokensDelta: 200, seed: seq([0, 1, 0.5]) });
    expect(Number.isInteger(j.maxTokens)).toBe(true);
    expect(j.maxTokens).toBeGreaterThanOrEqual(1);
  });

  it('leaves prompt and modelId unchanged', () => {
    const j = jitterGenome(BASE);
    expect(j.promptTemplate).toBe(BASE.promptTemplate);
    expect(j.modelId).toBe(BASE.modelId);
    expect(j.toolAllowlist).toEqual(BASE.toolAllowlist);
  });
});

describe('variants/mutator/crossover', () => {
  it('averages numeric params', () => {
    const a: AgentGenome = { ...BASE, temperature: 0.2, maxTokens: 200 };
    const b: AgentGenome = { ...BASE, temperature: 0.8, maxTokens: 800 };
    const c = crossoverGenomes(a, b, { seed: () => 0 });
    expect(c.temperature).toBeCloseTo(0.5, 6);
    expect(c.maxTokens).toBe(500);
  });

  it('picks discrete fields from parent a when seed<0.5', () => {
    const a: AgentGenome = { ...BASE, promptTemplate: 'A', modelId: 'model-a' };
    const b: AgentGenome = { ...BASE, promptTemplate: 'B', modelId: 'model-b' };
    const c = crossoverGenomes(a, b, { seed: () => 0 });
    expect(c.promptTemplate).toBe('A');
    expect(c.modelId).toBe('model-a');
  });

  it('picks discrete fields from parent b when seed>=0.5', () => {
    const a: AgentGenome = { ...BASE, promptTemplate: 'A' };
    const b: AgentGenome = { ...BASE, promptTemplate: 'B' };
    const c = crossoverGenomes(a, b, { seed: () => 0.9 });
    expect(c.promptTemplate).toBe('B');
  });
});
