import { Router, Request, Response } from 'express';
import { query } from '../db/pool';

interface DiscoveryRow {
  resource_url: string;
  created_at: Date;
}

function parsePageParam(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

async function loadDiscoveryRows(): Promise<DiscoveryRow[]> {
  return query<DiscoveryRow>(
    'SELECT resource_url, created_at FROM discovery_resources ORDER BY created_at DESC'
  );
}

export function createDiscoveryRouter(): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const rows = await loadDiscoveryRows();

      res.json({
        version: 2,
        count: rows.length,
        resources: rows.map((r) => r.resource_url),
      });
    } catch (err: any) {
      console.error('[discovery] failed to list resources', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/resources', async (req: Request, res: Response) => {
    try {
      const type = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : '';
      if (type && type !== 'http') {
        return res.json({
          x402Version: 2,
          items: [],
          pagination: { limit: 0, offset: 0, total: 0 },
        });
      }

      const rows = await loadDiscoveryRows();
      const offset = parsePageParam(req.query.offset, 0);
      const requestedLimit = parsePageParam(req.query.limit, 50);
      const limit = Math.min(Math.max(requestedLimit || 50, 1), 200);
      const items = rows.slice(offset, offset + limit).map((row) => ({
        resource: row.resource_url,
        type: 'http',
        x402Version: 2,
        accepts: [],
        lastUpdated: row.created_at,
      }));

      res.json({
        x402Version: 2,
        items,
        pagination: {
          limit,
          offset,
          total: rows.length,
        },
      });
    } catch (err: any) {
      console.error('[discovery] failed to list discovery resources', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
