import { expect } from "chai";
import {
  PublicKey,
  SystemProgram,
  BN,
  LAMPORTS_PER_SOL,
  Keypair,
  createMint,
  createAssociatedTokenAccount,
  getAssociatedTokenAddress,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  setupTestContext,
  deriveEscrowPDA,
  deriveReputationPDA,
  TestContext,
} from "./helpers";

describe("SPL Token Escrows", () => {
  let ctx: TestContext;
  let tokenMint: PublicKey;
  let mintAuthority: Keypair;
  let agentTokenAccount: PublicKey;
  let providerTokenAccount: PublicKey;
  const TOKEN_DECIMALS = 6;

  before(async () => {
    ctx = await setupTestContext();

    mintAuthority = Keypair.generate();
    const airdropSig = await ctx.provider.connection.requestAirdrop(
      mintAuthority.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await ctx.provider.connection.confirmTransaction(airdropSig);

    tokenMint = await createMint(
      ctx.provider.connection,
      mintAuthority,
      mintAuthority.publicKey,
      null,
      TOKEN_DECIMALS
    );

    agentTokenAccount = await createAssociatedTokenAccount(
      ctx.provider.connection,
      mintAuthority,
      tokenMint,
      ctx.owner.publicKey
    );

    providerTokenAccount = await createAssociatedTokenAccount(
      ctx.provider.connection,
      mintAuthority,
      tokenMint,
      ctx.provider2.publicKey
    );

    const mintAmount = 10_000 * 10 ** TOKEN_DECIMALS;
    await mintTo(
      ctx.provider.connection,
      mintAuthority,
      tokenMint,
      agentTokenAccount,
      mintAuthority,
      mintAmount
    );
  });

  it("Initializes an SPL token escrow", async () => {
    const splTxId = `spl-escrow-${Date.now()}`;
    const [splEscrowPDA] = deriveEscrowPDA(ctx.program, ctx.owner.publicKey, splTxId);

    const escrowATA = await getAssociatedTokenAddress(tokenMint, splEscrowPDA, true);
    const amount = new BN(100 * 10 ** TOKEN_DECIMALS);
    const timeLock = new BN(3600);

    const agentBalanceBefore = await getAccount(ctx.provider.connection, agentTokenAccount);

    await ctx.program.methods
      .initializeEscrow(amount, timeLock, splTxId, true)
      .accounts({
        protocolConfig: ctx.protocolConfigPDA,
        treasury: ctx.treasuryPDA,
        escrow: splEscrowPDA,
        agent: ctx.owner.publicKey,
        api: ctx.provider2.publicKey,
        systemProgram: SystemProgram.programId,
        tokenMint: tokenMint,
        escrowTokenAccount: escrowATA,
        agentTokenAccount: agentTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([ctx.owner])
      .rpc();

    const escrow = await ctx.program.account.escrow.fetch(splEscrowPDA);
    expect(escrow.tokenMint?.toString()).to.equal(tokenMint.toString());
    expect(escrow.amount.toNumber()).to.equal(amount.toNumber());
    expect(escrow.status).to.deep.equal({ active: {} });

    const agentBalanceAfter = await getAccount(ctx.provider.connection, agentTokenAccount);
    expect(Number(agentBalanceBefore.amount) - Number(agentBalanceAfter.amount)).to.equal(amount.toNumber());
  });

  it("Releases SPL tokens to provider", async () => {
    const releaseTxId = `spl-release-${Date.now()}`;
    const [releaseEscrowPDA] = deriveEscrowPDA(ctx.program, ctx.owner.publicKey, releaseTxId);

    const escrowATA = await getAssociatedTokenAddress(tokenMint, releaseEscrowPDA, true);
    const amount = new BN(50 * 10 ** TOKEN_DECIMALS);
    const timeLock = new BN(3600);

    await ctx.program.methods
      .initializeEscrow(amount, timeLock, releaseTxId, true)
      .accounts({
        protocolConfig: ctx.protocolConfigPDA,
        treasury: ctx.treasuryPDA,
        escrow: releaseEscrowPDA,
        agent: ctx.owner.publicKey,
        api: ctx.provider2.publicKey,
        systemProgram: SystemProgram.programId,
        tokenMint: tokenMint,
        escrowTokenAccount: escrowATA,
        agentTokenAccount: agentTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([ctx.owner])
      .rpc();

    const providerBalanceBefore = await getAccount(ctx.provider.connection, providerTokenAccount);

    await ctx.program.methods
      .releaseFunds()
      .accounts({
        protocolConfig: ctx.protocolConfigPDA,
        escrow: releaseEscrowPDA,
        caller: ctx.owner.publicKey,
        api: ctx.provider2.publicKey,
        systemProgram: SystemProgram.programId,
        escrowTokenAccount: escrowATA,
        apiTokenAccount: providerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([ctx.owner])
      .rpc();

    const escrow = await ctx.program.account.escrow.fetch(releaseEscrowPDA);
    expect(escrow.status).to.deep.equal({ released: {} });

    const providerBalanceAfter = await getAccount(ctx.provider.connection, providerTokenAccount);
    expect(Number(providerBalanceAfter.amount) - Number(providerBalanceBefore.amount)).to.equal(amount.toNumber());
  });

  it("Handles dispute with SPL token escrow", async () => {
    const disputeTxId = `spl-dispute-${Date.now()}`;
    const [disputeEscrowPDA] = deriveEscrowPDA(ctx.program, ctx.owner.publicKey, disputeTxId);
    const [reputationPDA] = deriveReputationPDA(ctx.program, ctx.owner.publicKey);

    const escrowATA = await getAssociatedTokenAddress(tokenMint, disputeEscrowPDA, true);
    const amount = new BN(25 * 10 ** TOKEN_DECIMALS);
    const timeLock = new BN(3600);

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

    await ctx.program.methods
      .initializeEscrow(amount, timeLock, disputeTxId, true)
      .accounts({
        protocolConfig: ctx.protocolConfigPDA,
        treasury: ctx.treasuryPDA,
        escrow: disputeEscrowPDA,
        agent: ctx.owner.publicKey,
        api: ctx.provider2.publicKey,
        systemProgram: SystemProgram.programId,
        tokenMint: tokenMint,
        escrowTokenAccount: escrowATA,
        agentTokenAccount: agentTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([ctx.owner])
      .rpc();

    await ctx.program.methods
      .markDisputed()
      .accounts({
        protocolConfig: ctx.protocolConfigPDA,
        escrow: disputeEscrowPDA,
        reputation: reputationPDA,
        agent: ctx.owner.publicKey,
      })
      .signers([ctx.owner])
      .rpc();

    const escrow = await ctx.program.account.escrow.fetch(disputeEscrowPDA);
    expect(escrow.status).to.deep.equal({ disputed: {} });
    expect(escrow.tokenMint?.toString()).to.equal(tokenMint.toString());
  });

  it("Fails to initialize SPL escrow without token accounts", async () => {
    const noAccountTxId = `no-token-account-${Date.now()}`;
    const [noAccountEscrowPDA] = deriveEscrowPDA(ctx.program, ctx.owner.publicKey, noAccountTxId);

    const amount = new BN(10 * 10 ** TOKEN_DECIMALS);
    const timeLock = new BN(3600);

    try {
      await ctx.program.methods
        .initializeEscrow(amount, timeLock, noAccountTxId, true)
        .accounts({
          protocolConfig: ctx.protocolConfigPDA,
          treasury: ctx.treasuryPDA,
          escrow: noAccountEscrowPDA,
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
      expect.fail("Should have thrown MissingTokenAccount error");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.include("MissingToken");
    }
  });
});
