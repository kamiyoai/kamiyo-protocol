// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title AgentProxy
 * @notice ERC1967 upgradable proxy emulating Solana AgentIdentity PDA.
 * @dev Mirrors the AgentIdentity account structure from the KAMIYO Solana program.
 */
contract AgentProxy is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    bytes32 public constant AGENT_SEED = keccak256("agent");

    enum AgentType {
        Trading,
        Service,
        Oracle,
        Custom
    }

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

    event AgentInitialized(
        address indexed owner,
        string name,
        AgentType agentType
    );
    event ReputationUpdated(uint64 oldReputation, uint64 newReputation);
    event StakeUpdated(uint64 oldStake, uint64 newStake);
    event ActiveStatusChanged(bool isActive);
    event EscrowRecorded(bool successful, bool disputed);

    error InvalidName();
    error AlreadyInitialized();
    error NotAuthorized();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the agent proxy.
     * @param _owner The owner address.
     * @param _name The agent name (max 32 bytes).
     * @param _agentType The agent type.
     */
    function initialize(
        address _owner,
        string calldata _name,
        AgentType _agentType
    ) external initializer {
        if (bytes(_name).length == 0 || bytes(_name).length > 32) {
            revert InvalidName();
        }

        __Ownable_init(_owner);
        __UUPSUpgradeable_init();

        name = _name;
        agentType = _agentType;
        reputation = 500; // Default starting reputation
        stakeAmount = 0;
        isActive = true;
        createdAt = uint64(block.timestamp);
        lastActive = uint64(block.timestamp);
        totalEscrows = 0;
        successfulEscrows = 0;
        disputedEscrows = 0;

        emit AgentInitialized(_owner, _name, _agentType);
    }

    /**
     * @notice Update agent reputation.
     * @param _reputation New reputation value (0-1000).
     */
    function updateReputation(uint64 _reputation) external onlyOwner {
        require(_reputation <= 1000, "Reputation exceeds max");
        uint64 oldReputation = reputation;
        reputation = _reputation;
        lastActive = uint64(block.timestamp);
        emit ReputationUpdated(oldReputation, _reputation);
    }

    /**
     * @notice Update stake amount.
     * @param _stakeAmount New stake amount in wei.
     */
    function updateStake(uint64 _stakeAmount) external onlyOwner {
        uint64 oldStake = stakeAmount;
        stakeAmount = _stakeAmount;
        lastActive = uint64(block.timestamp);
        emit StakeUpdated(oldStake, _stakeAmount);
    }

    /**
     * @notice Set active status.
     * @param _isActive Whether the agent is active.
     */
    function setActive(bool _isActive) external onlyOwner {
        isActive = _isActive;
        lastActive = uint64(block.timestamp);
        emit ActiveStatusChanged(_isActive);
    }

    /**
     * @notice Record escrow outcome.
     * @param successful Whether the escrow completed successfully.
     * @param disputed Whether the escrow was disputed.
     */
    function recordEscrow(bool successful, bool disputed) external onlyOwner {
        totalEscrows++;
        if (successful) {
            successfulEscrows++;
        }
        if (disputed) {
            disputedEscrows++;
        }
        lastActive = uint64(block.timestamp);
        emit EscrowRecorded(successful, disputed);
    }

    /**
     * @notice Calculate success rate as basis points (0-10000).
     */
    function successRate() external view returns (uint256) {
        if (totalEscrows == 0) return 10000;
        return (uint256(successfulEscrows) * 10000) / uint256(totalEscrows);
    }

    /**
     * @notice Calculate dispute rate as basis points (0-10000).
     */
    function disputeRate() external view returns (uint256) {
        if (totalEscrows == 0) return 0;
        return (uint256(disputedEscrows) * 10000) / uint256(totalEscrows);
    }

    /**
     * @notice Get full agent state.
     */
    function getState()
        external
        view
        returns (
            address _owner,
            string memory _name,
            AgentType _agentType,
            uint64 _reputation,
            uint64 _stakeAmount,
            bool _isActive,
            uint64 _createdAt,
            uint64 _lastActive,
            uint64 _totalEscrows,
            uint64 _successfulEscrows,
            uint64 _disputedEscrows
        )
    {
        return (
            owner(),
            name,
            agentType,
            reputation,
            stakeAmount,
            isActive,
            createdAt,
            lastActive,
            totalEscrows,
            successfulEscrows,
            disputedEscrows
        );
    }

    /**
     * @notice Authorize upgrade (UUPS pattern).
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
