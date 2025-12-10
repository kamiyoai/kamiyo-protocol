import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

// Import IDL (will be generated after build)
// import { Mitama } from "../target/types/mitama";

describe("Mitama - Agent Identity & Conflict Resolution", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load program
  const program = anchor.workspace.Mitama as Program<any>;

  // Test accounts
  const owner = Keypair.generate();
  const provider2 = Keypair.generate();
  let agentPDA: PublicKey;
  let agentBump: number;
  let escrowPDA: PublicKey;
  let escrowBump: number;
  let reputationPDA: PublicKey;
  let reputationBump: number;

  const transactionId = `test-${Date.now()}`;

  before(async () => {
    // Airdrop SOL to test accounts
    const airdropSig = await provider.connection.requestAirdrop(
      owner.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const airdropSig2 = await provider.connection.requestAirdrop(
      provider2.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig2);

    // Derive PDAs
    [agentPDA, agentBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), owner.publicKey.toBuffer()],
      program.programId
    );

    [escrowPDA, escrowBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(transactionId)],
      program.programId
    );

    [reputationPDA, reputationBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("reputation"), owner.publicKey.toBuffer()],
      program.programId
    );
  });

  // ============================================================================
  // Agent Identity Tests
  // ============================================================================

  describe("Agent Identity", () => {
    it("Creates an agent with stake", async () => {
      const name = "TestAgent";
      const agentType = { trading: {} }; // AgentType::Trading
      const stakeAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);

      await program.methods
        .createAgent(name, agentType, stakeAmount)
        .accounts({
          agent: agentPDA,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Fetch and verify
      const agent = await program.account.agentIdentity.fetch(agentPDA);
      expect(agent.name).to.equal(name);
      expect(agent.owner.toString()).to.equal(owner.publicKey.toString());
      expect(agent.isActive).to.be.true;
      expect(agent.reputation.toNumber()).to.equal(500); // Default reputation
      expect(agent.stakeAmount.toNumber()).to.equal(stakeAmount.toNumber());
    });

    it("Fails to create agent with insufficient stake", async () => {
      const owner2 = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        owner2.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      const [agent2PDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("agent"), owner2.publicKey.toBuffer()],
        program.programId
      );

      const insufficientStake = new anchor.BN(0.01 * LAMPORTS_PER_SOL); // Below 0.1 SOL minimum

      try {
        await program.methods
          .createAgent("LowStake", { trading: {} }, insufficientStake)
          .accounts({
            agent: agent2PDA,
            owner: owner2.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner2])
          .rpc();
        expect.fail("Should have thrown InsufficientStake error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("InsufficientStake");
      }
    });

    it("Fails to create agent with invalid name", async () => {
      const owner3 = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        owner3.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      const [agent3PDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("agent"), owner3.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .createAgent("", { trading: {} }, new anchor.BN(0.5 * LAMPORTS_PER_SOL))
          .accounts({
            agent: agent3PDA,
            owner: owner3.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner3])
          .rpc();
        expect.fail("Should have thrown InvalidAgentName error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("InvalidAgentName");
      }
    });
  });

  // ============================================================================
  // Agreement (Escrow) Tests
  // ============================================================================

  describe("Agreements (Escrow)", () => {
    it("Initializes an escrow agreement", async () => {
      const amount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
      const timeLock = new anchor.BN(3600); // 1 hour

      await program.methods
        .initializeEscrow(amount, timeLock, transactionId, false)
        .accounts({
          escrow: escrowPDA,
          agent: owner.publicKey,
          api: provider2.publicKey,
          systemProgram: SystemProgram.programId,
          tokenMint: null,
          escrowTokenAccount: null,
          agentTokenAccount: null,
          tokenProgram: null,
          associatedTokenProgram: null,
        })
        .signers([owner])
        .rpc();

      // Fetch and verify
      const escrow = await program.account.escrow.fetch(escrowPDA);
      expect(escrow.agent.toString()).to.equal(owner.publicKey.toString());
      expect(escrow.api.toString()).to.equal(provider2.publicKey.toString());
      expect(escrow.amount.toNumber()).to.equal(amount.toNumber());
      expect(escrow.transactionId).to.equal(transactionId);
      expect(escrow.status).to.deep.equal({ active: {} });
    });

    it("Fails to create escrow with invalid time lock", async () => {
      const newTxId = `test-invalid-${Date.now()}`;
      const [newEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), Buffer.from(newTxId)],
        program.programId
      );

      const amount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
      const invalidTimeLock = new anchor.BN(60); // Only 60 seconds - below 1 hour minimum

      try {
        await program.methods
          .initializeEscrow(amount, invalidTimeLock, newTxId, false)
          .accounts({
            escrow: newEscrowPDA,
            agent: owner.publicKey,
            api: provider2.publicKey,
            systemProgram: SystemProgram.programId,
            tokenMint: null,
            escrowTokenAccount: null,
            agentTokenAccount: null,
            tokenProgram: null,
            associatedTokenProgram: null,
          })
          .signers([owner])
          .rpc();
        expect.fail("Should have thrown InvalidTimeLock error");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.message).to.include("InvalidTimeLock");
      }
    });

    it("Releases funds to provider (happy path)", async () => {
      // Create a new escrow for release test
      const releaseTxId = `release-${Date.now()}`;
      const [releaseEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), Buffer.from(releaseTxId)],
        program.programId
      );

      const amount = new anchor.BN(0.05 * LAMPORTS_PER_SOL);
      const timeLock = new anchor.BN(3600);

      await program.methods
        .initializeEscrow(amount, timeLock, releaseTxId, false)
        .accounts({
          escrow: releaseEscrowPDA,
          agent: owner.publicKey,
          api: provider2.publicKey,
          systemProgram: SystemProgram.programId,
          tokenMint: null,
          escrowTokenAccount: null,
          agentTokenAccount: null,
          tokenProgram: null,
          associatedTokenProgram: null,
        })
        .signers([owner])
        .rpc();

      const providerBalanceBefore = await provider.connection.getBalance(provider2.publicKey);

      // Agent releases funds
      await program.methods
        .releaseFunds()
        .accounts({
          escrow: releaseEscrowPDA,
          agent: owner.publicKey,
          api: provider2.publicKey,
          systemProgram: SystemProgram.programId,
          escrowTokenAccount: null,
          apiTokenAccount: null,
          tokenProgram: null,
        })
        .signers([owner])
        .rpc();

      // Verify escrow status
      const escrow = await program.account.escrow.fetch(releaseEscrowPDA);
      expect(escrow.status).to.deep.equal({ released: {} });

      // Verify provider received funds
      const providerBalanceAfter = await provider.connection.getBalance(provider2.publicKey);
      expect(providerBalanceAfter - providerBalanceBefore).to.equal(amount.toNumber());
    });
  });

  // ============================================================================
  // Reputation Tests
  // ============================================================================

  describe("Reputation", () => {
    it("Initializes reputation for an entity", async () => {
      await program.methods
        .initReputation()
        .accounts({
          reputation: reputationPDA,
          entity: owner.publicKey,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const reputation = await program.account.entityReputation.fetch(reputationPDA);
      expect(reputation.entity.toString()).to.equal(owner.publicKey.toString());
      expect(reputation.totalTransactions.toNumber()).to.equal(0);
      expect(reputation.reputationScore).to.equal(500); // Default score
    });
  });

  // ============================================================================
  // Dispute Tests
  // ============================================================================

  describe("Disputes", () => {
    it("Marks an escrow as disputed", async () => {
      // Create a new escrow for dispute test
      const disputeTxId = `dispute-${Date.now()}`;
      const [disputeEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), Buffer.from(disputeTxId)],
        program.programId
      );

      const amount = new anchor.BN(0.05 * LAMPORTS_PER_SOL);
      const timeLock = new anchor.BN(3600);

      // Initialize escrow
      await program.methods
        .initializeEscrow(amount, timeLock, disputeTxId, false)
        .accounts({
          escrow: disputeEscrowPDA,
          agent: owner.publicKey,
          api: provider2.publicKey,
          systemProgram: SystemProgram.programId,
          tokenMint: null,
          escrowTokenAccount: null,
          agentTokenAccount: null,
          tokenProgram: null,
          associatedTokenProgram: null,
        })
        .signers([owner])
        .rpc();

      // Mark as disputed
      await program.methods
        .markDisputed()
        .accounts({
          escrow: disputeEscrowPDA,
          reputation: reputationPDA,
          agent: owner.publicKey,
        })
        .signers([owner])
        .rpc();

      // Verify
      const escrow = await program.account.escrow.fetch(disputeEscrowPDA);
      expect(escrow.status).to.deep.equal({ disputed: {} });

      const reputation = await program.account.entityReputation.fetch(reputationPDA);
      expect(reputation.disputesFiled.toNumber()).to.be.greaterThan(0);
    });

    it("Cannot dispute an already released escrow", async () => {
      // Create and release an escrow
      const releasedTxId = `released-dispute-${Date.now()}`;
      const [releasedEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), Buffer.from(releasedTxId)],
        program.programId
      );

      const amount = new anchor.BN(0.02 * LAMPORTS_PER_SOL);
      const timeLock = new anchor.BN(3600);

      await program.methods
        .initializeEscrow(amount, timeLock, releasedTxId, false)
        .accounts({
          escrow: releasedEscrowPDA,
          agent: owner.publicKey,
          api: provider2.publicKey,
          systemProgram: SystemProgram.programId,
          tokenMint: null,
          escrowTokenAccount: null,
          agentTokenAccount: null,
          tokenProgram: null,
          associatedTokenProgram: null,
        })
        .signers([owner])
        .rpc();

      // Release it
      await program.methods
        .releaseFunds()
        .accounts({
          escrow: releasedEscrowPDA,
          agent: owner.publicKey,
          api: provider2.publicKey,
          systemProgram: SystemProgram.programId,
          escrowTokenAccount: null,
          apiTokenAccount: null,
          tokenProgram: null,
        })
        .signers([owner])
        .rpc();

      // Try to dispute - should fail
      try {
        await program.methods
          .markDisputed()
          .accounts({
            escrow: releasedEscrowPDA,
            reputation: reputationPDA,
            agent: owner.publicKey,
          })
          .signers([owner])
          .rpc();
        expect.fail("Should have thrown InvalidStatus error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("InvalidStatus");
      }
    });
  });

  // ============================================================================
  // Oracle Registry Tests
  // ============================================================================

  describe("Oracle Registry", () => {
    let oracleRegistryPDA: PublicKey;
    const admin = Keypair.generate();

    before(async () => {
      const airdropSig = await provider.connection.requestAirdrop(
        admin.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      [oracleRegistryPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("oracle_registry")],
        program.programId
      );
    });

    it("Initializes oracle registry", async () => {
      const minConsensus = 2;
      const maxScoreDeviation = 15;

      await program.methods
        .initializeOracleRegistry(minConsensus, maxScoreDeviation)
        .accounts({
          oracleRegistry: oracleRegistryPDA,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const registry = await program.account.oracleRegistry.fetch(oracleRegistryPDA);
      expect(registry.admin.toString()).to.equal(admin.publicKey.toString());
      expect(registry.minConsensus).to.equal(minConsensus);
      expect(registry.maxScoreDeviation).to.equal(maxScoreDeviation);
      expect(registry.oracles.length).to.equal(0);
    });

    it("Adds an oracle to registry", async () => {
      const oraclePubkey = Keypair.generate().publicKey;
      const oracleType = { ed25519: {} };
      const weight = 100;

      await program.methods
        .addOracle(oraclePubkey, oracleType, weight)
        .accounts({
          oracleRegistry: oracleRegistryPDA,
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc();

      const registry = await program.account.oracleRegistry.fetch(oracleRegistryPDA);
      expect(registry.oracles.length).to.equal(1);
      expect(registry.oracles[0].pubkey.toString()).to.equal(oraclePubkey.toString());
      expect(registry.oracles[0].weight).to.equal(weight);
    });

    it("Removes an oracle from registry", async () => {
      // First add another oracle
      const oraclePubkey = Keypair.generate().publicKey;
      await program.methods
        .addOracle(oraclePubkey, { ed25519: {} }, 50)
        .accounts({
          oracleRegistry: oracleRegistryPDA,
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc();

      let registry = await program.account.oracleRegistry.fetch(oracleRegistryPDA);
      const initialCount = registry.oracles.length;

      // Remove it
      await program.methods
        .removeOracle(oraclePubkey)
        .accounts({
          oracleRegistry: oracleRegistryPDA,
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc();

      registry = await program.account.oracleRegistry.fetch(oracleRegistryPDA);
      expect(registry.oracles.length).to.equal(initialCount - 1);
    });

    it("Non-admin cannot add oracle", async () => {
      const nonAdmin = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        nonAdmin.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      try {
        await program.methods
          .addOracle(Keypair.generate().publicKey, { ed25519: {} }, 100)
          .accounts({
            oracleRegistry: oracleRegistryPDA,
            admin: nonAdmin.publicKey,
          })
          .signers([nonAdmin])
          .rpc();
        expect.fail("Should have thrown Unauthorized error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("Unauthorized");
      }
    });
  });

  // ============================================================================
  // Deactivation Tests
  // ============================================================================

  describe("Agent Deactivation", () => {
    it("Deactivates agent and returns stake", async () => {
      // Create a new agent for deactivation test
      const deactivateOwner = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        deactivateOwner.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      const [deactivateAgentPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("agent"), deactivateOwner.publicKey.toBuffer()],
        program.programId
      );

      const stakeAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);

      // Create agent
      await program.methods
        .createAgent("DeactivateTest", { service: {} }, stakeAmount)
        .accounts({
          agent: deactivateAgentPDA,
          owner: deactivateOwner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([deactivateOwner])
        .rpc();

      const balanceBefore = await provider.connection.getBalance(deactivateOwner.publicKey);

      // Deactivate
      await program.methods
        .deactivateAgent()
        .accounts({
          agent: deactivateAgentPDA,
          owner: deactivateOwner.publicKey,
        })
        .signers([deactivateOwner])
        .rpc();

      // Verify agent is deactivated
      const agent = await program.account.agentIdentity.fetch(deactivateAgentPDA);
      expect(agent.isActive).to.be.false;
      expect(agent.stakeAmount.toNumber()).to.equal(0);

      // Verify stake was returned
      const balanceAfter = await provider.connection.getBalance(deactivateOwner.publicKey);
      expect(balanceAfter).to.be.greaterThan(balanceBefore);
    });
  });
});
