import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
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
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
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
  
  console.log("IDL address:", idl.address);
  console.log("Creating program with IDL...");
  
  const program = new Program(idl, provider);
  console.log("Program ID:", program.programId.toBase58());
  
  const [treasuryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  );
  console.log("Treasury PDA:", treasuryPDA.toBase58());
  
  console.log("\nCalling initializeTreasury...");
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
  } catch (err: any) {
    console.error("Error:", err.message);
    if (err.logs) {
      console.log("Logs:", err.logs.slice(-5));
    }
  }
}

main().catch(console.error);
