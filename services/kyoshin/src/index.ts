<<<<<<< HEAD
import { env } from './config.js';
=======
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config.js';
import { ProcessLock } from './lock.js';
>>>>>>> origin/kamiyo/kyoshin-exec-canary
import { KyoshinRuntime } from './runtime.js';
import { KyoshinServer } from './server.js';

async function main(): Promise<void> {
<<<<<<< HEAD
  const runtime = new KyoshinRuntime(env);

  const server = env.KYOSHIN_HTTP_ENABLED
    ? new KyoshinServer({
        host: env.KYOSHIN_HTTP_HOST,
        port: env.KYOSHIN_HTTP_PORT,
        token: env.KYOSHIN_HTTP_TOKEN,
        getStatus: () => runtime.getStatus(),
        getMetrics: () => runtime.getMetrics(),
      })
    : null;

  const shutdown = async (signal: string): Promise<void> => {
    try {
      console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', message: `received ${signal}, shutting down` }));
      if (server) await server.stop();
      await runtime.stop();
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', message: 'shutdown_failed', error: message }));
      process.exit(1);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  if (server) {
    await server.start();
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      message: 'kyoshin_http_started',
      host: env.KYOSHIN_HTTP_HOST,
      port: env.KYOSHIN_HTTP_PORT,
    }));
  }

  await runtime.start();

  if (env.KAMIYO_RUN_ONCE) {
    if (server) await server.stop();
    await runtime.stop();
=======
  const serviceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const lockPathRaw = env.KAMIYO_SINGLE_INSTANCE_LOCK_PATH ?? `${env.KAMIYO_DB_PATH}.lock`;
  const lockPath = path.isAbsolute(lockPathRaw) ? lockPathRaw : path.resolve(serviceDir, lockPathRaw);
  const lock = env.KAMIYO_SINGLE_INSTANCE_LOCK_ENABLED
    ? new ProcessLock(lockPath, { service: 'kyoshin-exec' })
    : null;
  let lockReleased = false;
  const releaseLock = (): void => {
    if (!lock || lockReleased) return;
    lock.release();
    lockReleased = true;
  };

  if (lock) {
    lock.acquire();
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        message: 'single_instance_lock_acquired',
        lockPath,
      })
    );
  }

  try {
    const runtime = new KyoshinRuntime(env);

    const server = env.KYOSHIN_HTTP_ENABLED
      ? new KyoshinServer({
          host: env.KYOSHIN_HTTP_HOST,
          port: env.KYOSHIN_HTTP_PORT,
          token: env.KYOSHIN_HTTP_TOKEN,
          getStatus: () => runtime.getStatus(),
          getMetrics: () => runtime.getMetrics(),
          enqueueIntakeJobs: payload => runtime.enqueueIntakeJobs(payload),
          listIntakeJobs: params => runtime.listIntakeJobs(params),
          getEconomicsSnapshot: () => runtime.getEconomicsSnapshot(),
        })
      : null;

    const shutdown = async (signal: string): Promise<void> => {
      try {
        console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', message: `received ${signal}, shutting down` }));
        if (server) await server.stop();
        await runtime.stop();
        releaseLock();
        process.exit(0);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', message: 'shutdown_failed', error: message }));
        releaseLock();
        process.exit(1);
      }
    };

    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });

    if (server) {
      await server.start();
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        message: 'kyoshin_http_started',
        host: env.KYOSHIN_HTTP_HOST,
        port: env.KYOSHIN_HTTP_PORT,
      }));
    }

    await runtime.start();

    if (env.KAMIYO_RUN_ONCE) {
      if (server) await server.stop();
      await runtime.stop();
      releaseLock();
    }
  } catch (error) {
    releaseLock();
    throw error;
>>>>>>> origin/kamiyo/kyoshin-exec-canary
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', message: 'runtime_boot_failed', error: message }));
  process.exit(1);
});
