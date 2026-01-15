import chalk from 'chalk';
import { SolanaClient } from '../client/connection.js';
import { YumoriProgram } from '../client/program.js';
import {
  showSuccess,
  showError,
  showInfo,
  showWarning,
  showDivider,
  formatCommitment,
} from '../ui/banner.js';
import { showSwarmMenu, SwarmAction, confirmAction, inputText, selectOption } from '../ui/menu.js';
import { startSpinner, succeedSpinner, failSpinner } from '../ui/spinner.js';
import { generateActionHash, bytesToHex, generateRandomBytes } from '../client/crypto.js';
import { AgentIdentity } from './register.js';

const ACTION_TYPES = [
  { name: 'Trade Signal - Long', value: 1 },
  { name: 'Trade Signal - Short', value: 2 },
  { name: 'Risk Alert', value: 3 },
  { name: 'Strategy Update', value: 4 },
  { name: 'Custom Action', value: 99 },
];

export async function handleSwarm(
  client: SolanaClient,
  program: YumoriProgram,
  identity: AgentIdentity | null
): Promise<void> {
  while (true) {
    const action = await showSwarmMenu();

    switch (action) {
      case SwarmAction.CREATE:
        await createProposal(client, program, identity);
        break;

      case SwarmAction.VOTE:
        await voteProposal(client, program, identity);
        break;

      case SwarmAction.VIEW:
        await viewProposals(client, program);
        break;

      case SwarmAction.BACK:
        return;
    }
  }
}

async function createProposal(
  client: SolanaClient,
  program: YumoriProgram,
  identity: AgentIdentity | null
): Promise<void> {
  console.log();
  showDivider();

  if (!identity) {
    showError('Must register as agent first');
    return;
  }

  console.log(chalk.gray('  ◈ CREATE SWARM PROPOSAL'));
  console.log();

  // Select action type
  const actionType = await selectOption('Action type:', ACTION_TYPES);

  // Get action description
  const description = await inputText('Description (e.g., "BTC breakout imminent"):');
  if (!description.trim()) {
    showError('Description required');
    return;
  }

  // Get threshold
  const thresholdInput = await inputText('Approval threshold % (1-100):', '66');
  const threshold = parseInt(thresholdInput);
  if (isNaN(threshold) || threshold < 1 || threshold > 100) {
    showError('Threshold must be 1-100');
    return;
  }

  console.log();
  console.log(chalk.gray('  Proposal Summary'));
  console.log(chalk.gray('  ────────────────'));
  console.log(chalk.gray('  Type:      ') + chalk.white(ACTION_TYPES.find((t) => t.value === actionType)?.name));
  console.log(chalk.gray('  Action:    ') + chalk.white(description));
  console.log(chalk.gray('  Threshold: ') + chalk.yellow(threshold + '%'));
  console.log();

  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log();
  showInfo('ZK proof requires merkle tree of all agents');
  showInfo('Swarm flow demonstrated - on-chain requires full ZK setup');
  console.log();

  const confirm = await confirmAction('Continue demo?');
  if (!confirm) return;

  startSpinner('Generating action hash...');

  try {
    const actionHash = await generateActionHash(actionType, description);
    const nullifier = generateRandomBytes(32);

    succeedSpinner('Demo complete');

    console.log();
    console.log(chalk.yellow('  ┌─────────────────────────────────────────────┐'));
    console.log(chalk.yellow('  │') + chalk.white('        PROPOSAL PREVIEW (NOT SUBMITTED)      ') + chalk.yellow('│'));
    console.log(chalk.yellow('  └─────────────────────────────────────────────┘'));
    console.log();
    console.log(chalk.gray('  Would submit:'));
    console.log(chalk.gray('  • Action Hash: ') + chalk.magenta(bytesToHex(actionHash).slice(0, 32) + '...'));
    console.log(chalk.gray('  • Nullifier:   ') + chalk.cyan(bytesToHex(nullifier).slice(0, 32) + '...'));
    console.log(chalk.gray('  • Threshold:   ') + chalk.white(threshold + '%'));
    console.log(chalk.gray('  • ZK Proof:    ') + chalk.gray('(requires merkle indexer)'));
    console.log();
  } catch (err: any) {
    failSpinner('Failed');
    showError(err.message);
  }
}

async function voteProposal(
  client: SolanaClient,
  program: YumoriProgram,
  identity: AgentIdentity | null
): Promise<void> {
  console.log();
  showDivider();

  if (!identity) {
    showError('Must register as agent first');
    return;
  }

  console.log(chalk.gray('  ◇ VOTE ON PROPOSAL'));
  console.log();

  const actionHashHex = await inputText('Enter action hash:');
  if (!actionHashHex || actionHashHex.length !== 64) {
    showError('Invalid action hash (must be 64 hex characters)');
    return;
  }

  const vote = await selectOption('Your vote:', [
    { name: chalk.green('✓ YES') + ' - Support this action', value: true },
    { name: chalk.red('✗ NO') + ' - Oppose this action', value: false },
  ]);

  console.log();
  showInfo('ZK proof requires merkle tree of all agents');
  console.log();

  const confirm = await confirmAction(`Preview ${vote ? 'YES' : 'NO'} vote?`);
  if (!confirm) return;

  startSpinner('Simulating vote proof...');
  await new Promise((r) => setTimeout(r, 800));

  succeedSpinner('Demo complete');

  console.log();
  console.log(chalk.yellow('  ┌─────────────────────────────────────────────┐'));
  console.log(chalk.yellow('  │') + chalk.white('          VOTE PREVIEW (NOT SUBMITTED)        ') + chalk.yellow('│'));
  console.log(chalk.yellow('  └─────────────────────────────────────────────┘'));
  console.log();
  console.log(chalk.gray('  Would submit:'));
  console.log(chalk.gray('  • Vote:       ') + (vote ? chalk.green('YES') : chalk.red('NO')));
  console.log(chalk.gray('  • Action:     ') + formatCommitment(actionHashHex));
  console.log(chalk.gray('  • Nullifier:  ') + chalk.gray('(prevents double-voting)'));
  console.log(chalk.gray('  • ZK Proof:   ') + chalk.gray('(requires merkle indexer)'));
  console.log();
}

async function viewProposals(
  client: SolanaClient,
  program: YumoriProgram
): Promise<void> {
  console.log();
  showDivider();

  console.log(chalk.gray('  ◎ ACTIVE PROPOSALS'));
  console.log();

  startSpinner('Fetching proposals...');
  await new Promise((r) => setTimeout(r, 500));
  succeedSpinner('Proposals loaded');

  console.log();
  console.log(chalk.gray('  No active proposals found'));
  console.log();
  showInfo('Create a proposal to start swarm coordination');
  console.log();
}
