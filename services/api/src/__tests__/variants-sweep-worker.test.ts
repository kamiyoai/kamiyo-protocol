import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'kamiyo-sweep-'));
process.env.DATA_DIR = dir;
process.env.JWT_SECRET = 'test';

const { startVariantSweepWorker, stopVariantSweepWorker, runVariantSweepNow } =
  await import('../variants/sweep-worker');
const { createVariant, forkVariant } = await import('../variants/service');

const baseGenome = {
  promptTemplate: 'base',
  modelId: 'claude-sonnet-4-6',
  toolAllowlist: ['a'],
  temperature: 0.7,
  maxTokens: 1024,
  systemGuardrails: '',
};

describe('variants/sweep-worker', () => {
  afterAll(() => {
    stopVariantSweepWorker();
    rmSync(dir, { recursive: true, force: true });
  });

  it('is a no-op when VARIANT_SWEEP_ENABLED is not true', () => {
    const prev = process.env.VARIANT_SWEEP_ENABLED;
    process.env.VARIANT_SWEEP_ENABLED = 'false';
    startVariantSweepWorker();
    stopVariantSweepWorker();
    process.env.VARIANT_SWEEP_ENABLED = prev;
  });

  it('runVariantSweepNow iterates known task types without throwing', async () => {
    const parent = createVariant({ agentId: 'sw1', taskType: 'sweep-task', genome: baseGenome });
    forkVariant(parent.id, { temperature: 0.3 });
    await expect(runVariantSweepNow()).resolves.toBeUndefined();
  });

  it('start is idempotent and unrefs', () => {
    process.env.VARIANT_SWEEP_ENABLED = 'true';
    process.env.VARIANT_SWEEP_INTERVAL_MS = '60000';
    startVariantSweepWorker();
    startVariantSweepWorker();
    stopVariantSweepWorker();
    stopVariantSweepWorker();
  });
});
