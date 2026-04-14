import { Router, Request, Response } from 'express';
import { applyQualityScoreToEvent, getAgentLeaderboard, getAgentPerformance } from '../../agent-performance';

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

router.get('/agents/:id/performance', (req: Request, res: Response) => {
  const agentId = req.params.id?.trim();
  if (!agentId) {
    res.status(400).json({ error: 'agent id required' });
    return;
  }
  const limit = Number(req.query.limit);
  const summary = getAgentPerformance(agentId, Number.isFinite(limit) ? limit : 50);
  res.json(summary);
});

router.get('/agents/leaderboard/:taskType', (req: Request, res: Response) => {
  const taskType = req.params.taskType?.trim();
  if (!taskType) {
    res.status(400).json({ error: 'taskType required' });
    return;
  }
  const minSamples = Number(req.query.minSamples);
  const limit = Number(req.query.limit);
  const rows = getAgentLeaderboard(
    taskType,
    Number.isFinite(minSamples) ? minSamples : 5,
    Number.isFinite(limit) ? limit : 50
  );
  res.json({ taskType, rows });
});

router.post('/internal/score-swarm-node', requireInternalToken, (req: Request, res: Response) => {
  const runId = typeof req.body?.runId === 'string' ? req.body.runId.trim() : '';
  const nodeId = typeof req.body?.nodeId === 'string' ? req.body.nodeId.trim() : '';
  const qualityScore = Number(req.body?.qualityScore);
  const gradedBy = typeof req.body?.gradedBy === 'string' ? req.body.gradedBy.trim() : '';
  const rationale = typeof req.body?.qualityRationale === 'string' ? req.body.qualityRationale : undefined;

  if (!runId || !nodeId || !gradedBy || !Number.isFinite(qualityScore)) {
    res.status(400).json({ error: 'runId, nodeId, qualityScore, gradedBy required' });
    return;
  }

  const updated = applyQualityScoreToEvent({ runId, nodeId, qualityScore, qualityRationale: rationale, gradedBy });
  if (!updated) {
    res.status(404).json({ error: 'performance event not found for run/node' });
    return;
  }

  res.json(updated);
});

export default router;
