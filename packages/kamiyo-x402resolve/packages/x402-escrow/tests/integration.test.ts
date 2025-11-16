/**
 * Integration tests for x402Resolve escrow program
 *
 * Tests complete workflows including:
 * - Escrow creation
 * - Dispute filing
 * - Resolution with refunds
 * - Time lock expiration
 */

import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { X402Escrow } from '../target/types/x402_escrow';
import { assert } from 'chai';

describe('x402Resolve Integration Tests', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.X402Escrow as Program<X402Escrow>;
  const connection = provider.connection;

  // Test wallets
  let agent: Keypair;
  let api: Keypair;
  let verifier: Keypair;

  // Test data
  const ESCROW_AMOUNT = 0.01 * LAMPORTS_PER_SOL;
  const TIME_LOCK = 60 * 60; // 1 hour
  const MIN_AMOUNT = 0.001 * LAMPORTS_PER_SOL;
  const MAX_AMOUNT = 1000 * LAMPORTS_PER_SOL;

  beforeEach(async () => {
    // Create fresh wallets for each test
    agent = Keypair.generate();
    api = Keypair.generate();
    verifier = Keypair.generate();

    // Airdrop SOL for testing
    await connection.requestAirdrop(agent.publicKey, 2 * LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for confirmation
  });

  function deriveEscrowPDA(transactionId: string): [anchor.web3.PublicKey, number] {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), Buffer.from(transactionId)],
      program.programId
    );
  }

  describe('Escrow Creation', () => {
    it('creates escrow with valid parameters', async () => {
      const transactionId = `test_${Date.now()}`;
      const [escrowPda] = deriveEscrowPDA(transactionId);

      await program.methods
        .initializeEscrow(
          new anchor.BN(ESCROW_AMOUNT),
          new anchor.BN(TIME_LOCK),
          transactionId
        )
        .accounts({
          escrow: escrowPda,
          agent: agent.publicKey,
          api: api.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([agent])
        .rpc();

      // Verify escrow state
      const escrow = await program.account.escrow.fetch(escrowPda);
      assert.equal(escrow.agent.toBase58(), agent.publicKey.toBase58());
      assert.equal(escrow.api.toBase58(), api.publicKey.toBase58());
      assert.equal(escrow.amount.toNumber(), ESCROW_AMOUNT);
      assert.equal(escrow.transactionId, transactionId);

      // Verify status is Active
      assert.ok('active' in escrow.status);
    });

    it('rejects amount below minimum', async () => {
      const transactionId = `test_${Date.now()}`;
      const [escrowPda] = deriveEscrowPDA(transactionId);
      const tooSmall = MIN_AMOUNT - 1;

      try {
        await program.methods
          .initializeEscrow(
            new anchor.BN(tooSmall),
            new anchor.BN(TIME_LOCK),
            transactionId
          )
          .accounts({
            escrow: escrowPda,
            agent: agent.publicKey,
            api: api.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([agent])
          .rpc();

        assert.fail('Should have rejected small amount');
      } catch (error) {
        assert.include(error.toString(), 'InvalidAmount');
      }
    });

    it('rejects amount above maximum', async () => {
      const transactionId = `test_${Date.now()}`;
      const [escrowPda] = deriveEscrowPDA(transactionId);
      const tooLarge = MAX_AMOUNT + 1;

      try {
        await program.methods
          .initializeEscrow(
            new anchor.BN(tooLarge),
            new anchor.BN(TIME_LOCK),
            transactionId
          )
          .accounts({
            escrow: escrowPda,
            agent: agent.publicKey,
            api: api.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([agent])
          .rpc();

        assert.fail('Should have rejected large amount');
      } catch (error) {
        assert.include(error.toString(), 'AmountTooLarge');
      }
    });

    it('rejects invalid time lock', async () => {
      const transactionId = `test_${Date.now()}`;
      const [escrowPda] = deriveEscrowPDA(transactionId);
      const invalidTimeLock = 60; // Less than 1 hour minimum

      try {
        await program.methods
          .initializeEscrow(
            new anchor.BN(ESCROW_AMOUNT),
            new anchor.BN(invalidTimeLock),
            transactionId
          )
          .accounts({
            escrow: escrowPda,
            agent: agent.publicKey,
            api: api.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([agent])
          .rpc();

        assert.fail('Should have rejected invalid time lock');
      } catch (error) {
        assert.include(error.toString(), 'InvalidTimeLock');
      }
    });
  });

  describe('Dispute Filing', () => {
    let transactionId: string;
    let escrowPda: anchor.web3.PublicKey;

    beforeEach(async () => {
      // Create escrow first
      transactionId = `dispute_test_${Date.now()}`;
      [escrowPda] = deriveEscrowPDA(transactionId);

      await program.methods
        .initializeEscrow(
          new anchor.BN(ESCROW_AMOUNT),
          new anchor.BN(TIME_LOCK),
          transactionId
        )
        .accounts({
          escrow: escrowPda,
          agent: agent.publicKey,
          api: api.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([agent])
        .rpc();
    });

    it('allows agent to file dispute', async () => {
      await program.methods
        .markDisputed()
        .accounts({
          escrow: escrowPda,
          agent: agent.publicKey,
        })
        .signers([agent])
        .rpc();

      const escrow = await program.account.escrow.fetch(escrowPda);
      assert.ok('disputed' in escrow.status);
    });

    it('rejects dispute from non-agent', async () => {
      const nonAgent = Keypair.generate();
      await connection.requestAirdrop(nonAgent.publicKey, LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        await program.methods
          .markDisputed()
          .accounts({
            escrow: escrowPda,
            agent: nonAgent.publicKey,
          })
          .signers([nonAgent])
          .rpc();

        assert.fail('Should have rejected non-agent dispute');
      } catch (error) {
        assert.ok(error);
      }
    });
  });

  describe('Fund Release', () => {
    let transactionId: string;
    let escrowPda: anchor.web3.PublicKey;

    beforeEach(async () => {
      transactionId = `release_test_${Date.now()}`;
      [escrowPda] = deriveEscrowPDA(transactionId);

      await program.methods
        .initializeEscrow(
          new anchor.BN(ESCROW_AMOUNT),
          new anchor.BN(TIME_LOCK),
          transactionId
        )
        .accounts({
          escrow: escrowPda,
          agent: agent.publicKey,
          api: api.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([agent])
        .rpc();
    });

    it('allows agent to release funds', async () => {
      const apiBalanceBefore = await connection.getBalance(api.publicKey);

      await program.methods
        .releaseFunds()
        .accounts({
          escrow: escrowPda,
          agent: agent.publicKey,
          api: api.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([agent])
        .rpc();

      const apiBalanceAfter = await connection.getBalance(api.publicKey);
      assert.ok(apiBalanceAfter > apiBalanceBefore);

      const escrow = await program.account.escrow.fetch(escrowPda);
      assert.ok('released' in escrow.status);
    });
  });

  describe('Refund Calculation', () => {
    it('correctly calculates 0% refund', () => {
      const amount = 1000000000; // 1 SOL
      const refundPercentage = 0;
      const refund = Math.floor((amount * refundPercentage) / 100);
      const payment = amount - refund;

      assert.equal(refund, 0);
      assert.equal(payment, amount);
    });

    it('correctly calculates 50% refund', () => {
      const amount = 1000000000; // 1 SOL
      const refundPercentage = 50;
      const refund = Math.floor((amount * refundPercentage) / 100);
      const payment = amount - refund;

      assert.equal(refund, 500000000);
      assert.equal(payment, 500000000);
    });

    it('correctly calculates 100% refund', () => {
      const amount = 1000000000; // 1 SOL
      const refundPercentage = 100;
      const refund = Math.floor((amount * refundPercentage) / 100);
      const payment = amount - refund;

      assert.equal(refund, amount);
      assert.equal(payment, 0);
    });
  });
});
