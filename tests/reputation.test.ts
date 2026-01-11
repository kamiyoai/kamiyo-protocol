import { expect } from "chai";
import {
  SystemProgram,
  setupTestContext,
  deriveReputationPDA,
  TestContext,
} from "./helpers";

describe("Reputation", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await setupTestContext();
  });

  it("Initializes reputation for an entity", async () => {
    const [reputationPDA] = deriveReputationPDA(ctx.program, ctx.owner.publicKey);

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

    const reputation = await ctx.program.account.entityReputation.fetch(reputationPDA);
    expect(reputation.entity.toString()).to.equal(ctx.owner.publicKey.toString());
    expect(reputation.totalTransactions.toNumber()).to.equal(0);
    expect(reputation.reputationScore).to.equal(500);
  });
});
