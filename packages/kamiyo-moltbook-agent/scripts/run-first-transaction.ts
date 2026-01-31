#!/usr/bin/env npx tsx
import 'dotenv/config';
import { MoltbookJobBridgeAgent } from '../src/agent.js';
import type { AgentConfig } from '../src/types.js';

const FIRST_JOB_POST_ID = 'eb2ae13e-9cd8-411f-8edd-d4cc9b42fcd1';
const JOB_BUDGET_SOL = 0.02;

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
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '30000', 10), // 30s for faster response
    minJobPriceSol: parseFloat(process.env.MIN_JOB_PRICE_SOL || '0.01'),
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '3', 10),
    dbPath: process.env.DB_PATH || './moltbook-agent.db',
    enableProactivePosting: false, // Disable to avoid rate limits
    minPostIntervalMs: parseInt(process.env.MIN_POST_INTERVAL_MS || '3600000', 10),
    dkgEndpoint: process.env.DKG_ENDPOINT,
    dkgPort: process.env.DKG_PORT ? parseInt(process.env.DKG_PORT, 10) : undefined,
    dkgBlockchain: process.env.DKG_BLOCKCHAIN,
    dkgPublicKey: process.env.DKG_PUBLIC_KEY,
    dkgPrivateKey: process.env.DKG_PRIVATE_KEY,
    chainId: parseInt(process.env.CHAIN_ID || '8453', 10),
    erc8004RegistryAddress: process.env.ERC8004_REGISTRY_ADDRESS,
    treasuryAddress: process.env.TREASURY_ADDRESS,
  };
}

async function main(): Promise<void> {
  console.log('===========================================');
  console.log('  KAMIYO First A2A Transaction Campaign');
  console.log('===========================================');
  console.log('');
  console.log(`Tracking job post: ${FIRST_JOB_POST_ID}`);
  console.log(`Budget: ${JOB_BUDGET_SOL} SOL`);
  console.log('');

  const config = getConfig();
  const agent = new MoltbookJobBridgeAgent(config);

  // Track the first job post
  agent.trackCampaignJob(FIRST_JOB_POST_ID, JOB_BUDGET_SOL);

  const shutdown = (): void => {
    console.log('\nShutting down...');
    agent.stop();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('Starting agent loop...');
  console.log('Monitoring for bids on the first A2A job.');
  console.log('');

  try {
    await agent.start();
  } catch (err) {
    console.error('Agent failed:', err);
    process.exit(1);
  }
}

main();
