#!/usr/bin/env npx tsx
/**
 * Register bot as Mitama agent on devnet
 *
 * This script:
 * 1. Generates identity secrets for the bot
 * 2. Computes identity commitment
 * 3. Registers agent on-chain
 * 4. Updates the agents_root merkle tree
 */

import { config } from 'dotenv';
config({ path: 'services/api/.env' });
import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, BN, Wallet } from '@coral-xyz/anchor';
import {
  MitamaClient,
  MitamaProver,
  createMerkleTree,
  generateOwnerSecret,
  generateRegistrationSecret,
  generateAgentId,
} from '@kamiyo/kamiyo-swarmteams';

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
  const client = new MitamaClient(provider);

  console.log('Bot wallet:', keypair.publicKey.toBase58());

  // Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('Balance:', (balance / 1e9).toFixed(4), 'SOL');

  if (balance < 0.2 * 1e9) {
    console.error('Insufficient balance. Need at least 0.2 SOL');
    process.exit(1);
  }

  // Check registry
  const registry = await client.getRegistry();
  if (!registry) {
    console.error('Registry not initialized on devnet');
    process.exit(1);
  }

  console.log('Registry found:');
  console.log('  Authority:', registry.authority.toBase58());
  console.log('  Agent count:', registry.agentCount);
  console.log('  Min stake:', (registry.minStake.toNumber() / 1e9).toFixed(4), 'SOL');

  // Generate identity secrets (deterministic based on wallet)
  // Use a fixed seed so we get the same commitment each time
  const crypto = await import('crypto');
  const seed = crypto.createHash('sha256').update(keypair.secretKey).digest();

  const ownerSecret = seed.subarray(0, 32);
  const agentId = await generateAgentId(keypair.publicKey.toBytes(), 0);
  const registrationSecret = crypto.createHash('sha256').update(Buffer.concat([seed, Buffer.from('reg')])).digest();

  // Compute identity commitment
  const commitment = await MitamaProver.generateIdentityCommitment(
    ownerSecret,
    agentId,
    registrationSecret
  );

  const commitmentHex = Buffer.from(commitment).toString('hex');
  console.log('\nIdentity commitment:', commitmentHex);

  // Check if already registered
  const existingAgent = await client.getAgent(commitment);
  if (existingAgent) {
    console.log('\nAgent already registered on-chain');
    console.log('  Stake:', (existingAgent.stake.toNumber() / 1e9).toFixed(4), 'SOL');
    console.log('  Signal count:', existingAgent.signalCount);
    console.log('  Active:', existingAgent.active);

    // Get PDA
    const [agentPDA] = MitamaClient.getAgentPDA(commitment);
    console.log('  PDA:', agentPDA.toBase58());
    return;
  }

  // Register agent
  console.log('\nRegistering agent on-chain...');
  const stakeAmount = new BN(registry.minStake.toNumber() * 10); // 10x min stake

  try {
    const txSig = await client.registerAgent(keypair, commitment, stakeAmount);
    console.log('Registered! TX:', txSig);
    console.log('Explorer:', `https://explorer.solana.com/tx/${txSig}?cluster=devnet`);

    // Get PDA
    const [agentPDA] = MitamaClient.getAgentPDA(commitment);
    console.log('Agent PDA:', agentPDA.toBase58());

    // Print secrets for storage
    console.log('\n--- Store these in the bot database ---');
    console.log('identity_commitment:', commitmentHex);
    console.log('owner_secret:', Buffer.from(ownerSecret).toString('hex'));
    console.log('agent_id:', Buffer.from(agentId).toString('hex'));
    console.log('registration_secret:', Buffer.from(registrationSecret).toString('hex'));
  } catch (err) {
    console.error('Registration failed:', err);
    process.exit(1);
  }
}

main().catch(console.error);
