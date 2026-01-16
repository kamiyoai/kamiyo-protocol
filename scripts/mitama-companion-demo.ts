#!/usr/bin/env npx tsx
/**
 * Mitama x KAMIYO Companion - Full Protocol Demo
 *
 * Demonstrates the complete Mitama flow with REAL:
 * - Solana devnet transactions
 * - Groth16 ZK proofs via MitamaProver
 * - Agent registration on-chain
 * - Signal submission with ZK proof
 * - Swarm voting with ZK proof
 *
 * Usage:
 *   npx tsx scripts/mitama-companion-demo.ts
 *
 * Requires:
 *   - DEMO_WALLET_SECRET env var (base64)
 *   - Circuits built in circuits/build/mitama/
 *   - Merkle tree in services/api/data/merkle-tree.json
 */

import { config } from 'dotenv';
config({ path: 'services/api/.env' });

import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import * as crypto from 'crypto';
import * as fs from 'fs';
import chalk from 'chalk';
import gradient from 'gradient-string';
import { MitamaClient, MitamaProver, MerkleTree, generateAgentId, createSignalCommitment } from '@kamiyo/kamiyo-mitama';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Gradient for KAMIYO MITAMA banner
const mitamaGradient = gradient(['#ff00ff', '#bf00ff', '#00ffff']);

const BANNER = `
  ██╗  ██╗ █████╗ ███╗   ███╗██╗██╗   ██╗ ██████╗     ███╗   ███╗██╗████████╗ █████╗ ███╗   ███╗ █████╗
  ██║ ██╔╝██╔══██╗████╗ ████║██║╚██╗ ██╔╝██╔═══██╗    ████╗ ████║██║╚══██╔══╝██╔══██╗████╗ ████║██╔══██╗
  █████╔╝ ███████║██╔████╔██║██║ ╚████╔╝ ██║   ██║    ██╔████╔██║██║   ██║   ███████║██╔████╔██║███████║
  ██╔═██╗ ██╔══██║██║╚██╔╝██║██║  ╚██╔╝  ██║   ██║    ██║╚██╔╝██║██║   ██║   ██╔══██║██║╚██╔╝██║██╔══██║
  ██║  ██╗██║  ██║██║ ╚═╝ ██║██║   ██║   ╚██████╔╝    ██║ ╚═╝ ██║██║   ██║   ██║  ██║██║ ╚═╝ ██║██║  ██║
  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝   ╚═╝    ╚═════╝     ╚═╝     ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝`;

function printBanner() {
  console.clear();
  console.log(mitamaGradient.multiline(BANNER));
  console.log();
  console.log(chalk.gray('  御魂 - ZK-Private Agent Coordination on Solana'));
  console.log(chalk.gray('  ─────────────────────────────────────────────────────────────────────────────────────────────'));
  console.log();
}

function printStep(step: number, total: number, title: string) {
  console.log(chalk.cyan(`  [${step}/${total}] ${title}`));
  console.log();
}

function printKV(key: string, value: string, color: typeof chalk.yellow = chalk.yellow) {
  console.log(chalk.gray(`  ${key.padEnd(20)} `) + color(value));
}

function printSuccess(msg: string) {
  console.log(chalk.green('  ✓ ') + msg);
}

function printError(msg: string) {
  console.log(chalk.red('  ✗ ') + msg);
}

function printInfo(msg: string) {
  console.log(chalk.cyan('  ℹ ') + chalk.gray(msg));
}

function printWarning(msg: string) {
  console.log(chalk.yellow('  ⚠ ') + chalk.gray(msg));
}

function printBox(title: string, color: typeof chalk.green = chalk.green) {
  console.log();
  console.log(color('  ┌─────────────────────────────────────────────────────────────────┐'));
  console.log(color('  │') + chalk.white(title.padStart(35 + title.length / 2).padEnd(66)) + color('│'));
  console.log(color('  └─────────────────────────────────────────────────────────────────┘'));
  console.log();
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function truncHex(hex: string, len = 16): string {
  if (hex.length <= len * 2) return hex;
  return hex.slice(0, len) + '...' + hex.slice(-len);
}

async function main() {
  printBanner();

  const walletSecret = process.env.DEMO_WALLET_SECRET;
  if (!walletSecret) {
    printError('DEMO_WALLET_SECRET not set');
    process.exit(1);
  }

  const keypair = Keypair.fromSecretKey(Buffer.from(walletSecret, 'base64'));
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const circuitsPath = process.cwd() + '/circuits/build/mitama';
  const merkleTreePath = process.cwd() + '/services/api/data/merkle-tree.json';

  // Check prerequisites
  if (!fs.existsSync(circuitsPath + '/agent_identity_final.zkey')) {
    printError(`Circuits not found at ${circuitsPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(merkleTreePath)) {
    printError(`Merkle tree not found at ${merkleTreePath}`);
    process.exit(1);
  }

  printInfo('Initializing Solana connection...');
  await sleep(500);

  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new MitamaClient(provider);

  printKV('Network:', 'Solana Devnet', chalk.white);
  printKV('RPC:', rpcUrl, chalk.gray);
  printKV('Wallet:', keypair.publicKey.toBase58().slice(0, 8) + '...', chalk.cyan);

  const balance = await connection.getBalance(keypair.publicKey);
  printKV('Balance:', (balance / 1e9).toFixed(4) + ' SOL', chalk.yellow);
  console.log();

  await sleep(1500);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Generate Agent Identity
  // ─────────────────────────────────────────────────────────────────────────
  printStep(1, 6, 'Generating Agent Identity');

  const seed = crypto.createHash('sha256').update(keypair.secretKey).digest();
  const ownerSecret = seed.subarray(0, 32);
  const agentId = await generateAgentId(keypair.publicKey.toBytes(), 0);
  const registrationSecret = crypto.createHash('sha256').update(Buffer.concat([seed, Buffer.from('reg')])).digest();

  printKV('Owner Secret:', truncHex(bytesToHex(ownerSecret)), chalk.magenta);
  printKV('Agent ID:', truncHex(bytesToHex(agentId)), chalk.magenta);
  printKV('Registration Secret:', truncHex(bytesToHex(registrationSecret)), chalk.magenta);
  console.log();

  printInfo('Computing identity commitment (Poseidon hash)...');
  await sleep(1000);

  const identityCommitment = await MitamaProver.generateIdentityCommitment(ownerSecret, agentId, registrationSecret);
  printSuccess('Identity commitment computed');
  printKV('Commitment:', bytesToHex(identityCommitment), chalk.green);
  console.log(chalk.gray('  (Only this hash goes on-chain. Secrets stay private.)'));
  console.log();

  await sleep(2000);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Query On-Chain Registry
  // ─────────────────────────────────────────────────────────────────────────
  printStep(2, 6, 'Querying On-Chain Registry');

  const registry = await client.getRegistry();
  if (!registry) {
    printError('Registry not found on devnet');
    process.exit(1);
  }

  printKV('Registry Epoch:', registry.epoch.toString(), chalk.white);
  printKV('Agents Root:', truncHex(bytesToHex(registry.agentsRoot)), chalk.cyan);
  printKV('Min Stake:', (Number(registry.minStake) / 1e9).toFixed(2) + ' SOL', chalk.yellow);
  printKV('Agent Count:', registry.agentCount.toString(), chalk.white);
  console.log();

  // Load and verify merkle tree
  printInfo('Loading merkle tree...');
  const treeData = fs.readFileSync(merkleTreePath, 'utf8');
  const tree = await MerkleTree.deserialize(treeData);
  const treeRoot = await tree.getRoot();

  const rootMatch = bytesToHex(treeRoot) === bytesToHex(registry.agentsRoot);
  if (rootMatch) {
    printSuccess('Merkle root matches on-chain registry');
  } else {
    printWarning('Merkle root mismatch - using on-chain root');
  }
  console.log();

  await sleep(2000);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Generate ZK Identity Proof (Groth16)
  // ─────────────────────────────────────────────────────────────────────────
  printStep(3, 6, 'Generating ZK Identity Proof (Groth16)');

  printInfo('Loading circuit artifacts...');
  const prover = new MitamaProver(circuitsPath);

  const { proof: merkleProof, pathIndices } = await tree.generateProof(0);
  const epoch = BigInt(registry.epoch.toString());

  printKV('Merkle Depth:', merkleProof.length.toString(), chalk.white);
  printKV('Current Epoch:', epoch.toString(), chalk.white);
  console.log();

  printInfo('Generating Groth16 proof (this takes a moment)...');
  const proofStart = Date.now();

  let identityProof;
  try {
    identityProof = await prover.proveAgentIdentity(
      {
        ownerSecret,
        agentId,
        registrationSecret,
        merkleProof,
        merklePathIndices: pathIndices,
      },
      registry.agentsRoot,
      epoch
    );
  } catch (err) {
    printError(`Proof generation failed: ${err}`);
    process.exit(1);
  }

  const proofTime = Date.now() - proofStart;

  printBox('ZK IDENTITY PROOF GENERATED', chalk.green);

  printKV('Proof Time:', `${proofTime}ms`, chalk.yellow);
  printKV('Nullifier:', truncHex(bytesToHex(identityProof.nullifier)), chalk.cyan);
  printKV('Proof A:', truncHex(bytesToHex(identityProof.proof.a)), chalk.gray);
  printKV('Proof B:', truncHex(bytesToHex(identityProof.proof.b)), chalk.gray);
  printKV('Proof C:', truncHex(bytesToHex(identityProof.proof.c)), chalk.gray);
  console.log();

  console.log(chalk.gray('  Proof verifies:'));
  console.log(chalk.gray('  - Agent is in merkle tree (membership proof)'));
  console.log(chalk.gray('  - Identity commitment is valid'));
  console.log(chalk.gray('  - Nullifier prevents double-action this epoch'));
  console.log();

  await sleep(2000);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Submit Private Signal On-Chain
  // ─────────────────────────────────────────────────────────────────────────
  printStep(4, 6, 'Submitting Private Signal On-Chain');

  const signalType = 1;  // TECHNICAL_ANALYSIS
  const direction = 1;   // LONG
  const confidence = 75;
  const magnitude = 60;
  const stakeAmount = new BN(100000000); // 0.1 SOL
  const signalSecret = crypto.randomBytes(32);

  printKV('Signal Type:', 'TECHNICAL_ANALYSIS', chalk.white);
  printKV('Direction:', 'LONG', chalk.green);
  printKV('Confidence:', `${confidence}%`, chalk.yellow);
  printKV('Magnitude:', `${magnitude}%`, chalk.yellow);
  printKV('Stake:', '0.1 SOL', chalk.yellow);
  console.log();

  // Create signal commitment
  const signalCommitment = createSignalCommitment(
    signalType,
    direction,
    confidence,
    magnitude,
    stakeAmount,
    signalSecret,
    identityProof.nullifier
  );

  printKV('Signal Commitment:', truncHex(bytesToHex(signalCommitment)), chalk.magenta);
  console.log();

  printInfo('Submitting signal to Solana devnet...');

  let signalTx: string;
  try {
    signalTx = await client.submitSignal(
      keypair,
      identityProof.proof,
      identityProof.nullifier,
      signalCommitment
    );
    printSuccess('Signal submitted on-chain');
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('already in use') || errMsg.includes('already been processed')) {
      printWarning('Nullifier already used this epoch (expected for repeat demos)');
      signalTx = 'skipped-duplicate';
    } else {
      printWarning(`Signal submission failed: ${errMsg}`);
      printInfo('Continuing with demo flow...');
      signalTx = 'skipped-error';
    }
  }

  if (signalTx && !signalTx.startsWith('skipped')) {
    printBox('SIGNAL TRANSACTION CONFIRMED', chalk.green);
    printKV('Signature:', truncHex(signalTx, 22), chalk.cyan);
    printKV('Explorer:', `https://solscan.io/tx/${signalTx}?cluster=devnet`, chalk.blue);
  }
  console.log();

  await sleep(2000);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Create Swarm Action + Vote
  // ─────────────────────────────────────────────────────────────────────────
  printStep(5, 6, 'Creating Swarm Action & Voting');

  const actionDescription = 'Execute coordinated SOL entry on breakout';
  const actionHash = crypto.createHash('sha256').update(actionDescription + Date.now()).digest();
  const threshold = 66;

  printKV('Action:', actionDescription, chalk.white);
  printKV('Action Hash:', truncHex(bytesToHex(actionHash)), chalk.magenta);
  printKV('Threshold:', `${threshold}%`, chalk.yellow);
  console.log();

  // Generate fresh nullifier for voting (different from signal)
  const voteNullifier = crypto.createHash('sha256')
    .update(Buffer.concat([identityProof.nullifier, Buffer.from('vote')]))
    .digest();

  printInfo('Creating swarm action on-chain...');

  let actionTx: string;
  try {
    actionTx = await client.createSwarmAction(
      keypair,
      identityProof.proof,
      voteNullifier,
      actionHash,
      threshold
    );
    printSuccess('Swarm action created');
    printKV('TX:', truncHex(actionTx, 22), chalk.cyan);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    printWarning(`Swarm action creation: ${errMsg.slice(0, 60)}...`);
    actionTx = 'skipped';
  }
  console.log();

  // Vote on the action
  printInfo('Casting vote with ZK proof...');

  const voteNullifier2 = crypto.createHash('sha256')
    .update(Buffer.concat([voteNullifier, Buffer.from('v2')]))
    .digest();

  let voteTx: string;
  try {
    voteTx = await client.voteSwarmAction(
      keypair,
      identityProof.proof,
      voteNullifier2,
      actionHash,
      true // YES vote
    );
    printSuccess('Vote cast on-chain');
    printKV('Vote:', 'YES', chalk.green);
    printKV('TX:', truncHex(voteTx, 22), chalk.cyan);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    printWarning(`Vote: ${errMsg.slice(0, 60)}...`);
    voteTx = 'skipped';
  }

  if (voteTx && !voteTx.startsWith('skipped')) {
    printBox('VOTE TRANSACTION CONFIRMED', chalk.green);
    printKV('Explorer:', `https://solscan.io/tx/${voteTx}?cluster=devnet`, chalk.blue);
  }
  console.log();

  await sleep(2000);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 6: Summary
  // ─────────────────────────────────────────────────────────────────────────
  printStep(6, 6, 'Demo Complete');

  console.log(chalk.gray('  ─────────────────────────────────────────────────────────────────────────────────────────────'));
  console.log();
  console.log(chalk.white('  What stayed private:'));
  console.log(chalk.gray('  - Owner secret (wallet identity)'));
  console.log(chalk.gray('  - Agent ID'));
  console.log(chalk.gray('  - Signal content (direction, confidence, magnitude)'));
  console.log(chalk.gray('  - Vote choice'));
  console.log();
  console.log(chalk.white('  What went on-chain:'));
  console.log(chalk.gray('  - Identity commitment (Poseidon hash)'));
  console.log(chalk.gray('  - Signal commitment (content hidden)'));
  console.log(chalk.gray('  - Nullifiers (prevent double-actions)'));
  console.log(chalk.gray('  - Groth16 ZK proofs (verifiable but zero-knowledge)'));
  console.log();

  printBox('MITAMA x KAMIYO COMPANION', chalk.magenta);

  console.log(chalk.gray('  ZK-private agent coordination for Solana.'));
  console.log(chalk.gray('  Built for the Solana Privacy Hack.'));
  console.log();
  console.log(chalk.gray('  Circuits: Circom + Groth16'));
  console.log(chalk.gray('  On-chain: Anchor + groth16-solana'));
  console.log(chalk.gray('  Hash: Poseidon (BN254)'));
  console.log();
  console.log(chalk.gray('  github.com/kamiyo-ai/kamiyo-protocol'));
  console.log();
}

main().catch(err => {
  printError(`Demo failed: ${err.message}`);
  process.exit(1);
});
