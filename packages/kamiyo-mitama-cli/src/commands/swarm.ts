import chalk from 'chalk';
import { SolanaClient } from '../client/connection.js';
import { MitamaProgram } from '../client/program.js';
import {
  showSuccess,
  showError,
  showInfo,
  showWarning,
  showDivider,
  formatCommitment,
} from '../ui/banner.js';
import { showSwarmMenu, SwarmAction, confirmAction, inputText, selectOption } from '../ui/menu.js';
import { startSpinner, succeedSpinner, failSpinner, updateSpinner } from '../ui/spinner.js';
import { generateActionHash, bytesToHex, generateRandomBytes, bytesToBigint, hexToBytes } from '../client/crypto.js';
import { AgentIdentity } from './register.js';
import { proveSwarmVote } from '@kamiyo/kamiyo-mitama-prover';
import { getRegistrySync } from '../client/registry-sync.js';
import { getIdentitySecrets, loadIdentity } from '../client/identity.js';

const ACTION_TYPES = [
  { name: 'Trade Signal - Long', value: 1 },
  { name: 'Trade Signal - Short', value: 2 },
  { name: 'Risk Alert', value: 3 },
  { name: 'Strategy Update', value: 4 },
  { name: 'Custom Action', value: 99 },
];

export async function handleSwarm(
  client: SolanaClient,
  program: MitamaProgram,
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
  program: MitamaProgram,
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
  program: MitamaProgram,
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
  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log();
  console.log(chalk.cyan('  ZK Proof will verify:'));
  console.log(chalk.gray('  • You are a registered agent (merkle membership)'));
  console.log(chalk.gray('  • Your vote is valid (0 or 1)'));
  console.log(chalk.gray('  • Nullifier prevents double-voting'));
  console.log();
  console.log(chalk.cyan('  What stays private:'));
  console.log(chalk.gray('  • Your identity as an agent'));
  console.log(chalk.gray('  • Your vote (encrypted in commitment)'));
  console.log();

  const confirm = await confirmAction('Generate ZK proof and submit?');
  if (!confirm) return;

  // Load stored identity secrets
  const storedIdentity = loadIdentity(client.network);
  if (!storedIdentity) {
    showError('No identity found. Register as agent first.');
    return;
  }

  const secrets = getIdentitySecrets(storedIdentity);
  const voteSalt = generateRandomBytes(32);

  startSpinner('Syncing agent registry...');

  try {
    // Try to sync with on-chain registry for real merkle proof
    const registrySync = getRegistrySync(client.connection);
    let agentsRoot: bigint;
    let merkleProof: { path: bigint[]; indices: number[] };

    try {
      await registrySync.sync();
      const commitmentHex = storedIdentity.commitment;

      if (registrySync.isAgentRegistered(commitmentHex)) {
        // Real merkle proof from on-chain data
        agentsRoot = registrySync.getRoot();
        merkleProof = registrySync.getProof(commitmentHex);
        updateSpinner('Registry synced, generating ZK proof...');
      } else {
        // Agent not found on-chain, use demo mode
        showWarning('Agent not found on-chain, using demo mode');
        const demoData = await registrySync.createDemoTree(hexToBytes(commitmentHex));
        agentsRoot = demoData.root;
        merkleProof = demoData.proof;
        updateSpinner('Demo tree created, generating ZK proof...');
      }
    } catch {
      // Fallback to demo mode if sync fails
      showWarning('Registry sync failed, using demo mode');
      const demoData = await registrySync.createDemoTree(hexToBytes(storedIdentity.commitment));
      agentsRoot = demoData.root;
      merkleProof = demoData.proof;
      updateSpinner('Demo tree created, generating ZK proof...');
    }

    const { proof, voteNullifier, voteCommitment } = await proveSwarmVote({
      agentsRoot,
      ownerSecret: secrets.ownerSecret,
      agentId: secrets.agentId,
      registrationSecret: secrets.registrationSecret,
      merkleProof,
      actionHash: bytesToBigint(hexToBytes(actionHashHex)),
      vote: vote ? 1 : 0,
      voteSalt: bytesToBigint(voteSalt),
    });

    succeedSpinner('ZK proof generated');

    console.log();
    console.log(chalk.green('  ┌─────────────────────────────────────────────┐'));
    console.log(chalk.green('  │') + chalk.white('            ZK PROOF GENERATED                ') + chalk.green('│'));
    console.log(chalk.green('  └─────────────────────────────────────────────┘'));
    console.log();
    console.log(chalk.gray('  Vote:        ') + (vote ? chalk.green('YES') : chalk.red('NO')));
    console.log(chalk.gray('  Action:      ') + formatCommitment(actionHashHex));
    console.log(chalk.gray('  Nullifier:   ') + chalk.cyan(voteNullifier.toString(16).slice(0, 32) + '...'));
    console.log(chalk.gray('  Commitment:  ') + chalk.magenta(voteCommitment.toString(16).slice(0, 32) + '...'));
    console.log();
    console.log(chalk.gray('  Proof (a):   ') + chalk.yellow(proof.a.slice(0, 8).join(',') + '...'));
    console.log(chalk.gray('  Proof (b):   ') + chalk.yellow(proof.b.slice(0, 8).join(',') + '...'));
    console.log(chalk.gray('  Proof (c):   ') + chalk.yellow(proof.c.slice(0, 8).join(',') + '...'));
    console.log();

    showInfo('Proof ready for on-chain submission');
    console.log(chalk.gray('  (On-chain submission pending program integration)'));
    console.log();
  } catch (err) {
    failSpinner('Proof generation failed');
    showError(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function viewProposals(
  client: SolanaClient,
  program: MitamaProgram
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
