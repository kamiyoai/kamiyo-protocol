import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";
import path from "path";

const ESCROW_PROGRAM_ID = new PublicKey("EqScj2SUahLLUuP56s77yK6bPr3VEPoTyDecjvyoBtxT");
const KAMIYO_MINT = new PublicKey("Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump");

async function main() {
  const walletPath = path.join(__dirname, "../token-launch/wallets/program-authority.json");
  if (!fs.existsSync(walletPath)) {
    console.error("Wallet not found:", walletPath);
    process.exit(1);
  }
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  console.log("Admin wallet:", keypair.publicKey.toBase58());

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  const idlPath = path.join(__dirname, "../target/idl/kamiyo_escrow.json");
  if (!fs.existsSync(idlPath)) {
    console.error("IDL not found. Run 'anchor build -p kamiyo-escrow' first");
    process.exit(1);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury")],
    ESCROW_PROGRAM_ID
  );
  const [oracleConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_config")],
    ESCROW_PROGRAM_ID
  );

  console.log("Treasury PDA:", treasuryPda.toBase58());
  console.log("Oracle Config PDA:", oracleConfigPda.toBase58());

  const treasuryExists = await connection.getAccountInfo(treasuryPda);
  const oracleConfigExists = await connection.getAccountInfo(oracleConfigPda);

  console.log("\nCurrent state:");
  console.log("  Treasury exists:", !!treasuryExists);
  console.log("  Oracle config exists:", !!oracleConfigExists);

  if (!treasuryExists) {
    console.log("\nInitializing treasury...");
    try {
      const tx = await program.methods
        .initializeTreasury()
        .accounts({
          admin: keypair.publicKey,
          kamiyoMint: KAMIYO_MINT,
          tokenTreasury: treasuryPda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([keypair])
        .rpc();
      console.log("Treasury initialized:", tx);
    } catch (e) {
      console.error("Treasury init failed:", e);
    }
  }

  if (!oracleConfigExists) {
    console.log("\nInitializing oracle config...");
    try {
      const tx = await program.methods
        .initializeOracleConfig(
          3,              // min_consensus
          15,             // max_score_deviation
          new BN(300),    // commit_duration (5 min)
          new BN(1800),   // reveal_duration (30 min)
          false           // require_stake (disabled for devnet)
        )
        .accounts({
          admin: keypair.publicKey,
          oracleConfig: oracleConfigPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([keypair])
        .rpc();
      console.log("Oracle config initialized:", tx);
    } catch (e) {
      console.error("Oracle config init failed:", e);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
