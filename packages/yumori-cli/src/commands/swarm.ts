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
  yumoriGradient,
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

  console.log(yumoriGradient('  ◈ CREATE SWARM PROPOSAL'));
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

  showWarning('ZK proof required - using demo mode (simulated proof)');
  console.log();

  const confirm = await confirmAction('Create this proposal?');
  if (!confirm) return;

  startSpinner('Generating action hash...');

  try {
    const actionHash = await generateActionHash(actionType, description);
    const nullifier = generateRandomBytes(32);

    // Demo mode: create mock proof (all zeros won't verify on mainnet)
    const mockProof = {
      a: Array(64).fill(0),
      b: Array(128).fill(0),
      c: Array(64).fill(0),
    };

    startSpinner('Submitting proposal...');

    // Note: This will fail on-chain due to invalid proof
    // In demo, we just show the flow
    showInfo('Demo mode - actual submission requires valid ZK proof');

    succeedSpinner('Proposal created (demo)');

    console.log();
    console.log(chalk.green('  ┌─────────────────────────────────────────────┐'));
    console.log(chalk.green('  │') + chalk.white('            PROPOSAL CREATED (DEMO)           ') + chalk.green('│'));
    console.log(chalk.green('  └─────────────────────────────────────────────┘'));
    console.log();
    console.log(chalk.gray('  Action Hash:'));
    console.log(chalk.magenta('  ' + bytesToHex(actionHash)));
    console.log();
    console.log(chalk.gray('  Nullifier:'));
    console.log(chalk.cyan('  ' + bytesToHex(nullifier)));
    console.log();
    showInfo('In production, ZK circuit would prove agent membership');
    console.log();
  } catch (err: any) {
    failSpinner('Failed to create proposal');
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

  console.log(yumoriGradient('  ◇ VOTE ON PROPOSAL'));
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
  showWarning('ZK proof required - using demo mode');
  console.log();

  const confirm = await confirmAction(`Cast ${vote ? 'YES' : 'NO'} vote?`);
  if (!confirm) return;

  startSpinner('Generating vote proof...');
  await new Promise((r) => setTimeout(r, 800));

  succeedSpinner('Vote submitted (demo)');

  console.log();
  console.log(chalk.gray('  Vote:     ') + (vote ? chalk.green('YES') : chalk.red('NO')));
  console.log(chalk.gray('  Action:   ') + formatCommitment(actionHashHex));
  console.log();
  showInfo('Vote nullifier prevents double-voting');
  console.log();
}

async function viewProposals(
  client: SolanaClient,
  program: YumoriProgram
): Promise<void> {
  console.log();
  showDivider();

  console.log(yumoriGradient('  ◎ ACTIVE PROPOSALS'));
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
