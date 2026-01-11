export const AGENT_REGISTRY_ABI = [
  'function register(string name) payable',
  'function addStake() payable',
  'function requestWithdrawal(uint256 amount)',
  'function executeWithdrawal()',
  'function cancelWithdrawal()',
  'function deactivate()',
  'function reactivate()',
  'function getAgent(address agent) view returns (tuple(address owner, string name, uint256 stake, uint64 registeredAt, uint64 totalTrades, int64 totalPnl, uint64 copiers, uint64 successfulTrades, bool active))',
  'function isRegistered(address agent) view returns (bool)',
  'function getAgents(uint256 offset, uint256 limit) view returns (address[])',
  'function getSuccessRate(address agent) view returns (uint256)',
  'function minStake() pure returns (uint256)',
  'function withdrawalRequestTime(address agent) view returns (uint64)',
  'function withdrawalRequestAmount(address agent) view returns (uint256)',
  'function totalAgents() view returns (uint256)',
  'function totalStaked() view returns (uint256)',
  'function totalSlashed() view returns (uint256)',
  'event AgentRegistered(address indexed agent, string name, uint256 stake)',
] as const;

export const KAMIYO_VAULT_ABI = [
  'function openPosition(address agent, int16 minReturnBps, uint64 lockPeriod) payable returns (uint256)',
  'function closePosition(uint256 positionId)',
  'function fileDispute(uint256 positionId) payable returns (uint256)',
  'function getPosition(uint256 positionId) view returns (tuple(address user, address agent, uint256 deposit, uint256 currentValue, int16 minReturnBps, uint64 startTime, uint64 lockPeriod, uint64 endTime, bool active, bool disputed))',
  'function getDispute(uint256 disputeId) view returns (tuple(uint256 positionId, address user, address agent, uint64 filedAt, int64 actualReturnBps, int16 expectedReturnBps, bool resolved, bool userWon))',
  'function getUserPositions(address user) view returns (uint256[])',
  'function getAgentPositions(address agent) view returns (uint256[])',
  'function getUserActivePositions(address user) view returns (tuple(tuple(address user, address agent, uint256 deposit, uint256 currentValue, int16 minReturnBps, uint64 startTime, uint64 lockPeriod, uint64 endTime, bool active, bool disputed)[], uint256[]))',
  'function canClosePosition(uint256 positionId) view returns (bool, string)',
  'function getPositionReturn(uint256 positionId) view returns (int64)',
  'function disputeFee() view returns (uint256)',
  'function totalDeposits() view returns (uint256)',
  'function totalFees() view returns (uint256)',
  'function positionCount() view returns (uint256)',
  'function disputeCount() view returns (uint256)',
  'event PositionOpened(uint256 indexed positionId, address indexed user, address indexed agent, uint256 deposit, int16 minReturnBps, uint64 lockPeriod)',
] as const;

export const REPUTATION_LIMITS_ABI = [
  'function proveReputation(uint8 tier, bytes32 commitment, uint256[2] proofA, uint256[2][2] proofB, uint256[2] proofC, uint256[] pubInputs)',
  'function getCopyLimits(address agent) view returns (uint256 maxCopyLimit, uint256 maxCopiers)',
  'function canAcceptDeposit(address agent, uint256 currentAUM, uint256 currentCopiers, uint256 newDeposit) view returns (bool allowed, string reason)',
  'function getTier(uint8 tier) view returns (tuple(uint256 threshold, uint256 maxCopyLimit, uint256 maxCopiers))',
  'function tierCount() view returns (uint256)',
  'function getAgentTierInfo(address agent) view returns (uint8 tier, uint64 verifiedAt, tuple(uint256 threshold, uint256 maxCopyLimit, uint256 maxCopiers) tierInfo)',
] as const;

export const HYPERCORE_ABI = [
  'function getAccountInfo(address account) view returns (tuple(uint256 accountValue, uint256 totalMarginUsed, uint256 withdrawable, int256 totalPnl))',
  'function getPosition(address account, uint32 assetIndex) view returns (tuple(int256 size, int256 entryPrice, int256 markPrice, int256 unrealizedPnl, uint256 margin, uint256 leverage))',
  'function getMarketInfo(uint32 assetIndex) view returns (tuple(uint256 markPrice, uint256 indexPrice, int256 fundingRate, uint256 openInterest))',
] as const;

export const HYPERCORE_ADDRESS = '0x0000000000000000000000000000000000000800';

export const VAULT_ORACLE_ABI = [
  'function updatePositionValue(uint256 positionId, uint256 newValue)',
  'function batchUpdatePositionValues(uint256[] positionIds, uint256[] newValues)',
  'function resolveDispute(uint256 disputeId, bool userWins)',
  'function getPosition(uint256 positionId) view returns (tuple(address user, address agent, uint256 deposit, uint256 currentValue, int16 minReturnBps, uint64 startTime, uint64 lockPeriod, uint64 endTime, bool active, bool disputed))',
  'function getDispute(uint256 disputeId) view returns (tuple(uint256 positionId, address user, address agent, uint64 filedAt, int64 actualReturnBps, int16 expectedReturnBps, bool resolved, bool userWon))',
  'function positionCount() view returns (uint256)',
  'function disputeCount() view returns (uint256)',
  'event DisputeFiled(uint256 indexed disputeId, uint256 indexed positionId, address indexed user)',
] as const;

export const AGENT_REGISTRY_EVENTS_ABI = [
  'event AgentRegistered(address indexed agent, string name, uint256 stake)',
  'event AgentDeactivated(address indexed agent)',
  'event AgentReactivated(address indexed agent)',
] as const;

export const KAMIYO_VAULT_EVENTS_ABI = [
  'event PositionOpened(uint256 indexed positionId, address indexed user, address indexed agent, uint256 deposit, int16 minReturnBps, uint64 lockPeriod)',
  'event PositionClosed(uint256 indexed positionId, uint256 returnAmount, int64 returnBps)',
  'event DisputeFiled(uint256 indexed disputeId, uint256 indexed positionId, address user)',
  'event DisputeResolved(uint256 indexed disputeId, bool userWon, uint256 payout)',
] as const;

export const REPUTATION_LIMITS_EVENTS_ABI = [
  'event TierVerified(address indexed agent, uint8 tier, uint256 maxCopyLimit)',
] as const;
