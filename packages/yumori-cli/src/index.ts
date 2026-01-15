#!/usr/bin/env node

import chalk from 'chalk';
import { SolanaClient } from './client/connection.js';
import { YumoriProgram } from './client/program.js';
import { showBanner, showCompactBanner, showInfo, showDivider } from './ui/banner.js';
import { showMainMenu, MainMenuAction, pressEnterToContinue } from './ui/menu.js';
import { handleWallet, setupWallet } from './commands/wallet.js';
import { handleRegister, AgentIdentity } from './commands/register.js';
import { handleStatus, handleMyAgent } from './commands/status.js';
import { handleSwarm } from './commands/swarm.js';
import { handleSignal } from './commands/signal.js';

// State
let client: SolanaClient;
let program: YumoriProgram;
let hasWallet = false;
let agentIdentity: AgentIdentity | null = null;

async function init(): Promise<void> {
  // Parse args for network
  const args = process.argv.slice(2);
  const network = args.includes('--mainnet') ? 'mainnet' : 'devnet';

  client = new SolanaClient(network as 'devnet' | 'mainnet');
  program = new YumoriProgram(client);

  // Try to load existing wallet
  hasWallet = await client.loadWallet();
}

async function mainLoop(): Promise<void> {
  while (true) {
    showCompactBanner();

    const action = await showMainMenu(hasWallet, agentIdentity !== null);

    switch (action) {
      case MainMenuAction.WALLET:
        if (!hasWallet) {
          hasWallet = await setupWallet(client);
        } else {
          await handleWallet(client);
        }
        break;

      case MainMenuAction.REGISTER:
        agentIdentity = await handleRegister(client, program, agentIdentity);
        break;

      case MainMenuAction.STATUS:
        await handleStatus(client, program);
        break;

      case MainMenuAction.MY_AGENT:
        await handleMyAgent(client, program, agentIdentity);
        break;

      case MainMenuAction.SIGNAL:
        await handleSignal(client, program, agentIdentity);
        break;

      case MainMenuAction.SWARM:
        await handleSwarm(client, program, agentIdentity);
        break;

      case MainMenuAction.EXIT:
        console.log();
        console.log(chalk.gray('  お疲れ様でした'));
        console.log();
        process.exit(0);
    }

    await pressEnterToContinue();
  }
}

async function main(): Promise<void> {
  try {
    // Show banner
    showBanner();

    // Small delay for effect
    await new Promise((r) => setTimeout(r, 500));

    // Initialize
    await init();

    showDivider();
    console.log();

    if (hasWallet) {
      const pubkey = client.getPublicKey()!;
      showInfo('Wallet: ' + chalk.cyan(pubkey.toBase58().slice(0, 8) + '...'));
    } else {
      showInfo('No wallet found. Setup required.');
    }

    showInfo('Network: ' + chalk.cyan(client.network));
    console.log();

    // Start main loop
    await mainLoop();
  } catch (err: any) {
    console.error(chalk.red('\nFatal error: ' + err.message));
    process.exit(1);
  }
}

// Handle graceful exit
process.on('SIGINT', () => {
  console.log();
  console.log(chalk.gray('  Interrupted.'));
  process.exit(0);
});

// Run
main();
