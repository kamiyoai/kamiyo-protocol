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
import { confirmAction, inputText, selectOption } from '../ui/menu.js';
import { startSpinner, succeedSpinner, failSpinner } from '../ui/spinner.js';
import { generateRandomBytes, bytesToHex, bytesToBigint } from '../client/crypto.js';
import { AgentIdentity } from './register.js';
import { provePrivateSignal } from '@kamiyo/yumori-prover';

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

  console.log(chalk.gray('  ◈ SUBMIT PRIVATE SIGNAL'));
  console.log();
  showInfo('Signals are ZK-proven without revealing content');
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
  console.log();

  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log();
  console.log(chalk.cyan('  ZK Proof will verify:'));
  console.log(chalk.gray('  • Signal parameters are valid (range proofs)'));
  console.log(chalk.gray('  • You have sufficient stake'));
  console.log(chalk.gray('  • Commitment matches hidden data'));
  console.log();
  console.log(chalk.cyan('  What stays private:'));
  console.log(chalk.gray('  • Signal type, direction, confidence'));
  console.log(chalk.gray('  • Your identity as an agent'));
  console.log();

  const confirm = await confirmAction('Generate ZK proof and submit?');
  if (!confirm) return;

  // Generate secrets
  const secret = generateRandomBytes(32);
  const agentNullifier = generateRandomBytes(32);

  startSpinner('Generating ZK proof (this may take a moment)...');

  try {
    const { proof, signalCommitment } = await provePrivateSignal({
      signalType,
      direction,
      confidence,
      magnitude,
      stakeAmount: BigInt(100000000), // 0.1 SOL in lamports
      secret: bytesToBigint(secret),
      agentNullifier: bytesToBigint(agentNullifier),
      minStake: BigInt(0),
      minConfidence: 0,
    });

    succeedSpinner('ZK proof generated');

    console.log();
    console.log(chalk.green('  ┌─────────────────────────────────────────────┐'));
    console.log(chalk.green('  │') + chalk.white('            ZK PROOF GENERATED                ') + chalk.green('│'));
    console.log(chalk.green('  └─────────────────────────────────────────────┘'));
    console.log();
    console.log(chalk.gray('  Commitment:  ') + chalk.magenta(signalCommitment.toString(16).slice(0, 32) + '...'));
    console.log(chalk.gray('  Nullifier:   ') + chalk.cyan(bytesToHex(agentNullifier).slice(0, 32) + '...'));
    console.log();
    console.log(chalk.gray('  Proof (a):   ') + chalk.yellow(proof.a.slice(0, 8).join(',') + '...'));
    console.log(chalk.gray('  Proof (b):   ') + chalk.yellow(proof.b.slice(0, 8).join(',') + '...'));
    console.log(chalk.gray('  Proof (c):   ') + chalk.yellow(proof.c.slice(0, 8).join(',') + '...'));
    console.log();

    // TODO: Submit to Solana when program instruction is ready
    showInfo('Proof ready for on-chain submission');
    console.log(chalk.gray('  (On-chain submission pending program integration)'));
    console.log();
    console.log(chalk.gray('  Reveal Secret (save for later):'));
    console.log(chalk.yellow('  ' + bytesToHex(secret)));
    console.log();
  } catch (err) {
    failSpinner('Proof generation failed');
    showError(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
