// SwarmTeams x Companion - ZK signal stats and live streaming

import { Router, Request, Response } from 'express';
import { getSwarmTeamsSignals, getSwarmTeamsStats } from '../../db';
import { logger } from '../../logger';
import { demoEvents, isDemoRunning, DemoLog } from '../../swarmteams-live-demo';

const router = Router();

// SwarmTeams x Companion live stream (SSE)
// GET /swarmteams/demo/stream
router.get('/demo/stream', (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send initial status
  const status = isDemoRunning() ? 'running' : 'idle';
  res.write(`event: status\ndata: ${JSON.stringify({ status })}\n\n`);

  // Listen for demo logs
  const onLog = (log: DemoLog) => {
    res.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
  };

  demoEvents.on('log', onLog);

  // Keep-alive ping every 30s
  const pingInterval = setInterval(() => {
    res.write(`event: ping\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`);
  }, 30000);

  // Cleanup on client disconnect
  req.on('close', () => {
    demoEvents.off('log', onLog);
    clearInterval(pingInterval);
    logger.info('SwarmTeams x Companion stream disconnected');
  });

  logger.info('SwarmTeams x Companion stream connected');
});

// GET /swarmteams/demo/status - Check if demo is running
router.get('/demo/status', (_req: Request, res: Response) => {
  res.json({
    running: isDemoRunning(),
    streamUrl: '/api/swarmteams/demo/stream',
  });
});

// POST /swarmteams/demo/trigger - Start the demo (requires secret)
router.post('/demo/trigger', async (req: Request, res: Response) => {
  const secret = req.headers['x-demo-secret'] || req.body?.secret || req.query.secret;
  const expectedSecret = process.env.DEMO_TRIGGER_SECRET || 'swarmteams-companion';

  if (secret !== expectedSecret) {
    return res.status(401).json({ error: 'Invalid secret' });
  }

  if (isDemoRunning()) {
    return res.status(409).json({ error: 'Demo already running' });
  }

  // Import and get twitter client (optional - demo works without it)
  const { getGlobalTwitter } = await import('../../index');
  const twitter = getGlobalTwitter();

  // Start demo in background (twitter can be null for local testing)
  const { runLiveDemo } = await import('../../swarmteams-live-demo');
  runLiveDemo(twitter ?? null).then(result => {
    logger.info('Demo triggered via API', { success: result.success, tweets: result.tweetIds.length });
  });

  res.json({
    started: true,
    streamUrl: '/api/swarmteams/demo/stream',
    twitterEnabled: !!twitter,
  });
});

// GET /swarmteams/health - Get rate limiter and circuit breaker status
router.get('/health', async (_req: Request, res: Response) => {
  const { isRateLimited, isCircuitOpen, getWriteCooldown, canWrite } = await import('../../rate-limiter');

  const cooldownMs = getWriteCooldown();
  const cooldownSeconds = Math.round(cooldownMs / 1000);

  res.json({
    canWrite: canWrite(),
    rateLimited: isRateLimited(),
    circuitOpen: isCircuitOpen(),
    cooldownSeconds: cooldownSeconds > 0 ? cooldownSeconds : 0,
    status: isCircuitOpen() ? 'circuit_open' : isRateLimited() ? 'rate_limited' : 'healthy',
  });
});

// POST /swarmteams/reset-ratelimit - Force reset rate limiter (requires secret)
router.post('/reset-ratelimit', async (req: Request, res: Response) => {
  const secret = req.headers['x-demo-secret'] || req.body?.secret;
  const expectedSecret = process.env.DEMO_TRIGGER_SECRET || 'swarmteams-companion';

  if (secret !== expectedSecret) {
    return res.status(401).json({ error: 'Invalid secret' });
  }

  const { forceReset } = await import('../../rate-limiter');
  forceReset();

  res.json({ reset: true, message: 'Rate limiter and circuit breaker reset' });
});

// GET /swarmteams/stats - Get aggregated signal statistics
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = getSwarmTeamsStats();
    res.json({
      totalSignals: stats.total,
      byDirection: {
        long: stats.long,
        short: stats.short,
        neutral: stats.neutral,
      },
      byType: {
        sentiment: stats.sentiment,
        technical: stats.technical,
        onChain: stats.onChain,
        news: stats.news,
      },
      avgConfidence: stats.avgConfidence,
      avgMagnitude: stats.avgMagnitude,
      last24h: stats.last24h,
    });
  } catch (err) {
    logger.error('Failed to get SwarmTeams stats', { error: String(err) });
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// GET /swarmteams/signals - Get recent signals (limited)
router.get('/signals', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const signals = getSwarmTeamsSignals(limit);

    res.json({
      signals: signals.map(s => ({
        id: s.id,
        tweetId: s.tweet_id,
        commitment: s.commitment.slice(0, 16) + '...',
        type: ['SENTIMENT', 'TA', 'ON-CHAIN', 'NEWS'][s.signal_type] || 'UNKNOWN',
        direction: ['SHORT', 'LONG', 'NEUTRAL'][s.direction] || 'UNKNOWN',
        confidence: s.confidence,
        magnitude: s.magnitude,
        createdAt: s.created_at,
      })),
      count: signals.length,
    });
  } catch (err) {
    logger.error('Failed to get SwarmTeams signals', { error: String(err) });
    res.status(500).json({ error: 'Failed to get signals' });
  }
});

// GET /swarmteams/signal/:id - Get full signal details
router.get('/signal/:id', async (req: Request, res: Response) => {
  try {
    const signals = getSwarmTeamsSignals(100);
    const signal = signals.find(s => s.id === parseInt(req.params.id));

    if (!signal) {
      return res.status(404).json({ error: 'Signal not found' });
    }

    res.json({
      id: signal.id,
      tweetId: signal.tweet_id,
      commitment: signal.commitment,
      nullifier: signal.nullifier,
      proof: {
        a: signal.proof_a,
        b: signal.proof_b,
        c: signal.proof_c,
      },
      signal: {
        type: ['SENTIMENT', 'TA', 'ON-CHAIN', 'NEWS'][signal.signal_type] || 'UNKNOWN',
        direction: ['SHORT', 'LONG', 'NEUTRAL'][signal.direction] || 'UNKNOWN',
        confidence: signal.confidence,
        magnitude: signal.magnitude,
      },
      stakeAmount: signal.stake_amount,
      createdAt: signal.created_at,
    });
  } catch (err) {
    logger.error('Failed to get SwarmTeams signal', { error: String(err) });
    res.status(500).json({ error: 'Failed to get signal' });
  }
});

// =============================================================================
// ON-CHAIN ENDPOINTS
// =============================================================================

// GET /swarmteams/registry - Get on-chain registry state
router.get('/registry', async (_req: Request, res: Response) => {
  try {
    const { getSwarmTeamsClient, bytesToHex } = await import('../../swarmteams-stubs');
    const client = await getSwarmTeamsClient();
    const registry = await client.getRegistry();

    if (!registry) {
      return res.status(404).json({ error: 'Registry not initialized' });
    }

    res.json({
      epoch: registry.epoch.toString(),
      agentCount: registry.agentCount,
      agentsRoot: bytesToHex(new Uint8Array(registry.agentsRoot)),
      minStake: registry.minStake.toString(),
    });
  } catch (err) {
    logger.error('Failed to get registry', { error: String(err) });
    res.status(500).json({ error: 'Failed to get registry' });
  }
});

// GET /swarmteams/aggregator/:epoch - Get on-chain aggregator for epoch
router.get('/aggregator/:epoch', async (req: Request, res: Response) => {
  try {
    const { getSwarmTeamsClient } = await import('../../swarmteams-stubs');
    const { BN } = await import('@coral-xyz/anchor');
    const client = await getSwarmTeamsClient();
    const epoch = new BN(req.params.epoch);
    const aggregator = await client.getAggregator(epoch);

    if (!aggregator) {
      return res.status(404).json({ error: 'Aggregator not found for this epoch' });
    }

    const totalSignals = aggregator.totalSignals;
    res.json({
      epoch: req.params.epoch,
      totalSignals,
      longCount: aggregator.longCount,
      shortCount: aggregator.shortCount,
      neutralCount: aggregator.neutralCount,
      avgConfidence: totalSignals > 0 ? Math.round(aggregator.totalConfidence / totalSignals) : 0,
      avgMagnitude: totalSignals > 0 ? Math.round(aggregator.totalMagnitude / totalSignals) : 0,
    });
  } catch (err) {
    logger.error('Failed to get aggregator', { error: String(err) });
    res.status(500).json({ error: 'Failed to get aggregator' });
  }
});

// POST /swarmteams/signal/submit - Submit ZK signal on-chain
router.post('/signal/submit', async (req: Request, res: Response) => {
  try {
    const { proof, nullifier, commitment } = req.body;

    if (!proof?.a || !proof?.b || !proof?.c || !nullifier || !commitment) {
      return res.status(400).json({ error: 'Missing required fields: proof, nullifier, commitment' });
    }

    const { getSwarmTeamsClient, hexToBytes, getKeypair } = await import('../../swarmteams-stubs');
    const client = await getSwarmTeamsClient();
    const keypair = getKeypair();

    const tx = await client.submitSignal(
      keypair,
      {
        a: hexToBytes(proof.a),
        b: hexToBytes(proof.b),
        c: hexToBytes(proof.c),
      },
      hexToBytes(nullifier),
      hexToBytes(commitment)
    );

    res.json({ success: true, tx });
  } catch (err: any) {
    logger.error('Failed to submit signal', { error: String(err) });
    res.status(500).json({ error: err.message || 'Failed to submit signal' });
  }
});

// POST /swarmteams/swarm/create - Create swarm action on-chain
router.post('/swarm/create', async (req: Request, res: Response) => {
  try {
    const { proof, nullifier, actionHash, threshold } = req.body;

    if (!proof?.a || !proof?.b || !proof?.c || !nullifier || !actionHash) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { getSwarmTeamsClient, hexToBytes, getKeypair } = await import('../../swarmteams-stubs');
    const client = await getSwarmTeamsClient();
    const keypair = getKeypair();

    const tx = await client.createSwarmAction(
      keypair,
      {
        a: hexToBytes(proof.a),
        b: hexToBytes(proof.b),
        c: hexToBytes(proof.c),
      },
      hexToBytes(nullifier),
      hexToBytes(actionHash),
      threshold || 66
    );

    res.json({ success: true, tx });
  } catch (err: any) {
    logger.error('Failed to create swarm action', { error: String(err) });
    res.status(500).json({ error: err.message || 'Failed to create swarm action' });
  }
});

// GET /swarmteams/swarm/:actionHash - Get swarm action state
router.get('/swarm/:actionHash', async (req: Request, res: Response) => {
  try {
    const { getSwarmTeamsClient, hexToBytes, bytesToHex } = await import('../../swarmteams-stubs');
    const client = await getSwarmTeamsClient();
    const actionHash = hexToBytes(req.params.actionHash);
    const action = await client.getSwarmAction(actionHash);

    if (!action) {
      return res.status(404).json({ error: 'Swarm action not found' });
    }

    // Cast to any to handle IDL type mismatch
    const a = action as any;
    res.json({
      actionHash: bytesToHex(actionHash),
      votesFor: a.votesFor ?? 0,
      votesAgainst: a.votesAgainst ?? 0,
      weightedVotesFor: a.weightedVotesFor?.toString() ?? '0',
      weightedVotesAgainst: a.weightedVotesAgainst?.toString() ?? '0',
      totalVotes: a.totalVotes ?? 0,
      threshold: a.threshold ?? 0,
      executed: a.executed ?? false,
    });
  } catch (err) {
    logger.error('Failed to get swarm action', { error: String(err) });
    res.status(500).json({ error: 'Failed to get swarm action' });
  }
});

// POST /swarmteams/swarm/vote - Vote on swarm action
router.post('/swarm/vote', async (req: Request, res: Response) => {
  try {
    const { proof, voteNullifier, voteCommitment, actionHash } = req.body;

    if (!proof?.a || !proof?.b || !proof?.c || !voteNullifier || !voteCommitment || !actionHash) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { getSwarmTeamsClient, hexToBytes, getKeypair } = await import('../../swarmteams-stubs');
    const client = await getSwarmTeamsClient();
    const keypair = getKeypair();

    const tx = await client.voteSwarmAction(
      keypair,
      {
        a: hexToBytes(proof.a),
        b: hexToBytes(proof.b),
        c: hexToBytes(proof.c),
      },
      hexToBytes(voteNullifier),
      hexToBytes(voteCommitment),
      hexToBytes(actionHash)
    );

    res.json({ success: true, tx });
  } catch (err: any) {
    logger.error('Failed to vote on swarm action', { error: String(err) });
    res.status(500).json({ error: err.message || 'Failed to vote' });
  }
});

// POST /swarmteams/swarm/reveal - Reveal vote on swarm action
router.post('/swarm/reveal', async (req: Request, res: Response) => {
  try {
    const { actionHash, voteNullifier, voteValue, voteSalt } = req.body;

    if (!actionHash || !voteNullifier || voteValue === undefined || !voteSalt) {
      return res.status(400).json({ error: 'Missing required fields: actionHash, voteNullifier, voteValue, voteSalt' });
    }

    const { getSwarmTeamsClient, hexToBytes } = await import('../../swarmteams-stubs');
    const client = await getSwarmTeamsClient();

    const tx = await client.revealVote(
      hexToBytes(actionHash),
      hexToBytes(voteNullifier),
      Boolean(voteValue),
      hexToBytes(voteSalt)
    );

    res.json({ success: true, tx });
  } catch (err: any) {
    logger.error('Failed to reveal vote', { error: String(err) });
    res.status(500).json({ error: err.message || 'Failed to reveal vote' });
  }
});

// POST /swarmteams/signal/reveal - Reveal signal
router.post('/signal/reveal', async (req: Request, res: Response) => {
  try {
    const { commitment, signalType, direction, confidence, magnitude, stakeAmount, secret } = req.body;

    if (!commitment || signalType === undefined || direction === undefined ||
        confidence === undefined || magnitude === undefined || !stakeAmount || !secret) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { getSwarmTeamsClient, hexToBytes } = await import('../../swarmteams-stubs');
    const { BN } = await import('@coral-xyz/anchor');
    const client = await getSwarmTeamsClient();

    const tx = await client.revealSignal(
      hexToBytes(commitment),
      signalType,
      direction,
      confidence,
      magnitude,
      new BN(stakeAmount),
      hexToBytes(secret)
    );

    res.json({ success: true, tx });
  } catch (err: any) {
    logger.error('Failed to reveal signal', { error: String(err) });
    res.status(500).json({ error: err.message || 'Failed to reveal signal' });
  }
});

export default router;
