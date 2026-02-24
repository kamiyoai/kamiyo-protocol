use crate::instructions::create_market::KAMIYO_FEE_POOL_AUTHORITY;
use crate::state::{Market, MarketStatus};
use anchor_lang::prelude::*;

fn default_market() -> Market {
    Market {
        market_id: String::new(),
        question: String::new(),
        description: String::new(),
        category: String::new(),
        authority: Pubkey::default(),
        oracle: Pubkey::default(),
        yes_mint: Pubkey::default(),
        no_mint: Pubkey::default(),
        vault: Pubkey::default(),
        collateral_mint: Pubkey::default(),
        status: MarketStatus::Active,
        resolution_deadline: 0,
        trading_end: 0,
        resolved_outcome: 0,
        total_collateral: 0,
        total_yes_supply: 0,
        total_no_supply: 0,
        fee_bps: 100,
        protocol_fee_share_bps: Market::DEFAULT_PROTOCOL_FEE_SHARE_BPS,
        protocol_treasury: KAMIYO_FEE_POOL_AUTHORITY,
        accumulated_fees: 0,
        protocol_fees_withdrawn: 0,
        creator_fees_withdrawn: 0,
        bump: 0,
        yes_mint_bump: 0,
        no_mint_bump: 0,
        vault_bump: 0,
        created_at: 0,
        resolved_at: 0,
    }
}

#[test]
fn singularity_default_fee_split_is_all_protocol() {
    assert_eq!(Market::DEFAULT_PROTOCOL_FEE_SHARE_BPS, 10_000);

    let mut market = default_market();
    market.accumulated_fees = 1_250_000;

    assert_eq!(market.calculate_protocol_fees(), 1_250_000);
    assert_eq!(market.calculate_creator_fees(), 0);
    assert_eq!(market.available_creator_fees(), 0);
}

#[test]
fn protocol_available_fees_track_withdrawals() {
    let mut market = default_market();
    market.accumulated_fees = 500_000;
    market.protocol_fees_withdrawn = 125_000;

    assert_eq!(market.available_protocol_fees(), 375_000);
    assert_eq!(market.available_creator_fees(), 0);
}

#[test]
fn flywheel_treasury_matches_expected_pool_authority() {
    assert_eq!(
        KAMIYO_FEE_POOL_AUTHORITY.to_string(),
        "9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d"
    );
}
