// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./interfaces/IERC8004Reputation.sol";
import "./interfaces/IERC8004Identity.sol";

/**
 * @title ERC8004ReputationRegistry
 * @author Kamiyo Protocol
 * @notice ERC-8004 Reputation Registry for public agent feedback
 * @dev Implements tag-based feedback with Sybil-resistant client filtering
 */
contract ERC8004ReputationRegistry is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    IERC8004Reputation
{
    // ============ State ============

    IERC8004Identity public identityRegistry;

    // agentId => clientAddress => feedbackIndex => Feedback
    mapping(uint256 => mapping(address => mapping(uint64 => Feedback))) private _feedback;

    // agentId => clientAddress => feedbackCount
    mapping(uint256 => mapping(address => uint64)) private _feedbackCount;

    // agentId => list of clients who submitted feedback
    mapping(uint256 => address[]) private _agentClients;

    // agentId => clientAddress => hasSubmitted (to avoid duplicates in _agentClients)
    mapping(uint256 => mapping(address => bool)) private _hasSubmittedFeedback;

    // agentId => clientAddress => feedbackIndex => responses
    mapping(uint256 => mapping(address => mapping(uint64 => Response[]))) private _responses;

    struct Response {
        address responder;
        string responseURI;
        bytes32 responseHash;
        uint64 timestamp;
    }

    // ============ Errors ============

    error AgentNotFound();
    error FeedbackNotFound();
    error NotFeedbackOwner();
    error FeedbackAlreadyRevoked();
    error EmptyClientList();
    error ZeroAddress();

    // ============ Constructor ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _identityRegistry,
        address _owner
    ) external initializer {
        if (_identityRegistry == address(0) || _owner == address(0)) revert ZeroAddress();

        __Ownable_init(_owner);
        __Pausable_init();

        identityRegistry = IERC8004Identity(_identityRegistry);
    }

    // ============ Feedback Submission ============

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        bytes32 tag1,
        bytes32 tag2,
        bytes32 endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external override whenNotPaused {
        // Verify agent exists
        try identityRegistry.getAgentWallet(agentId) returns (address) {}
        catch { revert AgentNotFound(); }

        uint64 feedbackIndex = _feedbackCount[agentId][msg.sender];

        _feedback[agentId][msg.sender][feedbackIndex] = Feedback({
            value: value,
            valueDecimals: valueDecimals,
            tag1: tag1,
            tag2: tag2,
            endpoint: endpoint,
            feedbackURI: feedbackURI,
            feedbackHash: feedbackHash,
            timestamp: uint64(block.timestamp),
            isRevoked: false
        });

        _feedbackCount[agentId][msg.sender] = feedbackIndex + 1;

        // Track client for this agent
        if (!_hasSubmittedFeedback[agentId][msg.sender]) {
            _agentClients[agentId].push(msg.sender);
            _hasSubmittedFeedback[agentId][msg.sender] = true;
        }

        emit NewFeedback(
            agentId,
            msg.sender,
            feedbackIndex,
            value,
            valueDecimals,
            tag1,
            tag1,
            tag2,
            endpoint,
            feedbackURI,
            feedbackHash
        );
    }

    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external override {
        Feedback storage fb = _feedback[agentId][msg.sender][feedbackIndex];

        if (fb.timestamp == 0) revert FeedbackNotFound();
        if (fb.isRevoked) revert FeedbackAlreadyRevoked();

        fb.isRevoked = true;

        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external override {
        Feedback storage fb = _feedback[agentId][clientAddress][feedbackIndex];

        if (fb.timestamp == 0) revert FeedbackNotFound();

        // Allow agent owner or aggregators to respond
        try identityRegistry.getAgentWallet(agentId) returns (address wallet) {
            // Anyone can append responses (agent, aggregator, etc.)
            // The responder is tracked in the event
        } catch {
            revert AgentNotFound();
        }

        _responses[agentId][clientAddress][feedbackIndex].push(Response({
            responder: msg.sender,
            responseURI: responseURI,
            responseHash: responseHash,
            timestamp: uint64(block.timestamp)
        }));

        emit ResponseAppended(
            agentId,
            clientAddress,
            feedbackIndex,
            msg.sender,
            responseURI,
            responseHash
        );
    }

    // ============ Query Functions ============

    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        bytes32 tag1,
        bytes32 tag2
    ) external view override returns (uint64 count, int128 summaryValue, uint8 decimals) {
        if (clientAddresses.length == 0) revert EmptyClientList();

        int256 sum = 0;
        uint8 maxDecimals = 0;

        for (uint256 i = 0; i < clientAddresses.length; i++) {
            address client = clientAddresses[i];
            uint64 fbCount = _feedbackCount[agentId][client];

            for (uint64 j = 0; j < fbCount; j++) {
                Feedback storage fb = _feedback[agentId][client][j];

                if (fb.isRevoked) continue;

                // Tag filtering
                if (tag1 != bytes32(0) && fb.tag1 != tag1) continue;
                if (tag2 != bytes32(0) && fb.tag2 != tag2) continue;

                sum += int256(fb.value);
                count++;

                if (fb.valueDecimals > maxDecimals) {
                    maxDecimals = fb.valueDecimals;
                }
            }
        }

        summaryValue = int128(sum);
        decimals = maxDecimals;
    }

    function readFeedback(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex
    ) external view override returns (
        int128 value,
        uint8 valueDecimals,
        bytes32 tag1,
        bytes32 tag2,
        bool isRevoked
    ) {
        Feedback storage fb = _feedback[agentId][clientAddress][feedbackIndex];

        if (fb.timestamp == 0) revert FeedbackNotFound();

        return (fb.value, fb.valueDecimals, fb.tag1, fb.tag2, fb.isRevoked);
    }

    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        bytes32 tag1,
        bytes32 tag2,
        bool includeRevoked
    ) external view override returns (
        address[] memory clients,
        uint64[] memory indices,
        int128[] memory values,
        uint8[] memory valueDecimals,
        bytes32[] memory tag1s,
        bytes32[] memory tag2s,
        bool[] memory revoked
    ) {
        if (clientAddresses.length == 0) revert EmptyClientList();

        // Count matching entries
        uint256 totalCount = _countMatchingFeedback(agentId, clientAddresses, tag1, tag2, includeRevoked);

        // Allocate arrays
        clients = new address[](totalCount);
        indices = new uint64[](totalCount);
        values = new int128[](totalCount);
        valueDecimals = new uint8[](totalCount);
        tag1s = new bytes32[](totalCount);
        tag2s = new bytes32[](totalCount);
        revoked = new bool[](totalCount);

        // Populate arrays
        _populateFeedbackArrays(
            agentId, clientAddresses, tag1, tag2, includeRevoked,
            clients, indices, values, valueDecimals, tag1s, tag2s, revoked
        );
    }

    function _countMatchingFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        bytes32 tag1,
        bytes32 tag2,
        bool includeRevoked
    ) internal view returns (uint256 totalCount) {
        for (uint256 i = 0; i < clientAddresses.length; i++) {
            uint64 fbCount = _feedbackCount[agentId][clientAddresses[i]];
            for (uint64 j = 0; j < fbCount; j++) {
                Feedback storage fb = _feedback[agentId][clientAddresses[i]][j];
                if (_matchesFeedbackFilter(fb, tag1, tag2, includeRevoked)) {
                    totalCount++;
                }
            }
        }
    }

    function _matchesFeedbackFilter(
        Feedback storage fb,
        bytes32 tag1,
        bytes32 tag2,
        bool includeRevoked
    ) internal view returns (bool) {
        if (!includeRevoked && fb.isRevoked) return false;
        if (tag1 != bytes32(0) && fb.tag1 != tag1) return false;
        if (tag2 != bytes32(0) && fb.tag2 != tag2) return false;
        return true;
    }

    function _populateFeedbackArrays(
        uint256 agentId,
        address[] calldata clientAddresses,
        bytes32 tag1,
        bytes32 tag2,
        bool includeRevoked,
        address[] memory clients,
        uint64[] memory indices,
        int128[] memory values,
        uint8[] memory valueDecimals,
        bytes32[] memory tag1s,
        bytes32[] memory tag2s,
        bool[] memory revoked
    ) internal view {
        uint256 idx = 0;
        for (uint256 i = 0; i < clientAddresses.length; i++) {
            address client = clientAddresses[i];
            uint64 fbCount = _feedbackCount[agentId][client];
            for (uint64 j = 0; j < fbCount; j++) {
                Feedback storage fb = _feedback[agentId][client][j];
                if (_matchesFeedbackFilter(fb, tag1, tag2, includeRevoked)) {
                    clients[idx] = client;
                    indices[idx] = j;
                    values[idx] = fb.value;
                    valueDecimals[idx] = fb.valueDecimals;
                    tag1s[idx] = fb.tag1;
                    tag2s[idx] = fb.tag2;
                    revoked[idx] = fb.isRevoked;
                    idx++;
                }
            }
        }
    }

    function getLastIndex(
        uint256 agentId,
        address clientAddress
    ) external view override returns (uint64 lastIndex) {
        uint64 count = _feedbackCount[agentId][clientAddress];
        if (count == 0) return 0;
        return count - 1;
    }

    function getClients(uint256 agentId) external view override returns (address[] memory clients) {
        return _agentClients[agentId];
    }

    // ============ Additional View Functions ============

    function getFeedbackFull(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex
    ) external view returns (Feedback memory) {
        Feedback storage fb = _feedback[agentId][clientAddress][feedbackIndex];
        if (fb.timestamp == 0) revert FeedbackNotFound();
        return fb;
    }

    function getResponseCount(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex
    ) external view returns (uint256) {
        return _responses[agentId][clientAddress][feedbackIndex].length;
    }

    function getResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        uint256 responseIndex
    ) external view returns (
        address responder,
        string memory responseURI,
        bytes32 responseHash,
        uint64 timestamp
    ) {
        Response storage r = _responses[agentId][clientAddress][feedbackIndex][responseIndex];
        return (r.responder, r.responseURI, r.responseHash, r.timestamp);
    }

    // ============ Admin Functions ============

    function setIdentityRegistry(address _identityRegistry) external onlyOwner {
        if (_identityRegistry == address(0)) revert ZeroAddress();
        identityRegistry = IERC8004Identity(_identityRegistry);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Storage Gap ============

    uint256[44] private __gap;
}
