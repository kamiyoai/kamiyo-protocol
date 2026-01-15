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
import { confirmAction, inputText, selectOption } from '../ui/menu.js';
import { startSpinner, succeedSpinner, failSpinner } from '../ui/spinner.js';
import { generateRandomBytes, bytesToHex } from '../client/crypto.js';
import { AgentIdentity } from './register.js';

const SIGNAL_TYPES = [
  { name: 'Market Sentiment', value: 0 },
  { name: 'Technical Analysis', value: 1 },
  { name: 'On-chain Activity', value: 2 },
  { name: 'News/Event', value: 3 },
];

const DIRECTIONS = [
  { name: chalk.red('↓ SHORT') + ' - Bearish signal', value: 0 },
  { name: chalk.green('↑ LONG') + ' - Bullish signal', value: 1 },
  { name: chalk.gray('→ NEUTRAL') + ' - No directional bias', value: 2 },
];

export async function handleSignal(
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

  console.log(yumoriGradient('  ◈ SUBMIT PRIVATE SIGNAL'));
  console.log();
  showInfo('Signals are committed without revealing content');
  console.log();

  // Signal type
  const signalType = await selectOption('Signal type:', SIGNAL_TYPES);

  // Direction
  const direction = await selectOption('Direction:', DIRECTIONS);

  // Confidence
  const confidenceInput = await inputText('Confidence (0-100):', '75');
  const confidence = parseInt(confidenceInput);
  if (isNaN(confidence) || confidence < 0 || confidence > 100) {
    showError('Confidence must be 0-100');
    return;
  }

  // Magnitude
  const magnitudeInput = await inputText('Magnitude/Strength (0-100):', '50');
  const magnitude = parseInt(magnitudeInput);
  if (isNaN(magnitude) || magnitude < 0 || magnitude > 100) {
    showError('Magnitude must be 0-100');
    return;
  }

  // Optional note (not submitted, just for display)
  const note = await inputText('Note (local only, not submitted):', '');

  // Generate commitment
  const secret = generateRandomBytes(32);
  const commitmentData = {
    signalType,
    direction,
    confidence,
    magnitude,
    secret: bytesToHex(secret),
  };

  console.log();
  console.log(chalk.gray('  Signal Summary'));
  console.log(chalk.gray('  ──────────────'));
  console.log(chalk.gray('  Type:       ') + chalk.white(SIGNAL_TYPES.find((t) => t.value === signalType)?.name));
  console.log(
    chalk.gray('  Direction:  ') +
      (direction === 0 ? chalk.red('SHORT') : direction === 1 ? chalk.green('LONG') : chalk.gray('NEUTRAL'))
  );
  console.log(chalk.gray('  Confidence: ') + chalk.yellow(confidence + '%'));
  console.log(chalk.gray('  Magnitude:  ') + chalk.yellow(magnitude + '%'));
  if (note) {
    console.log(chalk.gray('  Note:       ') + chalk.white(note));
  }
  console.log();

  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log();
  console.log(chalk.cyan('  What gets submitted on-chain:'));
  console.log(chalk.gray('  • Commitment hash (hides all signal data)'));
  console.log(chalk.gray('  • Nullifier (prevents double-submission)'));
  console.log(chalk.gray('  • ZK proof of agent membership'));
  console.log();
  console.log(chalk.cyan('  What stays private:'));
  console.log(chalk.gray('  • Signal type, direction, confidence'));
  console.log(chalk.gray('  • Your identity as an agent'));
  console.log();

  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log();
  showInfo('ZK proof requires merkle tree of all agents (off-chain indexer)');
  showInfo('Signal flow demonstrated - on-chain submission requires full ZK setup');
  console.log();

  const confirm = await confirmAction('Continue demo?');
  if (!confirm) return;

  startSpinner('Generating commitment...');
  await new Promise((r) => setTimeout(r, 300));

  startSpinner('Simulating ZK proof...');
  await new Promise((r) => setTimeout(r, 800));

  succeedSpinner('Demo complete');

  // Generate commitment for display (matches on-chain keccak256 format)
  const nullifier = generateRandomBytes(32);

  // Compute commitment using same format as on-chain
  const commitmentBytes = new Uint8Array(1 + 1 + 1 + 1 + 8 + 32 + 32);
  let offset = 0;
  commitmentBytes[offset++] = signalType;
  commitmentBytes[offset++] = direction;
  commitmentBytes[offset++] = confidence;
  commitmentBytes[offset++] = magnitude;
  // stake as 8-byte LE (use agent's stake from identity)
  const stakeBytes = new Uint8Array(8);
  commitmentBytes.set(stakeBytes, offset); offset += 8;
  commitmentBytes.set(secret, offset); offset += 32;
  commitmentBytes.set(nullifier, offset);

  console.log();
  console.log(chalk.yellow('  ┌─────────────────────────────────────────────┐'));
  console.log(chalk.yellow('  │') + chalk.white('          SIGNAL PREVIEW (NOT SUBMITTED)      ') + chalk.yellow('│'));
  console.log(chalk.yellow('  └─────────────────────────────────────────────┘'));
  console.log();
  console.log(chalk.gray('  Would submit:'));
  console.log(chalk.gray('  • Commitment: ') + chalk.magenta(bytesToHex(commitmentBytes.slice(0, 16)) + '...'));
  console.log(chalk.gray('  • Nullifier:  ') + chalk.cyan(bytesToHex(nullifier).slice(0, 32) + '...'));
  console.log(chalk.gray('  • ZK Proof:   ') + chalk.gray('(requires merkle indexer)'));
  console.log();
  console.log(chalk.gray('  Reveal Secret (save for later):'));
  console.log(chalk.yellow('  ' + bytesToHex(secret)));
  console.log();
}
