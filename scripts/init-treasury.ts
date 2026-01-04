/**
 * Initialize Treasury on Mainnet/Devnet
 *
 * Usage:
 *   RPC_URL=<rpc> npx ts-node scripts/init-treasury.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM");

function loadKeypair(filePath: string): Keypair {
  const absolutePath = filePath.startsWith("~")
    ? path.join(process.env.HOME!, filePath.slice(1))
    : filePath;
  const secretKey = JSON.parse(fs.readFileSync(absolutePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function main() {
  console.log("\n========================================");
  console.log("  INITIALIZE TREASURY");
  console.log("========================================\n");

  const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  console.log("RPC:", rpcUrl);

  const admin = loadKeypair("~/.config/solana/id.json");
  console.log("Admin:", admin.publicKey.toBase58());

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const idlPath = path.join(__dirname, "../target/idl/kamiyo.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  const [treasuryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  );
  console.log("Treasury PDA:", treasuryPDA.toBase58());

  // Check if already initialized
  try {
    const existing = await connection.getAccountInfo(treasuryPDA);
    if (existing) {
      console.log("\nTreasury already initialized!");
      const treasury = await (program.account as any).treasury.fetch(treasuryPDA);
      console.log("  Admin:", treasury.admin.toBase58());
      console.log("  Total Fees:", treasury.totalFeesCollected.toString());
      console.log("  Total Slashed:", treasury.totalSlashedCollected.toString());
      return;
    }
  } catch (e) {
    // Not initialized, continue
  }

  console.log("\nInitializing treasury...");

  try {
    const tx = await (program.methods as any)
      .initializeTreasury()
      .accounts({
        treasury: treasuryPDA,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Success! Tx:", tx);

    const treasury = await (program.account as any).treasury.fetch(treasuryPDA);
    console.log("\nTreasury initialized:");
    console.log("  Admin:", treasury.admin.toBase58());
    console.log("  PDA:", treasuryPDA.toBase58());
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

main().catch(console.error);
