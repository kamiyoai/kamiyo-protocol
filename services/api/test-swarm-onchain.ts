#!/usr/bin/env npx ts-node
// Test swarm vote on-chain verification

import { config } from 'dotenv';
config({ path: '.env' });

import chalk from 'chalk';
import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as crypto from 'crypto';
import { SwarmTeamsClient, SwarmTeamsProver, MerkleTree, generateAgentId } from '@kamiyo/hive';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CIRCUITS_PATH = process.env.CIRCUITS_PATH || path.resolve(__dirname, '../../circuits/build/swarmteams');

async function main() {
  console.log(chalk.cyan('\n  SWARM VOTE ON-CHAIN VERIFICATION TEST'));
  console.log(chalk.gray('  ─────────────────────────────────────────\n'));

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const walletSecret = process.env.DEMO_WALLET_SECRET!;
  if (!walletSecret) {
    console.log(chalk.red('  DEMO_WALLET_SECRET not set'));
    return;
  }
  const keypair = Keypair.fromSecretKey(Buffer.from(walletSecret, 'base64'));

  console.log(chalk.gray('  Wallet:'), chalk.white(keypair.publicKey.toBase58().slice(0, 12) + '...'));

  // Generate identity secrets (same as registration)
  const seed = crypto.createHash('sha256').update(keypair.secretKey).digest();
  const ownerSecret = seed.subarray(0, 32);
  const agentId = await generateAgentId(keypair.publicKey.toBytes(), 0);
  const registrationSecret = crypto.createHash('sha256').update(Buffer.concat([seed, Buffer.from('reg')])).digest();

  // Get on-chain registry
  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new SwarmTeamsClient(provider);
  const registry = await client.getRegistry();

  if (!registry) {
    console.log(chalk.red('  Registry not found!'));
    return;
  }

  console.log(chalk.gray('  Registry epoch:'), chalk.yellow(registry.epoch.toString()));
  console.log(chalk.gray('  Agents root:'), chalk.magenta(bytesToHex(registry.agentsRoot).slice(0, 24) + '...'));

  // Load merkle tree
  const treeData = fs.readFileSync('data/merkle-tree.json', 'utf8');
  const tree = await MerkleTree.deserialize(treeData);
  const { proof: merkleProof, pathIndices } = await tree.generateProof(0);

  // Create a unique action hash for this test
  const actionDescription = `LONG BTC - test ${Date.now()}`;
  const actionHashBytes = crypto.createHash('sha256').update(actionDescription).digest();

  // Vote parameters
  const vote = true; // YES
  const voteSalt = crypto.randomBytes(32);

  console.log();
  console.log(chalk.cyan('  Proposal:'), chalk.white(actionDescription.slice(0, 40) + '...'));
  console.log(chalk.cyan('  Vote:'), chalk.green('YES'));
  console.log(chalk.cyan('  Action hash:'), chalk.magenta(bytesToHex(actionHashBytes).slice(0, 24) + '...'));
  console.log();

  // Step 1: Generate ZK proof using SwarmTeamsProver
  console.log(chalk.yellow('  [1/3] Generating ZK proof...'));
  const proofStart = Date.now();

  const prover = new SwarmTeamsProver(CIRCUITS_PATH);

  const { proof, voteNullifier, voteCommitment } = await prover.proveSwarmVote(
    {
      ownerSecret,
      agentId,
      registrationSecret,
      merkleProof,
      merklePathIndices: pathIndices,
      vote,
      voteSalt,
    },
    registry.agentsRoot,
    actionHashBytes
  );

  const proofElapsed = Date.now() - proofStart;
  console.log(chalk.green('  Proof generated in'), chalk.yellow(`${proofElapsed}ms`));
  console.log(chalk.gray('  Vote nullifier:'), chalk.cyan(bytesToHex(voteNullifier).slice(0, 32) + '...'));
  console.log(chalk.gray('  Vote commitment:'), chalk.magenta(bytesToHex(voteCommitment).slice(0, 32) + '...'));
  console.log();

  // Step 2: Create swarm action if it doesn't exist
  console.log(chalk.yellow('  [2/4] Checking/Creating swarm action on-chain...'));

  let swarmAction = await client.getSwarmAction(actionHashBytes);
  let createTxSig: string | null = null;

  if (!swarmAction) {
    console.log(chalk.gray('  Action does not exist, creating...'));

    // Generate identity proof for creating action (uses agent_identity circuit)
    const epoch = BigInt(registry.epoch.toString());
    const identityResult = await prover.proveAgentIdentity(
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

    try {
      createTxSig = await client.createSwarmAction(
        keypair,
        identityResult.proof,
        identityResult.nullifier,
        actionHashBytes,
        51 // 51% threshold
      );
      console.log(chalk.green('  Swarm action created!'));
      console.log(chalk.gray('  TX:'), chalk.cyan(createTxSig));
      console.log(chalk.gray('  Solscan:'), chalk.blue(`https://solscan.io/tx/${createTxSig}?cluster=devnet`));
    } catch (err: any) {
      console.log(chalk.red('  Failed to create action:'), err.message || err);
      return;
    }
  } else {
    console.log(chalk.gray('  Action already exists'));
  }

  // Step 3: Submit vote on-chain
  console.log();
  console.log(chalk.yellow('  [3/4] Submitting vote on-chain...'));
  const submitStart = Date.now();

  try {
    const voteTxSig = await client.voteSwarmAction(
      keypair,
      proof,
      voteNullifier,
      voteCommitment,
      actionHashBytes
    );

    const submitElapsed = Date.now() - submitStart;

    console.log(chalk.green('  Vote submitted!'));
    console.log(chalk.gray('  TX:'), chalk.cyan(voteTxSig));
    console.log(chalk.gray('  Solscan:'), chalk.blue(`https://solscan.io/tx/${voteTxSig}?cluster=devnet`));
    console.log(chalk.gray('  Submit time:'), chalk.yellow(`${submitElapsed}ms`));

    // Step 4: Summary
    console.log();
    console.log(chalk.green('  ┌─────────────────────────────────────────────┐'));
    console.log(chalk.green('  │') + chalk.white('        SWARM VOTE VERIFIED ON-CHAIN          ') + chalk.green('│'));
    console.log(chalk.green('  └─────────────────────────────────────────────┘'));
    console.log();

    console.log(chalk.cyan('  Transaction Links:'));
    if (createTxSig) {
      console.log(chalk.gray('  Create Action:'), chalk.blue(`https://solscan.io/tx/${createTxSig}?cluster=devnet`));
    }
    console.log(chalk.gray('  Vote TX:      '), chalk.blue(`https://solscan.io/tx/${voteTxSig}?cluster=devnet`));
    console.log();

    console.log(chalk.cyan('  On-chain verification confirmed:'));
    console.log(chalk.gray('  - Groth16 proof verified by Solana program'));
    console.log(chalk.gray('  - Vote nullifier recorded (prevents double voting)'));
    console.log(chalk.gray('  - Vote commitment stored (hidden until reveal)'));
    console.log(chalk.gray('  - Proof time:'), chalk.yellow(`${proofElapsed}ms`));
    console.log(chalk.gray('  - Total time:'), chalk.yellow(`${proofElapsed + submitElapsed}ms`));
    console.log();

  } catch (err: any) {
    console.log(chalk.red('  Vote submission failed:'), err.message || err);
  }
}

main().catch(console.error);
