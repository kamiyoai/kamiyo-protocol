// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import "./Groth16Verifier.sol";

/**
 * @title ZKReputation
 * @notice On-chain ZK reputation verification for AI agents
 * @dev Agents register with Poseidon commitments and prove tier membership via Groth16
 */
contract ZKReputation {
    Groth16Verifier public immutable verifier;

    // Tier thresholds (matching the circuit)
    uint256 public constant TIER_BRONZE = 25;
    uint256 public constant TIER_SILVER = 50;
    uint256 public constant TIER_GOLD = 75;
    uint256 public constant TIER_PLATINUM = 90;

    enum Tier { Unverified, Bronze, Silver, Gold, Platinum }

    struct Agent {
        uint256 commitment;      // Poseidon(score, secret)
        Tier verifiedTier;       // Highest tier proven
        uint256 lastProofBlock;  // Block when last proof was verified
        bool registered;
    }

    mapping(address => Agent) public agents;

    event AgentRegistered(address indexed agent, uint256 commitment);
    event TierVerified(address indexed agent, Tier tier, uint256 threshold);
    event ProofVerified(address indexed agent, uint256 threshold, uint256 commitment);

    error AgentNotRegistered();
    error AgentAlreadyRegistered();
    error InvalidProof();
    error CommitmentMismatch();
    error InvalidThreshold();

    constructor(address _verifier) {
        verifier = Groth16Verifier(_verifier);
    }

    /**
     * @notice Register an agent with their reputation commitment
     * @param commitment Poseidon hash of (score, secret)
     */
    function register(uint256 commitment) external {
        if (agents[msg.sender].registered) revert AgentAlreadyRegistered();

        agents[msg.sender] = Agent({
            commitment: commitment,
            verifiedTier: Tier.Unverified,
            lastProofBlock: 0,
            registered: true
        });

        emit AgentRegistered(msg.sender, commitment);
    }

    /**
     * @notice Verify a ZK proof that agent's score >= threshold
     * @param pA Groth16 proof point A (G1)
     * @param pB Groth16 proof point B (G2)
     * @param pC Groth16 proof point C (G1)
     * @param threshold The minimum score being proven
     */
    function verifyTier(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256 threshold
    ) external {
        Agent storage agent = agents[msg.sender];
        if (!agent.registered) revert AgentNotRegistered();

        // Public inputs: [threshold, commitment]
        uint256[2] memory pubSignals;
        pubSignals[0] = threshold;
        pubSignals[1] = agent.commitment;

        // Verify the Groth16 proof
        bool valid = verifier.verifyProof(pA, pB, pC, pubSignals);
        if (!valid) revert InvalidProof();

        // Update tier based on threshold
        Tier newTier = _thresholdToTier(threshold);
        if (newTier > agent.verifiedTier) {
            agent.verifiedTier = newTier;
        }
        agent.lastProofBlock = block.number;

        emit TierVerified(msg.sender, newTier, threshold);
        emit ProofVerified(msg.sender, threshold, agent.commitment);
    }

    /**
     * @notice Verify a proof for a specific agent (third-party verification)
     * @param agent Address of the agent being verified
     * @param pA Groth16 proof point A (G1)
     * @param pB Groth16 proof point B (G2)
     * @param pC Groth16 proof point C (G1)
     * @param threshold The minimum score being proven
     */
    function verifyAgentTier(
        address agent,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256 threshold
    ) external view returns (bool) {
        Agent storage a = agents[agent];
        if (!a.registered) revert AgentNotRegistered();

        uint256[2] memory pubSignals;
        pubSignals[0] = threshold;
        pubSignals[1] = a.commitment;

        return verifier.verifyProof(pA, pB, pC, pubSignals);
    }

    /**
     * @notice Get an agent's verified tier
     */
    function getAgentTier(address agent) external view returns (Tier) {
        return agents[agent].verifiedTier;
    }

    /**
     * @notice Get an agent's commitment
     */
    function getAgentCommitment(address agent) external view returns (uint256) {
        return agents[agent].commitment;
    }

    /**
     * @notice Check if an agent is registered
     */
    function isRegistered(address agent) external view returns (bool) {
        return agents[agent].registered;
    }

    /**
     * @notice Convert threshold to tier
     */
    function _thresholdToTier(uint256 threshold) internal pure returns (Tier) {
        if (threshold >= TIER_PLATINUM) return Tier.Platinum;
        if (threshold >= TIER_GOLD) return Tier.Gold;
        if (threshold >= TIER_SILVER) return Tier.Silver;
        if (threshold >= TIER_BRONZE) return Tier.Bronze;
        return Tier.Unverified;
    }

    /**
     * @notice Get threshold for a tier
     */
    function tierToThreshold(Tier tier) external pure returns (uint256) {
        if (tier == Tier.Platinum) return TIER_PLATINUM;
        if (tier == Tier.Gold) return TIER_GOLD;
        if (tier == Tier.Silver) return TIER_SILVER;
        if (tier == Tier.Bronze) return TIER_BRONZE;
        return 0;
    }
}
