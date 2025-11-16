/**
 * x402Resolve Escrow Demo
 * Demonstrates full escrow lifecycle with dispute resolution
 */

import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { X402Escrow } from '../target/types/x402_escrow';

// Program ID on devnet
const PROGRAM_ID = new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n');

// Demo configuration
const DEMO_AMOUNT = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL
const TIME_LOCK = 3600; // 1 hour
const TRANSACTION_ID = `demo_tx_${Date.now()}`;

async function main() {
  console.log(' x402Resolve Escrow Demo\n');

  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.X402Escrow as Program<X402Escrow>;

  // Demo accounts
  const agent = provider.wallet as anchor.Wallet;
  const api = Keypair.generate();
  const verifier = Keypair.generate();

  console.log('📋 Demo Configuration:');
  console.log(`   Agent: ${agent.publicKey.toBase58()}`);
  console.log(`   API: ${api.publicKey.toBase58()}`);
  console.log(`   Verifier: ${verifier.publicKey.toBase58()}`);
  console.log(`   Amount: ${DEMO_AMOUNT / LAMPORTS_PER_SOL} SOL`);
  console.log(`   Time Lock: ${TIME_LOCK / 3600} hours`);
  console.log(`   Transaction ID: ${TRANSACTION_ID}\n`);

  // Derive escrow PDA
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), Buffer.from(TRANSACTION_ID)],
    program.programId
  );

  console.log(`   Escrow PDA: ${escrowPda.toBase58()}\n`);

  // ============================================================================
  // Scenario 1: Happy Path (No Dispute)
  // ============================================================================

  console.log('📦 Scenario 1: Happy Path (No Dispute)\n');

  try {
    console.log('1⃣  Initializing escrow...');
    const tx1 = await program.methods
      .initializeEscrow(
        new anchor.BN(DEMO_AMOUNT),
        new anchor.BN(TIME_LOCK),
        TRANSACTION_ID
      )
      .accounts({
        escrow: escrowPda,
        agent: agent.publicKey,
        api: api.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`    Escrow initialized: ${tx1}`);
    console.log(`    View on Explorer: https://explorer.solana.com/tx/${tx1}?cluster=devnet\n`);

    // Check escrow state
    const escrowAccount = await program.account.escrow.fetch(escrowPda);
    console.log('   Escrow State:');
    console.log(`     Status: Active`);
    console.log(`     Amount: ${escrowAccount.amount.toNumber() / LAMPORTS_PER_SOL} SOL`);
    console.log(`     Created: ${new Date(escrowAccount.createdAt.toNumber() * 1000).toISOString()}`);
    console.log(`     Expires: ${new Date(escrowAccount.expiresAt.toNumber() * 1000).toISOString()}\n`);

    console.log('2⃣  Agent releases funds (happy with service)...');
    const tx2 = await program.methods
      .releaseFunds()
      .accounts({
        escrow: escrowPda,
        agent: agent.publicKey,
        api: api.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`    Funds released to API: ${tx2}`);
    console.log(`    View on Explorer: https://explorer.solana.com/tx/${tx2}?cluster=devnet\n`);

    const escrowAfterRelease = await program.account.escrow.fetch(escrowPda);
    console.log('    Happy path completed successfully!\n');

  } catch (error) {
    console.error('    Error in happy path:', error.message);
  }

  // ============================================================================
  // Scenario 2: Dispute Resolution
  // ============================================================================

  console.log('\n⚖  Scenario 2: Dispute Resolution\n');

  const DISPUTE_TX_ID = `dispute_tx_${Date.now()}`;
  const [disputeEscrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), Buffer.from(DISPUTE_TX_ID)],
    program.programId
  );

  try {
    console.log('1⃣  Initializing new escrow...');
    const tx3 = await program.methods
      .initializeEscrow(
        new anchor.BN(DEMO_AMOUNT),
        new anchor.BN(TIME_LOCK),
        DISPUTE_TX_ID
      )
      .accounts({
        escrow: disputeEscrowPda,
        agent: agent.publicKey,
        api: api.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`    Escrow initialized: ${tx3}\n`);

    console.log('2⃣  Agent marks escrow as disputed...');
    const tx4 = await program.methods
      .markDisputed()
      .accounts({
        escrow: disputeEscrowPda,
        agent: agent.publicKey,
      })
      .rpc();

    console.log(`    Dispute marked: ${tx4}`);
    console.log(`    View on Explorer: https://explorer.solana.com/tx/${tx4}?cluster=devnet\n`);

    console.log('3⃣  Verifier resolves dispute (50% refund)...');

    // Quality score 50 = 50% refund
    const qualityScore = 50;
    const refundPercentage = 50;
    const dummySignature = new Array(64).fill(0);

    const tx5 = await program.methods
      .resolveDispute(qualityScore, refundPercentage, dummySignature)
      .accounts({
        escrow: disputeEscrowPda,
        agent: agent.publicKey,
        api: api.publicKey,
        verifier: verifier.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`    Dispute resolved: ${tx5}`);
    console.log(`    View on Explorer: https://explorer.solana.com/tx/${tx5}?cluster=devnet\n`);

    const resolvedEscrow = await program.account.escrow.fetch(disputeEscrowPda);
    console.log('   Resolution Details:');
    console.log(`     Quality Score: ${resolvedEscrow.qualityScore}`);
    console.log(`     Refund: ${resolvedEscrow.refundPercentage}%`);
    console.log(`     Refund Amount: ${(DEMO_AMOUNT * refundPercentage / 100) / LAMPORTS_PER_SOL} SOL to agent`);
    console.log(`     Payment Amount: ${(DEMO_AMOUNT * (100 - refundPercentage) / 100) / LAMPORTS_PER_SOL} SOL to API\n`);

    console.log('    Dispute resolution completed successfully!\n');

  } catch (error) {
    console.error('    Error in dispute resolution:', error.message);
  }

  // ============================================================================
  // Scenario 3: Time Lock Expiration
  // ============================================================================

  console.log('\n⏰ Scenario 3: Time Lock Auto-Release\n');
  console.log('   ℹ  This scenario requires waiting for time lock to expire');
  console.log('   ℹ  In production, anyone can release after expiration\n');

  const EXPIRED_TX_ID = `expired_tx_${Date.now()}`;
  const SHORT_TIME_LOCK = 60; // 1 minute for demo
  const [expiredEscrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), Buffer.from(EXPIRED_TX_ID)],
    program.programId
  );

  try {
    console.log('1⃣  Initializing escrow with short time lock...');
    const tx6 = await program.methods
      .initializeEscrow(
        new anchor.BN(DEMO_AMOUNT),
        new anchor.BN(SHORT_TIME_LOCK),
        EXPIRED_TX_ID
      )
      .accounts({
        escrow: expiredEscrowPda,
        agent: agent.publicKey,
        api: api.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`    Escrow initialized with ${SHORT_TIME_LOCK}s time lock: ${tx6}\n`);
    console.log('   ℹ  Wait 60 seconds and then anyone can call release_funds()\n');

  } catch (error) {
    console.error('    Error:', error.message);
  }

  // ============================================================================
  // Summary
  // ============================================================================

  console.log('\n Demo Summary\n');
  console.log('Demonstrated:');
  console.log('   Escrow initialization with validation');
  console.log('   Happy path fund release');
  console.log('   Dispute marking');
  console.log('   Dispute resolution with sliding scale refunds');
  console.log('   Event emissions (check Explorer for events)');
  console.log('   Time lock mechanism\n');

  console.log('Program Features:');
  console.log('  • Input validation (amount, time lock, transaction ID)');
  console.log('  • Dispute window enforcement');
  console.log('  • Sliding scale refunds (0-100%)');
  console.log('  • Event emissions for indexing');
  console.log('  • PDA-based escrow accounts\n');

  console.log('Demo completed.\n');
}

// Run demo
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
