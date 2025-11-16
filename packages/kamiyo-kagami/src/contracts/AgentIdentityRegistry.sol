// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title AgentIdentityRegistry (Production-Hardened)
 * @dev ERC-8004 compliant agent identity registry with production security features
 *
 * Security features:
 * - ReentrancyGuard: Prevents reentrancy attacks
 * - Pausable: Emergency stop mechanism
 * - AccessControl: Role-based permissions
 * - Custom errors: Gas-efficient error handling
 * - Input validation: Size limits and validation checks
 */
contract AgentIdentityRegistry is
    ERC721URIStorage,
    AccessControl,
    ReentrancyGuard,
    Pausable
{
    using Counters for Counters.Counter;
    Counters.Counter private _agentIdCounter;

    bytes32 public constant REGISTRY_ADMIN_ROLE = keccak256("REGISTRY_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    struct MetadataEntry {
        string key;
        bytes value;
    }

    uint256 public constant MAX_METADATA_KEYS = 50;
    uint256 public constant MAX_METADATA_VALUE_SIZE = 10240;

    mapping(uint256 => mapping(string => bytes)) private _metadata;
    mapping(uint256 => string[]) private _metadataKeys;

    error AgentNotFound(uint256 agentId);
    error Unauthorized(address caller, uint256 agentId);
    error InvalidMetadataKey(string key);
    error RegistrationFailed(string reason);
    error MetadataLimitExceeded();

    event Registered(
        uint256 indexed agentId,
        string tokenURI,
        address indexed owner,
        uint256 timestamp
    );

    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedKey,
        string key,
        bytes value,
        uint256 timestamp
    );

    event RegistryPaused(address indexed pauser, uint256 timestamp);
    event RegistryUnpaused(address indexed unpauser, uint256 timestamp);

    constructor() ERC721("KAMIYO Agent Identity", "KAMIYO-AGENT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REGISTRY_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    /**
     * @dev Register new agent with reentrancy protection
     */
    function register(
        string memory tokenURI,
        MetadataEntry[] memory metadata
    )
        public
        nonReentrant
        whenNotPaused
        returns (uint256 agentId)
    {
        _agentIdCounter.increment();
        agentId = _agentIdCounter.current();

        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, tokenURI);

        for (uint i = 0; i < metadata.length; i++) {
            if (metadata[i].value.length > MAX_METADATA_VALUE_SIZE) {
                revert RegistrationFailed("Metadata value too large");
            }
            _setMetadata(agentId, metadata[i].key, metadata[i].value);
        }

        emit Registered(agentId, tokenURI, msg.sender, block.timestamp);
        return agentId;
    }

    /**
     * @dev Register with URI only
     */
    function register(string memory tokenURI)
        public
        returns (uint256 agentId)
    {
        MetadataEntry[] memory emptyMetadata;
        return register(tokenURI, emptyMetadata);
    }

    /**
     * @dev Auto-generate URI registration
     */
    function register()
        public
        returns (uint256 agentId)
    {
        _agentIdCounter.increment();
        agentId = _agentIdCounter.current();

        _safeMint(msg.sender, agentId);

        string memory autoURI = string(
            abi.encodePacked(
                "https://kamiyo.ai/api/v1/agents/",
                _toString(agentId),
                "/registration"
            )
        );
        _setTokenURI(agentId, autoURI);

        emit Registered(agentId, autoURI, msg.sender, block.timestamp);
        return agentId;
    }

    /**
     * @dev Set metadata with authorization check
     */
    function setMetadata(uint256 agentId, string memory key, bytes memory value)
        public
        nonReentrant
        whenNotPaused
    {
        if (ownerOf(agentId) != msg.sender && !hasRole(REGISTRY_ADMIN_ROLE, msg.sender)) {
            revert Unauthorized(msg.sender, agentId);
        }

        if (value.length > MAX_METADATA_VALUE_SIZE) {
            revert RegistrationFailed("Metadata value too large");
        }

        if (_metadataKeys[agentId].length >= MAX_METADATA_KEYS) {
            revert MetadataLimitExceeded();
        }

        _setMetadata(agentId, key, value);
    }

    /**
     * @dev Get metadata
     */
    function getMetadata(uint256 agentId, string memory key)
        public
        view
        returns (bytes memory value)
    {
        if (_ownerOf(agentId) == address(0)) {
            revert AgentNotFound(agentId);
        }
        return _metadata[agentId][key];
    }

    /**
     * @dev Internal metadata setter
     */
    function _setMetadata(uint256 agentId, string memory key, bytes memory value)
        internal
    {
        if (bytes(key).length == 0) {
            revert InvalidMetadataKey(key);
        }

        if (_metadata[agentId][key].length == 0) {
            _metadataKeys[agentId].push(key);
        }

        _metadata[agentId][key] = value;
        emit MetadataSet(agentId, key, key, value, block.timestamp);
    }

    /**
     * @dev Emergency pause
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
        emit RegistryPaused(msg.sender, block.timestamp);
    }

    /**
     * @dev Unpause
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
        emit RegistryUnpaused(msg.sender, block.timestamp);
    }

    /**
     * @dev Get total registered agents
     */
    function totalAgents() public view returns (uint256) {
        return _agentIdCounter.current();
    }

    /**
     * @dev Get metadata keys for agent
     */
    function getMetadataKeys(uint256 agentId)
        public
        view
        returns (string[] memory keys)
    {
        if (_ownerOf(agentId) == address(0)) {
            revert AgentNotFound(agentId);
        }
        return _metadataKeys[agentId];
    }

    /**
     * @dev Update registration URI (owner only)
     */
    function updateRegistrationURI(uint256 agentId, string memory newURI)
        public
        whenNotPaused
    {
        if (ownerOf(agentId) != msg.sender) {
            revert Unauthorized(msg.sender, agentId);
        }
        _setTokenURI(agentId, newURI);
    }

    /**
     * @dev Required override for AccessControl + ERC721
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev Convert uint to string
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
