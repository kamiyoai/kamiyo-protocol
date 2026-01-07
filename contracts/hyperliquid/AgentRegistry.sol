// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHyperCore} from "./interfaces/IHyperCore.sol";

/**
 * @title AgentRegistry
 * @notice Registry for Kamiyo trading agents on Hyperliquid
 * @dev Agents stake HYPE to register and build reputation through trading
 */
contract AgentRegistry {
    struct Agent {
        address owner;
        string name;
        uint256 stake;
        uint64 registeredAt;
        uint64 totalTrades;
        int64 totalPnl;
        uint64 copiers;
        bool active;
    }

    uint256 public constant MIN_STAKE = 100e18; // 100 HYPE minimum
    uint256 public constant SLASH_PERCENT = 10; // 10% slash on dispute loss

    mapping(address => Agent) public agents;
    mapping(address => bool) public isRegistered;

    address[] public agentList;
    address public admin;
    address public disputeResolver;

    event AgentRegistered(address indexed agent, string name, uint256 stake);
    event AgentDeactivated(address indexed agent);
    event StakeAdded(address indexed agent, uint256 amount);
    event StakeWithdrawn(address indexed agent, uint256 amount);
    event AgentSlashed(address indexed agent, uint256 amount, string reason);
    event TradeRecorded(address indexed agent, int64 pnl);

    error AlreadyRegistered();
    error NotRegistered();
    error InsufficientStake();
    error AgentNotActive();
    error NotAuthorized();
    error WithdrawalLocked();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAuthorized();
        _;
    }

    modifier onlyDisputeResolver() {
        if (msg.sender != disputeResolver) revert NotAuthorized();
        _;
    }

    modifier onlyRegistered(address agent) {
        if (!isRegistered[agent]) revert NotRegistered();
        _;
    }

    constructor(address _disputeResolver) {
        admin = msg.sender;
        disputeResolver = _disputeResolver;
    }

    /**
     * @notice Register as a trading agent
     * @param name Display name for the agent
     */
    function register(string calldata name) external payable {
        if (isRegistered[msg.sender]) revert AlreadyRegistered();
        if (msg.value < MIN_STAKE) revert InsufficientStake();

        agents[msg.sender] = Agent({
            owner: msg.sender,
            name: name,
            stake: msg.value,
            registeredAt: uint64(block.timestamp),
            totalTrades: 0,
            totalPnl: 0,
            copiers: 0,
            active: true
        });

        isRegistered[msg.sender] = true;
        agentList.push(msg.sender);

        emit AgentRegistered(msg.sender, name, msg.value);
    }

    /**
     * @notice Add more stake to increase trust
     */
    function addStake() external payable onlyRegistered(msg.sender) {
        agents[msg.sender].stake += msg.value;
        emit StakeAdded(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw stake (only if no active copiers)
     * @param amount Amount to withdraw
     */
    function withdrawStake(uint256 amount) external onlyRegistered(msg.sender) {
        Agent storage agent = agents[msg.sender];

        if (agent.copiers > 0) revert WithdrawalLocked();
        if (agent.stake < amount) revert InsufficientStake();
        if (agent.stake - amount < MIN_STAKE && agent.active) revert InsufficientStake();

        agent.stake -= amount;
        payable(msg.sender).transfer(amount);

        emit StakeWithdrawn(msg.sender, amount);
    }

    /**
     * @notice Deactivate agent (stops accepting new copiers)
     */
    function deactivate() external onlyRegistered(msg.sender) {
        agents[msg.sender].active = false;
        emit AgentDeactivated(msg.sender);
    }

    /**
     * @notice Record a trade outcome for an agent
     * @param agent Agent address
     * @param pnl PnL from the trade
     */
    function recordTrade(address agent, int64 pnl) external onlyAdmin onlyRegistered(agent) {
        agents[agent].totalTrades++;
        agents[agent].totalPnl += pnl;
        emit TradeRecorded(agent, pnl);
    }

    /**
     * @notice Slash agent stake after losing dispute
     * @param agent Agent to slash
     * @param reason Reason for slashing
     */
    function slash(address agent, string calldata reason) external onlyDisputeResolver onlyRegistered(agent) {
        Agent storage a = agents[agent];
        uint256 slashAmount = (a.stake * SLASH_PERCENT) / 100;
        a.stake -= slashAmount;

        // Send slashed funds to dispute resolver (for distribution)
        payable(disputeResolver).transfer(slashAmount);

        emit AgentSlashed(agent, slashAmount, reason);
    }

    /**
     * @notice Update copier count
     */
    function updateCopiers(address agent, bool increment) external onlyAdmin onlyRegistered(agent) {
        if (increment) {
            agents[agent].copiers++;
        } else if (agents[agent].copiers > 0) {
            agents[agent].copiers--;
        }
    }

    /**
     * @notice Get agent info
     */
    function getAgent(address agent) external view returns (Agent memory) {
        return agents[agent];
    }

    /**
     * @notice Get total number of registered agents
     */
    function totalAgents() external view returns (uint256) {
        return agentList.length;
    }

    /**
     * @notice Set dispute resolver address
     */
    function setDisputeResolver(address _resolver) external onlyAdmin {
        disputeResolver = _resolver;
    }

    receive() external payable {}
}
