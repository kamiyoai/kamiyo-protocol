use anchor_lang::prelude::*;

/// Performance tier thresholds (PnL in basis points)
pub const TIER_BRONZE: i64 = 0;
pub const TIER_SILVER: i64 = 500; // 5%+
pub const TIER_GOLD: i64 = 1500; // 15%+
pub const TIER_PLATINUM: i64 = 3000; // 30%+
pub const TIER_DIAMOND: i64 = 5000; // 50%+

/// Performance tier
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum PerformanceTier {
    #[default]
    Unranked = 0,
    Bronze = 1,
    Silver = 2,
    Gold = 3,
    Platinum = 4,
    Diamond = 5,
}

impl PerformanceTier {
    pub fn from_pnl_bps(pnl_bps: i64) -> Self {
        if pnl_bps >= TIER_DIAMOND {
            PerformanceTier::Diamond
        } else if pnl_bps >= TIER_PLATINUM {
            PerformanceTier::Platinum
        } else if pnl_bps >= TIER_GOLD {
            PerformanceTier::Gold
        } else if pnl_bps >= TIER_SILVER {
            PerformanceTier::Silver
        } else if pnl_bps >= TIER_BRONZE {
            PerformanceTier::Bronze
        } else {
            PerformanceTier::Unranked
        }
    }
}

/// Trader profile for social features
#[account]
#[derive(InitSpace)]
pub struct TraderProfile {
    /// Profile owner
    pub owner: Pubkey,

    /// Display name (max 32 bytes)
    #[max_len(32)]
    pub display_name: String,

    /// Bio (max 128 bytes)
    #[max_len(128)]
    pub bio: String,

    /// Bump seed
    pub bump: u8,

    /// Is profile public
    pub is_public: bool,

    /// Allow copy trading
    pub allow_copy_trading: bool,

    /// Padding
    pub _padding: [u8; 1],

    // === Performance metrics (public) ===
    /// Performance tier
    pub tier: u8,

    /// Total realized PnL (scaled by 10^6)
    pub total_pnl: i64,

    /// Total volume traded
    pub total_volume: u64,

    /// Number of trades
    pub trades_count: u64,

    /// Winning trades
    pub win_count: u64,

    /// Best single trade PnL
    pub best_trade: i64,

    /// Worst single trade PnL
    pub worst_trade: i64,

    /// Maximum drawdown (basis points)
    pub max_drawdown_bps: u16,

    /// Padding
    pub _padding2: [u8; 6],

    // === Social stats ===
    /// Number of followers
    pub follower_count: u32,

    /// Number of copy traders
    pub copy_trader_count: u32,

    /// Total AUM of copy vaults following this trader
    pub copy_aum: u64,

    // === Timestamps ===
    /// Profile created
    pub created_at: i64,

    /// Last trade timestamp
    pub last_trade_at: i64,

    /// Last profile update
    pub updated_at: i64,

    /// Reserved
    pub _reserved: [u8; 32],
}

impl TraderProfile {
    pub const SEED_PREFIX: &'static [u8] = b"trader_profile";

    pub fn get_tier(&self) -> PerformanceTier {
        match self.tier {
            1 => PerformanceTier::Bronze,
            2 => PerformanceTier::Silver,
            3 => PerformanceTier::Gold,
            4 => PerformanceTier::Platinum,
            5 => PerformanceTier::Diamond,
            _ => PerformanceTier::Unranked,
        }
    }

    /// Calculate win rate (scaled by 10000)
    pub fn win_rate_bps(&self) -> u16 {
        if self.trades_count == 0 {
            return 0;
        }
        ((self.win_count * 10000) / self.trades_count) as u16
    }

    /// Calculate average PnL per trade
    pub fn avg_pnl(&self) -> i64 {
        if self.trades_count == 0 {
            return 0;
        }
        self.total_pnl / (self.trades_count as i64)
    }

    /// Calculate PnL in basis points (relative to volume)
    pub fn pnl_bps(&self) -> i64 {
        if self.total_volume == 0 {
            return 0;
        }
        (self.total_pnl * 10000) / (self.total_volume as i64)
    }

    /// Update tier based on current performance
    pub fn update_tier(&mut self) {
        let pnl_bps = self.pnl_bps();
        self.tier = PerformanceTier::from_pnl_bps(pnl_bps) as u8;
    }

    /// Record a trade result
    pub fn record_trade(&mut self, pnl: i64, volume: u64, timestamp: i64) {
        self.total_pnl = self.total_pnl.saturating_add(pnl);
        self.total_volume = self.total_volume.saturating_add(volume);
        self.trades_count = self.trades_count.saturating_add(1);

        if pnl > 0 {
            self.win_count = self.win_count.saturating_add(1);
            if pnl > self.best_trade {
                self.best_trade = pnl;
            }
        } else if pnl < self.worst_trade {
            self.worst_trade = pnl;
        }

        self.last_trade_at = timestamp;
        self.update_tier();
    }
}

/// Copy trading vault
#[account]
#[derive(InitSpace)]
pub struct CopyTradingVault {
    /// Vault authority (PDA)
    pub authority: Pubkey,

    /// Leader being copied
    pub leader: Pubkey,

    /// Collateral mint
    pub collateral_mint: Pubkey,

    /// Vault token account
    pub vault: Pubkey,

    /// Share mint for vault tokens
    pub share_mint: Pubkey,

    /// Bump seed
    pub bump: u8,

    /// Is vault active
    pub is_active: bool,

    /// Padding
    pub _padding: [u8; 2],

    // === Configuration ===
    /// Management fee (basis points, charged annually)
    pub management_fee_bps: u16,

    /// Performance fee (basis points, charged on profits)
    pub performance_fee_bps: u16,

    /// Minimum deposit
    pub min_deposit: u64,

    /// Maximum total deposits
    pub max_deposits: u64,

    // === State ===
    /// Total deposits
    pub total_deposits: u64,

    /// Total shares outstanding
    pub total_shares: u64,

    /// High water mark for performance fee
    pub high_water_mark: u64,

    /// Total fees collected
    pub fees_collected: u64,

    // === Stats ===
    /// Number of depositors
    pub depositor_count: u32,

    /// Total PnL generated
    pub total_pnl: i64,

    /// Padding
    pub _padding2: [u8; 4],

    // === Timestamps ===
    /// Vault created
    pub created_at: i64,

    /// Last deposit/withdraw
    pub last_action_at: i64,

    /// Last fee collection
    pub last_fee_at: i64,

    /// Reserved
    pub _reserved: [u8; 32],
}

impl CopyTradingVault {
    pub const SEED_PREFIX: &'static [u8] = b"copy_vault";

    /// Calculate share price (scaled by 10^6)
    pub fn share_price(&self) -> u64 {
        if self.total_shares == 0 {
            return 1_000_000; // 1:1 initially
        }
        (self.total_deposits as u128 * 1_000_000 / self.total_shares as u128) as u64
    }

    /// Calculate shares for a deposit
    pub fn shares_for_deposit(&self, amount: u64) -> u64 {
        if self.total_shares == 0 {
            return amount;
        }
        (amount as u128 * self.total_shares as u128 / self.total_deposits as u128) as u64
    }

    /// Calculate withdrawal amount for shares
    pub fn amount_for_shares(&self, shares: u64) -> u64 {
        if self.total_shares == 0 {
            return 0;
        }
        (shares as u128 * self.total_deposits as u128 / self.total_shares as u128) as u64
    }

    /// Calculate pending management fee
    pub fn pending_management_fee(&self, current_time: i64) -> u64 {
        let seconds_elapsed = (current_time - self.last_fee_at).max(0) as u64;
        let annual_fee = self
            .total_deposits
            .checked_mul(self.management_fee_bps as u64)
            .and_then(|v| v.checked_div(10000))
            .unwrap_or(0);

        // Pro-rate for elapsed time
        annual_fee
            .checked_mul(seconds_elapsed)
            .and_then(|v| v.checked_div(365 * 24 * 60 * 60))
            .unwrap_or(0)
    }

    /// Calculate pending performance fee
    pub fn pending_performance_fee(&self) -> u64 {
        if self.total_deposits <= self.high_water_mark {
            return 0;
        }

        let profit = self.total_deposits - self.high_water_mark;
        profit
            .checked_mul(self.performance_fee_bps as u64)
            .and_then(|v| v.checked_div(10000))
            .unwrap_or(0)
    }
}

/// Copy vault depositor receipt
#[account]
#[derive(InitSpace)]
pub struct CopyVaultDeposit {
    /// Depositor
    pub depositor: Pubkey,

    /// Vault
    pub vault: Pubkey,

    /// Shares owned
    pub shares: u64,

    /// Original deposit amount
    pub deposited_amount: u64,

    /// Deposit timestamp
    pub deposited_at: i64,

    /// Bump seed
    pub bump: u8,

    /// Padding
    pub _padding: [u8; 7],
}

impl CopyVaultDeposit {
    pub const SEED_PREFIX: &'static [u8] = b"copy_deposit";
}

/// Follow relationship
#[account]
#[derive(InitSpace)]
pub struct FollowRelation {
    /// Follower
    pub follower: Pubkey,

    /// Leader
    pub leader: Pubkey,

    /// Follow timestamp
    pub followed_at: i64,

    /// Bump seed
    pub bump: u8,

    /// Padding
    pub _padding: [u8; 7],
}

impl FollowRelation {
    pub const SEED_PREFIX: &'static [u8] = b"follow";
}

#[error_code]
pub enum SocialError {
    #[msg("Profile not public")]
    ProfileNotPublic,
    #[msg("Copy trading not allowed")]
    CopyTradingNotAllowed,
    #[msg("Vault is not active")]
    VaultNotActive,
    #[msg("Deposit below minimum")]
    DepositBelowMinimum,
    #[msg("Vault capacity exceeded")]
    VaultCapacityExceeded,
    #[msg("Insufficient shares")]
    InsufficientShares,
    #[msg("Already following")]
    AlreadyFollowing,
    #[msg("Not following")]
    NotFollowing,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tier_from_pnl() {
        assert_eq!(
            PerformanceTier::from_pnl_bps(-100),
            PerformanceTier::Unranked
        );
        assert_eq!(PerformanceTier::from_pnl_bps(0), PerformanceTier::Bronze);
        assert_eq!(PerformanceTier::from_pnl_bps(500), PerformanceTier::Silver);
        assert_eq!(PerformanceTier::from_pnl_bps(1500), PerformanceTier::Gold);
        assert_eq!(
            PerformanceTier::from_pnl_bps(3000),
            PerformanceTier::Platinum
        );
        assert_eq!(
            PerformanceTier::from_pnl_bps(5000),
            PerformanceTier::Diamond
        );
    }

    #[test]
    fn test_share_calculations() {
        let vault = CopyTradingVault {
            authority: Pubkey::new_unique(),
            leader: Pubkey::new_unique(),
            collateral_mint: Pubkey::new_unique(),
            vault: Pubkey::new_unique(),
            share_mint: Pubkey::new_unique(),
            bump: 0,
            is_active: true,
            _padding: [0; 2],
            management_fee_bps: 200,   // 2%
            performance_fee_bps: 2000, // 20%
            min_deposit: 100,
            max_deposits: 1_000_000,
            total_deposits: 10000,
            total_shares: 10000,
            high_water_mark: 10000,
            fees_collected: 0,
            depositor_count: 5,
            total_pnl: 0,
            _padding2: [0; 4],
            created_at: 0,
            last_action_at: 0,
            last_fee_at: 0,
            _reserved: [0; 32],
        };

        // 1:1 share price
        assert_eq!(vault.share_price(), 1_000_000);

        // Deposit 1000 gets 1000 shares
        assert_eq!(vault.shares_for_deposit(1000), 1000);

        // 1000 shares worth 1000
        assert_eq!(vault.amount_for_shares(1000), 1000);
    }

    #[test]
    fn test_win_rate() {
        let mut profile = TraderProfile {
            owner: Pubkey::new_unique(),
            display_name: "Test".to_string(),
            bio: "".to_string(),
            bump: 0,
            is_public: true,
            allow_copy_trading: true,
            _padding: [0; 1],
            tier: 0,
            total_pnl: 0,
            total_volume: 0,
            trades_count: 0,
            win_count: 0,
            best_trade: 0,
            worst_trade: 0,
            max_drawdown_bps: 0,
            _padding2: [0; 6],
            follower_count: 0,
            copy_trader_count: 0,
            copy_aum: 0,
            created_at: 0,
            last_trade_at: 0,
            updated_at: 0,
            _reserved: [0; 32],
        };

        profile.record_trade(100, 1000, 1000);
        profile.record_trade(50, 500, 2000);
        profile.record_trade(-30, 300, 3000);

        assert_eq!(profile.trades_count, 3);
        assert_eq!(profile.win_count, 2);
        assert_eq!(profile.win_rate_bps(), 6666); // ~66.66%
        assert_eq!(profile.total_pnl, 120);
        assert_eq!(profile.best_trade, 100);
        assert_eq!(profile.worst_trade, -30);
    }
}
