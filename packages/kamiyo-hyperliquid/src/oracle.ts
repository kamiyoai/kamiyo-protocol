/**
 * Dispute Oracle Service
 *
 * Monitors copy positions, updates values from L1, and helps resolve disputes.
 * This service should be run by the dispute resolver.
 */

import { ethers, Contract } from 'ethers';
import { HyperliquidClient, HyperliquidClientConfig } from './client';
import { HyperliquidExchange } from './exchange';
import { getLogger, Logger } from './logger';
import { VAULT_ORACLE_ABI } from './abis';

export interface OracleConfig extends HyperliquidClientConfig {
  updateInterval?: number; // ms between position value updates
  walletPrivateKey?: string;
}

export interface PositionValueUpdate {
  positionId: bigint;
  agentAddress: string;
  oldValue: bigint;
  newValue: bigint;
  timestamp: number;
}

export interface DisputeEvaluation {
  disputeId: bigint;
  positionId: bigint;
  expectedReturnBps: number;
  actualReturnBps: number;
  userShouldWin: boolean;
  reason: string;
}

export class DisputeOracle {
  private client: HyperliquidClient;
  private exchange: HyperliquidExchange | null = null;
  private vaultContract: Contract;
  private updateInterval: number;
  private running = false;
  private updateTimer: NodeJS.Timeout | null = null;
  private logger: Logger;

  constructor(config: OracleConfig) {
    this.client = new HyperliquidClient(config);
    this.updateInterval = config.updateInterval || 60000; // 1 minute default
    this.logger = getLogger();

    const networkConfig = this.client.getNetworkConfig();
    const provider = new ethers.JsonRpcProvider(networkConfig.rpc);
    const signerOrProvider = config.signer || provider;

    this.vaultContract = new Contract(
      networkConfig.contracts.kamiyoVault,
      VAULT_ORACLE_ABI,
      signerOrProvider
    );

    if (config.walletPrivateKey) {
      const wallet = new ethers.Wallet(config.walletPrivateKey, provider);
      this.exchange = new HyperliquidExchange({
        wallet: wallet as any,
        network: config.network,
      });
    }
  }

  /**
   * Start the oracle service
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.logger.info('Starting dispute oracle service');

    if (this.exchange) {
      await this.exchange.init();
      this.logger.info('Exchange connection initialized');
    }

    // Initial update
    await this.updateAllPositions();

    // Schedule periodic updates
    this.updateTimer = setInterval(() => {
      this.updateAllPositions().catch((err) => this.logger.error('Position update failed', err));
    }, this.updateInterval);
  }

  /**
   * Stop the oracle service
   */
  stop(): void {
    this.running = false;
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    this.logger.info('Oracle stopped');
  }

  /**
   * Update all active position values from L1
   */
  async updateAllPositions(): Promise<PositionValueUpdate[]> {
    const updates: PositionValueUpdate[] = [];

    try {
      const positionCount = await this.vaultContract.positionCount();

      const positionIds: bigint[] = [];
      const newValues: bigint[] = [];

      for (let i = 0n; i < positionCount; i++) {
        const position = await this.vaultContract.getPosition(i);

        if (!position.active) continue;

        try {
          // Get agent's L1 account summary
          const summary = await this.client.getL1AccountSummary(position.agent);

          // Calculate position value based on agent's total performance
          // Value = deposit * (1 + total_pnl_ratio)
          const depositValue = position.deposit;
          // Guard against division by zero (liquidated accounts)
          const pnlRatio = summary.accountValue > 0n
            ? summary.totalPnl * 10000n / summary.accountValue
            : 0n;
          const newValue = depositValue + (depositValue * pnlRatio / 10000n);

          if (newValue !== position.currentValue) {
            positionIds.push(i);
            newValues.push(newValue);

            updates.push({
              positionId: i,
              agentAddress: position.agent,
              oldValue: position.currentValue,
              newValue,
              timestamp: Date.now(),
            });
          }
        } catch (err) {
          this.logger.error(`Failed to get L1 data for position ${i}`, err);
        }
      }

      // Batch update if there are changes
      if (positionIds.length > 0) {
        await this.vaultContract.batchUpdatePositionValues(positionIds, newValues);
        this.logger.info(`Updated ${positionIds.length} position values`);
      }
    } catch (err) {
      this.logger.error('Failed to update positions', err);
    }

    return updates;
  }

  /**
   * Evaluate a dispute based on L1 data
   */
  async evaluateDispute(disputeId: bigint): Promise<DisputeEvaluation> {
    const dispute = await this.vaultContract.getDispute(disputeId);
    const position = await this.vaultContract.getPosition(dispute.positionId);

    // Get current L1 account summary for the agent
    const summary = await this.client.getL1AccountSummary(position.agent);

    // Calculate actual return
    const depositValue = position.deposit;
    // Guard against division by zero (liquidated accounts)
    const pnlRatio = summary.accountValue > 0n
      ? summary.totalPnl * 10000n / summary.accountValue
      : 0n;
    const actualReturnBps = Number(pnlRatio);
    const expectedReturnBps = Number(position.minReturnBps);

    const userShouldWin = actualReturnBps < expectedReturnBps;

    return {
      disputeId,
      positionId: dispute.positionId,
      expectedReturnBps,
      actualReturnBps,
      userShouldWin,
      reason: userShouldWin
        ? `Return ${actualReturnBps}bps below minimum ${expectedReturnBps}bps`
        : `Return ${actualReturnBps}bps meets minimum ${expectedReturnBps}bps`,
    };
  }

  /**
   * Resolve a dispute based on L1 verification
   */
  async resolveDispute(disputeId: bigint): Promise<{ success: boolean; evaluation: DisputeEvaluation }> {
    const evaluation = await this.evaluateDispute(disputeId);

    try {
      const tx = await this.vaultContract.resolveDispute(disputeId, evaluation.userShouldWin);
      await tx.wait();

      this.logger.info(`Resolved dispute ${disputeId}: user ${evaluation.userShouldWin ? 'won' : 'lost'}`);

      return { success: true, evaluation };
    } catch (err) {
      this.logger.error(`Failed to resolve dispute ${disputeId}`, err);
      return { success: false, evaluation };
    }
  }

  /**
   * Get all pending (unresolved) disputes
   */
  async getPendingDisputes(): Promise<Array<{ disputeId: bigint; dispute: any }>> {
    const pending: Array<{ disputeId: bigint; dispute: any }> = [];

    try {
      const disputeCount = await this.vaultContract.disputeCount();

      for (let i = 0n; i < disputeCount; i++) {
        const dispute = await this.vaultContract.getDispute(i);
        if (!dispute.resolved) {
          pending.push({ disputeId: i, dispute });
        }
      }
    } catch (err) {
      this.logger.error('Failed to get pending disputes', err);
    }

    return pending;
  }

  /**
   * Auto-resolve all pending disputes
   */
  async autoResolveDisputes(): Promise<number> {
    const pending = await this.getPendingDisputes();
    let resolved = 0;

    for (const { disputeId } of pending) {
      const result = await this.resolveDispute(disputeId);
      if (result.success) resolved++;
    }

    this.logger.info(`Auto-resolved ${resolved}/${pending.length} disputes`);
    return resolved;
  }
}

/**
 * Create and start an oracle instance
 */
export async function createOracle(config: OracleConfig): Promise<DisputeOracle> {
  const oracle = new DisputeOracle(config);
  await oracle.start();
  return oracle;
}
