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
import { meishiRouter } from './routes/meishi.js';
import { receiptsRouter } from './routes/receipts.js';
import { receiptService } from './services/receipts.js';

const app = new Hono();

const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_SWEEP_MS = 60_000;

function getClientIp(c: any): string {
  const xf = c.req.header('x-forwarded-for');
  const cf = c.req.header('cf-connecting-ip');
  const xr = c.req.header('x-real-ip');
  if (cf) return cf;
  if (xr) return xr;
  if (xf) return xf.split(',')[0].trim();
  return 'unknown';
}

function getRequestId(c: any): string {
  const existing = c.req.header('x-request-id');
  if (existing) return existing;
  // Prefer crypto.randomUUID when available
  const g = (globalThis as any).crypto?.randomUUID?.() ?? `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return g;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(ip);
  }
}, RATE_LIMIT_SWEEP_MS).unref?.();

app.use('*', async (c, next) => {
  const reqId = getRequestId(c);
  c.header('x-request-id', reqId);
  await next();
});

app.use('*', async (c, next) => {
  const ip = getClientIp(c);
  const now = Date.now();
  const entry = rateLimits.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else if (entry.count >= RATE_LIMIT_MAX) {
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

function parseAllowedOrigins(): string | string[] {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw || raw.trim() === '' || raw.trim() === '*') return '*';
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

app.use(
  '*',
  cors({
    origin: parseAllowedOrigins(),
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
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

app.get('/health', (c) => {
  c.header('cache-control', 'no-store');
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.route('/api/agents', agentsRouter);
app.route('/api/jobs', jobsRouter);
app.route('/api/earnings', earningsRouter);
app.route('/api/reputation', reputationRouter);
app.route('/api/meishi', meishiRouter);
app.route('/api/receipts', receiptsRouter);

app.onError((err, c) => {
  const status = (err as any)?.status && typeof (err as any).status === 'number' ? (err as any).status : 500;
  const message = status === 500 ? 'Internal server error' : (err as Error).message;
  const reqId = c.req.header('x-request-id');

  if (status === 500) {
    console.error('API Error:', { reqId, err });
  }

  return c.json({ error: message, requestId: reqId }, status);
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

const port = Math.min(65535, Math.max(1, parseInt(process.env.PORT || '3001', 10) || 3001));
console.log(`KEIRO API starting on port ${port}`);

process.on('uncaughtException', (e) => {
  console.error('Uncaught exception', e);
});
process.on('unhandledRejection', (e) => {
  console.error('Unhandled rejection', e);
});

process.on('SIGTERM', async () => {
  await receiptService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await receiptService.close();
  process.exit(0);
});

serve({ fetch: app.fetch, port });
