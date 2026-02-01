// KAMIYO Fast Voting - TEE-based real-time agent voting
//
// Uses MagicBlock Private Ephemeral Rollups for sub-50ms voting latency.
// Votes are kept private in Intel TDX TEE until tally, then committed to mainnet.
//
// Flow:
// 1. create_fast_action - Initialize action PDA on mainnet
// 2. delegate_action - Delegate to TEE validator for private execution
// 3. vote_fast - Cast votes privately within TEE (hidden from validators)
// 4. tally_and_commit - Reveal results and commit final state to mainnet

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

// Placeholder - will be replaced with actual deployed program ID
declare_id!("FASTvKAMY1111111111111111111111111111111111");

pub const FAST_ACTION_SEED: &[u8] = b"fast_action";
pub const FAST_VOTE_SEED: &[u8] = b"fast_vote";

/// Voting window in slots (~30 seconds at 400ms/slot)
const VOTING_WINDOW_SLOTS: u64 = 75;

/// Minimum votes required for valid tally
const MIN_VOTES_FOR_QUORUM: u32 = 2;

#[ephemeral]
#[program]
pub mod kamiyo_fast_voting {
    use super::*;

    /// Create a new fast action for voting
    /// Called on mainnet before delegation
    pub fn create_fast_action(
        ctx: Context<CreateFastAction>,
        action_id: u64,
        action_hash: [u8; 32],
        threshold: u8,
        description_hash: [u8; 32],
    ) -> Result<()> {
        require!(threshold > 0 && threshold <= 100, FastVoteError::InvalidThreshold);

        let action = &mut ctx.accounts.fast_action;
        let clock = Clock::get()?;

        action.action_id = action_id;
        action.action_hash = action_hash;
        action.description_hash = description_hash;
        action.creator = ctx.accounts.creator.key();
        action.threshold = threshold;
        action.votes_for = 0;
        action.votes_against = 0;
        action.vote_count = 0;
        action.created_slot = clock.slot;
        action.deadline_slot = clock.slot + VOTING_WINDOW_SLOTS;
        action.executed = false;
        action.result = VoteResult::Pending;
        action.bump = ctx.bumps.fast_action;

        msg!("Fast action {} created, deadline slot {}", action_id, action.deadline_slot);

        emit!(FastActionCreated {
            action: action.key(),
            action_id,
            action_hash,
            threshold,
            deadline_slot: action.deadline_slot,
        });

        Ok(())
    }

    /// Delegate the fast action to TEE validator for private voting
    /// After this, votes are processed in the TEE and hidden from public view
    pub fn delegate_action(ctx: Context<DelegateAction>, action_id: u64) -> Result<()> {
        let validator = ctx.accounts.validator.as_ref().map(|v| v.key());

        // The delegate macro generates delegate_pda based on the field name marked with `del`
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[
                FAST_ACTION_SEED,
                &action_id.to_le_bytes(),
            ],
            DelegateConfig {
                validator,
                ..Default::default()
            },
        )?;

        msg!("Action {} delegated to TEE validator", action_id);

        Ok(())
    }

    /// Cast a vote on a fast action (executed privately in TEE)
    /// The vote value is hidden from all observers until tally
    pub fn vote_fast(
        ctx: Context<VoteFast>,
        _action_id: u64,
        vote_value: bool,
        voter_commitment: [u8; 32],
    ) -> Result<()> {
        let action = &mut ctx.accounts.fast_action;
        let clock = Clock::get()?;

        require!(!action.executed, FastVoteError::ActionAlreadyExecuted);
        require!(clock.slot <= action.deadline_slot, FastVoteError::VotingEnded);

        // Initialize vote record
        let vote = &mut ctx.accounts.fast_vote;
        vote.fast_action = action.key();
        vote.voter = ctx.accounts.voter.key();
        vote.voter_commitment = voter_commitment;
        vote.vote_value = vote_value;
        vote.voted_slot = clock.slot;
        vote.bump = ctx.bumps.fast_vote;

        // Update action tallies (private in TEE until commit)
        if vote_value {
            action.votes_for = action.votes_for.checked_add(1).ok_or(FastVoteError::VoteOverflow)?;
        } else {
            action.votes_against = action.votes_against.checked_add(1).ok_or(FastVoteError::VoteOverflow)?;
        }
        action.vote_count = action.vote_count.checked_add(1).ok_or(FastVoteError::VoteOverflow)?;

        msg!(
            "Vote cast: {} (total: {} for, {} against)",
            if vote_value { "YES" } else { "NO" },
            action.votes_for,
            action.votes_against
        );

        emit!(FastVoteCast {
            action: action.key(),
            voter_commitment,
            vote_count: action.vote_count,
        });

        Ok(())
    }

    /// Tally votes and commit results to mainnet
    /// Called after voting deadline, commits final state from TEE to Solana mainnet
    pub fn tally_and_commit(ctx: Context<TallyAndCommit>) -> Result<()> {
        let action = &mut ctx.accounts.fast_action;
        let clock = Clock::get()?;

        require!(!action.executed, FastVoteError::ActionAlreadyExecuted);
        require!(clock.slot > action.deadline_slot, FastVoteError::VotingNotEnded);
        require!(action.vote_count >= MIN_VOTES_FOR_QUORUM, FastVoteError::QuorumNotMet);

        // Calculate result
        let total_votes = action.votes_for.checked_add(action.votes_against).ok_or(FastVoteError::VoteOverflow)?;
        let approval_pct = if total_votes > 0 {
            (action.votes_for as u64 * 100) / (total_votes as u64)
        } else {
            0
        };

        action.result = if approval_pct >= action.threshold as u64 {
            VoteResult::Passed
        } else {
            VoteResult::Failed
        };
        action.executed = true;

        msg!(
            "Action {} result: {:?} ({} for, {} against, {}% approval)",
            action.action_id,
            action.result,
            action.votes_for,
            action.votes_against,
            approval_pct
        );

        // Exit ephemeral state
        action.exit(&crate::ID)?;

        // Commit to mainnet and undelegate
        commit_and_undelegate_accounts(
            &ctx.accounts.payer,
            vec![&action.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;

        emit!(FastActionExecuted {
            action: action.key(),
            action_id: action.action_id,
            votes_for: action.votes_for,
            votes_against: action.votes_against,
            result: action.result.clone(),
        });

        Ok(())
    }

    /// Cancel an action before execution (creator only)
    pub fn cancel_action(ctx: Context<CancelAction>, _action_id: u64) -> Result<()> {
        let action = &mut ctx.accounts.fast_action;

        require!(!action.executed, FastVoteError::ActionAlreadyExecuted);
        require!(
            ctx.accounts.creator.key() == action.creator,
            FastVoteError::Unauthorized
        );

        action.executed = true;
        action.result = VoteResult::Cancelled;

        msg!("Action {} cancelled by creator", action.action_id);

        emit!(FastActionCancelled {
            action: action.key(),
            action_id: action.action_id,
        });

        Ok(())
    }
}

// ============================================================================
// Account Structures
// ============================================================================

#[account]
pub struct FastAction {
    /// Unique action identifier
    pub action_id: u64,
    /// Hash of the action being voted on
    pub action_hash: [u8; 32],
    /// Hash of action description/metadata
    pub description_hash: [u8; 32],
    /// Creator who can cancel
    pub creator: Pubkey,
    /// Approval threshold (0-100)
    pub threshold: u8,
    /// Votes in favor
    pub votes_for: u32,
    /// Votes against
    pub votes_against: u32,
    /// Total vote count
    pub vote_count: u32,
    /// Slot when action was created
    pub created_slot: u64,
    /// Voting deadline slot
    pub deadline_slot: u64,
    /// Whether action has been executed/finalized
    pub executed: bool,
    /// Final result
    pub result: VoteResult,
    /// PDA bump
    pub bump: u8,
}

impl FastAction {
    pub const LEN: usize = 8  // discriminator
        + 8   // action_id
        + 32  // action_hash
        + 32  // description_hash
        + 32  // creator
        + 1   // threshold
        + 4   // votes_for
        + 4   // votes_against
        + 4   // vote_count
        + 8   // created_slot
        + 8   // deadline_slot
        + 1   // executed
        + 2   // result (enum tag + variant)
        + 1;  // bump
}

#[account]
pub struct FastVote {
    /// The fast action this vote belongs to
    pub fast_action: Pubkey,
    /// Voter's public key
    pub voter: Pubkey,
    /// Commitment to voter's identity (for anonymity if needed)
    pub voter_commitment: [u8; 32],
    /// The vote value (true = yes, false = no)
    pub vote_value: bool,
    /// Slot when vote was cast
    pub voted_slot: u64,
    /// PDA bump
    pub bump: u8,
}

impl FastVote {
    pub const LEN: usize = 8  // discriminator
        + 32  // fast_action
        + 32  // voter
        + 32  // voter_commitment
        + 1   // vote_value
        + 8   // voted_slot
        + 1;  // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum VoteResult {
    Pending,
    Passed,
    Failed,
    Cancelled,
}

// ============================================================================
// Contexts
// ============================================================================

#[derive(Accounts)]
#[instruction(action_id: u64)]
pub struct CreateFastAction<'info> {
    #[account(
        init,
        payer = creator,
        space = FastAction::LEN,
        seeds = [FAST_ACTION_SEED, &action_id.to_le_bytes()],
        bump
    )]
    pub fast_action: Account<'info, FastAction>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(action_id: u64)]
pub struct DelegateAction<'info> {
    /// CHECK: PDA to delegate - using AccountInfo for flexibility with delegate macro
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: TEE validator to delegate to (optional, uses default if None)
    pub validator: Option<AccountInfo<'info>>,
}

#[derive(Accounts)]
#[instruction(action_id: u64)]
pub struct VoteFast<'info> {
    #[account(
        mut,
        seeds = [FAST_ACTION_SEED, &action_id.to_le_bytes()],
        bump = fast_action.bump
    )]
    pub fast_action: Account<'info, FastAction>,
    #[account(
        init,
        payer = voter,
        space = FastVote::LEN,
        seeds = [FAST_VOTE_SEED, fast_action.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub fast_vote: Account<'info, FastVote>,
    #[account(mut)]
    pub voter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TallyAndCommit<'info> {
    #[account(
        mut,
        seeds = [FAST_ACTION_SEED, &fast_action.action_id.to_le_bytes()],
        bump = fast_action.bump
    )]
    pub fast_action: Account<'info, FastAction>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: MagicBlock magic context account
    pub magic_context: AccountInfo<'info>,
    /// CHECK: MagicBlock magic program
    pub magic_program: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(action_id: u64)]
pub struct CancelAction<'info> {
    #[account(
        mut,
        seeds = [FAST_ACTION_SEED, &action_id.to_le_bytes()],
        bump = fast_action.bump
    )]
    pub fast_action: Account<'info, FastAction>,
    pub creator: Signer<'info>,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct FastActionCreated {
    pub action: Pubkey,
    pub action_id: u64,
    pub action_hash: [u8; 32],
    pub threshold: u8,
    pub deadline_slot: u64,
}

#[event]
pub struct FastVoteCast {
    pub action: Pubkey,
    pub voter_commitment: [u8; 32],
    pub vote_count: u32,
}

#[event]
pub struct FastActionExecuted {
    pub action: Pubkey,
    pub action_id: u64,
    pub votes_for: u32,
    pub votes_against: u32,
    pub result: VoteResult,
}

#[event]
pub struct FastActionCancelled {
    pub action: Pubkey,
    pub action_id: u64,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum FastVoteError {
    #[msg("Invalid threshold (must be 1-100)")]
    InvalidThreshold,
    #[msg("Voting has ended")]
    VotingEnded,
    #[msg("Voting has not ended yet")]
    VotingNotEnded,
    #[msg("Action already executed")]
    ActionAlreadyExecuted,
    #[msg("Vote count overflow")]
    VoteOverflow,
    #[msg("Quorum not met")]
    QuorumNotMet,
    #[msg("Unauthorized")]
    Unauthorized,
}
