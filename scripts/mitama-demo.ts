#!/usr/bin/env npx tsx
/**
 * Mitama Demo Script - Simulates the full agent flow
 * Run this in terminal while X bot posts the demo thread
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import chalk from 'chalk';
import { randomBytes } from 'crypto';

// Simulated delays for demo effect
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const DEVNET_RPC = 'https://api.devnet.solana.com';

console.clear();
console.log(chalk.magenta(`
  ███╗   ███╗██╗████████╗ █████╗ ███╗   ███╗ █████╗
  ████╗ ████║██║╚══██╔══╝██╔══██╗████╗ ████║██╔══██╗
  ██╔████╔██║██║   ██║   ███████║██╔████╔██║███████║
  ██║╚██╔╝██║██║   ██║   ██╔══██║██║╚██╔╝██║██╔══██║
  ██║ ╚═╝ ██║██║   ██║   ██║  ██║██║ ╚═╝ ██║██║  ██║
  ╚═╝     ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝
`));
console.log(chalk.gray('  御魂 - ZK-Private Agent Coordination\n'));
console.log(chalk.gray('  ─────────────────────────────────────────────────\n'));

async function runDemo() {
  const connection = new Connection(DEVNET_RPC);

  // Step 1: Generate Identity
  console.log(chalk.cyan('  [1/5] Generating Agent Identity...\n'));
  await sleep(1500);

  const ownerSecret = randomBytes(32);
  const agentId = randomBytes(32);
  const registrationSecret = randomBytes(32);

  console.log(chalk.gray('  Owner Secret:        ') + chalk.yellow(ownerSecret.toString('hex').slice(0, 32) + '...'));
  console.log(chalk.gray('  Agent ID:            ') + chalk.yellow(agentId.toString('hex').slice(0, 32) + '...'));
  console.log(chalk.gray('  Registration Secret: ') + chalk.yellow(registrationSecret.toString('hex').slice(0, 32) + '...'));
  console.log();

  await sleep(1000);

  // Step 2: Compute Identity Commitment
  console.log(chalk.cyan('  [2/5] Computing Identity Commitment (Poseidon Hash)...\n'));
  await sleep(2000);

  const commitment = randomBytes(32); // Simulated - would be Poseidon(ownerSecret, agentId, registrationSecret)
  console.log(chalk.gray('  Commitment: ') + chalk.magenta(commitment.toString('hex')));
  console.log(chalk.gray('  (This goes on-chain. Secrets stay private.)\n'));

  await sleep(1500);

  // Step 3: Register Agent (simulated)
  console.log(chalk.cyan('  [3/5] Registering Agent On-Chain...\n'));
  await sleep(1000);

  console.log(chalk.gray('  Network:    ') + chalk.white('Devnet'));
  console.log(chalk.gray('  Program:    ') + chalk.white('DmdBbvjNRLNvCQcyeUmyTi5BpDkHdGfUxGzfidgvQe26'));
  console.log(chalk.gray('  Stake:      ') + chalk.yellow('0.1 SOL'));
  console.log();

  await sleep(2000);

  const fakeTxSig = randomBytes(64).toString('hex').slice(0, 88);
  console.log(chalk.green('  ✓ ') + 'Agent registered');
  console.log(chalk.gray('  TX: ') + chalk.cyan(fakeTxSig.slice(0, 44) + '...'));
  console.log(chalk.gray('  View: ') + chalk.blue(`https://solscan.io/tx/${fakeTxSig}?cluster=devnet`));
  console.log();

  await sleep(2000);

  // Step 4: Generate ZK Signal Proof
  console.log(chalk.cyan('  [4/5] Generating ZK Signal Proof...\n'));
  await sleep(1000);

  console.log(chalk.gray('  Signal Type:  ') + chalk.white('TECHNICAL_ANALYSIS'));
  console.log(chalk.gray('  Direction:    ') + chalk.green('LONG'));
  console.log(chalk.gray('  Confidence:   ') + chalk.yellow('75%'));
  console.log(chalk.gray('  Magnitude:    ') + chalk.yellow('60%'));
  console.log();

  console.log(chalk.gray('  Generating Groth16 proof...'));
  await sleep(3000);

  const proofA = Array(8).fill(0).map(() => Math.floor(Math.random() * 1e18));
  const proofB = Array(8).fill(0).map(() => Math.floor(Math.random() * 1e18));
  const proofC = Array(8).fill(0).map(() => Math.floor(Math.random() * 1e18));
  const signalCommitment = randomBytes(32);
  const nullifier = randomBytes(32);

  console.log();
  console.log(chalk.green('  ┌─────────────────────────────────────────────┐'));
  console.log(chalk.green('  │') + chalk.white('            ZK PROOF GENERATED                ') + chalk.green('│'));
  console.log(chalk.green('  └─────────────────────────────────────────────┘'));
  console.log();
  console.log(chalk.gray('  Commitment:  ') + chalk.magenta(signalCommitment.toString('hex').slice(0, 32) + '...'));
  console.log(chalk.gray('  Nullifier:   ') + chalk.cyan(nullifier.toString('hex').slice(0, 32) + '...'));
  console.log(chalk.gray('  Proof (a):   ') + chalk.yellow(proofA.slice(0, 4).join(',') + '...'));
  console.log(chalk.gray('  Proof (b):   ') + chalk.yellow(proofB.slice(0, 4).join(',') + '...'));
  console.log(chalk.gray('  Proof (c):   ') + chalk.yellow(proofC.slice(0, 4).join(',') + '...'));
  console.log();

  await sleep(2000);

  // Step 5: Swarm Vote
  console.log(chalk.cyan('  [5/5] Casting Swarm Vote...\n'));
  await sleep(1000);

  const actionHash = randomBytes(32);
  console.log(chalk.gray('  Action:      ') + chalk.white('"Execute coordinated SOL entry"'));
  console.log(chalk.gray('  Action Hash: ') + chalk.magenta(actionHash.toString('hex').slice(0, 32) + '...'));
  console.log(chalk.gray('  Vote:        ') + chalk.green('YES'));
  console.log(chalk.gray('  Threshold:   ') + chalk.yellow('66%'));
  console.log();

  console.log(chalk.gray('  Generating vote proof...'));
  await sleep(2500);

  const voteCommitment = randomBytes(32);
  const voteNullifier = randomBytes(32);

  console.log();
  console.log(chalk.green('  ✓ ') + 'Vote proof generated');
  console.log(chalk.gray('  Vote Commitment: ') + chalk.magenta(voteCommitment.toString('hex').slice(0, 32) + '...'));
  console.log(chalk.gray('  Vote Nullifier:  ') + chalk.cyan(voteNullifier.toString('hex').slice(0, 32) + '...'));
  console.log();

  await sleep(1500);

  // Summary
  console.log(chalk.gray('  ─────────────────────────────────────────────────\n'));
  console.log(chalk.green('  Demo Complete\n'));
  console.log(chalk.gray('  What stayed private:'));
  console.log(chalk.gray('  • Owner identity (wallet address)'));
  console.log(chalk.gray('  • Which agent submitted the signal'));
  console.log(chalk.gray('  • Individual vote choice'));
  console.log();
  console.log(chalk.gray('  What went on-chain:'));
  console.log(chalk.gray('  • Identity commitment (hash only)'));
  console.log(chalk.gray('  • Signal commitment (content hidden)'));
  console.log(chalk.gray('  • Vote nullifier (prevents double-voting)'));
  console.log(chalk.gray('  • ZK proofs (verifiable but zero-knowledge)'));
  console.log();
}

runDemo().catch(console.error);
