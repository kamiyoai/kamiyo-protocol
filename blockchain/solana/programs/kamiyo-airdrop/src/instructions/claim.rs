use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::*;
use crate::errors::AirdropError;
use crate::state::{AirdropConfig, ClaimEvent, ClaimStatus};
use crate::utils::{create_leaf, verify_merkle_proof};

/// Claim airdrop allocation with merkle proof
///
/// Users call this instruction to claim their KAMIYO allocation. The claim requires:
/// 1. Valid merkle proof showing eligibility
/// 2. Claim period is active (within 90 days)
/// 3. User hasn't claimed before (ClaimStatus doesn't exist yet)
///
/// # Arguments
/// * `amount` - Allocation amount in lamports (from points system calculation)
/// * `proof` - Array of merkle proof hashes to verify eligibility
///
/// # Security
/// - Merkle proof verification prevents unauthorized claims
/// - ClaimStatus PDA prevents double-claims
/// - Time-based checks ensure claims only during valid period
/// - Amount limits prevent excessive claims
pub fn claim(
    ctx: Context<Claim>,
    amount: u64,
    proof: Vec<[u8; 32]>,
) -> Result<()> {
    let config = &mut ctx.accounts.airdrop_config;
    let clock = Clock::get()?;

    // 1. Check airdrop is active
    require!(config.is_active, AirdropError::AirdropInactive);

    // 2. Check claim period
    require!(
        clock.unix_timestamp >= config.claim_start,
        AirdropError::ClaimNotStarted
    );
    require!(
        clock.unix_timestamp <= config.claim_end,
        AirdropError::ClaimExpired
    );

    // 3. Validate allocation amount
    require!(
        amount >= MIN_ALLOCATION_TO_CLAIM,
        AirdropError::AllocationBelowMinimum
    );
    require!(
        amount <= MAX_ALLOCATION_PER_WALLET,
        AirdropError::AllocationExceedsMaximum
    );

    // 4. Verify merkle proof
    let leaf = create_leaf(ctx.accounts.claimant.key(), amount);
    require!(
        verify_merkle_proof(leaf, proof.clone(), config.merkle_root),
        AirdropError::InvalidProof
    );

    // 5. Transfer tokens from vault to claimant
    // Use PDA signer for vault authority
    let seeds = &[
        VAULT_AUTHORITY_SEED,
        config.key().as_ref(),
        &[ctx.bumps.vault_authority],
    ];
    let signer_seeds = &[&seeds[..]];

    let decimals = ctx.accounts.mint.decimals;

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.claimant_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        decimals,
    )?;

    // 6. Update airdrop statistics
    config.total_claimed = config
        .total_claimed
        .checked_add(amount)
        .ok_or(AirdropError::MathOverflow)?;
    config.total_claimants = config
        .total_claimants
        .checked_add(1)
        .ok_or(AirdropError::MathOverflow)?;

    // 7. Record claim status
    let claim_status = &mut ctx.accounts.claim_status;
    claim_status.claimant = ctx.accounts.claimant.key();
    claim_status.amount = amount;
    claim_status.claimed_at = clock.unix_timestamp;
    claim_status.bump = ctx.bumps.claim_status;

    // 8. Emit claim event
    emit!(ClaimEvent {
        claimant: ctx.accounts.claimant.key(),
        amount,
        timestamp: clock.unix_timestamp,
    });

    msg!("Claim successful!");
    msg!("Claimant: {}", ctx.accounts.claimant.key());
    msg!("Amount: {} lamports ({} KAMIYO)", amount, amount / 1_000_000_000);
    msg!("Total claimed: {}", config.total_claimed);
    msg!("Total claimants: {}", config.total_claimants);

    Ok(())
}

/// Accounts required for claim instruction
#[derive(Accounts)]
pub struct Claim<'info> {
    /// User claiming their airdrop allocation
    #[account(mut)]
    pub claimant: Signer<'info>,

    /// Airdrop configuration account (PDA)
    #[account(
        mut,
        seeds = [AIRDROP_SEED, mint.key().as_ref()],
        bump = airdrop_config.bump,
    )]
    pub airdrop_config: Account<'info, AirdropConfig>,

    /// Claim status account (PDA) - created to prevent double-claims
    /// Seeds: [b"claim", airdrop_config.key(), claimant.key()]
    /// Using init ensures this account doesn't exist yet (first claim)
    #[account(
        init,
        payer = claimant,
        space = ClaimStatus::LEN,
        seeds = [CLAIM_SEED, airdrop_config.key().as_ref(), claimant.key().as_ref()],
        bump
    )]
    pub claim_status: Account<'info, ClaimStatus>,

    /// Vault authority (PDA) that controls the token vault
    /// Seeds: [b"vault_authority", airdrop_config.key()]
    /// CHECK: PDA used as signer for vault transfers
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, airdrop_config.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    /// Token vault holding airdrop tokens
    #[account(
        mut,
        constraint = vault.mint == mint.key() @ AirdropError::InvalidMint,
        constraint = vault.owner == vault_authority.key(),
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Claimant's token account to receive KAMIYO
    #[account(
        mut,
        constraint = claimant_token_account.mint == mint.key() @ AirdropError::InvalidMint,
        constraint = claimant_token_account.owner == claimant.key(),
    )]
    pub claimant_token_account: InterfaceAccount<'info, TokenAccount>,

    /// KAMIYO token mint (Token-2022)
    pub mint: InterfaceAccount<'info, Mint>,

    /// Token program (Token-2022)
    pub token_program: Interface<'info, TokenInterface>,

    /// System program for claim status account creation
    pub system_program: Program<'info, System>,
}
