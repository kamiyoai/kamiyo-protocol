import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const PROGRAM_ID = new PublicKey("3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr");
const MIN_ORACLE_STAKE = LAMPORTS_PER_SOL / 2; // 0.5 SOL

// Oracle types from program
const OracleType = {
  Ed25519: { ed25519: {} },
  Switchboard: { switchboard: {} },
  Custom: { custom: {} },
};

async function main() {
  // Load admin wallet (oracle registry admin)
  const adminWalletPath = path.join(process.env.HOME!, ".config/solana/id.json");
  const adminSecretKey = JSON.parse(fs.readFileSync(adminWalletPath, "utf-8"));
  const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(adminSecretKey));

  // For first oracle, we'll use the creator wallet as the oracle
  // In production, this would be a separate oracle operator wallet
  const oracleWalletPath = path.join(__dirname, "../token-launch/wallets/creator.json");
  const oracleSecretKey = JSON.parse(fs.readFileSync(oracleWalletPath, "utf-8"));
  const oracleKeypair = Keypair.fromSecretKey(Uint8Array.from(oracleSecretKey));

  console.log("Admin wallet:", adminKeypair.publicKey.toBase58());
  console.log("Oracle wallet:", oracleKeypair.publicKey.toBase58());

  // Connect to mainnet
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  const adminWallet = new Wallet(adminKeypair);
  const provider = new AnchorProvider(connection, adminWallet, { commitment: "confirmed" });

  // Check balances
  const adminBalance = await connection.getBalance(adminKeypair.publicKey);
  const oracleBalance = await connection.getBalance(oracleKeypair.publicKey);
  console.log("\nBalances:");
  console.log(`  Admin: ${adminBalance / LAMPORTS_PER_SOL} SOL`);
  console.log(`  Oracle: ${oracleBalance / LAMPORTS_PER_SOL} SOL`);

  if (oracleBalance < MIN_ORACLE_STAKE + 0.01 * LAMPORTS_PER_SOL) {
    console.error(`\nOracle needs at least ${MIN_ORACLE_STAKE / LAMPORTS_PER_SOL + 0.01} SOL for stake + fees`);
    process.exit(1);
  }

  // Load IDL
  const idlPath = path.join(__dirname, "../target/idl/kamiyo.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  // Derive oracle registry PDA
  const [oracleRegistryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_registry")],
    PROGRAM_ID
  );

  console.log("\nOracle Registry PDA:", oracleRegistryPda.toBase58());

  // Check current registry state
  const registryAccount = await connection.getAccountInfo(oracleRegistryPda);
  if (!registryAccount) {
    console.error("Oracle registry not initialized!");
    process.exit(1);
  }

  // Add oracle via admin instruction
  console.log("\nAdding oracle to registry...");
  console.log(`  Oracle: ${oracleKeypair.publicKey.toBase58()}`);
  console.log(`  Type: Ed25519`);
  console.log(`  Weight: 100`);
  console.log(`  Stake: ${MIN_ORACLE_STAKE / LAMPORTS_PER_SOL} SOL`);

  try {
    const tx = await program.methods
      .addOracle(
        oracleKeypair.publicKey,
        OracleType.Ed25519,
        100, // weight
        new BN(MIN_ORACLE_STAKE)
      )
      .accounts({
        oracleRegistry: oracleRegistryPda,
        admin: adminKeypair.publicKey,
        oracleSigner: oracleKeypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([adminKeypair, oracleKeypair])
      .rpc();

    console.log("\nTransaction signature:", tx);
    console.log("Oracle added");

    // Verify
    const newOracleBalance = await connection.getBalance(oracleKeypair.publicKey);
    console.log(`\nOracle balance after stake: ${newOracleBalance / LAMPORTS_PER_SOL} SOL`);
  } catch (error: any) {
    if (error.message?.includes("DuplicateOracleSubmission")) {
      console.log("\nOracle already registered in registry.");
    } else {
      throw error;
    }
  }
}

main().catch(console.error);
