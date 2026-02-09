import { expect } from "chai";
import {
  anchor,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  BN,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  getErrorCode,
} from "./helpers";

describe("swarmteams", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Swarmteams as anchor.Program<any>;

  let authority: Keypair;
  let registryPDA: PublicKey;
  let treasuryVaultPDA: PublicKey;
  let stakeVaultPDA: PublicKey;
  let kamiyoMint: PublicKey;

  const registryConfig = {
    minStake: new BN(1_000_000),
    minSignalConfidence: 50,
    maxTotalStake: new BN(0),
    maxStakePerAgent: new BN(0),
    minSignalCollateral: new BN(0),
  };

  const testCommitment = Buffer.alloc(32, 1);

  function deriveRegistryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("registry")], program.programId);
  }

  function deriveTreasuryVaultPDA(registry: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), registry.toBuffer()],
      program.programId
    );
  }

  function deriveStakeVaultPDA(registry: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("stake_vault"), registry.toBuffer()],
      program.programId
    );
  }

  function deriveAgentPDA(commitment: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), commitment],
      program.programId
    );
  }

  function deriveIdentityLinkPDA(zkAgent: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("identity_link"), zkAgent.toBuffer()],
      program.programId
    );
  }

  async function mintKamiyo(toOwner: PublicKey, amount: number): Promise<PublicKey> {
    const ata = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      kamiyoMint,
      toOwner
    );
    await mintTo(provider.connection, authority, kamiyoMint, ata, authority, amount);
    return ata;
  }

  before(async () => {
    authority = Keypair.generate();

    const airdropSig = await provider.connection.requestAirdrop(
      authority.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    [registryPDA] = deriveRegistryPDA();
    [treasuryVaultPDA] = deriveTreasuryVaultPDA(registryPDA);
    [stakeVaultPDA] = deriveStakeVaultPDA(registryPDA);

    kamiyoMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6
    );

    const existing = await (program.account as any).agentRegistry
      .fetchNullable(registryPDA)
      .catch(() => null);

    if (!existing) {
      await program.methods
        .initializeRegistry(registryConfig)
        .accounts({
          registry: registryPDA,
          kamiyoMint,
          treasuryVault: treasuryVaultPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();
    }
  });

  describe("initialize_registry", () => {
    it("has the expected registry config", async () => {
      const registry = await (program.account as any).agentRegistry.fetch(registryPDA);

      expect(registry.authority.toBase58()).to.equal(authority.publicKey.toBase58());
      expect(registry.agentCount).to.equal(0);
      expect(registry.signalCount).to.equal(0);
      expect(registry.minStake.toString()).to.equal(registryConfig.minStake.toString());
      expect(registry.minSignalConfidence).to.equal(registryConfig.minSignalConfidence);
      expect(registry.paused).to.equal(false);
      expect(registry.kamiyoMint.toBase58()).to.equal(kamiyoMint.toBase58());
    });
  });

  describe("register_agent", () => {
    let payer: Keypair;
    let payerTokenAccount: PublicKey;
    let agentPDA: PublicKey;

    before(async () => {
      payer = Keypair.generate();

      const airdropSig = await provider.connection.requestAirdrop(
        payer.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      payerTokenAccount = await mintKamiyo(payer.publicKey, 10_000_000_000);
      [agentPDA] = deriveAgentPDA(testCommitment);
    });

    it("registers an agent with identity commitment", async () => {
      const stakeAmount = new BN(1_000_000);
      const beforeRegistry = await (program.account as any).agentRegistry.fetch(registryPDA);

      await program.methods
        .registerAgent(Array.from(testCommitment), stakeAmount)
        .accounts({
          registry: registryPDA,
          agent: agentPDA,
          stakeVault: stakeVaultPDA,
          kamiyoMint,
          payerTokenAccount,
          treasuryVault: treasuryVaultPDA,
          payer: payer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([payer])
        .rpc();

      const agent = await (program.account as any).agent.fetch(agentPDA);
      expect(agent.registry.toBase58()).to.equal(registryPDA.toBase58());
      expect(Buffer.from(agent.identityCommitment).toString("hex")).to.equal(
        testCommitment.toString("hex")
      );
      expect(agent.stake.toString()).to.equal(stakeAmount.toString());
      expect(agent.active).to.equal(true);
      expect(agent.owner.toBase58()).to.equal(payer.publicKey.toBase58());

      const registry = await (program.account as any).agentRegistry.fetch(registryPDA);
      expect(registry.agentCount).to.equal(beforeRegistry.agentCount + 1);
    });

    it("rejects registration with insufficient stake", async () => {
      const newCommitment = Buffer.alloc(32, 2);
      const [newAgentPDA] = deriveAgentPDA(newCommitment);
      const insufficientStake = new BN(100);

      try {
        await program.methods
          .registerAgent(Array.from(newCommitment), insufficientStake)
          .accounts({
            registry: registryPDA,
            agent: newAgentPDA,
            stakeVault: stakeVaultPDA,
            kamiyoMint,
            payerTokenAccount,
            treasuryVault: treasuryVaultPDA,
            payer: payer.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([payer])
          .rpc();
        expect.fail("Should have thrown InsufficientStake");
      } catch (err: any) {
        expect(getErrorCode(err)).to.equal("InsufficientStake");
      }
    });
  });

  describe("update_agents_root", () => {
    it("updates agents root (admin only)", async () => {
      const newRoot = Buffer.alloc(32, 0xab);

      await program.methods
        .updateAgentsRoot(Array.from(newRoot), 1)
        .accounts({
          registry: registryPDA,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      const registry = await (program.account as any).agentRegistry.fetch(registryPDA);
      expect(Buffer.from(registry.agentsRoot).toString("hex")).to.equal(
        newRoot.toString("hex")
      );
    });

    it("rejects root update from non-authority", async () => {
      const nonAuthority = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        nonAuthority.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      const newRoot = Buffer.alloc(32, 0xcd);

      try {
        await program.methods
          .updateAgentsRoot(Array.from(newRoot), 1)
          .accounts({
            registry: registryPDA,
            authority: nonAuthority.publicKey,
          })
          .signers([nonAuthority])
          .rpc();
        expect.fail("Should have thrown Unauthorized");
      } catch (err: any) {
        expect(getErrorCode(err)).to.equal("Unauthorized");
      }
    });
  });

  describe("pause_protocol", () => {
    it("pauses and unpauses the protocol", async () => {
      await program.methods
        .pauseProtocol()
        .accounts({
          registry: registryPDA,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      let registry = await (program.account as any).agentRegistry.fetch(registryPDA);
      expect(registry.paused).to.equal(true);

      await program.methods
        .unpauseProtocol()
        .accounts({
          registry: registryPDA,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      registry = await (program.account as any).agentRegistry.fetch(registryPDA);
      expect(registry.paused).to.equal(false);
    });
  });

  describe("link_identity", () => {
    let owner: Keypair;
    let ownerTokenAccount: PublicKey;
    let zkAgentPDA: PublicKey;
    let identityLinkPDA: PublicKey;
    let kamiyoAgent: Keypair;

    const linkCommitment = Buffer.alloc(32, 0xaa);

    before(async () => {
      owner = Keypair.generate();
      kamiyoAgent = Keypair.generate();

      const airdropSig = await provider.connection.requestAirdrop(
        owner.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      ownerTokenAccount = await mintKamiyo(owner.publicKey, 10_000_000_000);

      [zkAgentPDA] = deriveAgentPDA(linkCommitment);

      await program.methods
        .registerAgent(Array.from(linkCommitment), new BN(1_000_000))
        .accounts({
          registry: registryPDA,
          agent: zkAgentPDA,
          stakeVault: stakeVaultPDA,
          kamiyoMint,
          payerTokenAccount: ownerTokenAccount,
          treasuryVault: treasuryVaultPDA,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      [identityLinkPDA] = deriveIdentityLinkPDA(zkAgentPDA);
    });

    it("links ZK identity to kamiyo agent (no stake)", async () => {
      await program.methods
        .linkIdentity()
        .accountsPartial({
          zkAgent: zkAgentPDA,
          kamiyoAgent: kamiyoAgent.publicKey,
          identityLink: identityLinkPDA,
          stakePosition: null,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const link = await (program.account as any).identityLink.fetch(identityLinkPDA);
      expect(link.zkAgent.toBase58()).to.equal(zkAgentPDA.toBase58());
      expect(link.kamiyoAgent.toBase58()).to.equal(kamiyoAgent.publicKey.toBase58());
      expect(link.owner.toBase58()).to.equal(owner.publicKey.toBase58());
      expect(link.stakedAmount.toString()).to.equal("0");
      expect(link.stakeMultiplier.toString()).to.equal("10000");
      expect(link.active).to.equal(true);
    });

    it("unlinks identity", async () => {
      await program.methods
        .unlinkIdentity()
        .accounts({
          identityLink: identityLinkPDA,
          owner: owner.publicKey,
        })
        .signers([owner])
        .rpc();

      const link = await (program.account as any).identityLink.fetch(identityLinkPDA);
      expect(link.active).to.equal(false);
    });

    it("rejects unlink from non-owner", async () => {
      const nonOwner = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        nonOwner.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      try {
        await program.methods
          .unlinkIdentity()
          .accounts({
            identityLink: identityLinkPDA,
            owner: nonOwner.publicKey,
          })
          .signers([nonOwner])
          .rpc();
        expect.fail("Should have thrown UnauthorizedWithdrawal");
      } catch (err: any) {
        expect(getErrorCode(err)).to.equal("UnauthorizedWithdrawal");
      }
    });
  });

  describe("refresh_stake", () => {
    let owner: Keypair;
    let ownerTokenAccount: PublicKey;
    let zkAgentPDA: PublicKey;
    let identityLinkPDA: PublicKey;

    const refreshCommitment = Buffer.alloc(32, 0xbb);

    before(async () => {
      owner = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        owner.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      ownerTokenAccount = await mintKamiyo(owner.publicKey, 10_000_000_000);

      [zkAgentPDA] = deriveAgentPDA(refreshCommitment);

      await program.methods
        .registerAgent(Array.from(refreshCommitment), new BN(1_000_000))
        .accounts({
          registry: registryPDA,
          agent: zkAgentPDA,
          stakeVault: stakeVaultPDA,
          kamiyoMint,
          payerTokenAccount: ownerTokenAccount,
          treasuryVault: treasuryVaultPDA,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      [identityLinkPDA] = deriveIdentityLinkPDA(zkAgentPDA);

      const kamiyoAgent = Keypair.generate();
      await program.methods
        .linkIdentity()
        .accountsPartial({
          zkAgent: zkAgentPDA,
          kamiyoAgent: kamiyoAgent.publicKey,
          identityLink: identityLinkPDA,
          stakePosition: null,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
    });

    it("refreshes stake on active link (no stake position)", async () => {
      await program.methods
        .refreshStake()
        .accountsPartial({
          identityLink: identityLinkPDA,
          stakePosition: null,
          owner: owner.publicKey,
        })
        .signers([owner])
        .rpc();

      const link = await (program.account as any).identityLink.fetch(identityLinkPDA);
      expect(link.stakedAmount.toString()).to.equal("0");
      expect(link.stakeMultiplier.toString()).to.equal("10000");
    });

    it("rejects refresh_stake from non-owner", async () => {
      const nonOwner = Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        nonOwner.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      try {
        await program.methods
          .refreshStake()
          .accountsPartial({
            identityLink: identityLinkPDA,
            stakePosition: null,
            owner: nonOwner.publicKey,
          })
          .signers([nonOwner])
          .rpc();
        expect.fail("Should have thrown UnauthorizedWithdrawal");
      } catch (err: any) {
        expect(getErrorCode(err)).to.equal("UnauthorizedWithdrawal");
      }
    });
  });
});
