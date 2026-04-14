import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'kamiyo-judge-'));
process.env.DATA_DIR = dir;
process.env.JWT_SECRET = 'test';

const { upsertRubric, getRubric, scoreOutput, recordJudgedEntry } =
  await import('../variants/judge');
const { createVariant } = await import('../variants/service');
const { createTournament } = await import('../variants/tournament');

const baseGenome = {
  promptTemplate: 'base',
  modelId: 'claude-sonnet-4-6',
  toolAllowlist: ['a'],
  temperature: 0.7,
  maxTokens: 1024,
  systemGuardrails: '',
};

function fakeClient(responseText: string, usage = { input_tokens: 100, output_tokens: 50 }) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: responseText }],
        usage,
      }),
    },
  } as unknown as Parameters<typeof scoreOutput>[0]['client'];
}

describe('variants/judge', () => {
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('upserts and reads rubric', () => {
    const r = upsertRubric({
      taskType: 'summarize',
      rubric: 'Be accurate, concise, neutral.',
      weights: { accuracy: 0.6, concision: 0.4 },
      dailyBudgetUsd: 1,
    });
    expect(r.taskType).toBe('summarize');
    expect(getRubric('summarize')?.rubric).toContain('accurate');
  });

  it('returns error when no rubric exists', async () => {
    const result = await scoreOutput({
      taskType: 'nonexistent',
      input: 'x',
      output: 'y',
    });
    expect(result.ok).toBe(false);
  });

  it('scores output and caches result', async () => {
    upsertRubric({ taskType: 'classify', rubric: 'Correctness matters.', dailyBudgetUsd: 1 });
    const client = fakeClient('{"score": 0.85, "rationale": "ok"}');
    const first = await scoreOutput({
      taskType: 'classify',
      input: 'a',
      output: 'b',
      client,
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.score).toBe(0.85);
      expect(first.cacheHit).toBe(false);
    }
    const second = await scoreOutput({
      taskType: 'classify',
      input: 'a',
      output: 'b',
      client,
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.cacheHit).toBe(true);
  });

  it('rejects unparseable judge output', async () => {
    upsertRubric({ taskType: 'parse-fail', rubric: 'r', dailyBudgetUsd: 1 });
    const client = fakeClient('not json at all');
    const result = await scoreOutput({
      taskType: 'parse-fail',
      input: 'x',
      output: 'y',
      client,
    });
    expect(result.ok).toBe(false);
  });

  it('clamps scores into [0,1]', async () => {
    upsertRubric({ taskType: 'clamp', rubric: 'r', dailyBudgetUsd: 1 });
    const client = fakeClient('{"score": 1.7, "rationale": "hot"}');
    const result = await scoreOutput({
      taskType: 'clamp',
      input: 'a',
      output: 'b',
      client,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.score).toBe(1);
  });

  it('enforces daily budget', async () => {
    upsertRubric({ taskType: 'budget', rubric: 'r', dailyBudgetUsd: 0.0000001 });
    const client = fakeClient('{"score": 0.5, "rationale": "ok"}', {
      input_tokens: 100000,
      output_tokens: 100000,
    });
    const first = await scoreOutput({
      taskType: 'budget',
      input: 'x1',
      output: 'y1',
      client,
    });
    expect(first.ok).toBe(true);
    const second = await scoreOutput({
      taskType: 'budget',
      input: 'x2',
      output: 'y2',
      client,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/budget/);
  });

  it('records judged entry end-to-end', async () => {
    upsertRubric({ taskType: 'e2e', rubric: 'r', dailyBudgetUsd: 10 });
    const variant = createVariant({ agentId: 'a', taskType: 'e2e', genome: baseGenome });
    const tournament = createTournament({
      taskType: 'e2e',
      maxParticipants: 2,
      budgetCap: 10,
    });
    const client = fakeClient('{"score": 0.7, "rationale": "good"}');
    const result = await recordJudgedEntry({
      tournamentId: tournament.id,
      variantId: variant.id,
      input: 'prompt',
      output: 'response',
      client,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.score).toBe(0.7);
  });
});
