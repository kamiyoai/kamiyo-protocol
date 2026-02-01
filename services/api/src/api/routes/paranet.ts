// KAMIYO Agent Paranet API Routes
// Decentralized credit scores for AI agents on OriginTrail DKG

import { Router, Request, Response } from 'express';
import {
  AgentParanetClient,
  checkHealth,
  checkLiveness,
  checkReadiness,
  createDKGClient,
  type ParanetConfig,
  type CreditScore,
  type ProviderSearchResult,
} from '@kamiyo/agent-paranet';
import { logger } from '../../logger';

const router = Router();

// Singleton client (lazy initialized)
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

// Health check
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

// Liveness probe
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

// Readiness probe
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

// Get credit score for an agent
router.get('/score/:globalId', async (req: Request, res: Response) => {
  const { globalId } = req.params;
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

// Find providers matching criteria
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

  try {
    const client = await getClient();
    const result = await client.findProviders({
      taskType: taskType as any,
      minQuality: minQuality ? parseInt(minQuality as string, 10) : undefined,
      minTasks: minTasks ? parseInt(minTasks as string, 10) : undefined,
      maxResponseTimeMs: maxResponseTimeMs ? parseInt(maxResponseTimeMs as string, 10) : undefined,
      minTier: minTier ? parseInt(minTier as string, 10) : undefined,
      trustedBy: trustedBy as string | undefined,
      capabilities: capabilities ? (capabilities as string).split(',') : undefined,
      limit: limit ? parseInt(limit as string, 10) : 10,
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

// Check if agent meets requirements
router.get('/check/:globalId', async (req: Request, res: Response) => {
  const { globalId } = req.params;
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

// Get agent capabilities
router.get('/capabilities/:globalId', async (req: Request, res: Response) => {
  const { globalId } = req.params;

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

// Check trust between two agents
router.get('/trust/:trustorId/:trusteeId', async (req: Request, res: Response) => {
  const { trustorId, trusteeId } = req.params;

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

// Publish task completion (requires auth)
router.post('/task', async (req: Request, res: Response) => {
  const task = req.body;

  if (!process.env.DKG_PRIVATE_KEY) {
    res.status(503).json({
      error: { code: 'NOT_CONFIGURED', message: 'Publishing not enabled (no private key)' },
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

// Publish capability attestation (requires auth)
router.post('/attestation', async (req: Request, res: Response) => {
  const attestation = req.body;

  if (!process.env.DKG_PRIVATE_KEY) {
    res.status(503).json({
      error: { code: 'NOT_CONFIGURED', message: 'Publishing not enabled (no private key)' },
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

// Publish trust relationship (requires auth)
router.post('/trust', async (req: Request, res: Response) => {
  const trust = req.body;

  if (!process.env.DKG_PRIVATE_KEY) {
    res.status(503).json({
      error: { code: 'NOT_CONFIGURED', message: 'Publishing not enabled (no private key)' },
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
