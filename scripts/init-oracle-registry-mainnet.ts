import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const PROGRAM_ID = new PublicKey("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr");

async function main() {
  // Load wallet
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
  const [oracleRegistryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_registry")],
    PROGRAM_ID
  );

  console.log("Oracle Registry PDA:", oracleRegistryPda.toBase58());

  // Check if already exists
  const existingAccount = await connection.getAccountInfo(oracleRegistryPda);
  if (existingAccount) {
    console.log("Oracle registry already initialized!");
    return;
  }

  // Initialize with min_consensus=3, max_deviation=15
  console.log("Initializing oracle registry...");

  const tx = await program.methods
    .initializeOracleRegistry(3, 15)
    .accounts({
      oracleRegistry: oracleRegistryPda,
      admin: keypair.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([keypair])
    .rpc();

  console.log("Transaction signature:", tx);
  console.log("Oracle registry initialized");

  // Verify
  const registry = await connection.getAccountInfo(oracleRegistryPda);
  console.log("Registry account size:", registry?.data.length, "bytes");
}

main().catch(console.error);
