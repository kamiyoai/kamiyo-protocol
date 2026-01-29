// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IKamiyoBridge.sol";

/**
 * @title ERC8004IdentityMirror
 * @author Kamiyo Protocol
 * @notice Mirrors ERC-8004 identities from Base chain to Monad
 * @dev Receives identity attestations via ZK proofs from the canonical registry
 */
contract ERC8004IdentityMirror {
    // ============ Types ============

    struct IdentityAttestation {
        bytes32 globalIdHash;       // keccak256(globalId)
        string globalId;            // eip155:{chainId}:{registry}:{agentId}
        address owner;              // Owner on canonical chain
        address wallet;             // Agent wallet
        string agentURI;            // Profile URI
        uint256 timestamp;          // Attestation timestamp
        uint8 tier;                 // KAMIYO tier (0-4)
        bool exists;
    }

    // ============ State ============

    // Verification key components for Groth16
    uint256[2] public vkAlpha;
    uint256[2][2] public vkBeta;
    uint256[2][2] public vkGamma;
    uint256[2][2] public vkDelta;
    uint256[2][] public vkIC;

    // globalIdHash => IdentityAttestation
    mapping(bytes32 => IdentityAttestation) private _identities;

    // owner address => list of globalIdHashes they own
    mapping(address => bytes32[]) private _ownerIdentities;

    // wallet address => globalIdHash (for reverse lookup)
    mapping(address => bytes32) private _walletToIdentity;

    // Total mirrored identities
    uint256 public totalIdentities;

    address public admin;
    bool public paused;

    uint256 constant P = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // ============ Events ============

    event IdentityMirrored(
        bytes32 indexed globalIdHash,
        string globalId,
        address indexed owner,
        address wallet,
        uint8 tier
    );
    event IdentityUpdated(
        bytes32 indexed globalIdHash,
        address indexed owner,
        uint8 tier,
        uint256 timestamp
    );
    event ProofVerified(bytes32 indexed globalIdHash, bool valid);
    event AdminUpdated(address oldAdmin, address newAdmin);
    event Paused(bool isPaused);
    event VKUpdated();

    // ============ Errors ============

    error NotAdmin();
    error IsPaused();
    error BadProof();
    error NotFound();
    error Stale();
    error BadInputs();
    error ZeroAddress();
    error InvalidGlobalId();

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert IsPaused();
        _;
    }

    // ============ Constructor ============

    constructor(address _admin) {
        if (_admin == address(0)) revert ZeroAddress();
        admin = _admin;
    }

    // ============ Mirror Functions ============

    /**
     * @notice Submit identity attestation with ZK proof
     * @param globalId ERC-8004 global identifier
     * @param owner Owner address on canonical chain
     * @param wallet Agent wallet address
     * @param agentURI Profile URI
     * @param tier KAMIYO tier (0-4)
     * @param proof Groth16 proof
     * @param pubInputs Public inputs for verification
     */
    function mirrorIdentity(
        string calldata globalId,
        address owner,
        address wallet,
        string calldata agentURI,
        uint8 tier,
        IKamiyoBridge.Groth16Proof calldata proof,
        uint256[] calldata pubInputs
    ) external whenNotPaused {
        if (owner == address(0)) revert ZeroAddress();
        if (!_validateGlobalIdFormat(globalId)) revert InvalidGlobalId();

        // Verify ZK proof
        if (!verifyProof(proof, pubInputs)) revert BadProof();

        bytes32 globalIdHash = keccak256(bytes(globalId));
        emit ProofVerified(globalIdHash, true);

        IdentityAttestation storage identity = _identities[globalIdHash];

        // Check if update is stale
        if (identity.exists && block.timestamp <= identity.timestamp) revert Stale();

        bool isNew = !identity.exists;

        // Update identity
        identity.globalIdHash = globalIdHash;
        identity.globalId = globalId;
        identity.owner = owner;
        identity.wallet = wallet != address(0) ? wallet : owner;
        identity.agentURI = agentURI;
        identity.timestamp = block.timestamp;
        identity.tier = tier;
        identity.exists = true;

        // Update wallet mapping
        if (wallet != address(0)) {
            _walletToIdentity[wallet] = globalIdHash;
        }

        if (isNew) {
            _ownerIdentities[owner].push(globalIdHash);
            totalIdentities++;
            emit IdentityMirrored(globalIdHash, globalId, owner, identity.wallet, tier);
        } else {
            emit IdentityUpdated(globalIdHash, owner, tier, block.timestamp);
        }
    }

    /**
     * @notice Submit identity without proof (admin only, for bootstrapping)
     * @dev Only use during initial migration, disable after
     */
    function mirrorIdentityAdmin(
        string calldata globalId,
        address owner,
        address wallet,
        string calldata agentURI,
        uint8 tier
    ) external onlyAdmin whenNotPaused {
        if (owner == address(0)) revert ZeroAddress();
        if (!_validateGlobalIdFormat(globalId)) revert InvalidGlobalId();

        bytes32 globalIdHash = keccak256(bytes(globalId));
        IdentityAttestation storage identity = _identities[globalIdHash];

        bool isNew = !identity.exists;

        identity.globalIdHash = globalIdHash;
        identity.globalId = globalId;
        identity.owner = owner;
        identity.wallet = wallet != address(0) ? wallet : owner;
        identity.agentURI = agentURI;
        identity.timestamp = block.timestamp;
        identity.tier = tier;
        identity.exists = true;

        if (wallet != address(0)) {
            _walletToIdentity[wallet] = globalIdHash;
        }

        if (isNew) {
            _ownerIdentities[owner].push(globalIdHash);
            totalIdentities++;
            emit IdentityMirrored(globalIdHash, globalId, owner, identity.wallet, tier);
        } else {
            emit IdentityUpdated(globalIdHash, owner, tier, block.timestamp);
        }
    }

    /**
     * @notice Batch mirror multiple identities (admin only)
     */
    function batchMirrorIdentities(
        string[] calldata globalIds,
        address[] calldata owners,
        address[] calldata wallets,
        string[] calldata agentURIs,
        uint8[] calldata tiers
    ) external onlyAdmin whenNotPaused {
        uint256 len = globalIds.length;
        if (len != owners.length || len != wallets.length ||
            len != agentURIs.length || len != tiers.length) {
            revert BadInputs();
        }

        for (uint256 i = 0; i < len; i++) {
            _mirrorSingle(globalIds[i], owners[i], wallets[i], agentURIs[i], tiers[i]);
        }
    }

    function _mirrorSingle(
        string calldata globalId,
        address owner,
        address wallet,
        string calldata agentURI,
        uint8 tier
    ) internal {
        if (owner == address(0)) return;
        if (!_validateGlobalIdFormat(globalId)) return;

        bytes32 globalIdHash = keccak256(bytes(globalId));
        IdentityAttestation storage identity = _identities[globalIdHash];
        bool isNew = !identity.exists;

        identity.globalIdHash = globalIdHash;
        identity.globalId = globalId;
        identity.owner = owner;
        identity.wallet = wallet != address(0) ? wallet : owner;
        identity.agentURI = agentURI;
        identity.timestamp = block.timestamp;
        identity.tier = tier;
        identity.exists = true;

        if (wallet != address(0)) {
            _walletToIdentity[wallet] = globalIdHash;
        }

        if (isNew) {
            _ownerIdentities[owner].push(globalIdHash);
            totalIdentities++;
            emit IdentityMirrored(globalIdHash, globalId, owner, identity.wallet, tier);
        }
    }

    // ============ Query Functions ============

    /**
     * @notice Get identity by global ID hash
     * @param globalIdHash keccak256(globalId)
     */
    function getIdentity(bytes32 globalIdHash) external view returns (IdentityAttestation memory) {
        if (!_identities[globalIdHash].exists) revert NotFound();
        return _identities[globalIdHash];
    }

    /**
     * @notice Get identity by global ID string
     * @param globalId ERC-8004 global identifier
     */
    function getIdentityByGlobalId(string calldata globalId) external view returns (IdentityAttestation memory) {
        bytes32 globalIdHash = keccak256(bytes(globalId));
        if (!_identities[globalIdHash].exists) revert NotFound();
        return _identities[globalIdHash];
    }

    /**
     * @notice Get identity by wallet address
     * @param wallet Agent wallet address
     */
    function getIdentityByWallet(address wallet) external view returns (IdentityAttestation memory) {
        bytes32 globalIdHash = _walletToIdentity[wallet];
        if (globalIdHash == bytes32(0) || !_identities[globalIdHash].exists) revert NotFound();
        return _identities[globalIdHash];
    }

    /**
     * @notice Check if identity exists
     * @param globalIdHash keccak256(globalId)
     */
    function hasIdentity(bytes32 globalIdHash) external view returns (bool) {
        return _identities[globalIdHash].exists;
    }

    /**
     * @notice Get agent wallet for global ID
     * @param globalIdHash keccak256(globalId)
     */
    function getAgentWallet(bytes32 globalIdHash) external view returns (address) {
        if (!_identities[globalIdHash].exists) revert NotFound();
        return _identities[globalIdHash].wallet;
    }

    /**
     * @notice Get tier for global ID
     * @param globalIdHash keccak256(globalId)
     */
    function getTier(bytes32 globalIdHash) external view returns (uint8) {
        if (!_identities[globalIdHash].exists) revert NotFound();
        return _identities[globalIdHash].tier;
    }

    /**
     * @notice Get all identities owned by an address
     * @param owner Owner address
     */
    function getIdentitiesByOwner(address owner) external view returns (bytes32[] memory) {
        return _ownerIdentities[owner];
    }

    /**
     * @notice Convert tier to ERC-8004 response score
     * @param tier KAMIYO tier (0-4)
     */
    function tierToResponse(uint8 tier) external pure returns (uint8) {
        if (tier >= 4) return 95;  // Platinum
        if (tier == 3) return 80;  // Gold
        if (tier == 2) return 60;  // Silver
        if (tier == 1) return 40;  // Bronze
        return 20;                  // Unverified
    }

    // ============ Verification ============

    function verifyProof(
        IKamiyoBridge.Groth16Proof calldata proof,
        uint256[] calldata pubInputs
    ) public view returns (bool) {
        if (pubInputs.length + 1 > vkIC.length) revert BadInputs();

        uint256[2] memory vkX = vkIC[0];
        for (uint256 i = 0; i < pubInputs.length; i++) {
            vkX = pointAdd(vkX, scalarMul(vkIC[i + 1], pubInputs[i]));
        }

        return pairingCheck(proof.a, proof.b, vkAlpha, vkBeta, vkX, vkGamma, proof.c, vkDelta);
    }

    // ============ Internal Functions ============

    function _validateGlobalIdFormat(string calldata globalId) internal pure returns (bool) {
        bytes memory b = bytes(globalId);
        if (b.length < 14) return false;

        // Check "eip155:" prefix
        if (b[0] != 'e' || b[1] != 'i' || b[2] != 'p' ||
            b[3] != '1' || b[4] != '5' || b[5] != '5' || b[6] != ':') {
            return false;
        }

        // Count colons (should be exactly 3)
        uint256 colonCount = 0;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == ':') colonCount++;
        }

        return colonCount == 3;
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

        // -A, B
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

    // ============ Admin Functions ============

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
        if (_admin == address(0)) revert ZeroAddress();
        emit AdminUpdated(admin, _admin);
        admin = _admin;
    }

    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
        emit Paused(_paused);
    }
}
