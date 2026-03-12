// Standalone API server - runs without Twitter bot dependencies

import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import { logger } from './logger';
import { startApiServer } from './api';
import { getCompanionRuntimeState } from './runtime-profile';
import { startCoreRuntimeSupport, stopCoreRuntimeSupport } from './runtime-support';

async function main(): Promise<void> {
  logger.info('Starting KAMIYO Companion API server (standalone mode)');

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  const runtime = getCompanionRuntimeState();

  startCoreRuntimeSupport();

  // Start API server
  const port = parseInt(process.env.API_PORT || '3001', 10);
  startApiServer({ anthropic, port, runtime });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received. Shutting down standalone api server...`);
    stopCoreRuntimeSupport();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info('API server running', { port, profile: runtime.profile, routeSurface: runtime.routeSurface });
}

main().catch((err) => {
  logger.error('Fatal error', { error: String(err) });
  process.exit(1);
});
