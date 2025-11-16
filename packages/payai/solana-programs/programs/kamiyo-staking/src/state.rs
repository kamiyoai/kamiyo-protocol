use anchor_lang::prelude::*;

/// Tier classification based on staked amount
/// Aligned with Phase 1 standardized tiers (Free/Pro/Team/Enterprise)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Tier {
    Free,       // 0 KAMIYO
    Pro,        // 1,000 - 9,999 KAMIYO
    Team,       // 10,000 - 99,999 KAMIYO
    Enterprise, // 100,000+ KAMIYO
}

/// Global staking pool account (PDA)
/// Manages pool configuration, APY rates, and total staked tracking
#[account]
pub struct StakePool {
    /// Pool admin authority (governance multisig in production)
    pub admin: Pubkey,

    /// KAMIYO token mint address (Token-2022)
    pub mint: Pubkey,

    /// Vault holding staked KAMIYO tokens
    pub stake_vault: Pubkey,

    /// Reward vault holding KAMIYO for distribution
    pub reward_vault: Pubkey,

    /// Total KAMIYO staked across all users (raw amount with 9 decimals)
    pub total_staked: u64,

    /// Total number of active stakers
    pub total_stakers: u64,

    /// APY rates in basis points (1000 = 10%)
    /// Free tier: 0% APY (no staking required)
    pub apy_free: u16,

    /// Pro tier: 10% APY (1,000-9,999 KAMIYO)
    pub apy_pro: u16,

    /// Team tier: 15% APY (10,000-99,999 KAMIYO)
    pub apy_team: u16,

    /// Enterprise tier: 25% APY (100,000+ KAMIYO)
    pub apy_enterprise: u16,

    /// Unstaking cooldown period in seconds (14 days = 1,209,600 seconds)
    pub cooldown_period: i64,

    /// Minimum stake amount (100 KAMIYO = 100 * 10^9)
    pub min_stake_amount: u64,

    /// Pool creation timestamp
    pub created_at: i64,

    /// Last time pool rewards were updated
    pub last_update_timestamp: i64,

    /// Accumulated reward per token stored (scaled by 1e18 for precision)
    /// Used for proportional reward distribution
    pub reward_per_token_stored: u128,

    /// Whether the pool is active (can be paused by admin)
    pub is_active: bool,

    /// PDA bump seed for pool account
    pub bump: u8,

    /// PDA bump seed for stake vault
    pub stake_vault_bump: u8,

    /// PDA bump seed for reward vault
    pub reward_vault_bump: u8,
}

impl StakePool {
    /// Size calculation for rent exemption
    /// 8 (discriminator) + all field sizes
    pub const LEN: usize = 8 + // discriminator
        32 + // admin
        32 + // mint
        32 + // stake_vault
        32 + // reward_vault
        8 +  // total_staked
        8 +  // total_stakers
        2 +  // apy_free
        2 +  // apy_pro
        2 +  // apy_team
        2 +  // apy_enterprise
        8 +  // cooldown_period
        8 +  // min_stake_amount
        8 +  // created_at
        8 +  // last_update_timestamp
        16 + // reward_per_token_stored (u128)
        1 +  // is_active
        1 +  // bump
        1 +  // stake_vault_bump
        1;   // reward_vault_bump

    /// Get APY for a specific tier in basis points
    pub fn get_apy_for_tier(&self, tier: Tier) -> u16 {
        match tier {
            Tier::Free => self.apy_free,
            Tier::Pro => self.apy_pro,
            Tier::Team => self.apy_team,
            Tier::Enterprise => self.apy_enterprise,
        }
    }
}

/// User stake account (PDA per user)
/// Tracks individual staking position and rewards
#[account]
pub struct UserStake {
    /// Owner of this stake position
    pub owner: Pubkey,

    /// Staking pool this stake belongs to
    pub pool: Pubkey,

    /// Amount of KAMIYO staked (raw amount with 9 decimals)
    pub staked_amount: u64,

    /// Total rewards earned (claimed + unclaimed)
    pub total_rewards_earned: u64,

    /// Rewards already claimed
    pub rewards_claimed: u64,

    /// Timestamp of initial stake
    pub stake_timestamp: i64,

    /// Timestamp of last reward claim
    pub last_claim_timestamp: i64,

    /// Current tier based on staked amount
    pub tier: Tier,

    /// Reward debt for calculation (scaled by 1e18)
    /// Used to track rewards already accounted for
    pub reward_debt: u128,

    /// Cooldown end timestamp (None if not unstaking)
    /// When set, user cannot stake more until withdrawn
    pub cooldown_end: Option<i64>,

    /// Amount pending withdrawal (during cooldown)
    pub cooldown_amount: u64,

    /// PDA bump seed
    pub bump: u8,
}

impl UserStake {
    /// Size calculation for rent exemption
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        32 + // pool
        8 +  // staked_amount
        8 +  // total_rewards_earned
        8 +  // rewards_claimed
        8 +  // stake_timestamp
        8 +  // last_claim_timestamp
        1 +  // tier (enum)
        16 + // reward_debt (u128)
        9 +  // cooldown_end (Option<i64>)
        8 +  // cooldown_amount
        1;   // bump

    /// Calculate unclaimed rewards
    pub fn unclaimed_rewards(&self) -> u64 {
        self.total_rewards_earned
            .saturating_sub(self.rewards_claimed)
    }

    /// Check if user is in cooldown period
    pub fn is_in_cooldown(&self) -> bool {
        self.cooldown_end.is_some()
    }

    /// Check if cooldown has completed
    pub fn cooldown_complete(&self, current_timestamp: i64) -> bool {
        if let Some(end) = self.cooldown_end {
            current_timestamp >= end
        } else {
            false
        }
    }
}

/// Calculate tier based on staked amount
/// Matches Phase 1 standardized tier structure
pub fn calculate_tier(staked_amount: u64) -> Tier {
    const DECIMALS_MULTIPLIER: u64 = 1_000_000_000; // 10^9

    if staked_amount >= 100_000 * DECIMALS_MULTIPLIER {
        Tier::Enterprise
    } else if staked_amount >= 10_000 * DECIMALS_MULTIPLIER {
        Tier::Team
    } else if staked_amount >= 1_000 * DECIMALS_MULTIPLIER {
        Tier::Pro
    } else {
        Tier::Free
    }
}

/// Calculate rewards earned for a user
/// Formula: (staked_amount * apy * time_elapsed) / (10000 * SECONDS_PER_YEAR)
pub fn calculate_rewards(
    staked_amount: u64,
    apy_basis_points: u16,
    time_elapsed_seconds: i64,
) -> u64 {
    if staked_amount == 0 || apy_basis_points == 0 || time_elapsed_seconds <= 0 {
        return 0;
    }

    const SECONDS_PER_YEAR: u128 = 31_536_000; // 365 days

    let apy_decimal = apy_basis_points as u128;
    let amount = staked_amount as u128;
    let time = time_elapsed_seconds as u128;

    // Calculate: (amount * apy * time) / (10000 * SECONDS_PER_YEAR)
    let numerator = amount
        .checked_mul(apy_decimal)
        .and_then(|x| x.checked_mul(time))
        .unwrap_or(0);

    let denominator = 10_000u128
        .checked_mul(SECONDS_PER_YEAR)
        .unwrap_or(u128::MAX);

    if denominator == 0 {
        return 0;
    }

    (numerator / denominator) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tier_calculation() {
        // Free tier
        assert_eq!(calculate_tier(0), Tier::Free);
        assert_eq!(calculate_tier(999 * 1_000_000_000), Tier::Free);

        // Pro tier
        assert_eq!(calculate_tier(1_000 * 1_000_000_000), Tier::Pro);
        assert_eq!(calculate_tier(5_000 * 1_000_000_000), Tier::Pro);
        assert_eq!(calculate_tier(9_999 * 1_000_000_000), Tier::Pro);

        // Team tier
        assert_eq!(calculate_tier(10_000 * 1_000_000_000), Tier::Team);
        assert_eq!(calculate_tier(50_000 * 1_000_000_000), Tier::Team);
        assert_eq!(calculate_tier(99_999 * 1_000_000_000), Tier::Team);

        // Enterprise tier
        assert_eq!(calculate_tier(100_000 * 1_000_000_000), Tier::Enterprise);
        assert_eq!(calculate_tier(1_000_000 * 1_000_000_000), Tier::Enterprise);
    }

    #[test]
    fn test_reward_calculation() {
        // 10,000 KAMIYO staked at 15% APY for 1 year
        let staked = 10_000 * 1_000_000_000;
        let apy = 1500; // 15% in basis points
        let time = 31_536_000; // 1 year

        let rewards = calculate_rewards(staked, apy, time);

        // Should be ~1,500 KAMIYO (15% of 10,000)
        let expected = 1_500 * 1_000_000_000;
        assert_eq!(rewards, expected);
    }

    #[test]
    fn test_reward_calculation_partial_year() {
        // 10,000 KAMIYO at 15% APY for 6 months
        let staked = 10_000 * 1_000_000_000;
        let apy = 1500;
        let time = 15_768_000; // 6 months

        let rewards = calculate_rewards(staked, apy, time);

        // Should be ~750 KAMIYO (7.5% of 10,000)
        let expected = 750 * 1_000_000_000;
        assert_eq!(rewards, expected);
    }

    #[test]
    fn test_zero_stake_zero_rewards() {
        assert_eq!(calculate_rewards(0, 1000, 31_536_000), 0);
    }

    #[test]
    fn test_zero_apy_zero_rewards() {
        assert_eq!(calculate_rewards(1000 * 1_000_000_000, 0, 31_536_000), 0);
    }
}
