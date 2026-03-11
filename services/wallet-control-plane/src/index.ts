import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { timing } from 'hono/timing';
import { inspect } from 'node:util';

import { getConfig, getRedactedConfig, validateConfig } from './config.js';
import { runMigrations } from './db/migrate.js';
import { closePool } from './db/pool.js';
import { agentsRouter } from './routes/agents.js';
import { endUsersRouter } from './routes/end-users.js';
import { mandatesRouter } from './routes/mandates.js';

function writeLog(stream: NodeJS.WriteStream, message: string, detail?: unknown): void {
  if (detail === undefined) {
    stream.write(`${message}\n`);
    return;
  }

  const serialized = typeof detail === 'string' ? detail : inspect(detail, { depth: null, breakLength: Infinity });
  stream.write(`${message} ${serialized}\n`);
}

function logInfo(message: string, detail?: unknown): void {
  writeLog(process.stdout, message, detail);
}

function logWarn(message: string, detail?: unknown): void {
  writeLog(process.stderr, message, detail);
}

function logError(message: string, detail?: unknown): void {
  writeLog(process.stderr, message, detail);
}

async function main() {
  const validation = validateConfig();
  for (const warning of validation.warnings) logWarn(`[config] ${warning}`);
  if (!validation.valid) {
    logError('[config] Invalid configuration:');
    for (const err of validation.errors) logError(`  - ${err}`);
    process.exit(1);
  }

  const config = getConfig();
  logInfo('[init] config loaded', getRedactedConfig());

  await runMigrations();
  logInfo('[init] database ready');

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
    logError('[error]', err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  const server = serve({
    fetch: app.fetch,
    port: config.PORT,
  });

  logInfo(`[init] wallet-control-plane listening on :${config.PORT}`);

  async function shutdown(signal: string) {
    logInfo(`[shutdown] ${signal} received`);
    server.close?.();
    await closePool();
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logError('[fatal]', err);
  process.exit(1);
});
