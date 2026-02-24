use anchor_lang::prelude::*;

/// Maximum markets an agent can whitelist
pub const MAX_ALLOWED_MARKETS: usize = 16;

/// Position sizing strategy
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq)]
#[repr(u8)]
pub enum PositionSizing {
    /// Fixed size per trade
    #[default]
    Fixed = 0,
    /// Kelly criterion fraction (scaled by 10000)
    Kelly = 1,
    /// Proportional to bankroll (risk_bps per trade)
    Proportional = 2,
}

/// Risk parameters for the agent
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
#[repr(C)]
pub struct RiskParams {
    /// Maximum drawdown before stopping (basis points)
    pub max_drawdown_bps: u16,

    /// Maximum daily loss in collateral units
    pub max_daily_loss: u64,

    /// Minimum probability edge to trade (basis points)
    pub min_edge_bps: u16,

    /// Position sizing strategy
    pub position_sizing: u8,

    /// Position sizing parameter (meaning depends on strategy)
    /// - Fixed: absolute size
    /// - Kelly: fraction * 10000
    /// - Proportional: risk_bps per trade
    pub sizing_param: u64,

    /// Padding
    pub _padding: [u8; 5],
}

impl anchor_lang::Space for RiskParams {
    const INIT_SPACE: usize = 2 + 8 + 2 + 1 + 8 + 5; // 26 bytes
}

impl RiskParams {
    pub const SIZE: usize = 2 + 8 + 2 + 1 + 8 + 5;

    pub fn get_sizing_strategy(&self) -> PositionSizing {
        match self.position_sizing {
            0 => PositionSizing::Fixed,
            1 => PositionSizing::Kelly,
            2 => PositionSizing::Proportional,
            _ => PositionSizing::Fixed,
        }
    }

    /// Calculate position size based on strategy
    pub fn calculate_size(&self, bankroll: u64, edge_bps: u16, win_prob_bps: u16) -> u64 {
        match self.get_sizing_strategy() {
            PositionSizing::Fixed => self.sizing_param,
            PositionSizing::Kelly => {
                // Kelly fraction = (p*b - q) / b where b = odds, p = win prob, q = 1-p
                // Simplified: fraction * edge / 10000
                let fraction = self.sizing_param;
                let edge = edge_bps as u64;
                bankroll
                    .checked_mul(fraction)
                    .and_then(|v| v.checked_mul(edge))
                    .and_then(|v| v.checked_div(10000 * 10000))
                    .unwrap_or(0)
            }
            PositionSizing::Proportional => {
                // Risk a fixed percentage of bankroll
                let risk_bps = self.sizing_param;
                bankroll
                    .checked_mul(risk_bps)
                    .and_then(|v| v.checked_div(10000))
                    .unwrap_or(0)
            }
        }
    }
}

/// Agent status
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq)]
#[repr(u8)]
pub enum AgentStatus {
    /// Agent is active and can trade
    #[default]
    Active = 0,
    /// Agent is paused (manual or risk limit)
    Paused = 1,
    /// Agent is stopped permanently
    Stopped = 2,
}

/// Trading agent account
#[account]
#[derive(InitSpace)]
pub struct TradingAgent {
    /// Owner of the agent (can withdraw, update params)
    pub owner: Pubkey,

    /// Delegate authorized to execute trades
    pub delegate: Pubkey,

    /// Agent name (max 32 bytes)
    #[max_len(32)]
    pub name: String,

    /// Bump seed
    pub bump: u8,

    /// Agent status
    pub status: u8,

    /// Version
    pub version: u8,

    /// Padding
    pub _padding: [u8; 1],

    // === Constraints ===
    /// Maximum position size per market
    pub max_position_size: u64,

    /// Maximum total exposure across all markets
    pub max_total_exposure: u64,

    /// Risk parameters
    pub risk_params: RiskParams,

    // === Balances ===
    /// Total collateral deposited
    pub total_deposited: u64,

    /// Current available balance
    pub available_balance: u64,

    /// Total locked in positions
    pub locked_balance: u64,

    // === Performance ===
    /// Total realized PnL (can be negative, stored as i64)
    pub total_pnl: i64,

    /// High water mark for drawdown calculation
    pub high_water_mark: u64,

    /// Current drawdown from high water mark
    pub current_drawdown: u64,

    /// Daily loss tracking (reset daily)
    pub daily_loss: u64,

    /// Last day tracked (unix timestamp / 86400)
    pub last_day: u64,

    // === Statistics ===
    /// Number of active positions
    pub active_positions: u16,

    /// Total trades executed
    pub trades_count: u64,

    /// Winning trades
    pub win_count: u64,

    /// Total volume traded
    pub volume_traded: u64,

    // === Timestamps ===
    /// Creation timestamp
    pub created_at: i64,

    /// Last trade timestamp
    pub last_trade_at: i64,

    // === Market whitelist ===
    /// Number of whitelisted markets (0 = all allowed)
    pub allowed_markets_count: u8,

    /// Reserved
    pub _reserved: [u8; 7],

    /// Whitelisted markets (if count > 0)
    #[max_len(16)]
    pub allowed_markets: Vec<Pubkey>,
}

impl TradingAgent {
    pub const SEED_PREFIX: &'static [u8] = b"trading_agent";

    pub fn get_status(&self) -> AgentStatus {
        match self.status {
            0 => AgentStatus::Active,
            1 => AgentStatus::Paused,
            2 => AgentStatus::Stopped,
            _ => AgentStatus::Stopped,
        }
    }

    pub fn is_active(&self) -> bool {
        self.status == AgentStatus::Active as u8
    }

    /// Check if market is allowed for this agent
    pub fn is_market_allowed(&self, market: &Pubkey) -> bool {
        if self.allowed_markets_count == 0 {
            return true; // All markets allowed
        }
        self.allowed_markets.iter().any(|m| m == market)
    }

    /// Check if trade passes risk checks
    pub fn check_risk(&self, size: u64, current_price: u64) -> Result<()> {
        // Check position size limit
        require!(
            size <= self.max_position_size,
            AgentError::PositionSizeExceeded
        );

        // Check total exposure
        let new_exposure = self.locked_balance.saturating_add(size);
        require!(
            new_exposure <= self.max_total_exposure,
            AgentError::ExposureLimitExceeded
        );

        // Check drawdown limit
        let max_dd_bps = self.risk_params.max_drawdown_bps;
        if max_dd_bps > 0 && self.high_water_mark > 0 {
            let dd_bps = self
                .current_drawdown
                .saturating_mul(10000)
                .checked_div(self.high_water_mark)
                .unwrap_or(0);
            require!(
                dd_bps as u16 <= max_dd_bps,
                AgentError::DrawdownLimitExceeded
            );
        }

        // Check daily loss limit
        let max_daily = self.risk_params.max_daily_loss;
        if max_daily > 0 {
            require!(
                self.daily_loss < max_daily,
                AgentError::DailyLossLimitExceeded
            );
        }

        Ok(())
    }

    /// Update performance metrics after a trade
    pub fn record_trade(&mut self, pnl: i64, volume: u64, timestamp: i64) {
        self.trades_count = self.trades_count.saturating_add(1);
        self.volume_traded = self.volume_traded.saturating_add(volume);
        self.last_trade_at = timestamp;

        // Update PnL
        self.total_pnl = self.total_pnl.saturating_add(pnl);

        if pnl > 0 {
            self.win_count = self.win_count.saturating_add(1);
            // Update high water mark
            let current_value = self.total_deposited.saturating_add(pnl as u64);
            if current_value > self.high_water_mark {
                self.high_water_mark = current_value;
                self.current_drawdown = 0;
            }
        } else {
            // Update drawdown and daily loss
            let loss = (-pnl) as u64;
            self.current_drawdown = self.current_drawdown.saturating_add(loss);

            // Track daily loss
            let current_day = (timestamp as u64) / 86400;
            if current_day != self.last_day {
                self.daily_loss = 0;
                self.last_day = current_day;
            }
            self.daily_loss = self.daily_loss.saturating_add(loss);

            // Auto-pause if limits exceeded
            if self.risk_params.max_daily_loss > 0
                && self.daily_loss >= self.risk_params.max_daily_loss
            {
                self.status = AgentStatus::Paused as u8;
            }
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
    pub fn avg_pnl_per_trade(&self) -> i64 {
        if self.trades_count == 0 {
            return 0;
        }
        self.total_pnl / (self.trades_count as i64)
    }
}

#[error_code]
pub enum AgentError {
    #[msg("Agent is not active")]
    AgentNotActive,
    #[msg("Position size exceeds limit")]
    PositionSizeExceeded,
    #[msg("Total exposure limit exceeded")]
    ExposureLimitExceeded,
    #[msg("Drawdown limit exceeded")]
    DrawdownLimitExceeded,
    #[msg("Daily loss limit exceeded")]
    DailyLossLimitExceeded,
    #[msg("Market not allowed for this agent")]
    MarketNotAllowed,
    #[msg("Unauthorized delegate")]
    UnauthorizedDelegate,
    #[msg("Insufficient balance")]
    InsufficientBalance,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_agent() -> TradingAgent {
        TradingAgent {
            owner: Pubkey::new_unique(),
            delegate: Pubkey::new_unique(),
            name: "Test Agent".to_string(),
            bump: 0,
            status: AgentStatus::Active as u8,
            version: 1,
            _padding: [0; 1],
            max_position_size: 10000,
            max_total_exposure: 100000,
            risk_params: RiskParams {
                max_drawdown_bps: 2000, // 20%
                max_daily_loss: 5000,
                min_edge_bps: 100,
                position_sizing: PositionSizing::Proportional as u8,
                sizing_param: 100, // 1% per trade
                _padding: [0; 5],
            },
            total_deposited: 100000,
            available_balance: 100000,
            locked_balance: 0,
            total_pnl: 0,
            high_water_mark: 100000,
            current_drawdown: 0,
            daily_loss: 0,
            last_day: 0,
            active_positions: 0,
            trades_count: 0,
            win_count: 0,
            volume_traded: 0,
            created_at: 0,
            last_trade_at: 0,
            allowed_markets_count: 0,
            _reserved: [0; 7],
            allowed_markets: vec![],
        }
    }

    #[test]
    fn test_risk_check_passes() {
        let agent = create_agent();
        assert!(agent.check_risk(5000, 5000).is_ok());
    }

    #[test]
    fn test_risk_check_position_size() {
        let agent = create_agent();
        assert!(agent.check_risk(20000, 5000).is_err());
    }

    #[test]
    fn test_position_sizing_fixed() {
        let params = RiskParams {
            position_sizing: PositionSizing::Fixed as u8,
            sizing_param: 1000,
            ..Default::default()
        };
        assert_eq!(params.calculate_size(100000, 500, 6000), 1000);
    }

    #[test]
    fn test_position_sizing_proportional() {
        let params = RiskParams {
            position_sizing: PositionSizing::Proportional as u8,
            sizing_param: 100, // 1%
            ..Default::default()
        };
        assert_eq!(params.calculate_size(100000, 500, 6000), 1000);
    }

    #[test]
    fn test_record_trade_win() {
        let mut agent = create_agent();
        agent.record_trade(1000, 5000, 1000);
        assert_eq!(agent.trades_count, 1);
        assert_eq!(agent.win_count, 1);
        assert_eq!(agent.total_pnl, 1000);
        assert_eq!(agent.high_water_mark, 101000);
    }

    #[test]
    fn test_record_trade_loss() {
        let mut agent = create_agent();
        agent.record_trade(-1000, 5000, 86400);
        assert_eq!(agent.trades_count, 1);
        assert_eq!(agent.win_count, 0);
        assert_eq!(agent.total_pnl, -1000);
        assert_eq!(agent.current_drawdown, 1000);
        assert_eq!(agent.daily_loss, 1000);
    }

    #[test]
    fn test_market_whitelist() {
        let mut agent = create_agent();

        // No whitelist = all allowed
        let market = Pubkey::new_unique();
        assert!(agent.is_market_allowed(&market));

        // Add whitelist
        let allowed_market = Pubkey::new_unique();
        agent.allowed_markets.push(allowed_market);
        agent.allowed_markets_count = 1;

        assert!(agent.is_market_allowed(&allowed_market));
        assert!(!agent.is_market_allowed(&market));
    }

    #[test]
    fn test_win_rate() {
        let mut agent = create_agent();
        agent.trades_count = 10;
        agent.win_count = 6;
        assert_eq!(agent.win_rate_bps(), 6000); // 60%
    }
}
