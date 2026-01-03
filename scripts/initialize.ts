/**
 * Mitama Protocol Initialization
 *
 * Initializes protocol config and oracle registry.
 *
 * Usage:
 *   RPC_URL=<rpc> AUTHORITY_2=<pubkey> AUTHORITY_3=<pubkey> npx ts-node scripts/initialize.ts
 *
 * Environment:
 *   RPC_URL       - Solana RPC endpoint (default: http://localhost:8899)
 *   AUTHORITY_2   - Secondary multi-sig authority pubkey
 *   AUTHORITY_3   - Tertiary multi-sig authority pubkey
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM");

function getAuthorities(): { auth2: PublicKey; auth3: PublicKey } {
  const auth2 = process.env.AUTHORITY_2;
  const auth3 = process.env.AUTHORITY_3;

  if (!auth2 || !auth3) {
    console.error("Error: AUTHORITY_2 and AUTHORITY_3 environment variables required");
    process.exit(1);
  }

  return {
    auth2: new PublicKey(auth2),
    auth3: new PublicKey(auth3)
  };
}

// Load keypair from file
function loadKeypair(filePath: string): Keypair {
  const absolutePath = filePath.startsWith("~")
    ? path.join(process.env.HOME!, filePath.slice(1))
    : filePath;
  const secretKey = JSON.parse(fs.readFileSync(absolutePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

// Derive PDAs
function getProtocolConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_config")],
    PROGRAM_ID
  );
}

function getOracleRegistryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_registry")],
    PROGRAM_ID
  );
}

async function main() {
  console.log("\n========================================");
  console.log("  MITAMA MAINNET INITIALIZATION");
  console.log("========================================\n");

  // Setup connection - use env or default to localnet
  const rpcUrl = process.env.RPC_URL || "http://localhost:8899";
  const connection = new Connection(rpcUrl, "confirmed");
  console.log("RPC:", rpcUrl);

  // Load wallet
  const wallet = loadKeypair("~/.config/solana/id.json");
  console.log("Wallet:", wallet.publicKey.toBase58());

  const balance = await connection.getBalance(wallet.publicKey);
  console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL\n");

  // Setup Anchor
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  // Load IDL and create program with explicit program ID
  const idlPath = path.join(__dirname, "../target/idl/mitama.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

  // For Anchor 0.30+, need to pass provider then program ID
  const program = new Program(idl, provider);

  // Derive PDAs
  const [protocolConfigPDA] = getProtocolConfigPDA();
  const [oracleRegistryPDA] = getOracleRegistryPDA();

  console.log("Protocol Config PDA:", protocolConfigPDA.toBase58());
  console.log("Oracle Registry PDA:", oracleRegistryPDA.toBase58());
  console.log("");

  // ============================================
  // Step 1: Initialize Protocol
  // ============================================
  console.log("Step 1: Initializing Protocol Config...");

  try {
    const protocolAccount = await connection.getAccountInfo(protocolConfigPDA);
    if (protocolAccount) {
      console.log("  -> Protocol already initialized, skipping.\n");
    } else {
      const { auth2, auth3 } = getAuthorities();

      const tx = await program.methods
        .initializeProtocol(auth2, auth3)
        .accounts({
          protocolConfig: protocolConfigPDA,
          authority: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("  -> Success! Tx:", tx);
      console.log("  -> Multi-sig authorities configured");
      console.log("");
    }
  } catch (err: any) {
    console.error("  -> Error:", err.message);
    if (!err.message.includes("already in use")) {
      throw err;
    }
  }

  // ============================================
  // Step 2: Initialize Oracle Registry
  // ============================================
  console.log("Step 2: Initializing Oracle Registry...");

  try {
    const registryAccount = await connection.getAccountInfo(oracleRegistryPDA);
    if (registryAccount) {
      console.log("  -> Oracle Registry already initialized, skipping.\n");
    } else {
      const minConsensus = 2;  // Minimum 2 oracles for consensus
      const maxDeviation = 15; // Max 15 point score deviation

      const tx = await program.methods
        .initializeOracleRegistry(minConsensus, maxDeviation)
        .accounts({
          oracleRegistry: oracleRegistryPDA,
          admin: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("  -> Success! Tx:", tx);
      console.log("  -> Min consensus:", minConsensus, "oracles");
      console.log("  -> Max score deviation:", maxDeviation);
      console.log("");
    }
  } catch (err: any) {
    console.error("  -> Error:", err.message);
    if (!err.message.includes("already in use")) {
      throw err;
    }
  }

  // ============================================
  // Step 3: Add First Oracle (Optional)
  // ============================================
  console.log("Step 3: Oracle Setup...");
  console.log("  -> To add an oracle, run:");
  console.log("     npx ts-node scripts/add-oracle.ts <oracle-keypair-path>");
  console.log("");

  // ============================================
  // Verification
  // ============================================
  console.log("========================================");
  console.log("  VERIFICATION");
  console.log("========================================\n");

  try {
    const protocolConfig = await (program.account as any).protocolConfig.fetch(protocolConfigPDA);
    console.log("Protocol Config:");
    console.log("  Status:", protocolConfig.paused ? "Paused" : "Active");
    console.log("  Version:", protocolConfig.version);
    console.log("  Authorities: 3 configured");
    console.log("");
  } catch (err) {
    console.log("Protocol Config: Not initialized");
  }

  try {
    const oracleRegistry = await (program.account as any).oracleRegistry.fetch(oracleRegistryPDA);
    console.log("Oracle Registry:");
    console.log("  Min Consensus:", oracleRegistry.minConsensus);
    console.log("  Max Deviation:", oracleRegistry.maxScoreDeviation);
    console.log("  Oracles:", oracleRegistry.oracles.length);
    console.log("");
  } catch (err) {
    console.log("Oracle Registry: Not initialized");
  }

  console.log("========================================");
  console.log("  INITIALIZATION COMPLETE");
  console.log("========================================\n");

  console.log("Next steps:");
  console.log("  1. Add oracles: npx ts-node scripts/add-oracle.ts");
  console.log("  2. Test escrow flow with small amounts");
  console.log("  3. Connect frontend/SDK\n");
}

main().catch(console.error);
