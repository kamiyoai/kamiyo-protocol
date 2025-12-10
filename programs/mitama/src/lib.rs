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
    sysvar::instructions::{load_instruction_at_checked, ID as INSTRUCTIONS_ID},
};
use switchboard_on_demand::on_demand::accounts::pull_feed::PullFeedAccountData;
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
const MAX_SCORE_DEVIATION: u8 = 15;

// Agent constants
const MIN_STAKE_AMOUNT: u64 = 100_000_000;          // 0.1 SOL minimum stake
const MAX_AGENT_NAME_LENGTH: usize = 32;

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

fn calculate_consensus_score(scores: &[u8], max_deviation: u8) -> Result<u8> {
    require!(scores.len() >= 2, MitamaError::InsufficientOracleConsensus);

    let mut sorted = scores.to_vec();
    sorted.sort_unstable();

    if scores.len() == 2 {
        let avg = (sorted[0] as u16 + sorted[1] as u16) / 2;
        return Ok(avg as u8);
    }

    let median = sorted[sorted.len() / 2];

    let valid_scores: Vec<u8> = sorted.iter()
        .filter(|&&score| {
            let diff = if score > median { score - median } else { median - score };
            diff <= max_deviation
        })
        .copied()
        .collect();

    require!(valid_scores.len() >= 2, MitamaError::NoConsensusReached);
    Ok(valid_scores[valid_scores.len() / 2])
}

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

fn get_rate_limits(verification: VerificationLevel) -> (u16, u16, u16) {
    match verification {
        VerificationLevel::Basic => (1, 10, 3),
        VerificationLevel::Staked => (10, 100, 10),
        VerificationLevel::Social => (50, 500, 50),
        VerificationLevel::KYC => (1000, 10000, 1000),
    }
}

fn update_agent_reputation(
    reputation: &mut EntityReputation,
    quality_score: u8,
    refund_percentage: u8,
) -> Result<()> {
    let clock = Clock::get()?;
    reputation.total_transactions = reputation.total_transactions.saturating_add(1);

    let total_quality = (reputation.average_quality_received as u64)
        .saturating_mul(reputation.total_transactions.saturating_sub(1) as u64)
        .saturating_add(quality_score as u64);
    reputation.average_quality_received =
        (total_quality / reputation.total_transactions as u64) as u8;

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

fn update_api_reputation(
    reputation: &mut EntityReputation,
    refund_percentage: u8,
) -> Result<()> {
    let clock = Clock::get()?;
    reputation.total_transactions = reputation.total_transactions.saturating_add(1);

    let quality_delivered = 100u8.saturating_sub(refund_percentage);
    let total_quality = (reputation.average_quality_received as u64)
        .saturating_mul(reputation.total_transactions.saturating_sub(1) as u64)
        .saturating_add(quality_delivered as u64);
    reputation.average_quality_received =
        (total_quality / reputation.total_transactions as u64) as u8;

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
    pub fn deactivate_agent(ctx: Context<DeactivateAgent>) -> Result<()> {
        let agent = &mut ctx.accounts.agent;

        require!(
            ctx.accounts.owner.key() == agent.owner,
            MitamaError::Unauthorized
        );
        require!(agent.is_active, MitamaError::AgentNotActive);

        let stake_to_return = agent.stake_amount;

        // Transfer stake back to owner
        **agent.to_account_info().try_borrow_mut_lamports()? -= stake_to_return;
        **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += stake_to_return;

        agent.is_active = false;
        agent.stake_amount = 0;

        emit!(AgentDeactivated {
            agent_pda: agent.key(),
            owner: agent.owner,
            refunded_stake: stake_to_return,
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
        require!(amount > 0, MitamaError::InvalidAmount);
        require!(
            time_lock >= MIN_TIME_LOCK && time_lock <= MAX_TIME_LOCK,
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
    pub fn release_funds(ctx: Context<ReleaseFunds>) -> Result<()> {
        let clock = Clock::get()?;

        let (status, agent_key, expires_at, transfer_amount, transaction_id, bump, token_mint) = {
            let escrow = &ctx.accounts.escrow;
            (
                escrow.status,
                escrow.agent,
                escrow.expires_at,
                escrow.amount,
                escrow.transaction_id.clone(),
                escrow.bump,
                escrow.token_mint,
            )
        };

        require!(status == EscrowStatus::Active, MitamaError::InvalidStatus);

        let is_agent = ctx.accounts.agent.key() == agent_key;
        let time_lock_expired = clock.unix_timestamp >= expires_at;

        if !is_agent {
            require!(time_lock_expired, MitamaError::TimeLockNotExpired);
        }

        require!(is_agent || time_lock_expired, MitamaError::Unauthorized);

        let seeds = &[b"escrow", transaction_id.as_bytes(), &[bump]];
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
        let payment_amount = amount - refund_amount;

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

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(amount: u64, time_lock: i64, transaction_id: String)]
pub struct InitializeEscrow<'info> {
    #[account(
        init,
        payer = agent,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", transaction_id.as_bytes()],
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
        seeds = [b"escrow", escrow.transaction_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub agent: Signer<'info>,

    /// CHECK: API wallet address
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
        seeds = [b"escrow", escrow.transaction_id.as_bytes()],
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
        seeds = [b"escrow", escrow.transaction_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub agent: SystemAccount<'info>,

    /// CHECK: API wallet address
    #[account(mut)]
    pub api: AccountInfo<'info>,

    /// CHECK: Verifier oracle public key
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
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
}
