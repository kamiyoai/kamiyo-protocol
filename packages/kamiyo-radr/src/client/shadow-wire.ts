/**
 * ShadowWire client wrapper with Kamiyo escrow integration.
 */

import { PublicKey, Connection } from '@solana/web3.js';
import type {
  ShadowWireConfig,
  ShadowToken,
  TransferType,
  ShieldedBalance,
  TransferResult,
  WalletAdapter,
  TOKEN_DECIMALS,
} from '../types';

export interface ShadowWireClientInterface {
  getBalance(wallet: string, token: ShadowToken): Promise<ShieldedBalance>;
  deposit(params: { wallet: string; amount: number; token: ShadowToken }): Promise<{ transaction: unknown }>;
  withdraw(params: { wallet: string; amount: number; token: ShadowToken }): Promise<{ transaction: unknown }>;
  transfer(params: {
    sender: string;
    recipient: string;
    amount: number;
    token: ShadowToken;
    type: TransferType;
  }): Promise<TransferResult>;
}

export class ShadowWireWrapper {
  private client: ShadowWireClientInterface | null = null;
  private config: ShadowWireConfig;
  private connection: Connection;
  private initialized = false;

  constructor(
    connection: Connection,
    config: ShadowWireConfig = {}
  ) {
    this.connection = connection;
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { ShadowWireClient } = await import('@radr/shadowwire');
      this.client = new ShadowWireClient({
        debug: this.config.debug ?? false,
      }) as unknown as ShadowWireClientInterface;
      this.initialized = true;
    } catch (err) {
      throw new Error(
        'Failed to initialize ShadowWire client. Ensure @radr/shadowwire is installed: npm install @radr/shadowwire'
      );
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new Error('ShadowWire client not initialized. Call initialize() first.');
    }
  }

  async getBalance(wallet: string, token: ShadowToken): Promise<ShieldedBalance> {
    this.ensureInitialized();

    try {
      const balance = await this.client!.getBalance(wallet, token);
      return {
        token,
        available: balance.available,
        poolAddress: balance.poolAddress,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(`Failed to get shielded balance: ${message}`);
    }
  }

  async deposit(params: {
    wallet: string;
    amount: number;
    token: ShadowToken;
  }): Promise<{ transaction: unknown }> {
    this.ensureInitialized();

    if (params.amount <= 0) {
      throw new Error('Deposit amount must be positive');
    }

    try {
      return await this.client!.deposit(params);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(`Failed to create deposit transaction: ${message}`);
    }
  }

  async withdraw(params: {
    wallet: string;
    amount: number;
    token: ShadowToken;
  }): Promise<{ transaction: unknown }> {
    this.ensureInitialized();

    if (params.amount <= 0) {
      throw new Error('Withdrawal amount must be positive');
    }

    try {
      return await this.client!.withdraw(params);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(`Failed to create withdrawal transaction: ${message}`);
    }
  }

  async transfer(params: {
    sender: string;
    recipient: string;
    amount: number;
    token: ShadowToken;
    type: TransferType;
    wallet?: WalletAdapter;
  }): Promise<TransferResult> {
    this.ensureInitialized();

    if (params.amount <= 0) {
      return { success: false, error: 'Transfer amount must be positive' };
    }

    if (params.sender === params.recipient) {
      return { success: false, error: 'Cannot transfer to self' };
    }

    // Validate addresses
    try {
      new PublicKey(params.sender);
      new PublicKey(params.recipient);
    } catch {
      return { success: false, error: 'Invalid Solana address' };
    }

    try {
      const result = await this.client!.transfer({
        sender: params.sender,
        recipient: params.recipient,
        amount: params.amount,
        token: params.token,
        type: params.type,
      });

      return {
        success: result.success,
        signature: result.signature,
        relayerFee: params.amount * 0.01,
        error: result.error,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async canReceiveInternal(recipient: string): Promise<boolean> {
    try {
      const balance = await this.getBalance(recipient, 'SOL');
      return balance.poolAddress !== '';
    } catch {
      return false;
    }
  }

  calculateRelayerFee(amount: number): number {
    return amount * 0.01;
  }

  getSupportedTokens(): ShadowToken[] {
    return [
      'SOL', 'RADR', 'USDC', 'USDT', 'ORE', 'BONK', 'GODL', 'ZEC',
      'JUP', 'PYTH', 'WIF', 'POPCAT', 'FARTCOIN', 'AI16Z', 'GRIFFAIN',
      'PENGU', 'USD1',
    ];
  }

  isTokenSupported(token: string): token is ShadowToken {
    return this.getSupportedTokens().includes(token as ShadowToken);
  }
}

export async function createShadowWireClient(
  connection: Connection,
  config?: ShadowWireConfig
): Promise<ShadowWireWrapper> {
  const client = new ShadowWireWrapper(connection, config);
  await client.initialize();
  return client;
}
