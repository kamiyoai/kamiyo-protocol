import { expect } from "chai";
import {
  SystemProgram,
  BN,
  LAMPORTS_PER_SOL,
  getErrorCode,
  setupTestContext,
  deriveEscrowPDA,
  deriveReputationPDA,
  TestContext,
} from "./helpers";

describe("Disputes", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await setupTestContext();

    const [reputationPDA] = deriveReputationPDA(ctx.program, ctx.owner.publicKey);
    try {
      await ctx.program.methods
        .initReputation()
        .accounts({
          reputation: reputationPDA,
          entity: ctx.owner.publicKey,
          payer: ctx.owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.owner])
        .rpc();
    } catch (e) {}
  });

  it("Marks an escrow as disputed", async () => {
    const disputeTxId = `dispute-${Date.now()}`;
    const [disputeEscrowPDA] = deriveEscrowPDA(ctx.program, ctx.owner.publicKey, disputeTxId);
    const [reputationPDA] = deriveReputationPDA(ctx.program, ctx.owner.publicKey);

    const amount = new BN(0.05 * LAMPORTS_PER_SOL);
    const timeLock = new BN(3600);

    await ctx.program.methods
      .initializeEscrow(amount, timeLock, disputeTxId, false)
      .accounts({
        protocolConfig: ctx.protocolConfigPDA,
        treasury: ctx.treasuryPDA,
        escrow: disputeEscrowPDA,
        agent: ctx.owner.publicKey,
        api: ctx.provider2.publicKey,
        systemProgram: SystemProgram.programId,
        tokenMint: null,
        escrowTokenAccount: null,
        agentTokenAccount: null,
        tokenProgram: null,
        associatedTokenProgram: null,
      })
      .signers([ctx.owner])
      .rpc();

    await ctx.program.methods
      .markDisputed()
      .accounts({
        escrow: disputeEscrowPDA,
        reputation: reputationPDA,
        agent: ctx.owner.publicKey,
      })
      .signers([ctx.owner])
      .rpc();

    const escrow = await ctx.program.account.escrow.fetch(disputeEscrowPDA);
    expect(escrow.status).to.deep.equal({ disputed: {} });

    const reputation = await ctx.program.account.entityReputation.fetch(reputationPDA);
    expect(reputation.disputesFiled.toNumber()).to.be.greaterThan(0);
  });

  it("Cannot dispute an already released escrow", async () => {
    const releasedTxId = `released-dispute-${Date.now()}`;
    const [releasedEscrowPDA] = deriveEscrowPDA(ctx.program, ctx.owner.publicKey, releasedTxId);
    const [reputationPDA] = deriveReputationPDA(ctx.program, ctx.owner.publicKey);

    const amount = new BN(0.02 * LAMPORTS_PER_SOL);
    const timeLock = new BN(3600);

    await ctx.program.methods
      .initializeEscrow(amount, timeLock, releasedTxId, false)
      .accounts({
        protocolConfig: ctx.protocolConfigPDA,
        treasury: ctx.treasuryPDA,
        escrow: releasedEscrowPDA,
        agent: ctx.owner.publicKey,
        api: ctx.provider2.publicKey,
        systemProgram: SystemProgram.programId,
        tokenMint: null,
        escrowTokenAccount: null,
        agentTokenAccount: null,
        tokenProgram: null,
        associatedTokenProgram: null,
      })
      .signers([ctx.owner])
      .rpc();

    await ctx.program.methods
      .releaseFunds()
      .accounts({
        protocolConfig: ctx.protocolConfigPDA,
        escrow: releasedEscrowPDA,
        caller: ctx.owner.publicKey,
        api: ctx.provider2.publicKey,
        systemProgram: SystemProgram.programId,
        escrowTokenAccount: null,
        apiTokenAccount: null,
        tokenProgram: null,
      })
      .signers([ctx.owner])
      .rpc();

    try {
      await ctx.program.methods
        .markDisputed()
        .accounts({
          escrow: releasedEscrowPDA,
          reputation: reputationPDA,
          agent: ctx.owner.publicKey,
        })
        .signers([ctx.owner])
        .rpc();
      expect.fail("Should have thrown InvalidStatus error");
    } catch (err: any) {
      expect(getErrorCode(err)).to.equal("InvalidStatus");
    }
  });
});
