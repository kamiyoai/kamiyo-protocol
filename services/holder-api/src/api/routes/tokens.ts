import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { lookupToken, formatTokenData } from '../../crypto-context.js';
import { logger } from '../../logger.js';

const router: IRouter = Router();

router.get('/:query', async (req: Request, res: Response) => {
  const { query } = req.params;

  if (!query || query.length < 2) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'Query must be at least 2 characters' },
    });
    return;
  }

  try {
    const token = await lookupToken(query);

    if (!token) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Token not found: ${query}` },
      });
      return;
    }

    res.json(token);
  } catch (err) {
    logger.error('Token lookup failed', { query, error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Token lookup failed' },
    });
  }
});

router.get('/:query/formatted', async (req: Request, res: Response) => {
  const { query } = req.params;

  if (!query || query.length < 2) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'Query must be at least 2 characters' },
    });
    return;
  }

  try {
    const token = await lookupToken(query);

    if (!token) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Token not found: ${query}` },
      });
      return;
    }

    res.json({
      ...token,
      formatted: formatTokenData(token),
    });
  } catch (err) {
    logger.error('Token lookup failed', { query, error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Token lookup failed' },
    });
  }
});

export default router;
