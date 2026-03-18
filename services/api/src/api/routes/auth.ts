// Auth routes: challenge generation and verification

import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import {
  generateChallenge,
  verifySignature,
  generateApiKey,
  refreshApiKey,
  generateWalletToken,
  isJwtAuthConfigured,
} from '../auth';
import { logger } from '../../logger';

const router: IRouter = Router();

function sendAuthDisabled(res: Response): void {
  res.status(503).json({
    error: {
      code: 'AUTH_DISABLED',
      message: 'Wallet authentication is not configured.',
    },
  });
}

// GET /api/auth/challenge?wallet=<pubkey>
router.get('/challenge', (req: Request, res: Response) => {
  if (!isJwtAuthConfigured()) {
    sendAuthDisabled(res);
    return;
  }

  const wallet = req.query.wallet as string;

  if (!wallet || wallet.length < 32 || wallet.length > 44) {
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Invalid wallet address',
      },
    });
    return;
  }

  try {
    const result = generateChallenge(wallet);
    if (!result) {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many challenge requests. Please wait and try again.',
        },
      });
      return;
    }
    res.json({ challenge: result.challenge, expiresAt: result.expiresAt });
  } catch (err) {
    logger.error('Challenge generation failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to generate challenge' },
    });
  }
});

// POST /api/auth/verify
router.post('/verify', async (req: Request, res: Response) => {
  if (!isJwtAuthConfigured()) {
    sendAuthDisabled(res);
    return;
  }

  const { wallet, signature } = req.body;

  if (!wallet || !signature) {
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Missing wallet or signature',
      },
    });
    return;
  }

  try {
    const result = await verifySignature(wallet, signature);
    if (!result.valid) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: result.error },
      });
      return;
    }

    const apiKeyResult = await generateApiKey(wallet);
    if (!apiKeyResult) {
      res.status(403).json({
        error: {
          code: 'INSUFFICIENT_BALANCE',
          message: 'API access requires holding 1M+ $KAMIYO tokens',
        },
      });
      return;
    }

    res.json(apiKeyResult);
  } catch (err) {
    logger.error('Verification failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Verification failed' },
    });
  }
});

// POST /api/auth/wallet - wallet-only auth (no token balance required)
router.post('/wallet', async (req: Request, res: Response) => {
  if (!isJwtAuthConfigured()) {
    sendAuthDisabled(res);
    return;
  }

  const { wallet, signature } = req.body;

  if (!wallet || !signature) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'Missing wallet or signature' },
    });
    return;
  }

  try {
    const result = await verifySignature(wallet, signature);
    if (!result.valid) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: result.error },
      });
      return;
    }

    const token = generateWalletToken(wallet);
    res.json({ token, wallet });
  } catch (err) {
    logger.error('Wallet auth failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Authentication failed' },
    });
  }
});

// POST /api/auth/refresh
// Note: Client must request /challenge first, sign it, then call /refresh with signature
router.post('/refresh', async (req: Request, res: Response) => {
  if (!isJwtAuthConfigured()) {
    sendAuthDisabled(res);
    return;
  }

  const { wallet, signature } = req.body;

  if (!wallet || !signature) {
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Missing wallet or signature',
      },
    });
    return;
  }

  try {
    // Verify the signature against the current challenge
    const result = await verifySignature(wallet, signature);
    if (!result.valid) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: result.error },
      });
      return;
    }

    const apiKeyResult = await refreshApiKey(wallet);
    if (!apiKeyResult) {
      res.status(403).json({
        error: {
          code: 'INSUFFICIENT_BALANCE',
          message: 'API access requires holding 1M+ $KAMIYO tokens. Balance may have dropped.',
        },
      });
      return;
    }

    res.json(apiKeyResult);
  } catch (err) {
    logger.error('Refresh failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Refresh failed' },
    });
  }
});

export default router;
