#!/usr/bin/env npx tsx
/**
 * SwarmTeams - Private Reputation Proofs Demo
 * Solana Privacy Hackathon Submission
 *
 * Demonstrates: Agent proves reputation threshold without revealing
 * which agent, actual score, or transaction history.
 */

import chalk from 'chalk';
import { randomBytes } from 'crypto';
import * as path from 'path';

// Dynamic imports for ESM modules
let snarkjs: typeof import('snarkjs');
let circomlibjs: typeof import('circomlibjs');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const CIRCUITS_PATH = path.resolve(__dirname, '../circuits/build/swarmteams');

console.clear();
console.log(chalk.cyan(`
  ███████╗██╗    ██╗ █████╗ ██████╗ ███╗   ███╗████████╗███████╗ █████╗ ███╗   ███╗███████╗
  ██╔════╝██║    ██║██╔══██╗██╔══██╗████╗ ████║╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██╔════╝
  ███████╗██║ █╗ ██║███████║██████╔╝██╔████╔██║   ██║   █████╗  ███████║██╔████╔██║███████╗
  ╚════██║██║███╗██║██╔══██║██╔══██╗██║╚██╔╝██║   ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║╚════██║
  ███████║╚███╔███╔╝██║  ██║██║  ██║██║ ╚═╝ ██║   ██║   ███████╗██║  ██║██║ ╚═╝ ██║███████║
  ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝
`));
console.log(chalk.gray('  Private Reputation Proofs for AI Agents\n'));
console.log(chalk.gray('  "Prove you\'re trustworthy without revealing who you are"\n'));
console.log(chalk.gray('  ─────────────────────────────────────────────────────────────────────────\n'));

interface AgentSecrets {
  ownerSecret: Uint8Array;
  agentId: Uint8Array;
  registrationSecret: Uint8Array;
  reputationSecret: Uint8Array;
}

interface AgentReputation {
  score: number;
  transactionCount: number;
}

interface MerkleProof {
  path: Uint8Array[];
  indices: number[];
  root: Uint8Array;
}

async function loadDependencies() {
  snarkjs = await import('snarkjs');
  circomlibjs = await import('circomlibjs');
}

async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await circomlibjs.buildPoseidon();
  const hash = poseidon(inputs);
  return poseidon.F.toObject(hash);
}

function bytesToBigint(arr: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = 0; i < arr.length; i++) {
    result = (result << BigInt(8)) | BigInt(arr[i]);
  }
  return result;
}

function bigintToBytes32(n: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let temp = n;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(temp & BigInt(0xff));
    temp = temp >> BigInt(8);
  }
  return bytes;
}

async function generateIdentityCommitment(secrets: AgentSecrets): Promise<Uint8Array> {
  const hash = await poseidonHash([
    bytesToBigint(secrets.ownerSecret),
    bytesToBigint(secrets.agentId),
    bytesToBigint(secrets.registrationSecret),
  ]);
  return bigintToBytes32(hash);
}

async function generateNullifier(secrets: AgentSecrets, epoch: bigint): Promise<Uint8Array> {
  const hash = await poseidonHash([
    bytesToBigint(secrets.ownerSecret),
    bytesToBigint(secrets.agentId),
    bytesToBigint(secrets.registrationSecret),
    epoch,
  ]);
  return bigintToBytes32(hash);
}

async function generateMerkleProofWithRoot(commitment: Uint8Array, treeDepth: number = 20): Promise<MerkleProof> {
  const path: Uint8Array[] = [];
  const indices: number[] = [];

  // Generate random siblings
  for (let i = 0; i < treeDepth; i++) {
    path.push(new Uint8Array(randomBytes(32)));
    indices.push(Math.random() > 0.5 ? 1 : 0);
  }

  // Compute the actual root from commitment and path
  let currentHash = bytesToBigint(commitment);

  for (let i = 0; i < treeDepth; i++) {
    const sibling = bytesToBigint(path[i]);
    if (indices[i] === 0) {
      // Current is left child
      currentHash = await poseidonHash([currentHash, sibling]);
    } else {
      // Current is right child
      currentHash = await poseidonHash([sibling, currentHash]);
    }
  }

  return {
    path,
    indices,
    root: bigintToBytes32(currentHash),
  };
}

async function runDemo() {
  await loadDependencies();

  // =========================================================================
  // Step 1: Agent Registration (happened in the past)
  // =========================================================================
  console.log(chalk.cyan('  [1/5] Agent Registration (already completed)\n'));
  await sleep(1000);

  const secrets: AgentSecrets = {
    ownerSecret: new Uint8Array(randomBytes(32)),
    agentId: new Uint8Array(randomBytes(32)),
    registrationSecret: new Uint8Array(randomBytes(32)),
    reputationSecret: new Uint8Array(randomBytes(32)),
  };

  const commitment = await generateIdentityCommitment(secrets);

  console.log(chalk.gray('  Agent registered with stake-backed identity'));
  console.log(chalk.gray('  Commitment: ') + chalk.magenta(Buffer.from(commitment).toString('hex').slice(0, 32) + '...'));
  console.log(chalk.gray('  (Identity secrets kept private by agent)\n'));

  await sleep(1500);

  // =========================================================================
  // Step 2: Build Reputation History
  // =========================================================================
  console.log(chalk.cyan('  [2/5] Reputation History (from escrow outcomes)\n'));
  await sleep(1000);

  const reputation: AgentReputation = {
    score: 92,
    transactionCount: 127,
  };

  console.log(chalk.gray('  Agent completed 127 escrow agreements through KAMIYO Protocol'));
  console.log(chalk.gray('  Reputation Score: ') + chalk.green(`${reputation.score}%`));
  console.log(chalk.gray('  Transaction Count: ') + chalk.yellow(`${reputation.transactionCount}`));
  console.log(chalk.gray('  (History is on-chain but NOT linked to agent identity)\n'));

  await sleep(2000);

  // =========================================================================
  // Step 3: Service Requests Proof
  // =========================================================================
  console.log(chalk.cyan('  [3/5] Service Provider Sets Requirements\n'));
  await sleep(1000);

  const threshold = {
    minReputation: 85,
    minTransactions: 50,
  };

  console.log(chalk.gray('  API Provider: "Premium Market Data Feed"'));
  console.log(chalk.gray('  Required Reputation: ') + chalk.yellow(`>= ${threshold.minReputation}%`));
  console.log(chalk.gray('  Required Transactions: ') + chalk.yellow(`>= ${threshold.minTransactions}`));
  console.log(chalk.gray('  Daily Limit: ') + chalk.green('$2,000'));
  console.log(chalk.gray('  Payment Rail: ') + chalk.cyan('ShadowWire + Blindfold Card\n'));

  await sleep(2000);

  // =========================================================================
  // Step 4: Generate ZK Proof
  // =========================================================================
  console.log(chalk.cyan('  [4/5] Generating Zero-Knowledge Proof...\n'));
  await sleep(1000);

  const epoch = BigInt(Math.floor(Date.now() / (24 * 60 * 60 * 1000)));
  const nullifier = await generateNullifier(secrets, epoch);
  const merkleProof = await generateMerkleProofWithRoot(commitment);

  console.log(chalk.gray('  Proving:'));
  console.log(chalk.white('    "I am a registered agent AND my reputation >= 85% AND tx count >= 50"'));
  console.log();
  console.log(chalk.gray('  Without revealing:'));
  console.log(chalk.gray('    - Which agent I am'));
  console.log(chalk.gray('    - My actual reputation score (92%)'));
  console.log(chalk.gray('    - My transaction count (127)'));
  console.log(chalk.gray('    - My transaction history'));
  console.log();

  console.log(chalk.gray('  Generating Groth16 proof...'));

  const startTime = Date.now();

  // Build circuit inputs
  const circuitInputs = {
    // Public inputs
    agents_root: bytesToBigint(merkleProof.root).toString(),
    min_reputation: threshold.minReputation.toString(),
    min_transactions: threshold.minTransactions.toString(),
    nullifier: bytesToBigint(nullifier).toString(),

    // Private inputs - identity
    owner_secret: bytesToBigint(secrets.ownerSecret).toString(),
    agent_id: bytesToBigint(secrets.agentId).toString(),
    registration_secret: bytesToBigint(secrets.registrationSecret).toString(),
    merkle_path: merkleProof.path.map(p => bytesToBigint(p).toString()),
    path_indices: merkleProof.indices.map(i => i.toString()),

    // Private inputs - reputation
    reputation_score: reputation.score.toString(),
    transaction_count: reputation.transactionCount.toString(),
    reputation_secret: bytesToBigint(secrets.reputationSecret).toString(),
    epoch: epoch.toString(),
  };

  try {
    const wasmPath = path.join(CIRCUITS_PATH, 'agent_reputation_js/agent_reputation.wasm');
    const zkeyPath = path.join(CIRCUITS_PATH, 'agent_reputation_final.zkey');

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      wasmPath,
      zkeyPath
    );

    const proofTime = Date.now() - startTime;

    console.log();
    console.log(chalk.green('  ┌──────────────────────────────────────────────────────────────────────┐'));
    console.log(chalk.green('  │') + chalk.white('                    ZERO-KNOWLEDGE PROOF GENERATED                    ') + chalk.green('│'));
    console.log(chalk.green('  └──────────────────────────────────────────────────────────────────────┘'));
    console.log();
    console.log(chalk.gray('  Proof Time: ') + chalk.yellow(`${proofTime}ms`));
    console.log();
    console.log(chalk.gray('  Public Inputs (verifier sees):'));
    console.log(chalk.gray('    Agents Root:       ') + chalk.cyan(publicSignals[0].slice(0, 20) + '...'));
    console.log(chalk.gray('    Min Reputation:    ') + chalk.yellow(`${publicSignals[1]} (threshold only)`));
    console.log(chalk.gray('    Min Transactions:  ') + chalk.yellow(`${publicSignals[2]} (threshold only)`));
    console.log(chalk.gray('    Nullifier:         ') + chalk.cyan(publicSignals[3].slice(0, 20) + '...'));
    console.log();
    console.log(chalk.gray('  Proof (verifiable but reveals nothing):'));
    console.log(chalk.gray('    pi_a: ') + chalk.yellow(`[${proof.pi_a[0].slice(0, 16)}..., ${proof.pi_a[1].slice(0, 16)}...]`));
    console.log(chalk.gray('    pi_b: ') + chalk.yellow(`[[...], [...]]`));
    console.log(chalk.gray('    pi_c: ') + chalk.yellow(`[${proof.pi_c[0].slice(0, 16)}..., ${proof.pi_c[1].slice(0, 16)}...]`));
    console.log();

    await sleep(2000);

    // =========================================================================
    // Step 5: Verify and Unlock
    // =========================================================================
    console.log(chalk.cyan('  [5/5] Service Provider Verifies Proof\n'));
    await sleep(1000);

    const vkeyPath = path.join(CIRCUITS_PATH, 'agent_reputation_vk.json');
    const vkey = await import(vkeyPath);

    const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

    if (isValid) {
      console.log(chalk.green('  ✓ ') + chalk.white('Proof verified successfully\n'));
      console.log(chalk.gray('  Verifier confirms:'));
      console.log(chalk.gray('    - Agent is registered in the merkle tree'));
      console.log(chalk.gray('    - Agent reputation >= 85%'));
      console.log(chalk.gray('    - Agent transaction count >= 50'));
      console.log(chalk.gray('    - Nullifier is valid for this epoch'));
      console.log();
      console.log(chalk.gray('  Verifier does NOT know:'));
      console.log(chalk.gray('    - Which agent submitted the proof'));
      console.log(chalk.gray('    - The actual reputation score'));
      console.log(chalk.gray('    - The actual transaction count'));
      console.log(chalk.gray('    - Any transaction history'));
      console.log();
      console.log(chalk.green('  ┌──────────────────────────────────────────────────────────────────────┐'));
      console.log(chalk.green('  │') + chalk.white('                    PAYMENT RAIL UNLOCKED                              ') + chalk.green('│'));
      console.log(chalk.green('  └──────────────────────────────────────────────────────────────────────┘'));
      console.log();
      console.log(chalk.gray('  Agent can now use:'));
      console.log(chalk.cyan('    - ShadowWire private transfers (up to $2,000/day)'));
      console.log(chalk.cyan('    - Blindfold privacy card (premium tier)'));
      console.log();
    } else {
      console.log(chalk.red('  ✗ ') + chalk.white('Proof verification failed\n'));
    }

  } catch (error) {
    console.log(chalk.red('  Error generating proof:'), error);
    console.log(chalk.gray('  Make sure circuits are compiled: bash circuits/scripts/setup-agent-reputation.sh'));
    return;
  }

  // Summary
  console.log(chalk.gray('  ─────────────────────────────────────────────────────────────────────────\n'));
  console.log(chalk.white('  Demo Summary\n'));
  console.log(chalk.gray('  The agent proved it meets reputation requirements without revealing:'));
  console.log(chalk.gray('  • Identity (wallet, agent ID, owner)'));
  console.log(chalk.gray('  • Actual reputation score (only that it exceeds threshold)'));
  console.log(chalk.gray('  • Transaction count (only that it exceeds minimum)'));
  console.log(chalk.gray('  • Transaction history'));
  console.log();
  console.log(chalk.gray('  The service provider knows:'));
  console.log(chalk.gray('  • The agent is registered and active'));
  console.log(chalk.gray('  • The agent meets the reputation threshold'));
  console.log(chalk.gray('  • The proof is valid and cannot be reused (nullifier)'));
  console.log();
  console.log(chalk.cyan('  Trust without identity. That\'s SwarmTeams.\n'));
}

runDemo().catch(console.error);
