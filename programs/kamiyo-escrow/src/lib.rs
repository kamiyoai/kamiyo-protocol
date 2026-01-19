use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

declare_id!("J1Xdi9mhSGR9oy1z2CRKJEiQ3mVFBf5ZG8EXyJfhYaZY");

/// $KAMIYO token mint on pump.fun (6 decimals)
pub const KAMIYO_MINT: Pubkey = pubkey!("Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump");

/// Fee for creating an escrow: 50 KAMIYO (with 6 decimals)
pub const FEE_CREATE_ESCROW: u64 = 50_000_000;

/// Burn rate: 1% (100 basis points)
pub const BURN_RATE_BPS: u64 = 100;

/// Calculate burn and treasury amounts for a fee
fn calculate_fee_split(total_fee: u64) -> (u64, u64) {
    let burn_amount = total_fee * BURN_RATE_BPS / 10_000;
    let treasury_amount = total_fee - burn_amount;
    (burn_amount, treasury_amount)
}

#[program]
pub mod kamiyo_escrow {
    use super::*;

    /// Create a new escrow for a Companion session
    /// Requires payment of 50 KAMIYO (1% burned, 99% to treasury)
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        session_id: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        // Collect KAMIYO fee: burn 1%, transfer 99% to treasury
        let (burn_amount, treasury_amount) = calculate_fee_split(FEE_CREATE_ESCROW);

        // Burn 1% of fee
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.kamiyo_mint.to_account_info(),
                    from: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            burn_amount,
        )?;

        // Transfer 99% to token treasury
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.token_treasury.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            treasury_amount,
        )?;

        // Save keys before mutable borrow
        let escrow_key = ctx.accounts.escrow.key();
        let user_key = ctx.accounts.user.key();
        let treasury_key = ctx.accounts.treasury.key();
        let clock = Clock::get()?;

        // Transfer SOL to escrow PDA (before mutable borrow)
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &user_key,
            &escrow_key,
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

        // Now do the mutable borrow
        let escrow = &mut ctx.accounts.escrow;
        escrow.user = user_key;
        escrow.treasury = treasury_key;
        escrow.session_id = session_id;
        escrow.amount = amount;
        escrow.created_at = clock.unix_timestamp;
        escrow.released = false;
        escrow.refunded = false;
        escrow.rating = 0;
        escrow.bump = ctx.bumps.escrow;

        emit!(EscrowCreated {
            escrow: escrow_key,
            user: user_key,
            session_id,
            amount,
        });

        emit!(KamiyoFeePaid {
            escrow: escrow_key,
            total_fee: FEE_CREATE_ESCROW,
            burned: burn_amount,
            treasury: treasury_amount,
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

    /// CHECK: Treasury receives SOL funds
    pub treasury: AccountInfo<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", user.key().as_ref(), &session_id],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    /// $KAMIYO token mint for fee payment
    #[account(
        mut,
        constraint = kamiyo_mint.key() == KAMIYO_MINT @ EscrowError::InvalidKamiyoMint
    )]
    pub kamiyo_mint: Account<'info, Mint>,

    /// User's KAMIYO token account (pays fee)
    #[account(
        mut,
        constraint = user_token_account.mint == kamiyo_mint.key(),
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// Token treasury account (receives 99% of fee)
    #[account(
        mut,
        seeds = [b"token_treasury"],
        bump
    )]
    pub token_treasury: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
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
    #[msg("Invalid KAMIYO token mint")]
    InvalidKamiyoMint,
}

#[event]
pub struct KamiyoFeePaid {
    pub escrow: Pubkey,
    pub total_fee: u64,
    pub burned: u64,
    pub treasury: u64,
}
