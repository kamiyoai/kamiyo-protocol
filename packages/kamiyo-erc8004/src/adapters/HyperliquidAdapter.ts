import { ethers } from 'ethers';
import { GlobalAgentId, TxResult, parseGlobalId } from '../types';
import { AGENT_REGISTRY_ADAPTER_ABI } from '../abis';

/**
 * Agent profile data from Hyperliquid
 */
export interface HyperliquidAgentProfile {
  owner: string;
  name: string;
  stake: bigint;
  registeredAt: number;
  totalTrades: number;
  totalPnl: bigint;
  copiers: number;
  successfulTrades: number;
  active: boolean;
  globalId: string;
  uri: string;
}

/**
 * Adapter client for Hyperliquid AgentRegistry ERC-8004 integration
 */
export class HyperliquidAdapter {
  private contract: ethers.Contract;
  private provider: ethers.Provider;

  constructor(
    address: string,
    providerOrSigner: ethers.Provider | ethers.Signer
  ) {
    if ('getAddress' in providerOrSigner) {
      this.provider = providerOrSigner.provider!;
      this.contract = new ethers.Contract(
        address,
        AGENT_REGISTRY_ADAPTER_ABI,
        providerOrSigner
      );
    } else {
      this.provider = providerOrSigner;
      this.contract = new ethers.Contract(
        address,
        AGENT_REGISTRY_ADAPTER_ABI,
        providerOrSigner
      );
    }
  }

  /**
   * Connect with a signer for write operations
   */
  connect(signer: ethers.Signer): HyperliquidAdapter {
    return new HyperliquidAdapter(this.contract.target as string, signer);
  }

  /**
   * Link local agent to canonical global ID
   */
  async linkToGlobalId(globalId: string): Promise<TxResult> {
    parseGlobalId(globalId);

    const tx = await this.contract.linkToGlobalId(globalId);
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Unlink agent from global ID
   */
  async unlinkGlobalId(): Promise<TxResult> {
    const tx = await this.contract.unlinkGlobalId();
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Get global ID for an agent address
   */
  async getAgentGlobalId(agentAddress: string): Promise<string> {
    return this.contract.agentGlobalId(agentAddress);
  }

  /**
   * Get agent address by global ID
   */
  async getAgentByGlobalId(globalId: string): Promise<string> {
    return this.contract.getAgentByGlobalId(globalId);
  }

  /**
   * Check if agent is linked
   */
  async isLinked(agentAddress: string): Promise<boolean> {
    return this.contract.isLinked(agentAddress);
  }

  /**
   * Set agent profile URI
   */
  async setAgentURI(uri: string): Promise<TxResult> {
    const tx = await this.contract.setAgentURI(uri);
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Get agent profile URI
   */
  async getAgentURI(agentAddress: string): Promise<string> {
    return this.contract.agentURI(agentAddress);
  }

  /**
   * Set metadata for agent
   */
  async setMetadata(key: string, value: Uint8Array): Promise<TxResult> {
    const tx = await this.contract.setMetadata(key, value);
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Get metadata for agent
   */
  async getMetadata(agentAddress: string, key: string): Promise<Uint8Array> {
    const result = await this.contract.getMetadata(agentAddress, key);
    return ethers.getBytes(result);
  }

  /**
   * Get agent wallet (always returns agent address on Hyperliquid)
   */
  async getAgentWallet(agentAddress: string): Promise<string> {
    return this.contract.getAgentWallet(agentAddress);
  }

  /**
   * Get full agent profile with ERC-8004 data
   */
  async getAgentFull(agentAddress: string): Promise<HyperliquidAgentProfile> {
    const result = await this.contract.getAgentFull(agentAddress);

    return {
      owner: result[0].owner,
      name: result[0].name,
      stake: result[0].stake,
      registeredAt: Number(result[0].registeredAt),
      totalTrades: Number(result[0].totalTrades),
      totalPnl: result[0].totalPnl,
      copiers: Number(result[0].copiers),
      successfulTrades: Number(result[0].successfulTrades),
      active: result[0].active,
      globalId: result[1],
      uri: result[2],
    };
  }

  /**
   * Build agent profile for external consumption
   */
  async buildAgentProfile(agentAddress: string): Promise<{
    name: string;
    wallet: string;
    stake: bigint;
    registeredAt: number;
    totalTrades: number;
    successfulTrades: number;
    active: boolean;
    globalId: string;
    uri: string;
  }> {
    const result = await this.contract.buildAgentProfile(agentAddress);

    return {
      name: result.name,
      wallet: result.wallet,
      stake: result.stake,
      registeredAt: Number(result.registeredAt),
      totalTrades: Number(result.totalTrades),
      successfulTrades: Number(result.successfulTrades),
      active: result.active,
      globalId: result.globalId,
      uri: result.uri,
    };
  }

  /**
   * Get linked agents with their global IDs
   */
  async getLinkedAgents(
    agentAddresses: string[]
  ): Promise<{ agents: string[]; globalIds: string[] }> {
    const result = await this.contract.getLinkedAgents(agentAddresses);

    return {
      agents: result.linkedAgents,
      globalIds: result.globalIds,
    };
  }

  /**
   * Resolve global ID to Hyperliquid agent details
   */
  async resolveGlobalId(
    globalId: string
  ): Promise<HyperliquidAgentProfile | null> {
    try {
      const agentAddress = await this.getAgentByGlobalId(globalId);
      if (agentAddress === ethers.ZeroAddress) {
        return null;
      }
      return this.getAgentFull(agentAddress);
    } catch {
      return null;
    }
  }

  /**
   * Get contract address
   */
  get address(): string {
    return this.contract.target as string;
  }
}
