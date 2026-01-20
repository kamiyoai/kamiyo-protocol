import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const PROGRAM_ID = new PublicKey("8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM");
const MIN_ORACLE_STAKE = LAMPORTS_PER_SOL / 2; // 0.5 SOL

const OracleType = {
  Ed25519: { ed25519: {} },
  Switchboard: { switchboard: {} },
  Custom: { custom: {} },
};

// Wallets to use as oracles
const ORACLE_WALLETS = [
  "personal1.json",
  "personal2.json",
  "personal3.json",
  "personal4.json",
];

async function main() {
  // Load admin wallet
  const adminWalletPath = path.join(process.env.HOME!, ".config/solana/id.json");
  const adminSecretKey = JSON.parse(fs.readFileSync(adminWalletPath, "utf-8"));
  const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(adminSecretKey));

  console.log("Admin wallet:", adminKeypair.publicKey.toBase58());

  // Connect to mainnet
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  const adminWallet = new Wallet(adminKeypair);
  const provider = new AnchorProvider(connection, adminWallet, { commitment: "confirmed" });

  // Check admin balance
  const adminBalance = await connection.getBalance(adminKeypair.publicKey);
  console.log(`Admin balance: ${adminBalance / LAMPORTS_PER_SOL} SOL`);

  const requiredBalance = ORACLE_WALLETS.length * (MIN_ORACLE_STAKE + 0.01 * LAMPORTS_PER_SOL);
  if (adminBalance < requiredBalance) {
    console.error(`Need at least ${requiredBalance / LAMPORTS_PER_SOL} SOL to fund ${ORACLE_WALLETS.length} oracles`);
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

  // Process each oracle wallet
  for (const walletFile of ORACLE_WALLETS) {
    const oracleWalletPath = path.join(__dirname, "../token-launch/wallets", walletFile);

    if (!fs.existsSync(oracleWalletPath)) {
      console.error(`Wallet not found: ${walletFile}`);
      continue;
    }

    const oracleSecretKey = JSON.parse(fs.readFileSync(oracleWalletPath, "utf-8"));
    const oracleKeypair = Keypair.fromSecretKey(Uint8Array.from(oracleSecretKey));

    console.log(`\n--- Processing ${walletFile} ---`);
    console.log(`Oracle pubkey: ${oracleKeypair.publicKey.toBase58()}`);

    // Check oracle balance
    let oracleBalance = await connection.getBalance(oracleKeypair.publicKey);
    console.log(`Current balance: ${oracleBalance / LAMPORTS_PER_SOL} SOL`);

    // Fund oracle if needed
    const neededBalance = MIN_ORACLE_STAKE + 0.01 * LAMPORTS_PER_SOL;
    if (oracleBalance < neededBalance) {
      const fundAmount = neededBalance - oracleBalance;
      console.log(`Funding ${fundAmount / LAMPORTS_PER_SOL} SOL...`);

      const fundTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: adminKeypair.publicKey,
          toPubkey: oracleKeypair.publicKey,
          lamports: Math.ceil(fundAmount),
        })
      );

      const fundSig = await sendAndConfirmTransaction(connection, fundTx, [adminKeypair]);
      console.log(`Funded: ${fundSig}`);

      oracleBalance = await connection.getBalance(oracleKeypair.publicKey);
      console.log(`New balance: ${oracleBalance / LAMPORTS_PER_SOL} SOL`);
    }

    // Add oracle to registry
    console.log(`Adding oracle to registry...`);
    console.log(`  Stake: ${MIN_ORACLE_STAKE / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Type: Ed25519`);
    console.log(`  Weight: 100`);

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

      console.log(`Added successfully: ${tx}`);
    } catch (error: any) {
      if (error.message?.includes("DuplicateOracleSubmission") || error.message?.includes("already")) {
        console.log(`Oracle already registered`);
      } else {
        console.error(`Failed: ${error.message}`);
        if (error.logs) {
          console.error("Logs:", error.logs.slice(-5));
        }
      }
    }
  }

  // Final summary
  console.log("\n=== Summary ===");
  const registry = await connection.getAccountInfo(oracleRegistryPda);
  if (registry) {
    console.log(`Registry size: ${registry.data.length} bytes`);
    console.log(`Registry balance: ${registry.lamports / LAMPORTS_PER_SOL} SOL`);
  }

  const finalAdminBalance = await connection.getBalance(adminKeypair.publicKey);
  console.log(`Admin final balance: ${finalAdminBalance / LAMPORTS_PER_SOL} SOL`);
}

main().catch(console.error);
