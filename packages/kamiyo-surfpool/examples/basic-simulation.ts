/**
 * Basic Strategy Simulation Example
 *
 * Demonstrates how to test a simple trading strategy in Surfpool
 * before deploying to mainnet.
 */

import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SurfpoolClient, StrategySimulator, Strategy } from "@kamiyo/surfpool";

const SURFPOOL_ENDPOINT = process.env.SURFPOOL_URL || "http://localhost:8899";

async function main() {
  // Initialize Surfpool client
  const surfpool = new SurfpoolClient({
    endpoint: SURFPOOL_ENDPOINT,
    commitment: "confirmed",
  });

  const simulator = new StrategySimulator(surfpool);

  // Generate test keypair
  const agentKeypair = Keypair.generate();
  console.log(`Agent: ${agentKeypair.publicKey.toBase58()}`);

  // Define a simple strategy
  const simpleStrategy: Strategy = {
    name: "demo-strategy",
    description: "Simple demonstration strategy",

    buildTransactions: async (context) => {
      // Strategy logic would go here
      // For demo, we just log the context
      console.log(`Initial balance: ${context.initialBalance / LAMPORTS_PER_SOL} SOL`);
      console.log(`Strategy params:`, context.params);

      // Return empty array for demo (no-op strategy)
      return [];
    },

    validateResults: (result) => {
      // Define success criteria
      return result.success && result.pnl >= 0;
    },
  };

  // Run simulation
  console.log("\nRunning strategy simulation...");

  const result = await simulator.runStrategy(simpleStrategy, agentKeypair, {
    initialBalanceSol: 10,
    params: {
      maxSlippage: 0.01,
      targetProfit: 0.05,
    },
  });

  // Output results
  console.log("\n=== Simulation Results ===");
  console.log(`Success: ${result.success}`);
  console.log(`PnL: ${result.pnl / LAMPORTS_PER_SOL} SOL (${result.pnlPercent.toFixed(2)}%)`);
  console.log(`Gas Used: ${result.gasUsed} CU`);
  console.log(`Gas Cost: ${result.gasCost / LAMPORTS_PER_SOL} SOL`);
  console.log(`Transactions: ${result.transactionCount}`);
  console.log(`Execution Time: ${result.executionTimeMs}ms`);
  console.log(`Slots Elapsed: ${result.slotsElapsed}`);

  if (result.error) {
    console.error(`Error: ${result.error}`);
  }
}

main().catch(console.error);
