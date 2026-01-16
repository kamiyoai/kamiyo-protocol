import chalk from 'chalk';
import { SolanaClient } from '../client/connection.js';
import { YumoriProgram } from '../client/program.js';
import {
  showSuccess,
  showError,
  showInfo,
  formatSol,
  formatCommitment,
  showDivider,
  formatAddress,
} from '../ui/banner.js';
import { confirmAction, inputText } from '../ui/menu.js';
import { startSpinner, succeedSpinner, failSpinner, updateSpinner } from '../ui/spinner.js';
import { bytesToHex } from '../client/crypto.js';
import { createNewIdentity, loadIdentity, YumoriIdentity } from '../client/identity.js';

export interface AgentIdentity {
  commitment: Uint8Array;
  pda: string;
  secrets?: YumoriIdentity;
}

export async function handleRegister(
  client: SolanaClient,
  program: YumoriProgram,
  currentIdentity: AgentIdentity | null
): Promise<AgentIdentity | null> {
  console.log();
  showDivider();

  if (currentIdentity) {
    showInfo('You already have a registered agent');
    console.log(chalk.gray('  Commitment: ') + formatCommitment(bytesToHex(currentIdentity.commitment)));
    console.log(chalk.gray('  PDA:        ') + formatAddress(currentIdentity.pda));
    console.log();
    return currentIdentity;
  }

  // Get registry to check min stake
  startSpinner('Fetching registry...');
  const registry = await program.getRegistry();

  if (!registry) {
    failSpinner('Registry not found');
    showError('Registry not initialized on this network');
    return null;
  }

  succeedSpinner('Registry found');

  const minStake = registry.minStake;
  const minStakeSol = Number(minStake) / 1e9;

  console.log();
  console.log(chalk.gray('  Minimum stake: ') + formatSol(Number(minStake)));
  console.log();

  // Check balance
  const balance = await client.getBalance();
  const requiredBalance = Number(minStake) + 10_000_000; // min stake + rent

  if (balance < requiredBalance) {
    showError(`Insufficient balance. Need at least ${formatSol(requiredBalance)}`);
    return null;
  }

  // Get stake amount
  const stakeInput = await inputText(
    `Stake amount in SOL (min ${minStakeSol}):`,
    minStakeSol.toString()
  );
  const stakeAmount = parseFloat(stakeInput);

  if (isNaN(stakeAmount) || stakeAmount < minStakeSol) {
    showError(`Stake must be at least ${minStakeSol} SOL`);
    return null;
  }

  const stakeLamports = BigInt(Math.floor(stakeAmount * 1e9));

  console.log();
  console.log(chalk.gray('  Registration Summary'));
  console.log(chalk.gray('  ────────────────────'));
  console.log(chalk.gray('  Stake:   ') + formatSol(Number(stakeLamports)));
  console.log(chalk.gray('  Network: ') + chalk.cyan(client.network));
  console.log();

  const confirm = await confirmAction('Proceed with registration?');
  if (!confirm) return null;

  console.log();
  startSpinner('Generating identity commitment...');
  await new Promise((r) => setTimeout(r, 500)); // Visual delay
  updateSpinner('Submitting transaction...');

  try {
    const { signature, commitment } = await program.registerAgent(stakeLamports);

    succeedSpinner('Agent registered');

    const [agentPDA] = YumoriProgram.getAgentPDA(commitment);
    const pdaString = agentPDA.toBase58();

    // Store identity secrets persistently
    const storedIdentity = createNewIdentity(commitment, pdaString, client.network);

    console.log();
    console.log(chalk.green('  ┌─────────────────────────────────────────────┐'));
    console.log(chalk.green('  │') + chalk.white('          AGENT REGISTRATION COMPLETE         ') + chalk.green('│'));
    console.log(chalk.green('  └─────────────────────────────────────────────┘'));
    console.log();
    console.log(chalk.gray('  Identity Commitment:'));
    console.log(chalk.magenta('  ' + bytesToHex(commitment)));
    console.log();
    console.log(chalk.gray('  Agent PDA:'));
    console.log(chalk.cyan('  ' + pdaString));
    console.log();
    console.log(chalk.gray('  Transaction:'));
    console.log(chalk.gray('  ' + signature));
    console.log();

    showSuccess('Identity secrets stored in ~/.yumori/identity.json');
    showInfo('Secrets auto-loaded for ZK proofs. Keep this file safe!');
    console.log();

    return {
      commitment,
      pda: pdaString,
      secrets: storedIdentity,
    };
  } catch (err: any) {
    failSpinner('Registration failed');
    showError(err.message);
    return null;
  }
}
