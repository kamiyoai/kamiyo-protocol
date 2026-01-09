// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

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

    event AttestationReceived(bytes32 indexed entityHash, uint256 reputationScore, uint256 timestamp);
    event ProofVerified(bytes32 indexed entityHash, bool valid);

    function submitAttestation(
        ReputationAttestation calldata attestation,
        Groth16Proof calldata proof,
        uint256[] calldata publicInputs
    ) external;

    function verifyProof(Groth16Proof calldata proof, uint256[] calldata publicInputs) external view returns (bool);
    function getAttestation(bytes32 entityHash) external view returns (ReputationAttestation memory);
    function hasAttestation(bytes32 entityHash) external view returns (bool);
}
