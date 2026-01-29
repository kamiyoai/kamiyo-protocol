#!/usr/bin/env npx ts-node

/**
 * Agent Resolution Script
 *
 * Resolves agent identities across chains using global ID
 *
 * Usage:
 *   npx ts-node scripts/resolve-agent.ts eip155:8453:0x123...abc:1
 *   npx ts-node scripts/resolve-agent.ts --address 0x123 --chain hyperliquid
 */

import { ethers } from 'ethers';
import {
  CrossChainResolver,
  parseGlobalId,
  isValidGlobalId,
  CHAIN_CONFIGS,
  KamiyoTier,
  ChainType,
} from '../src';

interface Config {
  baseRpcUrl: string;
  hyperliquidRpcUrl: string;
  monadRpcUrl: string;
  baseIdentityRegistry?: string;
  hyperliquidAdapter?: string;
  monadMirror?: string;
}

function loadConfig(): Config {
  return {
    baseRpcUrl: process.env.BASE_RPC_URL || CHAIN_CONFIGS['base-mainnet'].rpcUrl,
    hyperliquidRpcUrl:
      process.env.HYPERLIQUID_RPC_URL ||
      CHAIN_CONFIGS['hyperliquid-mainnet'].rpcUrl,
    monadRpcUrl:
      process.env.MONAD_RPC_URL || CHAIN_CONFIGS['monad-mainnet'].rpcUrl,
    baseIdentityRegistry: process.env.BASE_IDENTITY_REGISTRY,
    hyperliquidAdapter: process.env.HYPERLIQUID_ADAPTER,
    monadMirror: process.env.MONAD_MIRROR,
  };
}

function parseArgs(): {
  globalId?: string;
  address?: string;
  chain?: ChainType;
  json: boolean;
} {
  const args = process.argv.slice(2);
  let globalId: string | undefined;
  let address: string | undefined;
  let chain: ChainType | undefined;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--address') {
      address = args[++i];
    } else if (arg === '--chain') {
      chain = args[++i] as ChainType;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('eip155:')) {
      globalId = arg;
    }
  }

  if (!globalId && !address) {
    console.error('Error: Provide a global ID or --address with --chain');
    printHelp();
    process.exit(1);
  }

  if (address && !chain) {
    console.error('Error: --chain required when using --address');
    process.exit(1);
  }

  return { globalId, address, chain, json };
}

function printHelp(): void {
  console.log(`
Agent Resolution Script

Usage:
  npx ts-node scripts/resolve-agent.ts <global-id>
  npx ts-node scripts/resolve-agent.ts --address <address> --chain <chain>

Options:
  --address <address>    Agent address to resolve
  --chain <chain>        Chain to look up address (base|hyperliquid|monad)
  --json                 Output as JSON
  --help                 Show this help message

Environment Variables:
  BASE_RPC_URL            Base chain RPC URL
  HYPERLIQUID_RPC_URL     Hyperliquid RPC URL
  MONAD_RPC_URL           Monad RPC URL
  BASE_IDENTITY_REGISTRY  Address of Base identity registry
  HYPERLIQUID_ADAPTER     Address of Hyperliquid adapter
  MONAD_MIRROR            Address of Monad identity mirror

Examples:
  # Resolve by global ID
  npx ts-node scripts/resolve-agent.ts eip155:8453:0x123...abc:1

  # Resolve by address on Hyperliquid
  npx ts-node scripts/resolve-agent.ts --address 0x123 --chain hyperliquid

  # Output as JSON
  npx ts-node scripts/resolve-agent.ts eip155:8453:0x123...abc:1 --json
`);
}

function formatTier(tier: KamiyoTier | undefined): string {
  if (tier === undefined) return 'Unknown';
  return KamiyoTier[tier];
}

async function main(): Promise<void> {
  const { globalId, address, chain, json } = parseArgs();
  const config = loadConfig();

  const baseProvider = new ethers.JsonRpcProvider(config.baseRpcUrl);
  const hyperliquidProvider = new ethers.JsonRpcProvider(
    config.hyperliquidRpcUrl
  );
  const monadProvider = new ethers.JsonRpcProvider(config.monadRpcUrl);

  const resolver = new CrossChainResolver({
    base: config.baseIdentityRegistry
      ? { provider: baseProvider, contractAddress: config.baseIdentityRegistry }
      : undefined,
    hyperliquid: config.hyperliquidAdapter
      ? {
          provider: hyperliquidProvider,
          contractAddress: config.hyperliquidAdapter,
        }
      : undefined,
    monad: config.monadMirror
      ? { provider: monadProvider, contractAddress: config.monadMirror }
      : undefined,
  });

  let resolvedId = globalId;

  if (address && chain) {
    if (!json) {
      console.log(`Resolving address ${address} on ${chain}...\n`);
    }

    const result = await resolver.resolveByAddress(address, chain);
    if (!result) {
      console.error('Agent not found');
      process.exit(1);
    }

    if (json) {
      console.log(
        JSON.stringify(
          result,
          (_, v) => (typeof v === 'bigint' ? v.toString() : v),
          2
        )
      );
      return;
    }

    resolvedId = result.globalId;
  }

  if (!resolvedId || !isValidGlobalId(resolvedId)) {
    console.error('Invalid global ID format');
    process.exit(1);
  }

  if (!json) {
    console.log(`Resolving: ${resolvedId}\n`);
  }

  const result = await resolver.resolve(resolvedId);

  if (!result) {
    console.error('Agent not found on any chain');
    process.exit(1);
  }

  if (json) {
    console.log(
      JSON.stringify(
        result,
        (_, v) => (typeof v === 'bigint' ? v.toString() : v),
        2
      )
    );
    return;
  }

  console.log('--- Global ID ---');
  console.log(`  Namespace:  ${result.parsed.namespace}`);
  console.log(`  Chain ID:   ${result.parsed.chainId}`);
  console.log(`  Registry:   ${result.parsed.registry}`);
  console.log(`  Agent ID:   ${result.parsed.agentId}`);
  console.log(`  Tier:       ${formatTier(result.tier)}`);

  const presence = await resolver.getPresence(resolvedId);
  console.log(`\n--- Chain Presence ---`);
  console.log(`  ${presence.join(', ') || 'None'}`);

  if (result.canonical) {
    console.log('\n--- Base (Canonical) ---');
    console.log(`  Owner:         ${result.canonical.owner}`);
    console.log(`  Wallet:        ${result.canonical.wallet}`);
    console.log(`  URI:           ${result.canonical.uri || '(none)'}`);
    console.log(
      `  Registered:    ${new Date(result.canonical.registeredAt * 1000).toISOString()}`
    );
  }

  if (result.hyperliquid) {
    console.log('\n--- Hyperliquid ---');
    console.log(`  Owner:         ${result.hyperliquid.owner}`);
    console.log(`  Name:          ${result.hyperliquid.name || '(none)'}`);
    console.log(
      `  Stake:         ${ethers.formatEther(result.hyperliquid.stake)} HYPE`
    );
    console.log(`  Total Trades:  ${result.hyperliquid.totalTrades}`);
    console.log(`  Success Rate:  ${result.hyperliquid.totalTrades > 0 ? Math.round((result.hyperliquid.successfulTrades / result.hyperliquid.totalTrades) * 100) : 0}%`);
    console.log(`  Active:        ${result.hyperliquid.active ? 'Yes' : 'No'}`);
  }

  if (result.monad) {
    console.log('\n--- Monad (Mirror) ---');
    console.log(`  Owner:         ${result.monad.owner}`);
    console.log(`  Wallet:        ${result.monad.wallet}`);
    console.log(`  URI:           ${result.monad.agentURI || '(none)'}`);
    console.log(`  Tier:          ${formatTier(result.monad.tier)}`);
    console.log(
      `  Mirrored:      ${new Date(result.monad.timestamp * 1000).toISOString()}`
    );
  }
}

main().catch((error) => {
  console.error('Resolution failed:', error.message || error);
  process.exit(1);
});
