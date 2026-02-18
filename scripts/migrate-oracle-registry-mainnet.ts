import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const PROGRAM_ID = new PublicKey("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr");

async function main() {
  // Load admin wallet
  const walletPath = path.join(process.env.HOME!, ".config/solana/id.json");
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  console.log("Using wallet:", keypair.publicKey.toBase58());

  // Connect to mainnet
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  // Load IDL
  const idlPath = path.join(__dirname, "../target/idl/kamiyo.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  // Derive oracle registry PDA
  const [oracleRegistryPda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_registry")],
    PROGRAM_ID
  );

  console.log("Oracle Registry PDA:", oracleRegistryPda.toBase58());
  console.log("Bump:", bump);

  // Check current state
  const registryAccount = await connection.getAccountInfo(oracleRegistryPda);
  if (!registryAccount) {
    console.error("Oracle registry not found!");
    process.exit(1);
  }

  console.log("\nCurrent registry state:");
  console.log("  Size:", registryAccount.data.length, "bytes");
  console.log("  Balance:", registryAccount.lamports / 1e9, "SOL");

  // Run migration
  console.log("\nRunning migration...");

  try {
    const tx = await program.methods
      .migrateOracleRegistry()
      .accounts({
        oracleRegistry: oracleRegistryPda,
        admin: keypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([keypair])
      .rpc();

    console.log("\nMigration transaction:", tx);
    console.log("Migration successful!");

    // Verify new state
    const newRegistryAccount = await connection.getAccountInfo(oracleRegistryPda);
    if (newRegistryAccount) {
      console.log("\nNew registry state:");
      console.log("  Size:", newRegistryAccount.data.length, "bytes");
      console.log("  Balance:", newRegistryAccount.lamports / 1e9, "SOL");
    }
  } catch (error: any) {
    console.error("Migration failed:", error.message);
    if (error.logs) {
      console.error("Logs:", error.logs);
    }
    process.exit(1);
  }
}

main().catch(console.error);
