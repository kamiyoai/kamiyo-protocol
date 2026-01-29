// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ZKReputationV2} from "./ZKReputationV2.sol";
import {ERC8004ValidationRegistry} from "./ERC8004ValidationRegistry.sol";
import {ERC8004IdentityRegistry} from "./ERC8004IdentityRegistry.sol";
import {Groth16Verifier} from "./Groth16Verifier.sol";

/**
 * @title ZKReputationBridge
 * @author Kamiyo Protocol
 * @notice Bridges ZK reputation proofs to ERC-8004 validation format
 * @dev Connects ZKReputationV2 tier proofs with ERC8004ValidationRegistry
 */
contract ZKReputationBridge is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable
{
    // ============ State ============

    ZKReputationV2 public zkReputation;
    ERC8004ValidationRegistry public validationRegistry;
    ERC8004IdentityRegistry public identityRegistry;
    Groth16Verifier public verifier;

    // agentAddress => ERC-8004 agentId mapping
    mapping(address => uint256) public agentToIdentity;
    mapping(uint256 => address) public identityToAgent;

    // Pending attestation requests
    struct AttestationRequest {
        address agentAddress;
        uint256 agentId;
        uint256 requestedTier;
        uint64 timestamp;
        bool fulfilled;
    }

    mapping(bytes32 => AttestationRequest) public attestationRequests;

    // ============ Constants ============

    bytes32 public constant KAMIYO_TIER_TAG = keccak256("kamiyo_tier");
    bytes32 public constant ZK_VERIFIED_TAG = keccak256("zk_verified");

    // ============ Events ============

    event AgentLinked(address indexed agentAddress, uint256 indexed agentId);
    event AgentUnlinked(address indexed agentAddress, uint256 indexed agentId);
    event AttestationRequested(
        bytes32 indexed requestHash,
        address indexed agentAddress,
        uint256 indexed agentId,
        uint256 requestedTier
    );
    event AttestationFulfilled(
        bytes32 indexed requestHash,
        address indexed agentAddress,
        uint256 verifiedTier,
        uint8 erc8004Response
    );
    event TierAttested(
        address indexed agentAddress,
        uint256 indexed agentId,
        ZKReputationV2.Tier tier,
        uint8 response
    );

    // ============ Errors ============

    error ZeroAddress();
    error AgentNotLinked();
    error AgentAlreadyLinked();
    error IdentityAlreadyLinked();
    error NotAgentOwner();
    error InvalidProof();
    error RequestNotFound();
    error RequestAlreadyFulfilled();
    error AgentNotRegisteredInZK();

    // ============ Constructor ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _zkReputation,
        address _validationRegistry,
        address _identityRegistry,
        address _verifier,
        address _owner
    ) external initializer {
        if (_zkReputation == address(0) || _validationRegistry == address(0) ||
            _identityRegistry == address(0) || _verifier == address(0) || _owner == address(0)) {
            revert ZeroAddress();
        }

        __Ownable_init(_owner);
        __Pausable_init();

        zkReputation = ZKReputationV2(_zkReputation);
        validationRegistry = ERC8004ValidationRegistry(_validationRegistry);
        identityRegistry = ERC8004IdentityRegistry(_identityRegistry);
        verifier = Groth16Verifier(_verifier);
    }

    // ============ Linking Functions ============

    /**
     * @notice Link a ZK-registered agent address to an ERC-8004 identity
     * @param agentId ERC-8004 identity token ID
     */
    function linkAgent(uint256 agentId) external whenNotPaused {
        if (agentToIdentity[msg.sender] != 0) revert AgentAlreadyLinked();
        if (identityToAgent[agentId] != address(0)) revert IdentityAlreadyLinked();

        // Verify caller owns the ERC-8004 identity
        if (identityRegistry.ownerOf(agentId) != msg.sender) revert NotAgentOwner();

        // Verify agent is registered in ZK reputation
        if (!zkReputation.isRegistered(msg.sender)) revert AgentNotRegisteredInZK();

        agentToIdentity[msg.sender] = agentId;
        identityToAgent[agentId] = msg.sender;

        emit AgentLinked(msg.sender, agentId);
    }

    /**
     * @notice Unlink an agent from their ERC-8004 identity
     */
    function unlinkAgent() external {
        uint256 agentId = agentToIdentity[msg.sender];
        if (agentId == 0) revert AgentNotLinked();

        delete agentToIdentity[msg.sender];
        delete identityToAgent[agentId];

        emit AgentUnlinked(msg.sender, agentId);
    }

    // ============ Attestation Functions ============

    /**
     * @notice Request ZK tier attestation for an agent
     * @dev Creates a validation request in ERC-8004 format
     * @param agentAddress Address of the ZK-registered agent
     * @param requestedTier Minimum tier to verify (0-4)
     * @return requestHash Hash identifying this attestation request
     */
    function requestAttestation(
        address agentAddress,
        uint256 requestedTier
    ) external whenNotPaused returns (bytes32 requestHash) {
        uint256 agentId = agentToIdentity[agentAddress];
        if (agentId == 0) revert AgentNotLinked();

        requestHash = keccak256(abi.encodePacked(
            agentAddress,
            agentId,
            requestedTier,
            block.timestamp
        ));

        attestationRequests[requestHash] = AttestationRequest({
            agentAddress: agentAddress,
            agentId: agentId,
            requestedTier: requestedTier,
            timestamp: uint64(block.timestamp),
            fulfilled: false
        });

        // Create ERC-8004 validation request with this contract as validator
        validationRegistry.validationRequest(
            address(this),
            agentId,
            "",
            requestHash
        );

        emit AttestationRequested(requestHash, agentAddress, agentId, requestedTier);
    }

    /**
     * @notice Fulfill attestation with ZK proof
     * @dev Agent proves their tier and bridge submits ERC-8004 validation response
     * @param requestHash Request to fulfill
     * @param pA Groth16 proof component A
     * @param pB Groth16 proof component B
     * @param pC Groth16 proof component C
     * @param threshold Tier threshold being proven
     */
    function fulfillAttestation(
        bytes32 requestHash,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256 threshold
    ) external whenNotPaused {
        AttestationRequest storage request = attestationRequests[requestHash];

        if (request.timestamp == 0) revert RequestNotFound();
        if (request.fulfilled) revert RequestAlreadyFulfilled();

        // Verify the ZK proof
        uint256 commitment = zkReputation.getAgentCommitment(request.agentAddress);
        uint256[2] memory pubSignals;
        pubSignals[0] = threshold;
        pubSignals[1] = commitment;

        if (!verifier.verifyProof(pA, pB, pC, pubSignals)) revert InvalidProof();

        // Convert threshold to tier
        ZKReputationV2.Tier tier = _thresholdToTier(threshold);
        uint8 response = _tierToResponse(tier);

        request.fulfilled = true;

        // Submit ERC-8004 validation response
        validationRegistry.validationResponse(
            requestHash,
            response,
            "",
            bytes32(0),
            ZK_VERIFIED_TAG
        );

        emit AttestationFulfilled(requestHash, request.agentAddress, uint256(tier), response);
    }

    /**
     * @notice Attest current tier directly (no proof required, reads from ZKReputationV2)
     * @dev Uses the existing verified tier from ZKReputationV2
     * @param agentAddress Agent to attest
     * @return agentId ERC-8004 identity
     * @return tier Current verified tier
     * @return response ERC-8004 response value
     */
    function attestCurrentTier(
        address agentAddress
    ) external whenNotPaused returns (uint256 agentId, ZKReputationV2.Tier tier, uint8 response) {
        agentId = agentToIdentity[agentAddress];
        if (agentId == 0) revert AgentNotLinked();

        // Get current tier from ZK reputation (accounts for decay)
        tier = zkReputation.getAgentTier(agentAddress);
        response = _tierToResponse(tier);

        // Create and immediately fulfill a validation request
        bytes32 requestHash = keccak256(abi.encodePacked(
            agentAddress,
            agentId,
            "current_tier",
            block.timestamp
        ));

        validationRegistry.validationRequest(address(this), agentId, "", requestHash);
        validationRegistry.validationResponse(requestHash, response, "", bytes32(0), KAMIYO_TIER_TAG);

        emit TierAttested(agentAddress, agentId, tier, response);
    }

    /**
     * @notice Batch attest multiple agents
     * @param agentAddresses Array of agent addresses
     */
    function batchAttestCurrentTier(
        address[] calldata agentAddresses
    ) external whenNotPaused {
        for (uint256 i = 0; i < agentAddresses.length; i++) {
            address agentAddress = agentAddresses[i];
            uint256 agentId = agentToIdentity[agentAddress];

            if (agentId == 0) continue; // Skip unlinked agents

            ZKReputationV2.Tier tier = zkReputation.getAgentTier(agentAddress);
            uint8 response = _tierToResponse(tier);

            bytes32 requestHash = keccak256(abi.encodePacked(
                agentAddress,
                agentId,
                "batch_attest",
                block.timestamp,
                i
            ));

            validationRegistry.validationRequest(address(this), agentId, "", requestHash);
            validationRegistry.validationResponse(requestHash, response, "", bytes32(0), KAMIYO_TIER_TAG);

            emit TierAttested(agentAddress, agentId, tier, response);
        }
    }

    // ============ View Functions ============

    /**
     * @notice Get linked ERC-8004 identity for an agent address
     * @param agentAddress ZK-registered agent address
     * @return agentId ERC-8004 identity token ID (0 if not linked)
     */
    function getLinkedIdentity(address agentAddress) external view returns (uint256) {
        return agentToIdentity[agentAddress];
    }

    /**
     * @notice Get agent address for an ERC-8004 identity
     * @param agentId ERC-8004 identity token ID
     * @return agentAddress ZK-registered agent address (0 if not linked)
     */
    function getLinkedAgent(uint256 agentId) external view returns (address) {
        return identityToAgent[agentId];
    }

    /**
     * @notice Get attestation request details
     * @param requestHash Request hash
     */
    function getAttestationRequest(bytes32 requestHash) external view returns (
        address agentAddress,
        uint256 agentId,
        uint256 requestedTier,
        uint64 timestamp,
        bool fulfilled
    ) {
        AttestationRequest storage request = attestationRequests[requestHash];
        return (
            request.agentAddress,
            request.agentId,
            request.requestedTier,
            request.timestamp,
            request.fulfilled
        );
    }

    /**
     * @notice Check if an agent is linked and get their current tier info
     * @param agentAddress Agent address
     * @return linked Whether agent is linked
     * @return agentId ERC-8004 identity
     * @return tier Current ZK tier
     * @return response Equivalent ERC-8004 response
     */
    function getAgentStatus(address agentAddress) external view returns (
        bool linked,
        uint256 agentId,
        ZKReputationV2.Tier tier,
        uint8 response
    ) {
        agentId = agentToIdentity[agentAddress];
        linked = agentId != 0;

        if (linked && zkReputation.isRegistered(agentAddress)) {
            tier = zkReputation.getAgentTier(agentAddress);
            response = _tierToResponse(tier);
        }
    }

    // ============ Internal Functions ============

    function _thresholdToTier(uint256 threshold) internal pure returns (ZKReputationV2.Tier) {
        if (threshold >= 90) return ZKReputationV2.Tier.Platinum;
        if (threshold >= 75) return ZKReputationV2.Tier.Gold;
        if (threshold >= 50) return ZKReputationV2.Tier.Silver;
        if (threshold >= 25) return ZKReputationV2.Tier.Bronze;
        return ZKReputationV2.Tier.Unverified;
    }

    function _tierToResponse(ZKReputationV2.Tier tier) internal pure returns (uint8) {
        if (tier == ZKReputationV2.Tier.Platinum) return 95;
        if (tier == ZKReputationV2.Tier.Gold) return 80;
        if (tier == ZKReputationV2.Tier.Silver) return 60;
        if (tier == ZKReputationV2.Tier.Bronze) return 40;
        return 20; // Unverified
    }

    // ============ Admin Functions ============

    function setZKReputation(address _zkReputation) external onlyOwner {
        if (_zkReputation == address(0)) revert ZeroAddress();
        zkReputation = ZKReputationV2(_zkReputation);
    }

    function setValidationRegistry(address _validationRegistry) external onlyOwner {
        if (_validationRegistry == address(0)) revert ZeroAddress();
        validationRegistry = ERC8004ValidationRegistry(_validationRegistry);
    }

    function setIdentityRegistry(address _identityRegistry) external onlyOwner {
        if (_identityRegistry == address(0)) revert ZeroAddress();
        identityRegistry = ERC8004IdentityRegistry(_identityRegistry);
    }

    function setVerifier(address _verifier) external onlyOwner {
        if (_verifier == address(0)) revert ZeroAddress();
        verifier = Groth16Verifier(_verifier);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Storage Gap ============

    uint256[43] private __gap;
}
