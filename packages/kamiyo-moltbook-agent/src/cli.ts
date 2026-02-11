#!/usr/bin/env node

import 'dotenv/config';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { MoltbookJobBridgeAgent } from './agent.js';
import { KamiyoHive } from '@kamiyo/hive';
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
    // Phase 1: Proactive posting
    enableProactivePosting: process.env.ENABLE_PROACTIVE_POSTING === 'true',
    minPostIntervalMs: parseInt(process.env.MIN_POST_INTERVAL_MS || '3600000', 10),
    // Phase 4: DKG + Identity
    dkgEndpoint: process.env.DKG_ENDPOINT,
    dkgPort: process.env.DKG_PORT ? parseInt(process.env.DKG_PORT, 10) : undefined,
    dkgBlockchain: process.env.DKG_BLOCKCHAIN,
    dkgPublicKey: process.env.DKG_PUBLIC_KEY,
    dkgPrivateKey: process.env.DKG_PRIVATE_KEY,
    chainId: parseInt(process.env.CHAIN_ID || '8453', 10),
    erc8004RegistryAddress: process.env.ERC8004_REGISTRY_ADDRESS,
    // Escrow treasury
    treasuryAddress: process.env.TREASURY_ADDRESS,
  };
}

function createHive(config: AgentConfig): KamiyoHive | undefined {
  try {
    const secretKey = bs58.decode(config.agentPrivateKey);
    const keypair = Keypair.fromSecretKey(secretKey);
    const connection = new Connection(config.solanaRpcUrl, 'confirmed');

    const hive = new KamiyoHive({
      keypair,
      connection,
      programId: config.programId,
      apiEndpoint: process.env.KAMIYO_API_ENDPOINT,
    });

    console.log('[Hive] Agent-to-agent hiring enabled');
    return hive;
  } catch (err) {
    console.warn('[Hive] Failed to initialize:', err instanceof Error ? err.message : err);
    console.warn('[Hive] Subcontracting will be disabled');
    return undefined;
  }
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
  console.log(`  Proactive posting: ${config.enableProactivePosting}`);
  console.log(`  DKG: ${config.dkgEndpoint || 'disabled'}`);
  console.log(`  Chain ID: ${config.chainId}`);
  console.log('');

  const hive = createHive(config);
  const agent = new MoltbookJobBridgeAgent(config, hive);

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
