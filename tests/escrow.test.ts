import { expect } from "chai";
import {
  SystemProgram,
  BN,
  LAMPORTS_PER_SOL,
  setupTestContext,
  deriveEscrowPDA,
  TestContext,
} from "./helpers";

describe("Escrow Agreements", () => {
  let ctx: TestContext;
  const transactionId = `escrow-test-${Date.now()}`;

  before(async () => {
    ctx = await setupTestContext();
  });

  it("Initializes an escrow agreement", async () => {
    const [escrowPDA] = deriveEscrowPDA(ctx.program, ctx.owner.publicKey, transactionId);
    const amount = new BN(0.1 * LAMPORTS_PER_SOL);
    const timeLock = new BN(3600);

    await ctx.program.methods
      .initializeEscrow(amount, timeLock, transactionId, false)
      .accounts({
        protocolConfig: ctx.protocolConfigPDA,
        treasury: ctx.treasuryPDA,
        escrow: escrowPDA,
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

    const escrow = await ctx.program.account.escrow.fetch(escrowPDA);
    expect(escrow.agent.toString()).to.equal(ctx.owner.publicKey.toString());
    expect(escrow.api.toString()).to.equal(ctx.provider2.publicKey.toString());
    expect(escrow.amount.toNumber()).to.equal(amount.toNumber());
    expect(escrow.transactionId).to.equal(transactionId);
    expect(escrow.status).to.deep.equal({ active: {} });
  });

  it("Fails to create escrow with invalid time lock", async () => {
    const newTxId = `invalid-timelock-${Date.now()}`;
    const [newEscrowPDA] = deriveEscrowPDA(ctx.program, ctx.owner.publicKey, newTxId);

    const amount = new BN(0.1 * LAMPORTS_PER_SOL);
    const invalidTimeLock = new BN(60);

    try {
      await ctx.program.methods
        .initializeEscrow(amount, invalidTimeLock, newTxId, false)
        .accounts({
          protocolConfig: ctx.protocolConfigPDA,
          treasury: ctx.treasuryPDA,
          escrow: newEscrowPDA,
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
      expect.fail("Should have thrown InvalidTimeLock error");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.include("InvalidTimeLock");
    }
  });

  it("Releases funds to provider", async () => {
    const releaseTxId = `release-${Date.now()}`;
    const [releaseEscrowPDA] = deriveEscrowPDA(ctx.program, ctx.owner.publicKey, releaseTxId);

    const amount = new BN(0.05 * LAMPORTS_PER_SOL);
    const timeLock = new BN(3600);

    await ctx.program.methods
      .initializeEscrow(amount, timeLock, releaseTxId, false)
      .accounts({
        protocolConfig: ctx.protocolConfigPDA,
        treasury: ctx.treasuryPDA,
        escrow: releaseEscrowPDA,
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

    const providerBalanceBefore = await ctx.provider.connection.getBalance(ctx.provider2.publicKey);

    await ctx.program.methods
      .releaseFunds()
      .accounts({
        protocolConfig: ctx.protocolConfigPDA,
        escrow: releaseEscrowPDA,
        caller: ctx.owner.publicKey,
        api: ctx.provider2.publicKey,
        systemProgram: SystemProgram.programId,
        escrowTokenAccount: null,
        apiTokenAccount: null,
        tokenProgram: null,
      })
      .signers([ctx.owner])
      .rpc();

    const escrow = await ctx.program.account.escrow.fetch(releaseEscrowPDA);
    expect(escrow.status).to.deep.equal({ released: {} });

    const providerBalanceAfter = await ctx.provider.connection.getBalance(ctx.provider2.publicKey);
    expect(providerBalanceAfter - providerBalanceBefore).to.equal(amount.toNumber());
  });
});
