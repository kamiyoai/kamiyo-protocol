import multer from 'multer';
import { Request, Response, Router } from 'express';
import {
  addEvidence,
  createProject,
  createUpload,
  enqueueProjectJob,
  getJob,
  getProjectDetail,
  getPublicationBySlug,
  listProjectEvents,
  listProjects,
} from './service';
import {
  assertAddEvidenceQuota,
  assertCreateProjectQuota,
  assertEnqueueJobQuota,
  assertUploadQuota,
  getRealityForkQuotaState,
  RealityForkQuotaError,
  realityForkInternalSeedEnabled,
  verifyRealityForkInternalSeedToken,
} from './quotas';
import { getRealityForkProjectOps, getRealityForkUsageOps } from './ops';
import type {
  CreateRealityForkEvidenceInput,
  RealityForkEvidenceKind,
  RealityForkJobKind,
  RealityForkSourceType,
} from './types';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5,
    fileSize: 20 * 1024 * 1024,
  },
});

const burstBuckets = new Map<string, number[]>();

class RealityForkRouteGuardError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
    readonly details: Record<string, unknown>
  ) {
    super(message);
  }
}

type RouteGuardConfig = {
  burstWindowMs: number;
  uploadBurstLimit: number;
  projectBurstLimit: number;
  evidenceBurstLimit: number;
  jobBurstLimit: number;
  jobFailureBreakerThreshold: number;
  jobFailureBreakerWindowMs: number;
  jobFailureBreakerCooldownMs: number;
  internalSeedBurstLimit: number;
  internalSeedEvidenceLimit: number;
  internalSeedTextCharLimit: number;
  internalSeedByteLimit: number;
};

function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRouteGuardConfig(env: NodeJS.ProcessEnv = process.env): RouteGuardConfig {
  return {
    burstWindowMs: parseIntEnv(env.REALITY_FORK_GUARD_BURST_WINDOW_MS, 60_000),
    uploadBurstLimit: parseIntEnv(env.REALITY_FORK_GUARD_UPLOAD_BURST_LIMIT, 6),
    projectBurstLimit: parseIntEnv(env.REALITY_FORK_GUARD_PROJECT_BURST_LIMIT, 4),
    evidenceBurstLimit: parseIntEnv(env.REALITY_FORK_GUARD_EVIDENCE_BURST_LIMIT, 12),
    jobBurstLimit: parseIntEnv(env.REALITY_FORK_GUARD_JOB_BURST_LIMIT, 4),
    jobFailureBreakerThreshold: parseIntEnv(
      env.REALITY_FORK_JOB_FAILURE_BREAKER_THRESHOLD,
      2
    ),
    jobFailureBreakerWindowMs: parseIntEnv(
      env.REALITY_FORK_JOB_FAILURE_BREAKER_WINDOW_MS,
      15 * 60 * 1000
    ),
    jobFailureBreakerCooldownMs: parseIntEnv(
      env.REALITY_FORK_JOB_FAILURE_BREAKER_COOLDOWN_MS,
      10 * 60 * 1000
    ),
    internalSeedBurstLimit: parseIntEnv(env.REALITY_FORK_INTERNAL_SEED_BURST_LIMIT, 8),
    internalSeedEvidenceLimit: parseIntEnv(env.REALITY_FORK_INTERNAL_SEED_EVIDENCE_LIMIT, 16),
    internalSeedTextCharLimit: parseIntEnv(
      env.REALITY_FORK_INTERNAL_SEED_TEXT_CHAR_LIMIT,
      120_000
    ),
    internalSeedByteLimit: parseIntEnv(env.REALITY_FORK_INTERNAL_SEED_BYTE_LIMIT, 8 * 1024 * 1024),
  };
}

function parseString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}

function parseStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(entry => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean);
}

const EVIDENCE_KINDS: readonly RealityForkEvidenceKind[] = [
  'upload',
  'document',
  'source',
  'pasted_text',
  'note',
  'dataset',
];

const SOURCE_TYPES: readonly RealityForkSourceType[] = [
  'pdf',
  'docx',
  'text',
  'markdown',
  'html',
  'url',
  'x_thread',
  'reddit_thread',
  'polymarket_market',
];

function parseEvidenceKind(value: unknown): RealityForkEvidenceKind | undefined {
  return typeof value === 'string' && EVIDENCE_KINDS.includes(value as RealityForkEvidenceKind)
    ? (value as RealityForkEvidenceKind)
    : undefined;
}

function parseSourceType(value: unknown): RealityForkSourceType | undefined {
  return typeof value === 'string' && SOURCE_TYPES.includes(value as RealityForkSourceType)
    ? (value as RealityForkSourceType)
    : undefined;
}

function clientIp(req: Request): string | null {
  return req.ip || null;
}

function buildProjectEnvelope(projectId: string, clientKey: string | null) {
  const project = getProjectDetail(projectId);
  const ops = getRealityForkProjectOps(projectId, clientKey);
  if (!project || !ops) return null;

  return {
    ...project,
    quotaState: ops.quotas.state,
    warningFlags: ops.warnings.warningFlags,
    opsSummary: {
      stageTimings: ops.telemetry.stageTimings,
      storage: ops.storage,
      cost: ops.cost,
      quotaUsage: ops.quotas.usage,
      quotaWarnings: ops.warnings.quota,
    },
  };
}

function quotaStateForContext(clientKey: string | null, projectId?: string): ReturnType<
  typeof getRealityForkQuotaState
> {
  return getRealityForkQuotaState({ clientIp: clientKey, projectId });
}

function respondForRouteError(
  res: Response,
  error: unknown,
  fallback: string,
  context: { clientIp?: string | null; projectId?: string } = {}
): void {
  if (error instanceof RealityForkQuotaError) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      details: error.details,
      quotaState: quotaStateForContext(context.clientIp ?? null, context.projectId),
    });
    return;
  }

  if (error instanceof RealityForkRouteGuardError) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      details: error.details,
      quotaState: quotaStateForContext(context.clientIp ?? null, context.projectId),
    });
    return;
  }

  const message = error instanceof Error ? error.message : fallback;
  const status = /not found/i.test(message)
    ? 404
    : /required|invalid/i.test(message)
      ? 400
      : /limit reached|already running|accepts at most/i.test(message)
        ? 429
        : /payload exceeds|exceeds the 20 mb/i.test(message)
          ? 413
          : 500;
  res.status(status).json({
    error: message,
    quotaState: quotaStateForContext(context.clientIp ?? null, context.projectId),
  });
}

function assertBurstLimit(params: {
  bucketKey: string;
  limit: number;
  windowMs: number;
  message: string;
  code: string;
  details: Record<string, unknown>;
}): void {
  const now = Date.now();
  const existing = burstBuckets.get(params.bucketKey) ?? [];
  const active = existing.filter(timestamp => now - timestamp < params.windowMs);
  if (active.length >= params.limit) {
    throw new RealityForkRouteGuardError(params.message, 429, params.code, {
      ...params.details,
      windowMs: params.windowMs,
      limit: params.limit,
      retryAfterMs: Math.max(0, params.windowMs - (now - active[0])),
    });
  }
  active.push(now);
  burstBuckets.set(params.bucketKey, active);
}

function assertProjectCircuitClosed(
  projectId: string,
  kind: RealityForkJobKind,
  config = getRouteGuardConfig(),
  nowMs = Date.now()
): void {
  if (kind !== 'full') return;
  const project = getProjectDetail(projectId);
  if (!project) return;

  const failures = project.jobs
    .filter(job => job.kind === 'full' && job.status === 'failed')
    .sort((left, right) => right.createdAt - left.createdAt);
  const recentFailures = failures.filter(job => nowMs - job.createdAt < config.jobFailureBreakerWindowMs);
  if (recentFailures.length < config.jobFailureBreakerThreshold) return;

  const lastFailureAt =
    recentFailures[0]?.completedAt ?? recentFailures[0]?.updatedAt ?? recentFailures[0]?.createdAt;
  if (nowMs - lastFailureAt >= config.jobFailureBreakerCooldownMs) return;

  const latestSuccess = project.jobs
    .filter(job => job.kind === 'full' && job.status === 'completed')
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  if (latestSuccess && latestSuccess.createdAt > lastFailureAt) return;

  throw new RealityForkRouteGuardError(
    'Project retries are temporarily blocked after repeated failed full runs.',
    429,
    'REALITY_FORK_CIRCUIT_OPEN',
    {
      kind,
      projectId,
      failures: recentFailures.length,
      threshold: config.jobFailureBreakerThreshold,
      cooldownMs: config.jobFailureBreakerCooldownMs,
      lastFailureAt,
    }
  );
}

function parseInternalSeedEvidence(
  value: unknown,
  config = getRouteGuardConfig()
): CreateRealityForkEvidenceInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new RealityForkRouteGuardError(
      'At least one seed evidence item is required.',
      400,
      'REALITY_FORK_INVALID_INTERNAL_SEED',
      { field: 'evidence' }
    );
  }
  if (value.length > config.internalSeedEvidenceLimit) {
    throw new RealityForkRouteGuardError(
      'Seed batch exceeds the internal evidence limit.',
      413,
      'REALITY_FORK_INTERNAL_SEED_TOO_LARGE',
      { limit: config.internalSeedEvidenceLimit, usage: value.length }
    );
  }

  let totalTextChars = 0;
  let totalBytes = 0;
  const evidence = value.map((entry, index) => {
    const candidate = (entry ?? {}) as Record<string, unknown>;
    const title = parseString(candidate.title);
    if (!title) {
      throw new RealityForkRouteGuardError(
        'Every seed evidence item requires a title.',
        400,
        'REALITY_FORK_INVALID_INTERNAL_SEED',
        { field: `evidence.${index}.title` }
      );
    }

    const text = parseString(candidate.text);
    const contentBase64 = parseString(candidate.contentBase64);
    const uploadId = parseString(candidate.uploadId);
    const sourceUrl = parseString(candidate.sourceUrl);
    if (!text && !contentBase64 && !uploadId && !sourceUrl) {
      throw new RealityForkRouteGuardError(
        'Seed evidence requires text, contentBase64, uploadId, or sourceUrl.',
        400,
        'REALITY_FORK_INVALID_INTERNAL_SEED',
        { field: `evidence.${index}` }
      );
    }

    totalTextChars += text?.length ?? 0;
    totalBytes += text ? Buffer.byteLength(text, 'utf8') : 0;
    totalBytes += contentBase64 ? Buffer.byteLength(contentBase64, 'base64') : 0;

    return {
      title,
      kind: parseEvidenceKind(candidate.kind),
      sourceType: parseSourceType(candidate.sourceType),
      sourceLabel:
        parseString(candidate.sourceLabel) ??
        parseString(candidate.reason) ??
        'launch-team-seed',
      sourceUrl,
      mimeType: parseString(candidate.mimeType),
      text,
      contentBase64,
      fileName: parseString(candidate.fileName),
      uploadId,
      metadata:
        typeof candidate.metadata === 'object' && candidate.metadata !== null
          ? { ...(candidate.metadata as Record<string, unknown>) }
          : {},
    } satisfies CreateRealityForkEvidenceInput;
  });

  if (totalTextChars > config.internalSeedTextCharLimit) {
    throw new RealityForkRouteGuardError(
      'Seed batch text volume exceeds the internal character limit.',
      413,
      'REALITY_FORK_INTERNAL_SEED_TOO_LARGE',
      { limit: config.internalSeedTextCharLimit, usage: totalTextChars, metric: 'text_chars' }
    );
  }
  if (totalBytes > config.internalSeedByteLimit) {
    throw new RealityForkRouteGuardError(
      'Seed batch byte volume exceeds the internal storage limit.',
      413,
      'REALITY_FORK_INTERNAL_SEED_TOO_LARGE',
      { limit: config.internalSeedByteLimit, usage: totalBytes, metric: 'bytes' }
    );
  }

  return evidence;
}

function queueProjectJob(
  projectId: string,
  kind: RealityForkJobKind,
  req: Request,
  options: { skipQuota?: boolean } = {}
) {
  const clientKey = clientIp(req);
  const config = getRouteGuardConfig();
  assertBurstLimit({
    bucketKey: `job:${clientKey ?? 'anon'}:${projectId}:${kind}`,
    limit: config.jobBurstLimit,
    windowMs: config.burstWindowMs,
    message: 'Too many runtime job requests are queued in a short window.',
    code: 'REALITY_FORK_RATE_LIMITED',
    details: { scope: 'job', kind, projectId },
  });
  if (!options.skipQuota) {
    assertEnqueueJobQuota(projectId, kind);
  }
  assertProjectCircuitClosed(projectId, kind, config);
  return enqueueProjectJob(projectId, kind);
}

router.get('/', (req: Request, res: Response) => {
  res.json({
    projects: listProjects(),
    quotaState: quotaStateForContext(clientIp(req)),
  });
});

router.get('/ops/usage', (req: Request, res: Response) => {
  res.json(getRealityForkUsageOps(clientIp(req)));
});

router.post('/uploads', upload.array('files', 5), (req: Request, res: Response) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      res.status(400).json({ error: 'at least one file is required' });
      return;
    }

    const clientKey = clientIp(req);
    const config = getRouteGuardConfig();
    assertBurstLimit({
      bucketKey: `upload:${clientKey ?? 'anon'}`,
      limit: config.uploadBurstLimit,
      windowMs: config.burstWindowMs,
      message: 'Upload rate limit exceeded for the current window.',
      code: 'REALITY_FORK_RATE_LIMITED',
      details: { scope: 'uploads' },
    });

    assertUploadQuota(
      clientKey,
      files.map(file => ({ size: file.size }))
    );

    const uploads = files.map(file =>
      createUpload({
        fileName: file.originalname,
        mimeType: file.mimetype,
        data: file.buffer,
        clientIp: clientKey,
      })
    );

    res.status(201).json({
      uploads,
      quotaState: quotaStateForContext(clientKey),
    });
  } catch (error) {
    respondForRouteError(res, error, 'failed to create uploads', {
      clientIp: clientIp(req),
    });
  }
});

router.post('/projects', (req: Request, res: Response) => {
  try {
    const clientKey = clientIp(req);
    const config = getRouteGuardConfig();
    assertBurstLimit({
      bucketKey: `project:${clientKey ?? 'anon'}`,
      limit: config.projectBurstLimit,
      windowMs: config.burstWindowMs,
      message: 'Project creation rate limit exceeded for the current window.',
      code: 'REALITY_FORK_RATE_LIMITED',
      details: { scope: 'projects' },
    });

    assertCreateProjectQuota(clientKey, {
      uploadIds: parseStringList(req.body?.uploadIds),
      urls: parseStringList(req.body?.urls),
      evidence: Array.isArray(req.body?.evidence) ? req.body.evidence : undefined,
      pastedText: parseString(req.body?.pastedText),
    });

    const project = createProject({
      title: parseString(req.body?.title),
      prompt: parseString(req.body?.prompt) ?? parseString(req.body?.claim) ?? '',
      description: parseString(req.body?.description),
      tags: req.body?.tags,
      uploadIds: parseStringList(req.body?.uploadIds),
      pastedText: parseString(req.body?.pastedText),
      urls: parseStringList(req.body?.urls),
      simulationConfig: req.body?.simulationConfig,
      decisionMode: req.body?.decisionMode,
      evidence: Array.isArray(req.body?.evidence) ? req.body.evidence : undefined,
      clientIp: clientKey,
    });
    const job = queueProjectJob(project.id, 'full', req);
    const envelope = buildProjectEnvelope(project.id, clientKey);
    res.status(201).json({
      ...(envelope ?? project),
      initialJob: job,
    });
  } catch (error) {
    respondForRouteError(res, error, 'failed to create project', {
      clientIp: clientIp(req),
    });
  }
});

router.get('/projects/:projectId', (req: Request, res: Response) => {
  const project = buildProjectEnvelope(req.params.projectId, clientIp(req));
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
});

router.get('/projects/:projectId/ops', (req: Request, res: Response) => {
  const ops = getRealityForkProjectOps(req.params.projectId, clientIp(req));
  if (!ops) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(ops);
});

router.post('/projects/:projectId/evidence', (req: Request, res: Response) => {
  try {
    const clientKey = clientIp(req);
    const config = getRouteGuardConfig();
    assertBurstLimit({
      bucketKey: `evidence:${clientKey ?? 'anon'}:${req.params.projectId}`,
      limit: config.evidenceBurstLimit,
      windowMs: config.burstWindowMs,
      message: 'Evidence writes are rate limited for the current window.',
      code: 'REALITY_FORK_RATE_LIMITED',
      details: { scope: 'evidence', projectId: req.params.projectId },
    });

    assertAddEvidenceQuota(req.params.projectId, {
      uploadId: parseString(req.body?.uploadId),
      text: parseString(req.body?.text),
      contentBase64: parseString(req.body?.contentBase64),
    });
    const evidence = addEvidence(req.params.projectId, req.body ?? {});
    res.status(201).json({
      ...evidence,
      quotaState: quotaStateForContext(clientKey, req.params.projectId),
    });
  } catch (error) {
    respondForRouteError(res, error, 'failed to add evidence', {
      clientIp: clientIp(req),
      projectId: req.params.projectId,
    });
  }
});

router.post('/projects/:projectId/jobs', (req: Request, res: Response) => {
  try {
    const kind = req.body?.kind === 'publish' ? 'publish' : 'full';
    const job = queueProjectJob(req.params.projectId, kind, req);
    res.status(202).json({
      ...job,
      quotaState: quotaStateForContext(clientIp(req), req.params.projectId),
    });
  } catch (error) {
    respondForRouteError(res, error, 'failed to queue job', {
      clientIp: clientIp(req),
      projectId: req.params.projectId,
    });
  }
});

router.get('/projects/:projectId/jobs/:jobId', (req: Request, res: Response) => {
  const project = getProjectDetail(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const job = getJob(req.params.jobId);
  if (!job || job.projectId !== req.params.projectId) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.json({
    ...job,
    quotaState: quotaStateForContext(clientIp(req), req.params.projectId),
  });
});

router.post('/projects/:projectId/publish', (req: Request, res: Response) => {
  try {
    const job = queueProjectJob(req.params.projectId, 'publish', req);
    res.status(202).json({
      ...job,
      quotaState: quotaStateForContext(clientIp(req), req.params.projectId),
    });
  } catch (error) {
    respondForRouteError(res, error, 'failed to queue publish', {
      clientIp: clientIp(req),
      projectId: req.params.projectId,
    });
  }
});

router.post('/projects/:projectId/retry', (req: Request, res: Response) => {
  try {
    const job = queueProjectJob(req.params.projectId, 'full', req);
    res.status(202).json({
      ...job,
      quotaState: quotaStateForContext(clientIp(req), req.params.projectId),
    });
  } catch (error) {
    respondForRouteError(res, error, 'failed to retry project', {
      clientIp: clientIp(req),
      projectId: req.params.projectId,
    });
  }
});

router.post('/internal/projects/:projectId/seed', (req: Request, res: Response) => {
  if (!realityForkInternalSeedEnabled()) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (!verifyRealityForkInternalSeedToken(req.headers.authorization)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const config = getRouteGuardConfig();
    const seedEvidence = parseInternalSeedEvidence(req.body?.evidence, config);
    const runFullJob = req.body?.runFullJob === true;
    assertBurstLimit({
      bucketKey: `internal-seed:${req.params.projectId}`,
      limit: config.internalSeedBurstLimit,
      windowMs: config.burstWindowMs,
      message: 'Internal seed writes are rate limited for the current window.',
      code: 'REALITY_FORK_RATE_LIMITED',
      details: { scope: 'internal_seed', projectId: req.params.projectId },
    });

    const reason = parseString(req.body?.reason) ?? 'launch-team-seed';
    const seeded = seedEvidence.map(item =>
      addEvidence(req.params.projectId, {
        ...item,
        metadata: {
          ...(item.metadata ?? {}),
          internalSeedOverride: true,
          seedReason: reason,
          seededAt: new Date().toISOString(),
        },
      })
    );

    const job = runFullJob ? queueProjectJob(req.params.projectId, 'full', req, { skipQuota: true }) : null;
    const envelope = buildProjectEnvelope(req.params.projectId, clientIp(req));
    if (!envelope) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.status(job ? 202 : 200).json({
      project: envelope,
      seededCount: seeded.length,
      seededEvidenceIds: seeded.map(item => item.id),
      reason,
      ...(job ? { job } : {}),
    });
  } catch (error) {
    respondForRouteError(res, error, 'failed to seed project', {
      clientIp: clientIp(req),
      projectId: req.params.projectId,
    });
  }
});

router.get('/projects/:projectId/stream', (req: Request, res: Response) => {
  const projectId = req.params.projectId;
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const flushHeaders = (res as Response & { flushHeaders?: () => void }).flushHeaders;
  if (typeof flushHeaders === 'function') flushHeaders.call(res);
  res.write(': connected\n\n');

  let closed = false;
  const seenIds = new Set<string>();

  const send = (event: string, data: unknown) => {
    if (closed) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (pollInterval) clearInterval(pollInterval);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    res.end();
  };

  const closeSoon = () => setTimeout(close, 25);

  const tick = () => {
    const project = getProjectDetail(projectId);
    if (!project) {
      send('error', { error: 'Project not found' });
      closeSoon();
      return;
    }

    const events = listProjectEvents(projectId);
    for (const event of events) {
      if (seenIds.has(event.id)) continue;
      seenIds.add(event.id);
      send(event.eventType, event);
    }

    const hasActiveJob = project.jobs.some(
      job => job.status === 'queued' || job.status === 'running'
    );
    if (
      !hasActiveJob &&
      (project.status === 'ready' || project.status === 'published' || project.status === 'failed')
    ) {
      send('done', { projectId, status: project.status });
      closeSoon();
    }
  };

  const pollInterval = setInterval(tick, 250);
  const heartbeatInterval = setInterval(() => {
    send('ping', { ts: Date.now() });
  }, 15_000);

  req.on('aborted', close);
  res.on('close', close);
  setTimeout(tick, 0);
});

router.get('/publications/:slug', (req: Request, res: Response) => {
  const publication = getPublicationBySlug(req.params.slug);
  if (!publication) {
    res.status(404).json({ error: 'Publication not found' });
    return;
  }
  res.json(publication);
});

router.get('/p/:slug', (req: Request, res: Response) => {
  const publication = getPublicationBySlug(req.params.slug);
  if (!publication) {
    res.status(404).json({ error: 'Publication not found' });
    return;
  }
  res.json(publication);
});

export default router;
