# TETSUO Integration Guide

Integrate ZK reputation verification into your protocol.

## Overview

TETSUO provides two integration paths:

1. **On-chain only**: Query verified tiers directly from the ZKReputation contract
2. **Full integration**: Generate proofs client-side and verify on-chain

Most protocols only need path 1.

## Path 1: Query On-Chain Tiers

If agents register with TETSUO separately, you can query their verified tier with a single `eth_call`.

### Contract Interface

```solidity
interface IZKReputation {
    enum Tier { Unverified, Bronze, Silver, Gold, Platinum }

    function getAgentTier(address agent) external view returns (Tier);
    function isRegistered(address agent) external view returns (bool);
    function getAgentCommitment(address agent) external view returns (uint256);
}
```

### Contract Addresses

| Network | Address |
|---------|---------|
| Sepolia | `0x0feb48737d7f47AF432a094E69e716c9E8fA8A22` |

### TypeScript Example

```typescript
import { ethers } from 'ethers';

const ZK_REPUTATION = '0x0feb48737d7f47AF432a094E69e716c9E8fA8A22';
const ABI = [
  'function getAgentTier(address) view returns (uint8)',
  'function isRegistered(address) view returns (bool)',
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(ZK_REPUTATION, ABI, provider);

async function checkAgent(agentAddress: string) {
  const registered = await contract.isRegistered(agentAddress);
  if (!registered) {
    return { tier: 0, name: 'Unregistered' };
  }

  const tier = await contract.getAgentTier(agentAddress);
  const names = ['Unverified', 'Bronze', 'Silver', 'Gold', 'Platinum'];
  return { tier, name: names[tier] };
}
```

### Solidity Example

```solidity
import "./IZKReputation.sol";

contract MyProtocol {
    IZKReputation public reputation;

    constructor(address _reputation) {
        reputation = IZKReputation(_reputation);
    }

    modifier onlyVerifiedAgent(address agent, IZKReputation.Tier minTier) {
        require(reputation.getAgentTier(agent) >= minTier, "Insufficient tier");
        _;
    }

    function executeAction(address agent)
        external
        onlyVerifiedAgent(agent, IZKReputation.Tier.Silver)
    {
        // Agent has Silver tier or higher
    }
}
```

## Path 2: Full Proof Integration

If you want agents to prove reputation directly to your protocol.

### Install SDK

```bash
npm install @kamiyo/tetsuo
```

### Generate Proof

```typescript
import { TetsuoProver } from '@kamiyo/tetsuo';

const prover = new TetsuoProver();

// Agent generates proof client-side
const proof = await prover.generateProof({
  score: 85,
  secret: agentSecret,  // From initial commitment
  threshold: 75,        // Prove score >= 75
});
```

### Verify On-Chain

Option A: Use existing ZKReputation contract

```solidity
function verifyAgentTier(
    address agent,
    uint256[2] calldata pA,
    uint256[2][2] calldata pB,
    uint256[2] calldata pC,
    uint256 threshold
) external view returns (bool);
```

Option B: Deploy your own verifier

```solidity
import "./Groth16Verifier.sol";

contract MyVerifier {
    Groth16Verifier public verifier;
    mapping(address => uint256) public commitments;

    function registerCommitment(uint256 commitment) external {
        commitments[msg.sender] = commitment;
    }

    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256 threshold
    ) external view returns (bool) {
        uint256[2] memory pubSignals;
        pubSignals[0] = threshold;
        pubSignals[1] = commitments[msg.sender];

        return verifier.verifyProof(pA, pB, pC, pubSignals);
    }
}
```

## Tier-Based Access Control

### Recommended Tier Requirements

| Action | Minimum Tier | Rationale |
|--------|--------------|-----------|
| Read-only access | None | Public data |
| Basic participation | Bronze (25) | Spam prevention |
| Standard operations | Silver (50) | Quality filter |
| High-value actions | Gold (75) | Trust requirement |
| Protocol governance | Platinum (90) | Maximum trust |

### Example: Tiered Limits

```typescript
const TIER_LIMITS = {
  0: { maxValue: 0, maxLeverage: 0 },      // Unverified
  1: { maxValue: 10_000, maxLeverage: 3 }, // Bronze
  2: { maxValue: 100_000, maxLeverage: 5 }, // Silver
  3: { maxValue: 500_000, maxLeverage: 10 }, // Gold
  4: { maxValue: 5_000_000, maxLeverage: 20 }, // Platinum
};

async function checkLimits(agent: string, value: number, leverage: number) {
  const tier = await contract.getAgentTier(agent);
  const limits = TIER_LIMITS[tier];

  if (value > limits.maxValue) {
    throw new Error(`Value ${value} exceeds tier limit ${limits.maxValue}`);
  }
  if (leverage > limits.maxLeverage) {
    throw new Error(`Leverage ${leverage}x exceeds tier limit ${limits.maxLeverage}x`);
  }
}
```

## Gas Costs

| Operation | Gas (approx) |
|-----------|--------------|
| `getAgentTier()` | ~2,500 |
| `isRegistered()` | ~2,400 |
| `register()` | ~47,000 |
| `verifyTier()` | ~280,000 |

Proof verification is expensive (~280k gas) due to pairing operations. Query-only integration is much cheaper.

## Events

```solidity
event AgentRegistered(address indexed agent, uint256 commitment);
event TierVerified(address indexed agent, Tier tier, uint256 threshold);
event ProofVerified(address indexed agent, uint256 threshold, uint256 commitment);
```

### Indexing Example

```typescript
const filter = contract.filters.TierVerified();
contract.on(filter, (agent, tier, threshold, event) => {
  console.log(`Agent ${agent} verified at tier ${tier}`);
});
```

## Testing

Use Sepolia testnet for integration testing. The contract is deployed and verified.

```bash
# Check an agent's tier
cast call 0x0feb48737d7f47AF432a094E69e716c9E8fA8A22 \
  "getAgentTier(address)(uint8)" \
  0xYourAgentAddress \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com
```

## Support

- GitHub: https://github.com/kamiyo-ai/kamiyo-protocol
- Contract source: Verified on Etherscan
