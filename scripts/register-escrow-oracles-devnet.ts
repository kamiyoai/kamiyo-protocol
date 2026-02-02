import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const ESCROW_PROGRAM_ID = new PublicKey("EqScj2SUahLLUuP56s77yK6bPr3VEPoTyDecjvyoBtxT");

const ORACLE_PUBKEYS = [
  new PublicKey("4RUSNRP3ZrgdVZPRLyspavBqCVVdPMpFF2uUSsYTg2VC"),
  new PublicKey("J42jm17dA5f6Um8qbf8Pe39m7mLtYZfqJf1a3qZHT2NW"),
  new PublicKey("5uFjCKXDyCspcmV1jDRFg7askNZPDxHDqXqzgfPnpsqj"),
  new PublicKey("725XNA5HRFJGxNj6ZmX1pvYJs7rqKZN69orCn9djSzaw"),
  new PublicKey("BePGQmohYFHdpXQQt9ELb5rrAhPBshaQyiWN5ZUdxvbt"),
];

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

  const [oracleConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_config")],
    ESCROW_PROGRAM_ID
  );

  console.log("Oracle Config PDA:", oracleConfigPda.toBase58());

  for (const oracle of ORACLE_PUBKEYS) {
    console.log(`\nRegistering oracle: ${oracle.toBase58()}`);
    try {
      const tx = await program.methods
        .registerOracle(oracle)
        .accounts({
          admin: keypair.publicKey,
          oracleConfig: oracleConfigPda,
        })
        .signers([keypair])
        .rpc();
      console.log("Registered:", tx);
    } catch (e: any) {
      if (e.message?.includes("OracleAlreadyRegistered")) {
        console.log("Already registered");
      } else {
        console.error("Failed:", e.message || e);
      }
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
