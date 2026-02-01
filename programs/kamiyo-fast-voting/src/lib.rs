// KAMIYO Fast Voting - TEE-based real-time agent voting
// MagicBlock Private Ephemeral Rollups for sub-50ms latency

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{delegate, ephemeral};
use ephemeral_rollups_sdk::consts::{MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

declare_id!("AakwnBstczs5KC2jKPfBuFLQZADXrx4oPH8FtJbhPxwA");

pub const FAST_ACTION_SEED: &[u8] = b"fast_action";
pub const FAST_VOTE_SEED: &[u8] = b"fast_vote";

/// Voting window: ~30 seconds at 400ms/slot
const VOTING_WINDOW_SLOTS: u64 = 75;

/// Quorum requirement
const MIN_VOTES_FOR_QUORUM: u32 = 2;

/// Max votes per action (prevents DoS via vote spam)
const MAX_VOTES_PER_ACTION: u32 = 10_000;

#[ephemeral]
#[program]
pub mod kamiyo_fast_voting {
    use super::*;

    pub fn create_fast_action(
        ctx: Context<CreateFastAction>,
        action_id: u64,
        action_hash: [u8; 32],
        threshold: u8,
        description_hash: [u8; 32],
    ) -> Result<()> {
        require!(threshold > 0 && threshold <= 100, FastVoteError::InvalidThreshold);
        require!(action_hash != [0u8; 32], FastVoteError::InvalidActionHash);

        let action = &mut ctx.accounts.fast_action;
        let clock = Clock::get()?;

        let deadline_slot = clock.slot
            .checked_add(VOTING_WINDOW_SLOTS)
            .ok_or(FastVoteError::SlotOverflow)?;

        action.action_id = action_id;
        action.action_hash = action_hash;
        action.description_hash = description_hash;
        action.creator = ctx.accounts.creator.key();
        action.threshold = threshold;
        action.votes_for = 0;
        action.votes_against = 0;
        action.vote_count = 0;
        action.created_slot = clock.slot;
        action.deadline_slot = deadline_slot;
        action.executed = false;
        action.result = VoteResult::Pending;
        action.bump = ctx.bumps.fast_action;

        emit!(FastActionCreated {
            action: action.key(),
            action_id,
            action_hash,
            threshold,
            deadline_slot,
        });

        Ok(())
    }

    pub fn delegate_action(ctx: Context<DelegateAction>, action_id: u64) -> Result<()> {
        // Verify PDA matches expected derivation
        let (expected_pda, _) = Pubkey::find_program_address(
            &[FAST_ACTION_SEED, &action_id.to_le_bytes()],
            &crate::ID,
        );
        require!(ctx.accounts.pda.key() == expected_pda, FastVoteError::InvalidPda);

        let validator = ctx.accounts.validator.as_ref().map(|v| v.key());

        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[FAST_ACTION_SEED, &action_id.to_le_bytes()],
            DelegateConfig {
                validator,
                ..Default::default()
            },
        )?;

        Ok(())
    }

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
        require!(action.vote_count < MAX_VOTES_PER_ACTION, FastVoteError::MaxVotesReached);
        require!(voter_commitment != [0u8; 32], FastVoteError::InvalidVoterCommitment);

        let vote = &mut ctx.accounts.fast_vote;
        vote.fast_action = action.key();
        vote.voter = ctx.accounts.voter.key();
        vote.voter_commitment = voter_commitment;
        vote.vote_value = vote_value;
        vote.voted_slot = clock.slot;
        vote.bump = ctx.bumps.fast_vote;

        if vote_value {
            action.votes_for = action.votes_for.checked_add(1).ok_or(FastVoteError::VoteOverflow)?;
        } else {
            action.votes_against = action.votes_against.checked_add(1).ok_or(FastVoteError::VoteOverflow)?;
        }
        action.vote_count = action.vote_count.checked_add(1).ok_or(FastVoteError::VoteOverflow)?;

        emit!(FastVoteCast {
            action: action.key(),
            voter_commitment,
            vote_count: action.vote_count,
        });

        Ok(())
    }

    pub fn tally_and_commit(ctx: Context<TallyAndCommit>) -> Result<()> {
        let action = &mut ctx.accounts.fast_action;
        let clock = Clock::get()?;

        require!(!action.executed, FastVoteError::ActionAlreadyExecuted);
        require!(clock.slot > action.deadline_slot, FastVoteError::VotingNotEnded);
        require!(action.vote_count >= MIN_VOTES_FOR_QUORUM, FastVoteError::QuorumNotMet);

        let total_votes = action.votes_for
            .checked_add(action.votes_against)
            .ok_or(FastVoteError::VoteOverflow)?;

        require!(total_votes > 0, FastVoteError::QuorumNotMet);

        let approval_pct = (action.votes_for as u64)
            .checked_mul(100)
            .ok_or(FastVoteError::VoteOverflow)?
            .checked_div(total_votes as u64)
            .ok_or(FastVoteError::VoteOverflow)?;

        action.result = if approval_pct >= action.threshold as u64 {
            VoteResult::Passed
        } else {
            VoteResult::Failed
        };
        action.executed = true;

        action.exit(&crate::ID)?;

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

    pub fn cancel_action(ctx: Context<CancelAction>, _action_id: u64) -> Result<()> {
        let action = &mut ctx.accounts.fast_action;
        require!(!action.executed, FastVoteError::ActionAlreadyExecuted);

        action.executed = true;
        action.result = VoteResult::Cancelled;

        emit!(FastActionCancelled {
            action: action.key(),
            action_id: action.action_id,
        });

        Ok(())
    }
}

#[account]
pub struct FastAction {
    pub action_id: u64,          // 8
    pub action_hash: [u8; 32],   // 32
    pub description_hash: [u8; 32], // 32
    pub creator: Pubkey,         // 32
    pub threshold: u8,           // 1
    pub votes_for: u32,          // 4
    pub votes_against: u32,      // 4
    pub vote_count: u32,         // 4
    pub created_slot: u64,       // 8
    pub deadline_slot: u64,      // 8
    pub executed: bool,          // 1
    pub result: VoteResult,      // 1 + 1 padding
    pub bump: u8,                // 1
}

impl FastAction {
    pub const LEN: usize = 145; // 8 disc + 136 fields + 1 padding
}

#[account]
pub struct FastVote {
    pub fast_action: Pubkey,     // 32
    pub voter: Pubkey,           // 32
    pub voter_commitment: [u8; 32], // 32
    pub vote_value: bool,        // 1
    pub voted_slot: u64,         // 8
    pub bump: u8,                // 1
}

impl FastVote {
    pub const LEN: usize = 114; // 8 disc + 106 fields
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum VoteResult {
    Pending,
    Passed,
    Failed,
    Cancelled,
}

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
    /// CHECK: Validated in instruction via find_program_address
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Optional TEE validator pubkey
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
    /// CHECK: MagicBlock context - validated via address constraint
    #[account(address = MAGIC_CONTEXT_ID @ FastVoteError::InvalidMagicContext)]
    pub magic_context: AccountInfo<'info>,
    /// CHECK: MagicBlock program - validated via address constraint
    #[account(address = MAGIC_PROGRAM_ID @ FastVoteError::InvalidMagicBlockProgram)]
    pub magic_program: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(action_id: u64)]
pub struct CancelAction<'info> {
    #[account(
        mut,
        seeds = [FAST_ACTION_SEED, &action_id.to_le_bytes()],
        bump = fast_action.bump,
        constraint = fast_action.creator == creator.key() @ FastVoteError::Unauthorized
    )]
    pub fast_action: Account<'info, FastAction>,
    pub creator: Signer<'info>,
}

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

#[error_code]
pub enum FastVoteError {
    #[msg("Threshold must be 1-100")]
    InvalidThreshold,
    #[msg("Action hash cannot be zero")]
    InvalidActionHash,
    #[msg("Slot calculation overflow")]
    SlotOverflow,
    #[msg("PDA does not match expected derivation")]
    InvalidPda,
    #[msg("Voting has ended")]
    VotingEnded,
    #[msg("Voting has not ended yet")]
    VotingNotEnded,
    #[msg("Action already executed")]
    ActionAlreadyExecuted,
    #[msg("Vote count overflow")]
    VoteOverflow,
    #[msg("Max votes reached for this action")]
    MaxVotesReached,
    #[msg("Voter commitment cannot be zero")]
    InvalidVoterCommitment,
    #[msg("Quorum not met")]
    QuorumNotMet,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid MagicBlock program")]
    InvalidMagicBlockProgram,
    #[msg("Invalid MagicBlock context")]
    InvalidMagicContext,
}
