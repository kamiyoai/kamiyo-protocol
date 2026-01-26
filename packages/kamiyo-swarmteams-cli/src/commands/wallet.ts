import chalk from 'chalk';
import inquirer from 'inquirer';
import { SolanaClient } from '../client/connection.js';
import {
  showSuccess,
  showError,
  showInfo,
  formatSol,
  formatAddress,
  showDivider,
} from '../ui/banner.js';
import { showWalletMenu, WalletAction, confirmAction } from '../ui/menu.js';
import { startSpinner, succeedSpinner, failSpinner } from '../ui/spinner.js';

async function promptPassword(prompt: string): Promise<string> {
  const { password } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message: prompt,
      mask: '*',
    },
  ]);
  return password;
}

export async function handleWallet(client: SolanaClient): Promise<void> {
  while (true) {
    const action = await showWalletMenu();

    switch (action) {
      case WalletAction.VIEW:
        await showBalance(client);
        break;

      case WalletAction.AIRDROP:
        await requestAirdrop(client);
        break;

      case WalletAction.BACK:
        return;
    }
  }
}

async function showBalance(client: SolanaClient): Promise<void> {
  console.log();
  showDivider();

  const pubkey = client.getPublicKey();
  if (!pubkey) {
    showError('No wallet loaded');
    return;
  }

  startSpinner('Fetching balance...');

  try {
    const balance = await client.getBalance();
    succeedSpinner('Balance fetched');

    console.log();
    console.log(chalk.gray('  Address:  ') + formatAddress(pubkey.toBase58(), false));
    console.log(chalk.gray('  Balance:  ') + formatSol(balance));
    console.log(chalk.gray('  Network:  ') + chalk.cyan(client.network));
    console.log();
  } catch (err: any) {
    failSpinner('Failed to fetch balance');
    showError(err.message);
  }
}

async function requestAirdrop(client: SolanaClient): Promise<void> {
  console.log();

  if (client.network !== 'devnet') {
    showError('Airdrop only available on devnet');
    return;
  }

  const confirm = await confirmAction('Request 1 SOL airdrop?');
  if (!confirm) return;

  startSpinner('Requesting airdrop...');

  try {
    const sig = await client.requestAirdrop(1);
    succeedSpinner('Airdrop received');

    showInfo('Transaction: ' + chalk.cyan(sig.slice(0, 20) + '...'));

    const balance = await client.getBalance();
    showSuccess('New balance: ' + formatSol(balance));
    console.log();
  } catch (err: any) {
    failSpinner('Airdrop failed');
    showError(err.message);
    showInfo('Try again in a minute (rate limited)');
  }
}

export async function setupWallet(client: SolanaClient): Promise<boolean> {
  console.log();
  showDivider();

  startSpinner('Looking for wallet...');

  // First try without password (for Solana CLI wallet)
  let found = await client.loadWallet();

  if (!found) {
    // Try with password for encrypted wallet
    succeedSpinner('Checking for encrypted wallet...');
    const password = await promptPassword('Wallet password (or leave empty to skip):');
    if (password) {
      found = await client.loadWallet(password);
    }
  }

  if (found) {
    succeedSpinner('Wallet loaded');
    const pubkey = client.getPublicKey()!;
    const balance = await client.getBalance();

    console.log();
    console.log(chalk.gray('  Address:  ') + formatAddress(pubkey.toBase58(), false));
    console.log(chalk.gray('  Balance:  ') + formatSol(balance));
    console.log();

    if (balance < 1_000_000) {
      showWarning('Low balance. Use airdrop on devnet.');
    }

    return true;
  }

  failSpinner('No wallet found');

  const create = await confirmAction('Create new wallet?');
  if (!create) return false;

  // Get password for new encrypted wallet
  console.log();
  showInfo('Wallet will be encrypted with a password.');
  const password = await promptPassword('Enter password (min 8 chars):');
  if (password.length < 8) {
    showError('Password must be at least 8 characters');
    return false;
  }
  const confirmPwd = await promptPassword('Confirm password:');
  if (password !== confirmPwd) {
    showError('Passwords do not match');
    return false;
  }

  startSpinner('Generating encrypted keypair...');
  try {
    const keypair = await client.createWallet(password);
    succeedSpinner('Wallet created');

    console.log();
    console.log(chalk.gray('  Address:  ') + formatAddress(keypair.publicKey.toBase58(), false));
    showInfo('Saved to ~/.swarmteams/wallet.enc.json (encrypted)');
    showWarning('Request airdrop for devnet SOL');
    console.log();

    return true;
  } catch (err: unknown) {
    failSpinner('Failed to create wallet');
    showError(err instanceof Error ? err.message : 'Unknown error');
    return false;
  }
}

function showWarning(message: string): void {
  console.log(chalk.yellow('  ⚠ ') + message);
}
