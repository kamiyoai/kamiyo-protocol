#!/usr/bin/env npx tsx
/**
 * Test SwarmTeams agent signal submission on devnet
 */

import { config } from 'dotenv';
config({ path: '.env' });

import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, BN, Wallet } from '@coral-xyz/anchor';
import { SwarmTeamsAgentClient } from './src/swarmteams-agent';

async function main() {
  console.log('Initializing SwarmTeams agent...');

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

  const agent = new SwarmTeamsAgentClient(connection, keypair, provider);

  console.log('Agent initialized. Public key:', agent.publicKey.toBase58());
  console.log('Is registered:', agent.isRegistered());

  const commitment = agent.getIdentityCommitment();
  console.log('Identity commitment:', commitment?.slice(0, 32) + '...');

  console.log('\nSubmitting test signal...');
  // submitSignal(signalType, direction, confidence, magnitude, stakeAmount, tweetId?)
  // signalType: 0=SENTIMENT, 1=TA, 2=ON-CHAIN, 3=NEWS
  // direction: 0=SHORT, 1=LONG, 2=NEUTRAL
  const result = await agent.submitSignal(
    0,    // SENTIMENT
    1,    // LONG
    75,   // 75% confidence
    50,   // 50% magnitude
    new BN(5_000_000) // 0.005 SOL
  );

  console.log('Signal submitted!');
  console.log('  Commitment:', result.commitment.slice(0, 32) + '...');
  console.log('  TX signature:', result.txSignature || 'local only');
}

main().catch(console.error);
