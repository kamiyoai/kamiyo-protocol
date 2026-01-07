// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IKamiyoBridge.sol";

/**
 * @title ReputationMirror
 * @notice Mirrors Solana reputation state with ZK proof verification.
 * @dev Uses alt_bn128 precompiles for Groth16 proof verification.
 */
contract ReputationMirror is IKamiyoBridge {
    // Verification key components (set during deployment)
    uint256[2] public vkAlpha;
    uint256[2][2] public vkBeta;
    uint256[2] public vkGamma;
    uint256[2] public vkDelta;
    uint256[2][] public vkIC;

    // Stored attestations
    mapping(bytes32 => ReputationAttestation) private attestations;
    mapping(bytes32 => bool) private attestationExists;

    // Admin
    address public admin;
    bool public paused;

    event AdminUpdated(address oldAdmin, address newAdmin);
    event Paused(bool isPaused);
    event VerificationKeyUpdated();

    error NotAdmin();
    error ContractPaused();
    error InvalidProof();
    error AttestationNotFound();
    error StaleAttestation();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    constructor(address _admin) {
        admin = _admin;
    }

    /**
     * @notice Submit reputation attestation with ZK proof.
     */
    function submitAttestation(
        ReputationAttestation calldata attestation,
        Groth16Proof calldata proof,
        uint256[] calldata publicInputs
    ) external whenNotPaused {
        // Verify the proof
        bool valid = verifyProof(proof, publicInputs);
        if (!valid) revert InvalidProof();

        emit ProofVerified(attestation.entityHash, true);

        // Check attestation is newer than existing
        if (attestationExists[attestation.entityHash]) {
            ReputationAttestation storage existing = attestations[
                attestation.entityHash
            ];
            if (attestation.timestamp <= existing.timestamp) {
                revert StaleAttestation();
            }
        }

        // Store attestation
        attestations[attestation.entityHash] = attestation;
        attestationExists[attestation.entityHash] = true;

        emit AttestationReceived(
            attestation.entityHash,
            attestation.reputationScore,
            attestation.timestamp
        );
    }

    /**
     * @notice Verify Groth16 proof using alt_bn128 precompiles.
     * @dev Implements pairing check: e(A, B) = e(alpha, beta) * e(vk_x, gamma) * e(C, delta)
     */
    function verifyProof(
        Groth16Proof calldata proof,
        uint256[] calldata publicInputs
    ) public view returns (bool) {
        // Compute vk_x = sum(publicInputs[i] * vkIC[i+1]) + vkIC[0]
        uint256[2] memory vkX = vkIC[0];

        for (uint256 i = 0; i < publicInputs.length; i++) {
            uint256[2] memory term = scalarMul(vkIC[i + 1], publicInputs[i]);
            vkX = pointAdd(vkX, term);
        }

        // Pairing check
        return
            pairingCheck(
                proof.a,
                proof.b,
                vkAlpha,
                vkBeta,
                vkX,
                vkGamma,
                proof.c,
                vkDelta
            );
    }

    /**
     * @notice Get attestation for entity.
     */
    function getAttestation(
        bytes32 entityHash
    ) external view returns (ReputationAttestation memory) {
        if (!attestationExists[entityHash]) revert AttestationNotFound();
        return attestations[entityHash];
    }

    /**
     * @notice Check if attestation exists.
     */
    function hasAttestation(bytes32 entityHash) external view returns (bool) {
        return attestationExists[entityHash];
    }

    /**
     * @notice Get reputation score for entity.
     */
    function getReputation(
        bytes32 entityHash
    )
        external
        view
        returns (uint256 score, uint256 transactions, uint256 updated)
    {
        if (!attestationExists[entityHash]) revert AttestationNotFound();
        ReputationAttestation storage att = attestations[entityHash];
        return (att.reputationScore, att.totalTransactions, att.timestamp);
    }

    /**
     * @notice Check if reputation exists.
     */
    function reputationExists(bytes32 entityHash) external view returns (bool) {
        return attestationExists[entityHash];
    }

    /**
     * @notice Update verification key.
     */
    function setVerificationKey(
        uint256[2] calldata _alpha,
        uint256[2][2] calldata _beta,
        uint256[2] calldata _gamma,
        uint256[2] calldata _delta,
        uint256[2][] calldata _ic
    ) external onlyAdmin {
        vkAlpha = _alpha;
        vkBeta = _beta;
        vkGamma = _gamma;
        vkDelta = _delta;

        delete vkIC;
        for (uint256 i = 0; i < _ic.length; i++) {
            vkIC.push(_ic[i]);
        }

        emit VerificationKeyUpdated();
    }

    /**
     * @notice Update admin.
     */
    function setAdmin(address _admin) external onlyAdmin {
        emit AdminUpdated(admin, _admin);
        admin = _admin;
    }

    /**
     * @notice Pause/unpause contract.
     */
    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
        emit Paused(_paused);
    }

    // BN128 curve operations using precompiles

    function pointAdd(
        uint256[2] memory p1,
        uint256[2] memory p2
    ) internal view returns (uint256[2] memory r) {
        uint256[4] memory input;
        input[0] = p1[0];
        input[1] = p1[1];
        input[2] = p2[0];
        input[3] = p2[1];

        assembly {
            if iszero(staticcall(gas(), 0x06, input, 0x80, r, 0x40)) {
                revert(0, 0)
            }
        }
    }

    function scalarMul(
        uint256[2] memory p,
        uint256 s
    ) internal view returns (uint256[2] memory r) {
        uint256[3] memory input;
        input[0] = p[0];
        input[1] = p[1];
        input[2] = s;

        assembly {
            if iszero(staticcall(gas(), 0x07, input, 0x60, r, 0x40)) {
                revert(0, 0)
            }
        }
    }

    function pairingCheck(
        uint256[2] memory a1,
        uint256[2][2] memory b1,
        uint256[2] memory a2,
        uint256[2][2] memory b2,
        uint256[2] memory a3,
        uint256[2] memory b3,
        uint256[2] memory a4,
        uint256[2] memory b4
    ) internal view returns (bool) {
        uint256[24] memory input;

        // First pairing: -A, B
        input[0] = a1[0];
        input[1] = (21888242871839275222246405745257275088696311157297823662689037894645226208583 - a1[1]) % 21888242871839275222246405745257275088696311157297823662689037894645226208583;
        input[2] = b1[0][1];
        input[3] = b1[0][0];
        input[4] = b1[1][1];
        input[5] = b1[1][0];

        // Second pairing: alpha, beta
        input[6] = a2[0];
        input[7] = a2[1];
        input[8] = b2[0][1];
        input[9] = b2[0][0];
        input[10] = b2[1][1];
        input[11] = b2[1][0];

        // Third pairing: vk_x, gamma
        input[12] = a3[0];
        input[13] = a3[1];
        input[14] = b3[0];
        input[15] = b3[1];
        input[16] = 0;
        input[17] = 0;

        // Fourth pairing: C, delta
        input[18] = a4[0];
        input[19] = a4[1];
        input[20] = b4[0];
        input[21] = b4[1];
        input[22] = 0;
        input[23] = 0;

        uint256[1] memory result;
        assembly {
            if iszero(staticcall(gas(), 0x08, input, 0x300, result, 0x20)) {
                revert(0, 0)
            }
        }

        return result[0] == 1;
    }
}
