// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/**
 * @title KamiyoVault
 * @author Kamiyo Protocol
 * @notice Copy trading vault with escrow and dispute resolution
 * @dev Users deposit funds to copy agent trades. Deposits are held in escrow with
 *      performance guarantees enforced through dispute resolution.
 */
contract KamiyoVault is ReentrancyGuard, Pausable {
    

    struct CopyPosition {
        address user;
        address agent;
        uint256 deposit;
        uint256 currentValue;
        int16 minReturnBps;
        uint64 startTime;
        uint64 lockPeriod;
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

    

    uint256 public constant MIN_DEPOSIT = 0.01 ether;
    uint256 public constant MAX_DEPOSIT = 1000 ether;
    uint64 public constant MIN_LOCK_PERIOD = 1 days;
    uint64 public constant MAX_LOCK_PERIOD = 365 days;
    uint64 public constant DISPUTE_WINDOW = 7 days;
    int16 public constant MIN_RETURN_BPS = -5000; // -50%
    int16 public constant MAX_RETURN_BPS = 10000; // +100%
    uint256 public constant PROTOCOL_FEE_BPS = 100; // 1%

    

    AgentRegistry public immutable agentRegistry;

    

    uint256 public positionCount;
    uint256 public disputeCount;
    uint256 public totalDeposits;
    uint256 public totalFees;

    mapping(uint256 => CopyPosition) private _positions;
    mapping(uint256 => DisputeInfo) private _disputes;
    mapping(address => uint256[]) private _userPositions;
    mapping(address => uint256[]) private _agentPositions;

    address public admin;
    address public pendingAdmin;
    address public disputeResolver;
    address public feeRecipient;
    uint256 public disputeFee = 0.01 ether;

    

    event PositionOpened(
        uint256 indexed positionId,
        address indexed user,
        address indexed agent,
        uint256 deposit,
        int16 minReturnBps,
        uint64 lockPeriod
    );
    event PositionValueUpdated(uint256 indexed positionId, uint256 oldValue, uint256 newValue);
    event PositionClosed(uint256 indexed positionId, uint256 returnAmount, int64 returnBps);
    event DisputeFiled(uint256 indexed disputeId, uint256 indexed positionId, address indexed user);
    event DisputeResolved(uint256 indexed disputeId, bool userWon, uint256 payout);
    event DisputeFeeUpdated(uint256 oldFee, uint256 newFee);
    event AdminTransferInitiated(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferCompleted(address indexed oldAdmin, address indexed newAdmin);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event FeesWithdrawn(address indexed recipient, uint256 amount);
    event EmergencyWithdrawal(uint256 indexed positionId, address indexed user, uint256 amount);

    

    error AgentNotActive();
    error InsufficientDeposit();
    error ExcessiveDeposit();
    error PositionNotActive();
    error PositionLocked();
    error DisputeWindowClosed();
    error AlreadyDisputed();
    error NotAuthorized();
    error InvalidReturnBps();
    error InvalidLockPeriod();
    error ZeroAddress();
    error TransferFailed();
    error DisputeNotResolved();
    error PositionNotFound();
    error InsufficientFee();

    

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAuthorized();
        _;
    }

    modifier onlyDisputeResolver() {
        if (msg.sender != disputeResolver) revert NotAuthorized();
        _;
    }

    modifier validAddress(address addr) {
        if (addr == address(0)) revert ZeroAddress();
        _;
    }

    

    constructor(
        address _agentRegistry,
        address _disputeResolver
    ) validAddress(_agentRegistry) validAddress(_disputeResolver) {
        agentRegistry = AgentRegistry(payable(_agentRegistry));
        disputeResolver = _disputeResolver;
        admin = msg.sender;
        feeRecipient = msg.sender;
    }

    

    /**
     * @notice Open a copy trading position
     * @param agent Agent to copy
     * @param minReturnBps Minimum expected return in basis points (-5000 to +10000)
     * @param lockPeriod Lock period in seconds (1 day to 365 days)
     * @return positionId The ID of the created position
     */
    function openPosition(
        address agent,
        int16 minReturnBps,
        uint64 lockPeriod
    ) external payable whenNotPaused nonReentrant returns (uint256 positionId) {
        // Validate deposit
        if (msg.value < MIN_DEPOSIT) revert InsufficientDeposit();
        if (msg.value > MAX_DEPOSIT) revert ExcessiveDeposit();

        // Validate parameters
        if (minReturnBps < MIN_RETURN_BPS || minReturnBps > MAX_RETURN_BPS) {
            revert InvalidReturnBps();
        }
        if (lockPeriod < MIN_LOCK_PERIOD || lockPeriod > MAX_LOCK_PERIOD) {
            revert InvalidLockPeriod();
        }

        // Validate agent
        AgentRegistry.Agent memory agentInfo = agentRegistry.getAgent(agent);
        if (!agentInfo.active) revert AgentNotActive();

        positionId = positionCount++;

        _positions[positionId] = CopyPosition({
            user: msg.sender,
            agent: agent,
            deposit: msg.value,
            currentValue: msg.value,
            minReturnBps: minReturnBps,
            startTime: uint64(block.timestamp),
            lockPeriod: lockPeriod,
            endTime: 0,
            active: true,
            disputed: false
        });

        _userPositions[msg.sender].push(positionId);
        _agentPositions[agent].push(positionId);
        totalDeposits += msg.value;

        agentRegistry.updateCopiers(agent, true);

        emit PositionOpened(positionId, msg.sender, agent, msg.value, minReturnBps, lockPeriod);
    }

    /**
     * @notice Close a copy position and withdraw funds
     * @param positionId Position to close
     */
    function closePosition(uint256 positionId) external nonReentrant {
        CopyPosition storage pos = _positions[positionId];

        if (!pos.active) revert PositionNotActive();
        if (msg.sender != pos.user) revert NotAuthorized();
        if (block.timestamp < pos.startTime + pos.lockPeriod) revert PositionLocked();

        _closePosition(positionId);
    }

    /**
     * @notice File a dispute if returns are below promised minimum
     * @param positionId Position to dispute
     * @return disputeId The ID of the created dispute
     */
    function fileDispute(uint256 positionId) external payable nonReentrant returns (uint256 disputeId) {
        CopyPosition storage pos = _positions[positionId];

        if (msg.sender != pos.user) revert NotAuthorized();
        if (pos.disputed) revert AlreadyDisputed();
        if (!pos.active && block.timestamp > pos.endTime + DISPUTE_WINDOW) {
            revert DisputeWindowClosed();
        }
        if (msg.value < disputeFee) revert InsufficientFee();

        pos.disputed = true;

        int64 actualReturnBps = _calculateReturnBps(pos.deposit, pos.currentValue);

        disputeId = disputeCount++;
        _disputes[disputeId] = DisputeInfo({
            positionId: positionId,
            user: pos.user,
            agent: pos.agent,
            filedAt: uint64(block.timestamp),
            actualReturnBps: actualReturnBps,
            expectedReturnBps: pos.minReturnBps,
            resolved: false,
            userWon: false
        });

        // Collect dispute fee
        totalFees += msg.value;

        emit DisputeFiled(disputeId, positionId, pos.user);
    }

    /**
     * @notice Resolve a dispute
     * @param disputeId Dispute to resolve
     * @param userWins Whether the user wins the dispute
     */
    function resolveDispute(uint256 disputeId, bool userWins) external onlyDisputeResolver nonReentrant {
        DisputeInfo storage dispute = _disputes[disputeId];
        CopyPosition storage pos = _positions[dispute.positionId];

        if (dispute.resolved) revert DisputeNotResolved();

        dispute.resolved = true;
        dispute.userWon = userWins;

        uint256 payout;
        if (userWins) {
            // User wins: return full deposit + slash agent
            payout = pos.deposit;
            agentRegistry.slash(pos.agent, "Dispute lost: failed to meet return target");
            agentRegistry.recordTrade(pos.agent, dispute.actualReturnBps, false);
        } else {
            // Agent wins: return current value
            payout = pos.currentValue;
            agentRegistry.recordTrade(pos.agent, dispute.actualReturnBps, true);
        }

        if (pos.active) {
            pos.active = false;
            pos.endTime = uint64(block.timestamp);
            totalDeposits -= pos.deposit;
            agentRegistry.updateCopiers(pos.agent, false);
        }

        _safeTransfer(dispute.user, payout);

        emit DisputeResolved(disputeId, userWins, payout);
    }

    /**
     * @notice Update position value (called by oracle/keeper)
     * @param positionId Position to update
     * @param newValue New position value
     */
    function updatePositionValue(
        uint256 positionId,
        uint256 newValue
    ) external onlyDisputeResolver {
        CopyPosition storage pos = _positions[positionId];
        if (!pos.active) revert PositionNotActive();

        uint256 oldValue = pos.currentValue;
        pos.currentValue = newValue;

        emit PositionValueUpdated(positionId, oldValue, newValue);
    }

    /**
     * @notice Batch update position values
     * @param positionIds Array of position IDs
     * @param newValues Array of new values
     */
    function batchUpdatePositionValues(
        uint256[] calldata positionIds,
        uint256[] calldata newValues
    ) external onlyDisputeResolver {
        require(positionIds.length == newValues.length, "Length mismatch");

        for (uint256 i = 0; i < positionIds.length; i++) {
            CopyPosition storage pos = _positions[positionIds[i]];
            if (pos.active) {
                uint256 oldValue = pos.currentValue;
                pos.currentValue = newValues[i];
                emit PositionValueUpdated(positionIds[i], oldValue, newValues[i]);
            }
        }
    }

    

    /**
     * @notice Initiate admin transfer
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
     * @notice Update dispute fee
     * @param _fee New fee amount
     */
    function setDisputeFee(uint256 _fee) external onlyAdmin {
        emit DisputeFeeUpdated(disputeFee, _fee);
        disputeFee = _fee;
    }

    /**
     * @notice Update dispute resolver
     * @param _resolver New resolver address
     */
    function setDisputeResolver(address _resolver) external onlyAdmin validAddress(_resolver) {
        disputeResolver = _resolver;
    }

    /**
     * @notice Update fee recipient
     * @param _recipient New recipient address
     */
    function setFeeRecipient(address _recipient) external onlyAdmin validAddress(_recipient) {
        emit FeeRecipientUpdated(feeRecipient, _recipient);
        feeRecipient = _recipient;
    }

    /**
     * @notice Withdraw accumulated fees
     */
    function withdrawFees() external onlyAdmin nonReentrant {
        uint256 amount = totalFees;
        totalFees = 0;
        _safeTransfer(feeRecipient, amount);
        emit FeesWithdrawn(feeRecipient, amount);
    }

    /**
     * @notice Emergency withdrawal for stuck positions (after extended dispute period)
     * @param positionId Position to withdraw
     */
    function emergencyWithdraw(uint256 positionId) external onlyAdmin nonReentrant {
        CopyPosition storage pos = _positions[positionId];
        if (!pos.active) revert PositionNotActive();

        // Only allow after 30 days past lock period
        if (block.timestamp < pos.startTime + pos.lockPeriod + 30 days) {
            revert PositionLocked();
        }

        pos.active = false;
        pos.endTime = uint64(block.timestamp);
        totalDeposits -= pos.deposit;

        agentRegistry.updateCopiers(pos.agent, false);
        _safeTransfer(pos.user, pos.currentValue);

        emit EmergencyWithdrawal(positionId, pos.user, pos.currentValue);
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
     * @notice Get position details
     * @param positionId Position ID
     * @return Position struct
     */
    function getPosition(uint256 positionId) external view returns (CopyPosition memory) {
        return _positions[positionId];
    }

    /**
     * @notice Get dispute details
     * @param disputeId Dispute ID
     * @return Dispute struct
     */
    function getDispute(uint256 disputeId) external view returns (DisputeInfo memory) {
        return _disputes[disputeId];
    }

    /**
     * @notice Get user's position IDs
     * @param user User address
     * @return Array of position IDs
     */
    function getUserPositions(address user) external view returns (uint256[] memory) {
        return _userPositions[user];
    }

    /**
     * @notice Get agent's position IDs
     * @param agent Agent address
     * @return Array of position IDs
     */
    function getAgentPositions(address agent) external view returns (uint256[] memory) {
        return _agentPositions[agent];
    }

    /**
     * @notice Get user's active positions with details
     * @param user User address
     * @return positions Array of active CopyPosition structs
     * @return ids Array of position IDs
     */
    function getUserActivePositions(
        address user
    ) external view returns (CopyPosition[] memory positions, uint256[] memory ids) {
        uint256[] memory allIds = _userPositions[user];
        uint256 activeCount = 0;

        // Count active positions
        for (uint256 i = 0; i < allIds.length; i++) {
            if (_positions[allIds[i]].active) activeCount++;
        }

        positions = new CopyPosition[](activeCount);
        ids = new uint256[](activeCount);
        uint256 j = 0;

        for (uint256 i = 0; i < allIds.length; i++) {
            if (_positions[allIds[i]].active) {
                positions[j] = _positions[allIds[i]];
                ids[j] = allIds[i];
                j++;
            }
        }
    }

    /**
     * @notice Calculate current return for a position
     * @param positionId Position ID
     * @return returnBps Return in basis points
     */
    function getPositionReturn(uint256 positionId) external view returns (int64) {
        CopyPosition storage pos = _positions[positionId];
        return _calculateReturnBps(pos.deposit, pos.currentValue);
    }

    /**
     * @notice Check if position can be closed
     * @param positionId Position ID
     * @return canClose Whether position can be closed
     * @return reason Reason if cannot close
     */
    function canClosePosition(
        uint256 positionId
    ) external view returns (bool canClose, string memory reason) {
        CopyPosition storage pos = _positions[positionId];

        if (!pos.active) return (false, "Position not active");
        if (block.timestamp < pos.startTime + pos.lockPeriod) {
            return (false, "Lock period not ended");
        }
        if (pos.disputed) return (false, "Position is disputed");

        return (true, "");
    }

    

    function _closePosition(uint256 positionId) internal {
        CopyPosition storage pos = _positions[positionId];

        pos.active = false;
        pos.endTime = uint64(block.timestamp);

        uint256 currentValue = pos.currentValue;
        int64 returnBps = _calculateReturnBps(pos.deposit, currentValue);

        // Deduct protocol fee on profits
        uint256 payout = currentValue;
        if (currentValue > pos.deposit) {
            uint256 profit = currentValue - pos.deposit;
            uint256 fee = (profit * PROTOCOL_FEE_BPS) / 10000;
            payout = currentValue - fee;
            totalFees += fee;
        }

        totalDeposits -= pos.deposit;
        agentRegistry.updateCopiers(pos.agent, false);

        // Record trade outcome
        bool successful = returnBps >= pos.minReturnBps;
        agentRegistry.recordTrade(pos.agent, returnBps, successful);

        _safeTransfer(pos.user, payout);

        emit PositionClosed(positionId, payout, returnBps);
    }

    function _calculateReturnBps(uint256 start, uint256 end) internal pure returns (int64) {
        if (start == 0) return 0;
        int256 diff = int256(end) - int256(start);
        return int64((diff * 10000) / int256(start));
    }

    function _safeTransfer(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    receive() external payable {}
}
