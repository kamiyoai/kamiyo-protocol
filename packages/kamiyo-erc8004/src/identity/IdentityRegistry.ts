import { ethers } from 'ethers';
import {
  RegisteredAgent,
  RegisterResult,
  MetadataEntry,
  TxResult,
  formatGlobalId,
  parseGlobalId,
  GlobalAgentId,
} from '../types';
import { ERC8004_IDENTITY_REGISTRY_ABI } from '../abis';

/**
 * Client for ERC-8004 Identity Registry (Base chain canonical)
 */
export class IdentityRegistry {
  private contract: ethers.Contract;
  private provider: ethers.Provider;
  private chainId: number;

  constructor(
    address: string,
    providerOrSigner: ethers.Provider | ethers.Signer,
    chainId: number
  ) {
    this.chainId = chainId;

    if ('getAddress' in providerOrSigner) {
      // It's a signer
      this.provider = providerOrSigner.provider!;
      this.contract = new ethers.Contract(
        address,
        ERC8004_IDENTITY_REGISTRY_ABI,
        providerOrSigner
      );
    } else {
      this.provider = providerOrSigner;
      this.contract = new ethers.Contract(
        address,
        ERC8004_IDENTITY_REGISTRY_ABI,
        providerOrSigner
      );
    }
  }

  /**
   * Connect with a signer for write operations
   */
  connect(signer: ethers.Signer): IdentityRegistry {
    return new IdentityRegistry(
      this.contract.target as string,
      signer,
      this.chainId
    );
  }

  // ============ Registration ============

  /**
   * Register a new agent with URI and metadata
   */
  async register(
    agentURI: string,
    metadata?: MetadataEntry[]
  ): Promise<RegisterResult> {
    let tx: ethers.TransactionResponse;

    if (metadata && metadata.length > 0) {
      const encodedMetadata = metadata.map((m) => ({
        key: m.key,
        value: m.value,
      }));
      tx = await this.contract['register(string,tuple[])'](
        agentURI,
        encodedMetadata
      );
    } else if (agentURI) {
      tx = await this.contract['register(string)'](agentURI);
    } else {
      tx = await this.contract['register()']();
    }

    const receipt = await tx.wait();
    if (!receipt) throw new Error('Transaction failed');

    // Parse Registered event
    const registeredEvent = receipt.logs.find((log) => {
      try {
        const parsed = this.contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        return parsed?.name === 'Registered';
      } catch {
        return false;
      }
    });

    if (!registeredEvent) throw new Error('Registration event not found');

    const parsed = this.contract.interface.parseLog({
      topics: registeredEvent.topics as string[],
      data: registeredEvent.data,
    });

    const agentId = parsed!.args[0] as bigint;

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      success: true,
      agentId,
      globalId: formatGlobalId(
        this.chainId,
        this.contract.target as string,
        agentId
      ),
    };
  }

  /**
   * Register with minimal data
   */
  async registerMinimal(): Promise<RegisterResult> {
    return this.register('');
  }

  // ============ URI Management ============

  /**
   * Update agent profile URI
   */
  async setAgentURI(agentId: bigint, newURI: string): Promise<TxResult> {
    const tx = await this.contract.setAgentURI(agentId, newURI);
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
  async getAgentURI(agentId: bigint): Promise<string> {
    return this.contract.tokenURI(agentId);
  }

  // ============ Metadata ============

  /**
   * Set metadata for an agent
   */
  async setMetadata(
    agentId: bigint,
    key: string,
    value: Uint8Array
  ): Promise<TxResult> {
    const tx = await this.contract.setMetadata(agentId, key, value);
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Get metadata for an agent
   */
  async getMetadata(agentId: bigint, key: string): Promise<Uint8Array> {
    const result = await this.contract.getMetadata(agentId, key);
    return ethers.getBytes(result);
  }

  /**
   * Get metadata as string
   */
  async getMetadataString(agentId: bigint, key: string): Promise<string> {
    const bytes = await this.getMetadata(agentId, key);
    return new TextDecoder().decode(bytes);
  }

  // ============ Wallet Management ============

  /**
   * Set agent wallet with EIP-712 signature
   */
  async setAgentWallet(
    agentId: bigint,
    newWallet: string,
    deadline: number,
    signature: string
  ): Promise<TxResult> {
    const tx = await this.contract.setAgentWallet(
      agentId,
      newWallet,
      deadline,
      signature
    );
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Get agent wallet address
   */
  async getAgentWallet(agentId: bigint): Promise<string> {
    return this.contract.getAgentWallet(agentId);
  }

  /**
   * Remove explicit wallet (reverts to owner)
   */
  async unsetAgentWallet(agentId: bigint): Promise<TxResult> {
    const tx = await this.contract.unsetAgentWallet(agentId);
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  // ============ Global ID ============

  /**
   * Get globally unique agent identifier
   */
  async getGlobalId(agentId: bigint): Promise<string> {
    return this.contract.getGlobalId(agentId);
  }

  /**
   * Parse a global ID string
   */
  parseGlobalId(globalId: string): GlobalAgentId {
    return parseGlobalId(globalId);
  }

  /**
   * Format a global ID from components
   */
  formatGlobalId(agentId: bigint): string {
    return formatGlobalId(this.chainId, this.contract.target as string, agentId);
  }

  // ============ ERC-721 Functions ============

  /**
   * Get owner of an agent
   */
  async ownerOf(agentId: bigint): Promise<string> {
    return this.contract.ownerOf(agentId);
  }

  /**
   * Get number of agents owned by an address
   */
  async balanceOf(owner: string): Promise<bigint> {
    return this.contract.balanceOf(owner);
  }

  /**
   * Transfer agent to another address
   */
  async transfer(
    from: string,
    to: string,
    agentId: bigint
  ): Promise<TxResult> {
    const tx = await this.contract.transferFrom(from, to, agentId);
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  // ============ View Functions ============

  /**
   * Get total number of registered agents
   */
  async totalSupply(): Promise<bigint> {
    return this.contract.totalSupply();
  }

  /**
   * Check if an agent exists
   */
  async exists(agentId: bigint): Promise<boolean> {
    return this.contract.exists(agentId);
  }

  /**
   * Get registration timestamp
   */
  async getRegisteredAt(agentId: bigint): Promise<number> {
    const timestamp = await this.contract.registeredAt(agentId);
    return Number(timestamp);
  }

  /**
   * Get full agent info
   */
  async getAgent(agentId: bigint): Promise<RegisteredAgent> {
    const [owner, wallet, uri, registeredAt] = await Promise.all([
      this.ownerOf(agentId),
      this.getAgentWallet(agentId),
      this.getAgentURI(agentId),
      this.getRegisteredAt(agentId),
    ]);

    return {
      agentId,
      globalId: this.formatGlobalId(agentId),
      owner,
      wallet,
      uri,
      registeredAt,
    };
  }

  /**
   * Get contract address
   */
  get address(): string {
    return this.contract.target as string;
  }
}
