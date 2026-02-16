#!/usr/bin/env npx tsx

import 'dotenv/config';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { runPreflightChecks } from './preflight-check.js';
import { DeadlineTransactionOrchestrator } from '../src/campaigns/deadline-transaction.js';
import { MoltbookClient } from '../src/moltbook.js';
import { JobDatabase } from '../src/db.js';
import { JobPosterStrategy } from '../src/strategies/job-poster.js';
import { JobWorkerStrategy } from '../src/strategies/job-worker.js';
import { DirectNegotiationStrategy } from '../src/strategies/direct-negotiation.js';
import { SolTransferStrategy } from '../src/strategies/sol-transfer.js';
import { SelfEscrowStrategy } from '../src/strategies/self-escrow.js';
import type { StrategyConfig, Strategy, DeadlineConfig } from '../src/types.js';

const DEADLINE_MS = 48 * 60 * 60 * 1000;
const BUDGET_SOL = 0.02;
const POLL_INTERVAL_MS = 60_000;

async function main(): Promise<void> {
  console.log('========================================');
  console.log('  48-Hour Transaction Mission');
  console.log('========================================');
  console.log('');

  console.log('Preflight checks...');
  console.log('');

  const preflight = await runPreflightChecks();

  for (const c of preflight.checks) {
    const icon = c.pass ? '✓' : c.required ? '✗' : '○';
    const tag = c.required ? '' : ' (optional)';
    console.log(`  ${icon} ${c.name}${tag}: ${c.value}`);
  }
  console.log('');

  if (!preflight.pass) {
    console.error('Preflight FAILED. Fix required checks and retry.');
    process.exit(1);
  }

  console.log(`Viable strategies: ${preflight.viableStrategies.join(', ')}`);
  console.log('');

  const wallet = Keypair.fromSecretKey(bs58.decode(process.env.AGENT_PRIVATE_KEY!));

  const strategyConfig: StrategyConfig = {
    moltbookApiKey: process.env.MOLTBOOK_API_KEY!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    agentPrivateKey: process.env.AGENT_PRIVATE_KEY!,
    programId: process.env.KAMIYO_PROGRAM_ID || '3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr',
    treasuryAddress: process.env.TREASURY_ADDRESS,
    walletPublicKey: wallet.publicKey.toBase58(),
    budgetSol: BUDGET_SOL,
  };

  const deadlineConfig: DeadlineConfig = {
    deadlineMs: DEADLINE_MS,
    budgetSol: BUDGET_SOL,
    pollIntervalMs: POLL_INTERVAL_MS,
    strategyConfig,
  };

  const strategies: Strategy[] = [];
  const viable = new Set(preflight.viableStrategies);

  if (viable.has('job-poster')) {
    strategies.push(new JobPosterStrategy(strategyConfig));
  }
  if (viable.has('job-worker')) {
    strategies.push(new JobWorkerStrategy(strategyConfig));
  }
  if (viable.has('direct-negotiation')) {
    strategies.push(new DirectNegotiationStrategy(strategyConfig));
  }
  if (viable.has('sol-transfer')) {
    strategies.push(new SolTransferStrategy(strategyConfig));
  }
  if (viable.has('self-escrow')) {
    strategies.push(new SelfEscrowStrategy(strategyConfig));
  }

  if (strategies.length === 0) {
    console.error('No viable strategies. Cannot proceed.');
    process.exit(1);
  }

  const moltbook = new MoltbookClient(strategyConfig.moltbookApiKey);
  const db = new JobDatabase(process.env.DB_PATH || './mission-48h.db');

  console.log('Launching orchestrator...');
  console.log(`  Deadline: ${new Date(Date.now() + DEADLINE_MS).toISOString()}`);
  console.log(`  Strategies: ${strategies.map(s => s.name).join(', ')}`);
  console.log(`  Budget: ${BUDGET_SOL} SOL`);
  console.log(`  Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log('');

  const orchestrator = new DeadlineTransactionOrchestrator({
    config: deadlineConfig,
    strategies,
    moltbook,
    db,
  });

  const shutdown = (): void => {
    console.log('\nShutdown requested...');
    orchestrator.stop();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    const result = await orchestrator.run();

    if (result.success) {
      console.log('');
      console.log('MISSION SUCCESS');
      console.log(`  TX: ${result.result!.txHash}`);
      console.log(`  Amount: ${result.result!.amountSol} SOL`);
      console.log(`  Type: ${result.result!.paymentType}`);
      console.log(`  Elapsed: ${Math.round(result.elapsed / 60000)}m`);
      console.log(`  Strategies used: ${result.strategiesTriggered.join(', ')}`);
    } else {
      console.error('');
      console.error('MISSION FAILED');
      console.error(`  Error: ${result.error}`);
      console.error(`  Strategies tried: ${result.strategiesTriggered.join(', ')}`);
      process.exit(1);
    }
  } finally {
    db.close();
  }
}

main().catch(err => {
  console.error('Mission crashed:', err);
  process.exit(1);
});
