import { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const { NODE_ENV } = getConfig();
  if (NODE_ENV !== 'production') console.error('[error]', err.stack || err.message);
  else console.error('[error]', err.message);

  const msg = err.message || '';
  if (msg.includes('Invalid') || msg.includes('Missing')) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (msg.includes('not found') || msg.includes('Not found')) {
    res.status(404).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: 'Internal server error' });
}
