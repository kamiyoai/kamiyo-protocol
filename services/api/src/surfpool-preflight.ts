/**
 * Surfpool Production Preflight Service
 *
 * Every KAMIYO transaction is simulated through Surfpool before mainnet submission.
 * This provides:
 * - Transaction validation before spending gas
 * - MEV protection verification
 * - State change prediction
 * - Error detection before on-chain failure
 */

import { Connection, Transaction, VersionedTransaction, PublicKey } from '@solana/web3.js';
import { logger } from './logger';

const SURFPOOL_URL = process.env.SURFPOOL_URL || 'http://localhost:8899';
const MAINNET_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PREFLIGHT_ENABLED = process.env.PREFLIGHT_ENABLED !== 'false';

interface PreflightResult {
  success: boolean;
  simulationSuccess: boolean;
  computeUnits: number;
  logs: string[];
  error?: string;
  stateChanges?: StateChange[];
  mevRisk?: MevRiskAssessment;
}

interface StateChange {
  account: string;
  before: string;
  after: string;
  type: 'balance' | 'data' | 'owner';
}

interface MevRiskAssessment {
  risk: 'low' | 'medium' | 'high';
  reasons: string[];
  recommendations: string[];
}

interface SurfpoolRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

class SurfpoolPreflightService {
  private surfpoolConnection: Connection;
  private mainnetConnection: Connection;
  private enabled: boolean;

  constructor() {
    this.surfpoolConnection = new Connection(SURFPOOL_URL, 'confirmed');
    this.mainnetConnection = new Connection(MAINNET_RPC, 'confirmed');
    this.enabled = PREFLIGHT_ENABLED;

    if (this.enabled) {
      logger.info('Surfpool preflight service initialized', { url: SURFPOOL_URL });
    } else {
      logger.warn('Surfpool preflight service DISABLED');
    }
  }

  /**
   * Validate a transaction before mainnet submission
   */
  async validateTransaction(
    transaction: Transaction | VersionedTransaction,
    signers?: string[]
  ): Promise<PreflightResult> {
    if (!this.enabled) {
      return {
        success: true,
        simulationSuccess: true,
        computeUnits: 0,
        logs: ['Preflight disabled'],
      };
    }

    const startTime = Date.now();

    try {
      // Step 1: Fork current mainnet state
      await this.forkMainnetState();

      // Step 2: Clone relevant accounts
      const accounts = this.extractAccounts(transaction);
      await this.cloneAccounts(accounts);

      // Step 3: Simulate transaction
      const simulation = await this.simulateTransaction(transaction);

      // Step 4: Analyze state changes
      const stateChanges = await this.analyzeStateChanges(transaction, accounts);

      // Step 5: Assess MEV risk
      const mevRisk = this.assessMevRisk(transaction, stateChanges);

      const latency = Date.now() - startTime;
      logger.info('Preflight validation complete', {
        success: simulation.success,
        computeUnits: simulation.computeUnits,
        mevRisk: mevRisk.risk,
        latencyMs: latency,
      });

      return {
        success: simulation.success && mevRisk.risk !== 'high',
        simulationSuccess: simulation.success,
        computeUnits: simulation.computeUnits,
        logs: simulation.logs,
        error: simulation.error,
        stateChanges,
        mevRisk,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error('Preflight validation failed', { error });

      return {
        success: false,
        simulationSuccess: false,
        computeUnits: 0,
        logs: [],
        error,
      };
    }
  }

  /**
   * Validate an escrow creation before submission
   */
  async validateEscrowCreation(
    agentId: PublicKey,
    counterparty: PublicKey,
    amount: number,
    token: PublicKey
  ): Promise<PreflightResult & { escrowPda?: string }> {
    const result = await this.rpcCall<{ valid: boolean; escrowPda: string; error?: string }>(
      'surfpool_validateEscrowCreation',
      [agentId.toBase58(), counterparty.toBase58(), amount, token.toBase58()]
    );

    if (!result) {
      return {
        success: false,
        simulationSuccess: false,
        computeUnits: 0,
        logs: [],
        error: 'Surfpool RPC call failed',
      };
    }

    return {
      success: result.valid,
      simulationSuccess: result.valid,
      computeUnits: 0,
      logs: [],
      error: result.error,
      escrowPda: result.escrowPda,
    };
  }

  /**
   * Validate a dispute resolution
   */
  async validateDispute(
    escrowId: PublicKey,
    initiator: PublicKey,
    evidence: string
  ): Promise<PreflightResult> {
    const result = await this.rpcCall<{ valid: boolean; error?: string }>(
      'surfpool_validateDispute',
      [escrowId.toBase58(), initiator.toBase58(), evidence]
    );

    return {
      success: result?.valid ?? false,
      simulationSuccess: result?.valid ?? false,
      computeUnits: 0,
      logs: [],
      error: result?.error,
    };
  }

  /**
   * Run a full escrow lifecycle simulation
   */
  async simulateEscrowLifecycle(params: {
    agent: PublicKey;
    counterparty: PublicKey;
    amount: number;
    token: PublicKey;
    completionPath: 'release' | 'dispute' | 'expire';
  }): Promise<{
    success: boolean;
    stages: { name: string; success: boolean; computeUnits: number }[];
    totalComputeUnits: number;
    error?: string;
  }> {
    const stages: { name: string; success: boolean; computeUnits: number }[] = [];
    let totalComputeUnits = 0;

    try {
      // Stage 1: Create escrow
      const createResult = await this.validateEscrowCreation(
        params.agent,
        params.counterparty,
        params.amount,
        params.token
      );
      stages.push({ name: 'create_escrow', success: createResult.success, computeUnits: createResult.computeUnits });
      totalComputeUnits += createResult.computeUnits;

      if (!createResult.success) {
        return { success: false, stages, totalComputeUnits, error: createResult.error };
      }

      // Stage 2: Fund escrow
      const fundResult = await this.rpcCall<{ success: boolean; computeUnits: number }>('surfpool_simulateFundEscrow', [
        createResult.escrowPda,
        params.amount,
      ]);
      stages.push({ name: 'fund_escrow', success: fundResult?.success ?? false, computeUnits: fundResult?.computeUnits ?? 0 });
      totalComputeUnits += fundResult?.computeUnits ?? 0;

      // Stage 3: Completion path
      if (params.completionPath === 'release') {
        const releaseResult = await this.rpcCall<{ success: boolean; computeUnits: number }>('surfpool_simulateRelease', [
          createResult.escrowPda,
        ]);
        stages.push({ name: 'release', success: releaseResult?.success ?? false, computeUnits: releaseResult?.computeUnits ?? 0 });
        totalComputeUnits += releaseResult?.computeUnits ?? 0;
      } else if (params.completionPath === 'dispute') {
        // Time travel to dispute window
        await this.rpcCall('surfpool_advanceTime', [86400]); // 1 day

        const disputeResult = await this.validateDispute(
          new PublicKey(createResult.escrowPda!),
          params.agent,
          'simulation_evidence'
        );
        stages.push({ name: 'dispute', success: disputeResult.success, computeUnits: disputeResult.computeUnits });
        totalComputeUnits += disputeResult.computeUnits;
      } else {
        // Time travel to expiry
        await this.rpcCall('surfpool_advanceTime', [604800]); // 7 days

        const expireResult = await this.rpcCall<{ success: boolean; computeUnits: number }>('surfpool_simulateExpire', [
          createResult.escrowPda,
        ]);
        stages.push({ name: 'expire', success: expireResult?.success ?? false, computeUnits: expireResult?.computeUnits ?? 0 });
        totalComputeUnits += expireResult?.computeUnits ?? 0;
      }

      const allSuccess = stages.every(s => s.success);
      return { success: allSuccess, stages, totalComputeUnits };
    } catch (err) {
      return {
        success: false,
        stages,
        totalComputeUnits,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Backtest an AI agent strategy against historical mainnet state
   */
  async backtestStrategy(params: {
    strategy: (state: unknown) => Promise<Transaction[]>;
    startSlot: number;
    endSlot: number;
    stepSize: number;
  }): Promise<{
    success: boolean;
    results: { slot: number; pnl: number; gasUsed: number; txCount: number }[];
    summary: { totalPnl: number; totalGas: number; winRate: number };
  }> {
    const results: { slot: number; pnl: number; gasUsed: number; txCount: number }[] = [];

    try {
      // Create a fresh fork
      await this.rpcCall('surfpool_createFork', [MAINNET_RPC]);

      for (let slot = params.startSlot; slot <= params.endSlot; slot += params.stepSize) {
        // Warp to historical slot
        await this.rpcCall('surfpool_warpToSlot', [slot]);

        // Get current state
        const state = await this.rpcCall('surfpool_getState', []);

        // Execute strategy
        const txs = await params.strategy(state);
        let slotPnl = 0;
        let slotGas = 0;

        for (const tx of txs) {
          const sim = await this.simulateTransaction(tx);
          slotGas += sim.computeUnits;
          // PnL calculation would be strategy-specific
        }

        results.push({ slot, pnl: slotPnl, gasUsed: slotGas, txCount: txs.length });
      }

      const totalPnl = results.reduce((sum, r) => sum + r.pnl, 0);
      const totalGas = results.reduce((sum, r) => sum + r.gasUsed, 0);
      const winRate = results.filter(r => r.pnl > 0).length / results.length;

      return {
        success: true,
        results,
        summary: { totalPnl, totalGas, winRate },
      };
    } catch (err) {
      return {
        success: false,
        results,
        summary: { totalPnl: 0, totalGas: 0, winRate: 0 },
      };
    }
  }

  // Private helpers

  private async forkMainnetState(): Promise<void> {
    await this.rpcCall('surfpool_createFork', [MAINNET_RPC]);
  }

  private extractAccounts(transaction: Transaction | VersionedTransaction): string[] {
    if ('message' in transaction && 'staticAccountKeys' in transaction.message) {
      // VersionedTransaction
      return transaction.message.staticAccountKeys.map(k => k.toBase58());
    }
    // Legacy Transaction
    const tx = transaction as Transaction;
    const accounts = new Set<string>();
    for (const ix of tx.instructions) {
      accounts.add(ix.programId.toBase58());
      for (const key of ix.keys) {
        accounts.add(key.pubkey.toBase58());
      }
    }
    return Array.from(accounts);
  }

  private async cloneAccounts(accounts: string[]): Promise<void> {
    await this.rpcCall('surfpool_cloneAccounts', [accounts]);
  }

  private async simulateTransaction(
    transaction: Transaction | VersionedTransaction
  ): Promise<{ success: boolean; computeUnits: number; logs: string[]; error?: string }> {
    try {
      const serialized = transaction.serialize({ requireAllSignatures: false });
      const result = await this.surfpoolConnection.simulateTransaction(
        transaction as VersionedTransaction,
        { commitment: 'confirmed' }
      );

      return {
        success: !result.value.err,
        computeUnits: result.value.unitsConsumed || 0,
        logs: result.value.logs || [],
        error: result.value.err ? JSON.stringify(result.value.err) : undefined,
      };
    } catch (err) {
      return {
        success: false,
        computeUnits: 0,
        logs: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async analyzeStateChanges(
    transaction: Transaction | VersionedTransaction,
    accounts: string[]
  ): Promise<StateChange[]> {
    const changes: StateChange[] = [];

    // Get before state
    const beforeStates = new Map<string, { balance: number; data: string }>();
    for (const account of accounts.slice(0, 10)) { // Limit to 10 accounts
      try {
        const info = await this.surfpoolConnection.getAccountInfo(new PublicKey(account));
        beforeStates.set(account, {
          balance: info?.lamports || 0,
          data: info?.data.toString('base64') || '',
        });
      } catch {}
    }

    // Simulate and get after state
    await this.simulateTransaction(transaction);

    for (const [account, before] of beforeStates) {
      try {
        const info = await this.surfpoolConnection.getAccountInfo(new PublicKey(account));
        const afterBalance = info?.lamports || 0;
        const afterData = info?.data.toString('base64') || '';

        if (before.balance !== afterBalance) {
          changes.push({
            account,
            before: before.balance.toString(),
            after: afterBalance.toString(),
            type: 'balance',
          });
        }

        if (before.data !== afterData) {
          changes.push({
            account,
            before: before.data.slice(0, 32) + '...',
            after: afterData.slice(0, 32) + '...',
            type: 'data',
          });
        }
      } catch {}
    }

    return changes;
  }

  private assessMevRisk(
    transaction: Transaction | VersionedTransaction,
    stateChanges: StateChange[]
  ): MevRiskAssessment {
    const reasons: string[] = [];
    const recommendations: string[] = [];

    // Check for large value transfers
    const largeTransfers = stateChanges.filter(
      c => c.type === 'balance' && Math.abs(parseInt(c.after) - parseInt(c.before)) > 1_000_000_000 // 1 SOL
    );

    if (largeTransfers.length > 0) {
      reasons.push('Large value transfer detected');
      recommendations.push('Consider using Jito bundles for MEV protection');
    }

    // Check for DEX interactions (simplified)
    const accounts = this.extractAccounts(transaction);
    const dexPrograms = [
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
    ];

    if (accounts.some(a => dexPrograms.includes(a))) {
      reasons.push('DEX interaction detected');
      recommendations.push('Use private mempool or Jito for swap protection');
    }

    let risk: 'low' | 'medium' | 'high' = 'low';
    if (reasons.length >= 2) risk = 'high';
    else if (reasons.length === 1) risk = 'medium';

    return { risk, reasons, recommendations };
  }

  private async rpcCall<T>(method: string, params: unknown[] = []): Promise<T | null> {
    try {
      const response = await fetch(SURFPOOL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        }),
      });

      const data = await response.json() as SurfpoolRpcResponse<T>;
      if (data.error) {
        logger.warn('Surfpool RPC error', { method, error: data.error });
        return null;
      }

      return data.result ?? null;
    } catch (err) {
      logger.error('Surfpool RPC call failed', { method, error: String(err) });
      return null;
    }
  }

  /**
   * Health check for Surfpool connection
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const version = await this.surfpoolConnection.getVersion();
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}

// Singleton instance
export const preflightService = new SurfpoolPreflightService();

// Express middleware for automatic preflight validation
export function preflightMiddleware() {
  return async (req: any, res: any, next: any) => {
    // Only validate POST requests with transaction data
    if (req.method !== 'POST' || !req.body?.transaction) {
      return next();
    }

    try {
      const txData = Buffer.from(req.body.transaction, 'base64');
      const transaction = VersionedTransaction.deserialize(txData);

      const result = await preflightService.validateTransaction(transaction);

      if (!result.success) {
        return res.status(400).json({
          error: 'Preflight validation failed',
          details: result.error,
          mevRisk: result.mevRisk,
        });
      }

      // Attach preflight result to request
      req.preflightResult = result;
      next();
    } catch (err) {
      logger.error('Preflight middleware error', { error: String(err) });
      next(); // Continue even if preflight fails
    }
  };
}
