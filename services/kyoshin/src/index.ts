import { env } from './config.js';
import { KyoshinRuntime } from './runtime.js';
import { KyoshinServer } from './server.js';

async function main(): Promise<void> {
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
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', message: 'runtime_boot_failed', error: message }));
  process.exit(1);
});
