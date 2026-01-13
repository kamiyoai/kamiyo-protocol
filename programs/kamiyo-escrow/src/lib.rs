use anchor_lang::prelude::*;

declare_id!("EscrowKAMIYO1111111111111111111111111111111");

#[program]
pub mod kamiyo_escrow {
    use super::*;

    /// Create a new escrow for a Companion session
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        session_id: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let clock = Clock::get()?;

        escrow.user = ctx.accounts.user.key();
        escrow.treasury = ctx.accounts.treasury.key();
        escrow.session_id = session_id;
        escrow.amount = amount;
        escrow.created_at = clock.unix_timestamp;
        escrow.released = false;
        escrow.refunded = false;
        escrow.rating = 0;
        escrow.bump = ctx.bumps.escrow;

        // Transfer SOL to escrow PDA
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.escrow.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.escrow.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        emit!(EscrowCreated {
            escrow: escrow.key(),
            user: escrow.user,
            session_id,
            amount,
        });

        Ok(())
    }

    /// Rate session and release escrow if rating >= 3
    pub fn rate_and_release(
        ctx: Context<RateAndRelease>,
        rating: u8,
    ) -> Result<()> {
        require!(rating >= 1 && rating <= 5, EscrowError::InvalidRating);

        let escrow = &mut ctx.accounts.escrow;
        require!(!escrow.released && !escrow.refunded, EscrowError::AlreadyProcessed);

        escrow.rating = rating;

        if rating >= 3 {
            // Release to treasury
            escrow.released = true;

            let amount = escrow.amount;
            **escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
            **ctx.accounts.treasury.try_borrow_mut_lamports()? += amount;

            emit!(EscrowReleased {
                escrow: escrow.key(),
                treasury: ctx.accounts.treasury.key(),
                amount,
                rating,
            });
        } else {
            // Refund to user
            escrow.refunded = true;

            let amount = escrow.amount;
            **escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
            **ctx.accounts.user.try_borrow_mut_lamports()? += amount;

            emit!(EscrowRefunded {
                escrow: escrow.key(),
                user: ctx.accounts.user.key(),
                amount,
                rating,
            });
        }

        Ok(())
    }

    /// Auto-release after timeout (7 days) - can be called by anyone
    pub fn timeout_release(ctx: Context<TimeoutRelease>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let clock = Clock::get()?;

        require!(!escrow.released && !escrow.refunded, EscrowError::AlreadyProcessed);

        let timeout = 7 * 24 * 60 * 60; // 7 days
        require!(
            clock.unix_timestamp > escrow.created_at + timeout,
            EscrowError::NotTimedOut
        );

        escrow.released = true;

        let amount = escrow.amount;
        **escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.treasury.try_borrow_mut_lamports()? += amount;

        emit!(EscrowTimeout {
            escrow: escrow.key(),
            treasury: ctx.accounts.treasury.key(),
            amount,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(session_id: [u8; 32])]
pub struct CreateEscrow<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: Treasury receives funds
    pub treasury: AccountInfo<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", user.key().as_ref(), &session_id],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RateAndRelease<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: Treasury receives funds
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    #[account(
        mut,
        constraint = escrow.user == user.key() @ EscrowError::Unauthorized,
        constraint = escrow.treasury == treasury.key() @ EscrowError::InvalidTreasury
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct TimeoutRelease<'info> {
    /// CHECK: Treasury receives funds
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    #[account(
        mut,
        constraint = escrow.treasury == treasury.key() @ EscrowError::InvalidTreasury
    )]
    pub escrow: Account<'info, Escrow>,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub user: Pubkey,
    pub treasury: Pubkey,
    pub session_id: [u8; 32],
    pub amount: u64,
    pub created_at: i64,
    pub released: bool,
    pub refunded: bool,
    pub rating: u8,
    pub bump: u8,
}

#[event]
pub struct EscrowCreated {
    pub escrow: Pubkey,
    pub user: Pubkey,
    pub session_id: [u8; 32],
    pub amount: u64,
}

#[event]
pub struct EscrowReleased {
    pub escrow: Pubkey,
    pub treasury: Pubkey,
    pub amount: u64,
    pub rating: u8,
}

#[event]
pub struct EscrowRefunded {
    pub escrow: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub rating: u8,
}

#[event]
pub struct EscrowTimeout {
    pub escrow: Pubkey,
    pub treasury: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum EscrowError {
    #[msg("Invalid rating (must be 1-5)")]
    InvalidRating,
    #[msg("Escrow already processed")]
    AlreadyProcessed,
    #[msg("Not timed out yet")]
    NotTimedOut,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid treasury")]
    InvalidTreasury,
}
