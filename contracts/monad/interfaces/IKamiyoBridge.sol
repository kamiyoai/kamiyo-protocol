// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IKamiyoBridge
 * @notice Interface for cross-chain bridge operations between Solana and Monad.
 */
interface IKamiyoBridge {
    struct Groth16Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    struct ReputationAttestation {
        bytes32 entityHash;
        uint256 reputationScore;
        uint256 totalTransactions;
        uint256 disputesWon;
        uint256 disputesLost;
        uint256 timestamp;
    }

    event AttestationReceived(
        bytes32 indexed entityHash,
        uint256 reputationScore,
        uint256 timestamp
    );

    event ProofVerified(bytes32 indexed entityHash, bool valid);

    /**
     * @notice Submit reputation attestation with ZK proof.
     * @param attestation The reputation data from Solana.
     * @param proof The Groth16 proof verifying the attestation.
     * @param publicInputs The public inputs for proof verification.
     */
    function submitAttestation(
        ReputationAttestation calldata attestation,
        Groth16Proof calldata proof,
        uint256[] calldata publicInputs
    ) external;

    /**
     * @notice Verify Groth16 proof using alt_bn128 precompiles.
     * @param proof The proof components.
     * @param publicInputs The public inputs.
     * @return valid Whether the proof is valid.
     */
    function verifyProof(
        Groth16Proof calldata proof,
        uint256[] calldata publicInputs
    ) external view returns (bool valid);

    /**
     * @notice Get latest attestation for entity.
     */
    function getAttestation(
        bytes32 entityHash
    ) external view returns (ReputationAttestation memory);

    /**
     * @notice Check if attestation exists for entity.
     */
    function hasAttestation(bytes32 entityHash) external view returns (bool);
}
