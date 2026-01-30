#!/usr/bin/env node

import 'dotenv/config';
import { MoltbookJobBridgeAgent } from './agent.js';
import type { AgentConfig } from './types.js';

function getConfig(): AgentConfig {
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) {
      console.error(`Missing required env var: ${name}`);
      process.exit(1);
    }
    return value;
  };

  return {
    moltbookApiKey: required('MOLTBOOK_API_KEY'),
    anthropicApiKey: required('ANTHROPIC_API_KEY'),
    agentPrivateKey: required('AGENT_PRIVATE_KEY'),
    solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    programId: process.env.KAMIYO_PROGRAM_ID || '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM',
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '60000', 10),
    minJobPriceSol: parseFloat(process.env.MIN_JOB_PRICE_SOL || '0.01'),
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '3', 10),
    dbPath: process.env.DB_PATH || './moltbook-agent.db',
  };
}

async function main(): Promise<void> {
  console.log('Moltbook Job Bridge Agent');
  console.log('========================');
  console.log('');

  const config = getConfig();

  console.log('Config:');
  console.log(`  RPC: ${config.solanaRpcUrl}`);
  console.log(`  Program: ${config.programId}`);
  console.log(`  Poll interval: ${config.pollIntervalMs}ms`);
  console.log(`  Min job price: ${config.minJobPriceSol} SOL`);
  console.log(`  Max concurrent: ${config.maxConcurrentJobs}`);
  console.log(`  DB: ${config.dbPath}`);
  console.log('');

  const agent = new MoltbookJobBridgeAgent(config);

  // Handle shutdown
  const shutdown = (): void => {
    console.log('\nShutting down...');
    agent.stop();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await agent.start();
  } catch (err) {
    console.error('Agent failed:', err);
    process.exit(1);
  }
}

main();
