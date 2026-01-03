import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM");

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const idlPath = path.join(__dirname, "../target/idl/mitama.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  
  console.log("IDL has", idl.instructions.length, "instructions:");
  idl.instructions.forEach((ix: any) => console.log("  -", ix.name));
  
  const [protocolConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_config")],
    PROGRAM_ID
  );
  const [treasuryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  );
  
  const configInfo = await connection.getAccountInfo(protocolConfigPDA);
  const treasuryInfo = await connection.getAccountInfo(treasuryPDA);
  
  console.log("\nOn-chain state:");
  console.log("  Protocol config exists:", !!configInfo);
  console.log("  Treasury exists:", !!treasuryInfo);
}

main().catch(console.error);
