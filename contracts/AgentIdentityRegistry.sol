// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title AgentIdentityRegistry
 * @dev ERC-8004 compliant agent identity registry
 * Each agent receives an ERC-721 NFT representing their on-chain identity
 */
contract AgentIdentityRegistry is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _agentIdCounter;

    struct MetadataEntry {
        string key;
        bytes value;
    }

    // agentId => key => value
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    // agentId => array of metadata keys
    mapping(uint256 => string[]) private _metadataKeys;

    event Registered(
        uint256 indexed agentId,
        string tokenURI,
        address indexed owner
    );

    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedKey,
        string key,
        bytes value
    );

    constructor() ERC721("KAMIYO Agent Identity", "KAMIYO-AGENT") Ownable(msg.sender) {}

    /**
     * @dev Register a new agent with URI and optional metadata
     * @param tokenURI URI pointing to agent registration JSON
     * @param metadata Array of key-value metadata entries
     * @return agentId The newly minted agent ID
     */
    function register(
        string memory tokenURI,
        MetadataEntry[] memory metadata
    ) public returns (uint256 agentId) {
        _agentIdCounter.increment();
        agentId = _agentIdCounter.current();

        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, tokenURI);

        // Set metadata if provided
        for (uint i = 0; i < metadata.length; i++) {
            _setMetadata(agentId, metadata[i].key, metadata[i].value);
        }

        emit Registered(agentId, tokenURI, msg.sender);
        return agentId;
    }

    /**
     * @dev Register agent with URI only
     */
    function register(string memory tokenURI) public returns (uint256 agentId) {
        MetadataEntry[] memory emptyMetadata;
        return register(tokenURI, emptyMetadata);
    }

    /**
     * @dev Register agent with auto-generated URI
     */
    function register() public returns (uint256 agentId) {
        _agentIdCounter.increment();
        agentId = _agentIdCounter.current();

        _safeMint(msg.sender, agentId);

        // Auto-generate URI
        string memory autoURI = string(
            abi.encodePacked(
                "https://kamiyo.ai/api/v1/agents/",
                _toString(agentId),
                "/registration"
            )
        );
        _setTokenURI(agentId, autoURI);

        emit Registered(agentId, autoURI, msg.sender);
        return agentId;
    }

    /**
     * @dev Get metadata value for an agent
     * @param agentId The agent ID
     * @param key The metadata key
     * @return value The metadata value
     */
    function getMetadata(uint256 agentId, string memory key)
        public
        view
        returns (bytes memory value)
    {
        require(_ownerOf(agentId) != address(0), "Agent does not exist");
        return _metadata[agentId][key];
    }

    /**
     * @dev Set metadata for an agent (only owner can modify)
     * @param agentId The agent ID
     * @param key The metadata key
     * @param value The metadata value
     */
    function setMetadata(uint256 agentId, string memory key, bytes memory value)
        public
    {
        require(ownerOf(agentId) == msg.sender, "Not agent owner");
        _setMetadata(agentId, key, value);
    }

    /**
     * @dev Internal function to set metadata
     */
    function _setMetadata(uint256 agentId, string memory key, bytes memory value)
        internal
    {
        // Track new keys
        if (_metadata[agentId][key].length == 0) {
            _metadataKeys[agentId].push(key);
        }

        _metadata[agentId][key] = value;
        emit MetadataSet(agentId, key, key, value);
    }

    /**
     * @dev Get all metadata keys for an agent
     * @param agentId The agent ID
     * @return keys Array of metadata keys
     */
    function getMetadataKeys(uint256 agentId)
        public
        view
        returns (string[] memory keys)
    {
        require(_ownerOf(agentId) != address(0), "Agent does not exist");
        return _metadataKeys[agentId];
    }

    /**
     * @dev Get total number of registered agents
     */
    function totalAgents() public view returns (uint256) {
        return _agentIdCounter.current();
    }

    /**
     * @dev Get agent registration URI
     * @param agentId The agent ID
     */
    function getRegistrationURI(uint256 agentId)
        public
        view
        returns (string memory)
    {
        return tokenURI(agentId);
    }

    /**
     * @dev Update agent registration URI (only owner)
     * @param agentId The agent ID
     * @param newURI New registration URI
     */
    function updateRegistrationURI(uint256 agentId, string memory newURI)
        public
    {
        require(ownerOf(agentId) == msg.sender, "Not agent owner");
        _setTokenURI(agentId, newURI);
    }

    /**
     * @dev Convert uint256 to string
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
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
