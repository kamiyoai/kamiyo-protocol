import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { KamiyoBountyResolver } from "../target/types/kamiyo_bounty_resolver";
import { expect } from "chai";
import { Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

describe("kamiyo-bounty-resolver", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.KamiyoBountyResolver as Program<KamiyoBountyResolver>;
  
  const creator = Keypair.generate();
  const worker = Keypair.generate();
  const bountyId = new anchor.BN(1);
  const rewardAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
  
  let bountyPda: anchor.web3.PublicKey;
  let bountyBump: number;

  before(async () => {
    // Airdrop SOL to test accounts
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(creator.publicKey, 2 * LAMPORTS_PER_SOL),
      "confirmed"
    );
    
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(worker.publicKey, 1 * LAMPORTS_PER_SOL),
      "confirmed"
    );

    // Derive bounty PDA
    [bountyPda, bountyBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("bounty"),
        creator.publicKey.toBuffer(),
        bountyId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
  });

  it("Creates a bounty", async () => {
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const description = "Build a simple calculator widget";

    const tx = await program.methods
      .createBounty(
        bountyId,
        rewardAmount,
        description,
        new anchor.BN(deadline)
      )
      .accounts({
        bounty: bountyPda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    console.log("Create bounty transaction signature:", tx);

    // Fetch the created bounty
    const bountyAccount = await program.account.bounty.fetch(bountyPda);
    
    expect(bountyAccount.creator.equals(creator.publicKey)).to.be.true;
    expect(bountyAccount.bountyId.toString()).to.equal(bountyId.toString());
    expect(bountyAccount.rewardAmount.toString()).to.equal(rewardAmount.toString());
    expect(bountyAccount.description).to.equal(description);
    expect(bountyAccount.deadline.toString()).to.equal(deadline.toString());
    expect(bountyAccount.status).to.deep.equal({ open: {} });
  });

  it("Submits work for the bounty", async () => {
    const submissionHash = Array.from(Buffer.from("test_submission_hash_123456789012", "utf-8"));
    const submissionUri = "https://github.com/worker/calculator-widget";

    // Pad the hash to 32 bytes
    while (submissionHash.length < 32) {
      submissionHash.push(0);
    }

    const tx = await program.methods
      .submitWork(submissionHash, submissionUri)
      .accounts({
        bounty: bountyPda,
        worker: worker.publicKey,
      })
      .signers([worker])
      .rpc();

    console.log("Submit work transaction signature:", tx);

    // Fetch the updated bounty
    const bountyAccount = await program.account.bounty.fetch(bountyPda);
    
    expect(bountyAccount.worker.equals(worker.publicKey)).to.be.true;
    expect(bountyAccount.submissionHash).to.deep.equal(submissionHash);
    expect(bountyAccount.status).to.deep.equal({ workSubmitted: {} });
  });

  it("Resolves bounty by accepting work", async () => {
    const workerBalanceBefore = await provider.connection.getBalance(worker.publicKey);
    
    const tx = await program.methods
      .resolveBounty(true) // Accept work
      .accounts({
        bounty: bountyPda,
        creator: creator.publicKey,
        worker: worker.publicKey,
      })
      .signers([creator])
      .rpc();

    console.log("Resolve bounty transaction signature:", tx);

    // Fetch the updated bounty
    const bountyAccount = await program.account.bounty.fetch(bountyPda);
    expect(bountyAccount.status).to.deep.equal({ completed: {} });

    // Check worker received payment
    const workerBalanceAfter = await provider.connection.getBalance(worker.publicKey);
    const expectedIncrease = rewardAmount.toNumber();
    expect(workerBalanceAfter - workerBalanceBefore).to.equal(expectedIncrease);
  });

  it("Creates and rejects another bounty", async () => {
    const worker2 = Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(worker2.publicKey, 1 * LAMPORTS_PER_SOL),
      "confirmed"
    );

    const bountyId2 = new anchor.BN(2);
    const [bounty2Pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("bounty"),
        creator.publicKey.toBuffer(),
        bountyId2.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // Create bounty
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    await program.methods
      .createBounty(
        bountyId2,
        rewardAmount,
        "Build a todo app",
        new anchor.BN(deadline)
      )
      .accounts({
        bounty: bounty2Pda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Submit work
    const submissionHash = Array.from(Buffer.from("poor_quality_submission_hash1234", "utf-8"));
    while (submissionHash.length < 32) {
      submissionHash.push(0);
    }

    await program.methods
      .submitWork(submissionHash, "https://github.com/worker2/bad-todo")
      .accounts({
        bounty: bounty2Pda,
        worker: worker2.publicKey,
      })
      .signers([worker2])
      .rpc();

    // Reject work
    const creatorBalanceBefore = await provider.connection.getBalance(creator.publicKey);
    
    const tx = await program.methods
      .resolveBounty(false) // Reject work
      .accounts({
        bounty: bounty2Pda,
        creator: creator.publicKey,
        worker: worker2.publicKey,
      })
      .signers([creator])
      .rpc();

    console.log("Reject work transaction signature:", tx);

    // Fetch the updated bounty
    const bountyAccount = await program.account.bounty.fetch(bounty2Pda);
    expect(bountyAccount.status).to.deep.equal({ rejected: {} });

    // Creator should get refund (minus transaction fees)
    const creatorBalanceAfter = await provider.connection.getBalance(creator.publicKey);
    expect(creatorBalanceAfter).to.be.greaterThan(creatorBalanceBefore);
  });
});