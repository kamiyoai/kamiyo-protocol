/**
 * Pre-flight Validation Example
 *
 * Demonstrates how to validate Mitama operations before
 * executing them on mainnet.
 */

import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { SurfpoolClient, PreflightValidator } from "@mitama/surfpool";

const SURFPOOL_ENDPOINT = process.env.SURFPOOL_URL || "http://localhost:8899";
const MITAMA_PROGRAM_ID = new PublicKey("8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM");

async function main() {
  // Initialize Surfpool client
  const surfpool = new SurfpoolClient({
    endpoint: SURFPOOL_ENDPOINT,
    commitment: "confirmed",
  });

  const validator = new PreflightValidator(surfpool, MITAMA_PROGRAM_ID);

  // Generate test keypairs
  const agentKeypair = Keypair.generate();
  const providerKeypair = Keypair.generate();

  console.log(`Agent: ${agentKeypair.publicKey.toBase58()}`);
  console.log(`Provider: ${providerKeypair.publicKey.toBase58()}`);

  // Set up test balance
  await surfpool.setBalanceSol(agentKeypair.publicKey, 10);

  // ==========================================================================
  // Validate Agent Creation
  // ==========================================================================

  console.log("\n=== Validating Agent Creation ===");

  const agentValidation = await validator.validateAgentCreation(
    {
      owner: agentKeypair.publicKey,
      name: "TestAgent",
      agentType: 1,
      stakeAmount: new BN(0.5 * LAMPORTS_PER_SOL),
    },
    agentKeypair
  );

  console.log(`Valid: ${agentValidation.valid}`);
  console.log(`Estimated Cost: ${agentValidation.estimatedCost / LAMPORTS_PER_SOL} SOL`);

  if (agentValidation.warnings.length > 0) {
    console.log("Warnings:");
    agentValidation.warnings.forEach((w) => console.log(`  - ${w}`));
  }

  if (!agentValidation.valid) {
    console.error(`Error: ${agentValidation.error}`);
    return;
  }

  // ==========================================================================
  // Validate Escrow Creation
  // ==========================================================================

  console.log("\n=== Validating Escrow Creation ===");

  const escrowValidation = await validator.validateEscrowCreation(
    {
      agent: agentKeypair.publicKey,
      provider: providerKeypair.publicKey,
      amount: new BN(1 * LAMPORTS_PER_SOL),
      timeLockSeconds: new BN(86400), // 24 hours
      transactionId: "order-123",
    },
    agentKeypair
  );

  console.log(`Valid: ${escrowValidation.valid}`);
  console.log(`Estimated Cost: ${escrowValidation.estimatedCost / LAMPORTS_PER_SOL} SOL`);

  if (escrowValidation.warnings.length > 0) {
    console.log("Warnings:");
    escrowValidation.warnings.forEach((w) => console.log(`  - ${w}`));
  }

  if (escrowValidation.stateChanges.length > 0) {
    console.log("State Changes:");
    escrowValidation.stateChanges.forEach((change) => {
      console.log(`  ${change.account.toBase58().slice(0, 8)}... ${change.field}: ${change.before} -> ${change.after}`);
    });
  }

  // ==========================================================================
  // Full Flow Validation
  // ==========================================================================

  console.log("\n=== Validating Full Flow ===");

  const fullFlow = await validator.validateFullFlow(
    {
      owner: agentKeypair.publicKey,
      name: "TestAgent",
      agentType: 1,
      stakeAmount: new BN(0.5 * LAMPORTS_PER_SOL),
    },
    {
      provider: providerKeypair.publicKey,
      amount: new BN(1 * LAMPORTS_PER_SOL),
      timeLockSeconds: new BN(86400),
      transactionId: "order-456",
    },
    agentKeypair
  );

  console.log(`Flow Valid: ${fullFlow.flowValid}`);
  console.log(`Total Cost: ${fullFlow.totalCost / LAMPORTS_PER_SOL} SOL`);
  console.log(`  Agent Creation: ${fullFlow.agentCreation.valid ? "OK" : fullFlow.agentCreation.error}`);
  console.log(`  Escrow Creation: ${fullFlow.escrowCreation.valid ? "OK" : fullFlow.escrowCreation.error}`);
  console.log(`  Release: ${fullFlow.release.valid ? "OK" : fullFlow.release.error}`);
}

main().catch(console.error);
