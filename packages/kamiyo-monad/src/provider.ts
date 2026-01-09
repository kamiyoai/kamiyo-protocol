import { ethers } from 'ethers';
import { MonadNetwork, MonadProviderConfig, NetworkConfig, NETWORKS, MonadError } from './types';

export class MonadProvider {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly signer: ethers.Wallet | null;
  private readonly network: MonadNetwork;
  private readonly config: NetworkConfig;

  constructor(opts: MonadProviderConfig) {
    this.network = opts.network;
    this.config = NETWORKS[opts.network];

    this.provider = new ethers.JsonRpcProvider(opts.rpcUrl || this.config.rpc, {
      chainId: this.config.chainId,
      name: opts.network,
    });

    this.signer = opts.privateKey ? new ethers.Wallet(opts.privateKey, this.provider) : null;
  }

  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  getSigner(): ethers.Wallet {
    if (!this.signer) throw new MonadError('No signer configured', 'INVALID_CONFIG');
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
    if (!block) throw new MonadError('Failed to fetch latest block', 'NETWORK_ERROR');
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

  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    return this.getSigner().sendTransaction(tx);
  }

  async forkState(blockNumber?: number): Promise<string> {
    const block = await this.provider.getBlock(blockNumber || 'latest');
    if (!block) throw new MonadError('Failed to fork state', 'NETWORK_ERROR');
    return block.stateRoot || block.hash || '';
  }

  async parallelCall(calls: ethers.TransactionRequest[]): Promise<string[]> {
    return Promise.all(calls.map((tx) => this.provider.call(tx)));
  }

  explorerUrl(txHash: string): string {
    return `${this.config.explorer}/tx/${txHash}`;
  }

  addressUrl(address: string): string {
    return `${this.config.explorer}/address/${address}`;
  }

  async health(): Promise<{ ok: boolean; latency: number; block: number }> {
    const t0 = Date.now();
    try {
      const block = await this.provider.getBlockNumber();
      return { ok: true, latency: Date.now() - t0, block };
    } catch {
      return { ok: false, latency: Date.now() - t0, block: 0 };
    }
  }
}

export function createMonadProvider(
  network: MonadNetwork,
  opts?: Partial<Omit<MonadProviderConfig, 'network'>>
): MonadProvider {
  return new MonadProvider({ network, ...opts });
}
