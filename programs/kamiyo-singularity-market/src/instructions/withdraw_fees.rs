use crate::errors::MarketError;
use crate::state::Market;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

/// Fee recipient type for split withdrawals
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum FeeRecipient {
    /// Protocol treasury withdrawal
    Protocol,
    /// Market creator withdrawal
    Creator,
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    /// Permissionless relayer that executes the sweep transaction
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        constraint = market.accumulated_fees > 0 @ MarketError::NoFeesToWithdraw
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [Market::VAULT_SEED, market.key().as_ref()],
        bump = market.vault_bump
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Recipient account to receive fees
    #[account(
        mut,
        constraint = recipient.mint == market.collateral_mint @ MarketError::InvalidCollateral
    )]
    pub recipient: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

fn calculate_withdraw_amount(
    market: &Market,
    recipient_owner: Pubkey,
    recipient_type: FeeRecipient,
) -> Result<u64> {
    let withdraw_amount = match recipient_type {
        FeeRecipient::Protocol => {
            require!(
                recipient_owner == market.protocol_treasury,
                MarketError::UnauthorizedWithdrawal
            );
            market.available_protocol_fees()
        }
        FeeRecipient::Creator => return err!(MarketError::CreatorFeeWithdrawalDisabled),
    };

    require!(withdraw_amount > 0, MarketError::NoFeesToWithdraw);
    Ok(withdraw_amount)
}

/// Withdraw fees into the protocol flywheel destination.
///
/// Security:
/// - Protocol fees: Recipient token account owner must equal protocol treasury authority
/// - Creator fees: Disabled for Singularity flywheel routing
/// - Tracks separate withdrawal amounts to prevent double withdrawal
pub fn handler(ctx: Context<WithdrawFees>, recipient_type: FeeRecipient) -> Result<()> {
    let market = &ctx.accounts.market;
    let withdraw_amount =
        calculate_withdraw_amount(market, ctx.accounts.recipient.owner, recipient_type)?;

    // Verify vault has sufficient balance before transfer
    require!(
        ctx.accounts.vault.amount >= withdraw_amount,
        MarketError::InsufficientVaultBalance
    );

    // Transfer fees from vault to recipient
    let seeds = &[
        Market::SEED_PREFIX,
        market.market_id.as_bytes(),
        &[market.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.recipient.to_account_info(),
            authority: ctx.accounts.market.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, withdraw_amount)?;

    // Update market state
    let market = &mut ctx.accounts.market;

    match recipient_type {
        FeeRecipient::Protocol => {
            market.protocol_fees_withdrawn = market
                .protocol_fees_withdrawn
                .checked_add(withdraw_amount)
                .ok_or(MarketError::ArithmeticOverflow)?;
        }
        FeeRecipient::Creator => return err!(MarketError::CreatorFeeWithdrawalDisabled),
    }

    // Decrease total_collateral since fees are part of vault balance
    market.total_collateral = market
        .total_collateral
        .checked_sub(withdraw_amount)
        .ok_or(MarketError::ArithmeticOverflow)?;

    emit!(FeesWithdrawn {
        market: market.key(),
        recipient_type,
        recipient: ctx.accounts.recipient.key(),
        amount: withdraw_amount,
        protocol_fees_withdrawn: market.protocol_fees_withdrawn,
        creator_fees_withdrawn: market.creator_fees_withdrawn,
    });

    Ok(())
}

#[event]
pub struct FeesWithdrawn {
    pub market: Pubkey,
    pub recipient_type: FeeRecipient,
    pub recipient: Pubkey,
    pub amount: u64,
    pub protocol_fees_withdrawn: u64,
    pub creator_fees_withdrawn: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_market() -> Market {
        Market {
            market_id: String::new(),
            question: String::new(),
            description: String::new(),
            category: String::new(),
            authority: Pubkey::default(),
            oracle: Pubkey::default(),
            yes_mint: Pubkey::default(),
            no_mint: Pubkey::default(),
            vault: Pubkey::default(),
            collateral_mint: Pubkey::default(),
            status: crate::state::MarketStatus::Active,
            resolution_deadline: 0,
            trading_end: 0,
            resolved_outcome: 0,
            total_collateral: 0,
            total_yes_supply: 0,
            total_no_supply: 0,
            fee_bps: 100,
            protocol_fee_share_bps: 10_000,
            protocol_treasury: Pubkey::new_unique(),
            accumulated_fees: 1_000_000,
            protocol_fees_withdrawn: 100_000,
            creator_fees_withdrawn: 0,
            bump: 0,
            yes_mint_bump: 0,
            no_mint_bump: 0,
            vault_bump: 0,
            created_at: 0,
            resolved_at: 0,
        }
    }

    #[test]
    fn protocol_withdraw_amount_is_available_protocol_fees() {
        let market = test_market();
        let amount =
            calculate_withdraw_amount(&market, market.protocol_treasury, FeeRecipient::Protocol)
                .expect("withdraw amount");
        assert_eq!(amount, 900_000);
    }

    #[test]
    fn protocol_withdraw_rejects_wrong_recipient_owner() {
        let market = test_market();
        let result =
            calculate_withdraw_amount(&market, Pubkey::new_unique(), FeeRecipient::Protocol);
        let err = result.expect_err("expected unauthorized withdrawal");
        assert!(err.to_string().contains("Unauthorized withdrawal"));
    }

    #[test]
    fn creator_withdraw_is_disabled() {
        let market = test_market();
        let result =
            calculate_withdraw_amount(&market, market.protocol_treasury, FeeRecipient::Creator);
        let err = result.expect_err("expected creator withdrawal to be disabled");
        assert!(err
            .to_string()
            .contains("Creator fee withdrawals are disabled"));
    }
}
