// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/**
 * @title AgentRegistryAdapter
 * @author Kamiyo Protocol
 * @notice Adapts Hyperliquid AgentRegistry to ERC-8004 identity interface
 * @dev Links local agent registrations to canonical Base chain identities
 */
contract AgentRegistryAdapter is ReentrancyGuard, Pausable {
    // ============ State ============

    AgentRegistry public immutable agentRegistry;

    // Local agent address => ERC-8004 global ID string
    mapping(address => string) public agentGlobalId;

    // Global ID hash => local agent address (for reverse lookup)
    mapping(bytes32 => address) public globalIdToAgent;

    // Metadata storage (ERC-8004 compatible)
    mapping(address => mapping(bytes32 => bytes)) private _metadata;

    // Agent URI storage
    mapping(address => string) public agentURI;

    address public admin;
    address public pendingAdmin;

    // ============ Events ============

    event AgentLinked(address indexed agent, string globalId);
    event AgentUnlinked(address indexed agent, string globalId);
    event URIUpdated(address indexed agent, string newURI);
    event MetadataSet(address indexed agent, string key, bytes value);
    event AdminTransferInitiated(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferCompleted(address indexed oldAdmin, address indexed newAdmin);

    // ============ Errors ============

    error NotRegistered();
    error AlreadyLinked();
    error NotLinked();
    error InvalidGlobalId();
    error NotAuthorized();
    error ZeroAddress();
    error NoPendingAdmin();

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAuthorized();
        _;
    }

    modifier onlyRegistered() {
        if (!agentRegistry.isRegistered(msg.sender)) revert NotRegistered();
        _;
    }

    // ============ Constructor ============

    constructor(address _agentRegistry) {
        if (_agentRegistry == address(0)) revert ZeroAddress();
        agentRegistry = AgentRegistry(payable(_agentRegistry));
        admin = msg.sender;
    }

    // ============ Linking Functions ============

    /**
     * @notice Link local agent to canonical ERC-8004 identity
     * @dev Global ID format: eip155:{chainId}:{registry}:{agentId}
     * @param globalId ERC-8004 global identifier from Base chain
     */
    function linkToGlobalId(string calldata globalId) external onlyRegistered whenNotPaused {
        if (bytes(agentGlobalId[msg.sender]).length > 0) revert AlreadyLinked();

        bytes32 globalIdHash = keccak256(bytes(globalId));
        if (globalIdToAgent[globalIdHash] != address(0)) revert AlreadyLinked();

        // Validate global ID format (basic check)
        if (!_validateGlobalIdFormat(globalId)) revert InvalidGlobalId();

        agentGlobalId[msg.sender] = globalId;
        globalIdToAgent[globalIdHash] = msg.sender;

        emit AgentLinked(msg.sender, globalId);
    }

    /**
     * @notice Unlink agent from global identity
     */
    function unlinkGlobalId() external {
        string memory globalId = agentGlobalId[msg.sender];
        if (bytes(globalId).length == 0) revert NotLinked();

        bytes32 globalIdHash = keccak256(bytes(globalId));

        delete agentGlobalId[msg.sender];
        delete globalIdToAgent[globalIdHash];

        emit AgentUnlinked(msg.sender, globalId);
    }

    // ============ ERC-8004 Compatible Functions ============

    /**
     * @notice Set agent URI (profile JSON location)
     * @param uri URI pointing to agent profile JSON
     */
    function setAgentURI(string calldata uri) external onlyRegistered {
        agentURI[msg.sender] = uri;
        emit URIUpdated(msg.sender, uri);
    }

    /**
     * @notice Set metadata for agent
     * @param key Metadata key
     * @param value Metadata value
     */
    function setMetadata(string calldata key, bytes calldata value) external onlyRegistered {
        bytes32 keyHash = keccak256(bytes(key));
        _metadata[msg.sender][keyHash] = value;
        emit MetadataSet(msg.sender, key, value);
    }

    /**
     * @notice Get metadata for agent
     * @param agent Agent address
     * @param key Metadata key
     * @return value Metadata value
     */
    function getMetadata(address agent, string calldata key) external view returns (bytes memory) {
        bytes32 keyHash = keccak256(bytes(key));
        return _metadata[agent][keyHash];
    }

    /**
     * @notice Get agent wallet (ERC-8004 compatible)
     * @dev On Hyperliquid, wallet is always the agent address
     * @param agent Agent address
     * @return wallet Agent wallet address
     */
    function getAgentWallet(address agent) external pure returns (address) {
        return agent;
    }

    // ============ View Functions ============

    /**
     * @notice Get agent by global ID
     * @param globalId ERC-8004 global identifier
     * @return agent Local agent address
     */
    function getAgentByGlobalId(string calldata globalId) external view returns (address) {
        bytes32 globalIdHash = keccak256(bytes(globalId));
        return globalIdToAgent[globalIdHash];
    }

    /**
     * @notice Check if agent is linked to global identity
     * @param agent Agent address
     * @return linked Whether agent is linked
     */
    function isLinked(address agent) external view returns (bool) {
        return bytes(agentGlobalId[agent]).length > 0;
    }

    /**
     * @notice Get full agent info including ERC-8004 data
     * @param agent Agent address
     * @return registryAgent AgentRegistry.Agent struct
     * @return globalId ERC-8004 global identifier
     * @return uri Agent profile URI
     */
    function getAgentFull(address agent) external view returns (
        AgentRegistry.Agent memory registryAgent,
        string memory globalId,
        string memory uri
    ) {
        registryAgent = agentRegistry.getAgent(agent);
        globalId = agentGlobalId[agent];
        uri = agentURI[agent];
    }

    /**
     * @notice Build ERC-8004 compatible agent profile
     * @param agent Agent address
     */
    function buildAgentProfile(address agent) external view returns (
        string memory name,
        address wallet,
        uint256 stake,
        uint64 registeredAt,
        uint64 totalTrades,
        uint64 successfulTrades,
        bool active,
        string memory globalId,
        string memory uri
    ) {
        AgentRegistry.Agent memory a = agentRegistry.getAgent(agent);
        name = a.name;
        wallet = a.owner;
        stake = a.stake;
        registeredAt = a.registeredAt;
        totalTrades = a.totalTrades;
        successfulTrades = a.successfulTrades;
        active = a.active;
        globalId = agentGlobalId[agent];
        uri = agentURI[agent];
    }

    /**
     * @notice Get paginated list of linked agents
     * @param agents Array of agent addresses to check
     * @return linkedAgents Addresses that are linked
     * @return globalIds Their global IDs
     */
    function getLinkedAgents(
        address[] calldata agents
    ) external view returns (address[] memory linkedAgents, string[] memory globalIds) {
        // Count linked agents
        uint256 linkedCount = 0;
        for (uint256 i = 0; i < agents.length; i++) {
            if (bytes(agentGlobalId[agents[i]]).length > 0) {
                linkedCount++;
            }
        }

        // Populate arrays
        linkedAgents = new address[](linkedCount);
        globalIds = new string[](linkedCount);

        uint256 idx = 0;
        for (uint256 i = 0; i < agents.length; i++) {
            if (bytes(agentGlobalId[agents[i]]).length > 0) {
                linkedAgents[idx] = agents[i];
                globalIds[idx] = agentGlobalId[agents[i]];
                idx++;
            }
        }
    }

    // ============ Internal Functions ============

    /**
     * @notice Validate global ID format
     * @dev Expected: eip155:{chainId}:{registry}:{agentId}
     */
    function _validateGlobalIdFormat(string calldata globalId) internal pure returns (bool) {
        bytes memory b = bytes(globalId);

        // Minimum length check: "eip155:1:0x0:0" = 14 chars
        if (b.length < 14) return false;

        // Check prefix "eip155:"
        if (b[0] != 'e' || b[1] != 'i' || b[2] != 'p' ||
            b[3] != '1' || b[4] != '5' || b[5] != '5' || b[6] != ':') {
            return false;
        }

        // Count colons (should be exactly 3)
        uint256 colonCount = 0;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == ':') colonCount++;
        }

        return colonCount == 3;
    }

    // ============ Admin Functions ============

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        pendingAdmin = newAdmin;
        emit AdminTransferInitiated(admin, newAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotAuthorized();
        if (pendingAdmin == address(0)) revert NoPendingAdmin();
        emit AdminTransferCompleted(admin, msg.sender);
        admin = msg.sender;
        pendingAdmin = address(0);
    }

    function pause() external onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin {
        _unpause();
    }
}
