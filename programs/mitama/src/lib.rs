//! Mitama - Agent Identity and Conflict Resolution Protocol
//!
//! 魂 (mitama) - The soul/spirit that persists through conflict
//!
//! Copyright (c) 2025 KAMIYO
//! SPDX-License-Identifier: BUSL-1.1
//!
//! Mitama provides autonomous agents with:
//! - PDA-based agent identities with stake-backed accountability
//! - Trustless conflict resolution via multi-oracle consensus
//! - Quality-based arbitration for fair dispute outcomes
//! - On-chain reputation tracking for trust scoring
//! - SPL token support (USDC, USDT, SOL)
//!
//! Core Concepts:
//! - Agent: An autonomous entity with a PDA identity and staked collateral
//! - Agreement: A payment agreement between agent and provider (formerly escrow)
//! - Conflict: A disputed agreement requiring oracle arbitration
//! - Resolution: The outcome of conflict arbitration with quality-based settlement

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    ed25519_program,
    sysvar::{
        instructions::{load_instruction_at_checked, ID as INSTRUCTIONS_ID},
        rent::Rent,
    },
};
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer as SplTransfer};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("8z97gUtmy43FXLs5kWvqDAA6BjsHYDwKXFoM6LsngXoC");

// ============================================================================
// Constants
// ============================================================================

// Known SPL token mints
pub mod token_mints {
    use anchor_lang::solana_program::pubkey;
    use anchor_lang::solana_program::pubkey::Pubkey;

    pub const USDC_MAINNET: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    pub const USDT_MAINNET: Pubkey = pubkey!("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
    pub const USDC_DEVNET: Pubkey = pubkey!("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vn2KGtKJr");

    pub fn is_stablecoin(mint: &Pubkey) -> bool {
        *mint == USDC_MAINNET || *mint == USDT_MAINNET || *mint == USDC_DEVNET
    }
}

// Validation constants
const MIN_TIME_LOCK: i64 = 3600;                    // 1 hour
const MAX_TIME_LOCK: i64 = 2_592_000;               // 30 days
const MAX_ESCROW_AMOUNT: u64 = 1_000_000_000_000;   // 1000 SOL
const MIN_ESCROW_AMOUNT: u64 = 1_000_000;           // 0.001 SOL
const BASE_DISPUTE_COST: u64 = 1_000_000;           // 0.001 SOL

// Multi-oracle consensus constants
const MAX_ORACLES: usize = 5;
const MIN_CONSENSUS_ORACLES: u8 = 2;
#[allow(dead_code)]
const MAX_SCORE_DEVIATION: u8 = 15;

// Agent constants
const MIN_STAKE_AMOUNT: u64 = 100_000_000;          // 0.1 SOL minimum stake
const MAX_AGENT_NAME_LENGTH: usize = 32;

// Protocol version for upgrade tracking
const PROTOCOL_VERSION: u8 = 1;

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct AgentCreated {
    pub agent_pda: Pubkey,
    pub owner: Pubkey,
    pub name: String,
    pub agent_type: u8,
    pub stake_amount: u64,
}

#[event]
pub struct AgentDeactivated {
    pub agent_pda: Pubkey,
    pub owner: Pubkey,
    pub refunded_stake: u64,
}

#[event]
pub struct AgentReputationUpdated {
    pub agent_pda: Pubkey,
    pub old_reputation: u64,
    pub new_reputation: u64,
    pub delta: i64,
}

#[event]
pub struct EscrowInitialized {
    pub escrow: Pubkey,
    pub agent: Pubkey,
    pub api: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
    pub transaction_id: String,
    pub is_token: bool,
    pub token_mint: Option<Pubkey>,
}

#[event]
pub struct DisputeMarked {
    pub escrow: Pubkey,
    pub agent: Pubkey,
    pub transaction_id: String,
    pub timestamp: i64,
}

#[event]
pub struct DisputeResolved {
    pub escrow: Pubkey,
    pub transaction_id: String,
    pub quality_score: u8,
    pub refund_percentage: u8,
    pub refund_amount: u64,
    pub payment_amount: u64,
    pub verifier: Pubkey,
}

#[event]
pub struct FundsReleased {
    pub escrow: Pubkey,
    pub transaction_id: String,
    pub amount: u64,
    pub api: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct OracleRegistryInitialized {
    pub registry: Pubkey,
    pub admin: Pubkey,
    pub min_consensus: u8,
    pub max_score_deviation: u8,
}

#[event]
pub struct OracleAdded {
    pub registry: Pubkey,
    pub oracle: Pubkey,
    pub oracle_type_index: u8,
    pub weight: u16,
}

#[event]
pub struct OracleRemoved {
    pub registry: Pubkey,
    pub oracle: Pubkey,
}

#[event]
pub struct AdminTransferred {
    pub registry: Pubkey,
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct ProtocolConfigInitialized {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub version: u8,
}

#[event]
pub struct ProtocolPaused {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ProtocolUnpaused {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MultiOracleDisputeResolved {
    pub escrow: Pubkey,
    pub transaction_id: String,
    pub oracle_count: u8,
    pub individual_scores: Vec<u8>,
    pub oracles: Vec<Pubkey>,
    pub consensus_score: u8,
    pub refund_percentage: u8,
    pub refund_amount: u64,
    pub payment_amount: u64,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Verify Ed25519 signature instruction
pub fn verify_ed25519_signature(
    instructions_sysvar: &AccountInfo,
    signature: &[u8; 64],
    verifier_pubkey: &Pubkey,
    message: &[u8],
    instruction_index: u16,
) -> Result<()> {
    let ix = load_instruction_at_checked(instruction_index as usize, instructions_sysvar)
        .map_err(|_| error!(MitamaError::InvalidSignature))?;

    require!(
        ix.program_id == ed25519_program::ID,
        MitamaError::InvalidSignature
    );

    require!(ix.data.len() >= 16, MitamaError::InvalidSignature);
    require!(ix.data[0] == 1, MitamaError::InvalidSignature);

    let sig_offset = u16::from_le_bytes([ix.data[2], ix.data[3]]) as usize;
    let pubkey_offset = u16::from_le_bytes([ix.data[6], ix.data[7]]) as usize;
    let message_offset = u16::from_le_bytes([ix.data[10], ix.data[11]]) as usize;
    let message_size = u16::from_le_bytes([ix.data[12], ix.data[13]]) as usize;

    let ix_signature = &ix.data[sig_offset..sig_offset + 64];
    require!(ix_signature == signature, MitamaError::InvalidSignature);

    let ix_pubkey = &ix.data[pubkey_offset..pubkey_offset + 32];
    require!(ix_pubkey == verifier_pubkey.as_ref(), MitamaError::InvalidSignature);

    let ix_message = &ix.data[message_offset..message_offset + message_size];
    require!(ix_message == message, MitamaError::InvalidSignature);

    Ok(())
}

/// Calculate weighted consensus score from oracle submissions
/// Uses weighted average for scores within deviation threshold of median
fn calculate_weighted_consensus(
    scores: &[(u8, u16)], // (score, weight) pairs
    max_deviation: u8,
) -> Result<u8> {
    require!(scores.len() >= 2, MitamaError::InsufficientOracleConsensus);

    // Extract just scores for median calculation
    let mut sorted_scores: Vec<u8> = scores.iter().map(|(s, _)| *s).collect();
    sorted_scores.sort_unstable();

    let median = sorted_scores[sorted_scores.len() / 2];

    // Filter scores within deviation threshold and calculate weighted average
    let mut weighted_sum: u64 = 0;
    let mut total_weight: u64 = 0;

    for (score, weight) in scores {
        let diff = (*score).abs_diff(median);
        if diff <= max_deviation {
            weighted_sum += (*score as u64) * (*weight as u64);
            total_weight += *weight as u64;
        }
    }

    require!(total_weight > 0, MitamaError::NoConsensusReached);
    Ok((weighted_sum / total_weight) as u8)
}

/// Simple consensus without weights (backwards compatible)
fn calculate_consensus_score(scores: &[u8], max_deviation: u8) -> Result<u8> {
    let weighted: Vec<(u8, u16)> = scores.iter().map(|s| (*s, 1)).collect();
    calculate_weighted_consensus(&weighted, max_deviation)
}

/// Calculate refund percentage based on quality score
fn calculate_refund_from_quality(quality_score: u8) -> u8 {
    match quality_score {
        0..=49 => 100,
        50..=64 => 75,
        65..=79 => 35,
        80..=100 => 0,
        _ => 0,
    }
}

fn calculate_dispute_cost(reputation: &EntityReputation) -> u64 {
    if reputation.total_transactions == 0 {
        return BASE_DISPUTE_COST;
    }
    let dispute_rate = (reputation.disputes_filed * 100) / reputation.total_transactions;
    let multiplier = match dispute_rate {
        0..=20 => 1,
        21..=40 => 2,
        41..=60 => 5,
        _ => 10,
    };
    BASE_DISPUTE_COST.saturating_mul(multiplier)
}

fn calculate_reputation_score(reputation: &EntityReputation) -> u16 {
    if reputation.total_transactions == 0 {
        return 500;
    }
    let tx_score = reputation.total_transactions.min(100) as u16 * 5;
    let dispute_score = if reputation.disputes_filed > 0 {
        let win_rate = (reputation.disputes_won * 100) / reputation.disputes_filed;
        (win_rate as u16 * 3).min(300)
    } else {
        150
    };
    let quality_score = (reputation.average_quality_received as u16 * 2).min(200);
    (tx_score + dispute_score + quality_score).min(1000)
}

/// Get rate limits based on verification level
/// Reserved for future rate limiting implementation
#[allow(dead_code)]
fn get_rate_limits(verification: VerificationLevel) -> (u16, u16, u16) {
    match verification {
        VerificationLevel::Basic => (1, 10, 3),
        VerificationLevel::Staked => (10, 100, 10),
        VerificationLevel::Social => (50, 500, 50),
        VerificationLevel::KYC => (1000, 10000, 1000),
    }
}

/// Update agent reputation after dispute resolution
/// Reserved for enhanced reputation tracking
#[allow(dead_code)]
fn update_agent_reputation(
    reputation: &mut EntityReputation,
    quality_score: u8,
    refund_percentage: u8,
) -> Result<()> {
    let clock = Clock::get()?;
    reputation.total_transactions = reputation.total_transactions.saturating_add(1);

    let total_quality = (reputation.average_quality_received as u64)
        .saturating_mul(reputation.total_transactions.saturating_sub(1))
        .saturating_add(quality_score as u64);
    reputation.average_quality_received =
        (total_quality / reputation.total_transactions) as u8;

    if refund_percentage >= 75 {
        reputation.disputes_won = reputation.disputes_won.saturating_add(1);
    } else if refund_percentage >= 25 {
        reputation.disputes_partial = reputation.disputes_partial.saturating_add(1);
    } else {
        reputation.disputes_lost = reputation.disputes_lost.saturating_add(1);
    }

    reputation.last_updated = clock.unix_timestamp;
    Ok(())
}

/// Update API/provider reputation after dispute resolution
/// Reserved for enhanced reputation tracking
#[allow(dead_code)]
fn update_api_reputation(
    reputation: &mut EntityReputation,
    refund_percentage: u8,
) -> Result<()> {
    let clock = Clock::get()?;
    reputation.total_transactions = reputation.total_transactions.saturating_add(1);

    let quality_delivered = 100u8.saturating_sub(refund_percentage);
    let total_quality = (reputation.average_quality_received as u64)
        .saturating_mul(reputation.total_transactions.saturating_sub(1))
        .saturating_add(quality_delivered as u64);
    reputation.average_quality_received =
        (total_quality / reputation.total_transactions) as u8;

    if refund_percentage <= 25 {
        reputation.disputes_won = reputation.disputes_won.saturating_add(1);
    } else if refund_percentage <= 75 {
        reputation.disputes_partial = reputation.disputes_partial.saturating_add(1);
    } else {
        reputation.disputes_lost = reputation.disputes_lost.saturating_add(1);
    }

    reputation.last_updated = clock.unix_timestamp;
    Ok(())
}

// ============================================================================
// Program
// ============================================================================

#[program]
pub mod mitama {
    use super::*;

    // ========================================================================
    // Agent Identity Instructions
    // ========================================================================

    /// Create a new agent identity with PDA
    pub fn create_agent(
        ctx: Context<CreateAgent>,
        name: String,
        agent_type: AgentType,
        stake_amount: u64,
    ) -> Result<()> {
        require!(
            !name.is_empty() && name.len() <= MAX_AGENT_NAME_LENGTH,
            MitamaError::InvalidAgentName
        );
        require!(
            stake_amount >= MIN_STAKE_AMOUNT,
            MitamaError::InsufficientStake
        );

        let clock = Clock::get()?;
        let agent = &mut ctx.accounts.agent;

        agent.owner = ctx.accounts.owner.key();
        agent.name = name.clone();
        agent.agent_type = agent_type;
        agent.reputation = 500; // Start at medium reputation
        agent.stake_amount = stake_amount;
        agent.is_active = true;
        agent.created_at = clock.unix_timestamp;
        agent.last_active = clock.unix_timestamp;
        agent.total_escrows = 0;
        agent.successful_escrows = 0;
        agent.disputed_escrows = 0;
        agent.bump = ctx.bumps.agent;

        // Transfer stake to agent PDA
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.owner.key(),
            &agent.key(),
            stake_amount,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.owner.to_account_info(),
                agent.to_account_info(),
            ],
        )?;

        msg!("Agent created: {} (type: {:?})", name, agent_type);

        emit!(AgentCreated {
            agent_pda: agent.key(),
            owner: agent.owner,
            name,
            agent_type: agent_type as u8,
            stake_amount,
        });

        Ok(())
    }

    /// Deactivate agent and return stake
    /// Note: Agent account is closed and rent returned to owner
    pub fn deactivate_agent(ctx: Context<DeactivateAgent>) -> Result<()> {
        let agent = &mut ctx.accounts.agent;

        require!(
            ctx.accounts.owner.key() == agent.owner,
            MitamaError::Unauthorized
        );
        require!(agent.is_active, MitamaError::AgentNotActive);

        let stake_to_return = agent.stake_amount;
        let agent_pda = agent.key();
        let owner_key = agent.owner;

        // Calculate rent-exempt minimum to preserve account
        let rent = Rent::get()?;
        let min_rent = rent.minimum_balance(agent.to_account_info().data_len());
        let agent_lamports = agent.to_account_info().lamports();

        // Return stake while preserving rent exemption
        let max_returnable = agent_lamports.saturating_sub(min_rent);
        let actual_return = stake_to_return.min(max_returnable);

        // Transfer stake back to owner (preserving rent exemption)
        **agent.to_account_info().try_borrow_mut_lamports()? -= actual_return;
        **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += actual_return;

        agent.is_active = false;
        agent.stake_amount = 0;

        emit!(AgentDeactivated {
            agent_pda,
            owner: owner_key,
            refunded_stake: actual_return,
        });

        Ok(())
    }

    /// Update agent reputation (internal use)
    pub fn update_agent_rep(
        ctx: Context<UpdateAgentRep>,
        delta: i64,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        let old_rep = agent.reputation;

        if delta >= 0 {
            agent.reputation = agent.reputation.saturating_add(delta as u64);
        } else {
            agent.reputation = agent.reputation.saturating_sub((-delta) as u64);
        }

        // Clamp to 0-1000
        agent.reputation = agent.reputation.min(1000);

        let clock = Clock::get()?;
        agent.last_active = clock.unix_timestamp;

        emit!(AgentReputationUpdated {
            agent_pda: agent.key(),
            old_reputation: old_rep,
            new_reputation: agent.reputation,
            delta,
        });

        Ok(())
    }

    // ========================================================================
    // Escrow Instructions
    // ========================================================================

    /// Initialize a new escrow for agent-to-API payment
    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        amount: u64,
        time_lock: i64,
        transaction_id: String,
        use_spl_token: bool,
    ) -> Result<()> {
        // Check protocol is not paused
        require!(
            !ctx.accounts.protocol_config.paused,
            MitamaError::ProtocolPaused
        );

        // Validate amount within allowed range
        require!(
            (MIN_ESCROW_AMOUNT..=MAX_ESCROW_AMOUNT).contains(&amount),
            MitamaError::InvalidAmount
        );
        require!(
            (MIN_TIME_LOCK..=MAX_TIME_LOCK).contains(&time_lock),
            MitamaError::InvalidTimeLock
        );
        require!(
            !transaction_id.is_empty() && transaction_id.len() <= 64,
            MitamaError::InvalidTransactionId
        );

        let clock = Clock::get()?;
        let escrow = &mut ctx.accounts.escrow;

        escrow.agent = ctx.accounts.agent.key();
        escrow.api = ctx.accounts.api.key();
        escrow.amount = amount;
        escrow.status = EscrowStatus::Active;
        escrow.created_at = clock.unix_timestamp;
        escrow.expires_at = clock.unix_timestamp + time_lock;
        escrow.transaction_id = transaction_id.clone();
        escrow.bump = ctx.bumps.escrow;
        escrow.quality_score = None;
        escrow.refund_percentage = None;
        escrow.oracle_submissions = Vec::new();

        if use_spl_token {
            let token_mint = ctx.accounts.token_mint.as_ref()
                .ok_or(MitamaError::MissingTokenMint)?;
            let escrow_token_account = ctx.accounts.escrow_token_account.as_ref()
                .ok_or(MitamaError::MissingTokenAccount)?;
            let agent_token_account = ctx.accounts.agent_token_account.as_ref()
                .ok_or(MitamaError::MissingTokenAccount)?;
            let token_program = ctx.accounts.token_program.as_ref()
                .ok_or(MitamaError::MissingTokenProgram)?;

            require!(
                escrow_token_account.mint == token_mint.key(),
                MitamaError::TokenMintMismatch
            );
            require!(
                agent_token_account.mint == token_mint.key(),
                MitamaError::TokenMintMismatch
            );
            // Validate agent owns the source token account
            require!(
                agent_token_account.owner == ctx.accounts.agent.key(),
                MitamaError::Unauthorized
            );

            escrow.token_mint = Some(token_mint.key());
            escrow.escrow_token_account = Some(escrow_token_account.key());
            escrow.token_decimals = token_mint.decimals;

            let cpi_accounts = SplTransfer {
                from: agent_token_account.to_account_info(),
                to: escrow_token_account.to_account_info(),
                authority: ctx.accounts.agent.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(token_program.to_account_info(), cpi_accounts);
            token::transfer(cpi_ctx, amount)?;

            msg!("SPL Token escrow created: {} tokens", amount);
        } else {
            escrow.token_mint = None;
            escrow.escrow_token_account = None;
            escrow.token_decimals = 9;

            let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.agent.key(),
                &escrow.key(),
                amount,
            );
            anchor_lang::solana_program::program::invoke(
                &transfer_ix,
                &[
                    ctx.accounts.agent.to_account_info(),
                    escrow.to_account_info(),
                ],
            )?;

            msg!("SOL escrow created: {} lamports", amount);
        }

        emit!(EscrowInitialized {
            escrow: escrow.key(),
            agent: escrow.agent,
            api: escrow.api,
            amount: escrow.amount,
            expires_at: escrow.expires_at,
            transaction_id,
            is_token: use_spl_token,
            token_mint: escrow.token_mint,
        });

        Ok(())
    }

    /// Release funds to API (happy path)
    /// Only the agent can release early, API can release after timelock expires
    pub fn release_funds(ctx: Context<ReleaseFunds>) -> Result<()> {
        let clock = Clock::get()?;

        let (status, agent_key, api_key, expires_at, transfer_amount, transaction_id, bump, token_mint) = {
            let escrow = &ctx.accounts.escrow;
            (
                escrow.status,
                escrow.agent,
                escrow.api,
                escrow.expires_at,
                escrow.amount,
                escrow.transaction_id.clone(),
                escrow.bump,
                escrow.token_mint,
            )
        };

        require!(status == EscrowStatus::Active, MitamaError::InvalidStatus);

        let caller_key = ctx.accounts.caller.key();
        let is_agent = caller_key == agent_key;
        let is_api = caller_key == api_key;
        let time_lock_expired = clock.unix_timestamp >= expires_at;

        // Only agent can release before timelock, agent or API can release after
        require!(
            is_agent || (is_api && time_lock_expired),
            MitamaError::Unauthorized
        );

        let seeds = &[b"escrow".as_ref(), agent_key.as_ref(), transaction_id.as_bytes(), &[bump]];
        let signer = &[&seeds[..]];

        if token_mint.is_some() {
            let escrow_token_account = ctx.accounts.escrow_token_account.as_ref()
                .ok_or(MitamaError::MissingTokenAccount)?;
            let api_token_account = ctx.accounts.api_token_account.as_ref()
                .ok_or(MitamaError::MissingTokenAccount)?;
            let token_program = ctx.accounts.token_program.as_ref()
                .ok_or(MitamaError::MissingTokenProgram)?;

            let cpi_accounts = SplTransfer {
                from: escrow_token_account.to_account_info(),
                to: api_token_account.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(
                token_program.to_account_info(),
                cpi_accounts,
                signer,
            );
            token::transfer(cpi_ctx, transfer_amount)?;
        } else {
            let cpi_context = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.api.to_account_info(),
                },
                signer,
            );
            anchor_lang::system_program::transfer(cpi_context, transfer_amount)?;
        }

        let escrow = &mut ctx.accounts.escrow;
        escrow.status = EscrowStatus::Released;

        emit!(FundsReleased {
            escrow: escrow.key(),
            transaction_id: escrow.transaction_id.clone(),
            amount: escrow.amount,
            api: escrow.api,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Mark escrow as disputed
    pub fn mark_disputed(ctx: Context<MarkDisputed>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let reputation = &mut ctx.accounts.reputation;

        require!(escrow.status == EscrowStatus::Active, MitamaError::InvalidStatus);
        require!(ctx.accounts.agent.key() == escrow.agent, MitamaError::Unauthorized);

        let clock = Clock::get()?;
        require!(clock.unix_timestamp < escrow.expires_at, MitamaError::DisputeWindowExpired);

        let dispute_cost = calculate_dispute_cost(reputation);
        require!(
            ctx.accounts.agent.lamports() >= dispute_cost,
            MitamaError::InsufficientDisputeFunds
        );

        reputation.disputes_filed = reputation.disputes_filed.saturating_add(1);
        escrow.status = EscrowStatus::Disputed;

        emit!(DisputeMarked {
            escrow: escrow.key(),
            agent: escrow.agent,
            transaction_id: escrow.transaction_id.clone(),
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Resolve dispute with verifier oracle signature
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        quality_score: u8,
        refund_percentage: u8,
        signature: [u8; 64],
    ) -> Result<()> {
        // Extract values we need before mutating
        let (status, transaction_id, amount, escrow_key) = {
            let escrow = &ctx.accounts.escrow;
            (
                escrow.status,
                escrow.transaction_id.clone(),
                escrow.amount,
                escrow.key(),
            )
        };

        require!(
            status == EscrowStatus::Active || status == EscrowStatus::Disputed,
            MitamaError::InvalidStatus
        );
        require!(quality_score <= 100, MitamaError::InvalidQualityScore);
        require!(refund_percentage <= 100, MitamaError::InvalidRefundPercentage);

        let message = format!("{}:{}", transaction_id, quality_score);
        verify_ed25519_signature(
            &ctx.accounts.instructions_sysvar,
            &signature,
            ctx.accounts.verifier.key,
            message.as_bytes(),
            0,
        )?;

        let refund_amount = (amount as u128)
            .checked_mul(refund_percentage as u128)
            .ok_or(MitamaError::ArithmeticOverflow)?
            .checked_div(100)
            .ok_or(MitamaError::ArithmeticOverflow)? as u64;
        let payment_amount = amount.saturating_sub(refund_amount);

        // Transfer funds using account info directly
        if refund_amount > 0 {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= refund_amount;
            **ctx.accounts.agent.to_account_info().try_borrow_mut_lamports()? += refund_amount;
        }

        if payment_amount > 0 {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= payment_amount;
            **ctx.accounts.api.to_account_info().try_borrow_mut_lamports()? += payment_amount;
        }

        // Now we can mutate the escrow account state
        let escrow = &mut ctx.accounts.escrow;
        escrow.status = EscrowStatus::Resolved;
        escrow.quality_score = Some(quality_score);
        escrow.refund_percentage = Some(refund_percentage);

        // Update reputations
        let clock = Clock::get()?;
        let agent_reputation = &mut ctx.accounts.agent_reputation;
        agent_reputation.total_transactions = agent_reputation.total_transactions.saturating_add(1);
        agent_reputation.reputation_score = calculate_reputation_score(agent_reputation);
        agent_reputation.last_updated = clock.unix_timestamp;

        let api_reputation = &mut ctx.accounts.api_reputation;
        api_reputation.total_transactions = api_reputation.total_transactions.saturating_add(1);
        api_reputation.reputation_score = calculate_reputation_score(api_reputation);
        api_reputation.last_updated = clock.unix_timestamp;

        emit!(DisputeResolved {
            escrow: escrow_key,
            transaction_id,
            quality_score,
            refund_percentage,
            refund_amount,
            payment_amount,
            verifier: ctx.accounts.verifier.key(),
        });

        Ok(())
    }

    // ========================================================================
    // Oracle Registry Instructions
    // ========================================================================

    /// Initialize the oracle registry
    pub fn initialize_oracle_registry(
        ctx: Context<InitializeOracleRegistry>,
        min_consensus: u8,
        max_score_deviation: u8,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.oracle_registry;

        require!(min_consensus >= MIN_CONSENSUS_ORACLES, MitamaError::InsufficientOracleConsensus);
        require!(max_score_deviation <= 50, MitamaError::InvalidQualityScore);

        let clock = Clock::get()?;

        registry.admin = ctx.accounts.admin.key();
        registry.oracles = Vec::new();
        registry.min_consensus = min_consensus;
        registry.max_score_deviation = max_score_deviation;
        registry.created_at = clock.unix_timestamp;
        registry.updated_at = clock.unix_timestamp;
        registry.bump = ctx.bumps.oracle_registry;

        emit!(OracleRegistryInitialized {
            registry: registry.key(),
            admin: registry.admin,
            min_consensus,
            max_score_deviation,
        });

        Ok(())
    }

    /// Add an oracle to the registry
    pub fn add_oracle(
        ctx: Context<ManageOracle>,
        oracle_pubkey: Pubkey,
        oracle_type: OracleType,
        weight: u16,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.oracle_registry;

        require!(ctx.accounts.admin.key() == registry.admin, MitamaError::Unauthorized);
        require!(registry.oracles.len() < MAX_ORACLES, MitamaError::MaxOraclesReached);
        require!(weight > 0, MitamaError::InvalidOracleWeight);
        require!(
            !registry.oracles.iter().any(|o| o.pubkey == oracle_pubkey),
            MitamaError::DuplicateOracleSubmission
        );

        registry.oracles.push(OracleConfig {
            pubkey: oracle_pubkey,
            oracle_type,
            weight,
        });

        let clock = Clock::get()?;
        registry.updated_at = clock.unix_timestamp;

        emit!(OracleAdded {
            registry: registry.key(),
            oracle: oracle_pubkey,
            oracle_type_index: match oracle_type {
                OracleType::Ed25519 => 0,
                OracleType::Switchboard => 1,
                OracleType::Custom => 2,
            },
            weight,
        });

        Ok(())
    }

    /// Remove an oracle from the registry
    pub fn remove_oracle(
        ctx: Context<ManageOracle>,
        oracle_pubkey: Pubkey,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.oracle_registry;

        require!(ctx.accounts.admin.key() == registry.admin, MitamaError::Unauthorized);

        let initial_len = registry.oracles.len();
        registry.oracles.retain(|o| o.pubkey != oracle_pubkey);

        require!(registry.oracles.len() < initial_len, MitamaError::OracleNotFound);

        let clock = Clock::get()?;
        registry.updated_at = clock.unix_timestamp;

        emit!(OracleRemoved {
            registry: registry.key(),
            oracle: oracle_pubkey,
        });

        Ok(())
    }

    /// Transfer admin rights to a new admin
    pub fn transfer_admin(
        ctx: Context<TransferAdmin>,
        new_admin: Pubkey,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.oracle_registry;
        let old_admin = registry.admin;

        require!(ctx.accounts.admin.key() == registry.admin, MitamaError::Unauthorized);
        require!(new_admin != Pubkey::default(), MitamaError::InvalidAmount); // Reuse error for invalid input

        registry.admin = new_admin;

        let clock = Clock::get()?;
        registry.updated_at = clock.unix_timestamp;

        emit!(AdminTransferred {
            registry: registry.key(),
            old_admin,
            new_admin,
        });

        Ok(())
    }

    // ========================================================================
    // Reputation Instructions
    // ========================================================================

    /// Initialize entity reputation
    pub fn init_reputation(ctx: Context<InitReputation>) -> Result<()> {
        let reputation = &mut ctx.accounts.reputation;
        let clock = Clock::get()?;

        reputation.entity = ctx.accounts.entity.key();
        reputation.entity_type = EntityType::Agent;
        reputation.total_transactions = 0;
        reputation.disputes_filed = 0;
        reputation.disputes_won = 0;
        reputation.disputes_partial = 0;
        reputation.disputes_lost = 0;
        reputation.average_quality_received = 0;
        reputation.reputation_score = 500;
        reputation.created_at = clock.unix_timestamp;
        reputation.last_updated = clock.unix_timestamp;
        reputation.bump = ctx.bumps.reputation;

        Ok(())
    }

    // ========================================================================
    // Protocol Management Instructions
    // ========================================================================

    /// Initialize protocol configuration with multi-sig (one-time setup)
    /// Requires 3 distinct authority addresses for 2-of-3 multi-sig
    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        secondary_signer: Pubkey,
        tertiary_signer: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.protocol_config;
        let clock = Clock::get()?;

        // Ensure all three signers are distinct
        let primary = ctx.accounts.authority.key();
        require!(
            primary != secondary_signer
                && primary != tertiary_signer
                && secondary_signer != tertiary_signer,
            MitamaError::DuplicateMultiSigSigner
        );
        require!(
            secondary_signer != Pubkey::default() && tertiary_signer != Pubkey::default(),
            MitamaError::InvalidAuthority
        );

        config.authority = primary;
        config.secondary_signer = secondary_signer;
        config.tertiary_signer = tertiary_signer;
        config.required_signatures = 2; // 2-of-3 multi-sig
        config.paused = false;
        config.version = PROTOCOL_VERSION;
        config.total_escrows_created = 0;
        config.total_volume_locked = 0;
        config.created_at = clock.unix_timestamp;
        config.updated_at = clock.unix_timestamp;
        config.bump = ctx.bumps.protocol_config;

        emit!(ProtocolConfigInitialized {
            config: config.key(),
            authority: config.authority,
            version: config.version,
        });

        Ok(())
    }

    /// Pause protocol - emergency stop for all escrow operations
    /// Requires 2-of-3 multi-sig authorization
    pub fn pause_protocol(ctx: Context<ManageProtocol>) -> Result<()> {
        let config = &mut ctx.accounts.protocol_config;
        require!(!config.paused, MitamaError::ProtocolAlreadyPaused);

        // Validate 2-of-3 multi-sig: both signers must be from the authority set
        let signer_one = ctx.accounts.signer_one.key();
        let signer_two = ctx.accounts.signer_two.key();
        require!(signer_one != signer_two, MitamaError::DuplicateMultiSigSigner);

        let valid_signers = [config.authority, config.secondary_signer, config.tertiary_signer];
        require!(
            valid_signers.contains(&signer_one) && valid_signers.contains(&signer_two),
            MitamaError::InvalidMultiSigSigner
        );

        let clock = Clock::get()?;
        config.paused = true;
        config.updated_at = clock.unix_timestamp;

        emit!(ProtocolPaused {
            config: config.key(),
            authority: signer_one,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Unpause protocol - resume normal operations
    /// Requires 2-of-3 multi-sig authorization
    pub fn unpause_protocol(ctx: Context<ManageProtocol>) -> Result<()> {
        let config = &mut ctx.accounts.protocol_config;
        require!(config.paused, MitamaError::ProtocolNotPaused);

        // Validate 2-of-3 multi-sig
        let signer_one = ctx.accounts.signer_one.key();
        let signer_two = ctx.accounts.signer_two.key();
        require!(signer_one != signer_two, MitamaError::DuplicateMultiSigSigner);

        let valid_signers = [config.authority, config.secondary_signer, config.tertiary_signer];
        require!(
            valid_signers.contains(&signer_one) && valid_signers.contains(&signer_two),
            MitamaError::InvalidMultiSigSigner
        );

        let clock = Clock::get()?;
        config.paused = false;
        config.updated_at = clock.unix_timestamp;

        emit!(ProtocolUnpaused {
            config: config.key(),
            authority: signer_one,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Transfer protocol authority (replace one of the multi-sig signers)
    /// Requires 2-of-3 multi-sig authorization
    pub fn transfer_protocol_authority(
        ctx: Context<ManageProtocol>,
        signer_to_replace: Pubkey,
        new_signer: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.protocol_config;
        require!(new_signer != Pubkey::default(), MitamaError::InvalidAuthority);

        // Validate 2-of-3 multi-sig
        let signer_one = ctx.accounts.signer_one.key();
        let signer_two = ctx.accounts.signer_two.key();
        require!(signer_one != signer_two, MitamaError::DuplicateMultiSigSigner);

        let valid_signers = [config.authority, config.secondary_signer, config.tertiary_signer];
        require!(
            valid_signers.contains(&signer_one) && valid_signers.contains(&signer_two),
            MitamaError::InvalidMultiSigSigner
        );

        // Ensure new signer is not already in the set
        require!(!valid_signers.contains(&new_signer), MitamaError::DuplicateMultiSigSigner);

        // Replace the specified signer
        let clock = Clock::get()?;
        if signer_to_replace == config.authority {
            config.authority = new_signer;
        } else if signer_to_replace == config.secondary_signer {
            config.secondary_signer = new_signer;
        } else if signer_to_replace == config.tertiary_signer {
            config.tertiary_signer = new_signer;
        } else {
            return Err(MitamaError::InvalidAuthority.into());
        }

        config.updated_at = clock.unix_timestamp;

        Ok(())
    }

    // ========================================================================
    // Multi-Oracle Dispute Resolution Instructions
    // ========================================================================

    /// Submit oracle quality score for dispute resolution
    /// Multiple oracles can submit scores, consensus is calculated on finalization
    pub fn submit_oracle_score(
        ctx: Context<SubmitOracleScore>,
        quality_score: u8,
        signature: [u8; 64],
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let oracle_registry = &ctx.accounts.oracle_registry;

        require!(
            escrow.status == EscrowStatus::Disputed,
            MitamaError::InvalidStatus
        );
        require!(quality_score <= 100, MitamaError::InvalidQualityScore);

        // Verify oracle is registered
        let oracle_key = ctx.accounts.oracle.key();
        require!(
            oracle_registry.oracles.iter().any(|o| o.pubkey == oracle_key),
            MitamaError::UnregisteredOracle
        );

        // Verify signature
        let message = format!("{}:{}", escrow.transaction_id, quality_score);
        verify_ed25519_signature(
            &ctx.accounts.instructions_sysvar,
            &signature,
            &oracle_key,
            message.as_bytes(),
            0,
        )?;

        // Check for duplicate submission
        require!(
            !escrow.oracle_submissions.iter().any(|s| s.oracle == oracle_key),
            MitamaError::DuplicateOracleSubmission
        );

        // Add submission
        let clock = Clock::get()?;
        escrow.oracle_submissions.push(OracleSubmission {
            oracle: oracle_key,
            quality_score,
            submitted_at: clock.unix_timestamp,
        });

        msg!(
            "Oracle {} submitted score {} for escrow {}",
            oracle_key,
            quality_score,
            escrow.key()
        );

        Ok(())
    }

    /// Finalize multi-oracle dispute resolution
    /// Calculates consensus from submitted oracle scores and distributes funds
    pub fn finalize_multi_oracle_dispute(ctx: Context<FinalizeMultiOracleDispute>) -> Result<()> {
        let oracle_registry = &ctx.accounts.oracle_registry;

        // Extract values needed for calculations
        let (status, amount, transaction_id, escrow_key, individual_scores, oracles, weighted_scores) = {
            let escrow = &ctx.accounts.escrow;
            let individual_scores: Vec<u8> = escrow.oracle_submissions.iter().map(|s| s.quality_score).collect();
            let oracles: Vec<Pubkey> = escrow.oracle_submissions.iter().map(|s| s.oracle).collect();
            let weighted_scores: Vec<(u8, u16)> = escrow
                .oracle_submissions
                .iter()
                .filter_map(|submission| {
                    oracle_registry
                        .oracles
                        .iter()
                        .find(|o| o.pubkey == submission.oracle)
                        .map(|o| (submission.quality_score, o.weight))
                })
                .collect();
            (
                escrow.status,
                escrow.amount,
                escrow.transaction_id.clone(),
                escrow.key(),
                individual_scores,
                oracles,
                weighted_scores,
            )
        };

        require!(status == EscrowStatus::Disputed, MitamaError::InvalidStatus);
        require!(
            oracles.len() >= oracle_registry.min_consensus as usize,
            MitamaError::InsufficientOracleConsensus
        );

        // Calculate consensus
        let consensus_score = calculate_weighted_consensus(
            &weighted_scores,
            oracle_registry.max_score_deviation,
        )?;

        // Calculate refund based on quality
        let refund_percentage = calculate_refund_from_quality(consensus_score);

        let refund_amount = (amount as u128)
            .checked_mul(refund_percentage as u128)
            .ok_or(MitamaError::ArithmeticOverflow)?
            .checked_div(100)
            .ok_or(MitamaError::ArithmeticOverflow)? as u64;
        let payment_amount = amount.saturating_sub(refund_amount);

        // Transfer funds
        if refund_amount > 0 {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= refund_amount;
            **ctx.accounts.agent.to_account_info().try_borrow_mut_lamports()? += refund_amount;
        }

        if payment_amount > 0 {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= payment_amount;
            **ctx.accounts.api.to_account_info().try_borrow_mut_lamports()? += payment_amount;
        }

        // Update escrow state
        let escrow = &mut ctx.accounts.escrow;
        escrow.status = EscrowStatus::Resolved;
        escrow.quality_score = Some(consensus_score);
        escrow.refund_percentage = Some(refund_percentage);

        emit!(MultiOracleDisputeResolved {
            escrow: escrow_key,
            transaction_id,
            oracle_count: oracles.len() as u8,
            individual_scores,
            oracles,
            consensus_score,
            refund_percentage,
            refund_amount,
            payment_amount,
        });

        Ok(())
    }
}

// ============================================================================
// Account Structs
// ============================================================================

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateAgent<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + AgentIdentity::INIT_SPACE,
        seeds = [b"agent", owner.key().as_ref()],
        bump
    )]
    pub agent: Account<'info, AgentIdentity>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeactivateAgent<'info> {
    #[account(
        mut,
        seeds = [b"agent", owner.key().as_ref()],
        bump = agent.bump
    )]
    pub agent: Account<'info, AgentIdentity>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateAgentRep<'info> {
    #[account(
        mut,
        seeds = [b"agent", agent.owner.as_ref()],
        bump = agent.bump
    )]
    pub agent: Account<'info, AgentIdentity>,

    /// Oracle registry to validate authorized oracles
    #[account(
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    /// Authority must be the agent owner OR a registered oracle
    #[account(
        constraint = authority.key() == agent.owner
            || oracle_registry.oracles.iter().any(|o| o.pubkey == authority.key())
            @ MitamaError::Unauthorized
    )]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(amount: u64, time_lock: i64, transaction_id: String)]
pub struct InitializeEscrow<'info> {
    /// Protocol config for pause check
    #[account(
        seeds = [b"protocol_config"],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        init,
        payer = agent,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", agent.key().as_ref(), transaction_id.as_bytes()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub agent: Signer<'info>,

    /// CHECK: API wallet address
    pub api: AccountInfo<'info>,

    pub system_program: Program<'info, System>,

    pub token_mint: Option<Account<'info, Mint>>,

    #[account(mut)]
    pub escrow_token_account: Option<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub agent_token_account: Option<Account<'info, TokenAccount>>,

    pub token_program: Option<Program<'info, Token>>,
    pub associated_token_program: Option<Program<'info, AssociatedToken>>,
}

#[derive(Accounts)]
pub struct ReleaseFunds<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.agent.as_ref(), escrow.transaction_id.as_bytes()],
        bump = escrow.bump,
        constraint = api.key() == escrow.api @ MitamaError::Unauthorized
    )]
    pub escrow: Account<'info, Escrow>,

    /// Must be the escrow agent or API (after timelock)
    #[account(mut)]
    pub caller: Signer<'info>,

    /// CHECK: API wallet address - validated in instruction
    #[account(mut)]
    pub api: AccountInfo<'info>,

    pub system_program: Program<'info, System>,

    #[account(mut)]
    pub escrow_token_account: Option<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub api_token_account: Option<Account<'info, TokenAccount>>,

    pub token_program: Option<Program<'info, Token>>,
}

#[derive(Accounts)]
pub struct MarkDisputed<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.agent.as_ref(), escrow.transaction_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        seeds = [b"reputation", agent.key().as_ref()],
        bump = reputation.bump
    )]
    pub reputation: Account<'info, EntityReputation>,

    #[account(mut)]
    pub agent: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.agent.as_ref(), escrow.transaction_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub agent: SystemAccount<'info>,

    /// CHECK: API wallet address
    #[account(mut)]
    pub api: AccountInfo<'info>,

    /// Oracle registry to validate the verifier is registered
    #[account(
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump,
        constraint = oracle_registry.oracles.iter().any(|o| o.pubkey == verifier.key())
            @ MitamaError::UnregisteredOracle
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    /// CHECK: Verifier oracle public key - must be registered in oracle_registry
    pub verifier: AccountInfo<'info>,

    /// CHECK: Instructions sysvar
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"reputation", agent.key().as_ref()],
        bump = agent_reputation.bump
    )]
    pub agent_reputation: Account<'info, EntityReputation>,

    #[account(
        mut,
        seeds = [b"reputation", api.key().as_ref()],
        bump = api_reputation.bump
    )]
    pub api_reputation: Account<'info, EntityReputation>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeOracleRegistry<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + OracleRegistry::INIT_SPACE,
        seeds = [b"oracle_registry"],
        bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageOracle<'info> {
    #[account(
        mut,
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    #[account(
        mut,
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump,
        constraint = oracle_registry.admin == admin.key() @ MitamaError::Unauthorized
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [b"protocol_config"],
        bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageProtocol<'info> {
    #[account(
        mut,
        seeds = [b"protocol_config"],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    /// Primary signer (must be one of the multi-sig authorities)
    pub signer_one: Signer<'info>,

    /// Secondary signer (must be one of the multi-sig authorities)
    pub signer_two: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitReputation<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + EntityReputation::INIT_SPACE,
        seeds = [b"reputation", entity.key().as_ref()],
        bump
    )]
    pub reputation: Account<'info, EntityReputation>,

    /// CHECK: Entity being tracked
    pub entity: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitOracleScore<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.agent.as_ref(), escrow.transaction_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    /// Oracle submitting the score (must be registered)
    pub oracle: Signer<'info>,

    /// CHECK: Instructions sysvar for signature verification
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions_sysvar: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct FinalizeMultiOracleDispute<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.agent.as_ref(), escrow.transaction_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    /// CHECK: Agent wallet to receive refund
    #[account(mut)]
    pub agent: AccountInfo<'info>,

    /// CHECK: API wallet to receive payment
    #[account(mut)]
    pub api: AccountInfo<'info>,

    /// Anyone can call finalize once enough oracles have submitted
    pub caller: Signer<'info>,
}

// ============================================================================
// State
// ============================================================================

/// Agent Identity - PDA-based agent with staking
#[account]
#[derive(InitSpace)]
pub struct AgentIdentity {
    pub owner: Pubkey,                    // 32
    #[max_len(32)]
    pub name: String,                     // 4 + 32
    pub agent_type: AgentType,            // 1 + 1
    pub reputation: u64,                  // 8
    pub stake_amount: u64,                // 8
    pub is_active: bool,                  // 1
    pub created_at: i64,                  // 8
    pub last_active: i64,                 // 8
    pub total_escrows: u64,               // 8
    pub successful_escrows: u64,          // 8
    pub disputed_escrows: u64,            // 8
    pub bump: u8,                         // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum AgentType {
    Trading,
    Service,
    Oracle,
    Custom,
}

/// Protocol Configuration - global settings and emergency controls
/// Uses 2-of-3 multi-sig for critical operations (pause/unpause)
#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    /// Primary authority (can propose actions)
    pub authority: Pubkey,
    /// Secondary signer for multi-sig (required for pause/unpause)
    pub secondary_signer: Pubkey,
    /// Tertiary signer for multi-sig (required for pause/unpause)
    pub tertiary_signer: Pubkey,
    /// Number of required signatures for critical operations (default: 2)
    pub required_signatures: u8,
    pub paused: bool,
    pub version: u8,
    pub total_escrows_created: u64,
    pub total_volume_locked: u64,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

/// Oracle Registry
#[account]
#[derive(InitSpace)]
pub struct OracleRegistry {
    pub admin: Pubkey,
    #[max_len(5)]
    pub oracles: Vec<OracleConfig>,
    pub min_consensus: u8,
    pub max_score_deviation: u8,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct OracleConfig {
    pub pubkey: Pubkey,
    pub oracle_type: OracleType,
    pub weight: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OracleType {
    Ed25519,
    Switchboard,
    Custom,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct OracleSubmission {
    pub oracle: Pubkey,
    pub quality_score: u8,
    pub submitted_at: i64,
}

/// Escrow Account
#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub agent: Pubkey,
    pub api: Pubkey,
    pub amount: u64,
    pub status: EscrowStatus,
    pub created_at: i64,
    pub expires_at: i64,
    #[max_len(64)]
    pub transaction_id: String,
    pub bump: u8,
    pub quality_score: Option<u8>,
    pub refund_percentage: Option<u8>,
    #[max_len(5)]
    pub oracle_submissions: Vec<OracleSubmission>,
    pub token_mint: Option<Pubkey>,
    pub escrow_token_account: Option<Pubkey>,
    pub token_decimals: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Active,
    Released,
    Disputed,
    Resolved,
}

/// Entity Reputation
#[account]
#[derive(InitSpace)]
pub struct EntityReputation {
    pub entity: Pubkey,
    pub entity_type: EntityType,
    pub total_transactions: u64,
    pub disputes_filed: u64,
    pub disputes_won: u64,
    pub disputes_partial: u64,
    pub disputes_lost: u64,
    pub average_quality_received: u8,
    pub reputation_score: u16,
    pub created_at: i64,
    pub last_updated: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum EntityType {
    Agent,
    Provider,
}

/// Verification levels for rate limiting
/// Reserved for future implementation
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
#[allow(dead_code)]
pub enum VerificationLevel {
    Basic,
    Staked,
    Social,
    KYC,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum MitamaError {
    #[msg("Invalid escrow status for this operation")]
    InvalidStatus,

    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Invalid quality score (must be 0-100)")]
    InvalidQualityScore,

    #[msg("Invalid refund percentage (must be 0-100)")]
    InvalidRefundPercentage,

    #[msg("Invalid verifier signature")]
    InvalidSignature,

    #[msg("Invalid time lock: must be between 1 hour and 30 days")]
    InvalidTimeLock,

    #[msg("Invalid amount: must be greater than 0")]
    InvalidAmount,

    #[msg("Invalid transaction ID")]
    InvalidTransactionId,

    #[msg("Time lock not expired")]
    TimeLockNotExpired,

    #[msg("Dispute window expired")]
    DisputeWindowExpired,

    #[msg("Insufficient funds for dispute")]
    InsufficientDisputeFunds,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Insufficient oracle consensus")]
    InsufficientOracleConsensus,

    #[msg("Oracle not registered")]
    UnregisteredOracle,

    #[msg("No consensus reached")]
    NoConsensusReached,

    #[msg("Duplicate oracle submission")]
    DuplicateOracleSubmission,

    #[msg("Maximum oracles reached")]
    MaxOraclesReached,

    #[msg("Oracle not found")]
    OracleNotFound,

    #[msg("Invalid oracle weight")]
    InvalidOracleWeight,

    #[msg("Missing token mint")]
    MissingTokenMint,

    #[msg("Missing token account")]
    MissingTokenAccount,

    #[msg("Missing token program")]
    MissingTokenProgram,

    #[msg("Token mint mismatch")]
    TokenMintMismatch,

    #[msg("Invalid agent name")]
    InvalidAgentName,

    #[msg("Insufficient stake amount")]
    InsufficientStake,

    #[msg("Agent not active")]
    AgentNotActive,

    #[msg("Protocol is paused")]
    ProtocolPaused,

    #[msg("Protocol is already paused")]
    ProtocolAlreadyPaused,

    #[msg("Protocol is not paused")]
    ProtocolNotPaused,

    #[msg("Invalid authority address")]
    InvalidAuthority,

    #[msg("Duplicate multi-sig signer")]
    DuplicateMultiSigSigner,

    #[msg("Invalid multi-sig signer")]
    InvalidMultiSigSigner,
}
