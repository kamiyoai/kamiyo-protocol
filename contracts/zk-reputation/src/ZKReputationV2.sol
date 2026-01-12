// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./Groth16Verifier.sol";

/**
 * @title ZKReputationV2
 * @notice ZK reputation verification with tier decay and batch ops
 */
contract ZKReputationV2 is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable
{
    Groth16Verifier public verifier;

    uint256 public constant TIER_BRONZE = 25;
    uint256 public constant TIER_SILVER = 50;
    uint256 public constant TIER_GOLD = 75;
    uint256 public constant TIER_PLATINUM = 90;

    uint256 public decayPeriod;

    enum Tier { Unverified, Bronze, Silver, Gold, Platinum }

    struct Agent {
        uint256 commitment;
        Tier verifiedTier;
        uint256 lastProofBlock;
        bool registered;
    }

    mapping(address => Agent) public agents;

    mapping(uint256 => bool) public commitmentUsed;

    event AgentRegistered(address indexed agent, uint256 commitment);
    event AgentUnregistered(address indexed agent);
    event CommitmentUpdated(address indexed agent, uint256 oldCommitment, uint256 newCommitment);
    event TierVerified(address indexed agent, Tier tier, uint256 threshold);
    event TierDecayed(address indexed agent, Tier oldTier, Tier newTier);
    event DecayPeriodUpdated(uint256 oldPeriod, uint256 newPeriod);
    event VerifierUpdated(address oldVerifier, address newVerifier);

    error AgentNotRegistered();
    error AgentAlreadyRegistered();
    error InvalidProof();
    error BatchLengthMismatch();
    error ZeroAddress();
    error CommitmentAlreadyUsed();
    error ZeroCommitment();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _verifier, address _owner) external initializer {
        if (_verifier == address(0) || _owner == address(0)) revert ZeroAddress();

        __Ownable_init(_owner);
        __Pausable_init();

        verifier = Groth16Verifier(_verifier);
        decayPeriod = 0; // Disabled by default
    }

    // ============ Agent Functions ============

    function register(uint256 commitment) external whenNotPaused {
        if (agents[msg.sender].registered) revert AgentAlreadyRegistered();
        if (commitment == 0) revert ZeroCommitment();
        if (commitmentUsed[commitment]) revert CommitmentAlreadyUsed();

        commitmentUsed[commitment] = true;
        agents[msg.sender] = Agent({
            commitment: commitment,
            verifiedTier: Tier.Unverified,
            lastProofBlock: 0,
            registered: true
        });

        emit AgentRegistered(msg.sender, commitment);
    }

    function unregister() external {
        Agent storage agent = agents[msg.sender];
        if (!agent.registered) revert AgentNotRegistered();

        commitmentUsed[agent.commitment] = false;
        delete agents[msg.sender];

        emit AgentUnregistered(msg.sender);
    }

    /// @dev Requires proof at current tier to authorize
    function updateCommitment(
        uint256 newCommitment,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC
    ) external whenNotPaused {
        Agent storage agent = agents[msg.sender];
        if (!agent.registered) revert AgentNotRegistered();
        if (newCommitment == 0) revert ZeroCommitment();
        if (commitmentUsed[newCommitment]) revert CommitmentAlreadyUsed();

        uint256 threshold = _tierToThreshold(agent.verifiedTier);
        uint256[2] memory pubSignals;
        pubSignals[0] = threshold;
        pubSignals[1] = agent.commitment;

        if (!verifier.verifyProof(pA, pB, pC, pubSignals)) revert InvalidProof();

        uint256 oldCommitment = agent.commitment;
        commitmentUsed[oldCommitment] = false;
        commitmentUsed[newCommitment] = true;
        agent.commitment = newCommitment;
        agent.lastProofBlock = block.number;

        emit CommitmentUpdated(msg.sender, oldCommitment, newCommitment);
    }

    function verifyTier(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256 threshold
    ) external whenNotPaused {
        Agent storage agent = agents[msg.sender];
        if (!agent.registered) revert AgentNotRegistered();

        uint256[2] memory pubSignals;
        pubSignals[0] = threshold;
        pubSignals[1] = agent.commitment;

        if (!verifier.verifyProof(pA, pB, pC, pubSignals)) revert InvalidProof();

        Tier newTier = _thresholdToTier(threshold);
        if (newTier > agent.verifiedTier) {
            agent.verifiedTier = newTier;
        }
        agent.lastProofBlock = block.number;

        emit TierVerified(msg.sender, newTier, threshold);
    }

    // ============ Batch Verification ============

    function batchVerify(
        address[] calldata agentAddrs,
        uint256[2][] calldata pAs,
        uint256[2][2][] calldata pBs,
        uint256[2][] calldata pCs,
        uint256[] calldata thresholds
    ) external whenNotPaused returns (bool[] memory results) {
        uint256 len = agentAddrs.length;
        if (pAs.length != len || pBs.length != len || pCs.length != len || thresholds.length != len) {
            revert BatchLengthMismatch();
        }

        results = new bool[](len);

        for (uint256 i = 0; i < len; i++) {
            results[i] = _verifySingle(agentAddrs[i], pAs[i], pBs[i], pCs[i], thresholds[i]);
        }
    }

    function _verifySingle(
        address agentAddr,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256 threshold
    ) internal returns (bool) {
        Agent storage agent = agents[agentAddr];
        if (!agent.registered) return false;

        uint256[2] memory pubSignals;
        pubSignals[0] = threshold;
        pubSignals[1] = agent.commitment;

        bool valid = verifier.verifyProof(pA, pB, pC, pubSignals);
        if (!valid) return false;

        Tier newTier = _thresholdToTier(threshold);
        if (newTier > agent.verifiedTier) {
            agent.verifiedTier = newTier;
        }
        agent.lastProofBlock = block.number;
        emit TierVerified(agentAddr, newTier, threshold);
        return true;
    }

    // ============ Tier Decay ============

    function applyDecay(address agentAddr) external {
        if (decayPeriod == 0) return;

        Agent storage agent = agents[agentAddr];
        if (!agent.registered || agent.verifiedTier == Tier.Unverified) return;

        uint256 blocksSinceProof = block.number - agent.lastProofBlock;
        if (blocksSinceProof < decayPeriod) return;

        // Calculate decay steps
        uint256 decaySteps = blocksSinceProof / decayPeriod;
        Tier oldTier = agent.verifiedTier;
        uint256 newTierValue = uint256(oldTier) > decaySteps ? uint256(oldTier) - decaySteps : 0;

        agent.verifiedTier = Tier(newTierValue);

        if (oldTier != agent.verifiedTier) {
            emit TierDecayed(agentAddr, oldTier, agent.verifiedTier);
        }
    }

    function refreshTier(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC
    ) external whenNotPaused {
        Agent storage agent = agents[msg.sender];
        if (!agent.registered) revert AgentNotRegistered();

        uint256 threshold = _tierToThreshold(agent.verifiedTier);

        uint256[2] memory pubSignals;
        pubSignals[0] = threshold;
        pubSignals[1] = agent.commitment;

        if (!verifier.verifyProof(pA, pB, pC, pubSignals)) revert InvalidProof();

        agent.lastProofBlock = block.number;
        emit TierVerified(msg.sender, agent.verifiedTier, threshold);
    }

    // ============ View Functions ============

    function getAgentTier(address agentAddr) external view returns (Tier) {
        return _getEffectiveTier(agentAddr);
    }

    function getAgentTierWithDecay(address agentAddr) external view returns (Tier, uint256 blocksUntilDecay) {
        Agent storage agent = agents[agentAddr];
        Tier effectiveTier = _getEffectiveTier(agentAddr);

        if (decayPeriod == 0 || effectiveTier == Tier.Unverified) {
            return (effectiveTier, type(uint256).max);
        }

        uint256 blocksSinceProof = block.number - agent.lastProofBlock;
        uint256 blocksInCurrentPeriod = blocksSinceProof % decayPeriod;
        blocksUntilDecay = decayPeriod - blocksInCurrentPeriod;

        return (effectiveTier, blocksUntilDecay);
    }

    function isRegistered(address agentAddr) external view returns (bool) {
        return agents[agentAddr].registered;
    }

    function getAgentCommitment(address agentAddr) external view returns (uint256) {
        return agents[agentAddr].commitment;
    }

    // ============ Admin Functions ============

    function setDecayPeriod(uint256 _decayPeriod) external onlyOwner {
        emit DecayPeriodUpdated(decayPeriod, _decayPeriod);
        decayPeriod = _decayPeriod;
    }

    function setVerifier(address _verifier) external onlyOwner {
        if (_verifier == address(0)) revert ZeroAddress();
        emit VerifierUpdated(address(verifier), _verifier);
        verifier = Groth16Verifier(_verifier);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Internal ============

    function _getEffectiveTier(address agentAddr) internal view returns (Tier) {
        Agent storage agent = agents[agentAddr];
        if (!agent.registered) return Tier.Unverified;
        if (decayPeriod == 0) return agent.verifiedTier;

        uint256 blocksSinceProof = block.number - agent.lastProofBlock;
        uint256 decaySteps = blocksSinceProof / decayPeriod;

        if (decaySteps == 0) return agent.verifiedTier;

        uint256 newTierValue = uint256(agent.verifiedTier) > decaySteps
            ? uint256(agent.verifiedTier) - decaySteps
            : 0;

        return Tier(newTierValue);
    }

    function _thresholdToTier(uint256 threshold) internal pure returns (Tier) {
        if (threshold >= TIER_PLATINUM) return Tier.Platinum;
        if (threshold >= TIER_GOLD) return Tier.Gold;
        if (threshold >= TIER_SILVER) return Tier.Silver;
        if (threshold >= TIER_BRONZE) return Tier.Bronze;
        return Tier.Unverified;
    }

    function _tierToThreshold(Tier tier) internal pure returns (uint256) {
        if (tier == Tier.Platinum) return TIER_PLATINUM;
        if (tier == Tier.Gold) return TIER_GOLD;
        if (tier == Tier.Silver) return TIER_SILVER;
        if (tier == Tier.Bronze) return TIER_BRONZE;
        return 0;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    uint256[48] private __gap;
}
