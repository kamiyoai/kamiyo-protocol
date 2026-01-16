import chalk from 'chalk';
import { SolanaClient } from '../client/connection.js';
import { MitamaProgram } from '../client/program.js';
import {
  showError,
  showDivider,
  formatSol,
  formatAddress,
  formatCommitment,
} from '../ui/banner.js';
import { startSpinner, succeedSpinner, failSpinner } from '../ui/spinner.js';
import { bytesToHex } from '../client/crypto.js';
import { AgentIdentity } from './register.js';

export async function handleStatus(
  client: SolanaClient,
  program: MitamaProgram
): Promise<void> {
  console.log();
  showDivider();

  startSpinner('Fetching registry...');

  try {
    const registry = await program.getRegistry();

    if (!registry) {
      failSpinner('Registry not found');
      showError('Registry not initialized on this network');
      return;
    }

    succeedSpinner('Registry loaded');

    console.log();
    console.log(chalk.gray('  ◉ AGENT REGISTRY'));
    console.log();

    // Status
    const statusColor = registry.paused ? chalk.red : chalk.green;
    const statusText = registry.paused ? 'PAUSED' : 'ACTIVE';
    console.log(chalk.gray('  Status:      ') + statusColor('● ' + statusText));

    // Network
    console.log(chalk.gray('  Network:     ') + chalk.cyan(client.network));

    // Authority
    console.log(chalk.gray('  Authority:   ') + formatAddress(registry.authority.toBase58()));

    console.log();
    console.log(chalk.gray('  ─────────────────────────────────────────'));
    console.log();

    // Stats
    console.log(chalk.gray('  Epoch:            ') + chalk.yellow(registry.epoch.toString()));
    console.log(chalk.gray('  Agent Count:      ') + chalk.white(registry.agentCount.toString()));
    console.log(chalk.gray('  Signal Count:     ') + chalk.white(registry.signalCount.toString()));
    console.log(chalk.gray('  Swarm Actions:    ') + chalk.white(registry.swarmActionCount.toString()));

    console.log();
    console.log(chalk.gray('  ─────────────────────────────────────────'));
    console.log();

    // Config
    console.log(chalk.gray('  Min Stake:        ') + formatSol(Number(registry.minStake)));
    console.log(chalk.gray('  Min Confidence:   ') + chalk.white(registry.minSignalConfidence + '%'));

    console.log();
    console.log(chalk.gray('  ─────────────────────────────────────────'));
    console.log();

    // Merkle root
    const rootHex = bytesToHex(registry.agentsRoot);
    const isZero = rootHex === '0'.repeat(64);
    console.log(
      chalk.gray('  Agents Root:      ') +
        (isZero ? chalk.gray('(not set)') : formatCommitment(rootHex))
    );

    console.log();
  } catch (err: any) {
    failSpinner('Failed to fetch registry');
    showError(err.message);
  }
}

export async function handleMyAgent(
  client: SolanaClient,
  program: MitamaProgram,
  identity: AgentIdentity | null
): Promise<void> {
  console.log();
  showDivider();

  if (!identity) {
    showError('No agent registered yet');
    return;
  }

  startSpinner('Fetching agent...');

  try {
    const agent = await program.getAgent(identity.commitment);

    if (!agent) {
      failSpinner('Agent not found');
      showError('Agent account not found on chain');
      return;
    }

    succeedSpinner('Agent loaded');

    console.log();
    console.log(chalk.gray('  ◉ MY AGENT'));
    console.log();

    // Status
    const statusColor = agent.active ? chalk.green : chalk.red;
    const statusText = agent.active ? 'ACTIVE' : 'INACTIVE';
    console.log(chalk.gray('  Status:           ') + statusColor('● ' + statusText));

    // Identity
    console.log(chalk.gray('  PDA:              ') + formatAddress(identity.pda));
    console.log(
      chalk.gray('  Commitment:       ') + formatCommitment(bytesToHex(identity.commitment))
    );

    console.log();
    console.log(chalk.gray('  ─────────────────────────────────────────'));
    console.log();

    // Stats
    console.log(chalk.gray('  Stake:            ') + formatSol(Number(agent.stake)));
    console.log(chalk.gray('  Signals Sent:     ') + chalk.white(agent.signalCount.toString()));
    console.log(chalk.gray('  Swarm Votes:      ') + chalk.white(agent.swarmVotes.toString()));
    console.log(chalk.gray('  Registered Slot:  ') + chalk.gray(agent.registeredSlot.toString()));

    console.log();
  } catch (err: any) {
    failSpinner('Failed to fetch agent');
    showError(err.message);
  }
}
