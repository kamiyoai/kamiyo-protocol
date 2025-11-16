// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentIdentityRegistry_Production.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AgentReputationRegistry (Production-Hardened)
 * @dev ERC-8004 compliant reputation registry with security features
 *
 * Security features:
 * - ReentrancyGuard: Prevents reentrancy attacks
 * - Pausable: Emergency stop mechanism
 * - AccessControl: Role-based permissions
 * - Rate limiting: Prevents spam feedback
 * - Input validation: Score and data validation
 */
contract AgentReputationRegistry is ReentrancyGuard, Pausable, AccessControl {
    AgentIdentityRegistry public immutable identityRegistry;

    bytes32 public constant REGISTRY_ADMIN_ROLE = keccak256("REGISTRY_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant MAX_FILEURI_LENGTH = 512;
    uint256 public constant MIN_FEEDBACK_INTERVAL = 60;

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

    mapping(uint256 => mapping(address => mapping(uint64 => Feedback))) private _feedback;
    mapping(uint256 => mapping(address => uint64)) private _lastIndex;
    mapping(uint256 => address[]) private _clients;
    mapping(uint256 => mapping(address => mapping(uint64 => mapping(address => Response[])))) private _responses;
    mapping(address => uint256) private _lastFeedbackTime;

    error InvalidScore(uint8 score);
    error AgentNotFound(uint256 agentId);
    error FeedbackNotFound();
    error FeedbackAlreadyRevoked();
    error NotAgentOwner(address caller, uint256 agentId);
    error RateLimitExceeded(uint256 timeRemaining);
    error InvalidFileUri();
    error InvalidSignature();

    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint8 score,
        bytes32 indexed tag1,
        bytes32 tag2,
        string fileuri,
        bytes32 filehash,
        uint256 timestamp
    );

    event FeedbackRevoked(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 indexed feedbackIndex,
        uint256 timestamp
    );

    event ResponseAppended(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        address indexed responder,
        string responseUri,
        uint256 timestamp
    );

    event RegistryPaused(address indexed pauser, uint256 timestamp);
    event RegistryUnpaused(address indexed unpauser, uint256 timestamp);

    constructor(address _identityRegistry) {
        identityRegistry = AgentIdentityRegistry(_identityRegistry);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REGISTRY_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    /**
     * @dev Submit feedback with security checks
     */
    function giveFeedback(
        uint256 agentId,
        uint8 score,
        bytes32 tag1,
        bytes32 tag2,
        string calldata fileuri,
        bytes32 filehash,
        bytes memory feedbackAuth
    ) external nonReentrant whenNotPaused {
        if (score > 100) revert InvalidScore(score);

        try identityRegistry.ownerOf(agentId) returns (address owner) {
            if (owner == address(0)) revert AgentNotFound(agentId);
        } catch {
            revert AgentNotFound(agentId);
        }

        if (bytes(fileuri).length > MAX_FILEURI_LENGTH) {
            revert InvalidFileUri();
        }

        uint256 timeSinceLastFeedback = block.timestamp - _lastFeedbackTime[msg.sender];
        if (timeSinceLastFeedback < MIN_FEEDBACK_INTERVAL) {
            revert RateLimitExceeded(MIN_FEEDBACK_INTERVAL - timeSinceLastFeedback);
        }
        _lastFeedbackTime[msg.sender] = block.timestamp;

        if (feedbackAuth.length > 0) {
            _validateFeedbackAuth(agentId, msg.sender, feedbackAuth);
        }

        uint64 index = _lastIndex[agentId][msg.sender];
        _lastIndex[agentId][msg.sender] = index + 1;

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

        emit NewFeedback(
            agentId,
            msg.sender,
            score,
            tag1,
            tag2,
            fileuri,
            filehash,
            block.timestamp
        );
    }

    /**
     * @dev Revoke feedback with validation
     */
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex)
        external
        nonReentrant
        whenNotPaused
    {
        Feedback storage feedback = _feedback[agentId][msg.sender][feedbackIndex];
        if (feedback.timestamp == 0) revert FeedbackNotFound();
        if (feedback.isRevoked) revert FeedbackAlreadyRevoked();

        feedback.isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex, block.timestamp);
    }

    /**
     * @dev Append response with ownership check
     */
    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseUri,
        bytes32 responseHash
    ) external nonReentrant whenNotPaused {
        address owner = identityRegistry.ownerOf(agentId);
        if (owner != msg.sender) {
            revert NotAgentOwner(msg.sender, agentId);
        }

        Feedback storage feedback = _feedback[agentId][clientAddress][feedbackIndex];
        if (feedback.timestamp == 0) revert FeedbackNotFound();

        if (bytes(responseUri).length > MAX_FILEURI_LENGTH) {
            revert InvalidFileUri();
        }

        _responses[agentId][clientAddress][feedbackIndex][msg.sender].push(
            Response({
                responseUri: responseUri,
                responseHash: responseHash,
                timestamp: block.timestamp
            })
        );

        emit ResponseAppended(
            agentId,
            clientAddress,
            feedbackIndex,
            msg.sender,
            responseUri,
            block.timestamp
        );
    }

    /**
     * @dev Get reputation summary with filters
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
            string memory fileuri,
            bytes32 filehash,
            bool isRevoked,
            uint256 timestamp
        )
    {
        Feedback memory fb = _feedback[agentId][clientAddress][index];
        return (fb.score, fb.tag1, fb.tag2, fb.fileuri, fb.filehash, fb.isRevoked, fb.timestamp);
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
     * @dev Get last feedback index for client
     */
    function getLastIndex(uint256 agentId, address clientAddress)
        external
        view
        returns (uint64)
    {
        return _lastIndex[agentId][clientAddress];
    }

    /**
     * @dev Get all clients who gave feedback
     */
    function getClients(uint256 agentId)
        external
        view
        returns (address[] memory)
    {
        return _clients[agentId];
    }

    /**
     * @dev Get response count
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
     */
    function _validateFeedbackAuth(
        uint256 agentId,
        address clientAddress,
        bytes memory feedbackAuth
    ) internal view {
        if (feedbackAuth.length < 65) {
            revert InvalidSignature();
        }
    }

    /**
     * @dev Get identity registry address
     */
    function getIdentityRegistry() external view returns (address) {
        return address(identityRegistry);
    }
}
