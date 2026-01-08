#!/usr/bin/env npx ts-node
/**
 * KAMIYO Protocol Demo Script
 * Run: npx ts-node scripts/demo.ts
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";

const PROGRAM_ID = new PublicKey("8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM");

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

function log(msg: string, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function header(msg: string) {
  console.log();
  log("═".repeat(60), colors.cyan);
  log(`  ${msg}`, colors.bright + colors.cyan);
  log("═".repeat(60), colors.cyan);
  console.log();
}

function step(num: number, msg: string) {
  log(`[${num}] ${msg}`, colors.green);
}

function info(label: string, value: string) {
  console.log(`    ${colors.dim}${label}:${colors.reset} ${value}`);
}

async function main() {
  header("KAMIYO Protocol Demo");
  console.log();

  // Connect to mainnet (read-only demo)
  step(1, "Connecting to Solana Mainnet...");
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  const slot = await connection.getSlot();
  info("Current slot", slot.toLocaleString());
  info("RPC", "mainnet-beta.solana.com");
  await sleep(1500);

  // Show program info
  step(2, "Fetching KAMIYO Program...");
  const programInfo = await connection.getAccountInfo(PROGRAM_ID);
  if (programInfo) {
    info("Program ID", PROGRAM_ID.toBase58());
    info("Executable", "Yes");
    info("Data size", `${programInfo.data.length.toLocaleString()} bytes`);
    info("Lamports", (programInfo.lamports / LAMPORTS_PER_SOL).toFixed(6) + " SOL");
  }
  await sleep(1500);

  // Show recent transactions
  step(3, "Fetching recent program transactions...");
  const signatures = await connection.getSignaturesForAddress(PROGRAM_ID, { limit: 5 });
  console.log();
  log("    Recent transactions:", colors.yellow);
  for (const sig of signatures) {
    const shortSig = sig.signature.slice(0, 20) + "...";
    const time = sig.blockTime ? new Date(sig.blockTime * 1000).toISOString().slice(0, 19) : "unknown";
    console.log(`      ${colors.dim}${shortSig}${colors.reset}  ${time}`);
  }
  await sleep(2000);

  // Show SDK usage
  header("SDK Usage Example");

  console.log(`${colors.magenta}// 1. Initialize client${colors.reset}`);
  console.log(`${colors.dim}import { KamiyoClient } from '@kamiyo/sdk';
const client = new KamiyoClient({ connection, wallet });${colors.reset}`);
  await sleep(2000);

  console.log();
  console.log(`${colors.magenta}// 2. Create escrow agreement${colors.reset}`);
  console.log(`${colors.dim}const { signature, pda } = await client.createAgreement({
  provider: providerPubkey,
  amount: 100_000_000,      // 0.1 SOL
  timeLockSeconds: 86400,   // 24 hours
  transactionId: 'tx-001'
});${colors.reset}`);
  await sleep(2000);

  console.log();
  console.log(`${colors.magenta}// 3. Service delivered - release funds${colors.reset}`);
  console.log(`${colors.dim}await client.releaseFunds('tx-001', providerPubkey);${colors.reset}`);
  await sleep(1500);

  console.log();
  console.log(`${colors.magenta}// 4. Or dispute if quality is poor${colors.reset}`);
  console.log(`${colors.dim}await client.markDisputed('tx-001');
// Oracles vote, median score determines refund${colors.reset}`);
  await sleep(2000);

  // Quality refund scale
  header("Quality-Based Refund Scale");

  const scale = [
    { range: "80-100%", action: "Full payment to provider", color: colors.green },
    { range: "65-79%", action: "35% refund to agent", color: colors.yellow },
    { range: "50-64%", action: "75% refund to agent", color: colors.yellow },
    { range: "0-49%", action: "100% refund to agent", color: colors.red },
  ];

  for (const tier of scale) {
    console.log(`    ${tier.color}${tier.range.padEnd(10)}${colors.reset} ${tier.action}`);
  }
  await sleep(2000);

  // End
  header("Links");
  info("Protocol Dashboard", "https://protocol.kamiyo.ai");
  info("GitHub", "https://github.com/kamiyo-ai/kamiyo-protocol");
  info("Solscan", `https://solscan.io/account/${PROGRAM_ID.toBase58()}`);
  console.log();

  log("Demo complete.", colors.green);
}

main().catch(console.error);
