// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VaultCore} from "./VaultCore.sol";
import {VaultStorage} from "./VaultStorage.sol";
import {AgentRegistry} from "../AgentRegistry.sol";

/**
 * @title DisputeModule
 * @notice Handles dispute filing and resolution
 */
contract DisputeModule is ReentrancyGuard {
    VaultCore public immutable vault;

    event DisputeFiled(uint256 indexed disputeId, uint256 indexed positionId, address indexed user);
    event DisputeResolved(uint256 indexed disputeId, bool userWon, uint256 payout);

    error NotAuthorized();
    error AlreadyDisputed();
    error DisputeWindowClosed();
    error InsufficientFee();
    error AlreadyResolved();
    error TransferFailed();

    constructor(address _vault) {
        vault = VaultCore(payable(_vault));
    }

    function fileDispute(uint256 positionId) external payable nonReentrant returns (uint256 disputeId) {
        VaultStorage.CopyPosition memory pos = vault.getPosition(positionId);

        if (msg.sender != pos.user) revert NotAuthorized();
        if (pos.disputed) revert AlreadyDisputed();
        if (!pos.active && block.timestamp > pos.endTime + vault.DISPUTE_WINDOW()) {
            revert DisputeWindowClosed();
        }
        if (msg.value < vault.disputeFee()) revert InsufficientFee();

        pos.disputed = true;
        vault._setPosition(positionId, pos);

        int64 actualReturnBps = _calculateReturnBps(pos.deposit, pos.currentValue);

        disputeId = vault._incrementDisputeCount();

        VaultStorage.DisputeInfo memory dispute = VaultStorage.DisputeInfo({
            positionId: positionId,
            user: pos.user,
            agent: pos.agent,
            filedAt: uint64(block.timestamp),
            actualReturnBps: actualReturnBps,
            expectedReturnBps: pos.minReturnBps,
            resolved: false,
            userWon: false
        });

        vault._setDispute(disputeId, dispute);
        vault._addTotalFees(msg.value);

        (bool success, ) = address(vault).call{value: msg.value}("");
        if (!success) revert TransferFailed();

        emit DisputeFiled(disputeId, positionId, pos.user);
    }

    function resolveDispute(uint256 disputeId, bool userWins) external nonReentrant {
        if (msg.sender != vault.disputeResolver()) revert NotAuthorized();

        VaultStorage.DisputeInfo memory dispute = vault.getDispute(disputeId);
        VaultStorage.CopyPosition memory pos = vault.getPosition(dispute.positionId);

        if (dispute.resolved) revert AlreadyResolved();

        dispute.resolved = true;
        dispute.userWon = userWins;
        vault._setDispute(disputeId, dispute);

        AgentRegistry registry = vault.agentRegistry();
        uint256 payout;

        if (userWins) {
            payout = pos.deposit;
            registry.slash(pos.agent, "Dispute lost: failed to meet return target");
            registry.recordTrade(pos.agent, dispute.actualReturnBps, false);
        } else {
            payout = pos.currentValue;
            registry.recordTrade(pos.agent, dispute.actualReturnBps, true);
        }

        if (pos.active) {
            pos.active = false;
            pos.endTime = uint64(block.timestamp);
            vault._setPosition(dispute.positionId, pos);
            vault._subTotalDeposits(pos.deposit);
            registry.updateCopiers(pos.agent, false);
        }

        (bool success, ) = dispute.user.call{value: payout}("");
        if (!success) revert TransferFailed();

        emit DisputeResolved(disputeId, userWins, payout);
    }

    function _calculateReturnBps(uint256 start, uint256 end) internal pure returns (int64) {
        if (start == 0) return 0;
        int256 diff = int256(end) - int256(start);
        return int64((diff * 10000) / int256(start));
    }
}
