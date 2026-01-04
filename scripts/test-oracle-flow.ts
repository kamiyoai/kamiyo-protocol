/**
 * Test Oracle Flow on Devnet
 *
 * Creates escrow → disputes it → oracles submit scores → resolution
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionInstruction,
  Ed25519Program,
  Transaction
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as nacl from "tweetnacl";

const PROGRAM_ID = new PublicKey("8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM");
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";

function loadKeypair(filePath: string): Keypair {
  const absolutePath = filePath.startsWith("~")
    ? path.join(process.env.HOME!, filePath.slice(1))
    : filePath;
  const secretKey = JSON.parse(fs.readFileSync(absolutePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function main() {
  console.log("\n========================================");
  console.log("  ORACLE FLOW TEST (Devnet)");
  console.log("========================================\n");

  const connection = new Connection(RPC_URL, "confirmed");
  console.log("RPC:", RPC_URL);

  // Load wallets
  const agent = loadKeypair("~/.config/solana/id.json");
  const provider = Keypair.generate();
  const oracle1 = loadKeypair("oracles/simple/oracle-1.json");
  const oracle2 = loadKeypair("oracles/simple/oracle-2.json");

  console.log("Agent:", agent.publicKey.toBase58());
  console.log("Provider:", provider.publicKey.toBase58());
  console.log("Oracle 1:", oracle1.publicKey.toBase58());
  console.log("Oracle 2:", oracle2.publicKey.toBase58());
  console.log("");

  // Setup Anchor
  const anchorProvider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(agent),
    { commitment: "confirmed" }
  );
  anchor.setProvider(anchorProvider);

  const idlPath = path.join(__dirname, "../target/idl/kamiyo.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, anchorProvider);

  // Derive PDAs
  const [protocolConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_config")],
    PROGRAM_ID
  );
  const [oracleRegistryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_registry")],
    PROGRAM_ID
  );
  const [treasuryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  );

  const transactionId = `test-${Date.now()}`;
  const [escrowPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), agent.publicKey.toBuffer(), Buffer.from(transactionId)],
    PROGRAM_ID
  );

  // ============================================
  // Step 1: Create Escrow
  // ============================================
  console.log("Step 1: Creating escrow...");
  const amount = new anchor.BN(0.01 * LAMPORTS_PER_SOL);
  const timeLock = new anchor.BN(3600);

  try {
    const tx1 = await (program.methods as any)
      .initializeEscrow(amount, timeLock, transactionId, false)
      .accountsPartial({
        protocolConfig: protocolConfigPDA,
        treasury: treasuryPDA,
        escrow: escrowPDA,
        agent: agent.publicKey,
        api: provider.publicKey,
        systemProgram: SystemProgram.programId,
        tokenMint: null,
        escrowTokenAccount: null,
        agentTokenAccount: null,
        tokenProgram: null,
        associatedTokenProgram: null,
      })
      .rpc();
    console.log("  Escrow created:", tx1);
  } catch (err: any) {
    console.error("  Error:", err.message);
    return;
  }

  // ============================================
  // Step 2: Dispute Escrow
  // ============================================
  console.log("\nStep 2: Disputing escrow...");

  // Need reputation PDA
  const [reputationPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), agent.publicKey.toBuffer()],
    PROGRAM_ID
  );

  // Initialize reputation if needed
  try {
    await program.methods
      .initReputation()
      .accounts({
        reputation: reputationPDA,
        entity: agent.publicKey,
        payer: agent.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  } catch (e) {
    // Already exists
  }

  try {
    const tx2 = await program.methods
      .markDisputed()
      .accounts({
        escrow: escrowPDA,
        reputation: reputationPDA,
        agent: agent.publicKey,
      })
      .rpc();
    console.log("  Disputed:", tx2);
  } catch (err: any) {
    console.error("  Error:", err.message);
    return;
  }

  // ============================================
  // Step 3: Oracle 1 submits score
  // ============================================
  console.log("\nStep 3: Oracle 1 submitting score...");
  const score1 = 75;
  const message1 = `${transactionId}:${score1}`;
  const messageBytes1 = Buffer.from(message1);
  const signature1 = nacl.sign.detached(messageBytes1, oracle1.secretKey);

  try {
    // Create Ed25519 verification instruction (must be first in transaction)
    const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: oracle1.secretKey,
      message: messageBytes1,
    });

    const submitIx = await (program.methods as any)
      .submitOracleScore(score1, Array.from(signature1))
      .accounts({
        escrow: escrowPDA,
        oracleRegistry: oracleRegistryPDA,
        oracle: oracle1.publicKey,
        instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction();

    const tx3 = new Transaction().add(ed25519Ix).add(submitIx);
    tx3.feePayer = agent.publicKey;
    tx3.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx3.sign(agent, oracle1);

    const sig3 = await connection.sendRawTransaction(tx3.serialize());
    await connection.confirmTransaction(sig3, "confirmed");
    console.log(`  Oracle 1 submitted: score=${score1}`);
    console.log("  Tx:", sig3);
  } catch (err: any) {
    console.error("  Error:", err.message);
  }

  // ============================================
  // Step 4: Oracle 2 submits score
  // ============================================
  console.log("\nStep 4: Oracle 2 submitting score...");
  const score2 = 70;
  const message2 = `${transactionId}:${score2}`;
  const messageBytes2 = Buffer.from(message2);
  const signature2 = nacl.sign.detached(messageBytes2, oracle2.secretKey);

  try {
    const ed25519Ix2 = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: oracle2.secretKey,
      message: messageBytes2,
    });

    const submitIx2 = await (program.methods as any)
      .submitOracleScore(score2, Array.from(signature2))
      .accounts({
        escrow: escrowPDA,
        oracleRegistry: oracleRegistryPDA,
        oracle: oracle2.publicKey,
        instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction();

    const tx4 = new Transaction().add(ed25519Ix2).add(submitIx2);
    tx4.feePayer = agent.publicKey;
    tx4.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx4.sign(agent, oracle2);

    const sig4 = await connection.sendRawTransaction(tx4.serialize());
    await connection.confirmTransaction(sig4, "confirmed");
    console.log(`  Oracle 2 submitted: score=${score2}`);
    console.log("  Tx:", sig4);
  } catch (err: any) {
    console.error("  Error:", err.message);
  }

  // ============================================
  // Step 5: Finalize dispute
  // ============================================
  console.log("\nStep 5: Finalizing dispute...");

  try {
    const tx5 = await (program.methods as any)
      .finalizeMultiOracleDispute()
      .accountsPartial({
        escrow: escrowPDA,
        oracleRegistry: oracleRegistryPDA,
        agent: agent.publicKey,
        api: provider.publicKey,
        caller: agent.publicKey,
        agentIdentity: null,
        escrowTokenAccount: null,
        agentTokenAccount: null,
        apiTokenAccount: null,
        tokenProgram: null,
      })
      .rpc();
    console.log("  Finalized:", tx5);
  } catch (err: any) {
    console.error("  Error:", err.message);
  }

  // ============================================
  // Verify final state
  // ============================================
  console.log("\n========================================");
  console.log("  RESULTS");
  console.log("========================================\n");

  const escrow = await (program.account as any).escrow.fetch(escrowPDA);
  console.log("Escrow Status:", Object.keys(escrow.status)[0]);
  console.log("Final Quality Score:", escrow.qualityScore || "N/A");
  console.log("Refund Percentage:", escrow.refundPercentage || "N/A");

  console.log("\nTest complete!");
}

main().catch(console.error);
