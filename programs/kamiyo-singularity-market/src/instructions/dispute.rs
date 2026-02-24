//! Dispute Resolution Instructions
//!
//! File dispute -> Oracles vote -> Finalize with consensus

use anchor_lang::prelude::*;

use crate::errors::MarketError;
use crate::state::{
    calculate_dispute_consensus, Dispute, DisputeError, DisputeOracleSubmission, DisputeStatus,
    Market, MarketStatus, OracleRegistry, DISPUTE_BOND, DISPUTE_WINDOW, MAX_DISPUTE_ORACLES,
    MAX_SCORE_DEVIATION, ORACLE_REWARD_PERCENT,
};

/// File a dispute against a market resolution
///
/// Uses Checks-Effects-Interactions pattern to prevent reentrancy:
/// 1. Checks: Validate all preconditions
/// 2. Effects: Update all state
/// 3. Interactions: External calls (transfer) last
pub fn file_dispute_handler(ctx: Context<FileDispute>, reason_hash: String) -> Result<()> {
    let clock = Clock::get()?;

    // === CHECKS ===
    // Market must be resolved
    require!(
        ctx.accounts.market.status == MarketStatus::Resolved,
        MarketError::MarketNotResolved
    );

    // Within dispute window
    require!(
        clock.unix_timestamp <= ctx.accounts.market.resolved_at + DISPUTE_WINDOW,
        DisputeError::DisputeWindowExpired
    );

    // Store values needed after borrow
    let market_key = ctx.accounts.market.key();
    let disputer_key = ctx.accounts.disputer.key();
    let original_oracle = ctx.accounts.market.oracle;
    let original_outcome = ctx.accounts.market.resolved_outcome;
    let market_id = ctx.accounts.market.market_id.clone();

    // === EFFECTS ===
    // Update market status FIRST (before any external calls)
    let market = &mut ctx.accounts.market;
    market.status = MarketStatus::Paused;

    // Initialize dispute state
    let dispute = &mut ctx.accounts.dispute;
    dispute.market = market_key;
    dispute.disputer = disputer_key;
    dispute.original_oracle = original_oracle;
    dispute.original_outcome = original_outcome;
    dispute.status = DisputeStatus::Pending;
    dispute.bond_amount = DISPUTE_BOND;
    dispute.reason_hash = reason_hash;
    dispute.oracle_submissions = Vec::new();
    dispute.consensus_outcome = None;
    dispute.consensus_score = None;
    dispute.created_at = clock.unix_timestamp;
    dispute.first_submission_at = None;
    dispute.resolved_at = None;
    dispute.bump = ctx.bumps.dispute;

    // === INTERACTIONS ===
    // Transfer bond from disputer LAST
    let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
        &ctx.accounts.disputer.key(),
        &ctx.accounts.dispute.key(),
        DISPUTE_BOND,
    );
    anchor_lang::solana_program::program::invoke(
        &transfer_ix,
        &[
            ctx.accounts.disputer.to_account_info(),
            ctx.accounts.dispute.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    msg!("Dispute filed for market {}", market_id);

    Ok(())
}

/// Submit oracle vote on a dispute
pub fn submit_dispute_vote_handler(
    ctx: Context<SubmitDisputeVote>,
    outcome_vote: u8,
    confidence_score: u8,
) -> Result<()> {
    let dispute = &mut ctx.accounts.dispute;
    let oracle_key = ctx.accounts.oracle.key();
    let clock = Clock::get()?;

    // Validate dispute status
    require!(
        dispute.status == DisputeStatus::Pending || dispute.status == DisputeStatus::Voting,
        DisputeError::InvalidDisputeStatus
    );

    // Validate vote
    require!(
        outcome_vote >= 1 && outcome_vote <= 3,
        MarketError::InvalidOutcome
    );
    require!(confidence_score <= 100, MarketError::InvalidFee);

    // Check oracle is registered
    let registry = &ctx.accounts.oracle_registry;
    require!(
        registry
            .oracles
            .iter()
            .any(|o| o.pubkey == oracle_key && o.is_active),
        DisputeError::OracleNotRegistered
    );

    // Check not duplicate
    require!(
        !dispute
            .oracle_submissions
            .iter()
            .any(|s| s.oracle == oracle_key),
        DisputeError::DuplicateSubmission
    );

    // Check max oracles
    require!(
        dispute.oracle_submissions.len() < MAX_DISPUTE_ORACLES,
        DisputeError::MaxOraclesReached
    );

    // Record first submission time
    if dispute.first_submission_at.is_none() {
        dispute.first_submission_at = Some(clock.unix_timestamp);
    }

    // Add submission
    dispute.oracle_submissions.push(DisputeOracleSubmission {
        oracle: oracle_key,
        outcome_vote,
        confidence_score,
        submitted_at: clock.unix_timestamp,
    });

    // Update status to voting if we have submissions
    if dispute.status == DisputeStatus::Pending {
        dispute.status = DisputeStatus::Voting;
    }

    msg!(
        "Oracle {} voted {} with confidence {} on dispute",
        oracle_key,
        outcome_vote,
        confidence_score
    );

    Ok(())
}

/// Finalize dispute resolution with oracle consensus
pub fn finalize_dispute_handler(ctx: Context<FinalizeDispute>) -> Result<()> {
    let dispute = &ctx.accounts.dispute;
    let clock = Clock::get()?;

    // Validate status
    require!(
        dispute.status == DisputeStatus::Voting,
        DisputeError::InvalidDisputeStatus
    );

    // Check minimum consensus
    require!(
        dispute.has_minimum_consensus(),
        DisputeError::NoOracleSubmissions
    );

    // Check reveal delay
    require!(
        dispute.reveal_delay_passed(clock.unix_timestamp),
        DisputeError::RevealDelayNotMet
    );

    // Get oracle weights from registry
    let registry = &ctx.accounts.oracle_registry;
    let oracle_weights: Vec<(Pubkey, u16)> = registry
        .oracles
        .iter()
        .filter(|o| o.is_active)
        .map(|o| (o.pubkey, o.weight.unwrap_or(100)))
        .collect();

    // Calculate consensus
    let (consensus_outcome, consensus_score) = calculate_dispute_consensus(
        &dispute.oracle_submissions,
        &oracle_weights,
        MAX_SCORE_DEVIATION,
    )?;

    // Determine dispute result
    let dispute = &mut ctx.accounts.dispute;
    let market = &mut ctx.accounts.market;

    dispute.consensus_outcome = Some(consensus_outcome);
    dispute.consensus_score = Some(consensus_score);
    dispute.resolved_at = Some(clock.unix_timestamp);

    if consensus_outcome == 3 {
        // Cancel market
        dispute.status = DisputeStatus::Cancelled;
        market.status = MarketStatus::Cancelled;
        msg!("Dispute resulted in market cancellation");
    } else if consensus_outcome != dispute.original_outcome {
        // Overturn resolution
        dispute.status = DisputeStatus::Upheld;
        market.resolved_outcome = consensus_outcome;
        market.status = MarketStatus::Resolved;
        msg!(
            "Dispute upheld - resolution overturned to outcome {}",
            consensus_outcome
        );
    } else {
        // Original resolution stands
        dispute.status = DisputeStatus::Rejected;
        market.status = MarketStatus::Resolved;
        msg!("Dispute rejected - original resolution stands");
    }

    // Distribute bond based on outcome
    let bond = dispute.bond_amount;
    let oracle_count = dispute.oracle_submissions.len() as u64;

    if dispute.status == DisputeStatus::Upheld {
        // Refund bond to disputer using safe transfer
        // The dispute account holds the bond, transfer it back to disputer
        let dispute_info = dispute.to_account_info();
        let disputer_info = ctx.accounts.disputer.to_account_info();

        // Verify dispute account has sufficient lamports
        let dispute_lamports = dispute_info.lamports();
        let rent = Rent::get()?;
        let min_rent = rent.minimum_balance(dispute_info.data_len());

        // Only transfer if we have enough lamports above rent
        let transferable = dispute_lamports.saturating_sub(min_rent);
        let transfer_amount = bond.min(transferable);

        if transfer_amount > 0 {
            // Use safe lamport transfer
            **dispute_info.try_borrow_mut_lamports()? = dispute_lamports
                .checked_sub(transfer_amount)
                .ok_or(MarketError::ArithmeticOverflow)?;
            **disputer_info.try_borrow_mut_lamports()? = disputer_info
                .lamports()
                .checked_add(transfer_amount)
                .ok_or(MarketError::ArithmeticOverflow)?;

            msg!("Refunded {} lamports to disputer", transfer_amount);
        }
    } else {
        // Distribute bond to oracles as reward
        let oracle_reward = (bond as u128)
            .checked_mul(ORACLE_REWARD_PERCENT as u128)
            .and_then(|v| v.checked_div(100))
            .ok_or(MarketError::ArithmeticOverflow)? as u64;
        let reward_per_oracle = oracle_reward
            .checked_div(oracle_count.max(1))
            .ok_or(MarketError::ArithmeticOverflow)?;

        // Bond remains in dispute account for oracle claims
        // Oracles can claim via separate instruction
        msg!(
            "Oracle rewards: {} per oracle (claimable)",
            reward_per_oracle
        );
    }

    Ok(())
}

// ============================================================================
// Contexts
// ============================================================================

#[derive(Accounts)]
#[instruction(reason_hash: String)]
pub struct FileDispute<'info> {
    #[account(
        mut,
        constraint = market.status == MarketStatus::Resolved @ MarketError::MarketNotResolved
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = disputer,
        space = 8 + Dispute::INIT_SPACE,
        seeds = [Dispute::SEED_PREFIX, market.key().as_ref()],
        bump
    )]
    pub dispute: Account<'info, Dispute>,

    #[account(mut)]
    pub disputer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitDisputeVote<'info> {
    #[account(mut)]
    pub dispute: Account<'info, Dispute>,

    #[account(
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    pub oracle: Signer<'info>,
}

#[derive(Accounts)]
pub struct FinalizeDispute<'info> {
    #[account(mut)]
    pub dispute: Account<'info, Dispute>,

    #[account(
        mut,
        constraint = dispute.market == market.key()
    )]
    pub market: Account<'info, Market>,

    #[account(
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    /// CHECK: Validated against dispute.disputer
    #[account(
        mut,
        constraint = disputer.key() == dispute.disputer
    )]
    pub disputer: UncheckedAccount<'info>,
}
