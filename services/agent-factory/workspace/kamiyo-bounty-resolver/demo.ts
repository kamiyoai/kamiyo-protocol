/**
 * KAMIYO Bounty Resolver Demo
 * Demonstrates the autonomously-built bounty escrow system
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { BountyResolverClient, solToLamports, createDeadline, lamportsToSol } from './sdk';

const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
const DEVNET_RPC = 'https://api.devnet.solana.com';

async function demo() {
  console.log('='.repeat(60));
  console.log('KAMIYO Bounty Resolver - Autonomous Agent Demo');
  console.log('='.repeat(60));
  console.log();

  // Connect to devnet for demo (use mainnet for production)
  const connection = new Connection(DEVNET_RPC, 'confirmed');

  // For demo, generate ephemeral keypairs
  // In production, agents would use their own wallets
  const creator = Keypair.generate();
  const worker = Keypair.generate();

  console.log('Demo Accounts:');
  console.log(`  Creator: ${creator.publicKey.toBase58()}`);
  console.log(`  Worker:  ${worker.publicKey.toBase58()}`);
  console.log();

  // Airdrop some SOL for testing (devnet only)
  console.log('Requesting airdrops...');
  try {
    await connection.requestAirdrop(creator.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.requestAirdrop(worker.publicKey, 0.1 * LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for confirmation
    console.log('  Airdrops received');
  } catch (e) {
    console.log('  Airdrop failed (may already have SOL or rate limited)');
  }

  // Create provider and client
  const wallet = new Wallet(creator);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new BountyResolverClient(provider);

  // Step 1: Create a bounty
  console.log();
  console.log('Step 1: Creating bounty...');
  const bountyId = new BN(Date.now()); // Use timestamp as unique ID
  const rewardAmount = solToLamports(0.1); // 0.1 SOL reward
  const description = 'Generate a market analysis report for KAMIYO token';
  const deadline = createDeadline(24); // 24 hours from now

  const [bountyPda] = BountyResolverClient.deriveBountyPda(creator.publicKey, bountyId);
  console.log(`  Bounty PDA: ${bountyPda.toBase58()}`);

  try {
    const createTx = await client.createBounty(
      creator,
      bountyId,
      rewardAmount,
      description,
      deadline
    );
    console.log(`  Create TX: ${createTx}`);
    console.log(`  Reward: ${lamportsToSol(rewardAmount)} SOL`);
  } catch (e: any) {
    console.log(`  Error: ${e.message}`);
    return;
  }

  // Step 2: Fetch bounty to verify
  console.log();
  console.log('Step 2: Verifying bounty...');
  const bounty = await client.getBounty(bountyPda);
  if (bounty) {
    console.log(`  Status: ${JSON.stringify(bounty.status)}`);
    console.log(`  Description: ${bounty.description}`);
    console.log(`  Reward: ${lamportsToSol(bounty.rewardAmount)} SOL`);
  }

  // Step 3: Worker submits work
  console.log();
  console.log('Step 3: Worker submitting work...');
  const workerWallet = new Wallet(worker);
  const workerProvider = new AnchorProvider(connection, workerWallet, { commitment: 'confirmed' });
  const workerClient = new BountyResolverClient(workerProvider);

  try {
    const submitTx = await workerClient.submitWork(
      worker,
      bountyPda,
      'KAMIYO Market Analysis Report v1.0 - Comprehensive analysis of token metrics...',
      'ipfs://QmXyz123...demo-submission'
    );
    console.log(`  Submit TX: ${submitTx}`);
  } catch (e: any) {
    console.log(`  Error: ${e.message}`);
    return;
  }

  // Step 4: Creator resolves bounty (accepts work)
  console.log();
  console.log('Step 4: Creator resolving bounty...');
  try {
    const resolveTx = await client.resolveBounty(
      creator,
      bountyPda,
      worker.publicKey,
      true // Accept the work
    );
    console.log(`  Resolve TX: ${resolveTx}`);
    console.log(`  Work accepted! Worker paid ${lamportsToSol(rewardAmount)} SOL`);
  } catch (e: any) {
    console.log(`  Error: ${e.message}`);
    return;
  }

  // Step 5: Final verification
  console.log();
  console.log('Step 5: Final verification...');
  const finalBounty = await client.getBounty(bountyPda);
  if (finalBounty) {
    console.log(`  Final Status: ${JSON.stringify(finalBounty.status)}`);
    console.log(`  Worker: ${finalBounty.worker.toBase58()}`);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Demo complete! The bounty lifecycle:');
  console.log('  1. Creator posts bounty with SOL reward');
  console.log('  2. Worker claims and submits work');
  console.log('  3. Creator reviews and accepts/rejects');
  console.log('  4. SOL automatically settles to winner');
  console.log('='.repeat(60));
}

// Run demo
demo().catch(console.error);
