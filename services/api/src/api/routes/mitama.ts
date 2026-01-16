// Mitama API routes - ZK signal stats and demo streaming

import { Router, Request, Response } from 'express';
import { getMitamaSignals, getMitamaStats } from '../../db';
import { logger } from '../../logger';
import { demoEvents, isDemoRunning, DemoLog } from '../../mitama-live-demo';

const router = Router();

// SSE endpoint for streaming demo logs
// GET /mitama/demo/stream
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
    logger.info('Demo stream client disconnected');
  });

  logger.info('Demo stream client connected');
});

// GET /mitama/demo/status - Check if demo is running
router.get('/demo/status', (_req: Request, res: Response) => {
  res.json({
    running: isDemoRunning(),
    streamUrl: '/api/mitama/demo/stream',
  });
});

// POST /mitama/demo/trigger - Start the demo (requires secret)
router.post('/demo/trigger', async (req: Request, res: Response) => {
  const secret = req.headers['x-demo-secret'] || req.body?.secret;
  const expectedSecret = process.env.DEMO_TRIGGER_SECRET || 'mitama-companion';

  if (secret !== expectedSecret) {
    return res.status(401).json({ error: 'Invalid secret' });
  }

  if (isDemoRunning()) {
    return res.status(409).json({ error: 'Demo already running' });
  }

  // Import and get twitter client
  const { getGlobalTwitter } = await import('../../index');
  const twitter = getGlobalTwitter();

  if (!twitter) {
    return res.status(503).json({ error: 'Twitter client not initialized' });
  }

  // Start demo in background
  const { runLiveDemo } = await import('../../mitama-live-demo');
  runLiveDemo(twitter).then(result => {
    logger.info('Demo triggered via API', { success: result.success, tweets: result.tweetIds.length });
  });

  res.json({
    started: true,
    streamUrl: '/api/mitama/demo/stream',
  });
});

// POST /mitama/reset-ratelimit - Force reset rate limiter (requires secret)
router.post('/reset-ratelimit', async (req: Request, res: Response) => {
  const secret = req.headers['x-demo-secret'] || req.body?.secret;
  const expectedSecret = process.env.DEMO_TRIGGER_SECRET || 'mitama-companion';

  if (secret !== expectedSecret) {
    return res.status(401).json({ error: 'Invalid secret' });
  }

  const { forceReset } = await import('../../rate-limiter');
  forceReset();

  res.json({ reset: true });
});

// GET /mitama/stats - Get aggregated signal statistics
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = getMitamaStats();
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
    logger.error('Failed to get Mitama stats', { error: String(err) });
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// GET /mitama/signals - Get recent signals (limited)
router.get('/signals', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const signals = getMitamaSignals(limit);

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
    logger.error('Failed to get Mitama signals', { error: String(err) });
    res.status(500).json({ error: 'Failed to get signals' });
  }
});

// GET /mitama/signal/:id - Get full signal details
router.get('/signal/:id', async (req: Request, res: Response) => {
  try {
    const signals = getMitamaSignals(100);
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
    logger.error('Failed to get Mitama signal', { error: String(err) });
    res.status(500).json({ error: 'Failed to get signal' });
  }
});

export default router;
