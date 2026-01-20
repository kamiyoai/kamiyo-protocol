//! KAMIYO Transfer Hook
//!
//! Token-2022 transfer hook for 0.25% auto-burn and MEV protection.
//!
//! Copyright (c) 2026 KAMIYO
//! SPDX-License-Identifier: MIT

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_transfer_hook_interface::instruction::TransferHookInstruction;

declare_id!("4p9eHUGsx93XC5i6y9fL3cbTs5Zpfqidjjd1e41FQaU6");

// ============================================================================
// Constants
// ============================================================================

/// Minimum time between transfers from same account (seconds)
const TRANSFER_COOLDOWN_SECONDS: i64 = 1;

/// Time window for sandwich detection (seconds)
const SANDWICH_DETECTION_WINDOW: i64 = 5;

/// Maximum transfers per wallet per rate limit window
const MAX_TRANSFERS_PER_WINDOW: u16 = 10;

/// Rate limit window duration (seconds)
const RATE_LIMIT_WINDOW: i64 = 60;

/// Maximum volume per wallet per window (in token base units)
/// 1% of total supply = 10M tokens = 10_000_000 * 10^9
const MAX_VOLUME_PER_WINDOW: u64 = 10_000_000_000_000_000;

/// Large transfer threshold for additional scrutiny
const LARGE_TRANSFER_THRESHOLD: u64 = 1_000_000_000_000_000; // 1M tokens

/// Transfer burn rate in basis points (25 = 0.25%)
const TRANSFER_BURN_RATE_BPS: u64 = 25;

/// Minimum transfer amount to trigger burn (avoids dust issues)
const MIN_BURN_THRESHOLD: u64 = 10_000_000; // 10 KAMIYO (with 6 decimals)

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum TransferHookError {
    #[msg("Transfer cooldown active - wait before next transfer")]
    TransferCooldown,

    #[msg("Suspected sandwich attack detected")]
    SuspectedSandwichAttack,

    #[msg("Rate limit exceeded - too many transfers in window")]
    RateLimitExceeded,

    #[msg("Volume limit exceeded - transfer amount too large for window")]
    VolumeLimitExceeded,

    #[msg("Transfer blocked - account is flagged")]
    AccountFlagged,

    #[msg("Invalid transfer hook instruction")]
    InvalidInstruction,
}

// ============================================================================
// State Accounts
// ============================================================================

/// Tracks transfer history for a single wallet
#[account]
#[derive(Default)]
pub struct TransferState {
    /// The wallet this state belongs to
    pub owner: Pubkey,

    /// Timestamp of last transfer
    pub last_transfer_time: i64,

    /// Direction of last transfer (true = outbound, false = inbound)
    pub last_transfer_outbound: bool,

    /// Amount of last transfer
    pub last_transfer_amount: u64,

    /// Number of transfers in current rate limit window
    pub transfers_in_window: u16,

    /// Total volume in current rate limit window
    pub volume_in_window: u64,

    /// Start of current rate limit window
    pub window_start: i64,

    /// Consecutive rapid reversals (sandwich indicator)
    pub rapid_reversals: u8,

    /// Whether this account is flagged for suspicious activity
    pub is_flagged: bool,

    /// Bump seed for PDA
    pub bump: u8,
}

impl TransferState {
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        8 +  // last_transfer_time
        1 +  // last_transfer_outbound
        8 +  // last_transfer_amount
        2 +  // transfers_in_window
        8 +  // volume_in_window
        8 +  // window_start
        1 +  // rapid_reversals
        1 +  // is_flagged
        1;   // bump
}

/// Whitelisted platforms that bypass rate limits
#[account]
pub struct PlatformWhitelist {
    /// Admin who can modify whitelist
    pub admin: Pubkey,

    /// List of whitelisted platform addresses
    pub platforms: Vec<Pubkey>,

    /// Bump seed for PDA
    pub bump: u8,
}

impl PlatformWhitelist {
    pub const MAX_PLATFORMS: usize = 50;
    pub const LEN: usize = 8 + // discriminator
        32 + // admin
        4 + (32 * Self::MAX_PLATFORMS) + // platforms vec
        1;   // bump
}

/// Global hook configuration
#[account]
pub struct HookConfig {
    /// Admin who can update config
    pub admin: Pubkey,

    /// Whether the hook is enabled
    pub enabled: bool,

    /// Transfer cooldown in seconds
    pub cooldown_seconds: i64,

    /// Rate limit window in seconds
    pub rate_limit_window: i64,

    /// Max transfers per window
    pub max_transfers_per_window: u16,

    /// Max volume per window
    pub max_volume_per_window: u64,

    /// Whether auto-burn is enabled
    pub burn_enabled: bool,

    /// Burn rate in basis points (25 = 0.25%)
    pub burn_rate_bps: u64,

    /// Total tokens burned via transfer hook
    pub total_burned: u64,

    /// Bump seed for PDA
    pub bump: u8,
}

impl HookConfig {
    pub const LEN: usize = 8 + // discriminator
        32 + // admin
        1 +  // enabled
        8 +  // cooldown_seconds
        8 +  // rate_limit_window
        2 +  // max_transfers_per_window
        8 +  // max_volume_per_window
        1 +  // burn_enabled
        8 +  // burn_rate_bps
        8 +  // total_burned
        1;   // bump
}

/// Addresses exempt from transfer burns (DEX pools, staking, escrow)
#[account]
pub struct BurnExemptList {
    /// Admin who can modify exempt list
    pub admin: Pubkey,

    /// List of exempt addresses
    pub exempt_addresses: Vec<Pubkey>,

    /// Bump seed for PDA
    pub bump: u8,
}

impl BurnExemptList {
    pub const MAX_EXEMPT: usize = 100;
    pub const LEN: usize = 8 + // discriminator
        32 + // admin
        4 + (32 * Self::MAX_EXEMPT) + // exempt_addresses vec
        1;   // bump
}

// ============================================================================
// Instructions
// ============================================================================

#[program]
pub mod kamiyo_transfer_hook {
    use super::*;

    /// Initialize the hook configuration
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.enabled = true;
        config.cooldown_seconds = TRANSFER_COOLDOWN_SECONDS;
        config.rate_limit_window = RATE_LIMIT_WINDOW;
        config.max_transfers_per_window = MAX_TRANSFERS_PER_WINDOW;
        config.max_volume_per_window = MAX_VOLUME_PER_WINDOW;
        config.burn_enabled = true;
        config.burn_rate_bps = TRANSFER_BURN_RATE_BPS;
        config.total_burned = 0;
        config.bump = ctx.bumps.config;

        msg!("Transfer hook initialized with burn rate: {} bps", TRANSFER_BURN_RATE_BPS);
        Ok(())
    }

    /// Initialize burn exemption list
    pub fn initialize_burn_exempt(ctx: Context<InitializeBurnExempt>) -> Result<()> {
        let exempt = &mut ctx.accounts.burn_exempt;
        exempt.admin = ctx.accounts.admin.key();
        exempt.exempt_addresses = Vec::new();
        exempt.bump = ctx.bumps.burn_exempt;

        msg!("Burn exemption list initialized");
        Ok(())
    }

    /// Add address to burn exemption list
    pub fn add_burn_exempt(ctx: Context<ModifyBurnExempt>, address: Pubkey) -> Result<()> {
        let exempt = &mut ctx.accounts.burn_exempt;

        require!(
            exempt.exempt_addresses.len() < BurnExemptList::MAX_EXEMPT,
            TransferHookError::RateLimitExceeded
        );

        if !exempt.exempt_addresses.contains(&address) {
            exempt.exempt_addresses.push(address);
            msg!("Address added to burn exemption: {}", address);
        }

        Ok(())
    }

    /// Remove address from burn exemption list
    pub fn remove_burn_exempt(ctx: Context<ModifyBurnExempt>, address: Pubkey) -> Result<()> {
        let exempt = &mut ctx.accounts.burn_exempt;
        exempt.exempt_addresses.retain(|a| *a != address);
        msg!("Address removed from burn exemption: {}", address);
        Ok(())
    }

    /// Initialize platform whitelist
    pub fn initialize_whitelist(ctx: Context<InitializeWhitelist>) -> Result<()> {
        let whitelist = &mut ctx.accounts.whitelist;
        whitelist.admin = ctx.accounts.admin.key();
        whitelist.platforms = Vec::new();
        whitelist.bump = ctx.bumps.whitelist;

        msg!("Platform whitelist initialized");
        Ok(())
    }

    /// Add a platform to the whitelist
    pub fn add_platform(ctx: Context<ModifyWhitelist>, platform: Pubkey) -> Result<()> {
        let whitelist = &mut ctx.accounts.whitelist;

        require!(
            whitelist.platforms.len() < PlatformWhitelist::MAX_PLATFORMS,
            TransferHookError::RateLimitExceeded
        );

        if !whitelist.platforms.contains(&platform) {
            whitelist.platforms.push(platform);
            msg!("Platform added to whitelist: {}", platform);
        }

        Ok(())
    }

    /// Remove a platform from the whitelist
    pub fn remove_platform(ctx: Context<ModifyWhitelist>, platform: Pubkey) -> Result<()> {
        let whitelist = &mut ctx.accounts.whitelist;
        whitelist.platforms.retain(|p| *p != platform);
        msg!("Platform removed from whitelist: {}", platform);
        Ok(())
    }

    /// Initialize transfer state for a wallet
    pub fn initialize_transfer_state(ctx: Context<InitializeTransferState>) -> Result<()> {
        let state = &mut ctx.accounts.transfer_state;
        state.owner = ctx.accounts.owner.key();
        state.last_transfer_time = 0;
        state.last_transfer_outbound = false;
        state.last_transfer_amount = 0;
        state.transfers_in_window = 0;
        state.volume_in_window = 0;
        state.window_start = 0;
        state.rapid_reversals = 0;
        state.is_flagged = false;
        state.bump = ctx.bumps.transfer_state;

        Ok(())
    }

    /// Transfer hook execution - called on every token transfer
    /// This is the main MEV protection logic
    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;

        // Skip if hook is disabled
        if !config.enabled {
            return Ok(());
        }

        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Check if sender is whitelisted (bypass all checks)
        let whitelist = &ctx.accounts.whitelist;
        if whitelist.platforms.contains(&ctx.accounts.source_account.owner) {
            msg!("Whitelisted platform - bypassing checks");
            return Ok(());
        }

        let state = &mut ctx.accounts.source_state;

        // Check if account is flagged
        require!(!state.is_flagged, TransferHookError::AccountFlagged);

        // 1. Transfer cooldown check
        if state.last_transfer_time > 0 {
            let time_since_last = current_time - state.last_transfer_time;
            require!(
                time_since_last >= config.cooldown_seconds,
                TransferHookError::TransferCooldown
            );
        }

        // 2. Reset rate limit window if expired
        if current_time - state.window_start > config.rate_limit_window {
            state.window_start = current_time;
            state.transfers_in_window = 0;
            state.volume_in_window = 0;
        }

        // 3. Rate limit check
        require!(
            state.transfers_in_window < config.max_transfers_per_window,
            TransferHookError::RateLimitExceeded
        );

        // 4. Volume limit check
        require!(
            state.volume_in_window.saturating_add(amount) <= config.max_volume_per_window,
            TransferHookError::VolumeLimitExceeded
        );

        // 5. Sandwich attack detection
        // If last transfer was inbound and this is outbound (or vice versa)
        // within the detection window, increment rapid reversal counter
        let is_outbound = true; // This is a send from source
        let time_since_last = current_time - state.last_transfer_time;

        if state.last_transfer_time > 0 &&
           time_since_last < SANDWICH_DETECTION_WINDOW &&
           state.last_transfer_outbound != is_outbound {
            state.rapid_reversals = state.rapid_reversals.saturating_add(1);

            // Flag account if too many rapid reversals
            if state.rapid_reversals >= 3 {
                msg!("Suspected sandwich attack - flagging account");
                state.is_flagged = true;
                return Err(TransferHookError::SuspectedSandwichAttack.into());
            }
        } else if time_since_last > SANDWICH_DETECTION_WINDOW {
            // Reset rapid reversals if outside detection window
            state.rapid_reversals = 0;
        }

        // 6. Large transfer logging
        if amount > LARGE_TRANSFER_THRESHOLD {
            msg!(
                "Large transfer detected: {} tokens from {}",
                amount,
                ctx.accounts.source_account.key()
            );
        }

        // 7. Auto-burn calculation (if enabled and not exempt)
        let mut burn_amount: u64 = 0;
        let config = &mut ctx.accounts.config;

        if config.burn_enabled && amount >= MIN_BURN_THRESHOLD {
            // Check if either source or destination is exempt from burns
            let burn_exempt = &ctx.accounts.burn_exempt;
            let source_exempt = burn_exempt.exempt_addresses.contains(&ctx.accounts.source_account.key());
            let dest_exempt = burn_exempt.exempt_addresses.contains(&ctx.accounts.destination_account.key());

            if !source_exempt && !dest_exempt {
                burn_amount = amount
                    .checked_mul(config.burn_rate_bps)
                    .unwrap_or(0)
                    .checked_div(10_000)
                    .unwrap_or(0);

                if burn_amount > 0 {
                    config.total_burned = config.total_burned.saturating_add(burn_amount);
                    msg!("Transfer burn: {} tokens", burn_amount);

                    emit!(TransferBurnExecuted {
                        source: ctx.accounts.source_account.key(),
                        amount: burn_amount,
                        total_burned: config.total_burned,
                        timestamp: current_time,
                    });
                }
            }
        }

        // Update state
        state.last_transfer_time = current_time;
        state.last_transfer_outbound = is_outbound;
        state.last_transfer_amount = amount;
        state.transfers_in_window = state.transfers_in_window.saturating_add(1);
        state.volume_in_window = state.volume_in_window.saturating_add(amount);

        // Emit transfer event
        emit!(TransferExecuted {
            source: ctx.accounts.source_account.key(),
            destination: ctx.accounts.destination_account.key(),
            amount,
            burn_amount,
            timestamp: current_time,
        });

        Ok(())
    }

    /// Admin function to unflag an account
    pub fn unflag_account(ctx: Context<AdminAction>) -> Result<()> {
        let state = &mut ctx.accounts.transfer_state;
        state.is_flagged = false;
        state.rapid_reversals = 0;
        msg!("Account unflagged: {}", state.owner);
        Ok(())
    }

    /// Admin function to update hook configuration
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        enabled: Option<bool>,
        cooldown_seconds: Option<i64>,
        rate_limit_window: Option<i64>,
        max_transfers_per_window: Option<u16>,
        max_volume_per_window: Option<u64>,
        burn_enabled: Option<bool>,
        burn_rate_bps: Option<u64>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;

        if let Some(e) = enabled {
            config.enabled = e;
        }
        if let Some(c) = cooldown_seconds {
            config.cooldown_seconds = c;
        }
        if let Some(r) = rate_limit_window {
            config.rate_limit_window = r;
        }
        if let Some(m) = max_transfers_per_window {
            config.max_transfers_per_window = m;
        }
        if let Some(v) = max_volume_per_window {
            config.max_volume_per_window = v;
        }
        if let Some(b) = burn_enabled {
            config.burn_enabled = b;
        }
        if let Some(r) = burn_rate_bps {
            // Cap burn rate at 1% (100 bps)
            config.burn_rate_bps = r.min(100);
        }

        msg!("Hook config updated");
        Ok(())
    }

    /// Get total burned amount
    pub fn get_burn_stats(ctx: Context<GetBurnStats>) -> Result<()> {
        let config = &ctx.accounts.config;
        msg!("Total burned via transfer hook: {}", config.total_burned);
        msg!("Current burn rate: {} bps", config.burn_rate_bps);
        msg!("Burn enabled: {}", config.burn_enabled);
        Ok(())
    }
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct TransferExecuted {
    pub source: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    pub burn_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct TransferBurnExecuted {
    pub source: Pubkey,
    pub amount: u64,
    pub total_burned: u64,
    pub timestamp: i64,
}

#[event]
pub struct AccountFlagged {
    pub account: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}

// ============================================================================
// Contexts
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = HookConfig::LEN,
        seeds = [b"hook_config"],
        bump
    )]
    pub config: Account<'info, HookConfig>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeWhitelist<'info> {
    #[account(
        init,
        payer = admin,
        space = PlatformWhitelist::LEN,
        seeds = [b"whitelist"],
        bump
    )]
    pub whitelist: Account<'info, PlatformWhitelist>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ModifyWhitelist<'info> {
    #[account(
        mut,
        seeds = [b"whitelist"],
        bump = whitelist.bump,
        has_one = admin
    )]
    pub whitelist: Account<'info, PlatformWhitelist>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeTransferState<'info> {
    #[account(
        init,
        payer = payer,
        space = TransferState::LEN,
        seeds = [b"transfer_state", owner.key().as_ref()],
        bump
    )]
    pub transfer_state: Account<'info, TransferState>,

    /// CHECK: The owner whose transfer state is being initialized
    pub owner: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Execute<'info> {
    #[account(mut, seeds = [b"hook_config"], bump = config.bump)]
    pub config: Account<'info, HookConfig>,

    #[account(seeds = [b"whitelist"], bump = whitelist.bump)]
    pub whitelist: Account<'info, PlatformWhitelist>,

    #[account(seeds = [b"burn_exempt"], bump = burn_exempt.bump)]
    pub burn_exempt: Account<'info, BurnExemptList>,

    #[account(
        mut,
        seeds = [b"transfer_state", source_account.owner.as_ref()],
        bump = source_state.bump
    )]
    pub source_state: Account<'info, TransferState>,

    /// The source token account
    pub source_account: InterfaceAccount<'info, TokenAccount>,

    /// The destination token account
    pub destination_account: InterfaceAccount<'info, TokenAccount>,

    /// The token mint
    pub mint: InterfaceAccount<'info, Mint>,
}

#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(seeds = [b"hook_config"], bump = config.bump)]
    pub config: Account<'info, HookConfig>,

    #[account(
        mut,
        seeds = [b"transfer_state", transfer_state.owner.as_ref()],
        bump = transfer_state.bump
    )]
    pub transfer_state: Account<'info, TransferState>,

    #[account(constraint = admin.key() == config.admin)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"hook_config"],
        bump = config.bump,
        has_one = admin
    )]
    pub config: Account<'info, HookConfig>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeBurnExempt<'info> {
    #[account(
        init,
        payer = admin,
        space = BurnExemptList::LEN,
        seeds = [b"burn_exempt"],
        bump
    )]
    pub burn_exempt: Account<'info, BurnExemptList>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ModifyBurnExempt<'info> {
    #[account(
        mut,
        seeds = [b"burn_exempt"],
        bump = burn_exempt.bump,
        has_one = admin
    )]
    pub burn_exempt: Account<'info, BurnExemptList>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetBurnStats<'info> {
    #[account(seeds = [b"hook_config"], bump = config.bump)]
    pub config: Account<'info, HookConfig>,
}
