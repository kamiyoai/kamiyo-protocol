// Mitama API routes - ZK signal stats and demo trigger

import { Router, Request, Response } from 'express';
import { getMitamaSignals, getMitamaStats } from '../../db';
import { logger } from '../../logger';

const router = Router();

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
