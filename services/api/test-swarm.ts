#!/usr/bin/env npx ts-node
// Test swarm vote ZK proof generation

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function bytesToBigint(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  console.log(chalk.cyan('\n  SWARM VOTE ZK PROOF TEST'));
  console.log(chalk.gray('  ─────────────────────────────────────────\n'));

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const walletSecret = process.env.DEMO_WALLET_SECRET!;
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

  // Create a test action hash (e.g., "LONG BTC")
  const actionDescription = 'LONG BTC - breakout imminent';
  const actionHashBytes = crypto.createHash('sha256').update(actionDescription).digest();

  // Vote parameters
  const vote = true; // YES (true = approve)
  const voteSalt = crypto.randomBytes(32);

  console.log();
  console.log(chalk.cyan('  Proposal:'), chalk.white(actionDescription));
  console.log(chalk.cyan('  Vote:'), chalk.green('YES'));
  console.log(chalk.cyan('  Action hash:'), chalk.magenta(bytesToHex(actionHashBytes).slice(0, 24) + '...'));
  console.log();

  console.log(chalk.yellow('  Generating ZK proof...'));
  const start = Date.now();

  // Initialize prover
  const circuitsPath = process.env.CIRCUITS_PATH || path.resolve(__dirname, '../../circuits/build/swarmteams');
  const prover = new SwarmTeamsProver(circuitsPath);

  try {
    const { proof, voteNullifier, voteCommitment } = await prover.proveSwarmVote({
      ownerSecret,
      agentId,
      registrationSecret,
      merkleProof,
      merklePathIndices: pathIndices,
      vote,
      voteSalt,
    }, registry.agentsRoot, actionHashBytes);

    const elapsed = Date.now() - start;

    console.log();
    console.log(chalk.green('  ┌─────────────────────────────────────────────┐'));
    console.log(chalk.green('  │') + chalk.white('         SWARM VOTE ZK PROOF GENERATED        ') + chalk.green('│'));
    console.log(chalk.green('  └─────────────────────────────────────────────┘'));
    console.log();
    console.log(chalk.gray('  Proof time:'), chalk.yellow(`${elapsed}ms`));
    console.log(chalk.gray('  Vote nullifier:'), chalk.cyan(bytesToHex(voteNullifier).slice(0, 32) + '...'));
    console.log(chalk.gray('  Vote commitment:'), chalk.magenta(bytesToHex(voteCommitment).slice(0, 32) + '...'));
    console.log();
    console.log(chalk.gray('  Proof (a):'), chalk.yellow(bytesToHex(proof.a).slice(0, 32) + '...'));
    console.log(chalk.gray('  Proof (b):'), chalk.yellow(bytesToHex(proof.b).slice(0, 32) + '...'));
    console.log(chalk.gray('  Proof (c):'), chalk.yellow(bytesToHex(proof.c).slice(0, 32) + '...'));
    console.log();
    console.log(chalk.cyan('  ZK proof verifies:'));
    console.log(chalk.gray('  • Agent is in merkle tree (registered)'));
    console.log(chalk.gray('  • Vote is valid (0 or 1)'));
    console.log(chalk.gray('  • Nullifier prevents double voting'));
    console.log(chalk.gray('  • Identity stays private'));
    console.log();

  } catch (err) {
    console.log(chalk.red('  Proof generation failed:'), err);
  }
}

main().catch(console.error);
