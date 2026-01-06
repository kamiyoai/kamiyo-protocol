/**
 * Monad JSON-RPC provider with parallel execution support
 */

import { ethers } from 'ethers';
import {
  MonadNetwork,
  MonadProviderConfig,
  NetworkConfig,
  NETWORKS,
  MonadError,
} from './types';

const DEFAULT_TIMEOUT = 30_000;

export class MonadProvider {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly signer: ethers.Wallet | null;
  private readonly network: MonadNetwork;
  private readonly config: NetworkConfig;

  constructor(options: MonadProviderConfig) {
    this.network = options.network;
    this.config = NETWORKS[options.network];

    const rpcUrl = options.rpcUrl || this.config.rpc;
    this.provider = new ethers.JsonRpcProvider(rpcUrl, {
      chainId: this.config.chainId,
      name: options.network,
    });

    this.signer = options.privateKey
      ? new ethers.Wallet(options.privateKey, this.provider)
      : null;
  }

  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  getSigner(): ethers.Wallet {
    if (!this.signer) {
      throw new MonadError('No signer configured', 'INVALID_CONFIG');
    }
    return this.signer;
  }

  getNetwork(): MonadNetwork {
    return this.network;
  }

  getContracts(): NetworkConfig['contracts'] {
    return this.config.contracts;
  }

  async getStateRoot(): Promise<string> {
    const block = await this.provider.getBlock('latest');
    if (!block) {
      throw new MonadError('Failed to fetch latest block', 'NETWORK_ERROR');
    }
    return block.stateRoot || block.hash || '';
  }

  async getBlockNumber(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  async getBalance(address: string): Promise<bigint> {
    return this.provider.getBalance(address);
  }

  async estimateGas(tx: ethers.TransactionRequest): Promise<bigint> {
    return this.provider.estimateGas(tx);
  }

  async call(tx: ethers.TransactionRequest): Promise<string> {
    return this.provider.call(tx);
  }

  async sendTransaction(
    tx: ethers.TransactionRequest
  ): Promise<ethers.TransactionResponse> {
    const signer = this.getSigner();
    return signer.sendTransaction(tx);
  }

  /**
   * Fork current state for parallel simulation.
   * Monad's optimistic execution allows concurrent state access.
   */
  async forkState(blockNumber?: number): Promise<string> {
    const block = await this.provider.getBlock(blockNumber || 'latest');
    if (!block) {
      throw new MonadError('Failed to fork state', 'NETWORK_ERROR');
    }
    return block.stateRoot || block.hash || '';
  }

  /**
   * Execute multiple calls in parallel.
   * Leverages Monad's parallel execution for concurrent reads.
   */
  async parallelCall(
    calls: ethers.TransactionRequest[]
  ): Promise<string[]> {
    return Promise.all(calls.map((tx) => this.provider.call(tx)));
  }

  /**
   * Get transaction explorer URL
   */
  explorerUrl(txHash: string): string {
    return `${this.config.explorer}/tx/${txHash}`;
  }

  /**
   * Get address explorer URL
   */
  addressUrl(address: string): string {
    return `${this.config.explorer}/address/${address}`;
  }

  async health(): Promise<{ ok: boolean; latency: number; blockNumber: number }> {
    const start = Date.now();
    try {
      const blockNumber = await this.provider.getBlockNumber();
      return {
        ok: true,
        latency: Date.now() - start,
        blockNumber,
      };
    } catch {
      return {
        ok: false,
        latency: Date.now() - start,
        blockNumber: 0,
      };
    }
  }
}

export function createMonadProvider(
  network: MonadNetwork,
  options?: Partial<Omit<MonadProviderConfig, 'network'>>
): MonadProvider {
  return new MonadProvider({ network, ...options });
}
