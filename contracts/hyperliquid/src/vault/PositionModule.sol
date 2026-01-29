// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VaultCore} from "./VaultCore.sol";
import {VaultStorage} from "./VaultStorage.sol";
import {AgentRegistry} from "../AgentRegistry.sol";

/**
 * @title PositionModule
 * @notice Handles position opening and closing
 */
contract PositionModule is ReentrancyGuard {
    VaultCore public immutable vault;

    event PositionOpened(
        uint256 indexed positionId,
        address indexed user,
        address indexed agent,
        uint256 deposit,
        int16 minReturnBps,
        uint64 lockPeriod
    );
    event PositionClosed(uint256 indexed positionId, uint256 returnAmount, int64 returnBps);

    error AgentNotActive();
    error InsufficientDeposit();
    error ExcessiveDeposit();
    error PositionNotActive();
    error PositionLocked();
    error NotAuthorized();
    error InvalidReturnBps();
    error InvalidLockPeriod();
    error ExceedsTierLimit();
    error TransferFailed();

    constructor(address _vault) {
        vault = VaultCore(payable(_vault));
    }

    function openPosition(
        address agent,
        int16 minReturnBps,
        uint64 lockPeriod
    ) external payable nonReentrant returns (uint256 positionId) {
        if (msg.value < vault.MIN_DEPOSIT()) revert InsufficientDeposit();
        if (msg.value > vault.MAX_DEPOSIT()) revert ExcessiveDeposit();
        if (minReturnBps < vault.MIN_RETURN_BPS() || minReturnBps > vault.MAX_RETURN_BPS()) {
            revert InvalidReturnBps();
        }
        if (lockPeriod < vault.MIN_LOCK_PERIOD() || lockPeriod > vault.MAX_LOCK_PERIOD()) {
            revert InvalidLockPeriod();
        }

        AgentRegistry registry = vault.agentRegistry();
        AgentRegistry.Agent memory agentInfo = registry.getAgent(agent);
        if (!agentInfo.active) revert AgentNotActive();

        positionId = vault._incrementPositionCount();

        VaultStorage.CopyPosition memory pos = VaultStorage.CopyPosition({
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

        vault._setPosition(positionId, pos);
        vault._pushUserPosition(msg.sender, positionId);
        vault._pushAgentPosition(agent, positionId);
        vault._addTotalDeposits(msg.value);

        registry.updateCopiers(agent, true);

        (bool success, ) = address(vault).call{value: msg.value}("");
        if (!success) revert TransferFailed();

        emit PositionOpened(positionId, msg.sender, agent, msg.value, minReturnBps, lockPeriod);
    }

    function closePosition(uint256 positionId) external nonReentrant {
        VaultStorage.CopyPosition memory pos = vault.getPosition(positionId);

        if (!pos.active) revert PositionNotActive();
        if (msg.sender != pos.user) revert NotAuthorized();
        if (block.timestamp < pos.startTime + pos.lockPeriod) revert PositionLocked();

        pos.active = false;
        pos.endTime = uint64(block.timestamp);

        int64 returnBps = _calculateReturnBps(pos.deposit, pos.currentValue);

        uint256 payout = pos.currentValue;
        if (pos.currentValue > pos.deposit) {
            uint256 profit = pos.currentValue - pos.deposit;
            uint256 fee = (profit * vault.PROTOCOL_FEE_BPS()) / 10000;
            payout = pos.currentValue - fee;
            vault._addTotalFees(fee);
        }

        vault._setPosition(positionId, pos);
        vault._subTotalDeposits(pos.deposit);

        AgentRegistry registry = vault.agentRegistry();
        registry.updateCopiers(pos.agent, false);
        registry.recordTrade(pos.agent, returnBps, returnBps >= pos.minReturnBps);

        (bool success, ) = pos.user.call{value: payout}("");
        if (!success) revert TransferFailed();

        emit PositionClosed(positionId, payout, returnBps);
    }

    function _calculateReturnBps(uint256 start, uint256 end) internal pure returns (int64) {
        if (start == 0) return 0;
        int256 diff = int256(end) - int256(start);
        return int64((diff * 10000) / int256(start));
    }
}
