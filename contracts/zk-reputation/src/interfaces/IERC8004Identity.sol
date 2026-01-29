// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IERC8004Identity
 * @notice ERC-8004 Identity Registry interface for trustless agent discovery
 * @dev Based on EIP-8004 specification. Identity is represented as ERC-721 tokens.
 */
interface IERC8004Identity {
    // ============ Structs ============

    struct MetadataEntry {
        string key;
        bytes value;
    }

    // ============ Events ============

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedMetadataKey,
        string metadataKey,
        bytes metadataValue
    );
    event AgentWalletSet(uint256 indexed agentId, address indexed wallet);
    event AgentWalletUnset(uint256 indexed agentId);

    // ============ Registration ============

    /**
     * @notice Register a new agent with URI and metadata
     * @param agentURI URI pointing to agent profile JSON
     * @param metadata Initial metadata entries
     * @return agentId The newly minted agent token ID
     */
    function register(
        string calldata agentURI,
        MetadataEntry[] calldata metadata
    ) external returns (uint256 agentId);

    /**
     * @notice Register a new agent with URI only
     * @param agentURI URI pointing to agent profile JSON
     * @return agentId The newly minted agent token ID
     */
    function register(string calldata agentURI) external returns (uint256 agentId);

    /**
     * @notice Register a new agent with minimal data
     * @return agentId The newly minted agent token ID
     */
    function register() external returns (uint256 agentId);

    // ============ URI Management ============

    /**
     * @notice Update agent URI
     * @param agentId Agent token ID
     * @param newURI New URI pointing to agent profile JSON
     */
    function setAgentURI(uint256 agentId, string calldata newURI) external;

    // ============ Metadata Management ============

    /**
     * @notice Set metadata for an agent
     * @param agentId Agent token ID
     * @param metadataKey Key for the metadata entry
     * @param metadataValue Value for the metadata entry
     */
    function setMetadata(
        uint256 agentId,
        string calldata metadataKey,
        bytes calldata metadataValue
    ) external;

    /**
     * @notice Get metadata for an agent
     * @param agentId Agent token ID
     * @param metadataKey Key for the metadata entry
     * @return metadataValue The stored metadata value
     */
    function getMetadata(
        uint256 agentId,
        string calldata metadataKey
    ) external view returns (bytes memory metadataValue);

    // ============ Wallet Management ============

    /**
     * @notice Set agent wallet with signature verification (EIP-712)
     * @param agentId Agent token ID
     * @param newWallet Address to set as agent wallet
     * @param deadline Signature expiration timestamp
     * @param signature EIP-712 signature from newWallet
     */
    function setAgentWallet(
        uint256 agentId,
        address newWallet,
        uint256 deadline,
        bytes calldata signature
    ) external;

    /**
     * @notice Get agent wallet address
     * @param agentId Agent token ID
     * @return wallet The agent wallet address (owner if not explicitly set)
     */
    function getAgentWallet(uint256 agentId) external view returns (address wallet);

    /**
     * @notice Remove explicit agent wallet (reverts to owner)
     * @param agentId Agent token ID
     */
    function unsetAgentWallet(uint256 agentId) external;

    // ============ Global ID ============

    /**
     * @notice Get globally unique agent identifier
     * @param agentId Agent token ID
     * @return globalId Format: eip155:{chainId}:{registry}:{agentId}
     */
    function getGlobalId(uint256 agentId) external view returns (string memory globalId);
}
