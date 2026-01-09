import { ethers } from 'ethers';
import { MonadProvider } from './provider';
import { AgentIdentity, AgentType, MonadError } from './types';

const SEED = {
  agent: ethers.keccak256(ethers.toUtf8Bytes('agent')),
  escrow: ethers.keccak256(ethers.toUtf8Bytes('escrow')),
  reputation: ethers.keccak256(ethers.toUtf8Bytes('reputation')),
};

const PROXY_ABI = [
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
  'function initialize(address, string, uint8) external',
  'function updateReputation(uint64) external',
  'function updateStake(uint64) external',
  'function setActive(bool) external',
  'function recordEscrow(bool, bool) external',
];

const FACTORY_ABI = [
  'function createAgent(address, string, uint8) external returns (address)',
  'function getAgent(address) view returns (address)',
  'function agentExists(address) view returns (bool)',
  'event AgentCreated(address indexed owner, address indexed proxy, string name)',
];

export class PDAProxy {
  private readonly provider: MonadProvider;
  private readonly factory: ethers.Contract;

  constructor(provider: MonadProvider) {
    this.provider = provider;
    this.factory = new ethers.Contract(
      provider.getContracts().agentFactory,
      FACTORY_ABI,
      provider.getProvider()
    );
  }

  deriveAgentAddress(owner: string): string {
    return this.derive(SEED.agent, owner);
  }

  deriveEscrowAddress(agent: string, txId: string): string {
    const txHash = ethers.keccak256(ethers.toUtf8Bytes(txId));
    const seed = ethers.keccak256(ethers.solidityPacked(['bytes32', 'bytes32'], [SEED.escrow, txHash]));
    return this.derive(seed, agent);
  }

  deriveReputationAddress(entity: string): string {
    return this.derive(SEED.reputation, entity);
  }

  private derive(seed: string, owner: string): string {
    const packed = ethers.solidityPacked(
      ['bytes32', 'address', 'address'],
      [seed, owner, this.provider.getContracts().agentFactory]
    );
    return ethers.getAddress('0x' + ethers.keccak256(packed).slice(-40));
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
      if (!(await this.agentExists(owner))) return null;
      return await this.factory.getAgent(owner);
    } catch {
      return null;
    }
  }

  async createAgent(owner: string, name: string, type: AgentType): Promise<string> {
    const signer = this.provider.getSigner();
    const contract = this.factory.connect(signer) as ethers.Contract;

    try {
      const tx = await contract.createAgent(owner, name, type);
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log: ethers.Log) => log.topics[0] === ethers.id('AgentCreated(address,address,string)')
      );

      if (!event) throw new MonadError('AgentCreated event not found', 'CONTRACT_ERROR');

      const decoded = this.factory.interface.parseLog({
        topics: event.topics as string[],
        data: event.data,
      });

      return decoded?.args.proxy;
    } catch (e) {
      if (e instanceof MonadError) throw e;
      throw new MonadError(`createAgent failed: ${e}`, 'CONTRACT_ERROR', { owner, name, type });
    }
  }

  async getAgentIdentity(proxy: string): Promise<AgentIdentity> {
    const contract = new ethers.Contract(proxy, PROXY_ABI, this.provider.getProvider());

    try {
      const [
        owner, name, agentType, reputation, stakeAmount, isActive,
        createdAt, lastActive, totalEscrows, successfulEscrows, disputedEscrows
      ] = await Promise.all([
        contract.owner(),
        contract.name(),
        contract.agentType(),
        contract.reputation(),
        contract.stakeAmount(),
        contract.isActive(),
        contract.createdAt(),
        contract.lastActive(),
        contract.totalEscrows(),
        contract.successfulEscrows(),
        contract.disputedEscrows(),
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
      throw new MonadError(`getAgentIdentity failed: ${e}`, 'CONTRACT_ERROR', { proxy });
    }
  }

  async updateReputation(proxy: string, rep: bigint): Promise<string> {
    const contract = new ethers.Contract(proxy, PROXY_ABI, this.provider.getSigner());
    try {
      const tx = await contract.updateReputation(rep);
      return (await tx.wait()).hash;
    } catch (e) {
      throw new MonadError(`updateReputation failed: ${e}`, 'CONTRACT_ERROR', { proxy, rep: rep.toString() });
    }
  }

  async recordEscrow(proxy: string, successful: boolean, disputed: boolean): Promise<string> {
    const contract = new ethers.Contract(proxy, PROXY_ABI, this.provider.getSigner());
    try {
      const tx = await contract.recordEscrow(successful, disputed);
      return (await tx.wait()).hash;
    } catch (e) {
      throw new MonadError(`recordEscrow failed: ${e}`, 'CONTRACT_ERROR', { proxy, successful, disputed });
    }
  }
}

export function createPDAProxy(provider: MonadProvider): PDAProxy {
  return new PDAProxy(provider);
}
