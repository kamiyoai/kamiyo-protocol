// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IERC8004Reputation
 * @notice ERC-8004 Reputation Registry interface for agent feedback
 * @dev Based on EIP-8004 specification. Implements tag-based feedback with Sybil resistance.
 */
interface IERC8004Reputation {
    // ============ Structs ============

    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        bytes32 tag1;
        bytes32 tag2;
        bytes32 endpoint;
        string feedbackURI;
        bytes32 feedbackHash;
        uint64 timestamp;
        bool isRevoked;
    }

    // ============ Events ============

    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        bytes32 indexed indexedTag1,
        bytes32 tag1,
        bytes32 tag2,
        bytes32 endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );

    event FeedbackRevoked(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 indexed feedbackIndex
    );

    event ResponseAppended(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        address indexed responder,
        string responseURI,
        bytes32 responseHash
    );

    // ============ Feedback Submission ============

    /**
     * @notice Submit feedback for an agent
     * @param agentId Agent token ID from Identity Registry
     * @param value Feedback score (can be negative)
     * @param valueDecimals Decimal places for value interpretation
     * @param tag1 Primary category tag
     * @param tag2 Secondary category tag
     * @param endpoint Specific endpoint being rated
     * @param feedbackURI URI to detailed feedback (IPFS, etc.)
     * @param feedbackHash Hash of off-chain feedback content
     */
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        bytes32 tag1,
        bytes32 tag2,
        bytes32 endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;

    /**
     * @notice Revoke previously submitted feedback
     * @param agentId Agent token ID
     * @param feedbackIndex Index of feedback to revoke
     */
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external;

    /**
     * @notice Append response to feedback (by agent or aggregator)
     * @param agentId Agent token ID
     * @param clientAddress Original feedback submitter
     * @param feedbackIndex Index of feedback to respond to
     * @param responseURI URI to response content
     * @param responseHash Hash of response content
     */
    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external;

    // ============ Query Functions ============

    /**
     * @notice Get aggregated reputation summary
     * @dev clientAddresses MUST be provided for Sybil resistance
     * @param agentId Agent token ID
     * @param clientAddresses Trusted client addresses to filter by
     * @param tag1 Filter by primary tag (0 for all)
     * @param tag2 Filter by secondary tag (0 for all)
     * @return count Number of matching feedback entries
     * @return summaryValue Aggregated value (sum)
     * @return decimals Value decimals
     */
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        bytes32 tag1,
        bytes32 tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 decimals);

    /**
     * @notice Read specific feedback entry
     * @param agentId Agent token ID
     * @param clientAddress Feedback submitter
     * @param feedbackIndex Feedback index
     * @return value Feedback value
     * @return valueDecimals Decimal places
     * @return tag1 Primary tag
     * @return tag2 Secondary tag
     * @return isRevoked Whether feedback was revoked
     */
    function readFeedback(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex
    ) external view returns (
        int128 value,
        uint8 valueDecimals,
        bytes32 tag1,
        bytes32 tag2,
        bool isRevoked
    );

    /**
     * @notice Read all feedback matching filters
     * @param agentId Agent token ID
     * @param clientAddresses Client addresses to include
     * @param tag1 Filter by primary tag (0 for all)
     * @param tag2 Filter by secondary tag (0 for all)
     * @param includeRevoked Include revoked feedback
     * @return clients Client addresses
     * @return indices Feedback indices
     * @return values Feedback values
     * @return valueDecimals Decimal places
     * @return tag1s Primary tags
     * @return tag2s Secondary tags
     * @return revoked Revocation status
     */
    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        bytes32 tag1,
        bytes32 tag2,
        bool includeRevoked
    ) external view returns (
        address[] memory clients,
        uint64[] memory indices,
        int128[] memory values,
        uint8[] memory valueDecimals,
        bytes32[] memory tag1s,
        bytes32[] memory tag2s,
        bool[] memory revoked
    );

    /**
     * @notice Get last feedback index for a client
     * @param agentId Agent token ID
     * @param clientAddress Client address
     * @return lastIndex Last feedback index (0 if none)
     */
    function getLastIndex(
        uint256 agentId,
        address clientAddress
    ) external view returns (uint64 lastIndex);

    /**
     * @notice Get all clients who submitted feedback for an agent
     * @param agentId Agent token ID
     * @return clients Array of client addresses
     */
    function getClients(uint256 agentId) external view returns (address[] memory clients);
}
