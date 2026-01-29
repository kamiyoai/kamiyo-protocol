// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {VaultStorage} from "./VaultStorage.sol";
import {AgentRegistry} from "../AgentRegistry.sol";
import {ReputationLimits} from "../ReputationLimits.sol";

/**
 * @title VaultCore
 * @notice Core vault with initialization and admin functions
 */
contract VaultCore is VaultStorage, ReentrancyGuard, Pausable {
    event AdminTransferInitiated(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferCompleted(address indexed oldAdmin, address indexed newAdmin);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event ReputationLimitsUpdated(address indexed oldLimits, address indexed newLimits);
    event DisputeFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed recipient, uint256 amount);
    event ModulesUpdated(address positionModule, address disputeModule);

    constructor(address _agentRegistry, address _disputeResolver) {
        if (_agentRegistry == address(0) || _disputeResolver == address(0)) revert ZeroAddress();
        agentRegistry = AgentRegistry(payable(_agentRegistry));
        disputeResolver = _disputeResolver;
        admin = msg.sender;
        feeRecipient = msg.sender;
        disputeFee = 0.01 ether;
    }

    function setModules(address _positionModule, address _disputeModule) external onlyAdmin {
        positionModule = _positionModule;
        disputeModule = _disputeModule;
        emit ModulesUpdated(_positionModule, _disputeModule);
    }

    function transferAdmin(address newAdmin) external onlyAdmin validAddress(newAdmin) {
        pendingAdmin = newAdmin;
        emit AdminTransferInitiated(admin, newAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotAuthorized();
        emit AdminTransferCompleted(admin, msg.sender);
        admin = msg.sender;
        pendingAdmin = address(0);
    }

    function setDisputeFee(uint256 _fee) external onlyAdmin {
        emit DisputeFeeUpdated(disputeFee, _fee);
        disputeFee = _fee;
    }

    function setDisputeResolver(address _resolver) external onlyAdmin validAddress(_resolver) {
        disputeResolver = _resolver;
    }

    function setFeeRecipient(address _recipient) external onlyAdmin validAddress(_recipient) {
        emit FeeRecipientUpdated(feeRecipient, _recipient);
        feeRecipient = _recipient;
    }

    function setReputationLimits(address _limits) external onlyAdmin {
        emit ReputationLimitsUpdated(address(reputationLimits), _limits);
        reputationLimits = ReputationLimits(_limits);
    }

    function withdrawFees() external onlyAdmin nonReentrant {
        uint256 amount = totalFees;
        totalFees = 0;
        _safeTransfer(feeRecipient, amount);
        emit FeesWithdrawn(feeRecipient, amount);
    }

    function pause() external onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin {
        _unpause();
    }

    // View functions
    function getPosition(uint256 positionId) external view returns (CopyPosition memory) {
        return _positions[positionId];
    }

    function getDispute(uint256 disputeId) external view returns (DisputeInfo memory) {
        return _disputes[disputeId];
    }

    function getUserPositions(address user) external view returns (uint256[] memory) {
        return _userPositions[user];
    }

    function getAgentPositions(address agent) external view returns (uint256[] memory) {
        return _agentPositions[agent];
    }

    // Internal storage mutators for modules
    function _setPosition(uint256 id, CopyPosition memory pos) external onlyModule {
        _positions[id] = pos;
    }

    function _setDispute(uint256 id, DisputeInfo memory dis) external onlyModule {
        _disputes[id] = dis;
    }

    function _pushUserPosition(address user, uint256 posId) external onlyModule {
        _userPositions[user].push(posId);
    }

    function _pushAgentPosition(address agent, uint256 posId) external onlyModule {
        _agentPositions[agent].push(posId);
    }

    function _incrementPositionCount() external onlyModule returns (uint256) {
        return positionCount++;
    }

    function _incrementDisputeCount() external onlyModule returns (uint256) {
        return disputeCount++;
    }

    function _addTotalDeposits(uint256 amount) external onlyModule {
        totalDeposits += amount;
    }

    function _subTotalDeposits(uint256 amount) external onlyModule {
        totalDeposits -= amount;
    }

    function _addTotalFees(uint256 amount) external onlyModule {
        totalFees += amount;
    }

    function _safeTransfer(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    error TransferFailed();

    receive() external payable {}
}
