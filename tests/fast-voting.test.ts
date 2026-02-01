import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { KamiyoFastVoting } from "../target/types/kamiyo_fast_voting";

describe("kamiyo-fast-voting", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.KamiyoFastVoting as Program<KamiyoFastVoting>;

  let creator: Keypair;
  let voter1: Keypair;
  let voter2: Keypair;
  let actionId: anchor.BN;

  const FAST_ACTION_SEED = Buffer.from("fast_action");
  const FAST_VOTE_SEED = Buffer.from("fast_vote");

  function deriveFastActionPDA(actionId: anchor.BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [FAST_ACTION_SEED, actionId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
  }

  function deriveFastVotePDA(fastAction: PublicKey, voter: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [FAST_VOTE_SEED, fastAction.toBuffer(), voter.toBuffer()],
      program.programId
    );
  }

  before(async () => {
    creator = Keypair.generate();
    voter1 = Keypair.generate();
    voter2 = Keypair.generate();
    actionId = new anchor.BN(Date.now());

    // Fund accounts
    const sigs = await Promise.all([
      provider.connection.requestAirdrop(creator.publicKey, 5 * LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(voter1.publicKey, 2 * LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(voter2.publicKey, 2 * LAMPORTS_PER_SOL),
    ]);
    await Promise.all(sigs.map(sig => provider.connection.confirmTransaction(sig)));
  });

  describe("create_fast_action", () => {
    it("creates action with valid params", async () => {
      const [fastActionPDA] = deriveFastActionPDA(actionId);
      const actionHash = Buffer.alloc(32, 1);
      const descHash = Buffer.alloc(32, 2);

      await program.methods
        .createFastAction(actionId, Array.from(actionHash), 51, Array.from(descHash))
        .accounts({
          fastAction: fastActionPDA,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      const action = await program.account.fastAction.fetch(fastActionPDA);
      expect(action.actionId.toNumber()).to.equal(actionId.toNumber());
      expect(action.threshold).to.equal(51);
      expect(action.votesFor).to.equal(0);
      expect(action.votesAgainst).to.equal(0);
      expect(action.executed).to.equal(false);
      expect(action.creator.toString()).to.equal(creator.publicKey.toString());
    });

    it("rejects threshold 0", async () => {
      const badId = new anchor.BN(Date.now() + 1);
      const [pda] = deriveFastActionPDA(badId);

      try {
        await program.methods
          .createFastAction(badId, Array.from(Buffer.alloc(32, 1)), 0, Array.from(Buffer.alloc(32)))
          .accounts({
            fastAction: pda,
            creator: creator.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("InvalidThreshold");
      }
    });

    it("rejects threshold > 100", async () => {
      const badId = new anchor.BN(Date.now() + 2);
      const [pda] = deriveFastActionPDA(badId);

      try {
        await program.methods
          .createFastAction(badId, Array.from(Buffer.alloc(32, 1)), 101, Array.from(Buffer.alloc(32)))
          .accounts({
            fastAction: pda,
            creator: creator.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("InvalidThreshold");
      }
    });

    it("rejects zero action hash", async () => {
      const badId = new anchor.BN(Date.now() + 3);
      const [pda] = deriveFastActionPDA(badId);

      try {
        await program.methods
          .createFastAction(badId, Array.from(Buffer.alloc(32, 0)), 50, Array.from(Buffer.alloc(32)))
          .accounts({
            fastAction: pda,
            creator: creator.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("InvalidActionHash");
      }
    });
  });

  describe("vote_fast", () => {
    let voteActionId: anchor.BN;
    let fastActionPDA: PublicKey;

    before(async () => {
      voteActionId = new anchor.BN(Date.now() + 100);
      [fastActionPDA] = deriveFastActionPDA(voteActionId);

      await program.methods
        .createFastAction(
          voteActionId,
          Array.from(Buffer.alloc(32, 5)),
          50,
          Array.from(Buffer.alloc(32))
        )
        .accounts({
          fastAction: fastActionPDA,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
    });

    it("voter1 votes YES", async () => {
      const [votePDA] = deriveFastVotePDA(fastActionPDA, voter1.publicKey);
      const commitment = Buffer.alloc(32, 11);

      await program.methods
        .voteFast(voteActionId, true, Array.from(commitment))
        .accounts({
          fastAction: fastActionPDA,
          fastVote: votePDA,
          voter: voter1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([voter1])
        .rpc();

      const action = await program.account.fastAction.fetch(fastActionPDA);
      expect(action.votesFor).to.equal(1);
      expect(action.votesAgainst).to.equal(0);
      expect(action.voteCount).to.equal(1);
    });

    it("voter2 votes NO", async () => {
      const [votePDA] = deriveFastVotePDA(fastActionPDA, voter2.publicKey);
      const commitment = Buffer.alloc(32, 22);

      await program.methods
        .voteFast(voteActionId, false, Array.from(commitment))
        .accounts({
          fastAction: fastActionPDA,
          fastVote: votePDA,
          voter: voter2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([voter2])
        .rpc();

      const action = await program.account.fastAction.fetch(fastActionPDA);
      expect(action.votesFor).to.equal(1);
      expect(action.votesAgainst).to.equal(1);
      expect(action.voteCount).to.equal(2);
    });

    it("rejects double voting", async () => {
      const [votePDA] = deriveFastVotePDA(fastActionPDA, voter1.publicKey);

      try {
        await program.methods
          .voteFast(voteActionId, true, Array.from(Buffer.alloc(32, 99)))
          .accounts({
            fastAction: fastActionPDA,
            fastVote: votePDA,
            voter: voter1.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([voter1])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        // Account already exists constraint
        expect(err.message).to.include("already in use");
      }
    });

    it("rejects zero voter commitment", async () => {
      const newVoter = Keypair.generate();
      await provider.connection.requestAirdrop(newVoter.publicKey, LAMPORTS_PER_SOL);

      const [votePDA] = deriveFastVotePDA(fastActionPDA, newVoter.publicKey);

      try {
        await program.methods
          .voteFast(voteActionId, true, Array.from(Buffer.alloc(32, 0)))
          .accounts({
            fastAction: fastActionPDA,
            fastVote: votePDA,
            voter: newVoter.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([newVoter])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("InvalidVoterCommitment");
      }
    });
  });

  describe("cancel_action", () => {
    it("creator can cancel their action", async () => {
      const cancelId = new anchor.BN(Date.now() + 200);
      const [pda] = deriveFastActionPDA(cancelId);

      await program.methods
        .createFastAction(cancelId, Array.from(Buffer.alloc(32, 7)), 50, Array.from(Buffer.alloc(32)))
        .accounts({
          fastAction: pda,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      await program.methods
        .cancelAction(cancelId)
        .accounts({
          fastAction: pda,
          creator: creator.publicKey,
        })
        .signers([creator])
        .rpc();

      const action = await program.account.fastAction.fetch(pda);
      expect(action.executed).to.equal(true);
      expect(JSON.stringify(action.result)).to.include("cancelled");
    });

    it("non-creator cannot cancel", async () => {
      const otherId = new anchor.BN(Date.now() + 300);
      const [pda] = deriveFastActionPDA(otherId);

      await program.methods
        .createFastAction(otherId, Array.from(Buffer.alloc(32, 8)), 50, Array.from(Buffer.alloc(32)))
        .accounts({
          fastAction: pda,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      try {
        await program.methods
          .cancelAction(otherId)
          .accounts({
            fastAction: pda,
            creator: voter1.publicKey,
          })
          .signers([voter1])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }
    });

    it("cannot cancel already executed action", async () => {
      const execId = new anchor.BN(Date.now() + 400);
      const [pda] = deriveFastActionPDA(execId);

      await program.methods
        .createFastAction(execId, Array.from(Buffer.alloc(32, 9)), 50, Array.from(Buffer.alloc(32)))
        .accounts({
          fastAction: pda,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      // Cancel first time
      await program.methods
        .cancelAction(execId)
        .accounts({
          fastAction: pda,
          creator: creator.publicKey,
        })
        .signers([creator])
        .rpc();

      // Try to cancel again
      try {
        await program.methods
          .cancelAction(execId)
          .accounts({
            fastAction: pda,
            creator: creator.publicKey,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.include("ActionAlreadyExecuted");
      }
    });
  });

  describe("account sizes", () => {
    it("FastAction size is correct", async () => {
      const testId = new anchor.BN(Date.now() + 500);
      const [pda] = deriveFastActionPDA(testId);

      await program.methods
        .createFastAction(testId, Array.from(Buffer.alloc(32, 10)), 50, Array.from(Buffer.alloc(32)))
        .accounts({
          fastAction: pda,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      const info = await provider.connection.getAccountInfo(pda);
      expect(info).to.not.be.null;
      expect(info!.data.length).to.equal(145);
    });

    it("FastVote size is correct", async () => {
      const testId = new anchor.BN(Date.now() + 600);
      const [actionPda] = deriveFastActionPDA(testId);

      await program.methods
        .createFastAction(testId, Array.from(Buffer.alloc(32, 11)), 50, Array.from(Buffer.alloc(32)))
        .accounts({
          fastAction: actionPda,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      const [votePda] = deriveFastVotePDA(actionPda, creator.publicKey);
      await program.methods
        .voteFast(testId, true, Array.from(Buffer.alloc(32, 1)))
        .accounts({
          fastAction: actionPda,
          fastVote: votePda,
          voter: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      const info = await provider.connection.getAccountInfo(votePda);
      expect(info).to.not.be.null;
      expect(info!.data.length).to.equal(114);
    });
  });
});
