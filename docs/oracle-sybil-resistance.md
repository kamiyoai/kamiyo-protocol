# Oracle Sybil Resistance Mechanisms

Technical documentation of the multi-oracle consensus system and its defenses against sybil attacks.

## Overview

The Kamiyo protocol uses a weighted multi-oracle consensus system for dispute resolution. Oracles stake collateral that can be slashed for misbehavior, creating economic disincentives against sybil attacks and collusion.

## Sybil Resistance Layers

### 1. Stake Requirements

Each oracle must stake a minimum of 1 SOL (`MIN_ORACLE_STAKE = 1,000,000,000 lamports`) to participate in the registry.

```rust
const MIN_ORACLE_STAKE: u64 = 1_000_000_000;  // 1 SOL
```

**Defense**: Creating multiple fake oracle identities requires proportional capital lockup.

### 2. Weighted Voting

Oracles are assigned weights by the registry admin based on reputation and track record. Higher-weight oracles have more influence on consensus.

```rust
pub struct OracleConfig {
    pub pubkey: Pubkey,
    pub oracle_type: OracleType,
    pub weight: u16,
    pub stake_amount: u64,
    pub violation_count: u8,
    pub total_rewards: u64,
}
```

**Defense**: A sybil attacker would need to accumulate reputation over time; new oracles start with minimal weight.

### 3. Consensus Mechanism

Dispute resolution requires minimum oracle consensus (`min_consensus >= 2`). The weighted consensus algorithm:

1. Collects quality scores from all participating oracles
2. Calculates the median score
3. Filters scores within the maximum deviation threshold
4. Computes weighted average of qualifying scores

```rust
fn calculate_weighted_consensus(
    scores: &[(u8, u16)],  // (score, weight) pairs
    max_deviation: u8,
) -> Result<u8>
```

**Defense**: Single compromised oracles cannot unilaterally determine outcomes.

### 4. Deviation-Based Slashing

Oracles voting outside the consensus deviation threshold lose 10% of their stake:

```rust
const ORACLE_SLASH_PERCENT: u8 = 10;
const MAX_ORACLE_SLASH_VIOLATIONS: u8 = 3;
```

When an oracle's score deviates beyond `max_score_deviation` from consensus:
- 10% of stake is slashed
- Violation count increments
- After 3 violations, oracle is automatically removed

**Defense**: Attempting to manipulate consensus results in stake loss.

### 5. Automatic Removal

Oracles with 3+ violations are automatically removed from the registry:

```rust
if oracle.violation_count >= MAX_ORACLE_SLASH_VIOLATIONS {
    oracles_to_remove.push(oracle.pubkey);
}
```

Removed oracles forfeit remaining stake to the treasury.

**Defense**: Persistent bad actors are economically destroyed and removed.

### 6. Oracle Types

Three oracle types provide different trust models:

```rust
pub enum OracleType {
    Ed25519,      // Cryptographic signature verification
    Switchboard,  // Decentralized oracle network
    Custom,       // Protocol-specific implementations
}
```

**Defense**: Diversification across oracle types prevents single points of failure.

## Economic Analysis

### Attack Costs

For a sybil attacker to control consensus:

| Oracles Needed | Minimum Stake | Weight Challenge |
|---------------|--------------|------------------|
| 2 | 2 SOL | Must accumulate reputation |
| 3 | 3 SOL | New oracles have low weight |
| 5 | 5 SOL | Admin controls weight assignment |

### Slashing Scenario

Oracle with 1 SOL stake attempting manipulation:
- First violation: 0.1 SOL slashed (0.9 SOL remaining)
- Second violation: 0.09 SOL slashed (0.81 SOL remaining)
- Third violation: 0.081 SOL slashed + removal + forfeit 0.729 SOL

**Total loss**: 1 SOL (100% of stake)

## Registry Administration

The oracle registry is controlled by an admin who:
- Adds/removes oracles
- Assigns weights based on reputation
- Sets consensus parameters (`min_consensus`, `max_score_deviation`)

This is currently centralized but can be upgraded to DAO governance.

## Consensus Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `min_consensus` | 2 | Minimum oracles for valid resolution |
| `max_score_deviation` | 50 | Maximum deviation from median (0-50) |
| `MIN_ORACLE_STAKE` | 1 SOL | Minimum collateral requirement |
| `ORACLE_SLASH_PERCENT` | 10% | Stake slashed per violation |
| `MAX_ORACLE_SLASH_VIOLATIONS` | 3 | Violations before removal |

## Event Emissions

The protocol emits events for transparency:

- `OracleAdded`: New oracle registered
- `OracleRemoved`: Oracle removed (admin or auto-removal)
- `OracleSlashed`: Stake slashed for consensus violation

## Known Limitations

1. **Admin centralization**: Weight assignment is admin-controlled
2. **Capital requirement**: 1 SOL per oracle may be low for high-value disputes
3. **Collusion risk**: Oracles could theoretically collude if rewards exceed slashing

## Recommendations

1. Scale stake requirements with dispute value
2. Implement time-weighted voting power decay
3. Add randomized oracle selection for dispute assignment
4. Consider quadratic voting mechanisms
