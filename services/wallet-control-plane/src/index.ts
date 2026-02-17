import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { timing } from 'hono/timing';

import { getConfig, getRedactedConfig, validateConfig } from './config.js';
import { runMigrations } from './db/migrate.js';
import { closePool } from './db/pool.js';
import { agentsRouter } from './routes/agents.js';
import { endUsersRouter } from './routes/end-users.js';
import { mandatesRouter } from './routes/mandates.js';

async function main() {
  const validation = validateConfig();
  for (const warning of validation.warnings) console.warn(`[config] ${warning}`);
  if (!validation.valid) {
    console.error('[config] Invalid configuration:');
    for (const err of validation.errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  const config = getConfig();
  console.log('[init] config loaded', getRedactedConfig());

  await runMigrations();
  console.log('[init] database ready');

  const app = new Hono();

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
      name: 'wallet-control-plane',
      status: 'ok',
    })
  );

  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  app.route('/', agentsRouter);
  app.route('/', endUsersRouter);
  app.route('/', mandatesRouter);

  app.onError((err, c) => {
    console.error('[error]', err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  const server = serve({
    fetch: app.fetch,
    port: config.PORT,
  });

  console.log(`[init] wallet-control-plane listening on :${config.PORT}`);

  async function shutdown(signal: string) {
    console.log(`[shutdown] ${signal} received`);
    server.close?.();
    await closePool();
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
