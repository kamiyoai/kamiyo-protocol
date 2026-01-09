// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract AgentProxy is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    enum AgentType { Trading, Service, Oracle, Custom }

    string public name;
    AgentType public agentType;
    uint64 public reputation;
    uint64 public stakeAmount;
    bool public isActive;
    uint64 public createdAt;
    uint64 public lastActive;
    uint64 public totalEscrows;
    uint64 public successfulEscrows;
    uint64 public disputedEscrows;

    event AgentInitialized(address indexed owner, string name, AgentType agentType);
    event ReputationUpdated(uint64 oldRep, uint64 newRep);
    event StakeUpdated(uint64 oldStake, uint64 newStake);
    event ActiveStatusChanged(bool isActive);
    event EscrowRecorded(bool successful, bool disputed);

    error InvalidName();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _owner, string calldata _name, AgentType _type) external initializer {
        if (bytes(_name).length == 0 || bytes(_name).length > 32) revert InvalidName();

        __Ownable_init(_owner);
        __UUPSUpgradeable_init();

        name = _name;
        agentType = _type;
        reputation = 500;
        isActive = true;
        createdAt = uint64(block.timestamp);
        lastActive = uint64(block.timestamp);
        emit AgentInitialized(_owner, _name, _type);
    }

    function updateReputation(uint64 _rep) external onlyOwner {
        require(_rep <= 1000, "max 1000");
        uint64 old = reputation;
        reputation = _rep;
        lastActive = uint64(block.timestamp);
        emit ReputationUpdated(old, _rep);
    }

    function updateStake(uint64 _stake) external onlyOwner {
        uint64 old = stakeAmount;
        stakeAmount = _stake;
        lastActive = uint64(block.timestamp);
        emit StakeUpdated(old, _stake);
    }

    function setActive(bool _active) external onlyOwner {
        isActive = _active;
        lastActive = uint64(block.timestamp);
        emit ActiveStatusChanged(_active);
    }

    function recordEscrow(bool successful, bool disputed) external onlyOwner {
        totalEscrows++;
        if (successful) successfulEscrows++;
        if (disputed) disputedEscrows++;
        lastActive = uint64(block.timestamp);
        emit EscrowRecorded(successful, disputed);
    }

    function successRate() external view returns (uint256) {
        if (totalEscrows == 0) return 10000;
        return (uint256(successfulEscrows) * 10000) / uint256(totalEscrows);
    }

    function disputeRate() external view returns (uint256) {
        if (totalEscrows == 0) return 0;
        return (uint256(disputedEscrows) * 10000) / uint256(totalEscrows);
    }

    function getState() external view returns (
        address, string memory, AgentType, uint64, uint64, bool,
        uint64, uint64, uint64, uint64, uint64
    ) {
        return (
            owner(), name, agentType, reputation, stakeAmount, isActive,
            createdAt, lastActive, totalEscrows, successfulEscrows, disputedEscrows
        );
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
