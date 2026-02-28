// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ERC8004ValidationRegistry} from "./ERC8004ValidationRegistry.sol";
import {ERC8004IdentityRegistry} from "./ERC8004IdentityRegistry.sol";
import {Groth16Verifier} from "./Groth16Verifier.sol";

/**
 * @title PoCHValidationBridge
 * @notice Base-side PoCH verification and ERC-8004 validation integration.
 */
contract PoCHValidationBridge is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable
{
    uint256 private constant BN254_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    enum PoCHStatus {
        None,
        Pending,
        Verified,
        Rejected,
        Disputed
    }

    struct PoCHRecord {
        uint256 agentId;
        bytes32 scoreBundleCommitment;
        bytes32 policyIdHash;
        bytes32 challengeIdHash;
        bytes32 identityNullifier;
        bytes32 oracleRoundIdHash;
        uint64 updatedAt;
        PoCHStatus status;
    }

    ERC8004ValidationRegistry public validationRegistry;
    ERC8004IdentityRegistry public identityRegistry;
    Groth16Verifier public verifier;

    mapping(bytes32 => PoCHRecord) public pochByRequest;
    mapping(bytes32 => bool) public usedNullifier;

    bytes32 public constant POCH_TAG = keccak256("kamiyo_poch");
    bytes32 public constant POCH_VERIFIED_TAG = keccak256("kamiyo_poch_verified");

    event PoCHRequested(bytes32 indexed requestHash, uint256 indexed agentId);
    event PoCHFinalized(
        bytes32 indexed requestHash,
        uint256 indexed agentId,
        PoCHStatus status,
        bytes32 scoreBundleCommitment,
        bytes32 oracleRoundIdHash
    );
    event PoCHDisputed(bytes32 indexed requestHash, uint256 indexed agentId);

    error ZeroAddress();
    error InvalidRequest();
    error InvalidProof();
    error RequestNotFound();
    error RequestAlreadyFinalized();
    error NullifierAlreadyUsed();
    error ChallengeIdMismatch();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _validationRegistry,
        address _identityRegistry,
        address _verifier,
        address _owner
    ) external initializer {
        if (
            _validationRegistry == address(0) ||
            _identityRegistry == address(0) ||
            _verifier == address(0) ||
            _owner == address(0)
        ) revert ZeroAddress();

        __Ownable_init(_owner);
        __Pausable_init();

        validationRegistry = ERC8004ValidationRegistry(_validationRegistry);
        identityRegistry = ERC8004IdentityRegistry(_identityRegistry);
        verifier = Groth16Verifier(_verifier);
    }

    function requestPoCHValidation(
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external whenNotPaused returns (bytes32) {
        // Validates the identity exists.
        identityRegistry.ownerOf(agentId);

        bytes32 finalHash = requestHash;
        if (finalHash == bytes32(0)) {
            finalHash = keccak256(
                abi.encodePacked(agentId, msg.sender, requestURI, block.timestamp)
            );
        }

        PoCHRecord storage record = pochByRequest[finalHash];
        if (record.status != PoCHStatus.None) revert InvalidRequest();

        record.agentId = agentId;
        record.updatedAt = uint64(block.timestamp);
        record.status = PoCHStatus.Pending;

        validationRegistry.validationRequest(address(this), agentId, requestURI, finalHash);
        emit PoCHRequested(finalHash, agentId);
        return finalHash;
    }

    function finalizePoCH(
        bytes32 requestHash,
        uint8 response,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[2] calldata pubSignals,
        bytes32 scoreBundleCommitment,
        bytes32 policyIdHash,
        bytes32 challengeIdHash,
        bytes32 identityNullifier,
        bytes32 oracleRoundIdHash
    ) external onlyOwner whenNotPaused {
        PoCHRecord storage record = pochByRequest[requestHash];
        if (record.status == PoCHStatus.None) revert RequestNotFound();
        if (record.status != PoCHStatus.Pending) revert RequestAlreadyFinalized();
        if (challengeIdHash != requestHash) revert ChallengeIdMismatch();

        bytes32 nullifierKey = keccak256(abi.encodePacked(block.chainid, identityNullifier));
        if (usedNullifier[nullifierKey]) revert NullifierAlreadyUsed();

        if (pubSignals[0] != uint256(scoreBundleCommitment)) revert InvalidProof();
        uint256 compressedSignal = uint256(
            keccak256(abi.encodePacked(policyIdHash, challengeIdHash, identityNullifier))
        ) % BN254_SCALAR_FIELD;
        if (pubSignals[1] != compressedSignal) revert InvalidProof();

        if (!verifier.verifyProof(pA, pB, pC, pubSignals)) revert InvalidProof();

        usedNullifier[nullifierKey] = true;

        record.scoreBundleCommitment = scoreBundleCommitment;
        record.policyIdHash = policyIdHash;
        record.challengeIdHash = challengeIdHash;
        record.identityNullifier = identityNullifier;
        record.oracleRoundIdHash = oracleRoundIdHash;
        record.updatedAt = uint64(block.timestamp);
        record.status = response >= 60 ? PoCHStatus.Verified : PoCHStatus.Rejected;

        validationRegistry.validationResponse(
            requestHash,
            response,
            "",
            keccak256(abi.encodePacked(scoreBundleCommitment, oracleRoundIdHash)),
            POCH_VERIFIED_TAG
        );

        emit PoCHFinalized(
            requestHash,
            record.agentId,
            record.status,
            scoreBundleCommitment,
            oracleRoundIdHash
        );
    }

    function markDisputed(bytes32 requestHash) external onlyOwner whenNotPaused {
        PoCHRecord storage record = pochByRequest[requestHash];
        if (record.status == PoCHStatus.None) revert RequestNotFound();

        record.status = PoCHStatus.Disputed;
        record.updatedAt = uint64(block.timestamp);
        emit PoCHDisputed(requestHash, record.agentId);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
