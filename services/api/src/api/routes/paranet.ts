import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  AgentParanetClient,
  checkHealth,
  checkLiveness,
  checkReadiness,
  createDKGClient,
  isValidGlobalId,
  getDefaultExecutor,
  CircuitOpenError,
} from '@kamiyo/agent-paranet';
import { logger } from '../../logger';
import { getParanetConfig, resolveDkgPrivateKey } from './_dkg-config';

const router = Router();

const queryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

const publishLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: { code: 'RATE_LIMITED', message: 'Publishing rate exceeded, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

const idempotencyCache = new Map<string, { result: unknown; expires: number }>();
const IDEMPOTENCY_TTL = 3600000;

function getIdempotencyResult(key: string | undefined): unknown | null {
  if (!key) return null;
  const cached = idempotencyCache.get(key);
  if (cached && Date.now() < cached.expires) {
    return cached.result;
  }
  if (cached) {
    idempotencyCache.delete(key);
  }
  return null;
}

function setIdempotencyResult(key: string | undefined, result: unknown): void {
  if (!key) return;
  idempotencyCache.set(key, { result, expires: Date.now() + IDEMPOTENCY_TTL });
  if (idempotencyCache.size > 10000) {
    const now = Date.now();
    for (const [k, v] of idempotencyCache) {
      if (v.expires < now) idempotencyCache.delete(k);
    }
  }
}

const TIMEOUT_MS = 30000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs = TIMEOUT_MS): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
  );
  return Promise.race([promise, timeout]);
}

let paranetClient: AgentParanetClient | null = null;
let clientInitPromise: Promise<AgentParanetClient> | null = null;
let lastHealthCheck = 0;
const HEALTH_INTERVAL = 60000;

async function getClient(): Promise<AgentParanetClient> {
  if (paranetClient && Date.now() - lastHealthCheck > HEALTH_INTERVAL) {
    try {
      const isHealthy = await withTimeout(
        checkLiveness(paranetClient.rawDKG, { timeoutMs: 5000 }),
        6000
      );
      lastHealthCheck = Date.now();
      if (!isHealthy) {
        logger.warn('DKG unhealthy, recreating');
        paranetClient = null;
        clientInitPromise = null;
      }
    } catch {
      logger.warn('DKG health check failed');
      paranetClient = null;
      clientInitPromise = null;
    }
  }

  if (paranetClient) return paranetClient;

  if (!clientInitPromise) {
    clientInitPromise = AgentParanetClient.create(getParanetConfig())
      .then(client => {
        paranetClient = client;
        lastHealthCheck = Date.now();
        logger.info('Paranet client ready');
        return client;
      })
      .catch(err => {
        clientInitPromise = null;
        throw new Error(`DKG init failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      });
  }

  return clientInitPromise;
}

async function withResilience<T>(op: () => Promise<T>, name: string): Promise<T> {
  return getDefaultExecutor().execute(op, name);
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const config = getParanetConfig();
    const dkg = await withTimeout(createDKGClient(config), 10000);
    const health = await withTimeout(checkHealth(dkg, config, { timeoutMs: 10000 }), 15000);

    res.json({
      service: 'kamiyo-paranet',
      ...health,
    });
  } catch (err) {
    logger.error('Paranet health check failed', { error: err instanceof Error ? err.message : String(err) });
    res.status(503).json({
      service: 'kamiyo-paranet',
      status: 'unhealthy',
      error: err instanceof Error ? err.message : 'Health check failed',
    });
  }
});

router.get('/health/live', async (_req: Request, res: Response) => {
  try {
    const config = getParanetConfig();
    const dkg = await withTimeout(createDKGClient(config), 5000);
    const isLive = await withTimeout(checkLiveness(dkg, { timeoutMs: 5000 }), 6000);

    if (isLive) {
      res.json({ status: 'ok' });
    } else {
      res.status(503).json({ status: 'unhealthy' });
    }
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err instanceof Error ? err.message : 'Check failed' });
  }
});

router.get('/health/ready', async (_req: Request, res: Response) => {
  try {
    const config = getParanetConfig();
    const dkg = await withTimeout(createDKGClient(config), 5000);
    const isReady = await withTimeout(checkReadiness(dkg, config, { timeoutMs: 5000 }), 6000);

    if (isReady) {
      res.json({ status: 'ok' });
    } else {
      res.status(503).json({ status: 'not_ready' });
    }
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: err instanceof Error ? err.message : 'Check failed' });
  }
});

// Query endpoints (rate limited)
router.get('/score/:globalId', queryLimiter, async (req: Request, res: Response) => {
  const { globalId } = req.params;

  if (!isValidGlobalId(globalId)) {
    return sendError(res, 400, 'INVALID_INPUT', 'Invalid global ID format');
  }

  try {
    const client = await getClient();
    const result = await withResilience(
      () => withTimeout(client.calculateCreditScore(globalId)),
      'calculateCreditScore'
    );

    if (!result.success || !result.data) {
      return sendError(res, 404, 'NOT_FOUND', result.error || 'Agent not found');
    }

    res.json({
      data: result.data,
      cached: result.cached,
      timestamp: result.timestamp,
    });
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return sendError(res, 503, 'SERVICE_UNAVAILABLE', 'DKG temporarily unavailable');
    }
    logger.error('Failed to get credit score', { globalId, error: err instanceof Error ? err.message : String(err) });
    const message = err instanceof Error && err.message === 'Operation timeout'
      ? 'Request timeout'
      : 'Failed to calculate credit score';
    sendError(res, 500, 'INTERNAL_ERROR', message);
  }
});

function clampInt(val: string | undefined, defaultVal: number, min: number, max: number): number {
  if (!val) return defaultVal;
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return defaultVal;
  return Math.max(min, Math.min(max, n));
}

router.get('/providers', queryLimiter, async (req: Request, res: Response) => {
  const {
    taskType,
    minQuality,
    minTasks,
    maxResponseTimeMs,
    minTier,
    trustedBy,
    capabilities,
    limit,
  } = req.query;

  if (trustedBy && !isValidGlobalId(trustedBy as string)) {
    return sendError(res, 400, 'INVALID_INPUT', 'Invalid trustedBy global ID format');
  }

  try {
    const client = await getClient();
    const result = await withResilience(
      () => withTimeout(client.findProviders({
        taskType: taskType as any,
        minQuality: clampInt(minQuality as string, 80, 0, 100),
        minTasks: clampInt(minTasks as string, 5, 0, 10000),
        maxResponseTimeMs: maxResponseTimeMs ? clampInt(maxResponseTimeMs as string, 0, 0, 86400000) : undefined,
        minTier: clampInt(minTier as string, 0, 0, 4),
        trustedBy: trustedBy as string | undefined,
        capabilities: capabilities ? (capabilities as string).split(',').slice(0, 10) : undefined,
        limit: clampInt(limit as string, 10, 1, 100),
      })),
      'findProviders'
    );

    if (!result.success) {
      return sendError(res, 500, 'QUERY_FAILED', result.error || 'Provider search failed');
    }

    res.json({
      data: result.data,
      count: result.data?.length || 0,
      timestamp: result.timestamp,
    });
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return sendError(res, 503, 'SERVICE_UNAVAILABLE', 'DKG temporarily unavailable');
    }
    logger.error('Failed to find providers', { error: err instanceof Error ? err.message : String(err) });
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to search providers');
  }
});

router.get('/check/:globalId', queryLimiter, async (req: Request, res: Response) => {
  const { globalId } = req.params;

  if (!isValidGlobalId(globalId)) {
    return sendError(res, 400, 'INVALID_INPUT', 'Invalid global ID format');
  }

  const { minScore, minTier, minTasks, taskType } = req.query;

  try {
    const client = await getClient();
    const result = await withResilience(
      () => withTimeout(client.meetsRequirements(globalId, {
        minScore: minScore ? parseInt(minScore as string, 10) : undefined,
        minTier: minTier ? parseInt(minTier as string, 10) : undefined,
        minTasks: minTasks ? parseInt(minTasks as string, 10) : undefined,
        taskType: taskType as string | undefined,
      })),
      'meetsRequirements'
    );

    res.json({
      globalId,
      ...result,
    });
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return sendError(res, 503, 'SERVICE_UNAVAILABLE', 'DKG temporarily unavailable');
    }
    logger.error('Failed to check requirements', { globalId, error: err instanceof Error ? err.message : String(err) });
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to check requirements');
  }
});

router.get('/capabilities/:globalId', queryLimiter, async (req: Request, res: Response) => {
  const { globalId } = req.params;

  if (!isValidGlobalId(globalId)) {
    return sendError(res, 400, 'INVALID_INPUT', 'Invalid global ID format');
  }

  try {
    const client = await getClient();
    const capabilities = await withResilience(
      () => withTimeout(client.getAgentCapabilities(globalId)),
      'getAgentCapabilities'
    );

    res.json({
      globalId,
      capabilities,
      count: capabilities.length,
    });
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return sendError(res, 503, 'SERVICE_UNAVAILABLE', 'DKG temporarily unavailable');
    }
    logger.error('Failed to get capabilities', { globalId, error: err instanceof Error ? err.message : String(err) });
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get capabilities');
  }
});

router.get('/trust/:trustorId/:trusteeId', queryLimiter, async (req: Request, res: Response) => {
  const { trustorId, trusteeId } = req.params;

  if (!isValidGlobalId(trustorId) || !isValidGlobalId(trusteeId)) {
    return sendError(res, 400, 'INVALID_INPUT', 'Invalid global ID format');
  }

  try {
    const client = await getClient();
    const result = await withResilience(
      () => withTimeout(client.checkTrust(trustorId, trusteeId)),
      'checkTrust'
    );

    res.json({
      trustor: trustorId,
      trustee: trusteeId,
      ...result,
    });
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return sendError(res, 503, 'SERVICE_UNAVAILABLE', 'DKG temporarily unavailable');
    }
    logger.error('Failed to check trust', { trustorId, trusteeId, error: err instanceof Error ? err.message : String(err) });
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to check trust');
  }
});

// Publish endpoints (stricter rate limiting + idempotency)
function validateTaskBody(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') return { valid: false, error: 'Request body required' };
  const t = body as Record<string, unknown>;
  if (!t.providerGlobalId || !isValidGlobalId(t.providerGlobalId as string)) {
    return { valid: false, error: 'Invalid providerGlobalId' };
  }
  if (!t.clientGlobalId || !isValidGlobalId(t.clientGlobalId as string)) {
    return { valid: false, error: 'Invalid clientGlobalId' };
  }
  if (typeof t.qualityScore !== 'number' || t.qualityScore < 0 || t.qualityScore > 100) {
    return { valid: false, error: 'qualityScore must be 0-100' };
  }
  return { valid: true };
}

router.post('/task', publishLimiter, async (req: Request, res: Response) => {
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  const cachedResult = getIdempotencyResult(idempotencyKey);
  if (cachedResult) {
    return res.status(201).json(cachedResult);
  }

  const task = req.body;

  if (!resolveDkgPrivateKey()) {
    return sendError(res, 503, 'NOT_CONFIGURED', 'Publishing not enabled (no private key)');
  }

  const validation = validateTaskBody(task);
  if (!validation.valid) {
    return sendError(res, 400, 'INVALID_INPUT', validation.error || 'Invalid input');
  }

  try {
    const client = await getClient();
    const result = await withResilience(
      () => withTimeout(client.publishTaskCompletion(task), 60000),
      'publishTaskCompletion'
    );

    if (!result.success) {
      return sendError(res, 400, 'PUBLISH_FAILED', result.error || 'Failed to publish task');
    }

    const response = { success: true, ual: result.ual };
    setIdempotencyResult(idempotencyKey, response);
    res.status(201).json(response);
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return sendError(res, 503, 'SERVICE_UNAVAILABLE', 'DKG temporarily unavailable');
    }
    logger.error('Failed to publish task', { error: err instanceof Error ? err.message : String(err) });
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to publish task');
  }
});

function validateAttestationBody(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') return { valid: false, error: 'Request body required' };
  const a = body as Record<string, unknown>;
  if (!a.agentGlobalId || !isValidGlobalId(a.agentGlobalId as string)) {
    return { valid: false, error: 'Invalid agentGlobalId' };
  }
  if (!a.attestorGlobalId || !isValidGlobalId(a.attestorGlobalId as string)) {
    return { valid: false, error: 'Invalid attestorGlobalId' };
  }
  if (typeof a.capability !== 'string' || a.capability.length === 0 || a.capability.length > 128) {
    return { valid: false, error: 'capability must be 1-128 chars' };
  }
  if (typeof a.confidence !== 'number' || a.confidence < 0 || a.confidence > 100) {
    return { valid: false, error: 'confidence must be 0-100' };
  }
  return { valid: true };
}

router.post('/attestation', publishLimiter, async (req: Request, res: Response) => {
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  const cachedResult = getIdempotencyResult(idempotencyKey);
  if (cachedResult) {
    return res.status(201).json(cachedResult);
  }

  const attestation = req.body;

  if (!resolveDkgPrivateKey()) {
    return sendError(res, 503, 'NOT_CONFIGURED', 'Publishing not enabled (no private key)');
  }

  const validation = validateAttestationBody(attestation);
  if (!validation.valid) {
    return sendError(res, 400, 'INVALID_INPUT', validation.error || 'Invalid input');
  }

  try {
    const client = await getClient();
    const result = await withResilience(
      () => withTimeout(client.publishCapabilityAttestation(attestation), 60000),
      'publishCapabilityAttestation'
    );

    if (!result.success) {
      return sendError(res, 400, 'PUBLISH_FAILED', result.error || 'Failed to publish attestation');
    }

    const response = { success: true, ual: result.ual };
    setIdempotencyResult(idempotencyKey, response);
    res.status(201).json(response);
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return sendError(res, 503, 'SERVICE_UNAVAILABLE', 'DKG temporarily unavailable');
    }
    logger.error('Failed to publish attestation', { error: err instanceof Error ? err.message : String(err) });
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to publish attestation');
  }
});

function validateTrustBody(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') return { valid: false, error: 'Request body required' };
  const t = body as Record<string, unknown>;
  if (!t.trustorGlobalId || !isValidGlobalId(t.trustorGlobalId as string)) {
    return { valid: false, error: 'Invalid trustorGlobalId' };
  }
  if (!t.trusteeGlobalId || !isValidGlobalId(t.trusteeGlobalId as string)) {
    return { valid: false, error: 'Invalid trusteeGlobalId' };
  }
  if (typeof t.trustLevel !== 'number' || t.trustLevel < 0 || t.trustLevel > 100) {
    return { valid: false, error: 'trustLevel must be 0-100' };
  }
  return { valid: true };
}

router.post('/trust', publishLimiter, async (req: Request, res: Response) => {
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  const cachedResult = getIdempotencyResult(idempotencyKey);
  if (cachedResult) {
    return res.status(201).json(cachedResult);
  }

  const trust = req.body;

  if (!resolveDkgPrivateKey()) {
    return sendError(res, 503, 'NOT_CONFIGURED', 'Publishing not enabled (no private key)');
  }

  const validation = validateTrustBody(trust);
  if (!validation.valid) {
    return sendError(res, 400, 'INVALID_INPUT', validation.error || 'Invalid input');
  }

  try {
    const client = await getClient();
    const result = await withResilience(
      () => withTimeout(client.publishTrustRelationship(trust), 60000),
      'publishTrustRelationship'
    );

    if (!result.success) {
      return sendError(res, 400, 'PUBLISH_FAILED', result.error || 'Failed to publish trust');
    }

    const response = { success: true, ual: result.ual };
    setIdempotencyResult(idempotencyKey, response);
    res.status(201).json(response);
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return sendError(res, 503, 'SERVICE_UNAVAILABLE', 'DKG temporarily unavailable');
    }
    logger.error('Failed to publish trust', { error: err instanceof Error ? err.message : String(err) });
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to publish trust');
  }
});

export default router;
