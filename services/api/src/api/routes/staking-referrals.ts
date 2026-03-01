import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware';
import {
  bindStakingReferralAttribution,
  createStakingReferralInviteForWallet,
  getStakingReferralAdminSummary,
  getStakingReferralDashboard,
  getStakingReferralLeaderboard,
  getStakingReferralOperationalStatus,
  getStakingReferralRules,
  runStakingReferralPayout,
  verifyStakingReferralAdminToken,
} from '../../staking-referrals';

const router = Router();

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

function getWallet(req: Request): string | null {
  const wallet = req.auth?.wallet?.trim();
  return wallet || null;
}

router.get('/rules', (_req, res) => {
  res.json(getStakingReferralRules());
});

router.get('/leaderboard', (req, res) => {
  const windowParam = req.query.window;
  const limitParam = req.query.limit;

  const window =
    windowParam === '30d' || windowParam === 'all' || windowParam === '7d'
      ? windowParam
      : '7d';

  const parsedLimit = Number.parseInt(String(limitParam || '50'), 10);
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;

  res.json(getStakingReferralLeaderboard({ window, limit }));
});

router.post('/invites', authMiddleware, async (req, res) => {
  const wallet = getWallet(req);
  if (!wallet) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Wallet auth required');
  }

  try {
    const invite = await createStakingReferralInviteForWallet(wallet);
    res.status(201).json(invite);
  } catch (error) {
    sendError(
      res,
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Failed to create invite'
    );
  }
});

router.post('/attributions', authMiddleware, async (req, res) => {
  const wallet = getWallet(req);
  if (!wallet) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Wallet auth required');
  }

  const inviteCode = typeof req.body?.inviteCode === 'string' ? req.body.inviteCode.trim() : '';
  if (!inviteCode) {
    return sendError(res, 400, 'INVALID_INPUT', 'inviteCode is required');
  }

  try {
    const result = await bindStakingReferralAttribution({
      inviteCode,
      refereeWalletRaw: wallet,
      ip: req.ip,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    });

    if (result.status === 'rejected') {
      return res.status(409).json(result);
    }

    res.json(result);
  } catch (error) {
    sendError(
      res,
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Failed to bind attribution'
    );
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  const wallet = getWallet(req);
  if (!wallet) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Wallet auth required');
  }

  try {
    const dashboard = await getStakingReferralDashboard(wallet);
    res.json(dashboard);
  } catch (error) {
    sendError(
      res,
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Failed to load dashboard'
    );
  }
});

router.get('/status', (_req, res) => {
  res.json(getStakingReferralOperationalStatus());
});

router.post('/admin/payouts/run', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;

  if (!verifyStakingReferralAdminToken(token)) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Invalid admin token');
  }

  const weekStartUtc = typeof req.body?.weekStartUtc === 'string' ? req.body.weekStartUtc.trim() : undefined;
  const force = req.body?.force === true;

  try {
    const payout = await runStakingReferralPayout({
      weekStartUtc,
      executeTransfers: true,
      force,
    });

    res.json({
      ...payout,
      summary: getStakingReferralAdminSummary(50),
    });
  } catch (error) {
    sendError(
      res,
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Payout run failed'
    );
  }
});

export default router;
