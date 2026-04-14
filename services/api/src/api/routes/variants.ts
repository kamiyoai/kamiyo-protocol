import { Router, Request, Response } from 'express';
import {
  createVariant,
  evaluateAndPromote,
  forkVariant,
  getLeaderboard,
  getVariant,
  listActiveVariants,
} from '../../variants/service';
import {
  createTournament,
  getTournament,
  markTournamentStatus,
  recordParticipantResult,
  totalTournamentCost,
} from '../../variants/tournament';
import { getRubric, recordJudgedEntry, upsertRubric } from '../../variants/judge';

const router = Router();

const INTERNAL_TOKEN =
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

router.get('/variants/leaderboard/:taskType', (req: Request, res: Response) => {
  const taskType = req.params.taskType?.trim();
  if (!taskType) {
    res.status(400).json({ error: 'taskType required' });
    return;
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  res.json({ taskType, entries: getLeaderboard(taskType, limit) });
});

router.get('/variants/:id', (req: Request, res: Response) => {
  const variant = getVariant(req.params.id);
  if (!variant) {
    res.status(404).json({ error: 'variant not found' });
    return;
  }
  res.json(variant);
});

router.get('/variants/active/:taskType', (req: Request, res: Response) => {
  const taskType = req.params.taskType?.trim();
  if (!taskType) {
    res.status(400).json({ error: 'taskType required' });
    return;
  }
  const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : undefined;
  res.json({ taskType, variants: listActiveVariants(taskType, agentId) });
});

router.post('/variants', requireInternalToken, (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const variant = createVariant({
      agentId: String(body.agentId ?? '').trim(),
      taskType: String(body.taskType ?? '').trim(),
      genome: body.genome,
      parentId: body.parentId ?? null,
      notes: body.notes ?? null,
    });
    res.status(201).json(variant);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'invalid request' });
  }
});

router.post('/variants/:id/fork', requireInternalToken, (req: Request, res: Response) => {
  try {
    const patch = (req.body?.patch ?? {}) as Record<string, unknown>;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
    const variant = forkVariant(req.params.id, patch, notes);
    res.status(201).json(variant);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'fork failed' });
  }
});

router.post('/variants/tournaments', requireInternalToken, (req: Request, res: Response) => {
  const body = req.body ?? {};
  const taskType = typeof body.taskType === 'string' ? body.taskType.trim() : '';
  if (!taskType) {
    res.status(400).json({ error: 'taskType required' });
    return;
  }
  const tournament = createTournament({
    taskType,
    maxParticipants: Number(body.maxParticipants) || 4,
    budgetCap: Number(body.budgetCap) || 0,
    policy: typeof body.policy === 'object' && body.policy !== null ? body.policy : undefined,
    receiptId: body.receiptId ?? null,
  });
  res.status(201).json(tournament);
});

router.post(
  '/variants/tournaments/:id/status',
  requireInternalToken,
  (req: Request, res: Response) => {
    const status = req.body?.status;
    if (!['pending', 'running', 'completed', 'failed'].includes(status)) {
      res.status(400).json({ error: 'invalid status' });
      return;
    }
    const result = markTournamentStatus(req.params.id, status, req.body?.winnerVariantId ?? null);
    if (!result.ok) {
      const code = result.error === 'tournament not found' ? 404 : 409;
      res.status(code).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  }
);

router.post(
  '/variants/tournaments/:id/entries',
  requireInternalToken,
  (req: Request, res: Response) => {
    const body = req.body ?? {};
    const variantId = typeof body.variantId === 'string' ? body.variantId : '';
    if (!variantId) {
      res.status(400).json({ error: 'variantId required' });
      return;
    }
    const result = recordParticipantResult({
      tournamentId: req.params.id,
      variantId,
      performanceEventId: body.performanceEventId ?? null,
      qualityScore: typeof body.qualityScore === 'number' ? body.qualityScore : null,
      cost: typeof body.cost === 'number' ? body.cost : null,
      latencyMs: typeof body.latencyMs === 'number' ? body.latencyMs : null,
      outcome: typeof body.outcome === 'string' ? body.outcome : null,
    });
    if (!result.ok) {
      const code =
        result.error === 'tournament not found' || result.error === 'variant not found' ? 404 : 409;
      res.status(code).json({ error: result.error });
      return;
    }
    res.json({ ok: true, totalCost: result.totalCost });
  }
);

router.get('/variants/tournaments/:id', (req: Request, res: Response) => {
  const tournament = getTournament(req.params.id);
  if (!tournament) {
    res.status(404).json({ error: 'tournament not found' });
    return;
  }
  res.json({ ...tournament, totalCost: totalTournamentCost(req.params.id) });
});

router.post('/variants/promote/:taskType', requireInternalToken, (req: Request, res: Response) => {
  const taskType = req.params.taskType?.trim();
  if (!taskType) {
    res.status(400).json({ error: 'taskType required' });
    return;
  }
  const body = req.body ?? {};
  const result = evaluateAndPromote(taskType, {
    minSamples: typeof body.minSamples === 'number' ? body.minSamples : undefined,
    pThreshold: typeof body.pThreshold === 'number' ? body.pThreshold : undefined,
    receiptId: body.receiptId ?? null,
  });
  res.json(result);
});

router.get('/variants/rubrics/:taskType', (req: Request, res: Response) => {
  const rubric = getRubric(req.params.taskType);
  if (!rubric) {
    res.status(404).json({ error: 'rubric not found' });
    return;
  }
  res.json(rubric);
});

router.put('/variants/rubrics/:taskType', requireInternalToken, (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const rubric = upsertRubric({
      taskType: req.params.taskType,
      rubric: String(body.rubric ?? ''),
      weights:
        typeof body.weights === 'object' && body.weights !== null
          ? (body.weights as Record<string, number>)
          : null,
      modelId: typeof body.modelId === 'string' ? body.modelId : undefined,
      dailyBudgetUsd: typeof body.dailyBudgetUsd === 'number' ? body.dailyBudgetUsd : undefined,
    });
    res.json(rubric);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'invalid rubric' });
  }
});

router.post(
  '/variants/tournaments/:id/judged-entries',
  requireInternalToken,
  async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const variantId = typeof body.variantId === 'string' ? body.variantId : '';
    const input = typeof body.input === 'string' ? body.input : '';
    const output = typeof body.output === 'string' ? body.output : '';
    if (!variantId || !input || !output) {
      res.status(400).json({ error: 'variantId, input, output required' });
      return;
    }
    const result = await recordJudgedEntry({
      tournamentId: req.params.id,
      variantId,
      input,
      output,
      performanceEventId: body.performanceEventId ?? null,
      latencyMs: typeof body.latencyMs === 'number' ? body.latencyMs : null,
      outcome: typeof body.outcome === 'string' ? body.outcome : null,
      costOverride: typeof body.cost === 'number' ? body.cost : null,
    });
    if (!result.ok) {
      const code =
        result.error === 'variant not found' || result.error === 'tournament not found'
          ? 404
          : result.error === 'daily budget exhausted'
            ? 429
            : 409;
      res.status(code).json({ error: result.error });
      return;
    }
    res.json(result);
  }
);

export default router;
