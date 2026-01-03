/**
 * Time Travel Testing Example
 *
 * Demonstrates how to test time-dependent logic by
 * manipulating blockchain state in Surfpool.
 */

import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SurfpoolClient, StrategySimulator, Strategy } from "@mitama/surfpool";

const SURFPOOL_ENDPOINT = process.env.SURFPOOL_URL || "http://localhost:8899";

// Example: DeFi protocol addresses to clone
const RAYDIUM_AMM = new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

async function main() {
  // Initialize Surfpool client
  const surfpool = new SurfpoolClient({
    endpoint: SURFPOOL_ENDPOINT,
    commitment: "confirmed",
  });

  const simulator = new StrategySimulator(surfpool);
  const agentKeypair = Keypair.generate();

  console.log(`Agent: ${agentKeypair.publicKey.toBase58()}`);

  // ==========================================================================
  // Fork from Mainnet
  // ==========================================================================

  console.log("\n=== Creating Mainnet Fork ===");

  await surfpool.createFork({
    sourceCluster: "mainnet-beta",
    prefetchAccounts: [RAYDIUM_AMM, USDC_MINT],
  });

  console.log("Fork created with mainnet state");

  // ==========================================================================
  // Set Up Test Environment
  // ==========================================================================

  console.log("\n=== Setting Up Test Environment ===");

  // Give agent some SOL
  await surfpool.setBalanceSol(agentKeypair.publicKey, 100);
  console.log(`Agent balance set to 100 SOL`);

  // Get current state
  const initialSlot = await surfpool.getSlot();
  const initialTime = await surfpool.getBlockTime();
  console.log(`Initial slot: ${initialSlot}`);
  console.log(`Initial time: ${initialTime ? new Date(initialTime * 1000).toISOString() : "N/A"}`);

  // ==========================================================================
  // Time Travel Tests
  // ==========================================================================

  console.log("\n=== Time Travel Testing ===");

  // Test 1: Advance by 1 hour
  console.log("\n--- Advancing 1 hour ---");
  const warp1 = await surfpool.advanceTime(3600);
  console.log(`Slots advanced: ${warp1.slotsAdvanced}`);
  console.log(`New slot: ${warp1.currentSlot}`);

  // Test 2: Advance by 100 slots
  console.log("\n--- Advancing 100 slots ---");
  const warp2 = await surfpool.advanceSlots(100);
  console.log(`Slots advanced: ${warp2.slotsAdvanced}`);
  console.log(`New slot: ${warp2.currentSlot}`);

  // Test 3: Warp to specific slot
  console.log("\n--- Warping to slot 300000000 ---");
  const warp3 = await surfpool.warpToSlot(300000000);
  console.log(`Slots advanced: ${warp3.slotsAdvanced}`);
  console.log(`New slot: ${warp3.currentSlot}`);

  // ==========================================================================
  // Snapshot and Restore
  // ==========================================================================

  console.log("\n=== Snapshot Testing ===");

  // Take snapshot
  const snapshotId = await surfpool.snapshot();
  console.log(`Snapshot created: ${snapshotId}`);

  // Modify state
  await surfpool.setBalanceSol(agentKeypair.publicKey, 50);
  const balanceAfterMod = await surfpool.getBalanceSol(agentKeypair.publicKey);
  console.log(`Balance after modification: ${balanceAfterMod} SOL`);

  // Restore snapshot
  await surfpool.restore(snapshotId);
  const balanceAfterRestore = await surfpool.getBalanceSol(agentKeypair.publicKey);
  console.log(`Balance after restore: ${balanceAfterRestore} SOL`);

  // ==========================================================================
  // Time-Dependent Strategy Test
  // ==========================================================================

  console.log("\n=== Time-Dependent Strategy Test ===");

  // Strategy that behaves differently based on time
  const timedStrategy: Strategy = {
    name: "time-aware-strategy",
    description: "Strategy that tests time-dependent behavior",

    buildTransactions: async (context) => {
      const blockTime = await context.surfpool.getBlockTime();
      console.log(`Strategy executing at: ${blockTime ? new Date(blockTime * 1000).toISOString() : "N/A"}`);
      return [];
    },

    validateResults: (result) => result.success,
  };

  // Reset to clean state
  await surfpool.reset();
  await surfpool.setBalanceSol(agentKeypair.publicKey, 100);

  // Run at T=0
  console.log("\n--- Running at T=0 ---");
  await simulator.runStrategy(timedStrategy, agentKeypair);

  // Advance 24 hours and run again
  await surfpool.advanceTime(86400);
  console.log("\n--- Running at T+24h ---");
  await simulator.runStrategy(timedStrategy, agentKeypair);

  // Advance 7 days and run again
  await surfpool.advanceTime(7 * 86400);
  console.log("\n--- Running at T+7d ---");
  await simulator.runStrategy(timedStrategy, agentKeypair);

  // ==========================================================================
  // Clone Account Example
  // ==========================================================================

  console.log("\n=== Account Cloning ===");

  // Clone a specific account from mainnet
  await surfpool.cloneAccount(USDC_MINT, "mainnet-beta");
  console.log("USDC mint cloned from mainnet");

  // Clone multiple accounts
  await surfpool.cloneAccounts([RAYDIUM_AMM, USDC_MINT], "mainnet-beta");
  console.log("Multiple accounts cloned");

  console.log("\nTime travel testing complete!");
}

main().catch(console.error);
