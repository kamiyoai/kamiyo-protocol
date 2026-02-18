/**
 * End-to-end dispute flow test on mainnet
 *
 * Flow:
 * 1. Create escrow agreement
 * 2. Mark as disputed (starts commit phase)
 * 3. Oracles commit scores (commit_oracle_score)
 * 4. Wait for commit phase to end
 * 5. Oracles reveal scores (submit_oracle_score)
 * 6. Finalize dispute (finalize_multi_oracle_dispute)
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  TransactionInstruction,
  Ed25519Program,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as crypto from "crypto";
import nacl from "tweetnacl";
import fs from "fs";
import path from "path";

const PROGRAM_ID = new PublicKey("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr");
const COMMIT_PHASE_DURATION = 300; // 5 minutes

const ORACLE_WALLETS = [
  "creator.json",
  "personal1.json",
  "personal2.json",
  "personal3.json",
  "personal4.json",
];

interface OracleVote {
  keypair: Keypair;
  score: number;
  salt: Buffer;
  commitment: Buffer;
  signature?: Buffer;
}

function generateSalt(): Buffer {
  return crypto.randomBytes(32);
}

function computeCommitment(transactionId: string, score: number, salt: Buffer): Buffer {
  const data = Buffer.concat([
    Buffer.from(transactionId),
    Buffer.from([score]),
    salt,
  ]);
  return crypto.createHash("sha256").update(data).digest();
}

function signOracleScore(keypair: Keypair, transactionId: string, score: number): Buffer {
  // Message format: "{transaction_id}:{score}"
  const message = `${transactionId}:${score}`;
  const messageBytes = Buffer.from(message);
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  return Buffer.from(signature);
}

async function sleep(ms: number) {
  console.log(`Sleeping ${Math.round(ms / 1000)}s...`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const adminWalletPath = path.join(process.env.HOME!, ".config/solana/id.json");
  const adminSecretKey = JSON.parse(fs.readFileSync(adminWalletPath, "utf-8"));
  const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(adminSecretKey));

  console.log("=== E2E Dispute Flow Test ===\n");
  console.log("Admin:", adminKeypair.publicKey.toBase58());

  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  const adminWallet = new Wallet(adminKeypair);
  const provider = new AnchorProvider(connection, adminWallet, { commitment: "confirmed" });

  const idlPath = path.join(__dirname, "../target/idl/kamiyo.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  // Load oracle wallets
  const oracles: Keypair[] = [];
  for (const w of ORACLE_WALLETS) {
    const oraclePath = path.join(__dirname, "../token-launch/wallets", w);
    const secretKey = JSON.parse(fs.readFileSync(oraclePath, "utf-8"));
    oracles.push(Keypair.fromSecretKey(Uint8Array.from(secretKey)));
  }
  console.log(`Loaded ${oracles.length} oracle wallets\n`);

  // Use personal5 as provider (or personal4 if 5 doesn't exist)
  const providerKeypair = oracles[4]; // personal4

  // Derive PDAs
  const [protocolConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_config")],
    PROGRAM_ID
  );
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  );
  const [oracleRegistryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_registry")],
    PROGRAM_ID
  );

  const transactionId = `e2e-${Date.now()}`;
  console.log("Transaction ID:", transactionId);

  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), adminKeypair.publicKey.toBuffer(), Buffer.from(transactionId)],
    PROGRAM_ID
  );
  console.log("Escrow PDA:", escrowPda.toBase58());

  // ============================================================
  // STEP 1: Create Escrow
  // ============================================================
  console.log("\n--- Step 1: Create Escrow ---");

  const escrowAmount = new BN(0.01 * LAMPORTS_PER_SOL);
  const timeLockSeconds = new BN(3600);

  try {
    const tx1 = await program.methods
      .initializeEscrow(escrowAmount, timeLockSeconds, transactionId, false)
      .accounts({
        protocolConfig: protocolConfigPda,
        treasury: treasuryPda,
        escrow: escrowPda,
        agent: adminKeypair.publicKey,
        api: providerKeypair.publicKey,
        systemProgram: SystemProgram.programId,
        tokenMint: null,
        escrowTokenAccount: null,
        agentTokenAccount: null,
        tokenProgram: null,
        associatedTokenProgram: null,
      })
      .signers([adminKeypair])
      .rpc();

    console.log("Escrow created:", tx1);
  } catch (error: any) {
    console.error("Failed to create escrow:", error.message);
    if (error.logs) console.error("Logs:", error.logs.slice(-5));
    process.exit(1);
  }

  const escrowAccount = await connection.getAccountInfo(escrowPda);
  console.log("Escrow balance:", escrowAccount?.lamports! / LAMPORTS_PER_SOL, "SOL");

  // ============================================================
  // STEP 2: Mark as Disputed
  // ============================================================
  console.log("\n--- Step 2: Mark as Disputed ---");

  const [agentReputationPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), adminKeypair.publicKey.toBuffer()],
    PROGRAM_ID
  );

  try {
    const tx2 = await program.methods
      .markDisputed()
      .accounts({
        escrow: escrowPda,
        agentReputation: agentReputationPda,
        agent: adminKeypair.publicKey,
        protocolConfig: protocolConfigPda,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();

    console.log("Dispute filed:", tx2);
  } catch (error: any) {
    console.error("Failed to mark disputed:", error.message);
    if (error.logs) console.error("Logs:", error.logs.slice(-5));
    process.exit(1);
  }

  // ============================================================
  // STEP 3: Oracle Commit Phase
  // ============================================================
  console.log("\n--- Step 3: Oracle Commit Phase ---");

  const oracleVotes: OracleVote[] = [];
  const baseScore = 75;

  for (let i = 0; i < 3; i++) {
    const oracle = oracles[i];
    const score = baseScore + Math.floor(Math.random() * 10) - 5;
    const salt = generateSalt();
    const commitment = computeCommitment(transactionId, score, salt);
    const signature = signOracleScore(oracle, transactionId, score);

    oracleVotes.push({
      keypair: oracle,
      score,
      salt,
      commitment,
      signature,
    });

    console.log(`Oracle ${i + 1} (${oracle.publicKey.toBase58().slice(0, 8)}...): score=${score}`);

    try {
      const oracleWallet = new Wallet(oracle);
      const oracleProvider = new AnchorProvider(connection, oracleWallet, { commitment: "confirmed" });
      const oracleProgram = new Program(idl, oracleProvider);

      const tx = await oracleProgram.methods
        .commitOracleScore(Array.from(commitment))
        .accounts({
          protocolConfig: protocolConfigPda,
          escrow: escrowPda,
          oracleRegistry: oracleRegistryPda,
          oracle: oracle.publicKey,
        })
        .signers([oracle])
        .rpc();

      console.log(`  Committed: ${tx}`);
    } catch (error: any) {
      console.error(`  Failed: ${error.message}`);
      if (error.logs) console.error("  Logs:", error.logs.slice(-3));
    }
  }

  // ============================================================
  // STEP 4: Wait for Commit Phase to End
  // ============================================================
  console.log("\n--- Step 4: Waiting for Commit Phase ---");

  const escrowData = await program.account.escrow.fetch(escrowPda);
  const commitPhaseEndsAt = escrowData.commitPhaseEndsAt;

  if (commitPhaseEndsAt) {
    const now = Math.floor(Date.now() / 1000);
    const waitTime = commitPhaseEndsAt.toNumber() - now;
    if (waitTime > 0) {
      console.log(`Commit phase ends in ${waitTime} seconds`);
      await sleep((waitTime + 5) * 1000);
    } else {
      console.log("Commit phase already ended");
    }
  }

  // ============================================================
  // STEP 5: Oracle Reveal Phase
  // ============================================================
  console.log("\n--- Step 5: Oracle Reveal Phase (submit_oracle_score) ---");

  for (const vote of oracleVotes) {
    console.log(`Revealing oracle ${vote.keypair.publicKey.toBase58().slice(0, 8)}... score=${vote.score}`);

    try {
      const oracleWallet = new Wallet(vote.keypair);
      const oracleProvider = new AnchorProvider(connection, oracleWallet, { commitment: "confirmed" });
      const oracleProgram = new Program(idl, oracleProvider);

      // Create the message that was signed
      const message = Buffer.from(`${transactionId}:${vote.score}`);

      // Create Ed25519 verification instruction
      const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
        privateKey: vote.keypair.secretKey,
        message,
      });

      // Build the submit_oracle_score instruction
      const submitIx = await oracleProgram.methods
        .submitOracleScore(vote.score, Array.from(vote.salt), Array.from(vote.signature!))
        .accounts({
          protocolConfig: protocolConfigPda,
          escrow: escrowPda,
          oracleRegistry: oracleRegistryPda,
          oracle: vote.keypair.publicKey,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction();

      // Build and send transaction with both instructions
      const tx = new Transaction().add(ed25519Ix).add(submitIx);
      const sig = await sendAndConfirmTransaction(connection, tx, [vote.keypair]);

      console.log(`  Revealed: ${sig}`);
    } catch (error: any) {
      console.error(`  Failed: ${error.message}`);
      if (error.logs) console.error("  Logs:", error.logs.slice(-5));
    }
  }

  // ============================================================
  // STEP 6: Finalize Dispute
  // ============================================================
  console.log("\n--- Step 6: Finalize Multi-Oracle Dispute ---");

  // Derive agent identity PDA (optional, for stake slashing)
  const [agentIdentityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), adminKeypair.publicKey.toBuffer()],
    PROGRAM_ID
  );

  try {
    const tx = await program.methods
      .finalizeMultiOracleDispute()
      .accounts({
        protocolConfig: protocolConfigPda,
        escrow: escrowPda,
        oracleRegistry: oracleRegistryPda,
        agent: adminKeypair.publicKey,
        api: providerKeypair.publicKey,
        agentIdentity: null, // Optional: for stake slashing
        caller: adminKeypair.publicKey,
        treasury: treasuryPda,
        escrowTokenAccount: null,
        agentTokenAccount: null,
        apiTokenAccount: null,
        treasuryTokenAccount: null,
        tokenProgram: null,
      })
      .signers([adminKeypair])
      .rpc();

    console.log("Dispute finalized:", tx);
  } catch (error: any) {
    console.error("Failed to finalize:", error.message);
    if (error.logs) console.error("Logs:", error.logs.slice(-5));
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n=== Test Complete ===");

  try {
    const finalEscrow = await program.account.escrow.fetch(escrowPda);
    console.log("Final escrow status:", finalEscrow.status);
    console.log("Quality score:", finalEscrow.qualityScore);
    console.log("Refund percentage:", finalEscrow.refundPercentage);
  } catch (e) {
    console.log("Escrow closed (funds distributed)");
  }

  const adminBalance = await connection.getBalance(adminKeypair.publicKey);
  console.log("Admin final balance:", adminBalance / LAMPORTS_PER_SOL, "SOL");
}

main().catch(console.error);
