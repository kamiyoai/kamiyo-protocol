import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import {
  generateChallenge,
  verifySignature,
  generateApiKey,
  refreshApiKey,
} from '../auth.js';
import { logger } from '../../logger.js';

const router: IRouter = Router();

router.get('/challenge', (req: Request, res: Response) => {
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
    const { challenge, expiresAt } = generateChallenge(wallet);
    res.json({ challenge, expiresAt });
  } catch (err) {
    logger.error('Challenge generation failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to generate challenge' },
    });
  }
});

router.post('/verify', async (req: Request, res: Response) => {
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
          message: 'API access requires holding 1M+ tokens',
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

router.post('/refresh', async (req: Request, res: Response) => {
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
    generateChallenge(wallet);

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
          message: 'API access requires holding 1M+ tokens. Balance may have dropped.',
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
