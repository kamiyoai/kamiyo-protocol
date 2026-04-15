import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'kamiyo-variants-'));
process.env.DATA_DIR = dir;
process.env.JWT_SECRET = 'test';

const { createVariant, forkVariant, evaluateAndPromote, listActiveVariants } =
  await import('../variants/service');
const { createTournament, recordParticipantResult } = await import('../variants/tournament');

const baseGenome = {
  promptTemplate: 'base prompt',
  modelId: 'claude-sonnet-4-6',
  toolAllowlist: ['a'],
  temperature: 0.7,
  maxTokens: 1024,
  systemGuardrails: '',
};

describe('variants/service', () => {
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('creates a variant and is idempotent on same genome', () => {
    const v1 = createVariant({
      agentId: 'agent-a',
      taskType: 'summarize',
      genome: baseGenome,
    });
    const v2 = createVariant({
      agentId: 'agent-a',
      taskType: 'summarize',
      genome: baseGenome,
    });
    expect(v1.id).toBe(v2.id);
    expect(v1.status).toBe('active');
  });

  it('forks a variant with mutation', () => {
    const parent = createVariant({
      agentId: 'agent-b',
      taskType: 'classify',
      genome: baseGenome,
    });
    const child = forkVariant(parent.id, { temperature: 0.1 }, 'cooler');
    expect(child.parentId).toBe(parent.id);
    expect(child.genome.temperature).toBe(0.1);
  });

  it('lists active variants sorted by rep', () => {
    const list = listActiveVariants('summarize');
    expect(list.length).toBeGreaterThan(0);
  });

  it('promotes a variant when uplift is significant', () => {
    const parent = createVariant({
      agentId: 'agent-c',
      taskType: 'extract',
      genome: baseGenome,
    });
    const winner = forkVariant(parent.id, { temperature: 0.2 });

    const tournament = createTournament({
      taskType: 'extract',
      maxParticipants: 2,
      budgetCap: 1,
    });

    for (let i = 0; i < 60; i++) {
      recordParticipantResult({
        tournamentId: tournament.id,
        variantId: winner.id,
        qualityScore: 0.85 + (i % 3) * 0.01,
        cost: 0.001,
      });
      recordParticipantResult({
        tournamentId: tournament.id,
        variantId: parent.id,
        qualityScore: 0.45 + (i % 3) * 0.01,
        cost: 0.001,
      });
    }

    const result = evaluateAndPromote('extract', { minSamples: 50 });
    expect(result.promoted).toBe(true);
    if (result.promoted) {
      expect(result.variantId).toBe(winner.id);
      expect(result.pValue).toBeLessThan(0.05);
    }
  });

  it('refuses to promote when samples insufficient', () => {
    createVariant({ agentId: 'agent-d', taskType: 'rank', genome: baseGenome });
    const child = forkVariant(
      createVariant({ agentId: 'agent-d', taskType: 'rank', genome: baseGenome }).id,
      { temperature: 0.3 }
    );
    const t = createTournament({ taskType: 'rank', maxParticipants: 2, budgetCap: 1 });
    for (let i = 0; i < 10; i++) {
      recordParticipantResult({ tournamentId: t.id, variantId: child.id, qualityScore: 0.9 });
    }
    const result = evaluateAndPromote('rank', { minSamples: 50 });
    expect(result.promoted).toBe(false);
  });
});
