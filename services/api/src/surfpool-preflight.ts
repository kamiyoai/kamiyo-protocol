/**
 * Surfpool Production Preflight Service
 *
 * Every KAMIYO transaction is simulated through Surfpool before mainnet submission.
 */

import { Connection, Transaction, VersionedTransaction, PublicKey } from '@solana/web3.js';
import { logger } from './logger';

// Configuration with validation
const SURFPOOL_URL = process.env.SURFPOOL_URL || 'http://localhost:8899';
const MAINNET_RPC = process.env.SOLANA_RPC_URL;
const PREFLIGHT_ENABLED = process.env.PREFLIGHT_ENABLED !== 'false';

// Retry configuration
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000;

// Circuit breaker configuration
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 30000;

// MEV detection thresholds
const LARGE_TRANSFER_THRESHOLD = 1_000_000_000; // 1 SOL
const MAX_ACCOUNTS_TO_ANALYZE = 20;

// Known DEX programs for MEV risk assessment
const DEX_PROGRAMS = new Set([
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter v6
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB', // Jupiter v4
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca Whirlpool
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP', // Orca v2
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', // Meteora DLMM
  'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB', // Meteora Pools
  'MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2HKky', // Mercurial
]);

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

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

class SurfpoolPreflightService {
  private surfpoolConnection: Connection;
  private mainnetConnection: Connection | null;
  private enabled: boolean;
  private circuitBreaker: CircuitBreakerState;
  private requestId: number = 0;

  constructor() {
    this.surfpoolConnection = new Connection(SURFPOOL_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: REQUEST_TIMEOUT_MS,
    });

    this.mainnetConnection = MAINNET_RPC
      ? new Connection(MAINNET_RPC, 'confirmed')
      : null;

    this.enabled = PREFLIGHT_ENABLED;

    this.circuitBreaker = {
      failures: 0,
      lastFailure: 0,
      isOpen: false,
    };

    if (!MAINNET_RPC && PREFLIGHT_ENABLED) {
      logger.warn('SOLANA_RPC_URL not set, mainnet fork features disabled');
    }

    if (this.enabled) {
      logger.info('Surfpool preflight service initialized', {
        url: SURFPOOL_URL,
        mainnetRpc: MAINNET_RPC ? 'configured' : 'not configured',
      });
    } else {
      logger.warn('Surfpool preflight service DISABLED');
    }
  }

  /**
   * Validate a transaction before mainnet submission
   */
  async validateTransaction(
    transaction: Transaction | VersionedTransaction,
    _signers?: string[]
  ): Promise<PreflightResult> {
    if (!this.enabled) {
      return {
        success: true,
        simulationSuccess: true,
        computeUnits: 0,
        logs: ['Preflight disabled'],
      };
    }

    if (this.isCircuitOpen()) {
      logger.warn('Circuit breaker open, skipping preflight');
      return {
        success: true,
        simulationSuccess: true,
        computeUnits: 0,
        logs: ['Circuit breaker open - preflight skipped'],
      };
    }

    const startTime = Date.now();
    const requestId = `pf-${++this.requestId}`;

    try {
      // Step 1: Fork current mainnet state
      if (this.mainnetConnection) {
        await this.forkMainnetState();
      }

      // Step 2: Clone relevant accounts
      const accounts = this.extractAccounts(transaction);
      if (accounts.length > 0 && this.mainnetConnection) {
        await this.cloneAccounts(accounts);
      }

      // Step 3: Simulate transaction
      const simulation = await this.simulateTransaction(transaction);

      // Step 4: Analyze state changes
      const stateChanges = await this.analyzeStateChanges(transaction, accounts);

      // Step 5: Assess MEV risk
      const mevRisk = this.assessMevRisk(transaction, stateChanges);

      const latencyMs = Date.now() - startTime;
      logger.info('Preflight validation complete', {
        requestId,
        success: simulation.success,
        computeUnits: simulation.computeUnits,
        mevRisk: mevRisk.risk,
        latencyMs,
        accountsAnalyzed: accounts.length,
      });

      this.recordSuccess();

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
      const latencyMs = Date.now() - startTime;

      logger.error('Preflight validation failed', {
        requestId,
        error,
        latencyMs,
      });

      this.recordFailure();

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
    // Input validation
    if (amount <= 0) {
      return {
        success: false,
        simulationSuccess: false,
        computeUnits: 0,
        logs: [],
        error: 'Amount must be positive',
      };
    }

    if (amount > 1_000_000_000_000) {
      return {
        success: false,
        simulationSuccess: false,
        computeUnits: 0,
        logs: [],
        error: 'Amount exceeds maximum (1000 SOL)',
      };
    }

    const result = await this.rpcCallWithRetry<{ valid: boolean; escrowPda: string; error?: string }>(
      'surfpool_validateEscrowCreation',
      [agentId.toBase58(), counterparty.toBase58(), amount, token.toBase58()]
    );

    if (!result) {
      return {
        success: false,
        simulationSuccess: false,
        computeUnits: 0,
        logs: [],
        error: 'Surfpool RPC call failed after retries',
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
    // Input validation
    if (!evidence || evidence.length === 0) {
      return {
        success: false,
        simulationSuccess: false,
        computeUnits: 0,
        logs: [],
        error: 'Evidence is required',
      };
    }

    if (evidence.length > 10000) {
      return {
        success: false,
        simulationSuccess: false,
        computeUnits: 0,
        logs: [],
        error: 'Evidence exceeds maximum length (10000 chars)',
      };
    }

    const result = await this.rpcCallWithRetry<{ valid: boolean; error?: string }>(
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
      stages.push({
        name: 'create_escrow',
        success: createResult.success,
        computeUnits: createResult.computeUnits,
      });
      totalComputeUnits += createResult.computeUnits;

      if (!createResult.success) {
        return { success: false, stages, totalComputeUnits, error: createResult.error };
      }

      // Stage 2: Fund escrow
      const fundResult = await this.rpcCallWithRetry<{ success: boolean; computeUnits: number }>(
        'surfpool_simulateFundEscrow',
        [createResult.escrowPda, params.amount]
      );
      stages.push({
        name: 'fund_escrow',
        success: fundResult?.success ?? false,
        computeUnits: fundResult?.computeUnits ?? 0,
      });
      totalComputeUnits += fundResult?.computeUnits ?? 0;

      if (!fundResult?.success) {
        return { success: false, stages, totalComputeUnits, error: 'Failed to fund escrow' };
      }

      // Stage 3: Completion path
      if (params.completionPath === 'release') {
        const releaseResult = await this.rpcCallWithRetry<{ success: boolean; computeUnits: number }>(
          'surfpool_simulateRelease',
          [createResult.escrowPda]
        );
        stages.push({
          name: 'release',
          success: releaseResult?.success ?? false,
          computeUnits: releaseResult?.computeUnits ?? 0,
        });
        totalComputeUnits += releaseResult?.computeUnits ?? 0;
      } else if (params.completionPath === 'dispute') {
        await this.rpcCallWithRetry('surfpool_advanceTime', [86400]);

        const disputeResult = await this.validateDispute(
          new PublicKey(createResult.escrowPda!),
          params.agent,
          'simulation_evidence'
        );
        stages.push({
          name: 'dispute',
          success: disputeResult.success,
          computeUnits: disputeResult.computeUnits,
        });
        totalComputeUnits += disputeResult.computeUnits;
      } else {
        await this.rpcCallWithRetry('surfpool_advanceTime', [604800]);

        const expireResult = await this.rpcCallWithRetry<{ success: boolean; computeUnits: number }>(
          'surfpool_simulateExpire',
          [createResult.escrowPda]
        );
        stages.push({
          name: 'expire',
          success: expireResult?.success ?? false,
          computeUnits: expireResult?.computeUnits ?? 0,
        });
        totalComputeUnits += expireResult?.computeUnits ?? 0;
      }

      const allSuccess = stages.every(s => s.success);
      return { success: allSuccess, stages, totalComputeUnits };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error('Escrow lifecycle simulation failed', { error, stages });
      return { success: false, stages, totalComputeUnits, error };
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
    pnlCalculator?: (tx: Transaction, sim: { computeUnits: number }) => number;
  }): Promise<{
    success: boolean;
    results: { slot: number; pnl: number; gasUsed: number; txCount: number }[];
    summary: { totalPnl: number; totalGas: number; winRate: number };
  }> {
    if (!MAINNET_RPC) {
      return {
        success: false,
        results: [],
        summary: { totalPnl: 0, totalGas: 0, winRate: 0 },
      };
    }

    const results: { slot: number; pnl: number; gasUsed: number; txCount: number }[] = [];

    try {
      await this.rpcCallWithRetry('surfpool_createFork', [MAINNET_RPC]);

      const totalSlots = Math.ceil((params.endSlot - params.startSlot) / params.stepSize);
      let completedSlots = 0;

      for (let slot = params.startSlot; slot <= params.endSlot; slot += params.stepSize) {
        await this.rpcCallWithRetry('surfpool_warpToSlot', [slot]);
        const state = await this.rpcCallWithRetry('surfpool_getState', []);

        const txs = await params.strategy(state);
        let slotPnl = 0;
        let slotGas = 0;

        for (const tx of txs) {
          const sim = await this.simulateTransaction(tx);
          slotGas += sim.computeUnits;

          if (params.pnlCalculator) {
            slotPnl += params.pnlCalculator(tx, sim);
          }
        }

        results.push({ slot, pnl: slotPnl, gasUsed: slotGas, txCount: txs.length });
        completedSlots++;

        if (completedSlots % 10 === 0) {
          logger.info('Backtest progress', {
            completed: completedSlots,
            total: totalSlots,
            percent: Math.round((completedSlots / totalSlots) * 100),
          });
        }
      }

      const totalPnl = results.reduce((sum, r) => sum + r.pnl, 0);
      const totalGas = results.reduce((sum, r) => sum + r.gasUsed, 0);
      const winningSlots = results.filter(r => r.pnl > 0).length;
      const winRate = results.length > 0 ? winningSlots / results.length : 0;

      logger.info('Backtest complete', {
        slotsAnalyzed: results.length,
        totalPnl,
        totalGas,
        winRate: `${(winRate * 100).toFixed(2)}%`,
      });

      return {
        success: true,
        results,
        summary: { totalPnl, totalGas, winRate },
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error('Backtest failed', { error, resultsCollected: results.length });
      return {
        success: false,
        results,
        summary: { totalPnl: 0, totalGas: 0, winRate: 0 },
      };
    }
  }

  /**
   * Health check for Surfpool connection
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; circuitBreakerOpen: boolean }> {
    const start = Date.now();
    try {
      await this.surfpoolConnection.getVersion();
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        circuitBreakerOpen: this.circuitBreaker.isOpen,
      };
    } catch (err) {
      logger.warn('Health check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        circuitBreakerOpen: this.circuitBreaker.isOpen,
      };
    }
  }

  // Circuit breaker methods

  private isCircuitOpen(): boolean {
    if (!this.circuitBreaker.isOpen) {
      return false;
    }

    const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailure;
    if (timeSinceLastFailure > CIRCUIT_BREAKER_RESET_MS) {
      logger.info('Circuit breaker reset (half-open)');
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.failures = 0;
      return false;
    }

    return true;
  }

  private recordSuccess(): void {
    if (this.circuitBreaker.isOpen) {
      logger.info('Circuit breaker closed after successful request');
    }
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.isOpen = false;
  }

  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      logger.warn('Circuit breaker opened', {
        failures: this.circuitBreaker.failures,
        threshold: CIRCUIT_BREAKER_THRESHOLD,
      });
      this.circuitBreaker.isOpen = true;
    }
  }

  // Private helpers

  private async forkMainnetState(): Promise<void> {
    if (!MAINNET_RPC) {
      throw new Error('SOLANA_RPC_URL not configured');
    }
    await this.rpcCallWithRetry('surfpool_createFork', [MAINNET_RPC]);
  }

  private extractAccounts(transaction: Transaction | VersionedTransaction): string[] {
    if ('message' in transaction && 'staticAccountKeys' in transaction.message) {
      return transaction.message.staticAccountKeys.map(k => k.toBase58());
    }

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
    if (accounts.length === 0) return;
    await this.rpcCallWithRetry('surfpool_cloneAccounts', [accounts]);
  }

  private async simulateTransaction(
    transaction: Transaction | VersionedTransaction
  ): Promise<{ success: boolean; computeUnits: number; logs: string[]; error?: string }> {
    try {
      const result =
        transaction instanceof VersionedTransaction
          ? await this.surfpoolConnection.simulateTransaction(transaction, { commitment: 'confirmed' })
          : await this.surfpoolConnection.simulateTransaction(transaction);

      return {
        success: !result.value.err,
        computeUnits: result.value.unitsConsumed || 0,
        logs: result.value.logs || [],
        error: result.value.err ? JSON.stringify(result.value.err) : undefined,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn('Transaction simulation failed', { error });
      return {
        success: false,
        computeUnits: 0,
        logs: [],
        error,
      };
    }
  }

  private async analyzeStateChanges(
    transaction: Transaction | VersionedTransaction,
    accounts: string[]
  ): Promise<StateChange[]> {
    const changes: StateChange[] = [];
    const accountsToAnalyze = accounts.slice(0, MAX_ACCOUNTS_TO_ANALYZE);

    const beforeStates = new Map<string, { balance: number; data: string }>();

    for (const account of accountsToAnalyze) {
      try {
        const info = await this.surfpoolConnection.getAccountInfo(new PublicKey(account));
        beforeStates.set(account, {
          balance: info?.lamports || 0,
          data: info?.data.toString('base64') || '',
        });
      } catch (err) {
        logger.debug('Failed to get account info', {
          account,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await this.simulateTransaction(transaction);

    for (const [account, before] of beforeStates.entries()) {
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
      } catch (err) {
        logger.debug('Failed to get post-simulation account info', {
          account,
          error: err instanceof Error ? err.message : String(err),
        });
      }
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
    const largeTransfers = stateChanges.filter(c => {
      if (c.type !== 'balance') return false;
      const diff = Math.abs(parseInt(c.after) - parseInt(c.before));
      return diff > LARGE_TRANSFER_THRESHOLD;
    });

    if (largeTransfers.length > 0) {
      reasons.push(`Large value transfer detected (${largeTransfers.length} accounts)`);
      recommendations.push('Consider using Jito bundles for MEV protection');
    }

    // Check for DEX interactions
    const accounts = this.extractAccounts(transaction);
    const dexInteractions = accounts.filter(a => DEX_PROGRAMS.has(a));

    if (dexInteractions.length > 0) {
      reasons.push(`DEX interaction detected (${dexInteractions.length} programs)`);
      recommendations.push('Use private mempool or Jito for swap protection');
    }

    // Check for high account count (potential complex arbitrage)
    if (accounts.length > 15) {
      reasons.push('High account count may indicate complex arbitrage');
      recommendations.push('Monitor for front-running');
    }

    let risk: 'low' | 'medium' | 'high' = 'low';
    if (reasons.length >= 2 || (largeTransfers.length > 0 && dexInteractions.length > 0)) {
      risk = 'high';
    } else if (reasons.length === 1) {
      risk = 'medium';
    }

    return { risk, reasons, recommendations };
  }

  private async rpcCallWithRetry<T>(
    method: string,
    params: unknown[] = [],
    retries: number = MAX_RETRIES
  ): Promise<T | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const result = await this.rpcCall<T>(method, params);
        if (result !== null) {
          return result;
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn('RPC call failed, retrying', {
          method,
          attempt: attempt + 1,
          maxRetries: retries,
          error: lastError.message,
        });
      }

      if (attempt < retries - 1) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    logger.error('RPC call failed after all retries', {
      method,
      retries,
      error: lastError?.message,
    });
    return null;
  }

  private async rpcCall<T>(method: string, params: unknown[] = []): Promise<T | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(SURFPOOL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: ++this.requestId,
          method,
          params,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as SurfpoolRpcResponse<T>;
      if (data.error) {
        logger.warn('Surfpool RPC error', { method, error: data.error });
        return null;
      }

      return data.result ?? null;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        logger.error('Surfpool RPC timeout', { method, timeoutMs: REQUEST_TIMEOUT_MS });
      } else {
        logger.error('Surfpool RPC call failed', { method, error: String(err) });
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Singleton instance
export const preflightService = new SurfpoolPreflightService();

// Express middleware for automatic preflight validation
export function preflightMiddleware(options?: { failOpen?: boolean }) {
  const failOpen = options?.failOpen ?? false;

  return async (req: any, res: any, next: any) => {
    if (req.method !== 'POST' || !req.body?.transaction) {
      return next();
    }

    try {
      const txData = Buffer.from(req.body.transaction, 'base64');
      const transaction = VersionedTransaction.deserialize(txData);

      const result = await preflightService.validateTransaction(transaction);

      if (!result.success) {
        logger.warn('Preflight validation rejected transaction', {
          error: result.error,
          mevRisk: result.mevRisk?.risk,
        });

        return res.status(400).json({
          error: 'Preflight validation failed',
          details: result.error,
          mevRisk: result.mevRisk,
        });
      }

      req.preflightResult = result;
      next();
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error('Preflight middleware error', { error });

      if (failOpen) {
        logger.warn('Preflight failed but continuing (fail-open mode)');
        next();
      } else {
        return res.status(500).json({
          error: 'Preflight validation error',
          details: error,
        });
      }
    }
  };
}
