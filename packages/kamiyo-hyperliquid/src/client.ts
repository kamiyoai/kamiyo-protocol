import { ethers, Signer, Provider, Contract } from 'ethers';
import {
  HyperliquidNetwork,
  NetworkConfig,
  NETWORKS,
  Agent,
  CopyPosition,
  DisputeInfo,
  OpenPositionParams,
} from './types';

// ABIs (minimal for now)
const AGENT_REGISTRY_ABI = [
  'function register(string name) payable',
  'function addStake() payable',
  'function withdrawStake(uint256 amount)',
  'function deactivate()',
  'function getAgent(address agent) view returns (tuple(address owner, string name, uint256 stake, uint64 registeredAt, uint64 totalTrades, int64 totalPnl, uint64 copiers, bool active))',
  'function isRegistered(address) view returns (bool)',
  'function totalAgents() view returns (uint256)',
  'function MIN_STAKE() view returns (uint256)',
  'event AgentRegistered(address indexed agent, string name, uint256 stake)',
  'event AgentSlashed(address indexed agent, uint256 amount, string reason)',
];

const KAMIYO_VAULT_ABI = [
  'function openPosition(address agent, int16 minReturnBps, uint64 lockPeriod) payable returns (uint256)',
  'function closePosition(uint256 positionId)',
  'function fileDispute(uint256 positionId) payable',
  'function positions(uint256) view returns (tuple(address user, address agent, uint256 deposit, uint256 startValue, int16 minReturnBps, uint64 startTime, uint64 lockPeriod, uint64 endTime, bool active, bool disputed))',
  'function disputes(uint256) view returns (tuple(uint256 positionId, address user, address agent, uint64 filedAt, int64 actualReturnBps, int16 expectedReturnBps, bool resolved, bool userWon))',
  'function getUserPositions(address user) view returns (uint256[])',
  'function getAgentPositions(address agent) view returns (uint256[])',
  'function disputeFee() view returns (uint256)',
  'event PositionOpened(uint256 indexed positionId, address indexed user, address indexed agent, uint256 deposit, int16 minReturnBps, uint64 lockPeriod)',
  'event PositionClosed(uint256 indexed positionId, uint256 returnAmount, int64 returnBps)',
  'event DisputeFiled(uint256 indexed disputeId, uint256 indexed positionId, address user)',
  'event DisputeResolved(uint256 indexed disputeId, bool userWon, uint256 payout)',
];

export interface HyperliquidClientConfig {
  network?: HyperliquidNetwork;
  rpcUrl?: string;
  signer?: Signer;
  provider?: Provider;
}

export class HyperliquidClient {
  private config: NetworkConfig;
  private provider: Provider;
  private signer?: Signer;
  private agentRegistry: Contract;
  private kamiyoVault: Contract;

  constructor(options: HyperliquidClientConfig = {}) {
    const network = options.network || 'testnet';
    this.config = NETWORKS[network];

    if (options.provider) {
      this.provider = options.provider;
    } else {
      this.provider = new ethers.JsonRpcProvider(options.rpcUrl || this.config.rpc);
    }

    this.signer = options.signer;

    const signerOrProvider = this.signer || this.provider;
    this.agentRegistry = new Contract(
      this.config.contracts.agentRegistry,
      AGENT_REGISTRY_ABI,
      signerOrProvider
    );
    this.kamiyoVault = new Contract(
      this.config.contracts.kamiyoVault,
      KAMIYO_VAULT_ABI,
      signerOrProvider
    );
  }

  /**
   * Connect a signer for write operations
   */
  connect(signer: Signer): HyperliquidClient {
    return new HyperliquidClient({
      provider: this.provider,
      signer,
    });
  }

  // ==================== Agent Registry ====================

  /**
   * Register as a trading agent
   */
  async registerAgent(name: string, stakeAmount: bigint): Promise<string> {
    if (!this.signer) throw new Error('Signer required');
    const tx = await this.agentRegistry.register(name, { value: stakeAmount });
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Add more stake to agent
   */
  async addStake(amount: bigint): Promise<string> {
    if (!this.signer) throw new Error('Signer required');
    const tx = await this.agentRegistry.addStake({ value: amount });
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Withdraw stake from agent
   */
  async withdrawStake(amount: bigint): Promise<string> {
    if (!this.signer) throw new Error('Signer required');
    const tx = await this.agentRegistry.withdrawStake(amount);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Deactivate agent
   */
  async deactivateAgent(): Promise<string> {
    if (!this.signer) throw new Error('Signer required');
    const tx = await this.agentRegistry.deactivate();
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Get agent info
   */
  async getAgent(address: string): Promise<Agent> {
    const result = await this.agentRegistry.getAgent(address);
    return {
      owner: result.owner,
      name: result.name,
      stake: result.stake,
      registeredAt: Number(result.registeredAt),
      totalTrades: Number(result.totalTrades),
      totalPnl: result.totalPnl,
      copiers: Number(result.copiers),
      active: result.active,
    };
  }

  /**
   * Check if address is registered agent
   */
  async isRegistered(address: string): Promise<boolean> {
    return this.agentRegistry.isRegistered(address);
  }

  /**
   * Get minimum stake requirement
   */
  async getMinStake(): Promise<bigint> {
    return this.agentRegistry.MIN_STAKE();
  }

  // ==================== Copy Trading Vault ====================

  /**
   * Open a copy trading position
   */
  async openPosition(params: OpenPositionParams): Promise<bigint> {
    if (!this.signer) throw new Error('Signer required');
    const tx = await this.kamiyoVault.openPosition(
      params.agent,
      params.minReturnBps,
      params.lockPeriodSeconds,
      { value: params.depositAmount }
    );
    const receipt = await tx.wait();

    // Parse event to get position ID
    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === 'PositionOpened'
    );
    if (event) {
      return event.args[0];
    }
    throw new Error('Position ID not found in transaction');
  }

  /**
   * Close a copy position
   */
  async closePosition(positionId: bigint): Promise<string> {
    if (!this.signer) throw new Error('Signer required');
    const tx = await this.kamiyoVault.closePosition(positionId);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * File a dispute for a position
   */
  async fileDispute(positionId: bigint): Promise<bigint> {
    if (!this.signer) throw new Error('Signer required');
    const fee = await this.kamiyoVault.disputeFee();
    const tx = await this.kamiyoVault.fileDispute(positionId, { value: fee });
    const receipt = await tx.wait();

    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === 'DisputeFiled'
    );
    if (event) {
      return event.args[0];
    }
    throw new Error('Dispute ID not found in transaction');
  }

  /**
   * Get position info
   */
  async getPosition(positionId: bigint): Promise<CopyPosition> {
    const result = await this.kamiyoVault.positions(positionId);
    return {
      user: result.user,
      agent: result.agent,
      deposit: result.deposit,
      startValue: result.startValue,
      minReturnBps: Number(result.minReturnBps),
      startTime: Number(result.startTime),
      lockPeriod: Number(result.lockPeriod),
      endTime: Number(result.endTime),
      active: result.active,
      disputed: result.disputed,
    };
  }

  /**
   * Get dispute info
   */
  async getDispute(disputeId: bigint): Promise<DisputeInfo> {
    const result = await this.kamiyoVault.disputes(disputeId);
    return {
      positionId: result.positionId,
      user: result.user,
      agent: result.agent,
      filedAt: Number(result.filedAt),
      actualReturnBps: Number(result.actualReturnBps),
      expectedReturnBps: Number(result.expectedReturnBps),
      resolved: result.resolved,
      userWon: result.userWon,
    };
  }

  /**
   * Get all position IDs for a user
   */
  async getUserPositions(user: string): Promise<bigint[]> {
    return this.kamiyoVault.getUserPositions(user);
  }

  /**
   * Get all position IDs for an agent
   */
  async getAgentPositions(agent: string): Promise<bigint[]> {
    return this.kamiyoVault.getAgentPositions(agent);
  }

  /**
   * Get dispute fee
   */
  async getDisputeFee(): Promise<bigint> {
    return this.kamiyoVault.disputeFee();
  }
}
