// Standalone API server - runs without Twitter bot dependencies

import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import { logger } from './logger';
import { startApiServer } from './api';
import { startContextRefresh } from './crypto-context';

async function main(): Promise<void> {
  logger.info('Starting KAMIYO Companion API server (standalone mode)');

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Start crypto context refresh for market data
  startContextRefresh();

  // Start API server
  const port = parseInt(process.env.API_PORT || '3001', 10);
  startApiServer({ anthropic, port });

  logger.info('API server running', { port });
}

main().catch((err) => {
  logger.error('Fatal error', { error: String(err) });
  process.exit(1);
});
