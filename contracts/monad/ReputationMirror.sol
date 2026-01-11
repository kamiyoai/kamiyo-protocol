// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IKamiyoBridge.sol";

contract ReputationMirror is IKamiyoBridge {
    uint256[2] public vkAlpha;
    uint256[2][2] public vkBeta;
    uint256[2][2] public vkGamma;
    uint256[2][2] public vkDelta;
    uint256[2][] public vkIC;

    mapping(bytes32 => ReputationAttestation) private attestations;
    mapping(bytes32 => bool) private exists;

    address public admin;
    bool public paused;

    uint256 constant P = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    event AdminUpdated(address oldAdmin, address newAdmin);
    event Paused(bool isPaused);
    event VKUpdated();

    error NotAdmin();
    error IsPaused();
    error BadProof();
    error NotFound();
    error Stale();
    error BadInputs();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert IsPaused();
        _;
    }

    constructor(address _admin) {
        admin = _admin;
    }

    function submitAttestation(
        ReputationAttestation calldata att,
        Groth16Proof calldata proof,
        uint256[] calldata pubInputs
    ) external whenNotPaused {
        if (!verifyProof(proof, pubInputs)) revert BadProof();
        emit ProofVerified(att.entityHash, true);

        if (exists[att.entityHash]) {
            if (att.timestamp <= attestations[att.entityHash].timestamp) revert Stale();
        }

        attestations[att.entityHash] = att;
        exists[att.entityHash] = true;
        emit AttestationReceived(att.entityHash, att.reputationScore, att.timestamp);
    }

    function verifyProof(Groth16Proof calldata proof, uint256[] calldata pubInputs) public view returns (bool) {
        if (pubInputs.length + 1 > vkIC.length) revert BadInputs();
        uint256[2] memory vkX = vkIC[0];
        for (uint256 i = 0; i < pubInputs.length; i++) {
            vkX = pointAdd(vkX, scalarMul(vkIC[i + 1], pubInputs[i]));
        }
        return pairingCheck(proof.a, proof.b, vkAlpha, vkBeta, vkX, vkGamma, proof.c, vkDelta);
    }

    function getAttestation(bytes32 h) external view returns (ReputationAttestation memory) {
        if (!exists[h]) revert NotFound();
        return attestations[h];
    }

    function hasAttestation(bytes32 h) external view returns (bool) {
        return exists[h];
    }

    function getReputation(bytes32 h) external view returns (uint256, uint256, uint256) {
        if (!exists[h]) revert NotFound();
        ReputationAttestation storage a = attestations[h];
        return (a.reputationScore, a.totalTransactions, a.timestamp);
    }

    function reputationExists(bytes32 h) external view returns (bool) {
        return exists[h];
    }

    function setVerificationKey(
        uint256[2] calldata _a,
        uint256[2][2] calldata _b,
        uint256[2][2] calldata _g,
        uint256[2][2] calldata _d,
        uint256[2][] calldata _ic
    ) external onlyAdmin {
        vkAlpha = _a;
        vkBeta = _b;
        vkGamma = _g;
        vkDelta = _d;
        delete vkIC;
        for (uint256 i = 0; i < _ic.length; i++) vkIC.push(_ic[i]);
        emit VKUpdated();
    }

    function setAdmin(address _admin) external onlyAdmin {
        emit AdminUpdated(admin, _admin);
        admin = _admin;
    }

    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
        emit Paused(_paused);
    }

    function pointAdd(uint256[2] memory p1, uint256[2] memory p2) internal view returns (uint256[2] memory r) {
        uint256[4] memory i;
        i[0] = p1[0]; i[1] = p1[1]; i[2] = p2[0]; i[3] = p2[1];
        assembly { if iszero(staticcall(gas(), 0x06, i, 0x80, r, 0x40)) { revert(0, 0) } }
    }

    function scalarMul(uint256[2] memory p, uint256 s) internal view returns (uint256[2] memory r) {
        uint256[3] memory i;
        i[0] = p[0]; i[1] = p[1]; i[2] = s;
        assembly { if iszero(staticcall(gas(), 0x07, i, 0x60, r, 0x40)) { revert(0, 0) } }
    }

    function pairingCheck(
        uint256[2] memory a1, uint256[2][2] memory b1,
        uint256[2] memory a2, uint256[2][2] memory b2,
        uint256[2] memory a3, uint256[2][2] memory b3,
        uint256[2] memory a4, uint256[2][2] memory b4
    ) internal view returns (bool) {
        uint256[24] memory inp;

        // -A, B (negate A for pairing equation)
        inp[0] = a1[0];
        inp[1] = (P - a1[1]) % P;
        inp[2] = b1[0][1]; inp[3] = b1[0][0];
        inp[4] = b1[1][1]; inp[5] = b1[1][0];

        // alpha, beta
        inp[6] = a2[0]; inp[7] = a2[1];
        inp[8] = b2[0][1]; inp[9] = b2[0][0];
        inp[10] = b2[1][1]; inp[11] = b2[1][0];

        // vk_x, gamma
        inp[12] = a3[0]; inp[13] = a3[1];
        inp[14] = b3[0][1]; inp[15] = b3[0][0];
        inp[16] = b3[1][1]; inp[17] = b3[1][0];

        // C, delta
        inp[18] = a4[0]; inp[19] = a4[1];
        inp[20] = b4[0][1]; inp[21] = b4[0][0];
        inp[22] = b4[1][1]; inp[23] = b4[1][0];

        uint256[1] memory out;
        assembly { if iszero(staticcall(gas(), 0x08, inp, 0x300, out, 0x20)) { revert(0, 0) } }
        return out[0] == 1;
    }
}
