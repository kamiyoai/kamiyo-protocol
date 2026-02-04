import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { timing } from 'hono/timing';

import { agentsRouter } from './routes/agents.js';
import { jobsRouter } from './routes/jobs.js';
import { earningsRouter } from './routes/earnings.js';
import { reputationRouter } from './routes/reputation.js';

const app = new Hono();

const rateLimits = new Map<string, { count: number; resetAt: number }>();

app.use('*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0] || 'unknown';
  const now = Date.now();
  const entry = rateLimits.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
  } else if (entry.count >= 100) {
    c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return c.json({ error: 'Rate limit exceeded' }, 429);
  } else {
    entry.count++;
  }

  await next();
});

app.use('*', async (c, next) => {
  const len = c.req.header('content-length');
  if (len && parseInt(len, 10) > 1_048_576) return c.json({ error: 'Request too large' }, 413);
  await next();
});

app.use('*', secureHeaders());
app.use('*', timing());
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);

app.get('/', (c) =>
  c.json({
    name: 'KEIRO API',
    version: '0.0.1',
    status: 'healthy',
  })
);

app.get('/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() })
);

app.route('/api/agents', agentsRouter);
app.route('/api/jobs', jobsRouter);
app.route('/api/earnings', earningsRouter);
app.route('/api/reputation', reputationRouter);

app.onError((err, c) => {
  const status = 'status' in err && typeof err.status === 'number' ? err.status : 500;
  const message = status === 500 ? 'Internal server error' : err.message;

  if (status === 500) {
    console.error('API Error:', err);
  }

  return c.json({ error: message }, status as any);
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

const port = Math.min(65535, Math.max(1, parseInt(process.env.PORT || '3001', 10) || 3001));
console.log(`KEIRO API starting on port ${port}`);

serve({ fetch: app.fetch, port });
