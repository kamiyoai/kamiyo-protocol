// Paranet API routes

import { Router, Request, Response } from 'express';
import {
  AgentParanetClient,
  checkHealth,
  checkLiveness,
  checkReadiness,
  createDKGClient,
  isValidGlobalId,
  type ParanetConfig,
} from '@kamiyo/agent-paranet';
import { logger } from '../../logger';

const router = Router();

let paranetClient: AgentParanetClient | null = null;
let clientInitPromise: Promise<AgentParanetClient> | null = null;

function getParanetConfig(): ParanetConfig {
  const endpoint = process.env.DKG_ENDPOINT;
  const blockchain = process.env.DKG_BLOCKCHAIN as ParanetConfig['blockchain'];

  if (!endpoint || !blockchain) {
    throw new Error('DKG_ENDPOINT and DKG_BLOCKCHAIN must be set');
  }

  return {
    dkgEndpoint: endpoint,
    dkgPort: parseInt(process.env.DKG_PORT || '8900', 10),
    blockchain,
    privateKey: process.env.DKG_PRIVATE_KEY,
    epochs: parseInt(process.env.DKG_EPOCHS || '12', 10),
    paranetUAL: process.env.PARANET_UAL,
  };
}

async function getClient(): Promise<AgentParanetClient> {
  if (paranetClient) return paranetClient;

  if (!clientInitPromise) {
    clientInitPromise = AgentParanetClient.create(getParanetConfig())
      .then(client => {
        paranetClient = client;
        logger.info('Paranet client initialized');
        return client;
      })
      .catch(err => {
        clientInitPromise = null;
        throw err;
      });
  }

  return clientInitPromise;
}

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const config = getParanetConfig();
    const dkg = await createDKGClient(config);
    const health = await checkHealth(dkg, config, { timeoutMs: 10000 });

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
    const dkg = await createDKGClient(config);
    const isLive = await checkLiveness(dkg, { timeoutMs: 5000 });

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
    const dkg = await createDKGClient(config);
    const isReady = await checkReadiness(dkg, config, { timeoutMs: 5000 });

    if (isReady) {
      res.json({ status: 'ok' });
    } else {
      res.status(503).json({ status: 'not_ready' });
    }
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: err instanceof Error ? err.message : 'Check failed' });
  }
});

router.get('/score/:globalId', async (req: Request, res: Response) => {
  const { globalId } = req.params;

  if (!isValidGlobalId(globalId)) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid global ID format' },
    });
    return;
  }

  const useCache = req.query.cache !== 'false';

  try {
    const client = await getClient();
    const result = await client.calculateCreditScore(globalId);

    if (!result.success || !result.data) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: result.error || 'Agent not found' },
      });
      return;
    }

    res.json({
      data: result.data,
      cached: result.cached,
      timestamp: result.timestamp,
    });
  } catch (err) {
    logger.error('Failed to get credit score', { globalId, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to calculate credit score' },
    });
  }
});

function clampInt(val: string | undefined, defaultVal: number, min: number, max: number): number {
  if (!val) return defaultVal;
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return defaultVal;
  return Math.max(min, Math.min(max, n));
}

router.get('/providers', async (req: Request, res: Response) => {
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
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid trustedBy global ID format' },
    });
    return;
  }

  try {
    const client = await getClient();
    const result = await client.findProviders({
      taskType: taskType as any,
      minQuality: clampInt(minQuality as string, 80, 0, 100),
      minTasks: clampInt(minTasks as string, 5, 0, 10000),
      maxResponseTimeMs: maxResponseTimeMs ? clampInt(maxResponseTimeMs as string, 0, 0, 86400000) : undefined,
      minTier: clampInt(minTier as string, 0, 0, 4),
      trustedBy: trustedBy as string | undefined,
      capabilities: capabilities ? (capabilities as string).split(',').slice(0, 10) : undefined,
      limit: clampInt(limit as string, 10, 1, 100),
    });

    if (!result.success) {
      res.status(500).json({
        error: { code: 'QUERY_FAILED', message: result.error || 'Provider search failed' },
      });
      return;
    }

    res.json({
      data: result.data,
      count: result.data?.length || 0,
      timestamp: result.timestamp,
    });
  } catch (err) {
    logger.error('Failed to find providers', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to search providers' },
    });
  }
});

router.get('/check/:globalId', async (req: Request, res: Response) => {
  const { globalId } = req.params;

  if (!isValidGlobalId(globalId)) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid global ID format' },
    });
    return;
  }

  const { minScore, minTier, minTasks, taskType } = req.query;

  try {
    const client = await getClient();
    const result = await client.meetsRequirements(globalId, {
      minScore: minScore ? parseInt(minScore as string, 10) : undefined,
      minTier: minTier ? parseInt(minTier as string, 10) : undefined,
      minTasks: minTasks ? parseInt(minTasks as string, 10) : undefined,
      taskType: taskType as string | undefined,
    });

    res.json({
      globalId,
      ...result,
    });
  } catch (err) {
    logger.error('Failed to check requirements', { globalId, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to check requirements' },
    });
  }
});

router.get('/capabilities/:globalId', async (req: Request, res: Response) => {
  const { globalId } = req.params;

  if (!isValidGlobalId(globalId)) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid global ID format' },
    });
    return;
  }

  try {
    const client = await getClient();
    const capabilities = await client.getAgentCapabilities(globalId);

    res.json({
      globalId,
      capabilities,
      count: capabilities.length,
    });
  } catch (err) {
    logger.error('Failed to get capabilities', { globalId, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get capabilities' },
    });
  }
});

router.get('/trust/:trustorId/:trusteeId', async (req: Request, res: Response) => {
  const { trustorId, trusteeId } = req.params;

  if (!isValidGlobalId(trustorId) || !isValidGlobalId(trusteeId)) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid global ID format' },
    });
    return;
  }

  try {
    const client = await getClient();
    const result = await client.checkTrust(trustorId, trusteeId);

    res.json({
      trustor: trustorId,
      trustee: trusteeId,
      ...result,
    });
  } catch (err) {
    logger.error('Failed to check trust', { trustorId, trusteeId, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to check trust' },
    });
  }
});

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

router.post('/task', async (req: Request, res: Response) => {
  const task = req.body;

  if (!process.env.DKG_PRIVATE_KEY) {
    res.status(503).json({
      error: { code: 'NOT_CONFIGURED', message: 'Publishing not enabled (no private key)' },
    });
    return;
  }

  const validation = validateTaskBody(task);
  if (!validation.valid) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: validation.error },
    });
    return;
  }

  try {
    const client = await getClient();
    const result = await client.publishTaskCompletion(task);

    if (!result.success) {
      res.status(400).json({
        error: { code: 'PUBLISH_FAILED', message: result.error || 'Failed to publish task' },
      });
      return;
    }

    res.status(201).json({
      success: true,
      ual: result.ual,
    });
  } catch (err) {
    logger.error('Failed to publish task', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to publish task' },
    });
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

router.post('/attestation', async (req: Request, res: Response) => {
  const attestation = req.body;

  if (!process.env.DKG_PRIVATE_KEY) {
    res.status(503).json({
      error: { code: 'NOT_CONFIGURED', message: 'Publishing not enabled (no private key)' },
    });
    return;
  }

  const validation = validateAttestationBody(attestation);
  if (!validation.valid) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: validation.error },
    });
    return;
  }

  try {
    const client = await getClient();
    const result = await client.publishCapabilityAttestation(attestation);

    if (!result.success) {
      res.status(400).json({
        error: { code: 'PUBLISH_FAILED', message: result.error || 'Failed to publish attestation' },
      });
      return;
    }

    res.status(201).json({
      success: true,
      ual: result.ual,
    });
  } catch (err) {
    logger.error('Failed to publish attestation', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to publish attestation' },
    });
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

router.post('/trust', async (req: Request, res: Response) => {
  const trust = req.body;

  if (!process.env.DKG_PRIVATE_KEY) {
    res.status(503).json({
      error: { code: 'NOT_CONFIGURED', message: 'Publishing not enabled (no private key)' },
    });
    return;
  }

  const validation = validateTrustBody(trust);
  if (!validation.valid) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: validation.error },
    });
    return;
  }

  try {
    const client = await getClient();
    const result = await client.publishTrustRelationship(trust);

    if (!result.success) {
      res.status(400).json({
        error: { code: 'PUBLISH_FAILED', message: result.error || 'Failed to publish trust' },
      });
      return;
    }

    res.status(201).json({
      success: true,
      ual: result.ual,
    });
  } catch (err) {
    logger.error('Failed to publish trust', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to publish trust' },
    });
  }
});

export default router;
