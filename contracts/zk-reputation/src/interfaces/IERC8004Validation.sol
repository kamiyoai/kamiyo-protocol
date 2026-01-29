// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IERC8004Validation
 * @notice ERC-8004 Validation Registry interface for validator attestations
 * @dev Based on EIP-8004 specification. Maps to KAMIYO oracle consensus.
 */
interface IERC8004Validation {
    // ============ Structs ============

    struct ValidationRecord {
        address validatorAddress;
        uint256 agentId;
        uint8 response;        // 0-100 score
        bytes32 responseHash;
        bytes32 tag;
        uint64 timestamp;
        bool responded;
    }

    // ============ Events ============

    event ValidationRequest(
        address indexed validatorAddress,
        uint256 indexed agentId,
        string requestURI,
        bytes32 indexed requestHash
    );

    event ValidationResponse(
        address indexed validatorAddress,
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint8 response,
        string responseURI,
        bytes32 responseHash,
        bytes32 tag
    );

    // ============ Request Functions ============

    /**
     * @notice Request validation from a specific validator
     * @param validatorAddress Validator to request from
     * @param agentId Agent token ID to validate
     * @param requestURI URI to validation request details
     * @param requestHash Hash of request content
     */
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external;

    /**
     * @notice Submit validation response
     * @param requestHash Hash identifying the request
     * @param response Validation score (0-100)
     * @param responseURI URI to response details
     * @param responseHash Hash of response content
     * @param tag Category tag for the validation
     */
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        bytes32 tag
    ) external;

    // ============ Query Functions ============

    /**
     * @notice Get validation status for a request
     * @param requestHash Request hash
     * @return validatorAddress Validator who was requested
     * @return agentId Agent being validated
     * @return response Validation response (0-100)
     * @return responseHash Hash of response content
     * @return tag Validation category
     * @return lastUpdate Timestamp of last update
     */
    function getValidationStatus(bytes32 requestHash) external view returns (
        address validatorAddress,
        uint256 agentId,
        uint8 response,
        bytes32 responseHash,
        bytes32 tag,
        uint64 lastUpdate
    );

    /**
     * @notice Get aggregated validation summary
     * @param agentId Agent token ID
     * @param validatorAddresses Validators to include (empty for all)
     * @param tag Filter by tag (0 for all)
     * @return count Number of validations
     * @return averageResponse Average response score
     */
    function getSummary(
        uint256 agentId,
        address[] calldata validatorAddresses,
        bytes32 tag
    ) external view returns (uint64 count, uint8 averageResponse);

    /**
     * @notice Get all validation requests for an agent
     * @param agentId Agent token ID
     * @return requestHashes Array of request hashes
     */
    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory requestHashes);

    /**
     * @notice Get all validation requests assigned to a validator
     * @param validatorAddress Validator address
     * @return requestHashes Array of request hashes
     */
    function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory requestHashes);
}
