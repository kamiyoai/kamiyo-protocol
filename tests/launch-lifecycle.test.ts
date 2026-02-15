import { expect } from "chai";
import {
  anchor,
  SystemProgram,
  BN,
  LAMPORTS_PER_SOL,
  Keypair,
  PublicKey,
  setupTestContext,
  deriveAgentPDA,
  getErrorCode,
  TestContext,
} from "./helpers";

function deriveLaunchRecordPDA(
  program: any,
  agent: PublicKey,
  mint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("launch"), agent.toBuffer(), mint.toBuffer()],
    program.programId
  );
}

function deriveLaunchRateLimitPDA(
  program: any,
  agent: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("launch_rate"), agent.toBuffer()],
    program.programId
  );
}

describe("Trusted Launch Lifecycle", () => {
  let ctx: TestContext;
  let agentPDA: PublicKey;
  let mintKeypair: Keypair;

  before(async () => {
    ctx = await setupTestContext();

    // Create agent identity with stake
    const [agentPda] = deriveAgentPDA(ctx.program, ctx.owner.publicKey);
    agentPDA = agentPda;

    await ctx.program.methods
      .createAgent("launch-test-agent", { trading: {} }, new BN(0.5 * LAMPORTS_PER_SOL))
      .accounts({
        agent: agentPDA,
        owner: ctx.owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.owner])
      .rpc();

    mintKeypair = Keypair.generate();
  });

  describe("Create Trusted Launch", () => {
    it("Creates a trusted launch with valid params", async () => {
      const mint = mintKeypair.publicKey;
      const [launchRecordPDA] = deriveLaunchRecordPDA(ctx.program, agentPDA, mint);
      const [rateLimitPDA] = deriveLaunchRateLimitPDA(ctx.program, agentPDA);

      const escrowAmount = new BN(1 * LAMPORTS_PER_SOL);
      const fundryCoinId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
      const configType = "community";

      await ctx.program.methods
        .createTrustedLaunch(
          fundryCoinId,
          configType,
          escrowAmount,
          new BN(85 * LAMPORTS_PER_SOL),
          500
        )
        .accounts({
          protocolConfig: ctx.protocolConfigPDA,
          treasury: ctx.treasuryPDA,
          agentIdentity: agentPDA,
          launchRecord: launchRecordPDA,
          launchRateLimit: rateLimitPDA,
          mint,
          owner: ctx.owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.owner])
        .rpc();

      const launch = await ctx.program.account.launchRecord.fetch(launchRecordPDA);
      expect(launch.agent.toString()).to.equal(agentPDA.toString());
      expect(launch.mint.toString()).to.equal(mint.toString());
      expect(launch.fundryCoinId).to.equal(fundryCoinId);
      expect(launch.configType).to.equal(configType);
      expect(launch.escrowAmount.toNumber()).to.equal(escrowAmount.toNumber());
      expect(launch.status).to.deep.equal({ active: {} });

      const rateLimit = await ctx.program.account.launchRateLimit.fetch(rateLimitPDA);
      expect(rateLimit.launchesToday).to.equal(1);
      expect(rateLimit.totalLaunches.toNumber()).to.equal(1);
    });

    it("Rejects invalid Fundry coin ID (wrong length)", async () => {
      const badMint = Keypair.generate().publicKey;
      const [launchPDA] = deriveLaunchRecordPDA(ctx.program, agentPDA, badMint);
      const [rateLimitPDA] = deriveLaunchRateLimitPDA(ctx.program, agentPDA);

      try {
        await ctx.program.methods
          .createTrustedLaunch(
            "too-short",
            "community",
            new BN(0.5 * LAMPORTS_PER_SOL),
            new BN(85 * LAMPORTS_PER_SOL),
            500
          )
          .accounts({
            protocolConfig: ctx.protocolConfigPDA,
            treasury: ctx.treasuryPDA,
            agentIdentity: agentPDA,
            launchRecord: launchPDA,
            launchRateLimit: rateLimitPDA,
            mint: badMint,
            owner: ctx.owner.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([ctx.owner])
          .rpc();
        expect.fail("Should have thrown InvalidFundryCoinId");
      } catch (err: any) {
        const code = getErrorCode(err);
        expect(code).to.equal("InvalidFundryCoinId");
      }
    });

    it("Rejects escrow below minimum", async () => {
      const badMint = Keypair.generate().publicKey;
      const [launchPDA] = deriveLaunchRecordPDA(ctx.program, agentPDA, badMint);
      const [rateLimitPDA] = deriveLaunchRateLimitPDA(ctx.program, agentPDA);

      try {
        await ctx.program.methods
          .createTrustedLaunch(
            "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "community",
            new BN(100), // way below minimum
            new BN(85 * LAMPORTS_PER_SOL),
            500
          )
          .accounts({
            protocolConfig: ctx.protocolConfigPDA,
            treasury: ctx.treasuryPDA,
            agentIdentity: agentPDA,
            launchRecord: launchPDA,
            launchRateLimit: rateLimitPDA,
            mint: badMint,
            owner: ctx.owner.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([ctx.owner])
          .rpc();
        expect.fail("Should have thrown InvalidAmount");
      } catch (err: any) {
        const code = getErrorCode(err);
        expect(code).to.equal("InvalidAmount");
      }
    });
  });

  describe("Rate Limiting", () => {
    it("Enforces 3 launches per day", async () => {
      // Launches 2 and 3 (launch 1 was in the first test)
      for (let i = 2; i <= 3; i++) {
        const mint = Keypair.generate().publicKey;
        const [launchPDA] = deriveLaunchRecordPDA(ctx.program, agentPDA, mint);
        const [rateLimitPDA] = deriveLaunchRateLimitPDA(ctx.program, agentPDA);

        await ctx.program.methods
          .createTrustedLaunch(
            `a1b2c3d4-e5f6-7890-abcd-ef123456789${i}`,
            "community",
            new BN(0.5 * LAMPORTS_PER_SOL),
            new BN(85 * LAMPORTS_PER_SOL),
            500
          )
          .accounts({
            protocolConfig: ctx.protocolConfigPDA,
            treasury: ctx.treasuryPDA,
            agentIdentity: agentPDA,
            launchRecord: launchPDA,
            launchRateLimit: rateLimitPDA,
            mint,
            owner: ctx.owner.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([ctx.owner])
          .rpc();
      }

      // 4th launch should fail
      const mint4 = Keypair.generate().publicKey;
      const [launchPDA4] = deriveLaunchRecordPDA(ctx.program, agentPDA, mint4);
      const [rateLimitPDA] = deriveLaunchRateLimitPDA(ctx.program, agentPDA);

      try {
        await ctx.program.methods
          .createTrustedLaunch(
            "a1b2c3d4-e5f6-7890-abcd-ef1234567894",
            "community",
            new BN(0.5 * LAMPORTS_PER_SOL),
            new BN(85 * LAMPORTS_PER_SOL),
            500
          )
          .accounts({
            protocolConfig: ctx.protocolConfigPDA,
            treasury: ctx.treasuryPDA,
            agentIdentity: agentPDA,
            launchRecord: launchPDA4,
            launchRateLimit: rateLimitPDA,
            mint: mint4,
            owner: ctx.owner.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([ctx.owner])
          .rpc();
        expect.fail("Should have thrown LaunchRateLimitExceeded");
      } catch (err: any) {
        const code = getErrorCode(err);
        expect(code).to.equal("LaunchRateLimitExceeded");
      }
    });
  });

  describe("Graduation", () => {
    it("Records graduation with Meteora pool address", async () => {
      const mint = mintKeypair.publicKey;
      const [launchRecordPDA] = deriveLaunchRecordPDA(ctx.program, agentPDA, mint);
      const [rateLimitPDA] = deriveLaunchRateLimitPDA(ctx.program, agentPDA);
      const meteoraPool = Keypair.generate().publicKey;

      await ctx.program.methods
        .recordGraduation(meteoraPool)
        .accounts({
          launchRecord: launchRecordPDA,
          launchRateLimit: rateLimitPDA,
          owner: ctx.owner.publicKey,
        })
        .signers([ctx.owner])
        .rpc();

      const launch = await ctx.program.account.launchRecord.fetch(launchRecordPDA);
      expect(launch.status).to.deep.equal({ graduated: {} });
      expect(launch.graduationPool.toString()).to.equal(meteoraPool.toString());
      expect(launch.graduatedAt).to.not.be.null;
    });

    it("Prevents duplicate graduation", async () => {
      const mint = mintKeypair.publicKey;
      const [launchRecordPDA] = deriveLaunchRecordPDA(ctx.program, agentPDA, mint);
      const [rateLimitPDA] = deriveLaunchRateLimitPDA(ctx.program, agentPDA);

      try {
        await ctx.program.methods
          .recordGraduation(Keypair.generate().publicKey)
          .accounts({
            launchRecord: launchRecordPDA,
            launchRateLimit: rateLimitPDA,
            owner: ctx.owner.publicKey,
          })
          .signers([ctx.owner])
          .rpc();
        expect.fail("Should have thrown LaunchNotActive");
      } catch (err: any) {
        const code = getErrorCode(err);
        expect(code).to.equal("LaunchNotActive");
      }
    });
  });

  describe("Release", () => {
    it("Rejects release before 7-day delay", async () => {
      const mint = mintKeypair.publicKey;
      const [launchRecordPDA] = deriveLaunchRecordPDA(ctx.program, agentPDA, mint);

      try {
        await ctx.program.methods
          .releaseLaunch()
          .accounts({
            launchRecord: launchRecordPDA,
            owner: ctx.owner.publicKey,
          })
          .signers([ctx.owner])
          .rpc();
        expect.fail("Should have thrown LaunchReleaseDelayNotMet");
      } catch (err: any) {
        const code = getErrorCode(err);
        expect(code).to.equal("LaunchReleaseDelayNotMet");
      }
    });
  });

  describe("Dispute", () => {
    it("Allows any reporter to dispute a launch", async () => {
      const mint = mintKeypair.publicKey;
      const [launchRecordPDA] = deriveLaunchRecordPDA(ctx.program, agentPDA, mint);
      const [rateLimitPDA] = deriveLaunchRateLimitPDA(ctx.program, agentPDA);
      const evidenceHash = "a1b2c3d4e5f6";

      await ctx.program.methods
        .disputeLaunch(evidenceHash)
        .accounts({
          launchRecord: launchRecordPDA,
          launchRateLimit: rateLimitPDA,
          reporter: ctx.provider2.publicKey,
        })
        .signers([ctx.provider2])
        .rpc();

      const launch = await ctx.program.account.launchRecord.fetch(launchRecordPDA);
      expect(launch.status).to.deep.equal({ disputed: {} });
      expect(launch.disputeReporter.toString()).to.equal(ctx.provider2.publicKey.toString());
      expect(launch.disputeEvidenceHash).to.equal(evidenceHash);
      expect(launch.disputedAt).to.not.be.null;
    });

    it("Allows protocol multisig to resolve a launch dispute", async () => {
      const mint = mintKeypair.publicKey;
      const [launchRecordPDA] = deriveLaunchRecordPDA(ctx.program, agentPDA, mint);

      const before = await ctx.provider.connection.getBalance(ctx.provider2.publicKey);

      await ctx.program.methods
        .resolveLaunchDispute(0)
        .accounts({
          protocolConfig: ctx.protocolConfigPDA,
          launchRecord: launchRecordPDA,
          owner: ctx.owner.publicKey,
          reporter: ctx.provider2.publicKey,
          signerOne: ctx.provider.wallet.publicKey,
          signerTwo: ctx.provider.wallet.publicKey,
        })
        .rpc();

      const after = await ctx.provider.connection.getBalance(ctx.provider2.publicKey);
      expect(after - before).to.be.greaterThan(0.9 * LAMPORTS_PER_SOL);

      const launch = await ctx.program.account.launchRecord.fetch(launchRecordPDA);
      expect(launch.status).to.deep.equal({ resolved: {} });
      expect(launch.qualityScore).to.equal(0);
      expect(launch.refundPercentage).to.equal(100);
      expect(launch.resolvedAt).to.not.be.null;
    });
  });
});
