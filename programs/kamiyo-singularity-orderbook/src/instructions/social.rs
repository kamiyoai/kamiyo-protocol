use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::state::{
    CopyTradingVault, CopyVaultDeposit, FollowRelation, SocialError, TraderProfile,
};

// ============ Profile Instructions ============

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateProfile<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + TraderProfile::INIT_SPACE,
        seeds = [TraderProfile::SEED_PREFIX, owner.key().as_ref()],
        bump,
    )]
    pub profile: Account<'info, TraderProfile>,

    pub system_program: Program<'info, System>,
}

pub fn handler_create_profile(
    ctx: Context<CreateProfile>,
    name: String,
    bio: String,
) -> Result<()> {
    let profile = &mut ctx.accounts.profile;
    let clock = Clock::get()?;

    profile.owner = ctx.accounts.owner.key();
    profile.display_name = name;
    profile.bio = bio;
    profile.bump = ctx.bumps.profile;
    profile.is_public = true;
    profile.allow_copy_trading = false;
    profile._padding = [0; 1];
    profile.tier = 0;
    profile.total_pnl = 0;
    profile.total_volume = 0;
    profile.trades_count = 0;
    profile.win_count = 0;
    profile.best_trade = 0;
    profile.worst_trade = 0;
    profile.max_drawdown_bps = 0;
    profile._padding2 = [0; 6];
    profile.follower_count = 0;
    profile.copy_trader_count = 0;
    profile.copy_aum = 0;
    profile.created_at = clock.unix_timestamp;
    profile.last_trade_at = 0;
    profile.updated_at = clock.unix_timestamp;
    profile._reserved = [0; 32];

    emit!(ProfileCreated {
        profile: profile.key(),
        owner: profile.owner,
        name: profile.display_name.clone(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateProfile<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [TraderProfile::SEED_PREFIX, owner.key().as_ref()],
        bump = profile.bump,
    )]
    pub profile: Account<'info, TraderProfile>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateProfileParams {
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub is_public: Option<bool>,
    pub allow_copy_trading: Option<bool>,
}

pub fn handler_update_profile(
    ctx: Context<UpdateProfile>,
    params: UpdateProfileParams,
) -> Result<()> {
    let profile = &mut ctx.accounts.profile;

    if let Some(name) = params.display_name {
        profile.display_name = name;
    }
    if let Some(bio) = params.bio {
        profile.bio = bio;
    }
    if let Some(is_public) = params.is_public {
        profile.is_public = is_public;
    }
    if let Some(allow_copy) = params.allow_copy_trading {
        profile.allow_copy_trading = allow_copy;
    }

    profile.updated_at = Clock::get()?.unix_timestamp;

    Ok(())
}

// ============ Follow Instructions ============

#[derive(Accounts)]
pub struct FollowTrader<'info> {
    #[account(mut)]
    pub follower: Signer<'info>,

    #[account(
        seeds = [TraderProfile::SEED_PREFIX, follower.key().as_ref()],
        bump = follower_profile.bump,
    )]
    pub follower_profile: Account<'info, TraderProfile>,

    #[account(
        mut,
        seeds = [TraderProfile::SEED_PREFIX, leader_profile.owner.as_ref()],
        bump = leader_profile.bump,
        constraint = leader_profile.is_public @ SocialError::ProfileNotPublic,
    )]
    pub leader_profile: Account<'info, TraderProfile>,

    #[account(
        init,
        payer = follower,
        space = 8 + FollowRelation::INIT_SPACE,
        seeds = [FollowRelation::SEED_PREFIX, follower.key().as_ref(), leader_profile.owner.as_ref()],
        bump,
    )]
    pub follow_relation: Account<'info, FollowRelation>,

    pub system_program: Program<'info, System>,
}

pub fn handler_follow_trader(ctx: Context<FollowTrader>) -> Result<()> {
    let follow = &mut ctx.accounts.follow_relation;
    let leader = &mut ctx.accounts.leader_profile;
    let clock = Clock::get()?;

    follow.follower = ctx.accounts.follower.key();
    follow.leader = leader.owner;
    follow.followed_at = clock.unix_timestamp;
    follow.bump = ctx.bumps.follow_relation;
    follow._padding = [0; 7];

    leader.follower_count = leader.follower_count.saturating_add(1);

    emit!(TraderFollowed {
        follower: follow.follower,
        leader: follow.leader,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UnfollowTrader<'info> {
    #[account(mut)]
    pub follower: Signer<'info>,

    #[account(
        mut,
        seeds = [TraderProfile::SEED_PREFIX, leader_profile.owner.as_ref()],
        bump = leader_profile.bump,
    )]
    pub leader_profile: Account<'info, TraderProfile>,

    #[account(
        mut,
        close = follower,
        seeds = [FollowRelation::SEED_PREFIX, follower.key().as_ref(), leader_profile.owner.as_ref()],
        bump = follow_relation.bump,
    )]
    pub follow_relation: Account<'info, FollowRelation>,
}

pub fn handler_unfollow_trader(ctx: Context<UnfollowTrader>) -> Result<()> {
    let leader = &mut ctx.accounts.leader_profile;

    leader.follower_count = leader.follower_count.saturating_sub(1);

    emit!(TraderUnfollowed {
        follower: ctx.accounts.follower.key(),
        leader: leader.owner,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// ============ Copy Trading Instructions ============

#[derive(Accounts)]
pub struct CreateCopyVault<'info> {
    #[account(mut)]
    pub leader: Signer<'info>,

    #[account(
        seeds = [TraderProfile::SEED_PREFIX, leader.key().as_ref()],
        bump = leader_profile.bump,
        constraint = leader_profile.allow_copy_trading @ SocialError::CopyTradingNotAllowed,
    )]
    pub leader_profile: Account<'info, TraderProfile>,

    #[account(
        init,
        payer = leader,
        space = 8 + CopyTradingVault::INIT_SPACE,
        seeds = [CopyTradingVault::SEED_PREFIX, leader.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, CopyTradingVault>,

    pub collateral_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = leader,
        token::mint = collateral_mint,
        token::authority = vault,
    )]
    pub vault_token: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = leader,
        mint::decimals = 6,
        mint::authority = vault,
    )]
    pub share_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateVaultParams {
    pub management_fee_bps: u16,
    pub performance_fee_bps: u16,
    pub min_deposit: u64,
    pub max_deposits: u64,
}

pub fn handler_create_copy_vault(
    ctx: Context<CreateCopyVault>,
    params: CreateVaultParams,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    vault.authority = vault.key();
    vault.leader = ctx.accounts.leader.key();
    vault.collateral_mint = ctx.accounts.collateral_mint.key();
    vault.vault = ctx.accounts.vault_token.key();
    vault.share_mint = ctx.accounts.share_mint.key();
    vault.bump = ctx.bumps.vault;
    vault.is_active = true;
    vault._padding = [0; 2];
    vault.management_fee_bps = params.management_fee_bps;
    vault.performance_fee_bps = params.performance_fee_bps;
    vault.min_deposit = params.min_deposit;
    vault.max_deposits = params.max_deposits;
    vault.total_deposits = 0;
    vault.total_shares = 0;
    vault.high_water_mark = 0;
    vault.fees_collected = 0;
    vault.depositor_count = 0;
    vault.total_pnl = 0;
    vault._padding2 = [0; 4];
    vault.created_at = clock.unix_timestamp;
    vault.last_action_at = clock.unix_timestamp;
    vault.last_fee_at = clock.unix_timestamp;
    vault._reserved = [0; 32];

    emit!(CopyVaultCreated {
        vault: vault.key(),
        leader: vault.leader,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct DepositToCopyVault<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        constraint = vault.is_active @ SocialError::VaultNotActive,
    )]
    pub vault: Account<'info, CopyTradingVault>,

    #[account(
        init_if_needed,
        payer = depositor,
        space = 8 + CopyVaultDeposit::INIT_SPACE,
        seeds = [CopyVaultDeposit::SEED_PREFIX, vault.key().as_ref(), depositor.key().as_ref()],
        bump,
    )]
    pub deposit_receipt: Account<'info, CopyVaultDeposit>,

    #[account(
        mut,
        constraint = depositor_token.owner == depositor.key(),
        constraint = depositor_token.mint == vault.collateral_mint,
    )]
    pub depositor_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault_token.key() == vault.vault,
    )]
    pub vault_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = share_mint.key() == vault.share_mint,
    )]
    pub share_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = depositor,
        associated_token::mint = share_mint,
        associated_token::authority = depositor,
    )]
    pub depositor_shares: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler_deposit_to_copy_vault(ctx: Context<DepositToCopyVault>, amount: u64) -> Result<()> {
    let clock = Clock::get()?;

    // Get values needed before mutable borrow
    let min_deposit = ctx.accounts.vault.min_deposit;
    let max_deposits = ctx.accounts.vault.max_deposits;
    let total_deposits = ctx.accounts.vault.total_deposits;
    let total_shares = ctx.accounts.vault.total_shares;
    let leader = ctx.accounts.vault.leader;
    let bump = ctx.accounts.vault.bump;
    let vault_key = ctx.accounts.vault.key();
    let receipt_shares = ctx.accounts.deposit_receipt.shares;

    // Validate deposit
    require!(amount >= min_deposit, SocialError::DepositBelowMinimum);
    require!(
        total_deposits.saturating_add(amount) <= max_deposits,
        SocialError::VaultCapacityExceeded
    );

    // Calculate shares
    let shares = if total_shares == 0 {
        amount
    } else {
        (amount as u128 * total_shares as u128 / total_deposits as u128) as u64
    };

    // Transfer collateral
    let cpi_accounts = Transfer {
        from: ctx.accounts.depositor_token.to_account_info(),
        to: ctx.accounts.vault_token.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // Mint shares
    let seeds = &[CopyTradingVault::SEED_PREFIX, leader.as_ref(), &[bump]];
    let signer_seeds = &[&seeds[..]];

    let mint_accounts = MintTo {
        mint: ctx.accounts.share_mint.to_account_info(),
        to: ctx.accounts.depositor_shares.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let mint_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        mint_accounts,
        signer_seeds,
    );
    token::mint_to(mint_ctx, shares)?;

    // Now do mutable updates
    let vault = &mut ctx.accounts.vault;
    let receipt = &mut ctx.accounts.deposit_receipt;

    let is_new_depositor = receipt_shares == 0;
    vault.total_deposits = vault.total_deposits.saturating_add(amount);
    vault.total_shares = vault.total_shares.saturating_add(shares);
    if is_new_depositor {
        vault.depositor_count = vault.depositor_count.saturating_add(1);
    }
    vault.last_action_at = clock.unix_timestamp;

    if vault.total_deposits > vault.high_water_mark {
        vault.high_water_mark = vault.total_deposits;
    }

    receipt.depositor = ctx.accounts.depositor.key();
    receipt.vault = vault_key;
    receipt.shares = receipt.shares.saturating_add(shares);
    receipt.deposited_amount = receipt.deposited_amount.saturating_add(amount);
    if receipt.deposited_at == 0 {
        receipt.deposited_at = clock.unix_timestamp;
        receipt.bump = ctx.bumps.deposit_receipt;
        receipt._padding = [0; 7];
    }

    emit!(CopyVaultDeposited {
        vault: vault_key,
        depositor: ctx.accounts.depositor.key(),
        amount,
        shares,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawFromCopyVault<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(mut)]
    pub vault: Account<'info, CopyTradingVault>,

    #[account(
        mut,
        seeds = [CopyVaultDeposit::SEED_PREFIX, vault.key().as_ref(), depositor.key().as_ref()],
        bump = deposit_receipt.bump,
    )]
    pub deposit_receipt: Account<'info, CopyVaultDeposit>,

    #[account(
        mut,
        constraint = depositor_token.owner == depositor.key(),
    )]
    pub depositor_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault_token.key() == vault.vault,
    )]
    pub vault_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = share_mint.key() == vault.share_mint,
    )]
    pub share_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = depositor_shares.owner == depositor.key(),
        constraint = depositor_shares.mint == vault.share_mint,
    )]
    pub depositor_shares: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler_withdraw_from_copy_vault(
    ctx: Context<WithdrawFromCopyVault>,
    shares: u64,
) -> Result<()> {
    let clock = Clock::get()?;

    // Get values before mutable borrow
    let receipt_shares = ctx.accounts.deposit_receipt.shares;
    let total_shares = ctx.accounts.vault.total_shares;
    let total_deposits = ctx.accounts.vault.total_deposits;
    let leader = ctx.accounts.vault.leader;
    let bump = ctx.accounts.vault.bump;
    let vault_key = ctx.accounts.vault.key();

    require!(receipt_shares >= shares, SocialError::InsufficientShares);

    // Calculate withdrawal amount
    let amount = if total_shares == 0 {
        0
    } else {
        (shares as u128 * total_deposits as u128 / total_shares as u128) as u64
    };

    // Burn shares
    let burn_accounts = Burn {
        mint: ctx.accounts.share_mint.to_account_info(),
        from: ctx.accounts.depositor_shares.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
    };
    let burn_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), burn_accounts);
    token::burn(burn_ctx, shares)?;

    // Transfer collateral
    let seeds = &[CopyTradingVault::SEED_PREFIX, leader.as_ref(), &[bump]];
    let signer_seeds = &[&seeds[..]];

    let transfer_accounts = Transfer {
        from: ctx.accounts.vault_token.to_account_info(),
        to: ctx.accounts.depositor_token.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts,
        signer_seeds,
    );
    token::transfer(transfer_ctx, amount)?;

    // Now do mutable updates
    let vault = &mut ctx.accounts.vault;
    let receipt = &mut ctx.accounts.deposit_receipt;

    vault.total_deposits = vault.total_deposits.saturating_sub(amount);
    vault.total_shares = vault.total_shares.saturating_sub(shares);
    vault.last_action_at = clock.unix_timestamp;

    receipt.shares = receipt.shares.saturating_sub(shares);
    if receipt.shares == 0 {
        vault.depositor_count = vault.depositor_count.saturating_sub(1);
    }

    emit!(CopyVaultWithdrawn {
        vault: vault_key,
        depositor: ctx.accounts.depositor.key(),
        amount,
        shares,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ============ Events ============

#[event]
pub struct ProfileCreated {
    pub profile: Pubkey,
    pub owner: Pubkey,
    pub name: String,
    pub timestamp: i64,
}

#[event]
pub struct TraderFollowed {
    pub follower: Pubkey,
    pub leader: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TraderUnfollowed {
    pub follower: Pubkey,
    pub leader: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct CopyVaultCreated {
    pub vault: Pubkey,
    pub leader: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct CopyVaultDeposited {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub amount: u64,
    pub shares: u64,
    pub timestamp: i64,
}

#[event]
pub struct CopyVaultWithdrawn {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub amount: u64,
    pub shares: u64,
    pub timestamp: i64,
}
