// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentIdentityRegistry.sol";

/**
 * @title AgentReputationRegistry
 * @dev ERC-8004 compliant reputation registry for agents
 * Tracks feedback, validations, and reputation scores
 */
contract AgentReputationRegistry {
    AgentIdentityRegistry public immutable identityRegistry;

    struct Feedback {
        uint8 score;
        bytes32 tag1;
        bytes32 tag2;
        string fileuri;
        bytes32 filehash;
        bool isRevoked;
        uint256 timestamp;
    }

    struct Response {
        string responseUri;
        bytes32 responseHash;
        uint256 timestamp;
    }

    // agentId => clientAddress => feedbackIndex => Feedback
    mapping(uint256 => mapping(address => mapping(uint64 => Feedback)))
        private _feedback;

    // agentId => clientAddress => last feedback index
    mapping(uint256 => mapping(address => uint64)) private _lastIndex;

    // agentId => array of client addresses
    mapping(uint256 => address[]) private _clients;

    // agentId => clientAddress => feedbackIndex => responderAddress => Response
    mapping(uint256 => mapping(address => mapping(uint64 => mapping(address => Response[]))))
        private _responses;

    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint8 score,
        bytes32 indexed tag1,
        bytes32 tag2,
        string fileuri,
        bytes32 filehash
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
        string responseUri
    );

    constructor(address _identityRegistry) {
        identityRegistry = AgentIdentityRegistry(_identityRegistry);
    }

    /**
     * @dev Submit feedback for an agent
     * @param agentId Agent ID
     * @param score Score from 0-100
     * @param tag1 First tag (category)
     * @param tag2 Second tag (subcategory)
     * @param fileuri URI to detailed feedback
     * @param filehash Hash of feedback file
     * @param feedbackAuth Signed authorization (EIP-191/ERC-1271)
     */
    function giveFeedback(
        uint256 agentId,
        uint8 score,
        bytes32 tag1,
        bytes32 tag2,
        string calldata fileuri,
        bytes32 filehash,
        bytes memory feedbackAuth
    ) external {
        require(score <= 100, "Score must be 0-100");
        require(
            identityRegistry.ownerOf(agentId) != address(0),
            "Agent does not exist"
        );

        // Validate feedback auth if provided
        if (feedbackAuth.length > 0) {
            _validateFeedbackAuth(agentId, msg.sender, feedbackAuth);
        }

        uint64 index = _lastIndex[agentId][msg.sender];
        _lastIndex[agentId][msg.sender] = index + 1;

        // Track new clients
        if (index == 0) {
            _clients[agentId].push(msg.sender);
        }

        _feedback[agentId][msg.sender][index] = Feedback({
            score: score,
            tag1: tag1,
            tag2: tag2,
            fileuri: fileuri,
            filehash: filehash,
            isRevoked: false,
            timestamp: block.timestamp
        });

        emit NewFeedback(agentId, msg.sender, score, tag1, tag2, fileuri, filehash);
    }

    /**
     * @dev Revoke previously submitted feedback
     * @param agentId Agent ID
     * @param feedbackIndex Index of feedback to revoke
     */
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        Feedback storage feedback = _feedback[agentId][msg.sender][feedbackIndex];
        require(feedback.timestamp > 0, "Feedback does not exist");
        require(!feedback.isRevoked, "Feedback already revoked");

        feedback.isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    /**
     * @dev Append a response to feedback (for agent owners)
     * @param agentId Agent ID
     * @param clientAddress Address that gave feedback
     * @param feedbackIndex Feedback index
     * @param responseUri URI to response content
     * @param responseHash Hash of response
     */
    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseUri,
        bytes32 responseHash
    ) external {
        require(
            identityRegistry.ownerOf(agentId) == msg.sender,
            "Not agent owner"
        );

        Feedback storage feedback = _feedback[agentId][clientAddress][feedbackIndex];
        require(feedback.timestamp > 0, "Feedback does not exist");

        _responses[agentId][clientAddress][feedbackIndex][msg.sender].push(
            Response({
                responseUri: responseUri,
                responseHash: responseHash,
                timestamp: block.timestamp
            })
        );

        emit ResponseAppended(agentId, clientAddress, feedbackIndex, msg.sender, responseUri);
    }

    /**
     * @dev Get summary of agent reputation
     * @param agentId Agent ID
     * @param clientAddresses Filter by specific clients (empty for all)
     * @param tag1 Filter by tag1 (0x0 for no filter)
     * @param tag2 Filter by tag2 (0x0 for no filter)
     * @return count Number of feedback entries
     * @return averageScore Average score
     */
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        bytes32 tag1,
        bytes32 tag2
    ) external view returns (uint64 count, uint8 averageScore) {
        address[] memory clients = clientAddresses.length > 0
            ? clientAddresses
            : _clients[agentId];

        uint256 totalScore = 0;
        uint64 validCount = 0;

        for (uint i = 0; i < clients.length; i++) {
            uint64 lastIdx = _lastIndex[agentId][clients[i]];
            for (uint64 j = 0; j < lastIdx; j++) {
                Feedback memory fb = _feedback[agentId][clients[i]][j];
                if (fb.isRevoked) continue;
                if (tag1 != bytes32(0) && fb.tag1 != tag1) continue;
                if (tag2 != bytes32(0) && fb.tag2 != tag2) continue;

                totalScore += fb.score;
                validCount++;
            }
        }

        if (validCount > 0) {
            averageScore = uint8(totalScore / validCount);
        }

        return (validCount, averageScore);
    }

    /**
     * @dev Read specific feedback entry
     * @param agentId Agent ID
     * @param clientAddress Client address
     * @param index Feedback index
     */
    function readFeedback(
        uint256 agentId,
        address clientAddress,
        uint64 index
    )
        external
        view
        returns (
            uint8 score,
            bytes32 tag1,
            bytes32 tag2,
            bool isRevoked
        )
    {
        Feedback memory fb = _feedback[agentId][clientAddress][index];
        return (fb.score, fb.tag1, fb.tag2, fb.isRevoked);
    }

    /**
     * @dev Get last feedback index for a client
     */
    function getLastIndex(uint256 agentId, address clientAddress)
        external
        view
        returns (uint64)
    {
        return _lastIndex[agentId][clientAddress];
    }

    /**
     * @dev Get all clients who gave feedback to an agent
     */
    function getClients(uint256 agentId)
        external
        view
        returns (address[] memory)
    {
        return _clients[agentId];
    }

    /**
     * @dev Get response count for feedback
     */
    function getResponseCount(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        address responder
    ) external view returns (uint64) {
        return uint64(_responses[agentId][clientAddress][feedbackIndex][responder].length);
    }

    /**
     * @dev Validate feedback authorization signature
     * Basic implementation - should verify EIP-191 or ERC-1271 signature
     */
    function _validateFeedbackAuth(
        uint256 agentId,
        address clientAddress,
        bytes memory feedbackAuth
    ) internal view {
        // Simplified validation
        // Production should verify signed message containing:
        // (agentId, clientAddress, indexLimit, expiry, chainId, registryAddress)
        require(feedbackAuth.length >= 65, "Invalid signature length");
    }

    /**
     * @dev Get identity registry address
     */
    function getIdentityRegistry() external view returns (address) {
        return address(identityRegistry);
    }
}
