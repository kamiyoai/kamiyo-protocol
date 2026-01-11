import { ethers, Signer, Provider, Contract, ContractTransactionReceipt } from 'ethers';
import {
  HyperliquidNetwork,
  NetworkConfig,
  NETWORKS,
  Agent,
  AgentWithAddress,
  AgentListResult,
  CopyPosition,
  PositionWithReturn,
  DisputeInfo,
  OpenPositionParams,
  RegisterAgentParams,
  TransactionResult,
  PositionOpenedResult,
  DisputeFiledResult,
  PaginationParams,
  KamiyoError,
  KamiyoErrorCode,
  CONSTANTS,
  ContractAddresses,
  Tier,
  AgentTier,
  TierInfo,
  ProveReputationParams,
  CanAcceptDepositResult,
  TIER_NAMES,
} from './types';

const AGENT_REGISTRY_ABI = [
  'function register(string name) payable',
  'function addStake() payable',
  'function requestWithdrawal(uint256 amount)',
  'function executeWithdrawal()',
  'function cancelWithdrawal()',
  'function deactivate()',
  'function reactivate()',
  'function getAgent(address agent) view returns (tuple(address owner, string name, uint256 stake, uint64 registeredAt, uint64 totalTrades, int64 totalPnl, uint64 copiers, uint64 successfulTrades, bool active))',
  'function isRegistered(address) view returns (bool)',
  'function totalAgents() view returns (uint256)',
  'function getAgents(uint256 offset, uint256 limit) view returns (address[], uint256)',
  'function getSuccessRate(address agent) view returns (uint256)',
  'function minStake() view returns (uint256)',
  'function withdrawalRequestTime(address) view returns (uint64)',
  'function withdrawalRequestAmount(address) view returns (uint256)',
  'function totalStaked() view returns (uint256)',
  'function totalSlashed() view returns (uint256)',
  'event AgentRegistered(address indexed agent, string name, uint256 stake)',
  'event AgentDeactivated(address indexed agent)',
  'event AgentReactivated(address indexed agent)',
  'event StakeAdded(address indexed agent, uint256 amount, uint256 newTotal)',
  'event StakeWithdrawn(address indexed agent, uint256 amount, uint256 remaining)',
  'event AgentSlashed(address indexed agent, uint256 amount, uint256 remaining, string reason)',
];

const KAMIYO_VAULT_ABI = [
  'function openPosition(address agent, int16 minReturnBps, uint64 lockPeriod) payable returns (uint256)',
  'function closePosition(uint256 positionId)',
  'function fileDispute(uint256 positionId) payable returns (uint256)',
  'function getPosition(uint256 positionId) view returns (tuple(address user, address agent, uint256 deposit, uint256 currentValue, int16 minReturnBps, uint64 startTime, uint64 lockPeriod, uint64 endTime, bool active, bool disputed))',
  'function getDispute(uint256 disputeId) view returns (tuple(uint256 positionId, address user, address agent, uint64 filedAt, int64 actualReturnBps, int16 expectedReturnBps, bool resolved, bool userWon))',
  'function getUserPositions(address user) view returns (uint256[])',
  'function getAgentPositions(address agent) view returns (uint256[])',
  'function getUserActivePositions(address user) view returns (tuple(address user, address agent, uint256 deposit, uint256 currentValue, int16 minReturnBps, uint64 startTime, uint64 lockPeriod, uint64 endTime, bool active, bool disputed)[], uint256[])',
  'function getPositionReturn(uint256 positionId) view returns (int64)',
  'function canClosePosition(uint256 positionId) view returns (bool, string)',
  'function disputeFee() view returns (uint256)',
  'function positionCount() view returns (uint256)',
  'function disputeCount() view returns (uint256)',
  'function totalDeposits() view returns (uint256)',
  'function totalFees() view returns (uint256)',
  'event PositionOpened(uint256 indexed positionId, address indexed user, address indexed agent, uint256 deposit, int16 minReturnBps, uint64 lockPeriod)',
  'event PositionClosed(uint256 indexed positionId, uint256 returnAmount, int64 returnBps)',
  'event DisputeFiled(uint256 indexed disputeId, uint256 indexed positionId, address user)',
  'event DisputeResolved(uint256 indexed disputeId, bool userWon, uint256 payout)',
];

const REPUTATION_LIMITS_ABI = [
  'function proveReputation(uint8 tier, bytes32 commitment, uint256[2] proofA, uint256[2][2] proofB, uint256[2] proofC, uint256[] pubInputs)',
  'function getCopyLimits(address agent) view returns (uint256 maxCopyLimit, uint256 maxCopiers)',
  'function canAcceptDeposit(address agent, uint256 currentAUM, uint256 currentCopiers, uint256 newDeposit) view returns (bool allowed, string reason)',
  'function getTier(uint8 tier) view returns (tuple(uint256 threshold, uint256 maxCopyLimit, uint256 maxCopiers))',
  'function tierCount() view returns (uint256)',
  'function getAgentTierInfo(address agent) view returns (uint8 tier, uint64 verifiedAt, tuple(uint256 threshold, uint256 maxCopyLimit, uint256 maxCopiers) tierInfo)',
  'function agentTiers(address) view returns (uint8 tier, uint64 verifiedAt, bytes32 commitment)',
  'event TierVerified(address indexed agent, uint8 tier, uint256 maxCopyLimit)',
];

// IHyperCore precompile ABI - reads L1 position state from HyperEVM
const HYPERCORE_ABI = [
  'function getUserPosition(address user, uint32 assetId) view returns (tuple(int64 szi, uint64 entryPx, int64 unrealizedPnl, uint64 marginUsed, uint64 liquidationPx, uint32 leverage))',
  'function getAccountSummary(address user) view returns (tuple(uint64 accountValue, uint64 marginUsed, uint64 availableMargin, int64 totalPnl, uint32 positionCount))',
  'function getAllPositions(address user) view returns (uint32[] assetIds, tuple(int64 szi, uint64 entryPx, int64 unrealizedPnl, uint64 marginUsed, uint64 liquidationPx, uint32 leverage)[] positions)',
  'function getMarkPrice(uint32 assetId) view returns (uint64 price)',
  'function getIndexPrice(uint32 assetId) view returns (uint64 price)',
  'function getFundingRate(uint32 assetId) view returns (int64 rate)',
];

const HYPERCORE_ADDRESS = '0x0000000000000000000000000000000000000800';

export interface HyperliquidClientConfig {
  network?: HyperliquidNetwork;
  rpcUrl?: string;
  signer?: Signer;
  provider?: Provider;
  contracts?: ContractAddresses;
  retryAttempts?: number;
  retryDelay?: number;
}

export class HyperliquidClient {
  private readonly config: NetworkConfig;
  private readonly provider: Provider;
  private readonly signer?: Signer;
  private readonly agentRegistry: Contract;
  private readonly kamiyoVault: Contract;
  private readonly reputationLimits: Contract | null;
  private readonly hyperCore: Contract;
  private readonly retryAttempts: number;
  private readonly retryDelay: number;

  constructor(options: HyperliquidClientConfig = {}) {
    const network = options.network || 'testnet';
    this.config = { ...NETWORKS[network] };

    if (options.contracts) {
      this.config.contracts = { ...this.config.contracts, ...options.contracts };
    }

    if (options.provider) {
      this.provider = options.provider;
    } else {
      this.provider = new ethers.JsonRpcProvider(options.rpcUrl || this.config.rpc);
    }

    this.signer = options.signer;
    this.retryAttempts = options.retryAttempts ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;

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

    // ReputationLimits is optional
    const repLimitsAddr = this.config.contracts.reputationLimits;
    this.reputationLimits = repLimitsAddr && repLimitsAddr !== ethers.ZeroAddress
      ? new Contract(repLimitsAddr, REPUTATION_LIMITS_ABI, signerOrProvider)
      : null;

    // HyperCore precompile for L1 position tracking
    this.hyperCore = new Contract(HYPERCORE_ADDRESS, HYPERCORE_ABI, signerOrProvider);
  }

  

  connect(signer: Signer): HyperliquidClient {
    return new HyperliquidClient({
      provider: this.provider,
      signer,
      contracts: this.config.contracts as ContractAddresses,
      retryAttempts: this.retryAttempts,
      retryDelay: this.retryDelay,
    });
  }

  hasReputationLimits(): boolean {
    return this.reputationLimits !== null;
  }

  getAddress(): Promise<string> {
    if (!this.signer) {
      throw new KamiyoError('No signer connected', KamiyoErrorCode.NO_SIGNER);
    }
    return this.signer.getAddress();
  }

  getNetworkConfig(): NetworkConfig {
    return { ...this.config };
  }

  

  async registerAgent(params: RegisterAgentParams): Promise<TransactionResult> {
    this.requireSigner();
    this.validateName(params.name);

    if (params.stakeAmount < CONSTANTS.MIN_STAKE) {
      throw new KamiyoError(
        `Stake must be at least ${ethers.formatEther(CONSTANTS.MIN_STAKE)} HYPE`,
        KamiyoErrorCode.INSUFFICIENT_STAKE
      );
    }

    return this.executeWithRetry(async () => {
      const tx = await this.agentRegistry.register(params.name, { value: params.stakeAmount });
      const receipt = await tx.wait();
      return this.parseReceipt(receipt);
    });
  }

  async addStake(amount: bigint): Promise<TransactionResult> {
    this.requireSigner();

    if (amount <= 0n) {
      throw new KamiyoError('Amount must be positive', KamiyoErrorCode.INVALID_PARAMETERS);
    }

    return this.executeWithRetry(async () => {
      const tx = await this.agentRegistry.addStake({ value: amount });
      const receipt = await tx.wait();
      return this.parseReceipt(receipt);
    });
  }

  async requestWithdrawal(amount: bigint): Promise<TransactionResult> {
    this.requireSigner();

    return this.executeWithRetry(async () => {
      const tx = await this.agentRegistry.requestWithdrawal(amount);
      const receipt = await tx.wait();
      return this.parseReceipt(receipt);
    });
  }

  async executeWithdrawal(): Promise<TransactionResult> {
    this.requireSigner();

    return this.executeWithRetry(async () => {
      const tx = await this.agentRegistry.executeWithdrawal();
      const receipt = await tx.wait();
      return this.parseReceipt(receipt);
    });
  }

  async cancelWithdrawal(): Promise<TransactionResult> {
    this.requireSigner();

    return this.executeWithRetry(async () => {
      const tx = await this.agentRegistry.cancelWithdrawal();
      const receipt = await tx.wait();
      return this.parseReceipt(receipt);
    });
  }

  async deactivateAgent(): Promise<TransactionResult> {
    this.requireSigner();

    return this.executeWithRetry(async () => {
      const tx = await this.agentRegistry.deactivate();
      const receipt = await tx.wait();
      return this.parseReceipt(receipt);
    });
  }

  async reactivateAgent(): Promise<TransactionResult> {
    this.requireSigner();

    return this.executeWithRetry(async () => {
      const tx = await this.agentRegistry.reactivate();
      const receipt = await tx.wait();
      return this.parseReceipt(receipt);
    });
  }

  

  async getAgent(address: string): Promise<Agent> {
    this.validateAddress(address);

    const result = await this.agentRegistry.getAgent(address);
    return this.parseAgent(result);
  }

  async isRegistered(address: string): Promise<boolean> {
    this.validateAddress(address);
    return this.agentRegistry.isRegistered(address);
  }

  async getAgents(pagination: PaginationParams = { offset: 0, limit: 50 }): Promise<AgentListResult> {
    const [addresses, total] = await this.agentRegistry.getAgents(pagination.offset, pagination.limit);

    const agents: AgentWithAddress[] = await Promise.all(
      addresses.map(async (addr: string) => {
        const agent = await this.getAgent(addr);
        return { ...agent, address: addr };
      })
    );

    return {
      agents,
      total: Number(total),
      hasMore: pagination.offset + agents.length < Number(total),
    };
  }

  async getSuccessRate(address: string): Promise<number> {
    this.validateAddress(address);
    const rate = await this.agentRegistry.getSuccessRate(address);
    return Number(rate);
  }

  async getMinStake(): Promise<bigint> {
    return this.agentRegistry.minStake();
  }

  async getWithdrawalRequest(address: string): Promise<{ amount: bigint; requestTime: number } | null> {
    this.validateAddress(address);

    const amount = await this.agentRegistry.withdrawalRequestAmount(address);
    if (amount === 0n) return null;

    const requestTime = await this.agentRegistry.withdrawalRequestTime(address);
    return { amount, requestTime: Number(requestTime) };
  }

  async getTotalStaked(): Promise<bigint> {
    return this.agentRegistry.totalStaked();
  }

  async getTotalSlashed(): Promise<bigint> {
    return this.agentRegistry.totalSlashed();
  }

  async totalAgents(): Promise<number> {
    const count = await this.agentRegistry.totalAgents();
    return Number(count);
  }

  

  async openPosition(params: OpenPositionParams): Promise<PositionOpenedResult> {
    this.requireSigner();
    this.validateAddress(params.agent);

    if (params.depositAmount < CONSTANTS.MIN_DEPOSIT) {
      throw new KamiyoError(
        `Deposit must be at least ${ethers.formatEther(CONSTANTS.MIN_DEPOSIT)} HYPE`,
        KamiyoErrorCode.INSUFFICIENT_DEPOSIT
      );
    }

    if (params.depositAmount > CONSTANTS.MAX_DEPOSIT) {
      throw new KamiyoError(
        `Deposit cannot exceed ${ethers.formatEther(CONSTANTS.MAX_DEPOSIT)} HYPE`,
        KamiyoErrorCode.INVALID_PARAMETERS
      );
    }

    if (params.minReturnBps < CONSTANTS.MIN_RETURN_BPS || params.minReturnBps > CONSTANTS.MAX_RETURN_BPS) {
      throw new KamiyoError(
        `Return must be between ${CONSTANTS.MIN_RETURN_BPS} and ${CONSTANTS.MAX_RETURN_BPS} bps`,
        KamiyoErrorCode.INVALID_PARAMETERS
      );
    }

    if (params.lockPeriodSeconds < CONSTANTS.MIN_LOCK_PERIOD || params.lockPeriodSeconds > CONSTANTS.MAX_LOCK_PERIOD) {
      throw new KamiyoError(
        `Lock period must be between ${CONSTANTS.MIN_LOCK_PERIOD} and ${CONSTANTS.MAX_LOCK_PERIOD} seconds`,
        KamiyoErrorCode.INVALID_PARAMETERS
      );
    }

    return this.executeWithRetry(async () => {
      const tx = await this.kamiyoVault.openPosition(
        params.agent,
        params.minReturnBps,
        params.lockPeriodSeconds,
        { value: params.depositAmount }
      );
      const receipt = await tx.wait();

      const event = receipt.logs.find((log: any) => log.fragment?.name === 'PositionOpened');
      if (!event) {
        throw new KamiyoError('Position ID not found in transaction', KamiyoErrorCode.TRANSACTION_FAILED);
      }

      return {
        ...this.parseReceipt(receipt),
        positionId: event.args[0],
      };
    });
  }

  async closePosition(positionId: bigint): Promise<TransactionResult> {
    this.requireSigner();

    return this.executeWithRetry(async () => {
      const tx = await this.kamiyoVault.closePosition(positionId);
      const receipt = await tx.wait();
      return this.parseReceipt(receipt);
    });
  }

  async fileDispute(positionId: bigint): Promise<DisputeFiledResult> {
    this.requireSigner();

    const fee = await this.kamiyoVault.disputeFee();

    return this.executeWithRetry(async () => {
      const tx = await this.kamiyoVault.fileDispute(positionId, { value: fee });
      const receipt = await tx.wait();

      const event = receipt.logs.find((log: any) => log.fragment?.name === 'DisputeFiled');
      if (!event) {
        throw new KamiyoError('Dispute ID not found in transaction', KamiyoErrorCode.TRANSACTION_FAILED);
      }

      return {
        ...this.parseReceipt(receipt),
        disputeId: event.args[0],
      };
    });
  }

  

  async getPosition(positionId: bigint): Promise<CopyPosition> {
    const result = await this.kamiyoVault.getPosition(positionId);
    return this.parsePosition(result, positionId);
  }

  async getPositionWithReturn(positionId: bigint): Promise<PositionWithReturn> {
    const position = await this.getPosition(positionId);
    const returnBps = await this.getPositionReturn(positionId);
    const [canClose] = await this.kamiyoVault.canClosePosition(positionId);

    const now = Math.floor(Date.now() / 1000);
    const unlockTime = position.startTime + position.lockPeriod;
    const timeRemaining = Math.max(0, unlockTime - now);

    return {
      ...position,
      returnBps,
      canClose,
      timeRemaining,
    };
  }

  async getDispute(disputeId: bigint): Promise<DisputeInfo> {
    const result = await this.kamiyoVault.getDispute(disputeId);
    return this.parseDispute(result, disputeId);
  }

  async getUserPositions(user: string): Promise<bigint[]> {
    this.validateAddress(user);
    return this.kamiyoVault.getUserPositions(user);
  }

  async getUserActivePositions(user: string): Promise<CopyPosition[]> {
    this.validateAddress(user);
    const [positions, ids] = await this.kamiyoVault.getUserActivePositions(user);
    return positions.map((p: any, i: number) => this.parsePosition(p, ids[i]));
  }

  async getAgentPositions(agent: string): Promise<bigint[]> {
    this.validateAddress(agent);
    return this.kamiyoVault.getAgentPositions(agent);
  }

  async getPositionReturn(positionId: bigint): Promise<number> {
    const returnBps = await this.kamiyoVault.getPositionReturn(positionId);
    return Number(returnBps);
  }

  async canClosePosition(positionId: bigint): Promise<{ canClose: boolean; reason: string }> {
    const [canClose, reason] = await this.kamiyoVault.canClosePosition(positionId);
    return { canClose, reason };
  }

  async getDisputeFee(): Promise<bigint> {
    return this.kamiyoVault.disputeFee();
  }

  async getVaultStats(): Promise<{
    positionCount: number;
    disputeCount: number;
    totalDeposits: bigint;
    totalFees: bigint;
  }> {
    const [positionCount, disputeCount, totalDeposits, totalFees] = await Promise.all([
      this.kamiyoVault.positionCount(),
      this.kamiyoVault.disputeCount(),
      this.kamiyoVault.totalDeposits(),
      this.kamiyoVault.totalFees(),
    ]);

    return {
      positionCount: Number(positionCount),
      disputeCount: Number(disputeCount),
      totalDeposits,
      totalFees,
    };
  }

  // ============ Reputation Limits Methods ============

  private requireReputationLimits(): Contract {
    if (!this.reputationLimits) {
      throw new KamiyoError('ReputationLimits contract not configured', KamiyoErrorCode.INVALID_PARAMETERS);
    }
    return this.reputationLimits;
  }

  async getTierCount(): Promise<number> {
    const contract = this.requireReputationLimits();
    const count = await contract.tierCount();
    return Number(count);
  }

  async getTier(tier: number): Promise<TierInfo> {
    const contract = this.requireReputationLimits();
    const result = await contract.getTier(tier);
    return {
      tier,
      name: TIER_NAMES[tier] || `Tier ${tier}`,
      threshold: Number(result.threshold),
      maxCopyLimit: result.maxCopyLimit,
      maxCopiers: Number(result.maxCopiers),
    };
  }

  async getAllTiers(): Promise<TierInfo[]> {
    const count = await this.getTierCount();
    const tiers: TierInfo[] = [];
    for (let i = 0; i < count; i++) {
      tiers.push(await this.getTier(i));
    }
    return tiers;
  }

  async getAgentTier(agent: string): Promise<AgentTier> {
    this.validateAddress(agent);
    const contract = this.requireReputationLimits();
    const [tier, verifiedAt, tierInfo] = await contract.getAgentTierInfo(agent);
    return {
      tier: Number(tier),
      verifiedAt: Number(verifiedAt),
      commitment: '', // Not returned by getAgentTierInfo
      tierInfo: {
        threshold: Number(tierInfo.threshold),
        maxCopyLimit: tierInfo.maxCopyLimit,
        maxCopiers: Number(tierInfo.maxCopiers),
      },
    };
  }

  async getCopyLimits(agent: string): Promise<{ maxCopyLimit: bigint; maxCopiers: number }> {
    this.validateAddress(agent);
    const contract = this.requireReputationLimits();
    const [maxCopyLimit, maxCopiers] = await contract.getCopyLimits(agent);
    return { maxCopyLimit, maxCopiers: Number(maxCopiers) };
  }

  async canAcceptDeposit(
    agent: string,
    currentAUM: bigint,
    currentCopiers: number,
    newDeposit: bigint
  ): Promise<CanAcceptDepositResult> {
    this.validateAddress(agent);
    const contract = this.requireReputationLimits();
    const [allowed, reason] = await contract.canAcceptDeposit(agent, currentAUM, currentCopiers, newDeposit);
    return { allowed, reason };
  }

  async proveReputation(params: ProveReputationParams): Promise<TransactionResult> {
    this.requireSigner();
    const contract = this.requireReputationLimits();

    if (params.tier < 1 || params.tier > 4) {
      throw new KamiyoError('Tier must be between 1 and 4', KamiyoErrorCode.INVALID_PARAMETERS);
    }

    return this.executeWithRetry(async () => {
      const tx = await contract.proveReputation(
        params.tier,
        params.commitment,
        params.proofA,
        params.proofB,
        params.proofC,
        params.pubInputs
      );
      const receipt = await tx.wait();
      return this.parseReceipt(receipt);
    });
  }

  // ============ HyperCore L1 Position Tracking ============

  /**
   * Get L1 perp position for an agent/user
   * @param user Address to query
   * @param assetId Asset ID (0=BTC, 1=ETH, etc)
   */
  async getL1Position(user: string, assetId: number): Promise<{
    size: bigint;
    entryPrice: bigint;
    unrealizedPnl: bigint;
    marginUsed: bigint;
    liquidationPrice: bigint;
    leverage: number;
  }> {
    this.validateAddress(user);
    const result = await this.hyperCore.getUserPosition(user, assetId);
    return {
      size: result.szi,
      entryPrice: result.entryPx,
      unrealizedPnl: result.unrealizedPnl,
      marginUsed: result.marginUsed,
      liquidationPrice: result.liquidationPx,
      leverage: Number(result.leverage) / 100,
    };
  }

  /**
   * Get account summary from L1
   */
  async getL1AccountSummary(user: string): Promise<{
    accountValue: bigint;
    marginUsed: bigint;
    availableMargin: bigint;
    totalPnl: bigint;
    positionCount: number;
  }> {
    this.validateAddress(user);
    const result = await this.hyperCore.getAccountSummary(user);
    return {
      accountValue: result.accountValue,
      marginUsed: result.marginUsed,
      availableMargin: result.availableMargin,
      totalPnl: result.totalPnl,
      positionCount: Number(result.positionCount),
    };
  }

  /**
   * Get all L1 positions for an agent/user
   */
  async getAllL1Positions(user: string): Promise<Array<{
    assetId: number;
    size: bigint;
    entryPrice: bigint;
    unrealizedPnl: bigint;
    marginUsed: bigint;
    liquidationPrice: bigint;
    leverage: number;
  }>> {
    this.validateAddress(user);
    const [assetIds, positions] = await this.hyperCore.getAllPositions(user);
    return assetIds.map((id: number, i: number) => ({
      assetId: Number(id),
      size: positions[i].szi,
      entryPrice: positions[i].entryPx,
      unrealizedPnl: positions[i].unrealizedPnl,
      marginUsed: positions[i].marginUsed,
      liquidationPrice: positions[i].liquidationPx,
      leverage: Number(positions[i].leverage) / 100,
    }));
  }

  /**
   * Get mark price for an asset from L1
   */
  async getL1MarkPrice(assetId: number): Promise<bigint> {
    return this.hyperCore.getMarkPrice(assetId);
  }

  /**
   * Get index price for an asset from L1
   */
  async getL1IndexPrice(assetId: number): Promise<bigint> {
    return this.hyperCore.getIndexPrice(assetId);
  }

  /**
   * Get funding rate for an asset from L1
   */
  async getL1FundingRate(assetId: number): Promise<bigint> {
    return this.hyperCore.getFundingRate(assetId);
  }

  // ============ Gas Estimation ============

  async estimateRegisterGas(params: RegisterAgentParams): Promise<bigint> {
    this.requireSigner();
    return this.agentRegistry.register.estimateGas(params.name, { value: params.stakeAmount });
  }

  async estimateOpenPositionGas(params: OpenPositionParams): Promise<bigint> {
    this.requireSigner();
    return this.kamiyoVault.openPosition.estimateGas(
      params.agent,
      params.minReturnBps,
      params.lockPeriodSeconds,
      { value: params.depositAmount }
    );
  }

  

  private requireSigner(): void {
    if (!this.signer) {
      throw new KamiyoError('Signer required for this operation', KamiyoErrorCode.NO_SIGNER);
    }
  }

  private validateAddress(address: string): void {
    if (!ethers.isAddress(address)) {
      throw new KamiyoError(`Invalid address: ${address}`, KamiyoErrorCode.INVALID_ADDRESS);
    }
  }

  private validateName(name: string): void {
    if (name.length < 3 || name.length > 32) {
      throw new KamiyoError('Name must be 3-32 characters', KamiyoErrorCode.INVALID_PARAMETERS);
    }

    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new KamiyoError(
        'Name can only contain alphanumeric characters and underscores',
        KamiyoErrorCode.INVALID_PARAMETERS
      );
    }
  }

  private parseReceipt(receipt: ContractTransactionReceipt | null): TransactionResult {
    if (!receipt) {
      throw new KamiyoError('Transaction failed - no receipt', KamiyoErrorCode.TRANSACTION_FAILED);
    }
    if (receipt.status === 0) {
      throw new KamiyoError('Transaction reverted on chain', KamiyoErrorCode.TRANSACTION_FAILED);
    }
    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  }

  private parseAgent(result: any): Agent {
    return {
      owner: result.owner,
      name: result.name,
      stake: result.stake,
      registeredAt: Number(result.registeredAt),
      totalTrades: Number(result.totalTrades),
      totalPnl: result.totalPnl,
      copiers: Number(result.copiers),
      successfulTrades: Number(result.successfulTrades),
      active: result.active,
    };
  }

  private parsePosition(result: any, id: bigint): CopyPosition {
    return {
      id,
      user: result.user,
      agent: result.agent,
      deposit: result.deposit,
      currentValue: result.currentValue,
      minReturnBps: Number(result.minReturnBps),
      startTime: Number(result.startTime),
      lockPeriod: Number(result.lockPeriod),
      endTime: Number(result.endTime),
      active: result.active,
      disputed: result.disputed,
    };
  }

  private parseDispute(result: any, id: bigint): DisputeInfo {
    return {
      id,
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

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Don't retry on user rejections or validation errors
        if (
          error.code === 'ACTION_REJECTED' ||
          error.code === 4001 ||
          error instanceof KamiyoError
        ) {
          throw error;
        }

        // Don't retry on the last attempt
        if (attempt < this.retryAttempts - 1) {
          await this.sleep(this.retryDelay * (attempt + 1));
        }
      }
    }

    throw new KamiyoError(
      lastError?.message || 'Transaction failed after retries',
      KamiyoErrorCode.TRANSACTION_FAILED,
      lastError
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
