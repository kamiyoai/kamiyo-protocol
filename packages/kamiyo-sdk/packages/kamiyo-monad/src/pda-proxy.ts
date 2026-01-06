/**
 * PDA emulation via ERC1967 upgradable proxies
 */

import { ethers } from 'ethers';
import { MonadProvider } from './provider';
import {
  AgentIdentity,
  AgentType,
  MonadError,
} from './types';

const AGENT_SEED = ethers.keccak256(ethers.toUtf8Bytes('agent'));
const ESCROW_SEED = ethers.keccak256(ethers.toUtf8Bytes('escrow'));
const REPUTATION_SEED = ethers.keccak256(ethers.toUtf8Bytes('reputation'));

const AGENT_PROXY_ABI = [
  'function owner() view returns (address)',
  'function name() view returns (string)',
  'function agentType() view returns (uint8)',
  'function reputation() view returns (uint64)',
  'function stakeAmount() view returns (uint64)',
  'function isActive() view returns (bool)',
  'function createdAt() view returns (uint64)',
  'function lastActive() view returns (uint64)',
  'function totalEscrows() view returns (uint64)',
  'function successfulEscrows() view returns (uint64)',
  'function disputedEscrows() view returns (uint64)',
  'function initialize(address _owner, string _name, uint8 _agentType) external',
  'function updateReputation(uint64 _reputation) external',
  'function updateStake(uint64 _stakeAmount) external',
  'function setActive(bool _isActive) external',
  'function recordEscrow(bool successful, bool disputed) external',
  'event AgentInitialized(address indexed owner, string name, uint8 agentType)',
  'event ReputationUpdated(uint64 oldReputation, uint64 newReputation)',
  'event StakeUpdated(uint64 oldStake, uint64 newStake)',
  'event EscrowRecorded(bool successful, bool disputed)',
];

const AGENT_FACTORY_ABI = [
  'function createAgent(address owner, string name, uint8 agentType) external returns (address)',
  'function getAgent(address owner) view returns (address)',
  'function agentExists(address owner) view returns (bool)',
  'function deriveAddress(bytes32 seed, address owner) view returns (address)',
  'event AgentCreated(address indexed owner, address indexed proxy, string name)',
];

export class PDAProxy {
  private readonly provider: MonadProvider;
  private readonly factoryAddress: string;
  private readonly factory: ethers.Contract;

  constructor(provider: MonadProvider) {
    this.provider = provider;
    this.factoryAddress = provider.getContracts().agentFactory;
    this.factory = new ethers.Contract(
      this.factoryAddress,
      AGENT_FACTORY_ABI,
      provider.getProvider()
    );
  }

  deriveAgentAddress(owner: string): string {
    return this.deriveAddress(AGENT_SEED, owner);
  }

  deriveEscrowAddress(agent: string, transactionId: string): string {
    const txIdHash = ethers.keccak256(ethers.toUtf8Bytes(transactionId));
    const combinedSeed = ethers.keccak256(
      ethers.solidityPacked(['bytes32', 'bytes32'], [ESCROW_SEED, txIdHash])
    );
    return this.deriveAddress(combinedSeed, agent);
  }

  deriveReputationAddress(entity: string): string {
    return this.deriveAddress(REPUTATION_SEED, entity);
  }

  private deriveAddress(seed: string, owner: string): string {
    const packed = ethers.solidityPacked(
      ['bytes32', 'address', 'address'],
      [seed, owner, this.factoryAddress]
    );
    const hash = ethers.keccak256(packed);
    return ethers.getAddress('0x' + hash.slice(-40));
  }

  async agentExists(owner: string): Promise<boolean> {
    try {
      return await this.factory.agentExists(owner);
    } catch {
      return false;
    }
  }

  async getAgentAddress(owner: string): Promise<string | null> {
    try {
      const exists = await this.agentExists(owner);
      if (!exists) return null;
      return await this.factory.getAgent(owner);
    } catch {
      return null;
    }
  }

  async createAgent(
    owner: string,
    name: string,
    agentType: AgentType
  ): Promise<string> {
    const signer = this.provider.getSigner();
    const factoryWithSigner = this.factory.connect(signer) as ethers.Contract;

    try {
      const tx = await factoryWithSigner.createAgent(owner, name, agentType);
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log: ethers.Log) =>
          log.topics[0] === ethers.id('AgentCreated(address,address,string)')
      );

      if (!event) {
        throw new MonadError('Agent creation event not found', 'CONTRACT_ERROR');
      }

      const decoded = this.factory.interface.parseLog({
        topics: event.topics as string[],
        data: event.data,
      });

      return decoded?.args.proxy;
    } catch (e) {
      if (e instanceof MonadError) throw e;
      throw new MonadError(
        `Failed to create agent: ${e}`,
        'CONTRACT_ERROR',
        { owner, name, agentType }
      );
    }
  }

  async getAgentIdentity(proxyAddress: string): Promise<AgentIdentity> {
    const proxy = new ethers.Contract(
      proxyAddress,
      AGENT_PROXY_ABI,
      this.provider.getProvider()
    );

    try {
      const [
        owner,
        name,
        agentType,
        reputation,
        stakeAmount,
        isActive,
        createdAt,
        lastActive,
        totalEscrows,
        successfulEscrows,
        disputedEscrows,
      ] = await Promise.all([
        proxy.owner(),
        proxy.name(),
        proxy.agentType(),
        proxy.reputation(),
        proxy.stakeAmount(),
        proxy.isActive(),
        proxy.createdAt(),
        proxy.lastActive(),
        proxy.totalEscrows(),
        proxy.successfulEscrows(),
        proxy.disputedEscrows(),
      ]);

      return {
        owner,
        name,
        agentType: agentType as AgentType,
        reputation: BigInt(reputation),
        stakeAmount: BigInt(stakeAmount),
        isActive,
        createdAt: BigInt(createdAt),
        lastActive: BigInt(lastActive),
        totalEscrows: BigInt(totalEscrows),
        successfulEscrows: BigInt(successfulEscrows),
        disputedEscrows: BigInt(disputedEscrows),
      };
    } catch (e) {
      throw new MonadError(
        `Failed to fetch agent identity: ${e}`,
        'CONTRACT_ERROR',
        { proxyAddress }
      );
    }
  }

  async updateReputation(
    proxyAddress: string,
    newReputation: bigint
  ): Promise<string> {
    const signer = this.provider.getSigner();
    const proxy = new ethers.Contract(proxyAddress, AGENT_PROXY_ABI, signer);

    try {
      const tx = await proxy.updateReputation(newReputation);
      const receipt = await tx.wait();
      return receipt.hash;
    } catch (e) {
      throw new MonadError(
        `Failed to update reputation: ${e}`,
        'CONTRACT_ERROR',
        { proxyAddress, newReputation: newReputation.toString() }
      );
    }
  }

  async recordEscrow(
    proxyAddress: string,
    successful: boolean,
    disputed: boolean
  ): Promise<string> {
    const signer = this.provider.getSigner();
    const proxy = new ethers.Contract(proxyAddress, AGENT_PROXY_ABI, signer);

    try {
      const tx = await proxy.recordEscrow(successful, disputed);
      const receipt = await tx.wait();
      return receipt.hash;
    } catch (e) {
      throw new MonadError(
        `Failed to record escrow: ${e}`,
        'CONTRACT_ERROR',
        { proxyAddress, successful, disputed }
      );
    }
  }
}

export function createPDAProxy(provider: MonadProvider): PDAProxy {
  return new PDAProxy(provider);
}
