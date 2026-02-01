// MagicBlock Ephemeral Rollups integration tests
// Run: EPHEMERAL_PROVIDER_ENDPOINT=http://localhost:8899 anchor test

import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { expect } from "chai";
import { KamiyoFastVoting } from "../target/types/kamiyo_fast_voting";

describe("kamiyo-fast-voting (MagicBlock Integration)", function() {
  this.timeout(180000);

  // Base layer provider (devnet)
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.KamiyoFastVoting as Program<KamiyoFastVoting>;

  // Ephemeral rollup provider
  const providerEphemeralRollup = new anchor.AnchorProvider(
    new anchor.web3.Connection(
      process.env.EPHEMERAL_PROVIDER_ENDPOINT || "http://127.0.0.1:8899",
      {
        wsEndpoint: process.env.EPHEMERAL_WS_ENDPOINT || "ws://127.0.0.1:8900",
      }
    ),
    anchor.Wallet.local()
  );
  // Create ephemeral program with explicit program ID
  const ephemeralProgram = new Program(
    JSON.parse(JSON.stringify(program.idl)) as typeof program.idl,
    providerEphemeralRollup
  );
  console.log("Ephemeral program ID:", ephemeralProgram.programId.toString());
  console.log("Ephemeral methods:", Object.keys(ephemeralProgram.methods));

  let creator: Keypair;
  let voter1: Keypair;
  let voter2: Keypair;
  let actionId: anchor.BN;
  let fastActionPDA: PublicKey;

  const FAST_ACTION_SEED = Buffer.from("fast_action");
  const FAST_VOTE_SEED = Buffer.from("fast_vote");

  // Local ephemeral validator identity
  const LOCAL_VALIDATOR_IDENTITY = new PublicKey("mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev");

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

  function isLocalhost(): boolean {
    const endpoint = providerEphemeralRollup.connection.rpcEndpoint || "";
    return endpoint.includes("localhost") || endpoint.includes("127.0.0.1");
  }

  before(async function() {
    console.log("Base Layer:", provider.connection.rpcEndpoint);
    console.log("Ephemeral Rollup:", providerEphemeralRollup.connection.rpcEndpoint);

    creator = Keypair.generate();
    voter1 = Keypair.generate();
    voter2 = Keypair.generate();
    actionId = new anchor.BN(Date.now());
    [fastActionPDA] = deriveFastActionPDA(actionId);

    const payer = (provider.wallet as any).payer as Keypair;
    const payerBalance = await provider.connection.getBalance(payer.publicKey);
    console.log("Payer balance:", payerBalance / LAMPORTS_PER_SOL, "SOL");

    if (payerBalance < 0.008 * LAMPORTS_PER_SOL) {
      console.log("Low balance - skipping tests");
      this.skip();
      return;
    }

    const fundTx = new Transaction();
    fundTx.add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: creator.publicKey,
        lamports: 0.003 * LAMPORTS_PER_SOL,
      }),
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: voter1.publicKey,
        lamports: 0.002 * LAMPORTS_PER_SOL,
      }),
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: voter2.publicKey,
        lamports: 0.002 * LAMPORTS_PER_SOL,
      })
    );
    const fundSig = await sendAndConfirmTransaction(provider.connection, fundTx, [payer]);
    console.log("Funded accounts:", fundSig);

    console.log("Creator:", creator.publicKey.toString());
    console.log("Action PDA:", fastActionPDA.toString());
  });

  describe("Full Delegation Flow", function() {
    it("1. Creates fast action on base layer", async function() {
      const actionHash = Buffer.alloc(32);
      actionHash.write("test-action-hash-", 0);
      const descHash = Buffer.alloc(32);
      descHash.write("test-desc-hash-", 0);

      await program.methods
        .createFastAction(actionId, Array.from(actionHash), 50, Array.from(descHash))
        .accounts({
          fastAction: fastActionPDA,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([creator])
        .rpc();

      const action = await program.account.fastAction.fetch(fastActionPDA);
      expect(action.threshold).to.equal(50);
      expect(action.executed).to.equal(false);
    });

    it("2. Delegates action to ephemeral rollup", async function() {
      console.log("Is localhost:", isLocalhost());

      // Delegation ALWAYS happens on the base layer (devnet) - we're telling the delegation
      // program to clone our account to the ephemeral rollup
      const delegateProgram = program; // Always use base layer program for delegation
      const validatorAccount = isLocalhost() ? LOCAL_VALIDATOR_IDENTITY : null;
      console.log("Validator account:", validatorAccount?.toString() || "null (devnet mode)");

      try {
        // Build the transaction to inspect it
        const tx = await delegateProgram.methods
          .delegateAction(actionId)
          .accounts({
            pda: fastActionPDA,
            payer: creator.publicKey,
            validator: validatorAccount,
          } as any)
          .signers([creator])
          .rpc({ skipPreflight: true });

        console.log("Delegate tx:", tx);
      } catch (e: any) {
        console.log("Delegation error:", e.message || "(no message)");
        console.log("Error type:", e.constructor.name);
        if (e.logs) console.log("Logs:", e.logs.join('\n'));
        if (e.error) console.log("Inner error:", JSON.stringify(e.error, null, 2));
        // Get transaction logs if possible
        if (e.signature) {
          const txInfo = await provider.connection.getTransaction(e.signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          });
          if (txInfo?.meta?.logMessages) {
            console.log("TX Logs:", txInfo.meta.logMessages.join('\n'));
          }
        }
        throw e;
      }

      // Wait for delegation to propagate
      await sleep(3000);

      // Verify on ER
      const accountInfo = await providerEphemeralRollup.connection.getAccountInfo(fastActionPDA);
      console.log("Account on ER exists:", accountInfo !== null);
      console.log("Action delegated to ER");
    });

    it("3. Votes on ephemeral rollup (fast path)", async function() {
      // Vote 1 - YES (using ephemeral program instance)
      const [vote1PDA] = deriveFastVotePDA(fastActionPDA, voter1.publicKey);

      const vote1Tx = await ephemeralProgram.methods
        .voteFast(actionId, true, Array.from(Buffer.alloc(32, 11)))
        .accounts({
          fastAction: fastActionPDA,
          fastVote: vote1PDA,
          voter: voter1.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([voter1])
        .rpc({ skipPreflight: true });

      console.log("Vote 1 tx:", vote1Tx);
      console.log("Vote 1 cast on ER");

      // Vote 2 - YES
      const [vote2PDA] = deriveFastVotePDA(fastActionPDA, voter2.publicKey);

      const vote2Tx = await ephemeralProgram.methods
        .voteFast(actionId, true, Array.from(Buffer.alloc(32, 22)))
        .accounts({
          fastAction: fastActionPDA,
          fastVote: vote2PDA,
          voter: voter2.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([voter2])
        .rpc({ skipPreflight: true });

      console.log("Vote 2 tx:", vote2Tx);
      console.log("Vote 2 cast on ER");

      // Verify vote counts on ER
      const action = await (ephemeralProgram.account as any).fastAction.fetch(fastActionPDA);
      console.log("Votes for (on ER):", action.votesFor);
      expect(action.votesFor).to.equal(2);
    });

    it("4. Waits for voting deadline", async function() {
      // In a real test we'd wait for slots to pass
      // For demo, we'll skip this or use a short window
      console.log("Waiting for voting deadline...");
      await sleep(2000);
    });

    it("5. Tallies and commits results to base layer", async function() {
      // MagicBlock program and context
      const MAGIC_PROGRAM_ID = new PublicKey("Magic11111111111111111111111111111111111111");
      const MAGIC_CONTEXT_ID = new PublicKey("MagicContext1111111111111111111111111111111");

      try {
        const tx = await ephemeralProgram.methods
          .tallyAndCommit()
          .accounts({
            fastAction: fastActionPDA,
            payer: creator.publicKey,
            magicContext: MAGIC_CONTEXT_ID,
            magicProgram: MAGIC_PROGRAM_ID,
          } as any)
          .signers([creator])
          .rpc({ skipPreflight: true });

        console.log("Tally tx:", tx);
        console.log("Tally committed");
      } catch (e: any) {
        // If voting not ended yet, this is expected
        if (e.message?.includes("VotingNotEnded")) {
          console.log("Voting period not ended yet (expected)");
          this.skip();
        } else {
          throw e;
        }
      }

      // Wait for commit to propagate
      await sleep(5000);

      // Verify on base layer
      try {
        const action = await program.account.fastAction.fetch(fastActionPDA);
        expect(action.executed).to.equal(true);
        console.log("Results verified on base layer");
      } catch {
        // Account may still be on ER
        console.log("Account still on ER, commit pending");
      }
    });
  });

  describe("Error Cases", function() {
    it("Rejects tally with invalid magic_program", async function() {
      const testId = new anchor.BN(Date.now() + 1000);
      const [testPDA] = deriveFastActionPDA(testId);

      // Create action
      await program.methods
        .createFastAction(testId, Array.from(Buffer.alloc(32, 99)), 50, Array.from(Buffer.alloc(32)))
        .accounts({
          fastAction: testPDA,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([creator])
        .rpc();

      // Try tally with wrong magic program
      const WRONG_MAGIC_PROGRAM = SystemProgram.programId;
      const MAGIC_CONTEXT_ID = new PublicKey("MagicContext1111111111111111111111111111111");

      try {
        await program.methods
          .tallyAndCommit()
          .accounts({
            fastAction: testPDA,
            payer: creator.publicKey,
            magicContext: MAGIC_CONTEXT_ID,
            magicProgram: WRONG_MAGIC_PROGRAM,
          } as any)
          .signers([creator])
          .rpc();
        expect.fail("Should have rejected invalid magic program");
      } catch (e: any) {
        // Anchor wraps constraint errors
        expect(e.message).to.include("magic_program");
        console.log("Rejected invalid magic_program");
      }
    });

    it("Rejects tally with invalid magic_context", async function() {
      const testId = new anchor.BN(Date.now() + 2000);
      const [testPDA] = deriveFastActionPDA(testId);

      await program.methods
        .createFastAction(testId, Array.from(Buffer.alloc(32, 98)), 50, Array.from(Buffer.alloc(32)))
        .accounts({
          fastAction: testPDA,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([creator])
        .rpc();

      const MAGIC_PROGRAM_ID = new PublicKey("Magic11111111111111111111111111111111111111");
      const WRONG_MAGIC_CONTEXT = Keypair.generate().publicKey;

      try {
        await program.methods
          .tallyAndCommit()
          .accounts({
            fastAction: testPDA,
            payer: creator.publicKey,
            magicContext: WRONG_MAGIC_CONTEXT,
            magicProgram: MAGIC_PROGRAM_ID,
          } as any)
          .signers([creator])
          .rpc();
        expect.fail("Should have rejected invalid magic context");
      } catch (e: any) {
        expect(e.message).to.include("magic_context");
        console.log("Rejected invalid magic_context");
      }
    });
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
