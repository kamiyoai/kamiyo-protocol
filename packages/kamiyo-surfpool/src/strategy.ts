/**
 * Strategy Simulation - Test agent strategies before mainnet execution
 */

import { PublicKey, Transaction, Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { SurfpoolClient, SimulationResult } from "./client";

export interface Strategy {
  /** Strategy identifier */
  name: string;
  /** Strategy description */
  description?: string;
  /** Build transactions for this strategy */
  buildTransactions: (context: StrategyContext) => Promise<Transaction[]>;
  /** Validate strategy results */
  validateResults?: (results: StrategyResult) => boolean;
}

export interface StrategyContext {
  /** Agent public key */
  agent: PublicKey;
  /** Agent keypair for signing */
  agentKeypair: Keypair;
  /** Surfpool client for queries */
  surfpool: SurfpoolClient;
  /** Initial balance in lamports */
  initialBalance: number;
  /** Strategy parameters */
  params: Record<string, unknown>;
}

export interface StrategyResult {
  /** Whether strategy executed successfully */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Profit/loss in lamports */
  pnl: number;
  /** Profit/loss percentage */
  pnlPercent: number;
  /** Total gas used (compute units) */
  gasUsed: number;
  /** Estimated gas cost in lamports */
  gasCost: number;
  /** Number of transactions executed */
  transactionCount: number;
  /** Individual transaction results */
  transactions: TransactionResult[];
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Final balance in lamports */
  finalBalance: number;
  /** Slots elapsed during simulation */
  slotsElapsed: number;
}

export interface TransactionResult {
  /** Transaction index */
  index: number;
  /** Transaction signature (simulated) */
  signature: string;
  /** Simulation result */
  simulation: SimulationResult;
  /** Balance change */
  balanceChange: number;
}

export interface StrategyTestConfig {
  /** Initial balance to set (in SOL) */
  initialBalanceSol?: number;
  /** Accounts to clone from mainnet */
  cloneAccounts?: PublicKey[];
  /** Number of slots to advance between transactions */
  slotsBetweenTx?: number;
  /** Whether to take snapshots before each transaction */
  snapshotBeforeTx?: boolean;
  /** Maximum transactions to execute */
  maxTransactions?: number;
  /** Strategy-specific parameters */
  params?: Record<string, unknown>;
}

/**
 * Strategy Simulator for testing agent strategies
 */
export class StrategySimulator {
  private surfpool: SurfpoolClient;

  constructor(surfpool: SurfpoolClient) {
    this.surfpool = surfpool;
  }

  /**
   * Run a strategy simulation
   */
  async runStrategy(
    strategy: Strategy,
    agentKeypair: Keypair,
    config: StrategyTestConfig = {}
  ): Promise<StrategyResult> {
    const startTime = Date.now();
    const agent = agentKeypair.publicKey;

    // Setup simulation environment
    await this.setupEnvironment(agent, config);

    const initialBalance = await this.surfpool.getBalance(agent);
    const initialSlot = await this.surfpool.getSlot();

    // Build strategy context
    const context: StrategyContext = {
      agent,
      agentKeypair,
      surfpool: this.surfpool,
      initialBalance,
      params: config.params ?? {},
    };

    // Build transactions
    let transactions: Transaction[];
    try {
      transactions = await strategy.buildTransactions(context);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : "Failed to build transactions",
        initialBalance,
        startTime
      );
    }

    // Apply transaction limit
    if (config.maxTransactions && transactions.length > config.maxTransactions) {
      transactions = transactions.slice(0, config.maxTransactions);
    }

    // Execute transactions
    const txResults: TransactionResult[] = [];
    let totalGasUsed = 0;
    let success = true;

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];

      // Snapshot if configured
      if (config.snapshotBeforeTx) {
        await this.surfpool.snapshot();
      }

      // Get balance before
      const balanceBefore = await this.surfpool.getBalance(agent);

      // Execute transaction
      const simulation = await this.surfpool.executeTransaction(tx);

      // Get balance after
      const balanceAfter = await this.surfpool.getBalance(agent);

      txResults.push({
        index: i,
        signature: `sim_${Date.now()}_${i}`,
        simulation,
        balanceChange: balanceAfter - balanceBefore,
      });

      totalGasUsed += simulation.unitsConsumed;

      if (!simulation.success) {
        success = false;
        break;
      }

      // Advance slots if configured
      if (config.slotsBetweenTx && i < transactions.length - 1) {
        await this.surfpool.advanceSlots(config.slotsBetweenTx);
      }
    }

    // Calculate final results
    const finalBalance = await this.surfpool.getBalance(agent);
    const finalSlot = await this.surfpool.getSlot();
    const pnl = finalBalance - initialBalance;
    const pnlPercent = initialBalance > 0 ? (pnl / initialBalance) * 100 : 0;

    // Estimate gas cost (5000 lamports per 1M compute units as rough estimate)
    const gasCost = Math.ceil((totalGasUsed / 1_000_000) * 5000);

    const result: StrategyResult = {
      success,
      pnl,
      pnlPercent,
      gasUsed: totalGasUsed,
      gasCost,
      transactionCount: txResults.length,
      transactions: txResults,
      executionTimeMs: Date.now() - startTime,
      finalBalance,
      slotsElapsed: finalSlot - initialSlot,
    };

    // Run custom validation if provided
    if (strategy.validateResults && !strategy.validateResults(result)) {
      result.success = false;
      result.error = "Strategy validation failed";
    }

    return result;
  }

  /**
   * Run multiple strategies and compare results
   */
  async compareStrategies(
    strategies: Strategy[],
    agentKeypair: Keypair,
    config: StrategyTestConfig = {}
  ): Promise<Map<string, StrategyResult>> {
    const results = new Map<string, StrategyResult>();

    for (const strategy of strategies) {
      // Reset simulation for each strategy
      await this.surfpool.reset();

      const result = await this.runStrategy(strategy, agentKeypair, config);
      results.set(strategy.name, result);
    }

    return results;
  }

  /**
   * Run strategy with multiple parameter variations
   */
  async optimizeStrategy(
    strategy: Strategy,
    agentKeypair: Keypair,
    paramVariations: Record<string, unknown[]>,
    baseConfig: StrategyTestConfig = {}
  ): Promise<{ bestParams: Record<string, unknown>; bestResult: StrategyResult }> {
    // Generate all parameter combinations
    const paramCombinations = this.generateParamCombinations(paramVariations);

    let bestResult: StrategyResult | null = null;
    let bestParams: Record<string, unknown> = {};

    for (const params of paramCombinations) {
      await this.surfpool.reset();

      const result = await this.runStrategy(strategy, agentKeypair, {
        ...baseConfig,
        params,
      });

      if (!bestResult || (result.success && result.pnl > bestResult.pnl)) {
        bestResult = result;
        bestParams = params;
      }
    }

    return {
      bestParams,
      bestResult: bestResult ?? this.createErrorResult("No results", 0, Date.now()),
    };
  }

  /**
   * Stress test a strategy with varying conditions
   */
  async stressTest(
    strategy: Strategy,
    agentKeypair: Keypair,
    config: {
      iterations: number;
      varyBalance?: { min: number; max: number };
      varySlots?: { min: number; max: number };
    }
  ): Promise<{
    successRate: number;
    avgPnl: number;
    avgGasUsed: number;
    worstCase: StrategyResult;
    bestCase: StrategyResult;
  }> {
    const results: StrategyResult[] = [];

    for (let i = 0; i < config.iterations; i++) {
      await this.surfpool.reset();

      // Vary initial balance
      let initialBalanceSol = 1;
      if (config.varyBalance) {
        initialBalanceSol =
          config.varyBalance.min +
          Math.random() * (config.varyBalance.max - config.varyBalance.min);
      }

      // Vary slots
      if (config.varySlots) {
        const slots =
          config.varySlots.min +
          Math.floor(
            Math.random() * (config.varySlots.max - config.varySlots.min)
          );
        await this.surfpool.advanceSlots(slots);
      }

      const result = await this.runStrategy(strategy, agentKeypair, {
        initialBalanceSol,
      });
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    const successResults = results.filter((r) => r.success);

    return {
      successRate: (successCount / results.length) * 100,
      avgPnl:
        successResults.length > 0
          ? successResults.reduce((sum, r) => sum + r.pnl, 0) /
            successResults.length
          : 0,
      avgGasUsed:
        results.reduce((sum, r) => sum + r.gasUsed, 0) / results.length,
      worstCase: results.reduce((worst, r) =>
        r.pnl < worst.pnl ? r : worst
      ),
      bestCase: results.reduce((best, r) => (r.pnl > best.pnl ? r : best)),
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async setupEnvironment(
    agent: PublicKey,
    config: StrategyTestConfig
  ): Promise<void> {
    // Set initial balance
    if (config.initialBalanceSol) {
      await this.surfpool.setBalanceSol(agent, config.initialBalanceSol);
    }

    // Clone accounts from mainnet
    if (config.cloneAccounts && config.cloneAccounts.length > 0) {
      await this.surfpool.cloneAccounts(config.cloneAccounts);
    }
  }

  private createErrorResult(
    error: string,
    initialBalance: number,
    startTime: number
  ): StrategyResult {
    return {
      success: false,
      error,
      pnl: 0,
      pnlPercent: 0,
      gasUsed: 0,
      gasCost: 0,
      transactionCount: 0,
      transactions: [],
      executionTimeMs: Date.now() - startTime,
      finalBalance: initialBalance,
      slotsElapsed: 0,
    };
  }

  private generateParamCombinations(
    variations: Record<string, unknown[]>
  ): Record<string, unknown>[] {
    const keys = Object.keys(variations);
    if (keys.length === 0) return [{}];

    const combinations: Record<string, unknown>[] = [];
    const generate = (index: number, current: Record<string, unknown>) => {
      if (index === keys.length) {
        combinations.push({ ...current });
        return;
      }

      const key = keys[index];
      for (const value of variations[key]) {
        current[key] = value;
        generate(index + 1, current);
      }
    };

    generate(0, {});
    return combinations;
  }
}

// ==========================================================================
// Built-in Strategy Templates
// ==========================================================================

/**
 * Create a simple balance transfer strategy for testing
 */
export function createTransferStrategy(
  recipient: PublicKey,
  amountSol: number
): Strategy {
  return {
    name: "simple-transfer",
    description: `Transfer ${amountSol} SOL to ${recipient.toBase58().slice(0, 8)}...`,
    buildTransactions: async (context) => {
      const { agent, agentKeypair, surfpool } = context;
      const connection = surfpool.getConnection();

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: agent,
          toPubkey: recipient,
          lamports: Math.floor(amountSol * LAMPORTS_PER_SOL),
        })
      );

      tx.feePayer = agent;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.sign(agentKeypair);

      return [tx];
    },
    validateResults: (result) => {
      return result.success && result.pnl >= -amountSol * LAMPORTS_PER_SOL;
    },
  };
}
