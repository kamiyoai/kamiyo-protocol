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

  it('stores controls, commands, canary snapshots, and richer service detail', async () => {
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

    const pauseCommand = await fetch(`${baseUrl}/api/internal/agent-learning/commands`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        service: 'kamiyo-autopilot',
        taskType: 'autopilot_issue_resolution',
        kind: 'pause_auto',
        requestedBy: 'mizuki',
        note: 'operator hold',
      }),
    });
    expect(pauseCommand.status).toBe(202);
    const pendingCommand = (await pauseCommand.json()) as { id: string; status: string };
    expect(pendingCommand.status).toBe('pending');

    const controlsRes = await fetch(
      `${baseUrl}/api/internal/agent-learning/controls?service=kamiyo-autopilot&taskType=autopilot_issue_resolution`,
      { headers: { authorization: 'Bearer test-token' } }
    );
    expect(controlsRes.status).toBe(200);
    const control = (await controlsRes.json()) as { mode: string; updatedBy: string | null };
    expect(control.mode).toBe('paused');
    expect(control.updatedBy).toBe('mizuki');

    const pendingCommandsRes = await fetch(
      `${baseUrl}/api/internal/agent-learning/commands?service=kamiyo-autopilot&taskType=autopilot_issue_resolution&status=pending`,
      { headers: { authorization: 'Bearer test-token' } }
    );
    expect(pendingCommandsRes.status).toBe(200);
    const pendingCommands = (await pendingCommandsRes.json()) as {
      commands: Array<{ id: string }>;
    };
    expect(pendingCommands.commands[0]?.id).toBe(pendingCommand.id);

    const ackPause = await fetch(
      `${baseUrl}/api/internal/agent-learning/commands/${pendingCommand.id}/ack`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          status: 'applied',
          result: { mode: 'paused' },
        }),
      }
    );
    expect(ackPause.status).toBe(202);

    const failedRollback = await fetch(`${baseUrl}/api/internal/agent-learning/commands`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        service: 'kamiyo-autopilot',
        taskType: 'autopilot_issue_resolution',
        kind: 'rollback_active_canary',
        requestedBy: 'mizuki',
      }),
    });
    expect(failedRollback.status).toBe(202);
    const failedCommand = (await failedRollback.json()) as { id: string };

    const failedAck = await fetch(
      `${baseUrl}/api/internal/agent-learning/commands/${failedCommand.id}/ack`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          status: 'failed',
          result: { error: 'no active canary' },
        }),
      }
    );
    expect(failedAck.status).toBe(202);

    const snapshot = await fetch(`${baseUrl}/api/internal/agent-learning/canary-snapshots`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        service: 'kamiyo-autopilot',
        taskType: 'autopilot_issue_resolution',
        rolloutId: 'rollout-1',
        status: 'active',
        canaryVariantId: 'variant-a',
        baselineVariantId: 'variant-b',
        trafficPct: 0.25,
        decisionKind: 'hold',
        decisionReason: 'need 5 canary samples (have 2)',
        canarySamples: 2,
        baselineSamples: 6,
        alerts: [
          {
            code: 'active_canary_stalled',
            level: 'warning',
            message: 'Active canary is stalled waiting for more samples.',
            detectedAt: '2026-04-22T09:00:00.000Z',
          },
        ],
      }),
    });
    expect(snapshot.status).toBe(202);

    const promotion = await fetch(`${baseUrl}/api/internal/agent-learning/promotions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        service: 'kamiyo-autopilot',
        taskType: 'autopilot_issue_resolution',
        variantId: 'variant-a',
        priorVariantId: 'variant-b',
        eventKind: 'canary_started',
        payload: { trafficPct: 0.25 },
      }),
    });
    expect(promotion.status).toBe(202);

    const controlLoopStarted = await fetch(
      `${baseUrl}/api/internal/agent-learning/control-loop-runs`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: 'loop-1',
          service: 'kamiyo-autopilot',
          taskType: 'autopilot_issue_resolution',
          trigger: 'workflow_dispatch',
          status: 'started',
          startedAt: 1_777_100_700,
          result: { dbPath: '/runner/.kamiyo-agent-state/kamiyo-autopilot/agent.db' },
        }),
      }
    );
    expect(controlLoopStarted.status).toBe(202);

    const controlLoopSucceeded = await fetch(
      `${baseUrl}/api/internal/agent-learning/control-loop-runs`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: 'loop-1',
          service: 'kamiyo-autopilot',
          taskType: 'autopilot_issue_resolution',
          trigger: 'workflow_dispatch',
          status: 'succeeded',
          processed: 1,
          finalized: 1,
          requeued: 0,
          skipped: 0,
          commandsApplied: 1,
          commandsFailed: 1,
          startedAt: 1_777_100_700,
          completedAt: 1_777_100_760,
          result: {
            blockedAutoReason: 'operator_command_failed',
            dbPath: '/runner/.kamiyo-agent-state/kamiyo-autopilot/agent.db',
          },
        }),
      }
    );
    expect(controlLoopSucceeded.status).toBe(202);

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
      controlState: { mode: string } | null;
      activeCanarySnapshot: { status: string; canaryVariantId: string | null } | null;
      alerts: Array<{ code: string }>;
      recentCommands: Array<{ status: string; kind: string }>;
      recentRuns: Array<{ runId: string; delayedOutcome: string | null; reconcileStatus: string }>;
      recentEvents: Array<{ eventKind: string }>;
      topVariants: Array<{ variantId: string; avgDelayedScore: number | null }>;
      controlLoop: {
        lastRun: { id: string; status: string; commandsFailed: number } | null;
        lastSuccessAt: string | null;
        blockedAutoReason: string | null;
      };
    };
    expect(detail.controlState?.mode).toBe('paused');
    expect(detail.activeCanarySnapshot?.status).toBe('active');
    expect(detail.activeCanarySnapshot?.canaryVariantId).toBe('variant-a');
    expect(detail.alerts.some(alert => alert.code === 'active_canary_stalled')).toBe(true);
    expect(detail.alerts.some(alert => alert.code === 'failed_operator_command')).toBe(true);
    expect(detail.alerts.some(alert => alert.code === 'auto_promotion_blocked')).toBe(true);
    expect(detail.controlLoop.lastRun?.id).toBe('loop-1');
    expect(detail.controlLoop.lastRun?.status).toBe('succeeded');
    expect(detail.controlLoop.lastRun?.commandsFailed).toBe(1);
    expect(detail.controlLoop.lastSuccessAt).toBe('2026-04-25T07:06:00.000Z');
    expect(detail.controlLoop.blockedAutoReason).toBe('operator_command_failed');
    expect(
      detail.recentCommands.some(
        command => command.status === 'failed' && command.kind === 'rollback_active_canary'
      )
    ).toBe(true);
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

  it('reports dispatch as unavailable when GitHub workflow dispatch is not configured', async () => {
    const { baseUrl, close } = await startServer();
    const res = await fetch(`${baseUrl}/api/internal/agent-learning/control-loop-dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({ service: 'kamiyo-autopilot' }),
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { dispatched: boolean; error: string };
    expect(body.dispatched).toBe(false);
    expect(body.error).toMatch(/not configured/);
    await close();
  });
});
