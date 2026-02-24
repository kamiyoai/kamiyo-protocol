use anchor_lang::prelude::*;

use crate::errors::OrderBookError;
use crate::state::{OracleConfig, OraclePrice, OracleType, OrderBookConfig, ResolutionOutcome};

/// Maximum staleness for oracle data in slots (~400ms per slot)
pub const DEFAULT_MAX_STALENESS_SLOTS: u64 = 150; // ~60 seconds

/// Switchboard decimal precision
pub const SWITCHBOARD_DECIMALS: u32 = 18;

/// Market state for resolution (simplified - would reference actual market account)
#[account]
pub struct MarketV2 {
    /// Market authority
    pub authority: Pubkey,

    /// Oracle feed pubkey
    pub oracle_feed: Pubkey,

    /// Oracle configuration
    pub oracle_config: OracleConfig,

    /// Current status (0 = Active, 1 = Closed, 2 = Resolved)
    pub status: u8,

    /// Resolved outcome (0 = Unresolved, 1 = Yes, 2 = No, 3 = Invalid)
    pub resolved_outcome: u8,

    /// Resolution timestamp
    pub resolved_at: i64,

    /// Resolution price low 64 bits
    pub resolution_price_lo: u64,

    /// Resolution price high 64 bits (signed)
    pub resolution_price_hi: i64,

    /// Trading end timestamp
    pub trading_end: i64,

    /// Resolution deadline timestamp
    pub resolution_deadline: i64,

    /// Bump seed
    pub bump: u8,

    /// Padding
    pub _padding: [u8; 7],
}

impl anchor_lang::Space for MarketV2 {
    // 32 + 32 + 36 + 1 + 1 + 8 + 8 + 8 + 8 + 8 + 1 + 7 = 150 bytes
    const INIT_SPACE: usize = 32 + 32 + OracleConfig::SIZE + 1 + 1 + 8 + 8 + 8 + 8 + 8 + 1 + 7;
}

impl MarketV2 {
    pub const SEED_PREFIX: &'static [u8] = b"market_v2";

    pub fn is_resolved(&self) -> bool {
        self.status == 2
    }

    pub fn can_resolve(&self, current_time: i64) -> bool {
        self.status == 1 && current_time >= self.resolution_deadline
    }

    pub fn get_resolution_price(&self) -> i128 {
        ((self.resolution_price_hi as i128) << 64) | (self.resolution_price_lo as i128)
    }

    pub fn set_resolution_price(&mut self, price: i128) {
        self.resolution_price_lo = price as u64;
        self.resolution_price_hi = (price >> 64) as i64;
    }
}

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    /// Anyone can resolve once conditions are met
    #[account(mut)]
    pub resolver: Signer<'info>,

    #[account(
        seeds = [OrderBookConfig::SEED_PREFIX],
        bump = config.bump,
    )]
    pub config: Account<'info, OrderBookConfig>,

    #[account(
        mut,
        seeds = [MarketV2::SEED_PREFIX, market.oracle_feed.as_ref()],
        bump = market.bump,
        constraint = !market.is_resolved() @ OrderBookError::MarketAlreadyResolved,
    )]
    pub market: Account<'info, MarketV2>,

    /// CHECK: Switchboard pull feed account - validated in handler
    #[account(
        constraint = oracle_feed.key() == market.oracle_feed @ OrderBookError::OracleFeedInvalid
    )]
    pub oracle_feed: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ResolveMarketResult {
    pub outcome: u8,
    pub price: i128,
    pub timestamp: i64,
}

pub fn handler(ctx: Context<ResolveMarket>) -> Result<ResolveMarketResult> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    // Verify market can be resolved
    require!(
        market.can_resolve(clock.unix_timestamp),
        OrderBookError::MarketNotReadyForResolution
    );

    // Read oracle price based on oracle type
    let oracle_price = match market.oracle_config.get_oracle_type() {
        OracleType::Switchboard => read_switchboard_price(&ctx.accounts.oracle_feed, clock.slot)?,
        OracleType::Manual => {
            // Manual resolution requires authority signature
            return Err(OrderBookError::OracleFeedInvalid.into());
        }
        _ => {
            return Err(OrderBookError::OracleFeedInvalid.into());
        }
    };

    // Check staleness
    let max_staleness = if market.oracle_config.max_staleness > 0 {
        market.oracle_config.max_staleness as u64
    } else {
        DEFAULT_MAX_STALENESS_SLOTS
    };

    require!(
        !oracle_price.is_stale(clock.slot, max_staleness),
        OrderBookError::OracleFeedStale
    );

    // Check confidence if configured
    if market.oracle_config.max_confidence > 0 {
        require!(
            oracle_price.confidence <= market.oracle_config.max_confidence,
            OrderBookError::OraclePriceOutOfRange
        );
    }

    // Determine outcome based on threshold
    let outcome = if market.oracle_config.evaluate_threshold(oracle_price.price) {
        ResolutionOutcome::Yes
    } else {
        ResolutionOutcome::No
    };

    // Update market state
    market.status = 2; // Resolved
    market.resolved_outcome = outcome as u8;
    market.resolved_at = clock.unix_timestamp;
    market.set_resolution_price(oracle_price.price);

    emit!(MarketResolved {
        market: market.key(),
        outcome: outcome as u8,
        price: oracle_price.price,
        timestamp: clock.unix_timestamp,
        resolver: ctx.accounts.resolver.key(),
    });

    Ok(ResolveMarketResult {
        outcome: outcome as u8,
        price: oracle_price.price,
        timestamp: clock.unix_timestamp,
    })
}

/// Read price from Switchboard pull feed
fn read_switchboard_price(feed_account: &AccountInfo, _current_slot: u64) -> Result<OraclePrice> {
    // Switchboard on-demand uses a specific account structure
    // The feed data is stored in the account data after a discriminator

    let data = feed_account.try_borrow_data()?;

    // Minimum data length check
    if data.len() < 128 {
        return Err(OrderBookError::OracleFeedInvalid.into());
    }

    // Switchboard pull feed structure (simplified):
    // - 8 bytes: discriminator
    // - 32 bytes: queue pubkey
    // - 8 bytes: created_at
    // - 16 bytes: result (i128)
    // - 8 bytes: max_variance
    // - 4 bytes: min_responses
    // - ... more fields
    // - 8 bytes: last_update_slot

    // Read the result value (i128 at offset ~48-64, varies by version)
    // For switchboard-on-demand, we read the aggregated result

    // Note: In production, use the official switchboard-on-demand crate's
    // deserialization. This is a simplified example.

    // Read price from typical offset
    let price_offset = 48;
    let price_bytes: [u8; 16] = data[price_offset..price_offset + 16]
        .try_into()
        .map_err(|_| OrderBookError::OracleFeedInvalid)?;
    let price = i128::from_le_bytes(price_bytes);

    // Read slot from end of commonly used area
    let slot_offset = data.len().saturating_sub(16);
    let slot_bytes: [u8; 8] = data[slot_offset..slot_offset + 8]
        .try_into()
        .map_err(|_| OrderBookError::OracleFeedInvalid)?;
    let slot = u64::from_le_bytes(slot_bytes);

    // Read timestamp (typically 8 bytes before slot)
    let ts_offset = slot_offset.saturating_sub(8);
    let ts_bytes: [u8; 8] = data[ts_offset..ts_offset + 8]
        .try_into()
        .map_err(|_| OrderBookError::OracleFeedInvalid)?;
    let timestamp = i64::from_le_bytes(ts_bytes);

    // Confidence is typically stored nearby
    let confidence = 0u64; // Simplified

    Ok(OraclePrice {
        price,
        confidence,
        slot,
        timestamp,
    })
}

/// Manual resolution by authority
#[derive(Accounts)]
pub struct ResolveMarketManual<'info> {
    #[account(
        mut,
        constraint = authority.key() == market.authority @ OrderBookError::UnauthorizedAdmin
    )]
    pub authority: Signer<'info>,

    #[account(
        seeds = [OrderBookConfig::SEED_PREFIX],
        bump = config.bump,
    )]
    pub config: Account<'info, OrderBookConfig>,

    #[account(
        mut,
        seeds = [MarketV2::SEED_PREFIX, market.oracle_feed.as_ref()],
        bump = market.bump,
        constraint = !market.is_resolved() @ OrderBookError::MarketAlreadyResolved,
        constraint = market.oracle_config.get_oracle_type() == OracleType::Manual @ OrderBookError::OracleFeedInvalid,
    )]
    pub market: Account<'info, MarketV2>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct ManualResolutionParams {
    pub outcome: u8, // 1 = Yes, 2 = No
}

pub fn handler_manual(
    ctx: Context<ResolveMarketManual>,
    params: ManualResolutionParams,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    // Validate outcome
    require!(
        params.outcome == 1 || params.outcome == 2,
        OrderBookError::InvalidResolutionOutcome
    );

    // Update market state
    market.status = 2; // Resolved
    market.resolved_outcome = params.outcome;
    market.resolved_at = clock.unix_timestamp;
    market.set_resolution_price(0); // No oracle price for manual

    emit!(MarketResolved {
        market: market.key(),
        outcome: params.outcome,
        price: 0,
        timestamp: clock.unix_timestamp,
        resolver: ctx.accounts.authority.key(),
    });

    Ok(())
}

#[event]
pub struct MarketResolved {
    pub market: Pubkey,
    pub outcome: u8,
    pub price: i128,
    pub timestamp: i64,
    pub resolver: Pubkey,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::ComparisonOp;

    #[test]
    fn test_resolution_outcome_conversion() {
        assert_eq!(ResolutionOutcome::from(0), ResolutionOutcome::Unresolved);
        assert_eq!(ResolutionOutcome::from(1), ResolutionOutcome::Yes);
        assert_eq!(ResolutionOutcome::from(2), ResolutionOutcome::No);
        assert_eq!(ResolutionOutcome::from(3), ResolutionOutcome::Invalid);
        assert_eq!(ResolutionOutcome::from(99), ResolutionOutcome::Unresolved);
    }

    #[test]
    fn test_oracle_config_threshold() {
        // BTC > $50,000 example
        // $50,000 with 18 decimals = 50_000 * 10^18
        let threshold = 50_000_000_000_000_000_000_000i128;
        let config = OracleConfig::new_switchboard(threshold, ComparisonOp::GreaterThan, 150);

        // Price at $55,000
        let price = 55_000_000_000_000_000_000_000i128;
        assert!(config.evaluate_threshold(price)); // Yes

        // Price at $45,000
        let price = 45_000_000_000_000_000_000_000i128;
        assert!(!config.evaluate_threshold(price)); // No

        // Price exactly at $50,000 (GreaterThan, so No)
        let price = 50_000_000_000_000_000_000_000i128;
        assert!(!config.evaluate_threshold(price)); // No (not strictly greater)
    }
}
