import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applySchema,
  createVariant,
  initSelfImprove,
  resetContextForTests,
  startCanary,
} from '@kamiyo-org/selfimprove';
import {
  acknowledgeAgentLearningCommand,
  applyDelayedLearningCommands,
  assessAgentLearningDbPath,
  decideDelayedLearningAutoAdvance,
  deriveAgentLearningAlerts,
  deriveAgentLearningControlLoopAlerts,
  fetchAgentLearningControlState,
  fetchPendingAgentLearningCommands,
  publishAgentLearningCanarySnapshot,
  publishAgentLearningControlLoopRun,
  snapshotDelayedLearningCanary,
} from '../index';

function freshDb() {
  const db = new Database(':memory:');
  applySchema(db);
  initSelfImprove({ db, judgeLLM: null });
  return db;
}

afterEach(() => {
  resetContextForTests();
  delete process.env.AGENT_LEARNING_API_URL;
  delete process.env.AGENT_LEARNING_API_TOKEN;
  delete process.env.AGENT_LEARNING_ALLOW_WORKSPACE_DB;
  vi.unstubAllGlobals();
});

describe('learning control plane helpers', () => {
  it('fetches control state and pending commands from the mirrored API', async () => {
    process.env.AGENT_LEARNING_API_URL = 'https://api.kamiyo.ai';
    process.env.AGENT_LEARNING_API_TOKEN = 'test-token';

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/api/internal/agent-learning/');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-token' });

      if (String(input).includes('/controls?')) {
        return new Response(
          JSON.stringify({
            service: 'kamiyo-autopilot',
            taskType: 'autopilot_issue_resolution',
            mode: 'paused',
            updatedBy: 'mizuki',
            note: 'operator hold',
            updatedAt: '2026-04-22T10:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          commands: [
            {
              id: 'cmd-1',
              service: 'kamiyo-autopilot',
              taskType: 'autopilot_issue_resolution',
              kind: 'pause_auto',
              status: 'pending',
              requestedBy: 'mizuki',
              note: 'hold',
              createdAt: '2026-04-22T10:00:00.000Z',
              processedAt: null,
              result: {},
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const control = await fetchAgentLearningControlState({
      service: 'kamiyo-autopilot',
      taskType: 'autopilot_issue_resolution',
    });
    const commands = await fetchPendingAgentLearningCommands({
      service: 'kamiyo-autopilot',
      taskType: 'autopilot_issue_resolution',
    });

    expect(control?.mode).toBe('paused');
    expect(commands[0]?.kind).toBe('pause_auto');
  });

  it('acknowledges commands and publishes canary snapshots', async () => {
    process.env.AGENT_LEARNING_API_URL = 'https://api.kamiyo.ai';
    process.env.AGENT_LEARNING_API_TOKEN = 'test-token';

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      return new Response('{}', { status: 202, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const acked = await acknowledgeAgentLearningCommand({
      id: 'cmd-1',
      status: 'applied',
      result: { mode: 'paused' },
    });
    const published = await publishAgentLearningCanarySnapshot({
      service: 'kamiyo-autopilot',
      taskType: 'autopilot_issue_resolution',
      rolloutId: 'rollout-1',
      status: 'active',
      canaryVariantId: 'variant-a',
      baselineVariantId: 'variant-b',
      trafficPct: 0.2,
      decisionKind: 'hold',
      decisionReason: 'need 5 canary samples (have 2)',
      canarySamples: 2,
      baselineSamples: 6,
      uplift: null,
      pValue: null,
      alerts: [],
      updatedAt: 1_777_200_000,
    });

    expect(acked).toBe(true);
    expect(published).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('publishes control-loop run snapshots', async () => {
    process.env.AGENT_LEARNING_API_URL = 'https://api.kamiyo.ai';
    process.env.AGENT_LEARNING_API_TOKEN = 'test-token';

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        'https://api.kamiyo.ai/api/internal/agent-learning/control-loop-runs'
      );
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      expect(body.status).toBe('succeeded');
      expect(body.commandsFailed).toBe(1);
      return new Response('{}', { status: 202, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const published = await publishAgentLearningControlLoopRun({
      id: 'loop-1',
      service: 'kamiyo-autopilot',
      taskType: 'autopilot_issue_resolution',
      trigger: 'workflow_dispatch',
      status: 'succeeded',
      processed: 1,
      finalized: 1,
      requeued: 0,
      skipped: 0,
      commandsApplied: 0,
      commandsFailed: 1,
      startedAt: 1_777_200_000,
      completedAt: 1_777_200_060,
      result: { blockedAutoReason: 'operator_command_failed' },
    });

    expect(published).toBe(true);
  });

  it('derives backlog and stalled canary alerts', () => {
    const alerts = deriveAgentLearningAlerts({
      pendingReconciliations: 6,
      canarySnapshot: {
        status: 'active',
        decisionKind: 'hold',
        decisionReason: 'need 5 canary samples (have 2)',
        canarySamples: 2,
        baselineSamples: 6,
      },
      now: new Date('2026-04-22T10:00:00.000Z'),
    });

    expect(alerts.map(alert => alert.code)).toContain('pending_reconciliation_backlog');
    expect(alerts.map(alert => alert.code)).toContain('active_canary_stalled');
  });

  it('detects unsafe GitHub Actions DB paths and blocks delayed auto advancement', () => {
    const safety = assessAgentLearningDbPath({
      dbPath: '.autopilot/agent.db',
      cwd: '/runner/work/kamiyo-protocol/services/kamiyo-autopilot',
      githubWorkspace: '/runner/work/kamiyo-protocol',
      githubActions: true,
    });
    const safe = assessAgentLearningDbPath({
      dbPath: '/runner/work/.kamiyo-agent-state/kamiyo-autopilot/agent.db',
      cwd: '/runner/work/kamiyo-protocol/services/kamiyo-autopilot',
      githubWorkspace: '/runner/work/kamiyo-protocol',
      githubActions: true,
    });
    const decision = decideDelayedLearningAutoAdvance({
      controlState: { mode: 'auto' },
      unsafeStateReason: safety.reason,
    });

    expect(safety.unsafe).toBe(true);
    expect(safety.reason).toMatch(/agent_db_inside_github_workspace/);
    expect(safe.unsafe).toBe(false);
    expect(decision.shouldAdvance).toBe(false);
    expect(decision.blockedReason).toBe(safety.reason);
    expect(
      decideDelayedLearningAutoAdvance({
        controlState: { mode: 'auto' },
        commandsFailed: 1,
      }).blockedReason
    ).toBe('operator_command_failed');
    expect(
      decideDelayedLearningAutoAdvance({
        controlState: { mode: 'auto' },
        rollbackApplied: true,
      }).blockedReason
    ).toBe('rollback_command_applied');
  });

  it('derives stale control-loop alerts', () => {
    const alerts = deriveAgentLearningControlLoopAlerts({
      lastSuccessAt: '2026-04-22T10:00:00.000Z',
      expectedIntervalMinutes: 30,
      pendingCommandAgeSeconds: 2_400,
      now: new Date('2026-04-22T12:00:00.000Z'),
    });

    expect(alerts.map(alert => alert.code)).toContain('stale_control_loop');
    expect(alerts.map(alert => alert.code)).toContain('pending_operator_command');
  });

  it('rolls back an active canary through delayed learning commands and snapshots the decision', () => {
    freshDb();

    const baseline = createVariant({
      agentId: 'agent-a',
      taskType: 'autopilot_issue_resolution',
      genome: {
        promptTemplate: 'baseline',
        modelId: 'local-model',
        toolAllowlist: [],
        temperature: 0.2,
        maxTokens: 512,
        systemGuardrails: '',
      },
      notes: 'baseline',
    }).variant;
    const canary = createVariant({
      agentId: 'agent-a',
      taskType: 'autopilot_issue_resolution',
      genome: {
        promptTemplate: 'canary',
        modelId: 'local-model',
        toolAllowlist: [],
        temperature: 0.3,
        maxTokens: 512,
        systemGuardrails: '',
      },
      notes: 'canary',
    }).variant;

    startCanary({
      taskType: 'autopilot_issue_resolution',
      canaryVariantId: canary.id,
      baselineVariantId: baseline.id,
      trafficPct: 0.1,
      minSamples: 10,
    });

    const results = applyDelayedLearningCommands({
      taskType: 'autopilot_issue_resolution',
      commands: [{ id: 'cmd-rollback', kind: 'rollback_active_canary', note: 'manual rollback' }],
    });
    const snapshot = snapshotDelayedLearningCanary({
      service: 'kamiyo-autopilot',
      taskType: 'autopilot_issue_resolution',
    });

    expect(results[0]?.status).toBe('applied');
    expect(results[0]?.event?.eventKind).toBe('canary_rolled_back');
    expect(snapshot.status).toBe('inactive');
  });
});
