// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentRegistry} from "../AgentRegistry.sol";
import {ReputationLimits} from "../ReputationLimits.sol";

/**
 * @title VaultStorage
 * @notice Shared storage for modular vault system
 */
abstract contract VaultStorage {
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
    int16 public constant MIN_RETURN_BPS = -5000;
    int16 public constant MAX_RETURN_BPS = 10000;
    uint256 public constant PROTOCOL_FEE_BPS = 100;
    uint256 public constant MAX_VALUE_CHANGE_BPS = 2000;

    AgentRegistry public agentRegistry;
    ReputationLimits public reputationLimits;

    uint256 public positionCount;
    uint256 public disputeCount;
    uint256 public totalDeposits;
    uint256 public totalFees;

    mapping(uint256 => CopyPosition) internal _positions;
    mapping(uint256 => DisputeInfo) internal _disputes;
    mapping(address => uint256[]) internal _userPositions;
    mapping(address => uint256[]) internal _agentPositions;

    address public admin;
    address public pendingAdmin;
    address public disputeResolver;
    address public feeRecipient;
    uint256 public disputeFee;

    // Module addresses
    address public positionModule;
    address public disputeModule;

    error NotAuthorized();
    error ZeroAddress();
    error NotModule();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAuthorized();
        _;
    }

    modifier onlyDisputeResolver() {
        if (msg.sender != disputeResolver) revert NotAuthorized();
        _;
    }

    modifier onlyModule() {
        if (msg.sender != positionModule && msg.sender != disputeModule) revert NotModule();
        _;
    }

    modifier validAddress(address addr) {
        if (addr == address(0)) revert ZeroAddress();
        _;
    }
}
