/**
 * Add Oracle to Kamiyo Registry
 *
 * Usage:
 *   RPC_URL=<rpc> npx ts-node scripts/add-oracle.ts <oracle-keypair-path> [weight]
 *
 * Environment:
 *   RPC_URL - Solana RPC endpoint (default: http://localhost:8899)
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
const MIN_ORACLE_STAKE = 0.5 * LAMPORTS_PER_SOL;

function loadKeypair(filePath: string): Keypair {
  const absolutePath = filePath.startsWith("~")
    ? path.join(process.env.HOME!, filePath.slice(1))
    : filePath;
  const secretKey = JSON.parse(fs.readFileSync(absolutePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

function getOracleRegistryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_registry")],
    PROGRAM_ID
  );
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log("Usage: npx ts-node scripts/add-oracle.ts <oracle-keypair-path> [weight]");
    console.log("");
    console.log("Example: npx ts-node scripts/add-oracle.ts ./oracle-keypair.json 100");
    console.log("");
    console.log("Note: Oracle must have at least 0.5 SOL for staking");
    process.exit(1);
  }

  const oracleKeypairPath = args[0];
  const weight = parseInt(args[1] || "100");

  console.log("\n========================================");
  console.log("  ADD ORACLE TO REGISTRY");
  console.log("========================================\n");

  // Setup connection
  const rpcUrl = process.env.RPC_URL || "http://localhost:8899";
  const connection = new Connection(rpcUrl, "confirmed");
  console.log("RPC:", rpcUrl);

  // Load admin wallet
  const admin = loadKeypair("~/.config/solana/id.json");
  console.log("Admin:", admin.publicKey.toBase58());

  // Load oracle keypair
  const oracleKeypair = loadKeypair(oracleKeypairPath);
  console.log("Oracle:", oracleKeypair.publicKey.toBase58());

  // Check oracle balance
  const oracleBalance = await connection.getBalance(oracleKeypair.publicKey);
  console.log("Oracle Balance:", oracleBalance / LAMPORTS_PER_SOL, "SOL");

  if (oracleBalance < MIN_ORACLE_STAKE) {
    console.error("\nError: Oracle needs at least 0.5 SOL for staking");
    console.log("Current balance:", oracleBalance / LAMPORTS_PER_SOL, "SOL");
    console.log("Required:", MIN_ORACLE_STAKE / LAMPORTS_PER_SOL, "SOL");
    process.exit(1);
  }

  // Setup Anchor
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  // Load IDL
  const idlPath = path.join(__dirname, "../target/idl/kamiyo.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  const [oracleRegistryPDA] = getOracleRegistryPDA();

  console.log("\nAdding oracle with:");
  console.log("  Type: Ed25519");
  console.log("  Weight:", weight);
  console.log("  Stake:", MIN_ORACLE_STAKE / LAMPORTS_PER_SOL, "SOL");
  console.log("");

  try {
    const tx = await program.methods
      .addOracle(
        oracleKeypair.publicKey,
        { ed25519: {} },
        weight,
        new anchor.BN(MIN_ORACLE_STAKE)
      )
      .accounts({
        oracleRegistry: oracleRegistryPDA,
        admin: admin.publicKey,
        oracleSigner: oracleKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin, oracleKeypair])
      .rpc();

    console.log("Success! Tx:", tx);
    console.log("");

    // Verify
    const registry = await (program.account as any).oracleRegistry.fetch(oracleRegistryPDA);
    console.log("Registry now has", registry.oracles.length, "oracle(s)");

  } catch (err: any) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main().catch(console.error);
