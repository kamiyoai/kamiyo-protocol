#!/usr/bin/env npx tsx
/**
 * Initialize the new Hive program on devnet
 *
 * Steps:
 * 1. Initialize registry
 * 2. Register bot agent
 * 3. Update agents_root merkle tree
 */

import { config } from 'dotenv';
config({ path: '.env' });

import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, BN, Wallet } from '@coral-xyz/anchor';
import * as crypto from 'crypto';
import {
  HiveClient,
  HiveProver,
  createMerkleTree,
  generateAgentId,
} from '@kamiyo/hive';
import * as fs from 'fs';

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const walletSecret = process.env.DEMO_WALLET_SECRET;

  if (!walletSecret) {
    console.error('DEMO_WALLET_SECRET not set');
    process.exit(1);
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const keypair = Keypair.fromSecretKey(Buffer.from(walletSecret, 'base64'));
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new HiveClient(provider);

  console.log('Bot wallet:', keypair.publicKey.toBase58());

  // Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('Balance:', (balance / 1e9).toFixed(4), 'SOL');

  if (balance < 0.2 * 1e9) {
    console.error('Insufficient balance. Need at least 0.2 SOL');
    process.exit(1);
  }

  // Step 1: Initialize registry if needed
  let registry = await client.getRegistry();
  if (registry) {
    console.log('\nRegistry already exists:');
    console.log('  Authority:', registry.authority.toBase58());
    console.log('  Agent count:', registry.agentCount);
    console.log('  Min stake:', (registry.minStake.toNumber() / 1e9).toFixed(4), 'SOL');
  } else {
    console.log('\nStep 1: Initializing registry...');
    const txSig = await client.initializeRegistry(keypair, {
      minStake: new BN(5_000_000), // 0.005 SOL
      minSignalConfidence: 50,
    });
    console.log('Registry initialized:', txSig);
    console.log('Explorer: https://explorer.solana.com/tx/' + txSig + '?cluster=devnet');

    // Fetch updated registry
    registry = await client.getRegistry();
  }

  // Step 2: Generate identity and register agent
  console.log('\nStep 2: Setting up agent identity...');

  // Generate identity secrets (deterministic based on wallet)
  const seed = crypto.createHash('sha256').update(keypair.secretKey).digest();
  const ownerSecret = seed.subarray(0, 32);
  const agentId = await generateAgentId(keypair.publicKey.toBytes(), 0);
  const registrationSecret = crypto.createHash('sha256')
    .update(Buffer.concat([seed, Buffer.from('reg')]))
    .digest();

  // Compute identity commitment
  const commitment = await HiveProver.generateIdentityCommitment(
    ownerSecret,
    agentId,
    registrationSecret
  );

  const commitmentHex = Buffer.from(commitment).toString('hex');
  console.log('Identity commitment:', commitmentHex.slice(0, 32) + '...');

  // Check if agent already registered
  const existingAgent = await client.getAgent(commitment);
  if (existingAgent) {
    console.log('Agent already registered:');
    console.log('  Stake:', (existingAgent.stake.toNumber() / 1e9).toFixed(4), 'SOL');
    console.log('  Signal count:', existingAgent.signalCount);
    console.log('  Active:', existingAgent.active);
  } else {
    console.log('Registering agent on-chain...');
    const stakeAmount = new BN(registry!.minStake.toNumber() * 10); // 10x min stake
    const txSig = await client.registerAgent(keypair, commitment, stakeAmount);
    console.log('Agent registered:', txSig);
    console.log('Explorer: https://explorer.solana.com/tx/' + txSig + '?cluster=devnet');
  }

  // Step 3: Create merkle tree with agent's commitment
  console.log('\nStep 3: Creating merkle tree...');

  // Create tree and add agent's commitment as leaf
  const tree = await createMerkleTree(20);
  await tree.addLeaf(commitment);
  const rootBytes = await tree.getRoot();

  // Log root as hex
  const rootHex = Buffer.from(rootBytes).toString('hex');
  console.log('Merkle root:', rootHex.slice(0, 32) + '...');

  // Update on-chain agents_root
  console.log('Updating agents_root on-chain...');
  const txSig = await client.updateAgentsRoot(keypair, rootBytes, 1);
  console.log('Agents root updated:', txSig);
  console.log('Explorer: https://explorer.solana.com/tx/' + txSig + '?cluster=devnet');

  // Save merkle tree to file
  const treeData = tree.serialize();
  fs.writeFileSync('data/merkle-tree.json', treeData);
  console.log('Merkle tree saved to data/merkle-tree.json');

  // Print secrets for reference
  console.log('\n--- Agent Identity Secrets ---');
  console.log('identity_commitment:', commitmentHex);
  console.log('owner_secret:', Buffer.from(ownerSecret).toString('hex'));
  console.log('agent_id:', Buffer.from(agentId).toString('hex'));
  console.log('registration_secret:', Buffer.from(registrationSecret).toString('hex'));

  console.log('\nDone! New program initialized and bot registered.');
}

main().catch(console.error);
