// Buyback API routes - stats, config, manual trigger

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../../logger';
import { getBuybackService } from '../../buyback-service';

const router = Router();

const ADMIN_SECRET = process.env.BUYBACK_ADMIN_SECRET || '';

// Rate limiter for admin endpoints - 10 requests per minute
const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many admin requests. Please try again later.',
    },
  },
  keyGenerator: () => 'buyback-admin', // Single bucket for all admin requests
});

function requireAdmin(req: Request, res: Response): boolean {
  if (!ADMIN_SECRET) {
    res.status(503).json({ error: 'Admin endpoint not configured' });
    return false;
  }
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${ADMIN_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// GET /buyback/config - Current configuration
router.get('/config', (_req: Request, res: Response) => {
  try {
    const service = getBuybackService();
    const config = service.getConfig();
    res.json({
      minThresholdLamports: config.minThresholdLamports,
      minThresholdSol: config.minThresholdLamports / 1e9,
      maxSlippageBps: config.maxSlippageBps,
      maxSlippagePercent: config.maxSlippageBps / 100,
      cooldownSeconds: config.cooldownSeconds,
      cooldownHours: config.cooldownSeconds / 3600,
      burnBps: config.burnBps,
      burnPercent: config.burnBps / 100,
      isPaused: config.isPaused,
      lastBuybackAt: config.lastBuybackAt,
    });
  } catch (err) {
    logger.error('Failed to get buyback config', { error: String(err) });
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// GET /buyback/stats - Cumulative statistics
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const service = getBuybackService();
    const stats = service.getStats();
    const config = service.getConfig();

    res.json({
      totalSolSpent: stats.totalSolSpent,
      totalSolSpentFormatted: `${(stats.totalSolSpent / 1e9).toFixed(4)} SOL`,
      totalKamiyoPurchased: stats.totalKamiyoPurchased,
      totalKamiyoBurned: stats.totalKamiyoBurned,
      totalKamiyoToStaking: stats.totalKamiyoToStaking,
      buybackCount: stats.buybackCount,
      lastBuybackAt: stats.lastBuybackAt,
      burnBps: config.burnBps,
      stakingBps: 10000 - config.burnBps,
    });
  } catch (err) {
    logger.error('Failed to get buyback stats', { error: String(err) });
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// GET /buyback/history - Recent buyback records
router.get('/history', (req: Request, res: Response) => {
  try {
    const service = getBuybackService();
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const records = service.getHistory(limit, offset);

    res.json({
      records: records.map(r => ({
        id: r.id,
        solSpent: r.sol_spent,
        solSpentFormatted: `${(r.sol_spent / 1e9).toFixed(4)} SOL`,
        kamiyoPurchased: r.kamiyo_purchased,
        kamiyoBurned: r.kamiyo_burned,
        kamiyoToStaking: r.kamiyo_to_staking,
        swapSignature: r.swap_signature,
        burnSignature: r.burn_signature,
        stakingSignature: r.staking_signature,
        status: r.status,
        error: r.error,
        createdAt: r.created_at,
      })),
      pagination: { limit, offset, hasMore: records.length === limit },
    });
  } catch (err) {
    logger.error('Failed to get buyback history', { error: String(err) });
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// GET /buyback/balance - Current treasury balance
router.get('/balance', async (_req: Request, res: Response) => {
  try {
    const service = getBuybackService();
    const balance = await service.getTreasuryBalance();
    const config = service.getConfig();

    res.json({
      balanceLamports: balance,
      balanceSol: balance / 1e9,
      thresholdLamports: config.minThresholdLamports,
      thresholdSol: config.minThresholdLamports / 1e9,
      aboveThreshold: balance >= config.minThresholdLamports,
    });
  } catch (err) {
    logger.error('Failed to get treasury balance', { error: String(err) });
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// POST /buyback/trigger - Manual trigger (admin only)
router.post('/trigger', adminRateLimiter, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const service = getBuybackService();
    const result = await service.checkAndExecute();

    if (result.executed) {
      res.json({
        success: true,
        record: result.record,
      });
    } else {
      res.json({
        success: false,
        reason: result.reason,
      });
    }
  } catch (err) {
    logger.error('Manual buyback trigger failed', { error: String(err) });
    res.status(500).json({ error: 'Trigger failed' });
  }
});

// POST /buyback/pause - Pause buybacks (admin only)
router.post('/pause', adminRateLimiter, (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const service = getBuybackService();
    service.pause();
    res.json({ success: true, isPaused: true });
  } catch (err) {
    logger.error('Failed to pause buyback', { error: String(err) });
    res.status(500).json({ error: 'Failed to pause' });
  }
});

// POST /buyback/resume - Resume buybacks (admin only)
router.post('/resume', adminRateLimiter, (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const service = getBuybackService();
    service.unpause();
    res.json({ success: true, isPaused: false });
  } catch (err) {
    logger.error('Failed to resume buyback', { error: String(err) });
    res.status(500).json({ error: 'Failed to resume' });
  }
});

// PATCH /buyback/config - Update configuration (admin only)
router.patch('/config', adminRateLimiter, (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const service = getBuybackService();
    const { minThresholdLamports, maxSlippageBps, cooldownSeconds, burnBps } = req.body;

    service.updateConfig({
      minThresholdLamports,
      maxSlippageBps,
      cooldownSeconds,
      burnBps,
    });

    res.json({ success: true, config: service.getConfig() });
  } catch (err) {
    logger.error('Failed to update buyback config', { error: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

// GET /buyback/failed - List failed records (admin only)
router.get('/failed', adminRateLimiter, (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const service = getBuybackService();
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const records = service.getFailedRecords(limit);

    res.json({
      records: records.map(r => ({
        id: r.id,
        solSpent: r.sol_spent,
        solSpentFormatted: `${(r.sol_spent / 1e9).toFixed(4)} SOL`,
        status: r.status,
        error: r.error,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    logger.error('Failed to get failed buybacks', { error: String(err) });
    res.status(500).json({ error: 'Failed to get failed records' });
  }
});

// POST /buyback/retry/:id - Retry a failed buyback (admin only)
router.post('/retry/:id', adminRateLimiter, async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const service = getBuybackService();
    const recordId = parseInt(req.params.id, 10);

    if (isNaN(recordId)) {
      res.status(400).json({ error: 'Invalid record ID' });
      return;
    }

    const result = await service.retryRecord(recordId);

    if (result.success) {
      res.json({
        success: true,
        record: result.record,
      });
    } else {
      res.json({
        success: false,
        reason: result.reason,
      });
    }
  } catch (err) {
    logger.error('Buyback retry failed', { error: String(err) });
    res.status(500).json({ error: 'Retry failed' });
  }
});

export default router;
