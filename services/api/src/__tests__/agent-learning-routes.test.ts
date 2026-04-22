import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import express from 'express';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'kamiyo-agent-learning-routes-'));
process.env.DATA_DIR = dir;
process.env.JWT_SECRET = 'test';
process.env.AGENT_PERF_INTERNAL_TOKEN = 'test-token';

const { default: router } = await import('../api/routes/agent-learning');

const app = express();
app.use(express.json());
app.use('/api', router);

function startServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise(resolve => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('bind failed');
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise(r => server.close(() => r(undefined))),
      });
    });
  });
}

describe('agent-learning routes', () => {
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('rejects internal writes without a bearer token', async () => {
    const { baseUrl, close } = await startServer();
    const res = await fetch(`${baseUrl}/api/internal/agent-learning/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        service: 'kamiyo-autopilot',
        runId: 'run-1',
        taskType: 'autopilot_issue_resolution',
        reconcileStatus: 'pending',
        summary: {},
      }),
    });
    expect(res.status).toBe(401);
    await close();
  });

  it('upserts mirrored runs and exposes summary + detail read models', async () => {
    const { baseUrl, close } = await startServer();
    const headers = { 'content-type': 'application/json', authorization: 'Bearer test-token' };

    const runBody = {
      service: 'kamiyo-autopilot',
      runId: 'run-42',
      taskType: 'autopilot_issue_resolution',
      subjectType: 'issue',
      subjectId: '42',
      variantId: 'variant-a',
      variantStrategy: 'canary',
      immediateOutcome: 'opened_pr',
      immediateQualityScore: 0.72,
      delayedOutcome: null,
      delayedQualityScore: null,
      reconcileStatus: 'pending',
      summary: { initialOutcome: 'opened_pr', reconciliationNote: 'pr_still_open' },
      createdAt: 1_777_100_000,
      updatedAt: 1_777_100_000,
    };

    const first = await fetch(`${baseUrl}/api/internal/agent-learning/runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(runBody),
    });
    expect(first.status).toBe(202);

    const second = await fetch(`${baseUrl}/api/internal/agent-learning/runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...runBody,
        delayedOutcome: 'merged_pr',
        delayedQualityScore: 0.91,
        reconcileStatus: 'finalized',
        summary: {
          ...runBody.summary,
          delayedOutcome: 'merged_pr',
        },
        updatedAt: 1_777_100_600,
      }),
    });
    expect(second.status).toBe(202);

    const promotion = await fetch(`${baseUrl}/api/internal/agent-learning/promotions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        service: 'kamiyo-autopilot',
        taskType: 'autopilot_issue_resolution',
        variantId: 'variant-a',
        priorVariantId: 'variant-b',
        eventKind: 'canary_started',
        payload: { trafficPct: 0.1 },
      }),
    });
    expect(promotion.status).toBe(202);

    const summaryRes = await fetch(`${baseUrl}/api/agent-learning/summary`);
    expect(summaryRes.status).toBe(200);
    const summary = (await summaryRes.json()) as {
      services: Array<{
        service: string;
        immediateAvgScore7d: number | null;
        delayedAvgScore7d: number | null;
        pendingReconciliations: number;
        finalizedDelayedSamples: number;
        activeCanary: { variantId: string } | null;
      }>;
    };
    expect(summary.services).toHaveLength(1);
    expect(summary.services[0]?.service).toBe('kamiyo-autopilot');
    expect(summary.services[0]?.immediateAvgScore7d).toBe(0.72);
    expect(summary.services[0]?.delayedAvgScore7d).toBe(0.91);
    expect(summary.services[0]?.pendingReconciliations).toBe(0);
    expect(summary.services[0]?.finalizedDelayedSamples).toBe(1);
    expect(summary.services[0]?.activeCanary?.variantId).toBe('variant-a');

    const detailRes = await fetch(`${baseUrl}/api/agent-learning/services/kamiyo-autopilot`, {
      headers: { authorization: 'Bearer test-token' },
    });
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as {
      recentRuns: Array<{ runId: string; delayedOutcome: string | null; reconcileStatus: string }>;
      recentEvents: Array<{ eventKind: string }>;
      topVariants: Array<{ variantId: string; avgDelayedScore: number | null }>;
    };
    expect(detail.recentRuns[0]?.runId).toBe('run-42');
    expect(detail.recentRuns[0]?.delayedOutcome).toBe('merged_pr');
    expect(detail.recentRuns[0]?.reconcileStatus).toBe('finalized');
    expect(detail.recentEvents[0]?.eventKind).toBe('canary_started');
    expect(detail.topVariants[0]?.variantId).toBe('variant-a');

    const runsRes = await fetch(`${baseUrl}/api/agent-learning/runs?service=kamiyo-autopilot`, {
      headers: { authorization: 'Bearer test-token' },
    });
    expect(runsRes.status).toBe(200);
    const runs = (await runsRes.json()) as { runs: Array<{ runId: string }> };
    expect(runs.runs[0]?.runId).toBe('run-42');

    await close();
  });
});
