/**
 * Mitama Surfpool Integration
 *
 * Provides simulation and pre-flight validation for Mitama operations
 * using Surfpool's Solana fork environment.
 *
 * @example
 * ```typescript
 * import { SurfpoolClient, StrategySimulator, PreflightValidator } from '@mitama/surfpool';
 *
 * // Create Surfpool client
 * const surfpool = new SurfpoolClient({
 *   endpoint: 'http://localhost:8899', // or Surfpool cloud endpoint
 * });
 *
 * // Test a strategy before mainnet execution
 * const simulator = new StrategySimulator(surfpool);
 * const result = await simulator.runStrategy(myStrategy, agentKeypair, {
 *   initialBalanceSol: 10,
 *   cloneAccounts: [USDC_MINT, RAYDIUM_AMM],
 * });
 *
 * // Validate escrow creation before execution
 * const validator = new PreflightValidator(surfpool, MITAMA_PROGRAM_ID);
 * const validation = await validator.validateEscrowCreation(params, keypair);
 * if (!validation.valid) {
 *   console.error(validation.error);
 * }
 * ```
 *
 * @packageDocumentation
 */

// Core client
export {
  SurfpoolClient,
  SurfpoolConfig,
  AccountSnapshot,
  SimulationResult,
  ForkConfig,
  TimeWarpResult,
  BlockhashOverride,
} from "./client";

// Strategy simulation
export {
  StrategySimulator,
  Strategy,
  StrategyContext,
  StrategyResult,
  TransactionResult,
  StrategyTestConfig,
  createTransferStrategy,
} from "./strategy";

// Pre-flight validation
export {
  PreflightValidator,
  PreflightResult,
  StateChange,
  AgentCreationParams,
  EscrowCreationParams,
  DisputeParams,
  ReleaseParams,
} from "./preflight";

// Re-export common types
export { PublicKey, Keypair, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
export { BN } from "@coral-xyz/anchor";
