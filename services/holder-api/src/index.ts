import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { startApiServer } from './api/index.js';
import { startContextRefresh } from './crypto-context.js';
import { initProtocol } from './protocol.js';
import { initBlacklist } from './blacklist.js';
import { logger } from './logger.js';

async function main() {
  logger.info('Starting Holder API...');

  // Initialize blacklist for Blindfold verification
  initBlacklist();

  // Initialize protocol (ZK prover, SDK)
  await initProtocol();

  // Start market context refresh
  startContextRefresh();

  // Initialize Anthropic client
  const anthropic = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : undefined;

  if (!anthropic) {
    logger.warn('ANTHROPIC_API_KEY not set - chat endpoint disabled');
  }

  // Start API server
  startApiServer({ anthropic });
}

main().catch((err) => {
  logger.error('Failed to start', { error: String(err) });
  process.exit(1);
});
