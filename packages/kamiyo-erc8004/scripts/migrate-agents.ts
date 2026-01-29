#!/usr/bin/env npx ts-node

/**
 * Agent Migration Script
 *
 * Migrates agents from Hyperliquid to Base ERC-8004 Identity Registry
 *
 * Usage:
 *   npx ts-node scripts/migrate-agents.ts --agents 0x123,0x456 --dry-run
 *   npx ts-node scripts/migrate-agents.ts --file agents.txt
 */

import { ethers } from 'ethers';
import * as fs from 'fs';
import {
  AgentMigrator,
  IdentityRegistry,
  HyperliquidAdapter,
  CHAIN_CONFIGS,
  KamiyoTier,
} from '../src';

interface Config {
  baseRpcUrl: string;
  hyperliquidRpcUrl: string;
  baseIdentityRegistry: string;
  hyperliquidAdapter: string;
  privateKey: string;
}

function loadConfig(): Config {
  const config: Config = {
    baseRpcUrl: process.env.BASE_RPC_URL || CHAIN_CONFIGS['base-mainnet'].rpcUrl,
    hyperliquidRpcUrl:
      process.env.HYPERLIQUID_RPC_URL ||
      CHAIN_CONFIGS['hyperliquid-mainnet'].rpcUrl,
    baseIdentityRegistry: process.env.BASE_IDENTITY_REGISTRY || '',
    hyperliquidAdapter: process.env.HYPERLIQUID_ADAPTER || '',
    privateKey: process.env.PRIVATE_KEY || '',
  };

  if (!config.baseIdentityRegistry) {
    throw new Error('BASE_IDENTITY_REGISTRY environment variable required');
  }
  if (!config.hyperliquidAdapter) {
    throw new Error('HYPERLIQUID_ADAPTER environment variable required');
  }

  return config;
}

function parseArgs(): {
  agents: string[];
  dryRun: boolean;
  link: boolean;
  tier?: KamiyoTier;
  profileBaseURI?: string;
} {
  const args = process.argv.slice(2);
  let agents: string[] = [];
  let dryRun = false;
  let link = false;
  let tier: KamiyoTier | undefined;
  let profileBaseURI: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--agents':
        agents = args[++i].split(',').map((a) => a.trim());
        break;
      case '--file':
        const content = fs.readFileSync(args[++i], 'utf-8');
        agents = content
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('0x'));
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--link':
        link = true;
        break;
      case '--tier':
        const tierArg = args[++i].toLowerCase();
        tier =
          tierArg === 'bronze'
            ? KamiyoTier.Bronze
            : tierArg === 'silver'
              ? KamiyoTier.Silver
              : tierArg === 'gold'
                ? KamiyoTier.Gold
                : tierArg === 'platinum'
                  ? KamiyoTier.Platinum
                  : KamiyoTier.Unverified;
        break;
      case '--profile-uri':
        profileBaseURI = args[++i];
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  if (agents.length === 0) {
    console.error('Error: No agents specified. Use --agents or --file');
    printHelp();
    process.exit(1);
  }

  return { agents, dryRun, link, tier, profileBaseURI };
}

function printHelp(): void {
  console.log(`
Agent Migration Script

Usage:
  npx ts-node scripts/migrate-agents.ts [options]

Options:
  --agents <addresses>   Comma-separated list of agent addresses
  --file <path>          File containing agent addresses (one per line)
  --dry-run              Simulate migration without sending transactions
  --link                 Link agents on Hyperliquid after migration
  --tier <tier>          Default tier (unverified|bronze|silver|gold|platinum)
  --profile-uri <uri>    Base URI for agent profiles
  --help                 Show this help message

Environment Variables:
  BASE_RPC_URL            Base chain RPC URL
  HYPERLIQUID_RPC_URL     Hyperliquid RPC URL
  BASE_IDENTITY_REGISTRY  Address of Base identity registry
  HYPERLIQUID_ADAPTER     Address of Hyperliquid adapter
  PRIVATE_KEY             Private key for signing transactions

Examples:
  # Dry run for specific agents
  npx ts-node scripts/migrate-agents.ts --agents 0x123,0x456 --dry-run

  # Migrate from file with linking
  npx ts-node scripts/migrate-agents.ts --file agents.txt --link

  # Migrate with tier assignment
  npx ts-node scripts/migrate-agents.ts --agents 0x123 --tier gold
`);
}

async function main(): Promise<void> {
  console.log('ERC-8004 Agent Migration Script\n');

  const { agents, dryRun, link, tier, profileBaseURI } = parseArgs();

  if (dryRun) {
    console.log('DRY RUN MODE - No transactions will be sent\n');
  }

  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    if (dryRun) {
      console.log('Using mock configuration for dry run...\n');
      config = {
        baseRpcUrl: CHAIN_CONFIGS['base-mainnet'].rpcUrl,
        hyperliquidRpcUrl: CHAIN_CONFIGS['hyperliquid-mainnet'].rpcUrl,
        baseIdentityRegistry: '0x0000000000000000000000000000000000000001',
        hyperliquidAdapter: '0x0000000000000000000000000000000000000002',
        privateKey: '',
      };
    } else {
      throw error;
    }
  }

  const baseProvider = new ethers.JsonRpcProvider(config.baseRpcUrl);
  const hyperliquidProvider = new ethers.JsonRpcProvider(
    config.hyperliquidRpcUrl
  );

  let baseSigner: ethers.Signer;
  let hyperliquidSigner: ethers.Signer;

  if (dryRun) {
    baseSigner = baseProvider as unknown as ethers.Signer;
    hyperliquidSigner = hyperliquidProvider as unknown as ethers.Signer;
  } else {
    if (!config.privateKey) {
      throw new Error('PRIVATE_KEY environment variable required for live run');
    }
    baseSigner = new ethers.Wallet(config.privateKey, baseProvider);
    hyperliquidSigner = new ethers.Wallet(config.privateKey, hyperliquidProvider);
  }

  const identityRegistry = new IdentityRegistry(
    config.baseIdentityRegistry,
    dryRun ? baseProvider : baseSigner,
    CHAIN_CONFIGS['base-mainnet'].chainId
  );

  const hyperliquidAdapter = new HyperliquidAdapter(
    config.hyperliquidAdapter,
    dryRun ? hyperliquidProvider : hyperliquidSigner
  );

  const migrator = new AgentMigrator(identityRegistry, hyperliquidAdapter);

  console.log(`Migrating ${agents.length} agent(s)...\n`);

  const results = await migrator.migrateAgents(agents, {
    dryRun,
    defaultTier: tier,
    profileBaseURI,
    onProgress: (current, total, result) => {
      const status = result.success ? 'OK' : 'FAILED';
      console.log(
        `[${current}/${total}] ${result.sourceAddress}: ${status}` +
          (result.globalId ? ` -> ${result.globalId}` : '') +
          (result.error ? ` (${result.error})` : '')
      );
    },
  });

  console.log('\n--- Summary ---');
  console.log(`Total:      ${results.total}`);
  console.log(`Successful: ${results.successful}`);
  console.log(`Failed:     ${results.failed}`);

  if (link && results.successful > 0 && !dryRun) {
    console.log('\nLinking agents on Hyperliquid...');

    for (const result of results.results) {
      if (result.success && result.globalId) {
        try {
          await migrator.linkMigratedAgent(result.sourceAddress, result.globalId);
          console.log(`Linked: ${result.sourceAddress} -> ${result.globalId}`);
        } catch (error) {
          console.error(
            `Failed to link ${result.sourceAddress}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }

  if (results.failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
