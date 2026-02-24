use anchor_lang::prelude::*;

/// Maximum allowed categories for tenant
pub const MAX_CATEGORIES: usize = 8;

/// Enterprise tenant account for PaaS
#[account]
#[derive(InitSpace)]
pub struct EnterpriseTenant {
    /// Tenant owner
    pub owner: Pubkey,

    /// Tenant name
    #[max_len(32)]
    pub name: String,

    /// API key hash (SHA256 of API key)
    pub api_key_hash: [u8; 32],

    /// Bump seed
    pub bump: u8,

    /// Is tenant active
    pub is_active: bool,

    /// Padding
    pub _padding: [u8; 2],

    // === Limits ===
    /// Maximum markets this tenant can create
    pub max_markets: u32,

    /// Maximum daily trading volume
    pub max_daily_volume: u64,

    /// Fee override (if set, overrides default)
    pub fee_override_bps: u16,

    /// Revenue share (tenant's cut of fees)
    pub revenue_share_bps: u16,

    /// Padding
    pub _padding2: [u8; 4],

    // === Statistics ===
    /// Markets created
    pub markets_created: u32,

    /// Total volume traded
    pub total_volume: u64,

    /// Total fees collected
    pub fees_collected: u64,

    /// Daily volume (resets daily)
    pub daily_volume: u64,

    /// Last day tracked
    pub last_day: u64,

    // === Timestamps ===
    /// Tenant created
    pub created_at: i64,

    /// Last activity
    pub last_activity_at: i64,

    // === Allowed categories ===
    /// Number of allowed categories (0 = all)
    pub allowed_categories_count: u8,

    /// Reserved
    pub _reserved: [u8; 31],

    /// Allowed market categories
    #[max_len(8, 16)]
    pub allowed_categories: Vec<String>,
}

impl EnterpriseTenant {
    pub const SEED_PREFIX: &'static [u8] = b"enterprise_tenant";

    /// Check if tenant can create more markets
    pub fn can_create_market(&self) -> bool {
        self.is_active && self.markets_created < self.max_markets
    }

    /// Check if category is allowed
    pub fn is_category_allowed(&self, category: &str) -> bool {
        if self.allowed_categories_count == 0 {
            return true;
        }
        self.allowed_categories.iter().any(|c| c == category)
    }

    /// Check if volume is within daily limit
    pub fn check_volume_limit(&self, additional: u64) -> bool {
        if self.max_daily_volume == 0 {
            return true;
        }
        self.daily_volume.saturating_add(additional) <= self.max_daily_volume
    }

    /// Reset daily volume if new day
    pub fn maybe_reset_daily(&mut self, current_time: i64) {
        let current_day = (current_time as u64) / 86400;
        if current_day != self.last_day {
            self.daily_volume = 0;
            self.last_day = current_day;
        }
    }

    /// Record volume
    pub fn record_volume(&mut self, volume: u64, current_time: i64) {
        self.maybe_reset_daily(current_time);
        self.daily_volume = self.daily_volume.saturating_add(volume);
        self.total_volume = self.total_volume.saturating_add(volume);
        self.last_activity_at = current_time;
    }

    /// Get effective fee (tenant override or default)
    pub fn effective_fee_bps(&self, default_fee_bps: u16) -> u16 {
        if self.fee_override_bps > 0 {
            self.fee_override_bps
        } else {
            default_fee_bps
        }
    }

    /// Calculate tenant's fee share
    pub fn calculate_fee_share(&self, total_fee: u64) -> u64 {
        (total_fee as u128 * self.revenue_share_bps as u128 / 10000) as u64
    }
}

/// API key record (for key rotation)
#[account]
#[derive(InitSpace)]
pub struct ApiKeyRecord {
    /// Tenant
    pub tenant: Pubkey,

    /// Key hash
    pub key_hash: [u8; 32],

    /// Is active
    pub is_active: bool,

    /// Created timestamp
    pub created_at: i64,

    /// Expires timestamp (0 = never)
    pub expires_at: i64,

    /// Last used
    pub last_used_at: i64,

    /// Bump seed
    pub bump: u8,

    /// Padding
    pub _padding: [u8; 6],
}

impl ApiKeyRecord {
    pub const SEED_PREFIX: &'static [u8] = b"api_key";

    pub fn is_valid(&self, current_time: i64) -> bool {
        self.is_active && (self.expires_at == 0 || current_time < self.expires_at)
    }
}

#[error_code]
pub enum EnterpriseError {
    #[msg("Tenant not active")]
    TenantNotActive,
    #[msg("Market limit exceeded")]
    MarketLimitExceeded,
    #[msg("Daily volume limit exceeded")]
    DailyVolumeLimitExceeded,
    #[msg("Category not allowed")]
    CategoryNotAllowed,
    #[msg("Invalid API key")]
    InvalidApiKey,
    #[msg("API key expired")]
    ApiKeyExpired,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_tenant() -> EnterpriseTenant {
        EnterpriseTenant {
            owner: Pubkey::new_unique(),
            name: "Test Tenant".to_string(),
            api_key_hash: [0; 32],
            bump: 0,
            is_active: true,
            _padding: [0; 2],
            max_markets: 10,
            max_daily_volume: 1_000_000,
            fee_override_bps: 0,
            revenue_share_bps: 5000, // 50%
            _padding2: [0; 4],
            markets_created: 5,
            total_volume: 500_000,
            fees_collected: 1000,
            daily_volume: 100_000,
            last_day: 19800,
            created_at: 0,
            last_activity_at: 0,
            allowed_categories_count: 0,
            _reserved: [0; 31],
            allowed_categories: vec![],
        }
    }

    #[test]
    fn test_can_create_market() {
        let mut tenant = create_tenant();
        assert!(tenant.can_create_market());

        tenant.markets_created = 10;
        assert!(!tenant.can_create_market());

        tenant.markets_created = 5;
        tenant.is_active = false;
        assert!(!tenant.can_create_market());
    }

    #[test]
    fn test_volume_limit() {
        let tenant = create_tenant();

        // Within limit
        assert!(tenant.check_volume_limit(500_000));

        // Over limit
        assert!(!tenant.check_volume_limit(1_000_000));
    }

    #[test]
    fn test_category_filter() {
        let mut tenant = create_tenant();

        // No filter = all allowed
        assert!(tenant.is_category_allowed("crypto"));
        assert!(tenant.is_category_allowed("sports"));

        // Add filter
        tenant.allowed_categories.push("crypto".to_string());
        tenant.allowed_categories_count = 1;

        assert!(tenant.is_category_allowed("crypto"));
        assert!(!tenant.is_category_allowed("sports"));
    }

    #[test]
    fn test_fee_share() {
        let tenant = create_tenant();

        // 50% of 1000 = 500
        assert_eq!(tenant.calculate_fee_share(1000), 500);
    }

    #[test]
    fn test_effective_fee() {
        let mut tenant = create_tenant();

        // No override = default
        assert_eq!(tenant.effective_fee_bps(30), 30);

        // With override
        tenant.fee_override_bps = 20;
        assert_eq!(tenant.effective_fee_bps(30), 20);
    }
}
