import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { applySchema } from '../schema';
import { initSelfImprove, resetContextForTests } from '../context';
import { createVariant, evaluateAndPromote, recordScore, recordTournamentEntry } from '../service';
import { createTournament } from '../tournament';
import type { AgentGenome } from '../genome';

function freshDb() {
  const db = new Database(':memory:');
  applySchema(db);
  initSelfImprove({ db, judgeLLM: null });
  return db;
}

const BASE_GENOME: AgentGenome = {
  promptTemplate: 'test prompt',
  modelId: 'test-model',
  toolAllowlist: [],
  temperature: 0.5,
  maxTokens: 100,
  systemGuardrails: '',
};

afterEach(() => resetContextForTests());

describe('createVariant', () => {
  it('returns { variant, created: true } for new variant', () => {
    freshDb();
    const result = createVariant({
      agentId: 'bot',
      taskType: 'test',
      genome: BASE_GENOME,
    });
    expect(result.created).toBe(true);
    expect(result.variant.agentId).toBe('bot');
    expect(result.variant.status).toBe('active');
  });

  it('returns { variant, created: false } for duplicate genome', () => {
    freshDb();
    const first = createVariant({ agentId: 'bot', taskType: 'test', genome: BASE_GENOME });
    const second = createVariant({ agentId: 'bot', taskType: 'test', genome: BASE_GENOME });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.variant.id).toBe(first.variant.id);
  });

  it('different prompts create different variants', () => {
    freshDb();
    const a = createVariant({
      agentId: 'bot',
      taskType: 'test',
      genome: { ...BASE_GENOME, promptTemplate: 'prompt A' },
    });
    const b = createVariant({
      agentId: 'bot',
      taskType: 'test',
      genome: { ...BASE_GENOME, promptTemplate: 'prompt B' },
    });
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.variant.id).not.toBe(b.variant.id);
  });
});

describe('recordScore', () => {
  it('records score for existing variant', () => {
    freshDb();
    const { variant } = createVariant({ agentId: 'bot', taskType: 'test', genome: BASE_GENOME });
    const result = recordScore({ variantId: variant.id, qualityScore: 0.8 });
    expect(result.ok).toBe(true);
  });

  it('returns error for missing variant', () => {
    freshDb();
    const result = recordScore({ variantId: 'nonexistent', qualityScore: 0.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('variant not found');
  });

  it('records optional cost and latency', () => {
    freshDb();
    const { variant } = createVariant({ agentId: 'bot', taskType: 'test', genome: BASE_GENOME });
    const result = recordScore({
      variantId: variant.id,
      qualityScore: 0.9,
      cost: 0.001,
      latencyMs: 250,
    });
    expect(result.ok).toBe(true);
  });
});

describe('evaluateAndPromote', () => {
  function seedVariantsWithScores(
    taskType: string,
    variants: Array<{ prompt: string; scores: number[] }>
  ) {
    const created = variants.map(
      v =>
        createVariant({
          agentId: 'bot',
          taskType,
          genome: { ...BASE_GENOME, promptTemplate: v.prompt },
        }).variant
    );

    const tournament = createTournament({ taskType, maxParticipants: 10, budgetCap: 100 });
    for (let i = 0; i < created.length; i++) {
      for (const score of variants[i].scores) {
        recordTournamentEntry({
          tournamentId: tournament.id,
          variantId: created[i].id,
          qualityScore: score,
          cost: 0.001,
          latencyMs: 100,
        });
      }
    }
    return created;
  }

  it('returns insufficient samples message when no candidate has enough', () => {
    freshDb();
    seedVariantsWithScores('test', [
      { prompt: 'v1', scores: [0.3, 0.4] },
      { prompt: 'v2', scores: [0.5, 0.6] },
    ]);

    const result = evaluateAndPromote('test', { minSamples: 10 });
    expect(result.promoted).toBe(false);
    if (!result.promoted) {
      expect(result.reason).toContain('minSamples');
    }
  });

  it('returns significance message when samples exist but no winner', () => {
    const db = freshDb();
    const scores = Array.from({ length: 50 }, () => 0.5 + (Math.random() - 0.5) * 0.01);
    seedVariantsWithScores(db, 'test', [
      { prompt: 'v1', scores },
      { prompt: 'v2', scores: scores.map(s => s - 0.001) },
    ]);

    const result = evaluateAndPromote('test', { minSamples: 10 });
    expect(result.promoted).toBe(false);
    if (!result.promoted) {
      expect(result.reason).toContain('baseline');
    }
  });

  it('promotes a clearly better variant', () => {
    const db = freshDb();
    const low = Array.from({ length: 60 }, () => 0.3 + Math.random() * 0.05);
    const high = Array.from({ length: 60 }, () => 0.8 + Math.random() * 0.05);
    seedVariantsWithScores(db, 'test', [
      { prompt: 'weak', scores: low },
      { prompt: 'strong', scores: high },
    ]);

    const result = evaluateAndPromote('test', { minSamples: 10 });
    expect(result.promoted).toBe(true);
  });

  it('needs ≥2 active variants', () => {
    freshDb();
    createVariant({ agentId: 'bot', taskType: 'test', genome: BASE_GENOME });
    const result = evaluateAndPromote('test');
    expect(result.promoted).toBe(false);
    if (!result.promoted) expect(result.reason).toContain('≥2');
  });
});
