/**
 * Monitor Kamiyo Protocol Events
 *
 * Usage:
 *   RPC_URL=<rpc> npx ts-node scripts/monitor-events.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM");

async function main() {
  console.log("\n========================================");
  console.log("  MITAMA EVENT MONITOR");
  console.log("========================================\n");

  const rpcUrl = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  console.log("RPC:", rpcUrl);
  console.log("Program:", PROGRAM_ID.toBase58());
  console.log("\nListening for events... (Ctrl+C to stop)\n");

  // Create dummy wallet for provider (read-only)
  const wallet = new anchor.Wallet(anchor.web3.Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idlPath = path.join(__dirname, "../target/idl/kamiyo.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  // Subscribe to events
  const listeners: number[] = [];

  listeners.push(
    program.addEventListener("EscrowInitialized", (event, slot) => {
      console.log(`[${new Date().toISOString()}] ESCROW CREATED`);
      console.log(`  Slot: ${slot}`);
      console.log(`  Agent: ${event.agent.toBase58()}`);
      console.log(`  Amount: ${event.amount.toString()} lamports`);
      console.log(`  Tx ID: ${event.transactionId}`);
      console.log("");
    })
  );

  listeners.push(
    program.addEventListener("DisputeMarked", (event, slot) => {
      console.log(`[${new Date().toISOString()}] DISPUTE MARKED`);
      console.log(`  Slot: ${slot}`);
      console.log(`  Escrow: ${event.escrow.toBase58()}`);
      console.log(`  Agent: ${event.agent.toBase58()}`);
      console.log("");
    })
  );

  listeners.push(
    program.addEventListener("MultiOracleDisputeResolved", (event, slot) => {
      console.log(`[${new Date().toISOString()}] DISPUTE RESOLVED`);
      console.log(`  Slot: ${slot}`);
      console.log(`  Escrow: ${event.escrow.toBase58()}`);
      console.log(`  Consensus Score: ${event.consensusScore}`);
      console.log(`  Refund %: ${event.refundPercentage}%`);
      console.log(`  Oracle Count: ${event.oracleCount}`);
      console.log("");
    })
  );

  listeners.push(
    program.addEventListener("OracleSlashed", (event, slot) => {
      console.log(`[${new Date().toISOString()}] ORACLE SLASHED`);
      console.log(`  Slot: ${slot}`);
      console.log(`  Oracle: ${event.oracle.toBase58()}`);
      console.log(`  Amount: ${event.slashAmount.toString()} lamports`);
      console.log(`  Violations: ${event.violationCount}`);
      console.log(`  Reason: ${event.reason}`);
      console.log("");
    })
  );

  listeners.push(
    program.addEventListener("OracleRewarded", (event, slot) => {
      console.log(`[${new Date().toISOString()}] ORACLE REWARDED`);
      console.log(`  Slot: ${slot}`);
      console.log(`  Oracle: ${event.oracle.toBase58()}`);
      console.log(`  Amount: ${event.rewardAmount.toString()} lamports`);
      console.log("");
    })
  );

  listeners.push(
    program.addEventListener("AgentSlashed", (event, slot) => {
      console.log(`[${new Date().toISOString()}] AGENT SLASHED`);
      console.log(`  Slot: ${slot}`);
      console.log(`  Agent: ${event.agent.toBase58()}`);
      console.log(`  Amount: ${event.slashAmount.toString()} lamports`);
      console.log(`  Reason: ${event.reason}`);
      console.log("");
    })
  );

  listeners.push(
    program.addEventListener("TreasuryDeposit", (event, slot) => {
      console.log(`[${new Date().toISOString()}] TREASURY DEPOSIT`);
      console.log(`  Slot: ${slot}`);
      console.log(`  Amount: ${event.amount.toString()} lamports`);
      console.log(`  Source: ${event.source}`);
      console.log("");
    })
  );

  listeners.push(
    program.addEventListener("OracleRemoved", (event, slot) => {
      console.log(`[${new Date().toISOString()}] ORACLE REMOVED`);
      console.log(`  Slot: ${slot}`);
      console.log(`  Oracle: ${event.oracle.toBase58()}`);
      console.log(`  Reason: ${event.reason}`);
      console.log(`  Violations: ${event.violationCount}`);
      console.log("");
    })
  );

  listeners.push(
    program.addEventListener("FundsReleased", (event, slot) => {
      console.log(`[${new Date().toISOString()}] FUNDS RELEASED`);
      console.log(`  Slot: ${slot}`);
      console.log(`  Escrow: ${event.escrow.toBase58()}`);
      console.log(`  Amount: ${event.amount.toString()} lamports`);
      console.log("");
    })
  );

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    for (const listener of listeners) {
      await program.removeEventListener(listener);
    }
    process.exit(0);
  });

  // Keep process running
  await new Promise(() => {});
}

main().catch(console.error);
