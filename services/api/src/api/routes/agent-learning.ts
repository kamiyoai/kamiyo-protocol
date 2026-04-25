import { Router, type Request, type Response } from 'express';
import {
  acknowledgeAgentLearningCommand,
  createAgentLearningCommand,
  getAgentLearningControlState,
  getAgentLearningServiceDetail,
  getAgentLearningSummary,
  listAgentLearningCommands,
  listAgentLearningRuns,
  recordAgentLearningPromotion,
  upsertAgentLearningCanarySnapshot,
  upsertAgentLearningControl,
  upsertAgentLearningControlLoopRun,
  upsertAgentLearningRun,
  type AgentLearningCanarySnapshotInput,
  type AgentLearningCommandInput,
  type AgentLearningControlInput,
  type AgentLearningControlLoopRunInput,
  type AgentLearningPromotionInput,
  type AgentLearningRunInput,
} from '../../agent-learning';

const router = Router();

const INTERNAL_TOKEN =
  process.env.AGENT_LEARNING_API_TOKEN?.trim() ||
  process.env.AGENT_PERF_INTERNAL_TOKEN?.trim() ||
  process.env.COMPANION_INTERNAL_TOKEN?.trim() ||
  '';

function requireInternalToken(req: Request, res: Response, next: () => void): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing authorization header' });
    return;
  }
  const token = header.slice(7).trim();
  if (!INTERNAL_TOKEN || token !== INTERNAL_TOKEN) {
    res.status(401).json({ error: 'invalid authorization token' });
    return;
  }
  next();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

router.post(
  '/internal/agent-learning/runs',
  requireInternalToken,
  (req: Request, res: Response) => {
    const body = req.body as Partial<AgentLearningRunInput> | undefined;
    const service = typeof body?.service === 'string' ? body.service.trim() : '';
    const runId = typeof body?.runId === 'string' ? body.runId.trim() : '';
    const taskType = typeof body?.taskType === 'string' ? body.taskType.trim() : '';
    const reconcileStatus =
      typeof body?.reconcileStatus === 'string' ? body.reconcileStatus.trim() : '';

    if (
      !service ||
      !runId ||
      !taskType ||
      !['not_required', 'pending', 'finalized'].includes(reconcileStatus)
    ) {
      res.status(400).json({ error: 'service, runId, taskType, reconcileStatus required' });
      return;
    }

    upsertAgentLearningRun({
      service,
      runId,
      taskType,
      subjectType: typeof body?.subjectType === 'string' ? body.subjectType : null,
      subjectId: typeof body?.subjectId === 'string' ? body.subjectId : null,
      variantId: typeof body?.variantId === 'string' ? body.variantId : null,
      variantStrategy: typeof body?.variantStrategy === 'string' ? body.variantStrategy : null,
      immediateOutcome: typeof body?.immediateOutcome === 'string' ? body.immediateOutcome : null,
      immediateQualityScore:
        typeof body?.immediateQualityScore === 'number' ? body.immediateQualityScore : null,
      delayedOutcome: typeof body?.delayedOutcome === 'string' ? body.delayedOutcome : null,
      delayedQualityScore:
        typeof body?.delayedQualityScore === 'number' ? body.delayedQualityScore : null,
      reconcileStatus: reconcileStatus as AgentLearningRunInput['reconcileStatus'],
      summary: isRecord(body?.summary) ? body.summary : {},
      createdAt: typeof body?.createdAt === 'number' ? body.createdAt : null,
      updatedAt: typeof body?.updatedAt === 'number' ? body.updatedAt : null,
    });
    res.status(202).json({ ok: true });
  }
);

router.post(
  '/internal/agent-learning/control-loop-runs',
  requireInternalToken,
  (req: Request, res: Response) => {
    const body = req.body as Partial<AgentLearningControlLoopRunInput> | undefined;
    const service = typeof body?.service === 'string' ? body.service.trim() : '';
    const taskType = typeof body?.taskType === 'string' ? body.taskType.trim() : '';
    const trigger = typeof body?.trigger === 'string' ? body.trigger.trim() : '';
    const status = typeof body?.status === 'string' ? body.status.trim() : '';

    if (!service || !taskType || !trigger || !['started', 'succeeded', 'failed'].includes(status)) {
      res.status(400).json({ error: 'service, taskType, trigger, status required' });
      return;
    }

    const run = upsertAgentLearningControlLoopRun({
      id: typeof body?.id === 'string' ? body.id : null,
      service,
      taskType,
      trigger,
      status: status as AgentLearningControlLoopRunInput['status'],
      processed: optionalNumber(body?.processed),
      finalized: optionalNumber(body?.finalized),
      requeued: optionalNumber(body?.requeued),
      skipped: optionalNumber(body?.skipped),
      commandsApplied: optionalNumber(body?.commandsApplied),
      commandsFailed: optionalNumber(body?.commandsFailed),
      startedAt: optionalNumber(body?.startedAt),
      completedAt: optionalNumber(body?.completedAt),
      result: isRecord(body?.result) ? body.result : {},
    });
    res.status(202).json(run);
  }
);

router.post(
  '/internal/agent-learning/promotions',
  requireInternalToken,
  (req: Request, res: Response) => {
    const body = req.body as Partial<AgentLearningPromotionInput> | undefined;
    const service = typeof body?.service === 'string' ? body.service.trim() : '';
    const taskType = typeof body?.taskType === 'string' ? body.taskType.trim() : '';
    const variantId = typeof body?.variantId === 'string' ? body.variantId.trim() : '';
    const eventKind = typeof body?.eventKind === 'string' ? body.eventKind.trim() : '';

    if (!service || !taskType || !variantId || !eventKind) {
      res.status(400).json({ error: 'service, taskType, variantId, eventKind required' });
      return;
    }

    recordAgentLearningPromotion({
      service,
      taskType,
      variantId,
      priorVariantId: typeof body?.priorVariantId === 'string' ? body.priorVariantId : null,
      eventKind,
      payload: isRecord(body?.payload) ? body.payload : {},
      createdAt: typeof body?.createdAt === 'number' ? body.createdAt : null,
    });
    res.status(202).json({ ok: true });
  }
);

router.get(
  '/internal/agent-learning/controls',
  requireInternalToken,
  (req: Request, res: Response) => {
    const service = typeof req.query.service === 'string' ? req.query.service.trim() : '';
    const taskType = typeof req.query.taskType === 'string' ? req.query.taskType.trim() : '';
    if (!service || !taskType) {
      res.status(400).json({ error: 'service and taskType required' });
      return;
    }
    res.json(getAgentLearningControlState(service, taskType));
  }
);

router.post(
  '/internal/agent-learning/controls',
  requireInternalToken,
  (req: Request, res: Response) => {
    const body = req.body as Partial<AgentLearningControlInput> | undefined;
    const service = typeof body?.service === 'string' ? body.service.trim() : '';
    const taskType = typeof body?.taskType === 'string' ? body.taskType.trim() : '';
    const mode = typeof body?.mode === 'string' ? body.mode.trim() : '';
    if (!service || !taskType || (mode !== 'auto' && mode !== 'paused')) {
      res.status(400).json({ error: 'service, taskType, mode required' });
      return;
    }

    const control = upsertAgentLearningControl({
      service,
      taskType,
      mode,
      updatedBy: typeof body?.updatedBy === 'string' ? body.updatedBy : null,
      note: typeof body?.note === 'string' ? body.note : null,
      updatedAt: typeof body?.updatedAt === 'number' ? body.updatedAt : null,
    });
    res.status(202).json(control);
  }
);

router.get(
  '/internal/agent-learning/commands',
  requireInternalToken,
  (req: Request, res: Response) => {
    const service = typeof req.query.service === 'string' ? req.query.service.trim() : undefined;
    const taskType = typeof req.query.taskType === 'string' ? req.query.taskType.trim() : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
    const limit = Number(req.query.limit);

    if (status && !['pending', 'applied', 'failed', 'expired'].includes(status)) {
      res.status(400).json({ error: 'invalid status' });
      return;
    }

    res.json({
      commands: listAgentLearningCommands({
        service,
        taskType,
        status: status as 'pending' | 'applied' | 'failed' | 'expired' | undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
      }),
    });
  }
);

router.post(
  '/internal/agent-learning/commands',
  requireInternalToken,
  (req: Request, res: Response) => {
    const body = req.body as Partial<AgentLearningCommandInput> | undefined;
    const service = typeof body?.service === 'string' ? body.service.trim() : '';
    const taskType = typeof body?.taskType === 'string' ? body.taskType.trim() : '';
    const kind = typeof body?.kind === 'string' ? body.kind.trim() : '';
    if (
      !service ||
      !taskType ||
      !['pause_auto', 'resume_auto', 'rollback_active_canary'].includes(kind)
    ) {
      res.status(400).json({ error: 'service, taskType, kind required' });
      return;
    }

    const command = createAgentLearningCommand({
      service,
      taskType,
      kind: kind as AgentLearningCommandInput['kind'],
      requestedBy: typeof body?.requestedBy === 'string' ? body.requestedBy : null,
      note: typeof body?.note === 'string' ? body.note : null,
      createdAt: typeof body?.createdAt === 'number' ? body.createdAt : null,
    });
    res.status(202).json(command);
  }
);

router.post(
  '/internal/agent-learning/commands/:id/ack',
  requireInternalToken,
  (req: Request, res: Response) => {
    const id = req.params.id?.trim();
    const body = req.body as
      | { status?: unknown; result?: unknown; processedAt?: unknown }
      | undefined;
    const status = typeof body?.status === 'string' ? body.status.trim() : '';

    if (!id || !['applied', 'failed', 'expired'].includes(status)) {
      res.status(400).json({ error: 'valid id and status required' });
      return;
    }

    const command = acknowledgeAgentLearningCommand(id, {
      status: status as 'applied' | 'failed' | 'expired',
      result: isRecord(body?.result) ? body.result : {},
      processedAt: typeof body?.processedAt === 'number' ? body.processedAt : null,
    });

    if (!command) {
      res.status(404).json({ error: 'command not found' });
      return;
    }

    res.status(202).json(command);
  }
);

router.post(
  '/internal/agent-learning/canary-snapshots',
  requireInternalToken,
  (req: Request, res: Response) => {
    const body = req.body as Partial<AgentLearningCanarySnapshotInput> | undefined;
    const service = typeof body?.service === 'string' ? body.service.trim() : '';
    const taskType = typeof body?.taskType === 'string' ? body.taskType.trim() : '';
    const status = typeof body?.status === 'string' ? body.status.trim() : '';
    if (
      !service ||
      !taskType ||
      !['inactive', 'active', 'promoted', 'rolled_back'].includes(status)
    ) {
      res.status(400).json({ error: 'service, taskType, status required' });
      return;
    }

    const snapshot = upsertAgentLearningCanarySnapshot({
      service,
      taskType,
      rolloutId: typeof body?.rolloutId === 'string' ? body.rolloutId : null,
      status: status as AgentLearningCanarySnapshotInput['status'],
      canaryVariantId: typeof body?.canaryVariantId === 'string' ? body.canaryVariantId : null,
      baselineVariantId:
        typeof body?.baselineVariantId === 'string' ? body.baselineVariantId : null,
      trafficPct: typeof body?.trafficPct === 'number' ? body.trafficPct : null,
      decisionKind: typeof body?.decisionKind === 'string' ? body.decisionKind : null,
      decisionReason: typeof body?.decisionReason === 'string' ? body.decisionReason : null,
      canarySamples: typeof body?.canarySamples === 'number' ? body.canarySamples : null,
      baselineSamples: typeof body?.baselineSamples === 'number' ? body.baselineSamples : null,
      uplift: typeof body?.uplift === 'number' ? body.uplift : null,
      pValue: typeof body?.pValue === 'number' ? body.pValue : null,
      alerts: Array.isArray(body?.alerts)
        ? body.alerts.filter(isRecord).map(alert => ({
            code: typeof alert.code === 'string' ? alert.code : '',
            level:
              alert.level === 'info' || alert.level === 'warning' || alert.level === 'error'
                ? alert.level
                : 'warning',
            message: typeof alert.message === 'string' ? alert.message : '',
            detectedAt:
              typeof alert.detectedAt === 'string' ? alert.detectedAt : new Date().toISOString(),
          }))
        : [],
      updatedAt: typeof body?.updatedAt === 'number' ? body.updatedAt : null,
    });
    res.status(202).json(snapshot);
  }
);

router.post(
  '/internal/agent-learning/control-loop-dispatch',
  requireInternalToken,
  async (req: Request, res: Response) => {
    const body = req.body as { service?: unknown; ref?: unknown } | undefined;
    const service = typeof body?.service === 'string' ? body.service.trim() : 'all';
    const ref = typeof body?.ref === 'string' && body.ref.trim() ? body.ref.trim() : 'main';
    const allowedServices = [
      'all',
      'kamiyo-autopilot',
      'kamiyo-docs-agent',
      'kamiyo-marketing-agent',
    ];

    if (!allowedServices.includes(service)) {
      res.status(400).json({ error: 'valid service required' });
      return;
    }

    const repo = process.env.KIZUNA_LEARNING_GITHUB_REPO?.trim();
    const workflow =
      process.env.KIZUNA_LEARNING_GITHUB_WORKFLOW?.trim() || 'agent-learning-control-loop.yml';
    const token = process.env.KIZUNA_LEARNING_GITHUB_DISPATCH_TOKEN?.trim();
    const workflowUrl = repo
      ? `https://github.com/${repo}/actions/workflows/${encodeURIComponent(workflow)}`
      : null;

    if (!repo || !token) {
      res.status(503).json({
        dispatched: false,
        error: 'GitHub workflow dispatch is not configured',
        workflowUrl,
      });
      return;
    }

    const response = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          ref,
          inputs: { service },
        }),
      }
    );

    if (!response.ok) {
      res.status(response.status).json({
        dispatched: false,
        error: `GitHub dispatch failed with ${response.status}`,
        workflowUrl,
      });
      return;
    }

    res.status(202).json({ dispatched: true, service, workflowUrl });
  }
);

router.get('/agent-learning/summary', (_req: Request, res: Response) => {
  res.json(getAgentLearningSummary());
});

router.get(
  '/agent-learning/services/:service',
  requireInternalToken,
  (req: Request, res: Response) => {
    const service = req.params.service?.trim();
    if (!service) {
      res.status(400).json({ error: 'service required' });
      return;
    }
    res.json(getAgentLearningServiceDetail(service));
  }
);

router.get('/agent-learning/runs', requireInternalToken, (req: Request, res: Response) => {
  const service = typeof req.query.service === 'string' ? req.query.service.trim() : undefined;
  const limit = Number(req.query.limit);
  res.json({
    runs: listAgentLearningRuns({
      service,
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
  });
});

export default router;
