use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF");

#[program]
pub mod kamiyo_bounty_resolver {
    use super::*;

    /// Create a new bounty with specified reward and requirements
    pub fn create_bounty(
        ctx: Context<CreateBounty>,
        bounty_id: u64,
        reward_amount: u64,
        description: String,
        deadline: i64,
    ) -> Result<()> {
        require!(reward_amount > 0, BountyError::InvalidRewardAmount);
        require!(description.len() <= 500, BountyError::DescriptionTooLong);
        require!(deadline > Clock::get()?.unix_timestamp, BountyError::InvalidDeadline);

        let bounty = &mut ctx.accounts.bounty;
        bounty.creator = ctx.accounts.creator.key();
        bounty.bounty_id = bounty_id;
        bounty.reward_amount = reward_amount;
        bounty.description = description;
        bounty.deadline = deadline;
        bounty.status = BountyStatus::Open;
        bounty.worker = Pubkey::default();
        bounty.submission_hash = [0u8; 32];
        bounty.created_at = Clock::get()?.unix_timestamp;

        // Transfer reward amount to bounty escrow
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.bounty.to_account_info(),
            },
        );
        system_program::transfer(cpi_context, reward_amount)?;

        emit!(BountyCreated {
            bounty_id,
            creator: ctx.accounts.creator.key(),
            reward_amount,
            deadline,
        });

        Ok(())
    }

    /// Submit work for a bounty
    pub fn submit_work(
        ctx: Context<SubmitWork>,
        submission_hash: [u8; 32],
        submission_uri: String,
    ) -> Result<()> {
        require!(submission_uri.len() <= 200, BountyError::SubmissionUriTooLong);
        
        let bounty = &mut ctx.accounts.bounty;
        require!(bounty.status == BountyStatus::Open, BountyError::BountyNotOpen);
        require!(Clock::get()?.unix_timestamp <= bounty.deadline, BountyError::DeadlinePassed);

        bounty.worker = ctx.accounts.worker.key();
        bounty.submission_hash = submission_hash;
        bounty.status = BountyStatus::WorkSubmitted;

        emit!(WorkSubmitted {
            bounty_id: bounty.bounty_id,
            worker: ctx.accounts.worker.key(),
            submission_hash,
            submission_uri,
        });

        Ok(())
    }

    /// Resolve bounty by accepting or rejecting submitted work
    pub fn resolve_bounty(
        ctx: Context<ResolveBounty>,
        accept_work: bool,
    ) -> Result<()> {
        // Read bounty data first
        let bounty_status = ctx.accounts.bounty.status.clone();
        let bounty_creator = ctx.accounts.bounty.creator;
        let bounty_id = ctx.accounts.bounty.bounty_id;
        let bounty_worker = ctx.accounts.bounty.worker;
        let reward_amount = ctx.accounts.bounty.reward_amount;

        require!(bounty_status == BountyStatus::WorkSubmitted, BountyError::NoWorkSubmitted);
        require!(bounty_creator == ctx.accounts.creator.key(), BountyError::UnauthorizedResolver);

        if accept_work {
            // Transfer reward to worker
            **ctx.accounts.bounty.to_account_info().try_borrow_mut_lamports()? -= reward_amount;
            **ctx.accounts.worker.try_borrow_mut_lamports()? += reward_amount;

            ctx.accounts.bounty.status = BountyStatus::Completed;

            emit!(BountyResolved {
                bounty_id,
                worker: bounty_worker,
                accepted: true,
                reward_paid: reward_amount,
            });
        } else {
            // Return reward to creator
            **ctx.accounts.bounty.to_account_info().try_borrow_mut_lamports()? -= reward_amount;
            **ctx.accounts.creator.try_borrow_mut_lamports()? += reward_amount;

            ctx.accounts.bounty.status = BountyStatus::Rejected;

            emit!(BountyResolved {
                bounty_id,
                worker: bounty_worker,
                accepted: false,
                reward_paid: 0,
            });
        }

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(bounty_id: u64)]
pub struct CreateBounty<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + Bounty::INIT_SPACE,
        seeds = [b"bounty", creator.key().as_ref(), bounty_id.to_le_bytes().as_ref()],
        bump
    )]
    pub bounty: Account<'info, Bounty>,
    
    #[account(mut)]
    pub creator: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitWork<'info> {
    #[account(mut)]
    pub bounty: Account<'info, Bounty>,
    
    pub worker: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveBounty<'info> {
    #[account(mut)]
    pub bounty: Account<'info, Bounty>,
    
    #[account(mut)]
    pub creator: Signer<'info>,
    
    /// CHECK: Worker account to receive payment if work is accepted
    #[account(mut)]
    pub worker: AccountInfo<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Bounty {
    pub creator: Pubkey,
    pub bounty_id: u64,
    pub reward_amount: u64,
    #[max_len(500)]
    pub description: String,
    pub deadline: i64,
    pub status: BountyStatus,
    pub worker: Pubkey,
    pub submission_hash: [u8; 32],
    pub created_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum BountyStatus {
    Open,
    WorkSubmitted,
    Completed,
    Rejected,
}

#[event]
pub struct BountyCreated {
    pub bounty_id: u64,
    pub creator: Pubkey,
    pub reward_amount: u64,
    pub deadline: i64,
}

#[event]
pub struct WorkSubmitted {
    pub bounty_id: u64,
    pub worker: Pubkey,
    pub submission_hash: [u8; 32],
    pub submission_uri: String,
}

#[event]
pub struct BountyResolved {
    pub bounty_id: u64,
    pub worker: Pubkey,
    pub accepted: bool,
    pub reward_paid: u64,
}

#[error_code]
pub enum BountyError {
    #[msg("Reward amount must be greater than 0")]
    InvalidRewardAmount,
    #[msg("Description cannot exceed 500 characters")]
    DescriptionTooLong,
    #[msg("Deadline must be in the future")]
    InvalidDeadline,
    #[msg("Bounty is not open for submissions")]
    BountyNotOpen,
    #[msg("Submission deadline has passed")]
    DeadlinePassed,
    #[msg("Submission URI cannot exceed 200 characters")]
    SubmissionUriTooLong,
    #[msg("No work has been submitted for this bounty")]
    NoWorkSubmitted,
    #[msg("Only the bounty creator can resolve the bounty")]
    UnauthorizedResolver,
}