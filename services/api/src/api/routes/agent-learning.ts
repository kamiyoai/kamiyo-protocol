import { Router, type Request, type Response } from 'express';
import {
  getAgentLearningServiceDetail,
  getAgentLearningSummary,
  listAgentLearningRuns,
  recordAgentLearningPromotion,
  upsertAgentLearningRun,
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
      summary:
        body?.summary && typeof body.summary === 'object' && !Array.isArray(body.summary)
          ? (body.summary as Record<string, unknown>)
          : {},
      createdAt: typeof body?.createdAt === 'number' ? body.createdAt : null,
      updatedAt: typeof body?.updatedAt === 'number' ? body.updatedAt : null,
    });
    res.status(202).json({ ok: true });
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
      payload:
        body?.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
          ? (body.payload as Record<string, unknown>)
          : {},
      createdAt: typeof body?.createdAt === 'number' ? body.createdAt : null,
    });
    res.status(202).json({ ok: true });
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
