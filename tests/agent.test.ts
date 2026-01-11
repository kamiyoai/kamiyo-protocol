import { expect } from "chai";
import {
  anchor,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  BN,
  getErrorCode,
  setupTestContext,
  deriveAgentPDA,
  TestContext,
} from "./helpers";

describe("Agent Identity", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await setupTestContext();
  });

  it("Creates an agent with stake", async () => {
    const [agentPDA] = deriveAgentPDA(ctx.program, ctx.owner.publicKey);
    const name = "TestAgent";
    const agentType = { trading: {} };
    const stakeAmount = new BN(0.5 * LAMPORTS_PER_SOL);

    await ctx.program.methods
      .createAgent(name, agentType, stakeAmount)
      .accounts({
        agent: agentPDA,
        owner: ctx.owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.owner])
      .rpc();

    const agent = await ctx.program.account.agentIdentity.fetch(agentPDA);
    expect(agent.name).to.equal(name);
    expect(agent.owner.toString()).to.equal(ctx.owner.publicKey.toString());
    expect(agent.isActive).to.be.true;
    expect(agent.reputation.toNumber()).to.equal(500);
    expect(agent.stakeAmount.toNumber()).to.equal(stakeAmount.toNumber());
  });

  it("Fails to create agent with insufficient stake", async () => {
    const owner2 = Keypair.generate();
    const airdropSig = await ctx.provider.connection.requestAirdrop(
      owner2.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await ctx.provider.connection.confirmTransaction(airdropSig);

    const [agent2PDA] = deriveAgentPDA(ctx.program, owner2.publicKey);
    const insufficientStake = new BN(0.01 * LAMPORTS_PER_SOL);

    try {
      await ctx.program.methods
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
    const airdropSig = await ctx.provider.connection.requestAirdrop(
      owner3.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await ctx.provider.connection.confirmTransaction(airdropSig);

    const [agent3PDA] = deriveAgentPDA(ctx.program, owner3.publicKey);

    try {
      await ctx.program.methods
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

  it("Deactivates agent and returns stake", async () => {
    const deactivateOwner = Keypair.generate();
    const airdropSig = await ctx.provider.connection.requestAirdrop(
      deactivateOwner.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await ctx.provider.connection.confirmTransaction(airdropSig);

    const [deactivateAgentPDA] = deriveAgentPDA(ctx.program, deactivateOwner.publicKey);
    const stakeAmount = new BN(0.5 * LAMPORTS_PER_SOL);

    await ctx.program.methods
      .createAgent("DeactivateTest", { service: {} }, stakeAmount)
      .accounts({
        agent: deactivateAgentPDA,
        owner: deactivateOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([deactivateOwner])
      .rpc();

    const balanceBefore = await ctx.provider.connection.getBalance(deactivateOwner.publicKey);

    await ctx.program.methods
      .deactivateAgent()
      .accounts({
        agent: deactivateAgentPDA,
        owner: deactivateOwner.publicKey,
      })
      .signers([deactivateOwner])
      .rpc();

    const agent = await ctx.program.account.agentIdentity.fetch(deactivateAgentPDA);
    expect(agent.isActive).to.be.false;
    expect(agent.stakeAmount.toNumber()).to.equal(0);

    const balanceAfter = await ctx.provider.connection.getBalance(deactivateOwner.publicKey);
    expect(balanceAfter).to.be.greaterThan(balanceBefore);
  });
});
