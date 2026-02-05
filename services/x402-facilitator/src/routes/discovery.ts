import { Router, Request, Response } from 'express';
import { query } from '../db/pool';

export function createDiscoveryRouter(): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const rows = await query<{ resource_url: string }>(
        'SELECT resource_url FROM discovery_resources ORDER BY created_at'
      );

      res.json({
        version: 1,
        resources: rows.map((r) => r.resource_url),
      });
    } catch (err: any) {
      console.error('[discovery] failed to list resources', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
