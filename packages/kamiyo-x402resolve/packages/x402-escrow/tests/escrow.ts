import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { X402Escrow } from "../target/types/x402_escrow";
import { expect } from "chai";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

describe("x402-escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.X402Escrow as Program<X402Escrow>;

  const agent = provider.wallet as anchor.Wallet;
  let api: Keypair;
  let verifier: Keypair;

  const ESCROW_AMOUNT = 0.01 * LAMPORTS_PER_SOL;
  const TIME_LOCK = 86400;

  beforeEach(() => {
    api = Keypair.generate();
    verifier = Keypair.generate();
  });

  describe("initialize_escrow", () => {
    it("creates escrow with correct parameters", async () => {
      const transactionId = `tx_${Date.now()}`;
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), Buffer.from(transactionId)],
        program.programId
      );

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
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const escrowAccount = await program.account.escrow.fetch(escrowPda);

      expect(escrowAccount.agent.toBase58()).to.equal(agent.publicKey.toBase58());
      expect(escrowAccount.api.toBase58()).to.equal(api.publicKey.toBase58());
      expect(escrowAccount.amount.toNumber()).to.equal(ESCROW_AMOUNT);
      expect(escrowAccount.transactionId).to.equal(transactionId);
      expect(escrowAccount.status).to.deep.equal({ active: {} });
    });

    it("transfers SOL to escrow PDA", async () => {
      const transactionId = `tx_${Date.now()}`;
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), Buffer.from(transactionId)],
        program.programId
      );

      const balanceBefore = await provider.connection.getBalance(escrowPda);

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
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const balanceAfter = await provider.connection.getBalance(escrowPda);
      const transferred = balanceAfter - balanceBefore;

      expect(transferred).to.be.greaterThan(ESCROW_AMOUNT * 0.99);
    });
  });

  describe("mark_disputed", () => {
    let transactionId: string;
    let escrowPda: PublicKey;

    beforeEach(async () => {
      transactionId = `tx_${Date.now()}`;
      [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), Buffer.from(transactionId)],
        program.programId
      );

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
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("marks escrow as disputed", async () => {
      await program.methods
        .markDisputed()
        .accounts({
          escrow: escrowPda,
          agent: agent.publicKey,
        })
        .rpc();

      const escrowAccount = await program.account.escrow.fetch(escrowPda);
      expect(escrowAccount.status).to.deep.equal({ disputed: {} });
    });

    it("fails if not called by agent", async () => {
      const unauthorizedAgent = Keypair.generate();

      try {
        await program.methods
          .markDisputed()
          .accounts({
            escrow: escrowPda,
            agent: unauthorizedAgent.publicKey,
          })
          .signers([unauthorizedAgent])
          .rpc();

        expect.fail("Should have thrown error");
      } catch (err) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });
  });

  describe("resolve_dispute", () => {
    let transactionId: string;
    let escrowPda: PublicKey;

    beforeEach(async () => {
      transactionId = `tx_${Date.now()}`;
      [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), Buffer.from(transactionId)],
        program.programId
      );

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
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .markDisputed()
        .accounts({
          escrow: escrowPda,
          agent: agent.publicKey,
        })
        .rpc();
    });

    it("resolves with 100% refund for score 0-20", async () => {
      const qualityScore = 15;
      const refundPercentage = 100;
      const signature = new Array(64).fill(0);

      const agentBalanceBefore = await provider.connection.getBalance(agent.publicKey);
      const apiBalanceBefore = await provider.connection.getBalance(api.publicKey);

      await program.methods
        .resolveDispute(qualityScore, refundPercentage, signature)
        .accounts({
          escrow: escrowPda,
          agent: agent.publicKey,
          api: api.publicKey,
          verifier: verifier.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const agentBalanceAfter = await provider.connection.getBalance(agent.publicKey);
      const apiBalanceAfter = await provider.connection.getBalance(api.publicKey);

      const agentGain = agentBalanceAfter - agentBalanceBefore;
      const apiGain = apiBalanceAfter - apiBalanceBefore;

      expect(agentGain).to.be.greaterThan(ESCROW_AMOUNT * 0.99);
      expect(apiGain).to.equal(0);

      const escrowAccount = await program.account.escrow.fetch(escrowPda);
      expect(escrowAccount.status).to.deep.equal({ resolved: {} });
      expect(escrowAccount.qualityScore).to.equal(qualityScore);
      expect(escrowAccount.refundPercentage).to.equal(refundPercentage);
    });

    it("resolves with 75% refund for score 21-40", async () => {
      const qualityScore = 35;
      const refundPercentage = 75;
      const signature = new Array(64).fill(0);

      const agentBalanceBefore = await provider.connection.getBalance(agent.publicKey);
      const apiBalanceBefore = await provider.connection.getBalance(api.publicKey);

      await program.methods
        .resolveDispute(qualityScore, refundPercentage, signature)
        .accounts({
          escrow: escrowPda,
          agent: agent.publicKey,
          api: api.publicKey,
          verifier: verifier.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const agentBalanceAfter = await provider.connection.getBalance(agent.publicKey);
      const apiBalanceAfter = await provider.connection.getBalance(api.publicKey);

      const agentGain = agentBalanceAfter - agentBalanceBefore;
      const apiGain = apiBalanceAfter - apiBalanceBefore;

      expect(agentGain).to.be.closeTo(ESCROW_AMOUNT * 0.75, ESCROW_AMOUNT * 0.01);
      expect(apiGain).to.be.closeTo(ESCROW_AMOUNT * 0.25, ESCROW_AMOUNT * 0.01);
    });

    it("resolves with 50% refund for score 41-60", async () => {
      const qualityScore = 55;
      const refundPercentage = 50;
      const signature = new Array(64).fill(0);

      const agentBalanceBefore = await provider.connection.getBalance(agent.publicKey);
      const apiBalanceBefore = await provider.connection.getBalance(api.publicKey);

      await program.methods
        .resolveDispute(qualityScore, refundPercentage, signature)
        .accounts({
          escrow: escrowPda,
          agent: agent.publicKey,
          api: api.publicKey,
          verifier: verifier.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const agentBalanceAfter = await provider.connection.getBalance(agent.publicKey);
      const apiBalanceAfter = await provider.connection.getBalance(api.publicKey);

      const agentGain = agentBalanceAfter - agentBalanceBefore;
      const apiGain = apiBalanceAfter - apiBalanceBefore;

      expect(agentGain).to.be.closeTo(ESCROW_AMOUNT * 0.50, ESCROW_AMOUNT * 0.01);
      expect(apiGain).to.be.closeTo(ESCROW_AMOUNT * 0.50, ESCROW_AMOUNT * 0.01);
    });

    it("resolves with 25% refund for score 61-80", async () => {
      const qualityScore = 75;
      const refundPercentage = 25;
      const signature = new Array(64).fill(0);

      const agentBalanceBefore = await provider.connection.getBalance(agent.publicKey);
      const apiBalanceBefore = await provider.connection.getBalance(api.publicKey);

      await program.methods
        .resolveDispute(qualityScore, refundPercentage, signature)
        .accounts({
          escrow: escrowPda,
          agent: agent.publicKey,
          api: api.publicKey,
          verifier: verifier.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const agentBalanceAfter = await provider.connection.getBalance(agent.publicKey);
      const apiBalanceAfter = await provider.connection.getBalance(api.publicKey);

      const agentGain = agentBalanceAfter - agentBalanceBefore;
      const apiGain = apiBalanceAfter - apiBalanceBefore;

      expect(agentGain).to.be.closeTo(ESCROW_AMOUNT * 0.25, ESCROW_AMOUNT * 0.01);
      expect(apiGain).to.be.closeTo(ESCROW_AMOUNT * 0.75, ESCROW_AMOUNT * 0.01);
    });

    it("resolves with 0% refund for score 81-100", async () => {
      const qualityScore = 95;
      const refundPercentage = 0;
      const signature = new Array(64).fill(0);

      const agentBalanceBefore = await provider.connection.getBalance(agent.publicKey);
      const apiBalanceBefore = await provider.connection.getBalance(api.publicKey);

      await program.methods
        .resolveDispute(qualityScore, refundPercentage, signature)
        .accounts({
          escrow: escrowPda,
          agent: agent.publicKey,
          api: api.publicKey,
          verifier: verifier.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const agentBalanceAfter = await provider.connection.getBalance(agent.publicKey);
      const apiBalanceAfter = await provider.connection.getBalance(api.publicKey);

      const agentGain = agentBalanceAfter - agentBalanceBefore;
      const apiGain = apiBalanceAfter - apiBalanceBefore;

      expect(agentGain).to.equal(0);
      expect(apiGain).to.be.greaterThan(ESCROW_AMOUNT * 0.99);
    });

    it("rejects invalid quality score > 100", async () => {
      const qualityScore = 150;
      const refundPercentage = 0;
      const signature = new Array(64).fill(0);

      try {
        await program.methods
          .resolveDispute(qualityScore, refundPercentage, signature)
          .accounts({
            escrow: escrowPda,
            agent: agent.publicKey,
            api: api.publicKey,
            verifier: verifier.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have thrown error");
      } catch (err) {
        expect(err.toString()).to.include("InvalidQualityScore");
      }
    });

    it("rejects invalid refund percentage > 100", async () => {
      const qualityScore = 50;
      const refundPercentage = 150;
      const signature = new Array(64).fill(0);

      try {
        await program.methods
          .resolveDispute(qualityScore, refundPercentage, signature)
          .accounts({
            escrow: escrowPda,
            agent: agent.publicKey,
            api: api.publicKey,
            verifier: verifier.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have thrown error");
      } catch (err) {
        expect(err.toString()).to.include("InvalidRefundPercentage");
      }
    });

    it("accepts valid oracle signature format", async () => {
      const qualityScore = 75;
      const refundPercentage = 25;
      const signature = new Array(64).fill(0);

      const agentBalanceBefore = await provider.connection.getBalance(agent.publicKey);
      const apiBalanceBefore = await provider.connection.getBalance(api.publicKey);

      await program.methods
        .resolveDispute(qualityScore, refundPercentage, signature)
        .accounts({
          escrow: escrowPda,
          agent: agent.publicKey,
          api: api.publicKey,
          verifier: verifier.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const escrowAccount = await program.account.escrow.fetch(escrowPda);
      expect(escrowAccount.status).to.deep.equal({ resolved: {} });
    });
  });

  describe("release_funds", () => {
    let transactionId: string;
    let escrowPda: PublicKey;

    beforeEach(async () => {
      transactionId = `tx_${Date.now()}`;
      [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), Buffer.from(transactionId)],
        program.programId
      );

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
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("releases funds to API after time-lock", async () => {
      const apiBalanceBefore = await provider.connection.getBalance(api.publicKey);

      await program.methods
        .releaseFunds()
        .accounts({
          escrow: escrowPda,
          agent: agent.publicKey,
          api: api.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const apiBalanceAfter = await provider.connection.getBalance(api.publicKey);
      const apiGain = apiBalanceAfter - apiBalanceBefore;

      expect(apiGain).to.be.greaterThan(ESCROW_AMOUNT * 0.99);

      const escrowAccount = await program.account.escrow.fetch(escrowPda);
      expect(escrowAccount.status).to.deep.equal({ released: {} });
    });

    it("allows agent to release explicitly", async () => {
      const apiBalanceBefore = await provider.connection.getBalance(api.publicKey);

      await program.methods
        .releaseFunds()
        .accounts({
          escrow: escrowPda,
          agent: agent.publicKey,
          api: api.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const apiBalanceAfter = await provider.connection.getBalance(api.publicKey);
      const apiGain = apiBalanceAfter - apiBalanceBefore;

      expect(apiGain).to.be.greaterThan(ESCROW_AMOUNT * 0.99);
    });
  });
});
