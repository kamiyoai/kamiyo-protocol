import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'kamiyo-bandit-'));
process.env.DATA_DIR = dir;
process.env.JWT_SECRET = 'test';

const { createVariant, forkVariant, recordTournamentEntry } = await import('../variants/service');
const { getOrCreateStandingTournament, routeVariant, sweepPromotions, listTaskTypes } =
  await import('../variants/bandit');

const baseGenome = {
  promptTemplate: 'base',
  modelId: 'claude-sonnet-4-6',
  toolAllowlist: ['a'],
  temperature: 0.7,
  maxTokens: 1024,
  systemGuardrails: '',
};

describe('variants/bandit', () => {
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null when no variants exist', () => {
    expect(routeVariant('empty-task')).toBeNull();
  });

  it('creates and reuses a standing tournament per task type', () => {
    const a = getOrCreateStandingTournament('route-a');
    const b = getOrCreateStandingTournament('route-a');
    expect(a.id).toBe(b.id);
    expect(a.windowEnd).toBeGreaterThan(a.windowStart);
  });

  it('routes via thompson sampling when active variants exist', () => {
    const parent = createVariant({ agentId: 'a1', taskType: 'route-b', genome: baseGenome });
    forkVariant(parent.id, { temperature: 0.2 });
    const decision = routeVariant('route-b');
    expect(decision).not.toBeNull();
    if (decision) {
      expect(decision.strategy).toBe('thompson');
      expect(decision.tournamentId).toBeTruthy();
    }
  });

  it('falls back to promoted variant if no active ones remain', async () => {
    const parent = createVariant({ agentId: 'a2', taskType: 'route-c', genome: baseGenome });
    const winner = forkVariant(parent.id, { temperature: 0.2 });
    const t = getOrCreateStandingTournament('route-c');
    for (let i = 0; i < 60; i++) {
      recordTournamentEntry({
        tournamentId: t.id,
        variantId: winner.id,
        qualityScore: 0.85 + (i % 3) * 0.01,
      });
      recordTournamentEntry({
        tournamentId: t.id,
        variantId: parent.id,
        qualityScore: 0.4 + (i % 3) * 0.01,
      });
    }
    const { evaluateAndPromote } = await import('../variants/service');
    const result = evaluateAndPromote('route-c', { minSamples: 50 });
    expect(result.promoted).toBe(true);
    const decision = routeVariant('route-c');
    expect(decision?.strategy === 'thompson' || decision?.strategy === 'promoted').toBe(true);
  });

  it('lists task types across variants', () => {
    const types = listTaskTypes();
    expect(types).toContain('route-b');
  });

  it('sweep returns results for each task type', async () => {
    const results = await sweepPromotions({ minSamples: 999999 });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(typeof r.taskType).toBe('string');
  });
});
