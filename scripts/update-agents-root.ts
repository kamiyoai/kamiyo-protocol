#!/usr/bin/env npx tsx
/**
 * Update agents_root merkle tree on devnet
 *
 * This script creates a merkle tree with all registered agents
 * and updates the on-chain agents_root.
 */

import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import {
  MitamaClient,
  MitamaProver,
  createMerkleTree,
  generateAgentId,
} from '@kamiyo/kamiyo-mitama';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Load authority keypair from default Solana config
const authorityKeypairPath = path.join(process.env.HOME || '', '.config/solana/id.json');

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  // Load authority keypair
  if (!fs.existsSync(authorityKeypairPath)) {
    console.error('Authority keypair not found at', authorityKeypairPath);
    process.exit(1);
  }

  const authoritySecret = JSON.parse(fs.readFileSync(authorityKeypairPath, 'utf8'));
  const authorityKeypair = Keypair.fromSecretKey(Uint8Array.from(authoritySecret));

  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new Wallet(authorityKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new MitamaClient(provider);

  console.log('Authority:', authorityKeypair.publicKey.toBase58());

  // Check registry
  const registry = await client.getRegistry();
  if (!registry) {
    console.error('Registry not initialized');
    process.exit(1);
  }

  console.log('Current agents_root:', Buffer.from(registry.agentsRoot).toString('hex'));
  console.log('Agent count:', registry.agentCount);

  // Load bot wallet secret from .env
  const envPath = path.join(process.cwd(), 'services/api/.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars: Record<string, string> = {};
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) envVars[match[1]] = match[2];
  }

  const botWalletSecret = envVars.DEMO_WALLET_SECRET;
  if (!botWalletSecret) {
    console.error('DEMO_WALLET_SECRET not set');
    process.exit(1);
  }

  const botKeypair = Keypair.fromSecretKey(Buffer.from(botWalletSecret, 'base64'));
  console.log('Bot wallet:', botKeypair.publicKey.toBase58());

  // Generate bot's identity commitment (deterministic)
  const seed = crypto.createHash('sha256').update(Buffer.from(botKeypair.secretKey)).digest();
  const ownerSecret = new Uint8Array(seed.subarray(0, 32));
  const agentId = await generateAgentId(botKeypair.publicKey.toBytes(), 0);
  const registrationSecret = new Uint8Array(
    crypto.createHash('sha256').update(Buffer.concat([seed, Buffer.from('reg')])).digest()
  );

  const botCommitment = await MitamaProver.generateIdentityCommitment(
    ownerSecret,
    agentId,
    registrationSecret
  );

  console.log('Bot commitment:', Buffer.from(botCommitment).toString('hex'));

  // Verify bot is registered
  const botAgent = await client.getAgent(botCommitment);
  if (!botAgent) {
    console.error('Bot not registered on-chain. Run register-bot-devnet.ts first.');
    process.exit(1);
  }

  console.log('Bot agent found:', {
    stake: (botAgent.stake.toNumber() / 1e9).toFixed(4) + ' SOL',
    signalCount: botAgent.signalCount,
    active: botAgent.active
  });

  // Create merkle tree with bot's commitment
  // In production, this would include all registered agents
  console.log('\nCreating merkle tree...');
  const tree = await createMerkleTree(20);

  // Add bot's commitment as the first leaf
  await tree.addLeaf(botCommitment);

  // Get new root
  const newRoot = await tree.getRoot();
  console.log('New agents_root:', Buffer.from(newRoot).toString('hex'));

  // Generate merkle proof for bot (leaf index 0)
  const proof = await tree.generateProof(0);
  console.log('Merkle proof generated for bot at index 0');

  // Save merkle tree state for later use
  const treeData = tree.serialize();
  const treePath = 'services/api/data/merkle-tree.json';
  fs.mkdirSync(path.dirname(treePath), { recursive: true });
  // treeData is already JSON string from serialize(), don't double-stringify
  fs.writeFileSync(treePath, treeData);
  console.log('Merkle tree saved to', treePath);

  // Update agents_root on-chain
  console.log('\nUpdating agents_root on-chain...');
  try {
    const txSig = await client.updateAgentsRoot(authorityKeypair, newRoot);
    console.log('Updated! TX:', txSig);
    console.log('Explorer:', `https://explorer.solana.com/tx/${txSig}?cluster=devnet`);
  } catch (err) {
    console.error('Update failed:', err);
    process.exit(1);
  }

  // Verify update
  const updatedRegistry = await client.getRegistry();
  console.log('\nNew agents_root:', Buffer.from(updatedRegistry!.agentsRoot).toString('hex'));

  // Print bot's merkle proof data for storage
  console.log('\n--- Bot merkle proof data ---');
  console.log('Leaf index: 0');
  console.log('Merkle path:', proof.path.map(p => Buffer.from(p).toString('hex')));
  console.log('Path indices:', proof.indices);
}

main().catch(console.error);
