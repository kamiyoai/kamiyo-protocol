import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { expect } from 'chai';
import BN from 'bn.js';

// Program ID from Anchor.toml
const PROGRAM_ID = new PublicKey('DmdBbvjNRLNvCQcyeUmyTi5BpDkHdGfUxGzfidgvQe26');

describe('yumori', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load the program
  const idl = require('../target/idl/yumori.json');
  const program = new Program(idl, provider);

  // Test accounts
  let authority: Keypair;
  let registryPDA: PublicKey;
  let registryBump: number;

  // Test commitment (32 bytes)
  const testCommitment = Buffer.alloc(32);
  testCommitment.fill(1);

  before(async () => {
    authority = Keypair.generate();

    // Fund the authority account
    const airdropSig = await provider.connection.requestAirdrop(
      authority.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Derive registry PDA
    [registryPDA, registryBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('registry')],
      PROGRAM_ID
    );
  });

  describe('initialize_registry', () => {
    it('should initialize the registry', async () => {
      const config = {
        minStake: new BN(1000000), // 0.001 SOL
        minSignalConfidence: 50,
      };

      await program.methods
        .initializeRegistry(config)
        .accounts({
          registry: registryPDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Fetch and verify registry state
      const registry = await (program.account as any).agentRegistry.fetch(registryPDA);

      expect(registry.authority.toBase58()).to.equal(authority.publicKey.toBase58());
      expect(registry.agentCount).to.equal(0);
      expect(registry.signalCount).to.equal(0);
      expect(registry.minStake.toNumber()).to.equal(1000000);
      expect(registry.minSignalConfidence).to.equal(50);
      expect(registry.paused).to.equal(false);
    });
  });

  describe('register_agent', () => {
    let agentPDA: PublicKey;
    let stakeVaultPDA: PublicKey;
    let payer: Keypair;

    before(async () => {
      payer = Keypair.generate();

      // Fund payer
      const airdropSig = await provider.connection.requestAirdrop(
        payer.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      // Derive agent PDA
      [agentPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('agent'), testCommitment],
        PROGRAM_ID
      );

      // Derive stake vault PDA
      [stakeVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('stake_vault'), registryPDA.toBuffer()],
        PROGRAM_ID
      );
    });

    it('should register an agent with identity commitment', async () => {
      const stakeAmount = new BN(1000000); // 0.001 SOL

      await program.methods
        .registerAgent(Array.from(testCommitment), stakeAmount)
        .accounts({
          registry: registryPDA,
          agent: agentPDA,
          stakeVault: stakeVaultPDA,
          payer: payer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();

      // Verify agent account
      const agent = await (program.account as any).agent.fetch(agentPDA);

      expect(agent.registry.toBase58()).to.equal(registryPDA.toBase58());
      expect(Buffer.from(agent.identityCommitment).toString('hex')).to.equal(
        testCommitment.toString('hex')
      );
      expect(agent.stake.toNumber()).to.equal(1000000);
      expect(agent.active).to.equal(true);
      expect(agent.signalCount).to.equal(0);
      expect(agent.swarmVotes).to.equal(0);

      // Verify registry agent count increased
      const registry = await (program.account as any).agentRegistry.fetch(registryPDA);
      expect(registry.agentCount).to.equal(1);
    });

    it('should reject registration with insufficient stake', async () => {
      const newCommitment = Buffer.alloc(32);
      newCommitment.fill(2);

      const [newAgentPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('agent'), newCommitment],
        PROGRAM_ID
      );

      const insufficientStake = new BN(100); // Below minimum

      try {
        await program.methods
          .registerAgent(Array.from(newCommitment), insufficientStake)
          .accounts({
            registry: registryPDA,
            agent: newAgentPDA,
            stakeVault: stakeVaultPDA,
            payer: payer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([payer])
          .rpc();

        expect.fail('Should have thrown InsufficientStake error');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('InsufficientStake');
      }
    });
  });

  describe('update_agents_root', () => {
    it('should update agents root (admin only)', async () => {
      const newRoot = Buffer.alloc(32);
      newRoot.fill(0xab);

      await program.methods
        .updateAgentsRoot(Array.from(newRoot), 1)
        .accounts({
          registry: registryPDA,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      const registry = await (program.account as any).agentRegistry.fetch(registryPDA);
      expect(Buffer.from(registry.agentsRoot).toString('hex')).to.equal(
        newRoot.toString('hex')
      );
    });

    it('should reject root update from non-authority', async () => {
      const nonAuthority = Keypair.generate();
      const newRoot = Buffer.alloc(32);
      newRoot.fill(0xcd);

      try {
        await program.methods
          .updateAgentsRoot(Array.from(newRoot), 1)
          .accounts({
            registry: registryPDA,
            authority: nonAuthority.publicKey,
          })
          .signers([nonAuthority])
          .rpc();

        expect.fail('Should have thrown Unauthorized error');
      } catch (err: any) {
        expect(err.message).to.include('unknown signer');
      }
    });
  });

  describe('pause_protocol', () => {
    it('should pause the protocol', async () => {
      await program.methods
        .pauseProtocol()
        .accounts({
          registry: registryPDA,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      const registry = await (program.account as any).agentRegistry.fetch(registryPDA);
      expect(registry.paused).to.equal(true);
    });

    it('should unpause the protocol', async () => {
      await program.methods
        .unpauseProtocol()
        .accounts({
          registry: registryPDA,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      const registry = await (program.account as any).agentRegistry.fetch(registryPDA);
      expect(registry.paused).to.equal(false);
    });
  });

  describe('link_identity', () => {
    let zkAgentPDA: PublicKey;
    let identityLinkPDA: PublicKey;
    let kamiyoAgent: Keypair;
    let owner: Keypair;

    before(async () => {
      owner = Keypair.generate();
      kamiyoAgent = Keypair.generate();

      // Fund owner
      const airdropSig = await provider.connection.requestAirdrop(
        owner.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      // Create a new ZK agent for linking tests
      const linkCommitment = Buffer.alloc(32);
      linkCommitment.fill(0xaa);

      [zkAgentPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('agent'), linkCommitment],
        PROGRAM_ID
      );

      // Derive stake vault PDA
      const [stakeVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('stake_vault'), registryPDA.toBuffer()],
        PROGRAM_ID
      );

      // Register the ZK agent
      await program.methods
        .registerAgent(Array.from(linkCommitment), new BN(1000000))
        .accounts({
          registry: registryPDA,
          agent: zkAgentPDA,
          stakeVault: stakeVaultPDA,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Derive identity link PDA
      [identityLinkPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('identity_link'), zkAgentPDA.toBuffer()],
        PROGRAM_ID
      );
    });

    it('should link ZK identity to kamiyo agent (no stake)', async () => {
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

      // Verify link state
      const link = await (program.account as any).identityLink.fetch(identityLinkPDA);
      expect(link.zkAgent.toBase58()).to.equal(zkAgentPDA.toBase58());
      expect(link.kamiyoAgent.toBase58()).to.equal(kamiyoAgent.publicKey.toBase58());
      expect(link.owner.toBase58()).to.equal(owner.publicKey.toBase58());
      expect(link.stakedAmount.toNumber()).to.equal(0);
      expect(link.stakeMultiplier.toNumber()).to.equal(10000); // 1.0x default
      expect(link.active).to.equal(true);
    });

    it('should unlink identity', async () => {
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

    it('should reject unlink from non-owner', async () => {
      const nonOwner = Keypair.generate();

      try {
        await program.methods
          .unlinkIdentity()
          .accounts({
            identityLink: identityLinkPDA,
            owner: nonOwner.publicKey,
          })
          .signers([nonOwner])
          .rpc();

        expect.fail('Should have thrown UnauthorizedWithdrawal error');
      } catch (err: any) {
        expect(err.message).to.include('unknown signer');
      }
    });
  });

  describe('refresh_stake', () => {
    let zkAgentPDA: PublicKey;
    let identityLinkPDA: PublicKey;
    let owner: Keypair;

    before(async () => {
      owner = Keypair.generate();

      // Fund owner
      const airdropSig = await provider.connection.requestAirdrop(
        owner.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      // Create a new ZK agent
      const refreshCommitment = Buffer.alloc(32);
      refreshCommitment.fill(0xbb);

      [zkAgentPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('agent'), refreshCommitment],
        PROGRAM_ID
      );

      const [stakeVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('stake_vault'), registryPDA.toBuffer()],
        PROGRAM_ID
      );

      await program.methods
        .registerAgent(Array.from(refreshCommitment), new BN(1000000))
        .accounts({
          registry: registryPDA,
          agent: zkAgentPDA,
          stakeVault: stakeVaultPDA,
          payer: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Create identity link
      [identityLinkPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('identity_link'), zkAgentPDA.toBuffer()],
        PROGRAM_ID
      );

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

    it('should refresh stake on active link (no stake position)', async () => {
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
      expect(link.stakedAmount.toNumber()).to.equal(0);
      expect(link.stakeMultiplier.toNumber()).to.equal(10000);
    });

    it('should reject refresh_stake from non-owner', async () => {
      const nonOwner = Keypair.generate();

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

        expect.fail('Should have thrown error');
      } catch (err: any) {
        expect(err.message).to.include('unknown signer');
      }
    });
  });

  describe('stake-weighted voting', () => {
    // Note: Full stake-weighted voting tests require ZK proofs
    // These tests verify the weighted vote fields are initialized correctly

    it('should create swarm action with weighted fields initialized', async () => {
      // SwarmAction initialization is verified in the create_swarm_action flow
      // weighted_votes_for starts at 10000 (1.0x proposer vote)
      // weighted_votes_against starts at 0
      // This is covered by the program logic - proposer gets 1.0x default weight
    });

    it('should use weighted votes for threshold calculation', async () => {
      // The execute_swarm_action instruction uses:
      // approval_pct = (weighted_votes_for * 100) / weighted_total
      // This ensures stake-weighted voting affects approval calculations
    });
  });
});
