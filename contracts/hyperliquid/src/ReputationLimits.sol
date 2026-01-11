// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/**
 * @title ReputationLimits
 * @author Kamiyo Protocol
 * @notice ZK-verified reputation tiers for copy trading limits
 * @dev Agents prove their reputation score exceeds a threshold to unlock higher copy limits.
 *      Uses Groth16 proofs verified on-chain.
 */
contract ReputationLimits is ReentrancyGuard {

    struct Tier {
        uint256 threshold;     // Reputation score threshold (0-100)
        uint256 maxCopyLimit;  // Max total deposits agent can manage
        uint256 maxCopiers;    // Max number of copiers
    }

    struct AgentTier {
        uint8 tier;
        uint64 verifiedAt;
        bytes32 commitment;    // Poseidon(score, secret) for future proofs
    }

    // Groth16 verification key components
    uint256[2] public vkAlpha;
    uint256[2][2] public vkBeta;
    uint256[2][2] public vkGamma;
    uint256[2][2] public vkDelta;
    uint256[2][] public vkIC;

    // Tier configuration
    Tier[] public tiers;

    // Agent tier assignments
    mapping(address => AgentTier) public agentTiers;

    AgentRegistry public immutable agentRegistry;
    address public admin;
    bool public paused;

    // BN254 curve order
    uint256 constant P = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    event TierVerified(address indexed agent, uint8 tier, uint256 maxCopyLimit);
    event TierConfigured(uint8 indexed tier, uint256 threshold, uint256 maxCopyLimit, uint256 maxCopiers);
    event VKUpdated();
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event Paused(bool isPaused);

    error NotAdmin();
    error IsPaused();
    error InvalidProof();
    error NotRegistered();
    error InvalidTier();
    error AlreadyHigherTier();
    error BadInputs();
    error VKNotInitialized();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert IsPaused();
        _;
    }

    constructor(address _agentRegistry, address _admin) {
        agentRegistry = AgentRegistry(payable(_agentRegistry));
        admin = _admin;

        // Default tiers
        // Tier 0: Unverified (default) - 100 HYPE max, 5 copiers
        tiers.push(Tier({threshold: 0, maxCopyLimit: 100 ether, maxCopiers: 5}));
        // Tier 1: Bronze (25+ score) - 500 HYPE max, 20 copiers
        tiers.push(Tier({threshold: 25, maxCopyLimit: 500 ether, maxCopiers: 20}));
        // Tier 2: Silver (50+ score) - 2000 HYPE max, 50 copiers
        tiers.push(Tier({threshold: 50, maxCopyLimit: 2000 ether, maxCopiers: 50}));
        // Tier 3: Gold (75+ score) - 10000 HYPE max, 200 copiers
        tiers.push(Tier({threshold: 75, maxCopyLimit: 10000 ether, maxCopiers: 200}));
        // Tier 4: Platinum (90+ score) - Unlimited
        tiers.push(Tier({threshold: 90, maxCopyLimit: type(uint256).max, maxCopiers: type(uint256).max}));
    }

    /**
     * @notice Prove reputation to unlock higher tier
     * @param tier Target tier (1-4)
     * @param commitment Poseidon(score, secret) commitment
     * @param proofA Groth16 proof component A
     * @param proofB Groth16 proof component B
     * @param proofC Groth16 proof component C
     * @param pubInputs Public inputs [threshold, commitment]
     */
    function proveReputation(
        uint8 tier,
        bytes32 commitment,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC,
        uint256[] calldata pubInputs
    ) external whenNotPaused nonReentrant {
        if (!agentRegistry.isRegistered(msg.sender)) revert NotRegistered();
        if (tier == 0 || tier >= tiers.length) revert InvalidTier();
        if (agentTiers[msg.sender].tier >= tier) revert AlreadyHigherTier();

        // Verify proof
        if (!_verifyProof(proofA, proofB, proofC, pubInputs)) revert InvalidProof();

        // Verify public inputs match
        // pubInputs[0] = threshold, pubInputs[1] = commitment
        if (pubInputs.length != 2) revert BadInputs();
        if (pubInputs[0] != tiers[tier].threshold) revert BadInputs();
        if (bytes32(pubInputs[1]) != commitment) revert BadInputs();

        agentTiers[msg.sender] = AgentTier({
            tier: tier,
            verifiedAt: uint64(block.timestamp),
            commitment: commitment
        });

        emit TierVerified(msg.sender, tier, tiers[tier].maxCopyLimit);
    }

    /**
     * @notice Get agent's copy limit based on their verified tier
     * @param agent Agent address
     * @return maxCopyLimit Maximum total deposits the agent can accept
     * @return maxCopiers Maximum number of copiers allowed
     */
    function getCopyLimits(address agent) external view returns (uint256 maxCopyLimit, uint256 maxCopiers) {
        uint8 tier = agentTiers[agent].tier;
        return (tiers[tier].maxCopyLimit, tiers[tier].maxCopiers);
    }

    /**
     * @notice Check if agent can accept a new deposit
     * @param agent Agent address
     * @param currentAUM Current assets under management
     * @param currentCopiers Current number of copiers
     * @param newDeposit Amount of new deposit
     * @return allowed Whether the deposit is allowed
     * @return reason Reason if not allowed
     */
    function canAcceptDeposit(
        address agent,
        uint256 currentAUM,
        uint256 currentCopiers,
        uint256 newDeposit
    ) external view returns (bool allowed, string memory reason) {
        uint8 tier = agentTiers[agent].tier;
        Tier memory t = tiers[tier];

        if (currentAUM + newDeposit > t.maxCopyLimit) {
            return (false, "Exceeds copy limit for tier");
        }
        if (currentCopiers + 1 > t.maxCopiers) {
            return (false, "Exceeds copier limit for tier");
        }
        return (true, "");
    }

    /**
     * @notice Get tier info
     * @param tier Tier index
     * @return Tier struct
     */
    function getTier(uint8 tier) external view returns (Tier memory) {
        if (tier >= tiers.length) revert InvalidTier();
        return tiers[tier];
    }

    /**
     * @notice Get number of tiers
     * @return Number of tiers
     */
    function tierCount() external view returns (uint256) {
        return tiers.length;
    }

    /**
     * @notice Get agent's tier info
     * @param agent Agent address
     * @return tier Current tier
     * @return verifiedAt Timestamp of verification
     * @return tierInfo Tier configuration
     */
    function getAgentTierInfo(address agent) external view returns (
        uint8 tier,
        uint64 verifiedAt,
        Tier memory tierInfo
    ) {
        AgentTier memory at = agentTiers[agent];
        return (at.tier, at.verifiedAt, tiers[at.tier]);
    }

    // ============ Admin Functions ============

    /**
     * @notice Configure a tier
     * @param tier Tier index
     * @param threshold Reputation threshold
     * @param maxCopyLimit Max copy limit
     * @param maxCopiers Max copiers
     */
    function configureTier(
        uint8 tier,
        uint256 threshold,
        uint256 maxCopyLimit,
        uint256 maxCopiers
    ) external onlyAdmin {
        if (tier >= tiers.length) revert InvalidTier();
        tiers[tier] = Tier({
            threshold: threshold,
            maxCopyLimit: maxCopyLimit,
            maxCopiers: maxCopiers
        });
        emit TierConfigured(tier, threshold, maxCopyLimit, maxCopiers);
    }

    /**
     * @notice Set verification key for Groth16 proofs
     */
    function setVerificationKey(
        uint256[2] calldata _alpha,
        uint256[2][2] calldata _beta,
        uint256[2][2] calldata _gamma,
        uint256[2][2] calldata _delta,
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
        emit VKUpdated();
    }

    /**
     * @notice Set admin
     */
    function setAdmin(address _admin) external onlyAdmin {
        emit AdminUpdated(admin, _admin);
        admin = _admin;
    }

    /**
     * @notice Pause/unpause contract
     */
    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
        emit Paused(_paused);
    }

    // ============ Internal Functions ============

    function _verifyProof(
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC,
        uint256[] calldata pubInputs
    ) internal view returns (bool) {
        if (vkIC.length == 0) revert VKNotInitialized();
        if (pubInputs.length + 1 > vkIC.length) revert BadInputs();

        // Compute vk_x = vkIC[0] + sum(pubInputs[i] * vkIC[i+1])
        uint256[2] memory vkX = vkIC[0];
        for (uint256 i = 0; i < pubInputs.length; i++) {
            vkX = _pointAdd(vkX, _scalarMul(vkIC[i + 1], pubInputs[i]));
        }

        return _pairingCheck(proofA, proofB, vkAlpha, vkBeta, vkX, vkGamma, proofC, vkDelta);
    }

    function _pointAdd(uint256[2] memory p1, uint256[2] memory p2) internal view returns (uint256[2] memory r) {
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

    function _scalarMul(uint256[2] memory p, uint256 s) internal view returns (uint256[2] memory r) {
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

    function _pairingCheck(
        uint256[2] memory a1, uint256[2][2] memory b1,
        uint256[2] memory a2, uint256[2][2] memory b2,
        uint256[2] memory a3, uint256[2][2] memory b3,
        uint256[2] memory a4, uint256[2][2] memory b4
    ) internal view returns (bool) {
        uint256[24] memory input;

        // G2 points are already in EVM format [x_im, x_re, y_im, y_re]
        // from VK export and proof generation - no swap needed

        // -A, B (negate A for pairing equation)
        input[0] = a1[0];
        input[1] = (P - a1[1]) % P;
        input[2] = b1[0][0]; input[3] = b1[0][1];
        input[4] = b1[1][0]; input[5] = b1[1][1];

        // alpha, beta
        input[6] = a2[0]; input[7] = a2[1];
        input[8] = b2[0][0]; input[9] = b2[0][1];
        input[10] = b2[1][0]; input[11] = b2[1][1];

        // vk_x, gamma
        input[12] = a3[0]; input[13] = a3[1];
        input[14] = b3[0][0]; input[15] = b3[0][1];
        input[16] = b3[1][0]; input[17] = b3[1][1];

        // C, delta
        input[18] = a4[0]; input[19] = a4[1];
        input[20] = b4[0][0]; input[21] = b4[0][1];
        input[22] = b4[1][0]; input[23] = b4[1][1];

        uint256[1] memory out;
        assembly {
            if iszero(staticcall(gas(), 0x08, input, 0x300, out, 0x20)) {
                revert(0, 0)
            }
        }
        return out[0] == 1;
    }
}
