import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  getAssociatedTokenAddress,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import BN from "bn.js";

// Import IDL (will be generated after build)
// import { Kamiyo } from "../target/types/kamiyo";

// Helper to extract error code from Anchor errors
function getErrorCode(err: any): string | null {
  // Direct AnchorError
  if (err instanceof AnchorError) {
    return err.error?.errorCode?.code || null;
  }
  // Nested error object
  if (err?.error?.errorCode?.code) {
    return err.error.errorCode.code;
  }
  // Check logs for error code
  if (err?.logs) {
    for (const log of err.logs) {
      const match = log.match(/Error Code: (\w+)/);
      if (match) return match[1];
    }
  }
  // Try message
  if (err?.message) {
    const match = err.message.match(/Error Code: (\w+)/);
    if (match) return match[1];
  }
  // Check for constraint violation (ConstraintHasOne becomes "Unauthorized" type errors)
  if (err?.message?.includes('ConstraintHasOne') || err?.message?.includes('has_one')) {
    return "Unauthorized";
  }
  // Check for raw error in error object
  if (err?.error?.errorMessage) {
    return err.error.errorCode?.code || null;
  }
  return null;
}

describe("Kamiyo - Agent Identity & Conflict Resolution", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load program
  const program = anchor.workspace.Kamiyo as Program<any>;

  // Test accounts
  const owner = Keypair.generate();
  const provider2 = Keypair.generate();
  let agentPDA: PublicKey;
  let agentBump: number;
  let escrowPDA: PublicKey;
  let escrowBump: number;
  let reputationPDA: PublicKey;
  let reputationBump: number;
  let protocolConfigPDA: PublicKey;
  let oracleRegistryPDA: PublicKey;
  let treasuryPDA: PublicKey;

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
      [Buffer.from("escrow"), owner.publicKey.toBuffer(), Buffer.from(transactionId)],
      program.programId
    );

    [reputationPDA, reputationBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("reputation"), owner.publicKey.toBuffer()],
      program.programId
    );

    [protocolConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol_config")],
      program.programId
    );

    [oracleRegistryPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_registry")],
      program.programId
    );

    [treasuryPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId
    );

    // Initialize protocol config (required for escrows)
    try {
      await program.methods
        .initializeProtocol(provider2.publicKey, owner.publicKey)
        .accounts({
          protocolConfig: protocolConfigPDA,
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // Already initialized
    }

    // Initialize treasury (required for escrows)
    try {
      await program.methods
        .initializeTreasury()
        .accounts({
          treasury: treasuryPDA,
          admin: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      // Already initialized
    }
  });

  // ============================================================================
  // Agent Identity Tests
  // ============================================================================

  describe("Agent Identity", () => {
    it("Creates an agent with stake", async () => {
      const name = "TestAgent";
      const agentType = { trading: {} }; // AgentType::Trading
      const stakeAmount = new BN(0.5 * LAMPORTS_PER_SOL);

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

      const insufficientStake = new BN(0.01 * LAMPORTS_PER_SOL); // Below 0.1 SOL minimum

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
        expect(getErrorCode(err)).to.equal("InsufficientStake");
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
          .createAgent("", { trading: {} }, new BN(0.5 * LAMPORTS_PER_SOL))
          .accounts({
            agent: agent3PDA,
            owner: owner3.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner3])
          .rpc();
        expect.fail("Should have thrown InvalidAgentName error");
      } catch (err: any) {
        expect(getErrorCode(err)).to.equal("InvalidAgentName");
      }
    });
  });

  // ============================================================================
  // Agreement (Escrow) Tests
  // ============================================================================

  describe("Agreements (Escrow)", () => {
    it("Initializes an escrow agreement", async () => {
      const amount = new BN(0.1 * LAMPORTS_PER_SOL);
      const timeLock = new BN(3600); // 1 hour

      await program.methods
        .initializeEscrow(amount, timeLock, transactionId, false)
        .accounts({
          protocolConfig: protocolConfigPDA,
          treasury: treasuryPDA,
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
        [Buffer.from("escrow"), owner.publicKey.toBuffer(), Buffer.from(newTxId)],
        program.programId
      );

      const amount = new BN(0.1 * LAMPORTS_PER_SOL);
      const invalidTimeLock = new BN(60); // Only 60 seconds - below 1 hour minimum

      try {
        await program.methods
          .initializeEscrow(amount, invalidTimeLock, newTxId, false)
          .accounts({
            protocolConfig: protocolConfigPDA,
            treasury: treasuryPDA,
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
        [Buffer.from("escrow"), owner.publicKey.toBuffer(), Buffer.from(releaseTxId)],
        program.programId
      );

      const amount = new BN(0.05 * LAMPORTS_PER_SOL);
      const timeLock = new BN(3600);

      await program.methods
        .initializeEscrow(amount, timeLock, releaseTxId, false)
        .accounts({
          protocolConfig: protocolConfigPDA,
          treasury: treasuryPDA,
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
          protocolConfig: protocolConfigPDA,
          escrow: releaseEscrowPDA,
          caller: owner.publicKey,
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
        [Buffer.from("escrow"), owner.publicKey.toBuffer(), Buffer.from(disputeTxId)],
        program.programId
      );

      const amount = new BN(0.05 * LAMPORTS_PER_SOL);
      const timeLock = new BN(3600);

      // Initialize escrow
      await program.methods
        .initializeEscrow(amount, timeLock, disputeTxId, false)
        .accounts({
          protocolConfig: protocolConfigPDA,
          treasury: treasuryPDA,
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
        [Buffer.from("escrow"), owner.publicKey.toBuffer(), Buffer.from(releasedTxId)],
        program.programId
      );

      const amount = new BN(0.02 * LAMPORTS_PER_SOL);
      const timeLock = new BN(3600);

      await program.methods
        .initializeEscrow(amount, timeLock, releasedTxId, false)
        .accounts({
          protocolConfig: protocolConfigPDA,
          treasury: treasuryPDA,
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
          protocolConfig: protocolConfigPDA,
          escrow: releasedEscrowPDA,
          caller: owner.publicKey,
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
        expect(getErrorCode(err)).to.equal("InvalidStatus");
      }
    });
  });

  // ============================================================================
  // Oracle Registry Tests
  // ============================================================================

  describe("Oracle Registry", () => {
    let oracleRegistryPDA: PublicKey;
    const admin = Keypair.generate();
    const oracle1 = Keypair.generate();
    const oracle2 = Keypair.generate();

    before(async () => {
      // Fund admin and oracles
      const airdropSig = await provider.connection.requestAirdrop(
        admin.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      const airdropSig2 = await provider.connection.requestAirdrop(
        oracle1.publicKey,
        3 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig2);

      const airdropSig3 = await provider.connection.requestAirdrop(
        oracle2.publicKey,
        3 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig3);

      [oracleRegistryPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("oracle_registry")],
        program.programId
      );
    });

    it("Initializes oracle registry", async () => {
      const minConsensus = 3; // MIN_CONSENSUS_ORACLES = 3
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
      const oracleType = { ed25519: {} };
      const weight = 100;
      const stakeAmount = new BN(1 * LAMPORTS_PER_SOL); // MIN_ORACLE_STAKE = 1 SOL

      await program.methods
        .addOracle(oracle1.publicKey, oracleType, weight, stakeAmount)
        .accounts({
          oracleRegistry: oracleRegistryPDA,
          admin: admin.publicKey,
          oracleSigner: oracle1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin, oracle1])
        .rpc();

      const registry = await program.account.oracleRegistry.fetch(oracleRegistryPDA);
      expect(registry.oracles.length).to.equal(1);
      expect(registry.oracles[0].pubkey.toString()).to.equal(oracle1.publicKey.toString());
      expect(registry.oracles[0].weight).to.equal(weight);
    });

    it("Removes an oracle from registry", async () => {
      // First add another oracle
      const stakeAmount = new BN(1 * LAMPORTS_PER_SOL);
      await program.methods
        .addOracle(oracle2.publicKey, { ed25519: {} }, 50, stakeAmount)
        .accounts({
          oracleRegistry: oracleRegistryPDA,
          admin: admin.publicKey,
          oracleSigner: oracle2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin, oracle2])
        .rpc();

      let registry = await program.account.oracleRegistry.fetch(oracleRegistryPDA);
      const initialCount = registry.oracles.length;

      // Remove oracle2
      await program.methods
        .removeOracle(oracle2.publicKey)
        .accounts({
          oracleRegistry: oracleRegistryPDA,
          admin: admin.publicKey,
          oracleWallet: oracle2.publicKey,
        })
        .signers([admin])
        .rpc();

      registry = await program.account.oracleRegistry.fetch(oracleRegistryPDA);
      expect(registry.oracles.length).to.equal(initialCount - 1);
    });

    it("Non-admin cannot add oracle", async () => {
      const nonAdmin = Keypair.generate();
      const fakeOracle = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        nonAdmin.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);
      const airdropSig2 = await provider.connection.requestAirdrop(
        fakeOracle.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig2);

      try {
        await program.methods
          .addOracle(fakeOracle.publicKey, { ed25519: {} }, 100, new BN(1 * LAMPORTS_PER_SOL))
          .accounts({
            oracleRegistry: oracleRegistryPDA,
            admin: nonAdmin.publicKey,
            oracleSigner: fakeOracle.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([nonAdmin, fakeOracle])
          .rpc();
        expect.fail("Should have thrown Unauthorized error");
      } catch (err: any) {
        expect(getErrorCode(err)).to.equal("Unauthorized");
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

      const stakeAmount = new BN(0.5 * LAMPORTS_PER_SOL);

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

  // ============================================================================
  // SPL Token Escrow Tests
  // ============================================================================

  describe("SPL Token Escrows", () => {
    let tokenMint: PublicKey;
    let mintAuthority: Keypair;
    let agentTokenAccount: PublicKey;
    let providerTokenAccount: PublicKey;
    const TOKEN_DECIMALS = 6; // USDC-like decimals

    before(async () => {
      // Create a test SPL token mint (simulating USDC)
      mintAuthority = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        mintAuthority.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      // Create the mint
      tokenMint = await createMint(
        provider.connection,
        mintAuthority,
        mintAuthority.publicKey,
        null,
        TOKEN_DECIMALS
      );

      // Create associated token accounts for agent and provider
      agentTokenAccount = await createAssociatedTokenAccount(
        provider.connection,
        mintAuthority,
        tokenMint,
        owner.publicKey
      );

      providerTokenAccount = await createAssociatedTokenAccount(
        provider.connection,
        mintAuthority,
        tokenMint,
        provider2.publicKey
      );

      // Mint tokens to agent (10,000 tokens)
      const mintAmount = 10_000 * 10 ** TOKEN_DECIMALS;
      await mintTo(
        provider.connection,
        mintAuthority,
        tokenMint,
        agentTokenAccount,
        mintAuthority,
        mintAmount
      );
    });

    it("Initializes an SPL token escrow", async () => {
      const splTxId = `spl-escrow-${Date.now()}`;
      const [splEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), owner.publicKey.toBuffer(), Buffer.from(splTxId)],
        program.programId
      );

      // Get the ATA for the escrow PDA (program will create it)
      const escrowATA = await getAssociatedTokenAddress(
        tokenMint,
        splEscrowPDA,
        true // allowOwnerOffCurve for PDAs
      );

      const amount = new BN(100 * 10 ** TOKEN_DECIMALS); // 100 tokens
      const timeLock = new BN(3600);

      // Get agent token balance before
      const agentBalanceBefore = await getAccount(provider.connection, agentTokenAccount);

      await program.methods
        .initializeEscrow(amount, timeLock, splTxId, true) // use_spl_token = true
        .accounts({
          protocolConfig: protocolConfigPDA,
          treasury: treasuryPDA,
          escrow: splEscrowPDA,
          agent: owner.publicKey,
          api: provider2.publicKey,
          systemProgram: SystemProgram.programId,
          tokenMint: tokenMint,
          escrowTokenAccount: escrowATA,
          agentTokenAccount: agentTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      // Verify escrow state
      const escrow = await program.account.escrow.fetch(splEscrowPDA);
      expect(escrow.tokenMint?.toString()).to.equal(tokenMint.toString());
      expect(escrow.amount.toNumber()).to.equal(amount.toNumber());
      expect(escrow.status).to.deep.equal({ active: {} });

      // Verify tokens were transferred from agent
      const agentBalanceAfter = await getAccount(provider.connection, agentTokenAccount);
      expect(Number(agentBalanceBefore.amount) - Number(agentBalanceAfter.amount)).to.equal(amount.toNumber());
    });

    it("Releases SPL tokens to provider", async () => {
      const releaseTxId = `spl-release-${Date.now()}`;
      const [releaseEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), owner.publicKey.toBuffer(), Buffer.from(releaseTxId)],
        program.programId
      );

      const escrowATA = await getAssociatedTokenAddress(
        tokenMint,
        releaseEscrowPDA,
        true
      );

      const amount = new BN(50 * 10 ** TOKEN_DECIMALS); // 50 tokens
      const timeLock = new BN(3600);

      // Initialize escrow
      await program.methods
        .initializeEscrow(amount, timeLock, releaseTxId, true)
        .accounts({
          protocolConfig: protocolConfigPDA,
          treasury: treasuryPDA,
          escrow: releaseEscrowPDA,
          agent: owner.publicKey,
          api: provider2.publicKey,
          systemProgram: SystemProgram.programId,
          tokenMint: tokenMint,
          escrowTokenAccount: escrowATA,
          agentTokenAccount: agentTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      // Get provider token balance before release
      const providerBalanceBefore = await getAccount(provider.connection, providerTokenAccount);

      // Release funds to provider
      await program.methods
        .releaseFunds()
        .accounts({
          protocolConfig: protocolConfigPDA,
          escrow: releaseEscrowPDA,
          caller: owner.publicKey,
          api: provider2.publicKey,
          systemProgram: SystemProgram.programId,
          escrowTokenAccount: escrowATA,
          apiTokenAccount: providerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      // Verify escrow status
      const escrow = await program.account.escrow.fetch(releaseEscrowPDA);
      expect(escrow.status).to.deep.equal({ released: {} });

      // Verify provider received tokens
      const providerBalanceAfter = await getAccount(provider.connection, providerTokenAccount);
      expect(Number(providerBalanceAfter.amount) - Number(providerBalanceBefore.amount)).to.equal(amount.toNumber());
    });

    it("Handles dispute with SPL token escrow", async () => {
      const disputeTxId = `spl-dispute-${Date.now()}`;
      const [disputeEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), owner.publicKey.toBuffer(), Buffer.from(disputeTxId)],
        program.programId
      );

      const escrowATA = await getAssociatedTokenAddress(
        tokenMint,
        disputeEscrowPDA,
        true
      );

      const amount = new BN(25 * 10 ** TOKEN_DECIMALS); // 25 tokens
      const timeLock = new BN(3600);

      // Initialize escrow
      await program.methods
        .initializeEscrow(amount, timeLock, disputeTxId, true)
        .accounts({
          protocolConfig: protocolConfigPDA,
          treasury: treasuryPDA,
          escrow: disputeEscrowPDA,
          agent: owner.publicKey,
          api: provider2.publicKey,
          systemProgram: SystemProgram.programId,
          tokenMint: tokenMint,
          escrowTokenAccount: escrowATA,
          agentTokenAccount: agentTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      // Mark as disputed
      await program.methods
        .markDisputed()
        .accounts({
          protocolConfig: protocolConfigPDA,
          escrow: disputeEscrowPDA,
          reputation: reputationPDA,
          agent: owner.publicKey,
        })
        .signers([owner])
        .rpc();

      // Verify dispute status
      const escrow = await program.account.escrow.fetch(disputeEscrowPDA);
      expect(escrow.status).to.deep.equal({ disputed: {} });
      expect(escrow.tokenMint?.toString()).to.equal(tokenMint.toString());
    });

    it("Fails to initialize SPL escrow without token accounts", async () => {
      const noAccountTxId = `no-token-account-${Date.now()}`;
      const [noAccountEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), owner.publicKey.toBuffer(), Buffer.from(noAccountTxId)],
        program.programId
      );

      const amount = new BN(10 * 10 ** TOKEN_DECIMALS);
      const timeLock = new BN(3600);

      try {
        await program.methods
          .initializeEscrow(amount, timeLock, noAccountTxId, true) // use_spl_token = true
          .accounts({
            protocolConfig: protocolConfigPDA,
            treasury: treasuryPDA,
            escrow: noAccountEscrowPDA,
            agent: owner.publicKey,
            api: provider2.publicKey,
            systemProgram: SystemProgram.programId,
            tokenMint: null, // Missing required accounts
            escrowTokenAccount: null,
            agentTokenAccount: null,
            tokenProgram: null,
            associatedTokenProgram: null,
          })
          .signers([owner])
          .rpc();
        expect.fail("Should have thrown MissingTokenAccount error");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.message).to.include("MissingToken");
      }
    });

    it("Creates multiple SPL token escrows for same agent", async () => {
      const escrows: { txId: string; pda: PublicKey; amount: anchor.BN }[] = [];

      // Create 3 escrows
      for (let i = 0; i < 3; i++) {
        const txId = `multi-spl-${Date.now()}-${i}`;
        const [escrowPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("escrow"), owner.publicKey.toBuffer(), Buffer.from(txId)],
          program.programId
        );

        const escrowATA = await getAssociatedTokenAddress(
          tokenMint,
          escrowPDA,
          true
        );

        const amount = new BN((i + 1) * 10 * 10 ** TOKEN_DECIMALS);
        const timeLock = new BN(3600);

        await program.methods
          .initializeEscrow(amount, timeLock, txId, true)
          .accounts({
            protocolConfig: protocolConfigPDA,
            treasury: treasuryPDA,
            escrow: escrowPDA,
            agent: owner.publicKey,
            api: provider2.publicKey,
            systemProgram: SystemProgram.programId,
            tokenMint: tokenMint,
            escrowTokenAccount: escrowATA,
            agentTokenAccount: agentTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([owner])
          .rpc();

        escrows.push({ txId, pda: escrowPDA, amount });
      }

      // Verify all escrows
      for (const escrowInfo of escrows) {
        const escrow = await program.account.escrow.fetch(escrowInfo.pda);
        expect(escrow.amount.toNumber()).to.equal(escrowInfo.amount.toNumber());
        expect(escrow.tokenMint?.toString()).to.equal(tokenMint.toString());
        expect(escrow.status).to.deep.equal({ active: {} });
      }
    });
  });
});
