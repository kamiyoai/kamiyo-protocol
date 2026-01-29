// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VaultCore} from "./VaultCore.sol";
import {VaultStorage} from "./VaultStorage.sol";

/**
 * @title ValueUpdateModule
 * @notice Handles position value updates and emergency withdrawals
 */
contract ValueUpdateModule {
    VaultCore public immutable vault;

    event PositionValueUpdated(uint256 indexed positionId, uint256 oldValue, uint256 newValue);
    event EmergencyWithdrawal(uint256 indexed positionId, address indexed user, uint256 amount);

    error PositionNotActive();
    error PositionLocked();
    error NotAuthorized();
    error ExcessiveValueChange();
    error LengthMismatch();
    error TransferFailed();

    constructor(address _vault) {
        vault = VaultCore(payable(_vault));
    }

    function updatePositionValue(uint256 positionId, uint256 newValue) external {
        if (msg.sender != vault.disputeResolver()) revert NotAuthorized();

        VaultStorage.CopyPosition memory pos = vault.getPosition(positionId);
        if (!pos.active) revert PositionNotActive();

        _validateValueChange(pos.currentValue, newValue);

        uint256 oldValue = pos.currentValue;
        pos.currentValue = newValue;
        vault._setPosition(positionId, pos);

        emit PositionValueUpdated(positionId, oldValue, newValue);
    }

    function batchUpdatePositionValues(
        uint256[] calldata positionIds,
        uint256[] calldata newValues
    ) external {
        if (msg.sender != vault.disputeResolver()) revert NotAuthorized();
        if (positionIds.length != newValues.length) revert LengthMismatch();

        for (uint256 i = 0; i < positionIds.length; i++) {
            VaultStorage.CopyPosition memory pos = vault.getPosition(positionIds[i]);
            if (pos.active) {
                _validateValueChange(pos.currentValue, newValues[i]);
                uint256 oldValue = pos.currentValue;
                pos.currentValue = newValues[i];
                vault._setPosition(positionIds[i], pos);
                emit PositionValueUpdated(positionIds[i], oldValue, newValues[i]);
            }
        }
    }

    function emergencyWithdraw(uint256 positionId) external {
        if (msg.sender != vault.admin()) revert NotAuthorized();

        VaultStorage.CopyPosition memory pos = vault.getPosition(positionId);
        if (!pos.active) revert PositionNotActive();
        if (block.timestamp < pos.startTime + pos.lockPeriod + 30 days) {
            revert PositionLocked();
        }

        pos.active = false;
        pos.endTime = uint64(block.timestamp);
        vault._setPosition(positionId, pos);
        vault._subTotalDeposits(pos.deposit);

        vault.agentRegistry().updateCopiers(pos.agent, false);

        (bool success, ) = pos.user.call{value: pos.currentValue}("");
        if (!success) revert TransferFailed();

        emit EmergencyWithdrawal(positionId, pos.user, pos.currentValue);
    }

    function _validateValueChange(uint256 oldValue, uint256 newValue) internal view {
        if (oldValue == 0) return;
        uint256 maxChange = (oldValue * vault.MAX_VALUE_CHANGE_BPS()) / 10000;
        uint256 diff = newValue > oldValue ? newValue - oldValue : oldValue - newValue;
        if (diff > maxChange) revert ExcessiveValueChange();
    }
}
