// Mainnet E2E test for kamiyo-fast-voting
// Run: npx ts-node scripts/test-fast-voting-mainnet.ts

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("AakwnBstczs5KC2jKPfBuFLQZADXrx4oPH8FtJbhPxwA");
const FAST_ACTION_SEED = Buffer.from("fast_action");
const FAST_VOTE_SEED = Buffer.from("fast_vote");

// Load IDL
const idlPath = path.join(__dirname, "../target/idl/kamiyo_fast_voting.json");
const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

function deriveFastActionPDA(actionId: anchor.BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [FAST_ACTION_SEED, actionId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

function deriveFastVotePDA(fastAction: PublicKey, voter: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [FAST_VOTE_SEED, fastAction.toBuffer(), voter.toBuffer()],
    PROGRAM_ID
  );
}

async function main() {
  console.log("=== KAMIYO Fast Voting - Mainnet E2E Test ===\n");

  // Setup connection
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

  // Load wallet
  const walletPath = process.env.WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`;
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  console.log("Wallet:", walletKeypair.publicKey.toString());

  const balance = await connection.getBalance(walletKeypair.publicKey);
  console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL\n");

  if (balance < 0.01 * LAMPORTS_PER_SOL) {
    console.error("Insufficient balance for testing. Need at least 0.01 SOL");
    process.exit(1);
  }

  // Setup Anchor
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = new Program(idl, provider);

  // Test 1: Read program info
  console.log("--- Test 1: Verify Program Deployment ---");
  const programInfo = await connection.getAccountInfo(PROGRAM_ID);
  if (!programInfo) {
    console.error("Program not found on mainnet!");
    process.exit(1);
  }
  console.log("Program exists:", programInfo.owner.toString());
  console.log("Program executable:", programInfo.executable);
  console.log("PASS\n");

  // Test 2: Create a fast action
  console.log("--- Test 2: Create Fast Action ---");
  const actionId = new anchor.BN(Date.now());
  const [fastActionPDA] = deriveFastActionPDA(actionId);

  console.log("Action ID:", actionId.toString());
  console.log("PDA:", fastActionPDA.toString());

  const actionHash = Buffer.alloc(32);
  actionHash.write("test-action-" + Date.now(), 0);
  const descHash = Buffer.alloc(32);
  descHash.write("test-desc", 0);

  try {
    const tx = await program.methods
      .createFastAction(actionId, Array.from(actionHash), 50, Array.from(descHash))
      .accounts({
        fastAction: fastActionPDA,
        creator: walletKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([walletKeypair])
      .rpc();

    console.log("TX:", tx);
    console.log("PASS\n");
  } catch (err: any) {
    console.error("Failed to create action:", err.message);
    process.exit(1);
  }

  // Test 3: Fetch and verify action
  console.log("--- Test 3: Fetch Action State ---");
  try {
    const action = await (program.account as any).fastAction.fetch(fastActionPDA);
    console.log("Action fetched:");
    console.log("  - actionId:", action.actionId.toString());
    console.log("  - threshold:", action.threshold);
    console.log("  - votesFor:", action.votesFor);
    console.log("  - votesAgainst:", action.votesAgainst);
    console.log("  - executed:", action.executed);
    console.log("  - creator:", action.creator.toString());

    if (action.threshold !== 50) {
      throw new Error("Threshold mismatch");
    }
    if (action.executed !== false) {
      throw new Error("Should not be executed");
    }
    console.log("PASS\n");
  } catch (err: any) {
    console.error("Failed to fetch action:", err.message);
    process.exit(1);
  }

  // Test 4: Cast a vote
  console.log("--- Test 4: Cast Vote ---");
  const [votePDA] = deriveFastVotePDA(fastActionPDA, walletKeypair.publicKey);
  console.log("Vote PDA:", votePDA.toString());

  const voterCommitment = Buffer.alloc(32);
  voterCommitment.write("voter-commitment-" + Date.now(), 0);

  try {
    const tx = await program.methods
      .voteFast(actionId, true, Array.from(voterCommitment))
      .accounts({
        fastAction: fastActionPDA,
        fastVote: votePDA,
        voter: walletKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([walletKeypair])
      .rpc();

    console.log("TX:", tx);
    console.log("PASS\n");
  } catch (err: any) {
    console.error("Failed to vote:", err.message);
    process.exit(1);
  }

  // Test 5: Verify vote recorded
  console.log("--- Test 5: Verify Vote State ---");
  try {
    const action = await (program.account as any).fastAction.fetch(fastActionPDA);
    console.log("Updated action state:");
    console.log("  - votesFor:", action.votesFor);
    console.log("  - votesAgainst:", action.votesAgainst);
    console.log("  - voteCount:", action.voteCount);

    if (action.votesFor !== 1) {
      throw new Error("Vote not recorded");
    }
    console.log("PASS\n");
  } catch (err: any) {
    console.error("Failed to verify vote:", err.message);
    process.exit(1);
  }

  // Test 6: Fetch vote record
  console.log("--- Test 6: Fetch Vote Record ---");
  try {
    const vote = await (program.account as any).fastVote.fetch(votePDA);
    console.log("Vote record:");
    console.log("  - voter:", vote.voter.toString());
    console.log("  - voteValue:", vote.voteValue);
    console.log("  - fastAction:", vote.fastAction.toString());

    if (vote.voteValue !== true) {
      throw new Error("Vote value mismatch");
    }
    console.log("PASS\n");
  } catch (err: any) {
    console.error("Failed to fetch vote:", err.message);
    process.exit(1);
  }

  // Test 7: Cancel action
  console.log("--- Test 7: Cancel Action ---");
  try {
    const tx = await program.methods
      .cancelAction(actionId)
      .accounts({
        fastAction: fastActionPDA,
        creator: walletKeypair.publicKey,
      })
      .signers([walletKeypair])
      .rpc();

    console.log("TX:", tx);

    const action = await (program.account as any).fastAction.fetch(fastActionPDA);
    console.log("Action cancelled:", action.executed);
    console.log("Result:", JSON.stringify(action.result));

    if (!action.executed) {
      throw new Error("Action should be executed after cancel");
    }
    console.log("PASS\n");
  } catch (err: any) {
    console.error("Failed to cancel:", err.message);
    process.exit(1);
  }

  console.log("===========================================");
  console.log("ALL TESTS PASSED");
  console.log("===========================================");
  console.log("\nProgram ID: AakwnBstczs5KC2jKPfBuFLQZADXrx4oPH8FtJbhPxwA");
  console.log("Explorer: https://solana.fm/address/AakwnBstczs5KC2jKPfBuFLQZADXrx4oPH8FtJbhPxwA");
}

main().catch(console.error);
