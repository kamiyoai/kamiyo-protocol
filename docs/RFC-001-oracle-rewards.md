# RFC-001: Oracle Reward Mechanism

## Status
Draft

## Summary
Add reward distribution for oracles who participate in dispute resolution. Currently oracles only have slashing (penalty for bad behavior) but no positive incentive.

## Motivation
- Incentivize oracle participation in dispute resolution
- Compensate oracles for computational and operational costs
- Align oracle incentives with accurate, timely dispute resolution
- Make oracle operation economically sustainable

## Specification

### Reward Source
1% of escrow amount is reserved as oracle reward pool when dispute is finalized.

### Distribution
Rewards are split among oracles who:
1. Submitted scores within the consensus window
2. Voted with the majority consensus (within max_deviation)

### Formula
```
per_oracle_reward = (escrow_amount * 0.01) / num_consensus_oracles
```

### Implementation

#### On-Chain Changes (Program Upgrade)

```rust
// In finalize_multi_oracle_dispute:

// Calculate oracle reward (1% of escrow)
let total_reward = escrow.amount
    .checked_mul(ORACLE_REWARD_PERCENT as u64)
    .unwrap()
    .checked_div(100)
    .unwrap();

// Count consensus oracles
let consensus_count = escrow.oracle_scores
    .iter()
    .filter(|s| s.oracle != Pubkey::default())
    .filter(|s| (s.score as i16 - consensus_score as i16).abs() <= max_deviation as i16)
    .count() as u64;

// Distribute rewards
let per_oracle = total_reward.checked_div(consensus_count).unwrap();

for score in escrow.oracle_scores.iter() {
    if score.oracle != Pubkey::default() {
        let deviation = (score.score as i16 - consensus_score as i16).abs();
        if deviation <= max_deviation as i16 {
            // Transfer reward to oracle
            **escrow.to_account_info().try_borrow_mut_lamports()? -= per_oracle;
            **oracle_wallet.try_borrow_mut_lamports()? += per_oracle;
        }
    }
}
```

#### Account Changes

Add oracle wallet accounts to `FinalizeMultiOracleDispute`:

```rust
#[derive(Accounts)]
pub struct FinalizeMultiOracleDispute<'info> {
    // ... existing accounts ...

    /// Oracle wallets for reward distribution
    /// Must match oracles in escrow.oracle_scores
    #[account(mut)]
    pub oracle_1: Option<AccountInfo<'info>>,
    #[account(mut)]
    pub oracle_2: Option<AccountInfo<'info>>,
    #[account(mut)]
    pub oracle_3: Option<AccountInfo<'info>>,
}
```

### Migration Path

1. Deploy upgraded program with reward logic
2. New disputes use reward mechanism
3. Existing disputes finalize without rewards (backwards compatible)

### Economic Analysis

| Escrow Amount | Total Reward (1%) | Per Oracle (2 oracles) |
|--------------|-------------------|------------------------|
| 0.1 SOL | 0.001 SOL | 0.0005 SOL |
| 1 SOL | 0.01 SOL | 0.005 SOL |
| 10 SOL | 0.1 SOL | 0.05 SOL |
| 100 SOL | 1 SOL | 0.5 SOL |

### Timeline

- Week 1: Implement and test on localnet
- Week 2: Deploy to devnet, integration tests
- Week 3: Security review
- Week 4: Mainnet upgrade

## Alternatives Considered

1. **Fixed fee per dispute** - Rejected: doesn't scale with escrow value
2. **Separate reward pool** - Rejected: adds complexity, requires additional funding
3. **2% reward** - Considered: may be implemented later based on oracle economics

## Security Considerations

- Reward distribution must not be gameable
- Oracle collusion for reward farming prevented by stake slashing
- Rewards only for consensus votes prevents majority attacks
