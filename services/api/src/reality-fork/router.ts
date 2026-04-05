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
import {
  getX402Challenge,
  getX402Gateway,
  getSupportedX402Networks,
  getX402PaymentHeader,
  verifyAndSettleX402Payment,
} from '../x402-runtime';
import { getCreditBalance, deductCredits, getCreditBalanceUsd, usdToCredits } from '../db';
import { getBurnService } from '../burn-service';
import { logger } from '../logger';
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

// ── x402 + credits payment gate ──────────────────────────────────────
const RF_FULL_JOB_PRICE_USD = 0.15;
const RF_PUBLISH_PRICE_USD = 0.05;

function rfPaymentRequired(): boolean {
  return process.env.RF_LLM_ENABLED === 'true' && Boolean(process.env.ANTHROPIC_API_KEY);
}

type RfPaymentResult = 'paid' | 'free' | false;

async function rfPaymentGate(
  req: Request,
  res: Response,
  priceUsd: number,
  description: string
): Promise<RfPaymentResult> {
  if (!rfPaymentRequired()) return 'free';

  const walletHeader = req.headers['x-wallet'] as string | undefined;
  const facilitator = getX402Gateway();
  const supportedNetworks = getSupportedX402Networks();

  // 1. Try prepaid credits
  if (walletHeader) {
    const requiredMicro = usdToCredits(priceUsd);
    const balanceMicro = getCreditBalance(walletHeader);
    if (balanceMicro >= requiredMicro) {
      const deducted = deductCredits(walletHeader, requiredMicro, req.path, description);
      if (deducted) {
        const burnService = getBurnService();
        burnService.recordCreditBurn(walletHeader, req.path, priceUsd);
        logger.info('RF credits used', {
          wallet: walletHeader.slice(0, 10) + '...',
          amount: priceUsd,
          endpoint: req.path,
        });
        return 'paid';
      }
    }
  }

  // 2. Try x402 on-chain payment
  if (!facilitator) {
    if (!walletHeader) {
      res.status(402).json({
        error: 'Payment required',
        priceUsd,
        description,
        hint: 'Send X-Wallet header with prepaid credits, or x402 payment header.',
      });
    } else {
      res.status(402).json({
        error: 'Insufficient credits',
        priceUsd,
        credits: {
          wallet: walletHeader.slice(0, 10) + '...',
          balanceUsd: getCreditBalanceUsd(walletHeader),
        },
      });
    }
    return false;
  }

  const paymentHeader = getX402PaymentHeader(req.headers);
  if (paymentHeader.type === 'missing') {
    const { body, headers } = getX402Challenge(req.path, priceUsd, description, supportedNetworks);
    const responseBody: Record<string, unknown> = { ...body };
    if (walletHeader) {
      responseBody.credits = {
        wallet: walletHeader.slice(0, 10) + '...',
        balanceUsd: getCreditBalanceUsd(walletHeader),
        requiredUsd: priceUsd,
      };
    }
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.status(402).json(responseBody);
    return false;
  }

  const result = await verifyAndSettleX402Payment(
    paymentHeader,
    req.path,
    priceUsd,
    description,
    supportedNetworks,
    { allowSapX402: false }
  );
  if (result.ok) {
    const burnService = getBurnService();
    burnService.recordX402Burn(result.payment.payer || 'unknown', req.path, priceUsd);
    logger.info('RF x402 payment settled', {
      payer: result.payment.payer,
      network: result.payment.network,
      amount: priceUsd,
    });
    return 'paid';
  }

  const { body } = getX402Challenge(req.path, priceUsd, description, supportedNetworks);
  if (result.verifyError) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (body as any).verifyError = result.verifyError;
  }
  res.status(402).json(body);
  return false;
}

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
    jobFailureBreakerThreshold: parseIntEnv(env.REALITY_FORK_JOB_FAILURE_BREAKER_THRESHOLD, 2),
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
    internalSeedTextCharLimit: parseIntEnv(env.REALITY_FORK_INTERNAL_SEED_TEXT_CHAR_LIMIT, 120_000),
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

function quotaStateForContext(
  clientKey: string | null,
  projectId?: string
): ReturnType<typeof getRealityForkQuotaState> {
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
  const recentFailures = failures.filter(
    job => nowMs - job.createdAt < config.jobFailureBreakerWindowMs
  );
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
        parseString(candidate.sourceLabel) ?? parseString(candidate.reason) ?? 'launch-team-seed',
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
  return enqueueProjectJob(projectId, kind, undefined, { skipQuota: options.skipQuota });
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

router.post('/projects', async (req: Request, res: Response) => {
  try {
    // Payment gate: project creation triggers a full LLM job
    const paymentResult = await rfPaymentGate(
      req,
      res,
      RF_FULL_JOB_PRICE_USD,
      'Reality Fork project creation + analysis'
    );
    if (!paymentResult) return;
    const isPaid = paymentResult === 'paid';

    const clientKey = clientIp(req);
    const config = getRouteGuardConfig();
    assertBurstLimit({
      bucketKey: `project:${clientKey ?? 'anon'}`,
      limit: isPaid ? config.projectBurstLimit * 5 : config.projectBurstLimit,
      windowMs: config.burstWindowMs,
      message: 'Project creation rate limit exceeded for the current window.',
      code: 'REALITY_FORK_RATE_LIMITED',
      details: { scope: 'projects' },
    });

    if (!isPaid) {
      assertCreateProjectQuota(clientKey, {
        uploadIds: parseStringList(req.body?.uploadIds),
        urls: parseStringList(req.body?.urls),
        evidence: Array.isArray(req.body?.evidence) ? req.body.evidence : undefined,
        pastedText: parseString(req.body?.pastedText),
      });
    }

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
    const job = queueProjectJob(project.id, 'full', req, { skipQuota: isPaid });
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

router.post('/projects/:projectId/jobs', async (req: Request, res: Response) => {
  try {
    const kind = req.body?.kind === 'publish' ? 'publish' : 'full';
    const price = kind === 'publish' ? RF_PUBLISH_PRICE_USD : RF_FULL_JOB_PRICE_USD;
    const desc =
      kind === 'publish' ? 'Reality Fork DKG publication' : 'Reality Fork intelligence pipeline';
    const paid = await rfPaymentGate(req, res, price, desc);
    if (!paid) return;

    const job = queueProjectJob(req.params.projectId, kind, req, {
      skipQuota: paid === 'paid',
    });
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

router.post('/projects/:projectId/publish', async (req: Request, res: Response) => {
  try {
    const paid = await rfPaymentGate(
      req,
      res,
      RF_PUBLISH_PRICE_USD,
      'Reality Fork DKG publication'
    );
    if (!paid) return;

    const job = queueProjectJob(req.params.projectId, 'publish', req, {
      skipQuota: paid === 'paid',
    });
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

router.post('/projects/:projectId/retry', async (req: Request, res: Response) => {
  try {
    const paid = await rfPaymentGate(
      req,
      res,
      RF_FULL_JOB_PRICE_USD,
      'Reality Fork pipeline retry'
    );
    if (!paid) return;

    const job = queueProjectJob(req.params.projectId, 'full', req, {
      skipQuota: paid === 'paid',
    });
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

    const job = runFullJob
      ? queueProjectJob(req.params.projectId, 'full', req, { skipQuota: true })
      : null;
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

router.post('/internal/projects/:projectId/publish', (req: Request, res: Response) => {
  if (!realityForkInternalSeedEnabled()) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (!verifyRealityForkInternalSeedToken(req.headers.authorization)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const job = queueProjectJob(req.params.projectId, 'publish', req, { skipQuota: true });
    res.status(202).json(job);
  } catch (error) {
    respondForRouteError(res, error, 'failed to queue internal publish', {
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

// ── DKG V9 diagnostics (keep behind env gate) ──────────────────────────
router.get('/diag/dkg-v9', async (_req: Request, res: Response) => {
  if (process.env.RF_DKG_DIAG !== 'true') {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const dkgVersion = process.env.RF_DKG_VERSION ?? 'v8';
  const nodeVersion = process.version;
  const steps: string[] = [];
  try {
    if (dkgVersion !== 'v9') {
      res.json({ ok: false, reason: 'RF_DKG_VERSION is not v9', dkgVersion, nodeVersion });
      return;
    }
    steps.push('importing @kamiyo/reality-fork-dkg');
    const { RealityForkPublisherV9 } = await import('@kamiyo/reality-fork-dkg');

    steps.push('importing @origintrail-official/dkg-agent');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentMod = (await import('@origintrail-official/dkg-agent')) as any;
    const agentFactory = agentMod.DKGAgent ?? agentMod.default?.DKGAgent;
    steps.push(
      `agentFactory: ${agentFactory ? 'found' : 'NOT FOUND'}, exports: ${Object.keys(agentMod).join(',')}`
    );

    steps.push('creating publisher instance');
    const bootstrapPeers = (process.env.RF_DKG_V9_BOOTSTRAP_PEERS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const operationalKeys = (process.env.RF_DKG_V9_OP_KEYS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const publisher = new RealityForkPublisherV9(
      {
        dataDir: process.env.RF_DKG_V9_DATA_DIR ?? '/tmp/kamiyo-dkg-v9',
        bootstrapPeers,
        chainRpcUrl: process.env.RF_DKG_V9_CHAIN_RPC ?? '',
        chainHubAddress: process.env.RF_DKG_V9_HUB_ADDRESS ?? '',
        operationalKeys,
        paranetId: process.env.RF_DKG_V9_PARANET_ID ?? '',
        epochs: 12,
      },
      agentFactory
    );
    steps.push('publisher created, now testing ensureAgent via publishReport');

    const testResult = await Promise.race([
      publisher.publishReport({
        projectId: 'diag-test',
        projectName: 'V9 Diagnostic',
        description: 'Testing V9 DKG agent initialization',
        hypothesisCount: 1,
        laneCount: 1,
        simulationRounds: 1,
        winnerHypothesisId: 'status_quo',
        probability: 0.5,
        impactScore: 50,
        evidenceCount: 1,
        reportHash: 'diag0000',
        createdAt: new Date().toISOString(),
      }),
      new Promise(resolve =>
        setTimeout(() => resolve({ success: false, error: 'Timeout after 30s' }), 30_000)
      ),
    ]);
    steps.push('publishReport returned');

    await publisher.shutdown().catch(() => {});
    res.json({
      ok: true,
      steps,
      result: testResult,
      dkgVersion,
      nodeVersion,
      bootstrapPeers: bootstrapPeers.length,
      hasOpKeys: operationalKeys.length > 0,
    });
  } catch (err) {
    res.json({
      ok: false,
      steps,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 8) : undefined,
      dkgVersion,
      nodeVersion,
    });
  }
});

router.get('/diag/dkg-v9-publish/:projectId', async (req: Request, res: Response) => {
  if (process.env.RF_DKG_DIAG !== 'true') {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  try {
    const project = getProjectDetail(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (!project.report) {
      res.status(400).json({ error: 'Project has no report' });
      return;
    }

    const { RealityForkPublisherV9 } = await import('@kamiyo/reality-fork-dkg');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentMod = (await import('@origintrail-official/dkg-agent')) as any;
    const agentFactory = agentMod.DKGAgent ?? agentMod.default?.DKGAgent;

    const bootstrapPeers = (process.env.RF_DKG_V9_BOOTSTRAP_PEERS ?? '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    const operationalKeys = (process.env.RF_DKG_V9_OP_KEYS ?? '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);

    const publisher = new RealityForkPublisherV9(
      {
        dataDir: process.env.RF_DKG_V9_DATA_DIR ?? '/tmp/kamiyo-dkg-v9',
        bootstrapPeers,
        chainRpcUrl: process.env.RF_DKG_V9_CHAIN_RPC ?? '',
        chainHubAddress: process.env.RF_DKG_V9_HUB_ADDRESS ?? '',
        operationalKeys,
        paranetId: process.env.RF_DKG_V9_PARANET_ID ?? '',
        epochs: 12,
      },
      agentFactory
    );

    // Build same data that publishToDKGv9 builds
    const sims = project.simulations || [];
    const report = project.report;
    const winnerHypId =
      report.decision?.winnerHypothesisId ?? sims[0]?.hypothesisId ?? 'status_quo';
    const winner =
      sims.find((s: { hypothesisId: string }) => s.hypothesisId === winnerHypId) ?? sims[0];

    const publishData = {
      projectId: project.id,
      projectName: project.title,
      description: report.summary || 'No summary available',
      hypothesisCount: sims.length || 1,
      laneCount: project.simulationConfig?.lanes?.length || 1,
      simulationRounds: project.simulationConfig?.rounds || 1,
      winnerHypothesisId: winnerHypId,
      probability: winner?.probability ?? 0.5,
      impactScore: winner?.impactScore ?? 50,
      evidenceCount: report.evidenceSummary?.sourceCount ?? 0,
      reportHash: project.id.slice(0, 12).padEnd(8, '0'),
      createdAt: new Date(report.createdAt).toISOString(),
    };

    const result = await Promise.race([
      publisher.publishReport(publishData),
      new Promise(resolve =>
        setTimeout(() => resolve({ success: false, error: 'Timeout after 60s' }), 60_000)
      ),
    ]);

    await publisher.shutdown().catch(() => {});
    res.json({ ok: true, publishData, result });
  } catch (err) {
    res.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5) : undefined,
    });
  }
});

export default router;
