use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_spl::token_interface::{
    self, Mint as MintInterface, TokenAccount as TokenAccountInterface, TokenInterface,
};

declare_id!("AbrWhvNBBL7ZUZ3AZ6ASgN74JiTrn8Gtctrb7uC9Mzbu");

/// $KAMIYO token mint on pump.fun (6 decimals)
pub const KAMIYO_MINT: Pubkey = pubkey!("Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump");

/// Fee for creating an escrow: 50 KAMIYO (with 6 decimals)
pub const FEE_CREATE_ESCROW: u64 = 50_000_000;

/// Burn rate: 1% (100 basis points)
pub const BURN_RATE_BPS: u64 = 100;

// Dispute resolution constants
pub const COMMIT_PHASE_DURATION: i64 = 300; // 5 minutes
pub const REVEAL_PHASE_DURATION: i64 = 1800; // 30 minutes
pub const MIN_CONSENSUS_ORACLES: u8 = 3;
pub const MAX_SCORE_DEVIATION: u8 = 15; // 15% deviation tolerance
pub const ESCROW_TIMEOUT: i64 = 7 * 24 * 60 * 60; // 7 days
pub const DISPUTE_TIMEOUT: i64 = 3 * 24 * 60 * 60; // 72 hours for disputed escrows
pub const MAX_ORACLES_PER_ESCROW: usize = 5;

/// Minimum stake required for oracles (100,000 KAMIYO = 100,000 * 10^6)
pub const MIN_ORACLE_STAKE: u64 = 100_000_000_000;

/// Kamiyo staking program ID
pub const KAMIYO_STAKING_PROGRAM_ID: Pubkey = pubkey!("9QZGdEZ13j8fASEuhpj3eVwUPT4BpQjXSabVjRppJW2N");

// Quality-based refund thresholds
pub const QUALITY_FULL_REFUND_THRESHOLD: u8 = 50; // 0-49 = 100% refund
pub const QUALITY_HIGH_REFUND_THRESHOLD: u8 = 65; // 50-64 = 75% refund
pub const QUALITY_LOW_REFUND_THRESHOLD: u8 = 80; // 65-79 = 35% refund
// 80-100 = 0% refund

/// Calculate burn and treasury amounts for a fee
fn calculate_fee_split(total_fee: u64) -> (u64, u64) {
    let burn_amount = total_fee * BURN_RATE_BPS / 10_000;
    let treasury_amount = total_fee - burn_amount;
    (burn_amount, treasury_amount)
}

/// Calculate refund percentage based on quality score
fn calculate_refund_percentage(quality_score: u8) -> u8 {
    if quality_score < QUALITY_FULL_REFUND_THRESHOLD {
        100 // Full refund for poor quality
    } else if quality_score < QUALITY_HIGH_REFUND_THRESHOLD {
        75 // 75% refund
    } else if quality_score < QUALITY_LOW_REFUND_THRESHOLD {
        35 // 35% refund
    } else {
        0 // No refund for good quality
    }
}

/// Domain separator for commitment hash (collision prevention)
const COMMITMENT_DOMAIN: &[u8] = b"kamiyo-escrow-v1:commit";

/// Verify oracle has minimum stake via stake position PDA
/// Returns true if oracle has sufficient stake, false otherwise
fn verify_oracle_stake(stake_position_info: &AccountInfo, oracle: &Pubkey) -> Result<bool> {
    // Stake position PDA: seeds = ["stake_position", owner]
    let (expected_pda, _bump) = Pubkey::find_program_address(
        &[b"stake_position", oracle.as_ref()],
        &KAMIYO_STAKING_PROGRAM_ID,
    );

    // Verify the account is the correct PDA
    if stake_position_info.key() != expected_pda {
        return Ok(false);
    }

    // Verify account is owned by staking program
    if stake_position_info.owner != &KAMIYO_STAKING_PROGRAM_ID {
        return Ok(false);
    }

    // Read stake amount from account data
    // StakePosition layout: 8 (discriminator) + 32 (owner) + 8 (staked_amount) + ...
    let data = stake_position_info.try_borrow_data()?;
    if data.len() < 48 {
        return Ok(false);
    }

    // Verify owner matches
    let owner_bytes: [u8; 32] = data[8..40].try_into().map_err(|_| EscrowError::InvalidStakePosition)?;
    if Pubkey::from(owner_bytes) != *oracle {
        return Ok(false);
    }

    // Read staked_amount (u64 little-endian at offset 40)
    let staked_amount = u64::from_le_bytes(
        data[40..48].try_into().map_err(|_| EscrowError::InvalidStakePosition)?
    );

    Ok(staked_amount >= MIN_ORACLE_STAKE)
}

/// Compute commitment hash with domain separation
/// Hash = SHA256(domain || len(session_id) || session_id || len(oracle) || oracle || score || len(salt) || salt)
fn compute_commitment_hash(
    session_id: &[u8; 32],
    oracle: &Pubkey,
    score: u8,
    salt: &[u8; 32],
) -> [u8; 32] {
    let oracle_bytes = oracle.as_ref();
    let mut data = Vec::with_capacity(COMMITMENT_DOMAIN.len() + 1 + 32 + 1 + 32 + 1 + 1 + 32);
    data.extend_from_slice(COMMITMENT_DOMAIN);
    data.push(32); // session_id length
    data.extend_from_slice(session_id);
    data.push(32); // oracle length
    data.extend_from_slice(oracle_bytes);
    data.push(score);
    data.push(32); // salt length
    data.extend_from_slice(salt);
    hash(&data).to_bytes()
}

#[program]
pub mod kamiyo_escrow {
    use super::*;

    /// Initialize oracle configuration (one-time admin setup)
    pub fn initialize_oracle_config(
        ctx: Context<InitializeOracleConfig>,
        min_consensus: u8,
        max_score_deviation: u8,
        commit_duration: i64,
        reveal_duration: i64,
        require_stake: bool,
    ) -> Result<()> {
        require!(min_consensus >= 3, EscrowError::InvalidConsensusConfig);
        require!(max_score_deviation <= 50, EscrowError::InvalidConsensusConfig);
        require!(commit_duration >= 60, EscrowError::InvalidTimingConfig); // Min 1 minute
        require!(reveal_duration >= 300, EscrowError::InvalidTimingConfig); // Min 5 minutes

        let config = &mut ctx.accounts.oracle_config;
        config.admin = ctx.accounts.admin.key();
        config.min_consensus = min_consensus;
        config.max_score_deviation = max_score_deviation;
        config.commit_duration = commit_duration;
        config.reveal_duration = reveal_duration;
        config.require_stake = require_stake;
        config.bump = ctx.bumps.oracle_config;

        emit!(OracleConfigInitialized {
            admin: config.admin,
            min_consensus,
            max_score_deviation,
            commit_duration,
            reveal_duration,
            require_stake,
        });

        Ok(())
    }

    /// Register an oracle (admin only)
    pub fn register_oracle(
        ctx: Context<RegisterOracle>,
        oracle_pubkey: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.oracle_config;

        // Check not already registered
        require!(
            !config.registered_oracles.contains(&oracle_pubkey),
            EscrowError::OracleAlreadyRegistered
        );
        require!(
            config.registered_oracles.len() < 50,
            EscrowError::TooManyOracles
        );

        config.registered_oracles.push(oracle_pubkey);

        emit!(OracleRegistered {
            oracle: oracle_pubkey,
            total_oracles: config.registered_oracles.len() as u8,
        });

        Ok(())
    }

    /// Remove an oracle (admin only)
    pub fn remove_oracle(
        ctx: Context<RemoveOracle>,
        oracle_pubkey: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.oracle_config;

        let index = config
            .registered_oracles
            .iter()
            .position(|o| *o == oracle_pubkey)
            .ok_or(EscrowError::OracleNotRegistered)?;

        config.registered_oracles.remove(index);

        emit!(OracleRemoved {
            oracle: oracle_pubkey,
            total_oracles: config.registered_oracles.len() as u8,
        });

        Ok(())
    }

    /// Create a new escrow for a Companion session
    /// Requires payment of 50 KAMIYO (1% burned, 99% to treasury)
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        session_id: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        // Collect KAMIYO fee: burn 1%, transfer 99% to treasury
        let (burn_amount, treasury_amount) = calculate_fee_split(FEE_CREATE_ESCROW);
        let decimals = ctx.accounts.kamiyo_mint.decimals;

        // Burn 1% of fee
        token_interface::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_interface::Burn {
                    mint: ctx.accounts.kamiyo_mint.to_account_info(),
                    from: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            burn_amount,
        )?;

        // Transfer 99% to token treasury
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    mint: ctx.accounts.kamiyo_mint.to_account_info(),
                    to: ctx.accounts.token_treasury.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            treasury_amount,
            decimals,
        )?;

        // Save keys before mutable borrow
        let escrow_key = ctx.accounts.escrow.key();
        let user_key = ctx.accounts.user.key();
        let treasury_key = ctx.accounts.treasury.key();
        let clock = Clock::get()?;

        // Transfer SOL to escrow PDA
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

        // Initialize escrow state
        let escrow = &mut ctx.accounts.escrow;
        escrow.user = user_key;
        escrow.treasury = treasury_key;
        escrow.session_id = session_id;
        escrow.amount = amount;
        escrow.created_at = clock.unix_timestamp;
        escrow.bump = ctx.bumps.escrow;
        escrow.status = EscrowStatus::Active;
        escrow.rating = None;
        escrow.disputed_at = None;
        escrow.commit_phase_ends_at = None;
        escrow.quality_score = None;
        escrow.refund_percentage = None;

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

    /// Rate session and release escrow if rating >= 3 (simple path)
    pub fn rate_and_release(ctx: Context<RateAndRelease>, rating: u8) -> Result<()> {
        require!(rating >= 1 && rating <= 5, EscrowError::InvalidRating);

        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Active,
            EscrowError::InvalidStatus
        );

        escrow.rating = Some(rating);

        if rating >= 3 {
            escrow.status = EscrowStatus::Released;

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
            escrow.status = EscrowStatus::Refunded;

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

    /// User marks escrow as disputed (initiates oracle resolution)
    pub fn mark_disputed(ctx: Context<MarkDisputed>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let clock = Clock::get()?;

        require!(
            escrow.status == EscrowStatus::Active,
            EscrowError::InvalidStatus
        );

        // Cannot dispute after timeout
        require!(
            clock.unix_timestamp <= escrow.created_at + ESCROW_TIMEOUT,
            EscrowError::EscrowTimedOut
        );

        escrow.status = EscrowStatus::Disputed;
        escrow.disputed_at = Some(clock.unix_timestamp);

        emit!(DisputeMarked {
            escrow: escrow.key(),
            user: escrow.user,
            disputed_at: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Oracle commits their quality score hash (commit-reveal phase 1)
    pub fn commit_vote(
        ctx: Context<CommitVote>,
        commitment_hash: [u8; 32],
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let config = &ctx.accounts.oracle_config;
        let oracle = ctx.accounts.oracle.key();
        let clock = Clock::get()?;

        require!(
            escrow.status == EscrowStatus::Disputed,
            EscrowError::InvalidStatus
        );

        // Verify oracle is registered
        require!(
            config.registered_oracles.contains(&oracle),
            EscrowError::OracleNotRegistered
        );

        // Verify oracle stake if required (sybil protection)
        if config.require_stake {
            let stake_position = ctx.accounts.oracle_stake_position
                .as_ref()
                .ok_or(EscrowError::StakePositionRequired)?;
            require!(
                verify_oracle_stake(stake_position, &oracle)?,
                EscrowError::InsufficientOracleStake
            );
        }

        // Check oracle hasn't already committed
        require!(
            !escrow.oracle_commitments.iter().any(|c| c.oracle == oracle),
            EscrowError::OracleAlreadyCommitted
        );

        require!(
            escrow.oracle_commitments.len() < MAX_ORACLES_PER_ESCROW,
            EscrowError::TooManyOracleCommitments
        );

        // First commitment starts the commit phase
        if escrow.commit_phase_ends_at.is_none() {
            escrow.commit_phase_ends_at = Some(clock.unix_timestamp + config.commit_duration);
        }

        // Verify within commit window
        require!(
            clock.unix_timestamp < escrow.commit_phase_ends_at.unwrap(),
            EscrowError::CommitPhaseEnded
        );

        escrow.oracle_commitments.push(OracleCommitment {
            oracle,
            commitment_hash,
            committed_at: clock.unix_timestamp,
            revealed: false,
        });

        emit!(OracleScoreCommitted {
            escrow: escrow.key(),
            oracle,
            commitment_count: escrow.oracle_commitments.len() as u8,
        });

        Ok(())
    }

    /// Oracle reveals their quality score (commit-reveal phase 2)
    pub fn reveal_vote(
        ctx: Context<RevealVote>,
        quality_score: u8,
        salt: [u8; 32],
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let config = &ctx.accounts.oracle_config;
        let oracle = ctx.accounts.oracle.key();
        let clock = Clock::get()?;

        require!(
            escrow.status == EscrowStatus::Disputed,
            EscrowError::InvalidStatus
        );
        require!(quality_score <= 100, EscrowError::InvalidQualityScore);

        // Verify commit phase has ended
        let commit_ends = escrow
            .commit_phase_ends_at
            .ok_or(EscrowError::NoCommitments)?;
        require!(
            clock.unix_timestamp >= commit_ends,
            EscrowError::CommitPhaseNotEnded
        );

        // Verify within reveal window
        let reveal_ends = commit_ends + config.reveal_duration;
        require!(
            clock.unix_timestamp < reveal_ends,
            EscrowError::RevealPhaseExpired
        );

        // Copy session_id before mutable borrow
        let session_id = escrow.session_id;

        // Find oracle's commitment
        let commitment = escrow
            .oracle_commitments
            .iter_mut()
            .find(|c| c.oracle == oracle)
            .ok_or(EscrowError::NoCommitmentFound)?;

        require!(!commitment.revealed, EscrowError::AlreadyRevealed);

        // Verify hash matches
        let expected_hash =
            compute_commitment_hash(&session_id, &oracle, quality_score, &salt);
        require!(
            commitment.commitment_hash == expected_hash,
            EscrowError::InvalidCommitmentHash
        );

        commitment.revealed = true;

        // Check oracle hasn't already submitted
        require!(
            !escrow.oracle_submissions.iter().any(|s| s.oracle == oracle),
            EscrowError::OracleAlreadySubmitted
        );

        escrow.oracle_submissions.push(OracleSubmission {
            oracle,
            quality_score,
            submitted_at: clock.unix_timestamp,
        });

        emit!(OracleScoreRevealed {
            escrow: escrow.key(),
            oracle,
            quality_score,
            submission_count: escrow.oracle_submissions.len() as u8,
        });

        Ok(())
    }

    /// Finalize dispute resolution (permissionless once consensus reached)
    pub fn finalize_dispute(ctx: Context<FinalizeDispute>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let config = &ctx.accounts.oracle_config;
        let clock = Clock::get()?;

        require!(
            escrow.status == EscrowStatus::Disputed,
            EscrowError::InvalidStatus
        );

        // Verify minimum submissions
        require!(
            escrow.oracle_submissions.len() >= config.min_consensus as usize,
            EscrowError::InsufficientOracleConsensus
        );

        // Verify reveal phase has ended (or we have enough oracles)
        let commit_ends = escrow
            .commit_phase_ends_at
            .ok_or(EscrowError::NoCommitments)?;
        let reveal_ends = commit_ends + config.reveal_duration;

        // Either reveal phase ended, or we have all committed oracles revealed
        let all_revealed = escrow
            .oracle_commitments
            .iter()
            .all(|c| c.revealed);
        require!(
            clock.unix_timestamp >= reveal_ends || all_revealed,
            EscrowError::RevealPhaseNotEnded
        );

        // Calculate median quality score
        let mut scores: Vec<u8> = escrow
            .oracle_submissions
            .iter()
            .map(|s| s.quality_score)
            .collect();
        scores.sort_unstable();

        let median_score = if scores.len() % 2 == 0 {
            let mid = scores.len() / 2;
            ((scores[mid - 1] as u16 + scores[mid] as u16) / 2) as u8
        } else {
            scores[scores.len() / 2]
        };

        // Check for outliers using max_score_deviation from config
        // Count how many scores deviate too far from median
        let max_deviation = config.max_score_deviation;
        let outlier_count = scores
            .iter()
            .filter(|&&score| {
                let diff = if score > median_score {
                    score - median_score
                } else {
                    median_score - score
                };
                diff > max_deviation
            })
            .count();

        // If majority are outliers, consensus is suspect (potential collusion)
        require!(
            outlier_count * 2 < scores.len(),
            EscrowError::SuspiciousOracleConsensus
        );

        // Calculate refund percentage
        let refund_pct = calculate_refund_percentage(median_score);

        escrow.quality_score = Some(median_score);
        escrow.refund_percentage = Some(refund_pct);
        escrow.status = EscrowStatus::Resolved;

        // Calculate fund distribution
        let refund_amount = (escrow.amount as u128)
            .checked_mul(refund_pct as u128)
            .ok_or(EscrowError::ArithmeticOverflow)?
            .checked_div(100)
            .ok_or(EscrowError::ArithmeticOverflow)? as u64;
        let payment_amount = escrow.amount.saturating_sub(refund_amount);

        // Transfer funds
        if refund_amount > 0 {
            **escrow.to_account_info().try_borrow_mut_lamports()? -= refund_amount;
            **ctx.accounts.user.try_borrow_mut_lamports()? += refund_amount;
        }

        if payment_amount > 0 {
            **escrow.to_account_info().try_borrow_mut_lamports()? -= payment_amount;
            **ctx.accounts.treasury.try_borrow_mut_lamports()? += payment_amount;
        }

        emit!(DisputeResolved {
            escrow: escrow.key(),
            quality_score: median_score,
            refund_percentage: refund_pct,
            refund_amount,
            payment_amount,
            oracle_count: escrow.oracle_submissions.len() as u8,
        });

        Ok(())
    }

    /// Auto-release after timeout (7 days) - can be called by anyone
    pub fn timeout_release(ctx: Context<TimeoutRelease>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let clock = Clock::get()?;

        require!(
            escrow.status == EscrowStatus::Active,
            EscrowError::InvalidStatus
        );

        require!(
            clock.unix_timestamp > escrow.created_at + ESCROW_TIMEOUT,
            EscrowError::NotTimedOut
        );

        escrow.status = EscrowStatus::Released;

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

    /// Release disputed escrow after 72h timeout if oracles fail to resolve
    /// Returns funds to user as a safety fallback
    pub fn disputed_timeout_release(ctx: Context<DisputedTimeoutRelease>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let config = &ctx.accounts.oracle_config;
        let clock = Clock::get()?;

        require!(
            escrow.status == EscrowStatus::Disputed,
            EscrowError::InvalidStatus
        );

        let disputed_at = escrow.disputed_at.ok_or(EscrowError::NotDisputed)?;

        // Check if dispute timeout has passed
        require!(
            clock.unix_timestamp > disputed_at + DISPUTE_TIMEOUT,
            EscrowError::DisputeNotTimedOut
        );

        // Check that we don't have enough oracle consensus
        // If oracles reached consensus, they should call finalize_dispute instead
        let has_consensus = escrow.oracle_submissions.len() >= config.min_consensus as usize;
        require!(
            !has_consensus,
            EscrowError::DisputeHasConsensus
        );

        // Refund to user since oracles failed to resolve
        escrow.status = EscrowStatus::Refunded;
        escrow.refund_percentage = Some(100);

        let amount = escrow.amount;
        **escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.user.try_borrow_mut_lamports()? += amount;

        emit!(DisputeTimeoutRefund {
            escrow: escrow.key(),
            user: ctx.accounts.user.key(),
            amount,
            oracle_submissions: escrow.oracle_submissions.len() as u8,
        });

        Ok(())
    }
}

// ============================================================================
// Account Contexts
// ============================================================================

#[derive(Accounts)]
pub struct InitializeOracleConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + OracleConfig::INIT_SPACE,
        seeds = [b"oracle_config"],
        bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterOracle<'info> {
    #[account(
        constraint = admin.key() == oracle_config.admin @ EscrowError::Unauthorized
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"oracle_config"],
        bump = oracle_config.bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,
}

#[derive(Accounts)]
pub struct RemoveOracle<'info> {
    #[account(
        constraint = admin.key() == oracle_config.admin @ EscrowError::Unauthorized
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"oracle_config"],
        bump = oracle_config.bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,
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

    /// $KAMIYO token mint for fee payment (Token-2022)
    #[account(
        mut,
        constraint = kamiyo_mint.key() == KAMIYO_MINT @ EscrowError::InvalidKamiyoMint
    )]
    pub kamiyo_mint: InterfaceAccount<'info, MintInterface>,

    /// User's KAMIYO token account (pays fee)
    #[account(
        mut,
        constraint = user_token_account.mint == kamiyo_mint.key(),
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccountInterface>,

    /// Token treasury account (receives 99% of fee)
    #[account(
        mut,
        seeds = [b"token_treasury"],
        bump
    )]
    pub token_treasury: InterfaceAccount<'info, TokenAccountInterface>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
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
pub struct MarkDisputed<'info> {
    #[account(
        constraint = user.key() == escrow.user @ EscrowError::Unauthorized
    )]
    pub user: Signer<'info>,

    #[account(mut)]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct CommitVote<'info> {
    pub oracle: Signer<'info>,

    #[account(mut)]
    pub escrow: Account<'info, Escrow>,

    #[account(
        seeds = [b"oracle_config"],
        bump = oracle_config.bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,

    /// Oracle's stake position from kamiyo-staking program (optional for sybil protection)
    /// CHECK: Validated in instruction if require_stake is enabled
    pub oracle_stake_position: Option<AccountInfo<'info>>,
}

#[derive(Accounts)]
pub struct RevealVote<'info> {
    pub oracle: Signer<'info>,

    #[account(mut)]
    pub escrow: Account<'info, Escrow>,

    #[account(
        seeds = [b"oracle_config"],
        bump = oracle_config.bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,
}

#[derive(Accounts)]
pub struct FinalizeDispute<'info> {
    /// CHECK: User receives refund
    #[account(
        mut,
        constraint = user.key() == escrow.user @ EscrowError::InvalidUser
    )]
    pub user: AccountInfo<'info>,

    /// CHECK: Treasury receives payment
    #[account(
        mut,
        constraint = treasury.key() == escrow.treasury @ EscrowError::InvalidTreasury
    )]
    pub treasury: AccountInfo<'info>,

    #[account(mut)]
    pub escrow: Account<'info, Escrow>,

    #[account(
        seeds = [b"oracle_config"],
        bump = oracle_config.bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,
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

#[derive(Accounts)]
pub struct DisputedTimeoutRelease<'info> {
    /// CHECK: User receives refund
    #[account(
        mut,
        constraint = user.key() == escrow.user @ EscrowError::InvalidUser
    )]
    pub user: AccountInfo<'info>,

    #[account(mut)]
    pub escrow: Account<'info, Escrow>,

    #[account(
        seeds = [b"oracle_config"],
        bump = oracle_config.bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,
}

// ============================================================================
// Account Structures
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct OracleConfig {
    pub admin: Pubkey,
    pub min_consensus: u8,
    pub max_score_deviation: u8,
    pub commit_duration: i64,
    pub reveal_duration: i64,
    pub bump: u8,
    /// Whether oracles must have minimum stake to participate (sybil protection)
    pub require_stake: bool,
    #[max_len(50)]
    pub registered_oracles: Vec<Pubkey>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Active,
    Disputed,
    Resolved,
    Released,
    Refunded,
}

impl Default for EscrowStatus {
    fn default() -> Self {
        EscrowStatus::Active
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct OracleCommitment {
    pub oracle: Pubkey,
    pub commitment_hash: [u8; 32],
    pub committed_at: i64,
    pub revealed: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct OracleSubmission {
    pub oracle: Pubkey,
    pub quality_score: u8,
    pub submitted_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub user: Pubkey,
    pub treasury: Pubkey,
    pub session_id: [u8; 32],
    pub amount: u64,
    pub created_at: i64,
    pub bump: u8,
    pub status: EscrowStatus,
    pub rating: Option<u8>,
    pub disputed_at: Option<i64>,
    pub commit_phase_ends_at: Option<i64>,
    #[max_len(5)]
    pub oracle_commitments: Vec<OracleCommitment>,
    #[max_len(5)]
    pub oracle_submissions: Vec<OracleSubmission>,
    pub quality_score: Option<u8>,
    pub refund_percentage: Option<u8>,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct OracleConfigInitialized {
    pub admin: Pubkey,
    pub min_consensus: u8,
    pub max_score_deviation: u8,
    pub commit_duration: i64,
    pub reveal_duration: i64,
    pub require_stake: bool,
}

#[event]
pub struct OracleRegistered {
    pub oracle: Pubkey,
    pub total_oracles: u8,
}

#[event]
pub struct OracleRemoved {
    pub oracle: Pubkey,
    pub total_oracles: u8,
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

#[event]
pub struct KamiyoFeePaid {
    pub escrow: Pubkey,
    pub total_fee: u64,
    pub burned: u64,
    pub treasury: u64,
}

#[event]
pub struct DisputeMarked {
    pub escrow: Pubkey,
    pub user: Pubkey,
    pub disputed_at: i64,
}

#[event]
pub struct OracleScoreCommitted {
    pub escrow: Pubkey,
    pub oracle: Pubkey,
    pub commitment_count: u8,
}

#[event]
pub struct OracleScoreRevealed {
    pub escrow: Pubkey,
    pub oracle: Pubkey,
    pub quality_score: u8,
    pub submission_count: u8,
}

#[event]
pub struct DisputeResolved {
    pub escrow: Pubkey,
    pub quality_score: u8,
    pub refund_percentage: u8,
    pub refund_amount: u64,
    pub payment_amount: u64,
    pub oracle_count: u8,
}

#[event]
pub struct DisputeTimeoutRefund {
    pub escrow: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub oracle_submissions: u8,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum EscrowError {
    #[msg("Invalid rating (must be 1-5)")]
    InvalidRating,
    #[msg("Invalid escrow status for this operation")]
    InvalidStatus,
    #[msg("Escrow already processed")]
    AlreadyProcessed,
    #[msg("Not timed out yet")]
    NotTimedOut,
    #[msg("Escrow has timed out")]
    EscrowTimedOut,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid treasury")]
    InvalidTreasury,
    #[msg("Invalid user")]
    InvalidUser,
    #[msg("Invalid KAMIYO token mint")]
    InvalidKamiyoMint,
    #[msg("Invalid consensus configuration")]
    InvalidConsensusConfig,
    #[msg("Invalid timing configuration")]
    InvalidTimingConfig,
    #[msg("Oracle not registered")]
    OracleNotRegistered,
    #[msg("Oracle already registered")]
    OracleAlreadyRegistered,
    #[msg("Too many oracles")]
    TooManyOracles,
    #[msg("Oracle already committed")]
    OracleAlreadyCommitted,
    #[msg("Too many oracle commitments")]
    TooManyOracleCommitments,
    #[msg("Commit phase has ended")]
    CommitPhaseEnded,
    #[msg("Commit phase has not ended yet")]
    CommitPhaseNotEnded,
    #[msg("No commitments found")]
    NoCommitments,
    #[msg("No commitment found for oracle")]
    NoCommitmentFound,
    #[msg("Oracle already revealed")]
    AlreadyRevealed,
    #[msg("Invalid commitment hash")]
    InvalidCommitmentHash,
    #[msg("Oracle already submitted")]
    OracleAlreadySubmitted,
    #[msg("Invalid quality score (must be 0-100)")]
    InvalidQualityScore,
    #[msg("Reveal phase has expired")]
    RevealPhaseExpired,
    #[msg("Reveal phase has not ended")]
    RevealPhaseNotEnded,
    #[msg("Insufficient oracle consensus")]
    InsufficientOracleConsensus,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Escrow is not disputed")]
    NotDisputed,
    #[msg("Dispute has not timed out yet")]
    DisputeNotTimedOut,
    #[msg("Dispute already has oracle consensus")]
    DisputeHasConsensus,
    #[msg("Suspicious oracle consensus detected")]
    SuspiciousOracleConsensus,
    #[msg("Oracle stake position required for participation")]
    StakePositionRequired,
    #[msg("Oracle does not have minimum required stake")]
    InsufficientOracleStake,
    #[msg("Invalid stake position account")]
    InvalidStakePosition,
}
