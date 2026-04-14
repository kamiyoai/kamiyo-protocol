import { describe, expect, it } from 'vitest';
import { canonicalizeGenome, hashGenome, mutateGenome, validateGenome } from '../variants/genome';

const base = {
  promptTemplate: 'You are a helpful agent.',
  modelId: 'claude-sonnet-4-6',
  toolAllowlist: ['web_search', 'bash'],
  temperature: 0.7,
  maxTokens: 2048,
  systemGuardrails: 'no pii',
};

describe('variants/genome', () => {
  it('validates and fills defaults', () => {
    const g = validateGenome(base);
    expect(g.modelId).toBe('claude-sonnet-4-6');
    expect(g.toolAllowlist).toEqual(['web_search', 'bash']);
  });

  it('rejects missing prompt', () => {
    expect(() => validateGenome({ ...base, promptTemplate: '' })).toThrow();
  });

  it('canonicalizes with sorted tools and stable keys', () => {
    const a = canonicalizeGenome(validateGenome(base));
    const b = canonicalizeGenome(
      validateGenome({ ...base, toolAllowlist: ['bash', 'web_search'] })
    );
    expect(a).toBe(b);
  });

  it('hashes identically for equivalent genomes', () => {
    expect(hashGenome(validateGenome(base))).toBe(
      hashGenome(validateGenome({ ...base, toolAllowlist: ['bash', 'web_search'] }))
    );
  });

  it('clamps temperature and truncates maxTokens', () => {
    const g = validateGenome({ ...base, temperature: 5, maxTokens: 99999.9 });
    expect(g.temperature).toBe(2);
    expect(g.maxTokens).toBe(32768);
  });

  it('mutateGenome applies patch', () => {
    const parent = validateGenome(base);
    const child = mutateGenome(parent, { temperature: 0.2 });
    expect(child.temperature).toBe(0.2);
    expect(child.promptTemplate).toBe(parent.promptTemplate);
  });
});
