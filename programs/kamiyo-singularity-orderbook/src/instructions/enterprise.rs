use crate::state::{ApiKeyRecord, EnterpriseError, EnterpriseTenant};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateTenant<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + EnterpriseTenant::INIT_SPACE,
        seeds = [EnterpriseTenant::SEED_PREFIX, owner.key().as_ref()],
        bump
    )]
    pub tenant: Account<'info, EnterpriseTenant>,

    pub system_program: Program<'info, System>,
}

pub fn create_tenant(
    ctx: Context<CreateTenant>,
    name: String,
    api_key_hash: [u8; 32],
    max_markets: u32,
    max_daily_volume: u64,
) -> Result<()> {
    let tenant = &mut ctx.accounts.tenant;
    let clock = Clock::get()?;

    tenant.owner = ctx.accounts.owner.key();
    tenant.name = name;
    tenant.api_key_hash = api_key_hash;
    tenant.bump = ctx.bumps.tenant;
    tenant.is_active = true;
    tenant._padding = [0; 2];
    tenant.max_markets = max_markets;
    tenant.max_daily_volume = max_daily_volume;
    tenant.fee_override_bps = 0;
    tenant.revenue_share_bps = 5000; // Default 50%
    tenant._padding2 = [0; 4];
    tenant.markets_created = 0;
    tenant.total_volume = 0;
    tenant.fees_collected = 0;
    tenant.daily_volume = 0;
    tenant.last_day = (clock.unix_timestamp as u64) / 86400;
    tenant.created_at = clock.unix_timestamp;
    tenant.last_activity_at = clock.unix_timestamp;
    tenant.allowed_categories_count = 0;
    tenant._reserved = [0; 31];
    tenant.allowed_categories = vec![];

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateTenant<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [EnterpriseTenant::SEED_PREFIX, owner.key().as_ref()],
        bump = tenant.bump,
        has_one = owner
    )]
    pub tenant: Account<'info, EnterpriseTenant>,
}

pub fn update_tenant(
    ctx: Context<UpdateTenant>,
    is_active: Option<bool>,
    max_markets: Option<u32>,
    max_daily_volume: Option<u64>,
    fee_override_bps: Option<u16>,
    revenue_share_bps: Option<u16>,
) -> Result<()> {
    let tenant = &mut ctx.accounts.tenant;

    if let Some(active) = is_active {
        tenant.is_active = active;
    }
    if let Some(markets) = max_markets {
        tenant.max_markets = markets;
    }
    if let Some(volume) = max_daily_volume {
        tenant.max_daily_volume = volume;
    }
    if let Some(fee) = fee_override_bps {
        tenant.fee_override_bps = fee;
    }
    if let Some(share) = revenue_share_bps {
        tenant.revenue_share_bps = share;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct SetAllowedCategories<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [EnterpriseTenant::SEED_PREFIX, owner.key().as_ref()],
        bump = tenant.bump,
        has_one = owner
    )]
    pub tenant: Account<'info, EnterpriseTenant>,
}

pub fn set_allowed_categories(
    ctx: Context<SetAllowedCategories>,
    categories: Vec<String>,
) -> Result<()> {
    let tenant = &mut ctx.accounts.tenant;

    tenant.allowed_categories = categories.clone();
    tenant.allowed_categories_count = categories.len() as u8;

    Ok(())
}

#[derive(Accounts)]
#[instruction(new_api_key_hash: [u8; 32], old_key_expires_in: i64, old_key_hash_prefix: [u8; 8])]
pub struct RotateApiKey<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [EnterpriseTenant::SEED_PREFIX, owner.key().as_ref()],
        bump = tenant.bump,
        has_one = owner
    )]
    pub tenant: Account<'info, EnterpriseTenant>,

    #[account(
        init,
        payer = owner,
        space = 8 + ApiKeyRecord::INIT_SPACE,
        seeds = [ApiKeyRecord::SEED_PREFIX, tenant.key().as_ref(), &old_key_hash_prefix],
        bump
    )]
    pub old_key_record: Account<'info, ApiKeyRecord>,

    pub system_program: Program<'info, System>,
}

pub fn rotate_api_key(
    ctx: Context<RotateApiKey>,
    new_api_key_hash: [u8; 32],
    old_key_expires_in: i64,
    _old_key_hash_prefix: [u8; 8],
) -> Result<()> {
    let tenant = &mut ctx.accounts.tenant;
    let old_key = &mut ctx.accounts.old_key_record;
    let clock = Clock::get()?;

    // Save old key record
    old_key.tenant = tenant.key();
    old_key.key_hash = tenant.api_key_hash;
    old_key.is_active = true;
    old_key.created_at = clock.unix_timestamp;
    old_key.expires_at = if old_key_expires_in > 0 {
        clock.unix_timestamp + old_key_expires_in
    } else {
        0
    };
    old_key.last_used_at = 0;
    old_key.bump = ctx.bumps.old_key_record;
    old_key._padding = [0; 6];

    // Update tenant with new key
    tenant.api_key_hash = new_api_key_hash;
    tenant.last_activity_at = clock.unix_timestamp;

    Ok(())
}

#[derive(Accounts)]
pub struct RecordTenantVolume<'info> {
    pub authority: Signer<'info>,

    #[account(mut)]
    pub tenant: Account<'info, EnterpriseTenant>,
}

pub fn record_tenant_volume(
    ctx: Context<RecordTenantVolume>,
    volume: u64,
    fees: u64,
) -> Result<()> {
    let tenant = &mut ctx.accounts.tenant;
    let clock = Clock::get()?;

    require!(tenant.is_active, EnterpriseError::TenantNotActive);
    require!(
        tenant.check_volume_limit(volume),
        EnterpriseError::DailyVolumeLimitExceeded
    );

    tenant.record_volume(volume, clock.unix_timestamp);
    tenant.fees_collected = tenant.fees_collected.saturating_add(fees);

    Ok(())
}

#[derive(Accounts)]
pub struct IncrementMarketCount<'info> {
    pub authority: Signer<'info>,

    #[account(mut)]
    pub tenant: Account<'info, EnterpriseTenant>,
}

pub fn increment_market_count(ctx: Context<IncrementMarketCount>) -> Result<()> {
    let tenant = &mut ctx.accounts.tenant;

    require!(tenant.is_active, EnterpriseError::TenantNotActive);
    require!(
        tenant.can_create_market(),
        EnterpriseError::MarketLimitExceeded
    );

    tenant.markets_created = tenant.markets_created.saturating_add(1);

    Ok(())
}
