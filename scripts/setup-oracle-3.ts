/**
 * Generate and Register Oracle 3
 *
 * Usage:
 *   RPC_URL=<rpc> npx ts-node scripts/setup-oracle-3.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
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

async function main() {
  console.log("\n========================================");
  console.log("  SETUP ORACLE 3");
  console.log("========================================\n");

  const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  console.log("RPC:", rpcUrl);

  const admin = loadKeypair("~/.config/solana/id.json");
  console.log("Admin:", admin.publicKey.toBase58());

  // Generate or load oracle 3
  const oraclePath = path.join(__dirname, "../oracles/simple/oracle-3.json");
  let oracle3: Keypair;

  if (fs.existsSync(oraclePath)) {
    oracle3 = loadKeypair(oraclePath);
    console.log("Loaded existing Oracle 3:", oracle3.publicKey.toBase58());
  } else {
    oracle3 = Keypair.generate();
    fs.writeFileSync(oraclePath, JSON.stringify(Array.from(oracle3.secretKey)));
    console.log("Generated new Oracle 3:", oracle3.publicKey.toBase58());
  }

  // Check balance
  const balance = await connection.getBalance(oracle3.publicKey);
  console.log("Oracle 3 balance:", balance / LAMPORTS_PER_SOL, "SOL");

  // Fund if needed
  const requiredBalance = MIN_ORACLE_STAKE + 0.01 * LAMPORTS_PER_SOL; // stake + rent
  if (balance < requiredBalance) {
    const needed = requiredBalance - balance;
    console.log(`\nNeed to fund oracle with ${needed / LAMPORTS_PER_SOL} SOL`);

    if (rpcUrl.includes("devnet")) {
      // Try airdrop on devnet
      console.log("Requesting airdrop...");
      try {
        const sig = await connection.requestAirdrop(
          oracle3.publicKey,
          LAMPORTS_PER_SOL
        );
        await connection.confirmTransaction(sig, "confirmed");
        console.log("Airdrop successful");
      } catch (e) {
        console.log("Airdrop failed, transferring from admin...");
        const tx = new anchor.web3.Transaction().add(
          anchor.web3.SystemProgram.transfer({
            fromPubkey: admin.publicKey,
            toPubkey: oracle3.publicKey,
            lamports: needed,
          })
        );
        const sig = await anchor.web3.sendAndConfirmTransaction(connection, tx, [admin]);
        console.log("Transfer:", sig);
      }
    } else {
      // Mainnet - transfer from admin
      console.log("Transferring from admin...");
      const tx = new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: admin.publicKey,
          toPubkey: oracle3.publicKey,
          lamports: needed,
        })
      );
      const sig = await anchor.web3.sendAndConfirmTransaction(connection, tx, [admin]);
      console.log("Transfer:", sig);
    }
  }

  // Setup Anchor
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const idlPath = path.join(__dirname, "../target/idl/kamiyo.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  const [oracleRegistryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_registry")],
    PROGRAM_ID
  );

  // Check if already registered
  const registry = await (program.account as any).oracleRegistry.fetch(oracleRegistryPDA);
  const alreadyRegistered = registry.oracles.some(
    (o: any) => o.pubkey.toBase58() === oracle3.publicKey.toBase58()
  );

  if (alreadyRegistered) {
    console.log("\nOracle 3 already registered!");
    return;
  }

  console.log("\nRegistering Oracle 3...");
  console.log("  Weight: 100");
  console.log("  Stake:", MIN_ORACLE_STAKE / LAMPORTS_PER_SOL, "SOL");

  try {
    const tx = await (program.methods as any)
      .addOracle(
        oracle3.publicKey,
        { ed25519: {} },
        100, // weight
        new anchor.BN(MIN_ORACLE_STAKE)
      )
      .accounts({
        oracleRegistry: oracleRegistryPDA,
        admin: admin.publicKey,
        oracleSigner: oracle3.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin, oracle3])
      .rpc();

    console.log("Success! Tx:", tx);

    const updatedRegistry = await (program.account as any).oracleRegistry.fetch(oracleRegistryPDA);
    console.log("\nRegistry now has", updatedRegistry.oracles.length, "oracle(s)");
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

main().catch(console.error);
