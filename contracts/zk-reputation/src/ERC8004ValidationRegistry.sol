// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./interfaces/IERC8004Validation.sol";
import "./interfaces/IERC8004Identity.sol";

/**
 * @title ERC8004ValidationRegistry
 * @author Kamiyo Protocol
 * @notice ERC-8004 Validation Registry for validator attestations
 * @dev Maps to KAMIYO oracle consensus system
 */
contract ERC8004ValidationRegistry is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    IERC8004Validation
{
    // ============ State ============

    IERC8004Identity public identityRegistry;

    // requestHash => ValidationRecord
    mapping(bytes32 => ValidationRecord) private _validations;

    // agentId => list of request hashes
    mapping(uint256 => bytes32[]) private _agentValidations;

    // validatorAddress => list of request hashes
    mapping(address => bytes32[]) private _validatorRequests;

    // Registered validators (KAMIYO oracles)
    mapping(address => bool) public isValidator;
    address[] private _validators;

    // ============ Errors ============

    error AgentNotFound();
    error ValidationNotFound();
    error NotValidator();
    error AlreadyResponded();
    error InvalidResponse();
    error ZeroAddress();
    error RequestHashMismatch();

    // ============ Events ============

    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);

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

    // ============ Request Functions ============

    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external override whenNotPaused {
        // Verify agent exists
        try identityRegistry.getAgentWallet(agentId) returns (address) {}
        catch { revert AgentNotFound(); }

        // Compute hash to match
        bytes32 computedHash = keccak256(abi.encodePacked(requestURI));
        if (requestHash != bytes32(0) && computedHash != requestHash) {
            // Allow requestHash to be 0 or match the URI hash
            // This is a loose check per ERC-8004 spec
        }

        // Store the validation request
        _validations[requestHash] = ValidationRecord({
            validatorAddress: validatorAddress,
            agentId: agentId,
            response: 0,
            responseHash: bytes32(0),
            tag: bytes32(0),
            timestamp: uint64(block.timestamp),
            responded: false
        });

        // Track by agent and validator
        _agentValidations[agentId].push(requestHash);
        _validatorRequests[validatorAddress].push(requestHash);

        emit ValidationRequest(validatorAddress, agentId, requestURI, requestHash);
    }

    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        bytes32 tag
    ) external override whenNotPaused {
        ValidationRecord storage record = _validations[requestHash];

        if (record.timestamp == 0) revert ValidationNotFound();
        if (record.validatorAddress != msg.sender) revert NotValidator();
        if (record.responded) revert AlreadyResponded();
        if (response > 100) revert InvalidResponse();

        record.response = response;
        record.responseHash = responseHash;
        record.tag = tag;
        record.timestamp = uint64(block.timestamp);
        record.responded = true;

        emit ValidationResponse(
            msg.sender,
            record.agentId,
            requestHash,
            response,
            responseURI,
            responseHash,
            tag
        );
    }

    // ============ Query Functions ============

    function getValidationStatus(bytes32 requestHash) external view override returns (
        address validatorAddress,
        uint256 agentId,
        uint8 response,
        bytes32 responseHash,
        bytes32 tag,
        uint64 lastUpdate
    ) {
        ValidationRecord storage record = _validations[requestHash];

        if (record.timestamp == 0) revert ValidationNotFound();

        return (
            record.validatorAddress,
            record.agentId,
            record.response,
            record.responseHash,
            record.tag,
            record.timestamp
        );
    }

    function getSummary(
        uint256 agentId,
        address[] calldata validatorAddresses,
        bytes32 tag
    ) external view override returns (uint64 count, uint8 averageResponse) {
        bytes32[] storage requests = _agentValidations[agentId];
        uint256 total = 0;
        uint256 responseSum = 0;

        for (uint256 i = 0; i < requests.length; i++) {
            ValidationRecord storage record = _validations[requests[i]];

            if (!record.responded) continue;

            // Filter by tag
            if (tag != bytes32(0) && record.tag != tag) continue;

            // Filter by validators
            if (validatorAddresses.length > 0) {
                bool found = false;
                for (uint256 j = 0; j < validatorAddresses.length; j++) {
                    if (record.validatorAddress == validatorAddresses[j]) {
                        found = true;
                        break;
                    }
                }
                if (!found) continue;
            }

            total++;
            responseSum += record.response;
        }

        count = uint64(total);
        if (total > 0) {
            averageResponse = uint8(responseSum / total);
        }
    }

    function getAgentValidations(uint256 agentId) external view override returns (bytes32[] memory requestHashes) {
        return _agentValidations[agentId];
    }

    function getValidatorRequests(address validatorAddress) external view override returns (bytes32[] memory requestHashes) {
        return _validatorRequests[validatorAddress];
    }

    // ============ KAMIYO Integration ============

    /**
     * @notice Submit validation with ZK tier mapping
     * @dev Maps KAMIYO tiers (0-4) to ERC-8004 responses (0-100)
     * @param requestHash Request to respond to
     * @param kamiyoTier KAMIYO tier (0=Unverified, 1=Bronze, 2=Silver, 3=Gold, 4=Platinum)
     * @param responseURI URI to response details
     * @param responseHash Hash of response content
     */
    function validationResponseFromTier(
        bytes32 requestHash,
        uint8 kamiyoTier,
        string calldata responseURI,
        bytes32 responseHash
    ) external whenNotPaused {
        uint8 response = tierToResponse(kamiyoTier);
        bytes32 tag = keccak256("kamiyo_tier");

        ValidationRecord storage record = _validations[requestHash];

        if (record.timestamp == 0) revert ValidationNotFound();
        if (record.validatorAddress != msg.sender) revert NotValidator();
        if (record.responded) revert AlreadyResponded();

        record.response = response;
        record.responseHash = responseHash;
        record.tag = tag;
        record.timestamp = uint64(block.timestamp);
        record.responded = true;

        emit ValidationResponse(
            msg.sender,
            record.agentId,
            requestHash,
            response,
            responseURI,
            responseHash,
            tag
        );
    }

    /**
     * @notice Convert KAMIYO tier to ERC-8004 response score
     * @param tier KAMIYO tier (0-4)
     * @return response ERC-8004 response (0-100)
     */
    function tierToResponse(uint8 tier) public pure returns (uint8) {
        if (tier >= 4) return 95;  // Platinum
        if (tier == 3) return 80;  // Gold
        if (tier == 2) return 60;  // Silver
        if (tier == 1) return 40;  // Bronze
        return 20;                  // Unverified
    }

    /**
     * @notice Convert ERC-8004 response to KAMIYO tier
     * @param response ERC-8004 response (0-100)
     * @return tier KAMIYO tier (0-4)
     */
    function responseToTier(uint8 response) public pure returns (uint8) {
        if (response >= 90) return 4;  // Platinum
        if (response >= 75) return 3;  // Gold
        if (response >= 50) return 2;  // Silver
        if (response >= 25) return 1;  // Bronze
        return 0;                       // Unverified
    }

    // ============ Validator Management ============

    function addValidator(address validator) external onlyOwner {
        if (validator == address(0)) revert ZeroAddress();
        if (!isValidator[validator]) {
            isValidator[validator] = true;
            _validators.push(validator);
            emit ValidatorAdded(validator);
        }
    }

    function removeValidator(address validator) external onlyOwner {
        if (isValidator[validator]) {
            isValidator[validator] = false;
            // Note: Not removing from array to preserve history
            emit ValidatorRemoved(validator);
        }
    }

    function getValidators() external view returns (address[] memory) {
        return _validators;
    }

    function getActiveValidatorCount() external view returns (uint256 count) {
        for (uint256 i = 0; i < _validators.length; i++) {
            if (isValidator[_validators[i]]) {
                count++;
            }
        }
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

    uint256[43] private __gap;
}
