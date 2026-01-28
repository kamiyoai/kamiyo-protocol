/**
 * Dispute Oracle Service
 *
 * Monitors copy positions, updates values from L1, and helps resolve disputes.
 * Position value updates are signed to prevent manipulation.
 */

import { ethers, Contract, Wallet } from 'ethers';
import { HyperliquidClient, HyperliquidClientConfig } from './client';
import { HyperliquidExchange } from './exchange';
import { getLogger, Logger } from './logger';
import { VAULT_ORACLE_ABI } from './abis';

export interface OracleConfig extends HyperliquidClientConfig {
  updateInterval?: number;
  walletPrivateKey?: string;
  trustedOracles?: string[]; // Addresses of trusted oracle signers
  requiredSignatures?: number; // Number of signatures required (default: 1)
}

export interface SignedValueUpdate {
  positionId: bigint;
  newValue: bigint;
  timestamp: number;
  nonce: bigint;
  signature: string;
  signer: string;
}

export interface PositionValueUpdate {
  positionId: bigint;
  agentAddress: string;
  oldValue: bigint;
  newValue: bigint;
  timestamp: number;
  signature?: string;
}

export interface DisputeEvaluation {
  disputeId: bigint;
  positionId: bigint;
  expectedReturnBps: number;
  actualReturnBps: number;
  userShouldWin: boolean;
  reason: string;
}

const UPDATE_DOMAIN = {
  name: 'KamiyoVaultOracle',
  version: '1',
  chainId: 999,
};

const UPDATE_TYPES = {
  PositionUpdate: [
    { name: 'positionId', type: 'uint256' },
    { name: 'newValue', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
};

export class DisputeOracle {
  private client: HyperliquidClient;
  private exchange: HyperliquidExchange | null = null;
  private vaultContract: Contract;
  private wallet: Wallet | null = null;
  private updateInterval: number;
  private running = false;
  private updateTimer: NodeJS.Timeout | null = null;
  private logger: Logger;
  private trustedOracles: Set<string>;
  private requiredSignatures: number;
  private nonces: Map<string, bigint> = new Map();

  constructor(config: OracleConfig) {
    this.client = new HyperliquidClient(config);
    this.updateInterval = config.updateInterval || 60000;
    this.logger = getLogger();
    this.trustedOracles = new Set((config.trustedOracles || []).map(a => a.toLowerCase()));
    this.requiredSignatures = config.requiredSignatures || 1;

    const networkConfig = this.client.getNetworkConfig();
    const provider = new ethers.JsonRpcProvider(networkConfig.rpc);

    if (config.walletPrivateKey) {
      this.wallet = new ethers.Wallet(config.walletPrivateKey, provider);
      this.trustedOracles.add(this.wallet.address.toLowerCase());
      this.exchange = new HyperliquidExchange({
        wallet: this.wallet as any,
        network: config.network,
      });
    }

    this.vaultContract = new Contract(
      networkConfig.contracts.kamiyoVault,
      VAULT_ORACLE_ABI,
      this.wallet || provider
    );
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.logger.info('Starting dispute oracle service');
    this.logger.info(`Trusted oracles: ${Array.from(this.trustedOracles).join(', ')}`);

    if (this.exchange) {
      await this.exchange.init();
      this.logger.info('Exchange connection initialized');
    }

    await this.updateAllPositions();

    this.updateTimer = setInterval(() => {
      this.updateAllPositions().catch((err) => this.logger.error('Position update failed', err));
    }, this.updateInterval);
  }

  stop(): void {
    this.running = false;
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    this.logger.info('Oracle stopped');
  }

  /**
   * Sign a position value update
   */
  async signValueUpdate(positionId: bigint, newValue: bigint): Promise<SignedValueUpdate> {
    if (!this.wallet) {
      throw new Error('Wallet required to sign updates');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const nonceKey = positionId.toString();
    const nonce = (this.nonces.get(nonceKey) || 0n) + 1n;
    this.nonces.set(nonceKey, nonce);

    const message = {
      positionId,
      newValue,
      timestamp,
      nonce,
    };

    const signature = await this.wallet.signTypedData(UPDATE_DOMAIN, UPDATE_TYPES, message);

    return {
      positionId,
      newValue,
      timestamp,
      nonce,
      signature,
      signer: this.wallet.address,
    };
  }

  /**
   * Verify a signed position value update
   */
  verifyValueUpdate(update: SignedValueUpdate): boolean {
    try {
      const message = {
        positionId: update.positionId,
        newValue: update.newValue,
        timestamp: update.timestamp,
        nonce: update.nonce,
      };

      const recoveredAddress = ethers.verifyTypedData(
        UPDATE_DOMAIN,
        UPDATE_TYPES,
        message,
        update.signature
      );

      if (!this.trustedOracles.has(recoveredAddress.toLowerCase())) {
        this.logger.error(`Untrusted oracle: ${recoveredAddress}`);
        return false;
      }

      // Check timestamp freshness (5 minute window)
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - update.timestamp) > 300) {
        this.logger.error(`Stale update: timestamp ${update.timestamp}`);
        return false;
      }

      return true;
    } catch (err) {
      this.logger.error('Signature verification failed', err);
      return false;
    }
  }

  /**
   * Add a trusted oracle address
   */
  addTrustedOracle(address: string): void {
    this.trustedOracles.add(address.toLowerCase());
  }

  /**
   * Remove a trusted oracle address
   */
  removeTrustedOracle(address: string): void {
    this.trustedOracles.delete(address.toLowerCase());
  }

  /**
   * Check if an address is a trusted oracle
   */
  isTrustedOracle(address: string): boolean {
    return this.trustedOracles.has(address.toLowerCase());
  }

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
          const summary = await this.client.getL1AccountSummary(position.agent);
          const depositValue = position.deposit;
          const pnlRatio = summary.accountValue > 0n
            ? summary.totalPnl * 10000n / summary.accountValue
            : 0n;
          const newValue = depositValue + (depositValue * pnlRatio / 10000n);

          if (newValue !== position.currentValue) {
            // Sign the update
            const signedUpdate = await this.signValueUpdate(i, newValue);

            positionIds.push(i);
            newValues.push(newValue);

            updates.push({
              positionId: i,
              agentAddress: position.agent,
              oldValue: position.currentValue,
              newValue,
              timestamp: Date.now(),
              signature: signedUpdate.signature,
            });
          }
        } catch (err) {
          this.logger.error(`Failed to get L1 data for position ${i}`, err);
        }
      }

      if (positionIds.length > 0) {
        await this.vaultContract.batchUpdatePositionValues(positionIds, newValues);
        this.logger.info(`Updated ${positionIds.length} position values`);
      }
    } catch (err) {
      this.logger.error('Failed to update positions', err);
    }

    return updates;
  }

  async evaluateDispute(disputeId: bigint): Promise<DisputeEvaluation> {
    const dispute = await this.vaultContract.getDispute(disputeId);
    const position = await this.vaultContract.getPosition(dispute.positionId);
    const summary = await this.client.getL1AccountSummary(position.agent);

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

export async function createOracle(config: OracleConfig): Promise<DisputeOracle> {
  const oracle = new DisputeOracle(config);
  await oracle.start();
  return oracle;
}
