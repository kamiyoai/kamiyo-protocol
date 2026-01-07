// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AgentRegistry
 * @author Kamiyo Protocol
 * @notice Registry for trading agents with stake-based reputation
 * @dev Agents stake HYPE to register. Stake serves as collateral for dispute resolution.
 */
contract AgentRegistry is ReentrancyGuard, Pausable {
    

    struct Agent {
        address owner;
        string name;
        uint256 stake;
        uint64 registeredAt;
        uint64 totalTrades;
        int64 totalPnl;
        uint64 copiers;
        uint64 successfulTrades;
        bool active;
    }

    

    uint256 public constant MIN_STAKE = 100e18;
    uint256 public constant SLASH_PERCENT = 10;
    uint256 public constant MAX_NAME_LENGTH = 32;
    uint256 public constant MIN_NAME_LENGTH = 3;
    uint64 public constant WITHDRAWAL_DELAY = 7 days;

    

    mapping(address => Agent) private _agents;
    mapping(address => bool) public isRegistered;
    mapping(address => uint64) public withdrawalRequestTime;
    mapping(address => uint256) public withdrawalRequestAmount;

    address[] private _agentList;
    address public admin;
    address public pendingAdmin;
    address public disputeResolver;
    address public vault;

    uint256 public totalStaked;
    uint256 public totalSlashed;

    

    event AgentRegistered(address indexed agent, string name, uint256 stake);
    event AgentDeactivated(address indexed agent);
    event AgentReactivated(address indexed agent);
    event StakeAdded(address indexed agent, uint256 amount, uint256 newTotal);
    event WithdrawalRequested(address indexed agent, uint256 amount, uint64 availableAt);
    event WithdrawalCancelled(address indexed agent);
    event StakeWithdrawn(address indexed agent, uint256 amount, uint256 remaining);
    event AgentSlashed(address indexed agent, uint256 amount, uint256 remaining, string reason);
    event TradeRecorded(address indexed agent, int64 pnl, bool successful);
    event AdminTransferInitiated(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferCompleted(address indexed oldAdmin, address indexed newAdmin);
    event DisputeResolverUpdated(address indexed oldResolver, address indexed newResolver);
    event VaultUpdated(address indexed oldVault, address indexed newVault);

    

    error AlreadyRegistered();
    error NotRegistered();
    error InsufficientStake();
    error AgentNotActive();
    error NotAuthorized();
    error WithdrawalNotRequested();
    error WithdrawalDelayNotMet();
    error WithdrawalPending();
    error InvalidName();
    error ZeroAddress();
    error TransferFailed();
    error NoPendingAdmin();

    

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAuthorized();
        _;
    }

    modifier onlyDisputeResolver() {
        if (msg.sender != disputeResolver) revert NotAuthorized();
        _;
    }

    modifier onlyVaultOrAdmin() {
        if (msg.sender != vault && msg.sender != admin) revert NotAuthorized();
        _;
    }

    modifier onlyRegistered(address agent) {
        if (!isRegistered[agent]) revert NotRegistered();
        _;
    }

    modifier validAddress(address addr) {
        if (addr == address(0)) revert ZeroAddress();
        _;
    }

    

    constructor(address _disputeResolver) validAddress(_disputeResolver) {
        admin = msg.sender;
        disputeResolver = _disputeResolver;
    }

    

    /**
     * @notice Register as a trading agent
     * @param name Display name (3-32 characters, alphanumeric + underscore)
     */
    function register(string calldata name) external payable whenNotPaused nonReentrant {
        if (isRegistered[msg.sender]) revert AlreadyRegistered();
        if (msg.value < MIN_STAKE) revert InsufficientStake();
        _validateName(name);

        _agents[msg.sender] = Agent({
            owner: msg.sender,
            name: name,
            stake: msg.value,
            registeredAt: uint64(block.timestamp),
            totalTrades: 0,
            totalPnl: 0,
            copiers: 0,
            successfulTrades: 0,
            active: true
        });

        isRegistered[msg.sender] = true;
        _agentList.push(msg.sender);
        totalStaked += msg.value;

        emit AgentRegistered(msg.sender, name, msg.value);
    }

    /**
     * @notice Add stake to increase trust score
     */
    function addStake() external payable whenNotPaused onlyRegistered(msg.sender) nonReentrant {
        if (msg.value == 0) revert InsufficientStake();

        // Cancel any pending withdrawal
        if (withdrawalRequestAmount[msg.sender] > 0) {
            delete withdrawalRequestTime[msg.sender];
            delete withdrawalRequestAmount[msg.sender];
            emit WithdrawalCancelled(msg.sender);
        }

        _agents[msg.sender].stake += msg.value;
        totalStaked += msg.value;

        emit StakeAdded(msg.sender, msg.value, _agents[msg.sender].stake);
    }

    /**
     * @notice Request stake withdrawal (subject to delay)
     * @param amount Amount to withdraw
     */
    function requestWithdrawal(uint256 amount) external onlyRegistered(msg.sender) {
        Agent storage agent = _agents[msg.sender];

        if (agent.copiers > 0) revert NotAuthorized();
        if (amount == 0 || agent.stake < amount) revert InsufficientStake();
        if (agent.active && agent.stake - amount < MIN_STAKE) revert InsufficientStake();
        if (withdrawalRequestAmount[msg.sender] > 0) revert WithdrawalPending();

        withdrawalRequestTime[msg.sender] = uint64(block.timestamp);
        withdrawalRequestAmount[msg.sender] = amount;

        emit WithdrawalRequested(msg.sender, amount, uint64(block.timestamp) + WITHDRAWAL_DELAY);
    }

    /**
     * @notice Execute pending withdrawal after delay
     */
    function executeWithdrawal() external onlyRegistered(msg.sender) nonReentrant {
        uint256 amount = withdrawalRequestAmount[msg.sender];
        uint64 requestTime = withdrawalRequestTime[msg.sender];

        if (amount == 0) revert WithdrawalNotRequested();
        if (block.timestamp < requestTime + WITHDRAWAL_DELAY) revert WithdrawalDelayNotMet();

        Agent storage agent = _agents[msg.sender];

        // Re-validate conditions
        if (agent.copiers > 0) revert NotAuthorized();
        if (agent.stake < amount) revert InsufficientStake();

        agent.stake -= amount;
        totalStaked -= amount;

        delete withdrawalRequestTime[msg.sender];
        delete withdrawalRequestAmount[msg.sender];

        _safeTransfer(msg.sender, amount);

        emit StakeWithdrawn(msg.sender, amount, agent.stake);
    }

    /**
     * @notice Cancel pending withdrawal
     */
    function cancelWithdrawal() external onlyRegistered(msg.sender) {
        if (withdrawalRequestAmount[msg.sender] == 0) revert WithdrawalNotRequested();

        delete withdrawalRequestTime[msg.sender];
        delete withdrawalRequestAmount[msg.sender];

        emit WithdrawalCancelled(msg.sender);
    }

    /**
     * @notice Deactivate agent (stops accepting new copiers)
     */
    function deactivate() external onlyRegistered(msg.sender) {
        if (!_agents[msg.sender].active) revert AgentNotActive();
        _agents[msg.sender].active = false;
        emit AgentDeactivated(msg.sender);
    }

    /**
     * @notice Reactivate agent
     */
    function reactivate() external onlyRegistered(msg.sender) {
        Agent storage agent = _agents[msg.sender];
        if (agent.active) revert NotAuthorized();
        if (agent.stake < MIN_STAKE) revert InsufficientStake();

        agent.active = true;
        emit AgentReactivated(msg.sender);
    }

    /**
     * @notice Record trade outcome for an agent
     * @param agent Agent address
     * @param pnl PnL from the trade in basis points
     * @param successful Whether trade met user expectations
     */
    function recordTrade(
        address agent,
        int64 pnl,
        bool successful
    ) external onlyVaultOrAdmin onlyRegistered(agent) {
        Agent storage a = _agents[agent];
        a.totalTrades++;
        a.totalPnl += pnl;
        if (successful) {
            a.successfulTrades++;
        }
        emit TradeRecorded(agent, pnl, successful);
    }

    /**
     * @notice Slash agent stake after losing dispute
     * @param agent Agent to slash
     * @param reason Reason for slashing
     * @return slashAmount Amount slashed
     */
    function slash(
        address agent,
        string calldata reason
    ) external onlyVaultOrAdmin onlyRegistered(agent) nonReentrant returns (uint256 slashAmount) {
        Agent storage a = _agents[agent];
        slashAmount = (a.stake * SLASH_PERCENT) / 100;

        if (slashAmount > a.stake) {
            slashAmount = a.stake;
        }

        a.stake -= slashAmount;
        totalStaked -= slashAmount;
        totalSlashed += slashAmount;

        _safeTransfer(disputeResolver, slashAmount);

        emit AgentSlashed(agent, slashAmount, a.stake, reason);
    }

    /**
     * @notice Update copier count (called by vault)
     * @param agent Agent address
     * @param increment True to increment, false to decrement
     */
    function updateCopiers(
        address agent,
        bool increment
    ) external onlyVaultOrAdmin onlyRegistered(agent) {
        if (increment) {
            _agents[agent].copiers++;
        } else if (_agents[agent].copiers > 0) {
            _agents[agent].copiers--;
        }
    }

    

    /**
     * @notice Initiate admin transfer (2-step process)
     * @param newAdmin New admin address
     */
    function transferAdmin(address newAdmin) external onlyAdmin validAddress(newAdmin) {
        pendingAdmin = newAdmin;
        emit AdminTransferInitiated(admin, newAdmin);
    }

    /**
     * @notice Accept admin role
     */
    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotAuthorized();
        emit AdminTransferCompleted(admin, msg.sender);
        admin = msg.sender;
        pendingAdmin = address(0);
    }

    /**
     * @notice Set dispute resolver address
     * @param _resolver New resolver address
     */
    function setDisputeResolver(address _resolver) external onlyAdmin validAddress(_resolver) {
        emit DisputeResolverUpdated(disputeResolver, _resolver);
        disputeResolver = _resolver;
    }

    /**
     * @notice Set vault address
     * @param _vault New vault address
     */
    function setVault(address _vault) external onlyAdmin validAddress(_vault) {
        emit VaultUpdated(vault, _vault);
        vault = _vault;
    }

    /**
     * @notice Pause contract
     */
    function pause() external onlyAdmin {
        _pause();
    }

    /**
     * @notice Unpause contract
     */
    function unpause() external onlyAdmin {
        _unpause();
    }

    

    /**
     * @notice Get agent info
     * @param agent Agent address
     * @return Agent struct
     */
    function getAgent(address agent) external view returns (Agent memory) {
        return _agents[agent];
    }

    /**
     * @notice Get agent success rate in basis points
     * @param agent Agent address
     * @return Success rate (0-10000)
     */
    function getSuccessRate(address agent) external view returns (uint256) {
        Agent storage a = _agents[agent];
        if (a.totalTrades == 0) return 0;
        return (uint256(a.successfulTrades) * 10000) / uint256(a.totalTrades);
    }

    /**
     * @notice Get paginated list of agents
     * @param offset Starting index
     * @param limit Max agents to return
     * @return agents Array of agent addresses
     * @return total Total number of registered agents
     */
    function getAgents(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory agents, uint256 total) {
        total = _agentList.length;

        if (offset >= total) {
            return (new address[](0), total);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        agents = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            agents[i - offset] = _agentList[i];
        }
    }

    /**
     * @notice Get total number of registered agents
     * @return count Number of agents
     */
    function totalAgents() external view returns (uint256) {
        return _agentList.length;
    }

    /**
     * @notice Get minimum stake requirement
     * @return Minimum stake in wei
     */
    function minStake() external pure returns (uint256) {
        return MIN_STAKE;
    }

    

    function _validateName(string calldata name) internal pure {
        bytes memory nameBytes = bytes(name);
        if (nameBytes.length < MIN_NAME_LENGTH || nameBytes.length > MAX_NAME_LENGTH) {
            revert InvalidName();
        }

        for (uint256 i = 0; i < nameBytes.length; i++) {
            bytes1 char = nameBytes[i];
            bool valid = (char >= 0x30 && char <= 0x39) || // 0-9
                        (char >= 0x41 && char <= 0x5A) ||  // A-Z
                        (char >= 0x61 && char <= 0x7A) ||  // a-z
                        char == 0x5F;                       // _
            if (!valid) revert InvalidName();
        }
    }

    function _safeTransfer(address to, uint256 amount) internal {
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    receive() external payable {}
}
