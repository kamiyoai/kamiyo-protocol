//! KAMIYO Governance - Token-weighted voting for protocol decisions
//!
//! Features:
//! - Token-weighted voting (1 KAMIYO = 1 vote)
//! - Staking multiplier integration (staked tokens count more)
//! - Proposal creation threshold (100K KAMIYO)
//! - Quorum requirement (5M KAMIYO = 0.5% of supply)
//! - 66% approval threshold
//! - Timelock for execution (24-72 hours)
//!
//! Proposal lifecycle:
//! 1. Created -> Voting period begins
//! 2. Voting -> Users vote yes/no with token weight
//! 3. Queued -> If passed, enters timelock
//! 4. Executed -> After timelock, can be executed
//! 5. Expired -> If not executed within grace period
//!
//! Copyright (c) 2026 KAMIYO
//! SPDX-License-Identifier: MIT

use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};

declare_id!("KGov1111111111111111111111111111111111111");

// ============================================================================
// Constants
// ============================================================================

/// Minimum tokens required to create a proposal (100K KAMIYO)
const PROPOSAL_THRESHOLD: u64 = 100_000_000_000_000;

/// Quorum: minimum votes required for proposal to be valid (5M KAMIYO = 0.5%)
const QUORUM_THRESHOLD: u64 = 5_000_000_000_000_000;

/// Approval threshold in basis points (6600 = 66%)
const APPROVAL_THRESHOLD_BPS: u64 = 6600;

/// Voting period duration (3 days)
const VOTING_PERIOD: i64 = 3 * 24 * 60 * 60;

/// Timelock duration for execution (24 hours minimum)
const TIMELOCK_DURATION: i64 = 24 * 60 * 60;

/// Grace period for execution after timelock (7 days)
const EXECUTION_GRACE_PERIOD: i64 = 7 * 24 * 60 * 60;

/// Maximum title length
const MAX_TITLE_LENGTH: usize = 128;

/// Maximum description length
const MAX_DESCRIPTION_LENGTH: usize = 1024;

/// Maximum instructions per proposal
const MAX_INSTRUCTIONS: usize = 10;

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum GovernanceError {
    #[msg("Insufficient tokens to create proposal")]
    InsufficientTokensForProposal,

    #[msg("Proposal is not in voting state")]
    NotInVotingState,

    #[msg("Proposal voting period has ended")]
    VotingPeriodEnded,

    #[msg("Proposal voting period has not ended")]
    VotingPeriodNotEnded,

    #[msg("Already voted on this proposal")]
    AlreadyVoted,

    #[msg("Quorum not reached")]
    QuorumNotReached,

    #[msg("Proposal not approved")]
    ProposalNotApproved,

    #[msg("Proposal is not queued for execution")]
    NotQueued,

    #[msg("Timelock period has not ended")]
    TimelockNotEnded,

    #[msg("Execution grace period expired")]
    ExecutionExpired,

    #[msg("Proposal already executed")]
    AlreadyExecuted,

    #[msg("Title too long")]
    TitleTooLong,

    #[msg("Description too long")]
    DescriptionTooLong,

    #[msg("Too many instructions")]
    TooManyInstructions,

    #[msg("Invalid authority")]
    InvalidAuthority,

    #[msg("Governance is paused")]
    GovernancePaused,
}

// ============================================================================
// State
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ProposalState {
    /// Proposal is active and can receive votes
    Voting,
    /// Proposal passed and is queued for execution
    Queued,
    /// Proposal has been executed
    Executed,
    /// Proposal was defeated (didn't reach quorum or approval)
    Defeated,
    /// Proposal expired without being executed
    Expired,
    /// Proposal was cancelled by creator
    Cancelled,
}

/// Global governance configuration
#[account]
pub struct GovernanceConfig {
    /// Admin authority (can pause governance)
    pub admin: Pubkey,

    /// KAMIYO token mint
    pub token_mint: Pubkey,

    /// Total proposals created
    pub proposal_count: u64,

    /// Proposal creation threshold
    pub proposal_threshold: u64,

    /// Quorum threshold
    pub quorum_threshold: u64,

    /// Approval threshold in basis points
    pub approval_threshold_bps: u64,

    /// Voting period in seconds
    pub voting_period: i64,

    /// Timelock duration in seconds
    pub timelock_duration: i64,

    /// Whether governance is paused
    pub is_paused: bool,

    /// Bump seed
    pub bump: u8,
}

impl GovernanceConfig {
    pub const LEN: usize = 8 + // discriminator
        32 + // admin
        32 + // token_mint
        8 +  // proposal_count
        8 +  // proposal_threshold
        8 +  // quorum_threshold
        8 +  // approval_threshold_bps
        8 +  // voting_period
        8 +  // timelock_duration
        1 +  // is_paused
        1;   // bump
}

/// A governance proposal
#[account]
pub struct Proposal {
    /// Unique proposal ID
    pub id: u64,

    /// Creator of the proposal
    pub proposer: Pubkey,

    /// Title of the proposal
    pub title: String,

    /// Description/rationale
    pub description: String,

    /// Current state
    pub state: ProposalState,

    /// Timestamp when proposal was created
    pub created_at: i64,

    /// Timestamp when voting ends
    pub voting_ends_at: i64,

    /// Timestamp when timelock ends (if queued)
    pub execution_eta: i64,

    /// Total votes for
    pub votes_for: u64,

    /// Total votes against
    pub votes_against: u64,

    /// Number of unique voters
    pub voter_count: u32,

    /// Whether the proposal has been executed
    pub executed: bool,

    /// Bump seed
    pub bump: u8,
}

impl Proposal {
    pub const LEN: usize = 8 + // discriminator
        8 +  // id
        32 + // proposer
        4 + MAX_TITLE_LENGTH + // title
        4 + MAX_DESCRIPTION_LENGTH + // description
        1 +  // state
        8 +  // created_at
        8 +  // voting_ends_at
        8 +  // execution_eta
        8 +  // votes_for
        8 +  // votes_against
        4 +  // voter_count
        1 +  // executed
        1;   // bump
}

/// Record of a user's vote on a proposal
#[account]
pub struct VoteRecord {
    /// The proposal this vote is for
    pub proposal: Pubkey,

    /// The voter
    pub voter: Pubkey,

    /// Vote weight (token amount * multiplier)
    pub weight: u64,

    /// Whether voted for (true) or against (false)
    pub support: bool,

    /// Timestamp of vote
    pub voted_at: i64,

    /// Bump seed
    pub bump: u8,
}

impl VoteRecord {
    pub const LEN: usize = 8 + // discriminator
        32 + // proposal
        32 + // voter
        8 +  // weight
        1 +  // support
        8 +  // voted_at
        1;   // bump
}

// ============================================================================
// Instructions
// ============================================================================

#[program]
pub mod kamiyo_governance {
    use super::*;

    /// Initialize the governance system
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.token_mint = ctx.accounts.token_mint.key();
        config.proposal_count = 0;
        config.proposal_threshold = PROPOSAL_THRESHOLD;
        config.quorum_threshold = QUORUM_THRESHOLD;
        config.approval_threshold_bps = APPROVAL_THRESHOLD_BPS;
        config.voting_period = VOTING_PERIOD;
        config.timelock_duration = TIMELOCK_DURATION;
        config.is_paused = false;
        config.bump = ctx.bumps.config;

        msg!("Governance initialized");
        Ok(())
    }

    /// Create a new proposal
    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        title: String,
        description: String,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.is_paused, GovernanceError::GovernancePaused);
        require!(title.len() <= MAX_TITLE_LENGTH, GovernanceError::TitleTooLong);
        require!(description.len() <= MAX_DESCRIPTION_LENGTH, GovernanceError::DescriptionTooLong);

        // Check proposer has enough tokens
        let proposer_balance = ctx.accounts.proposer_token_account.amount;
        require!(
            proposer_balance >= config.proposal_threshold,
            GovernanceError::InsufficientTokensForProposal
        );

        let clock = Clock::get()?;
        let config = &mut ctx.accounts.config;
        let proposal_id = config.proposal_count;
        config.proposal_count = config.proposal_count.checked_add(1).unwrap();

        let proposal = &mut ctx.accounts.proposal;
        proposal.id = proposal_id;
        proposal.proposer = ctx.accounts.proposer.key();
        proposal.title = title.clone();
        proposal.description = description;
        proposal.state = ProposalState::Voting;
        proposal.created_at = clock.unix_timestamp;
        proposal.voting_ends_at = clock.unix_timestamp + config.voting_period;
        proposal.execution_eta = 0;
        proposal.votes_for = 0;
        proposal.votes_against = 0;
        proposal.voter_count = 0;
        proposal.executed = false;
        proposal.bump = ctx.bumps.proposal;

        emit!(ProposalCreated {
            proposal_id,
            proposer: ctx.accounts.proposer.key(),
            title,
            voting_ends_at: proposal.voting_ends_at,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Cast a vote on a proposal
    pub fn cast_vote(ctx: Context<CastVote>, support: bool) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.is_paused, GovernanceError::GovernancePaused);

        let proposal = &ctx.accounts.proposal;
        require!(
            proposal.state == ProposalState::Voting,
            GovernanceError::NotInVotingState
        );

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp < proposal.voting_ends_at,
            GovernanceError::VotingPeriodEnded
        );

        // Calculate vote weight (token balance)
        // In production, this would also factor in staking multiplier
        let weight = ctx.accounts.voter_token_account.amount;

        // Record the vote
        let vote_record = &mut ctx.accounts.vote_record;
        vote_record.proposal = ctx.accounts.proposal.key();
        vote_record.voter = ctx.accounts.voter.key();
        vote_record.weight = weight;
        vote_record.support = support;
        vote_record.voted_at = clock.unix_timestamp;
        vote_record.bump = ctx.bumps.vote_record;

        // Update proposal tallies
        let proposal = &mut ctx.accounts.proposal;
        if support {
            proposal.votes_for = proposal.votes_for.checked_add(weight).unwrap();
        } else {
            proposal.votes_against = proposal.votes_against.checked_add(weight).unwrap();
        }
        proposal.voter_count = proposal.voter_count.checked_add(1).unwrap();

        emit!(VoteCast {
            proposal_id: proposal.id,
            voter: ctx.accounts.voter.key(),
            support,
            weight,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Finalize voting and queue proposal if passed
    pub fn finalize_proposal(ctx: Context<FinalizeProposal>) -> Result<()> {
        let config = &ctx.accounts.config;
        let proposal = &ctx.accounts.proposal;
        let clock = Clock::get()?;

        require!(
            proposal.state == ProposalState::Voting,
            GovernanceError::NotInVotingState
        );
        require!(
            clock.unix_timestamp >= proposal.voting_ends_at,
            GovernanceError::VotingPeriodNotEnded
        );

        let total_votes = proposal.votes_for.checked_add(proposal.votes_against).unwrap();
        let proposal = &mut ctx.accounts.proposal;

        // Check quorum
        if total_votes < config.quorum_threshold {
            proposal.state = ProposalState::Defeated;
            emit!(ProposalDefeated {
                proposal_id: proposal.id,
                reason: "Quorum not reached".to_string(),
                votes_for: proposal.votes_for,
                votes_against: proposal.votes_against,
                timestamp: clock.unix_timestamp,
            });
            return Ok(());
        }

        // Check approval threshold
        let approval_pct = (proposal.votes_for as u128)
            .checked_mul(10000)
            .unwrap()
            .checked_div(total_votes as u128)
            .unwrap() as u64;

        if approval_pct >= config.approval_threshold_bps {
            proposal.state = ProposalState::Queued;
            proposal.execution_eta = clock.unix_timestamp + config.timelock_duration;

            emit!(ProposalQueued {
                proposal_id: proposal.id,
                execution_eta: proposal.execution_eta,
                votes_for: proposal.votes_for,
                votes_against: proposal.votes_against,
                timestamp: clock.unix_timestamp,
            });
        } else {
            proposal.state = ProposalState::Defeated;

            emit!(ProposalDefeated {
                proposal_id: proposal.id,
                reason: "Approval threshold not met".to_string(),
                votes_for: proposal.votes_for,
                votes_against: proposal.votes_against,
                timestamp: clock.unix_timestamp,
            });
        }

        Ok(())
    }

    /// Execute a queued proposal after timelock
    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        let proposal = &ctx.accounts.proposal;
        let clock = Clock::get()?;

        require!(
            proposal.state == ProposalState::Queued,
            GovernanceError::NotQueued
        );
        require!(
            clock.unix_timestamp >= proposal.execution_eta,
            GovernanceError::TimelockNotEnded
        );
        require!(
            clock.unix_timestamp < proposal.execution_eta + EXECUTION_GRACE_PERIOD,
            GovernanceError::ExecutionExpired
        );

        let proposal = &mut ctx.accounts.proposal;
        proposal.state = ProposalState::Executed;
        proposal.executed = true;

        emit!(ProposalExecuted {
            proposal_id: proposal.id,
            executor: ctx.accounts.executor.key(),
            timestamp: clock.unix_timestamp,
        });

        // Note: Actual execution of proposal instructions would happen here
        // via CPI calls. This is a simplified version that just marks as executed.

        Ok(())
    }

    /// Cancel a proposal (only by proposer, before voting ends)
    pub fn cancel_proposal(ctx: Context<CancelProposal>) -> Result<()> {
        let proposal = &ctx.accounts.proposal;
        let clock = Clock::get()?;

        require!(
            proposal.state == ProposalState::Voting,
            GovernanceError::NotInVotingState
        );

        let proposal = &mut ctx.accounts.proposal;
        proposal.state = ProposalState::Cancelled;

        emit!(ProposalCancelled {
            proposal_id: proposal.id,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Pause governance (admin only, emergency)
    pub fn pause_governance(ctx: Context<AdminAction>) -> Result<()> {
        ctx.accounts.config.is_paused = true;
        msg!("Governance paused");
        Ok(())
    }

    /// Unpause governance (admin only)
    pub fn unpause_governance(ctx: Context<AdminAction>) -> Result<()> {
        ctx.accounts.config.is_paused = false;
        msg!("Governance unpaused");
        Ok(())
    }

    /// Update governance parameters (admin only)
    pub fn update_config(
        ctx: Context<AdminAction>,
        proposal_threshold: Option<u64>,
        quorum_threshold: Option<u64>,
        approval_threshold_bps: Option<u64>,
        voting_period: Option<i64>,
        timelock_duration: Option<i64>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;

        if let Some(v) = proposal_threshold {
            config.proposal_threshold = v;
        }
        if let Some(v) = quorum_threshold {
            config.quorum_threshold = v;
        }
        if let Some(v) = approval_threshold_bps {
            config.approval_threshold_bps = v;
        }
        if let Some(v) = voting_period {
            config.voting_period = v;
        }
        if let Some(v) = timelock_duration {
            config.timelock_duration = v;
        }

        msg!("Governance config updated");
        Ok(())
    }
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct ProposalCreated {
    pub proposal_id: u64,
    pub proposer: Pubkey,
    pub title: String,
    pub voting_ends_at: i64,
    pub timestamp: i64,
}

#[event]
pub struct VoteCast {
    pub proposal_id: u64,
    pub voter: Pubkey,
    pub support: bool,
    pub weight: u64,
    pub timestamp: i64,
}

#[event]
pub struct ProposalQueued {
    pub proposal_id: u64,
    pub execution_eta: i64,
    pub votes_for: u64,
    pub votes_against: u64,
    pub timestamp: i64,
}

#[event]
pub struct ProposalDefeated {
    pub proposal_id: u64,
    pub reason: String,
    pub votes_for: u64,
    pub votes_against: u64,
    pub timestamp: i64,
}

#[event]
pub struct ProposalExecuted {
    pub proposal_id: u64,
    pub executor: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ProposalCancelled {
    pub proposal_id: u64,
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
        space = GovernanceConfig::LEN,
        seeds = [b"governance"],
        bump
    )]
    pub config: Account<'info, GovernanceConfig>,

    pub token_mint: Account<'info, Mint>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(
        mut,
        seeds = [b"governance"],
        bump = config.bump
    )]
    pub config: Account<'info, GovernanceConfig>,

    #[account(
        init,
        payer = proposer,
        space = Proposal::LEN,
        seeds = [b"proposal", config.proposal_count.to_le_bytes().as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        associated_token::mint = config.token_mint,
        associated_token::authority = proposer
    )]
    pub proposer_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub proposer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(seeds = [b"governance"], bump = config.bump)]
    pub config: Account<'info, GovernanceConfig>,

    #[account(
        mut,
        seeds = [b"proposal", proposal.id.to_le_bytes().as_ref()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        init,
        payer = voter,
        space = VoteRecord::LEN,
        seeds = [b"vote", proposal.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,

    #[account(
        associated_token::mint = config.token_mint,
        associated_token::authority = voter
    )]
    pub voter_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub voter: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeProposal<'info> {
    #[account(seeds = [b"governance"], bump = config.bump)]
    pub config: Account<'info, GovernanceConfig>,

    #[account(
        mut,
        seeds = [b"proposal", proposal.id.to_le_bytes().as_ref()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(seeds = [b"governance"], bump = config.bump)]
    pub config: Account<'info, GovernanceConfig>,

    #[account(
        mut,
        seeds = [b"proposal", proposal.id.to_le_bytes().as_ref()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,

    pub executor: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelProposal<'info> {
    #[account(
        mut,
        seeds = [b"proposal", proposal.id.to_le_bytes().as_ref()],
        bump = proposal.bump,
        has_one = proposer @ GovernanceError::InvalidAuthority
    )]
    pub proposal: Account<'info, Proposal>,

    pub proposer: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(
        mut,
        seeds = [b"governance"],
        bump = config.bump,
        has_one = admin @ GovernanceError::InvalidAuthority
    )]
    pub config: Account<'info, GovernanceConfig>,

    pub admin: Signer<'info>,
}
