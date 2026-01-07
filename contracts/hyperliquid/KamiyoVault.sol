// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHyperCore} from "./interfaces/IHyperCore.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/**
 * @title KamiyoVault
 * @notice Copy trading vault with escrow and dispute resolution
 * @dev Users deposit to copy an agent's trades with performance guarantees
 */
contract KamiyoVault {
    struct CopyPosition {
        address user;
        address agent;
        uint256 deposit;
        uint256 startValue;
        int16 minReturnBps;      // Minimum return in basis points (-10000 to 10000)
        uint64 startTime;
        uint64 lockPeriod;       // Lock period in seconds
        uint64 endTime;
        bool active;
        bool disputed;
    }

    struct DisputeInfo {
        uint256 positionId;
        address user;
        address agent;
        uint64 filedAt;
        int64 actualReturnBps;
        int16 expectedReturnBps;
        bool resolved;
        bool userWon;
    }

    AgentRegistry public immutable agentRegistry;

    uint256 public positionCount;
    uint256 public disputeCount;

    mapping(uint256 => CopyPosition) public positions;
    mapping(uint256 => DisputeInfo) public disputes;
    mapping(address => uint256[]) public userPositions;
    mapping(address => uint256[]) public agentPositions;

    // Dispute resolution
    address public disputeResolver;
    uint256 public disputeFee = 0.01 ether;
    uint64 public constant DISPUTE_WINDOW = 7 days;

    event PositionOpened(
        uint256 indexed positionId,
        address indexed user,
        address indexed agent,
        uint256 deposit,
        int16 minReturnBps,
        uint64 lockPeriod
    );
    event PositionClosed(uint256 indexed positionId, uint256 returnAmount, int64 returnBps);
    event DisputeFiled(uint256 indexed disputeId, uint256 indexed positionId, address user);
    event DisputeResolved(uint256 indexed disputeId, bool userWon, uint256 payout);

    error AgentNotActive();
    error InsufficientDeposit();
    error PositionNotActive();
    error PositionLocked();
    error DisputeWindowClosed();
    error AlreadyDisputed();
    error NotAuthorized();
    error InvalidReturn();

    modifier onlyDisputeResolver() {
        if (msg.sender != disputeResolver) revert NotAuthorized();
        _;
    }

    constructor(address _agentRegistry, address _disputeResolver) {
        agentRegistry = AgentRegistry(payable(_agentRegistry));
        disputeResolver = _disputeResolver;
    }

    /**
     * @notice Open a copy trading position
     * @param agent Agent to copy
     * @param minReturnBps Minimum expected return in basis points (e.g., 500 = 5%)
     * @param lockPeriod How long funds are locked
     */
    function openPosition(
        address agent,
        int16 minReturnBps,
        uint64 lockPeriod
    ) external payable returns (uint256 positionId) {
        if (msg.value == 0) revert InsufficientDeposit();

        AgentRegistry.Agent memory agentInfo = agentRegistry.getAgent(agent);
        if (!agentInfo.active) revert AgentNotActive();

        positionId = positionCount++;

        positions[positionId] = CopyPosition({
            user: msg.sender,
            agent: agent,
            deposit: msg.value,
            startValue: msg.value,
            minReturnBps: minReturnBps,
            startTime: uint64(block.timestamp),
            lockPeriod: lockPeriod,
            endTime: 0,
            active: true,
            disputed: false
        });

        userPositions[msg.sender].push(positionId);
        agentPositions[agent].push(positionId);

        // Update agent copier count
        agentRegistry.updateCopiers(agent, true);

        emit PositionOpened(positionId, msg.sender, agent, msg.value, minReturnBps, lockPeriod);
    }

    /**
     * @notice Close a copy position and withdraw funds
     * @param positionId Position to close
     */
    function closePosition(uint256 positionId) external {
        CopyPosition storage pos = positions[positionId];

        if (!pos.active) revert PositionNotActive();
        if (msg.sender != pos.user) revert NotAuthorized();
        if (block.timestamp < pos.startTime + pos.lockPeriod) revert PositionLocked();

        pos.active = false;
        pos.endTime = uint64(block.timestamp);

        // Calculate returns (simplified - in production would track actual copy trades)
        uint256 currentValue = _calculatePositionValue(positionId);
        int64 returnBps = _calculateReturnBps(pos.deposit, currentValue);

        // Update agent copier count
        agentRegistry.updateCopiers(pos.agent, false);

        // Transfer funds back to user
        payable(pos.user).transfer(currentValue);

        emit PositionClosed(positionId, currentValue, returnBps);
    }

    /**
     * @notice File a dispute if returns are below promised minimum
     * @param positionId Position to dispute
     */
    function fileDispute(uint256 positionId) external payable {
        CopyPosition storage pos = positions[positionId];

        if (msg.sender != pos.user) revert NotAuthorized();
        if (pos.disputed) revert AlreadyDisputed();
        if (!pos.active && block.timestamp > pos.endTime + DISPUTE_WINDOW) {
            revert DisputeWindowClosed();
        }
        if (msg.value < disputeFee) revert InsufficientDeposit();

        pos.disputed = true;

        uint256 currentValue = _calculatePositionValue(positionId);
        int64 actualReturnBps = _calculateReturnBps(pos.deposit, currentValue);

        uint256 disputeId = disputeCount++;
        disputes[disputeId] = DisputeInfo({
            positionId: positionId,
            user: pos.user,
            agent: pos.agent,
            filedAt: uint64(block.timestamp),
            actualReturnBps: actualReturnBps,
            expectedReturnBps: pos.minReturnBps,
            resolved: false,
            userWon: false
        });

        emit DisputeFiled(disputeId, positionId, pos.user);
    }

    /**
     * @notice Resolve a dispute (called by oracle/resolver)
     * @param disputeId Dispute to resolve
     * @param userWins Whether the user wins the dispute
     */
    function resolveDispute(uint256 disputeId, bool userWins) external onlyDisputeResolver {
        DisputeInfo storage dispute = disputes[disputeId];
        CopyPosition storage pos = positions[dispute.positionId];

        dispute.resolved = true;
        dispute.userWon = userWins;

        uint256 payout;
        if (userWins) {
            // User wins: return deposit + slash agent
            payout = pos.deposit;
            agentRegistry.slash(pos.agent, "Dispute lost - failed to meet return target");
        } else {
            // Agent wins: return current value minus fee
            payout = _calculatePositionValue(dispute.positionId);
        }

        if (pos.active) {
            pos.active = false;
            pos.endTime = uint64(block.timestamp);
            agentRegistry.updateCopiers(pos.agent, false);
        }

        payable(dispute.user).transfer(payout);

        emit DisputeResolved(disputeId, userWins, payout);
    }

    /**
     * @notice Calculate current position value
     * @dev In production, this would query HyperCore precompiles for actual PnL
     */
    function _calculatePositionValue(uint256 positionId) internal view returns (uint256) {
        CopyPosition storage pos = positions[positionId];
        // Simplified: return deposit (actual implementation would track copy trades)
        return pos.deposit;
    }

    /**
     * @notice Calculate return in basis points
     */
    function _calculateReturnBps(uint256 start, uint256 end) internal pure returns (int64) {
        if (start == 0) return 0;
        int256 diff = int256(end) - int256(start);
        return int64((diff * 10000) / int256(start));
    }

    /**
     * @notice Get user's positions
     */
    function getUserPositions(address user) external view returns (uint256[] memory) {
        return userPositions[user];
    }

    /**
     * @notice Get agent's positions
     */
    function getAgentPositions(address agent) external view returns (uint256[] memory) {
        return agentPositions[agent];
    }

    /**
     * @notice Update dispute fee
     */
    function setDisputeFee(uint256 _fee) external onlyDisputeResolver {
        disputeFee = _fee;
    }

    receive() external payable {}
}
