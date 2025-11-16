//! x402Resolve Escrow Program
//!
//! Time-locked PDA escrow with Ed25519-verified quality assessment
//! for HTTP 402 API dispute resolution.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    ed25519_program,
    sysvar::instructions::{load_instruction_at_checked, ID as INSTRUCTIONS_ID},
};
use switchboard_on_demand::on_demand::accounts::pull_feed::PullFeedAccountData;

declare_id!("E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n");

// Validation constants
const MIN_TIME_LOCK: i64 = 3600;                    // 1 hour
const MAX_TIME_LOCK: i64 = 2_592_000;               // 30 days
const MAX_ESCROW_AMOUNT: u64 = 1_000_000_000_000;   // 1000 SOL
const MIN_ESCROW_AMOUNT: u64 = 1_000_000;           // 0.001 SOL
// Dispute window constant - currently handled per-escrow
// const DISPUTE_WINDOW: i64 = 172_800;                // 48 hours
const BASE_DISPUTE_COST: u64 = 1_000_000;           // 0.001 SOL

#[event]
pub struct EscrowInitialized {
    pub escrow: Pubkey,
    pub agent: Pubkey,
    pub api: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
    pub transaction_id: String,
}

#[event]
pub struct DisputeMarked {
    pub escrow: Pubkey,
    pub agent: Pubkey,
    pub transaction_id: String,
    pub timestamp: i64,
}

#[event]
pub struct DisputeResolved {
    pub escrow: Pubkey,
    pub transaction_id: String,
    pub quality_score: u8,
    pub refund_percentage: u8,
    pub refund_amount: u64,
    pub payment_amount: u64,
    pub verifier: Pubkey,
}

#[event]
pub struct FundsReleased {
    pub escrow: Pubkey,
    pub transaction_id: String,
    pub amount: u64,
    pub api: Pubkey,
    pub timestamp: i64,
}

/// Verify Ed25519 signature instruction
///
/// Checks that an Ed25519 signature verification instruction exists in the transaction
/// and validates the signature against the expected message format
pub fn verify_ed25519_signature(
    instructions_sysvar: &AccountInfo,
    signature: &[u8; 64],
    verifier_pubkey: &Pubkey,
    message: &[u8],
) -> Result<()> {
        // Load the Ed25519 instruction from the sysvar
        // Expected to be at index 0 (before the current instruction)
        let ix = load_instruction_at_checked(0, instructions_sysvar)
            .map_err(|_| error!(EscrowError::InvalidSignature))?;

        // Verify it's the Ed25519 program
        require!(
            ix.program_id == ed25519_program::ID,
            EscrowError::InvalidSignature
        );

        // Ed25519 instruction data layout:
        // [0]: num_signatures (should be 1)
        // [1]: padding
        // [2..4]: signature_offset (u16)
        // [4..6]: signature_instruction_index (u16)
        // [6..8]: public_key_offset (u16)
        // [8..10]: public_key_instruction_index (u16)
        // [10..12]: message_data_offset (u16)
        // [12..14]: message_data_size (u16)
        // [14..16]: message_instruction_index (u16)
        // [16..]: data (signature + pubkey + message)

        require!(
            ix.data.len() >= 16,
            EscrowError::InvalidSignature
        );

        // Verify we have exactly 1 signature
        require!(
            ix.data[0] == 1,
            EscrowError::InvalidSignature
        );

        // Parse offsets
        let sig_offset = u16::from_le_bytes([ix.data[2], ix.data[3]]) as usize;
        let pubkey_offset = u16::from_le_bytes([ix.data[6], ix.data[7]]) as usize;
        let message_offset = u16::from_le_bytes([ix.data[10], ix.data[11]]) as usize;
        let message_size = u16::from_le_bytes([ix.data[12], ix.data[13]]) as usize;

        // Verify signature matches
        let ix_signature = &ix.data[sig_offset..sig_offset + 64];
        require!(
            ix_signature == signature,
            EscrowError::InvalidSignature
        );

        // Verify public key matches
        let ix_pubkey = &ix.data[pubkey_offset..pubkey_offset + 32];
        require!(
            ix_pubkey == verifier_pubkey.as_ref(),
            EscrowError::InvalidSignature
        );

        // Verify message matches
        let ix_message = &ix.data[message_offset..message_offset + message_size];
        require!(
            ix_message == message,
            EscrowError::InvalidSignature
        );

        Ok(())
}

/// x402Resolve Escrow Program
///
/// Holds payments in escrow with time-lock and dispute resolution.
/// Enables automated refunds based on verifier oracle signatures.
#[program]
pub mod x402_escrow {
    use super::*;

    /// Initialize a new escrow for agent-to-API payment
    ///
    /// # Arguments
    /// * `amount` - Amount to escrow (lamports)
    /// * `time_lock` - Duration before auto-release (seconds)
    /// * `transaction_id` - Unique transaction identifier
    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        amount: u64,
        time_lock: i64,
        transaction_id: String,
    ) -> Result<()> {
        // Validate inputs
        require!(
            amount >= MIN_ESCROW_AMOUNT,
            EscrowError::InvalidAmount
        );
        require!(
            amount <= MAX_ESCROW_AMOUNT,
            EscrowError::AmountTooLarge
        );
        require!(
            time_lock >= MIN_TIME_LOCK && time_lock <= MAX_TIME_LOCK,
            EscrowError::InvalidTimeLock
        );
        require!(
            !transaction_id.is_empty() && transaction_id.len() <= 64,
            EscrowError::InvalidTransactionId
        );

        let clock = Clock::get()?;

        // Initialize escrow state
        {
            let escrow = &mut ctx.accounts.escrow;
            escrow.agent = ctx.accounts.agent.key();
            escrow.api = ctx.accounts.api.key();
            escrow.amount = amount;
            escrow.status = EscrowStatus::Active;
            escrow.created_at = clock.unix_timestamp;
            escrow.expires_at = clock.unix_timestamp + time_lock;
            escrow.transaction_id = transaction_id.clone();
            escrow.bump = ctx.bumps.escrow;
        }

        // Verify transfer amount covers rent before executing
        let rent = Rent::get()?;
        let min_rent = rent.minimum_balance(8 + Escrow::INIT_SPACE);
        require!(
            amount >= min_rent,
            EscrowError::InsufficientRentReserve
        );

        // Transfer SOL to escrow PDA
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.agent.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, amount)?;

        let expires_at = clock.unix_timestamp + time_lock;
        msg!("Escrow initialized: {} SOL locked", amount as f64 / 1_000_000_000.0);
        msg!("Expires at: {}", expires_at);

        let escrow = &ctx.accounts.escrow;
        emit!(EscrowInitialized {
            escrow: escrow.key(),
            agent: escrow.agent,
            api: escrow.api,
            amount: escrow.amount,
            expires_at: escrow.expires_at,
            transaction_id: transaction_id,
        });

        Ok(())
    }

    /// Release funds to API (happy path - no dispute)
    ///
    /// Can be called by:
    /// - Agent (explicitly releasing)
    /// - Anyone after time_lock expires (auto-release)
    pub fn release_funds(ctx: Context<ReleaseFunds>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let clock = Clock::get()?;

        require!(
            escrow.status == EscrowStatus::Active,
            EscrowError::InvalidStatus
        );

        // Check if caller is agent OR time_lock expired
        let is_agent = ctx.accounts.agent.key() == escrow.agent;
        let time_lock_expired = clock.unix_timestamp >= escrow.expires_at;

        // If not agent, time lock must have expired
        if !is_agent {
            require!(time_lock_expired, EscrowError::TimeLockNotExpired);
        }

        require!(is_agent || time_lock_expired, EscrowError::Unauthorized);

        // Copy values before PDA signing
        let transfer_amount = escrow.amount;
        let transaction_id = escrow.transaction_id.clone();
        let bump = escrow.bump;

        // Transfer full amount to API
        let seeds = &[
            b"escrow",
            transaction_id.as_bytes(),
            &[bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.escrow.to_account_info(),
                to: ctx.accounts.api.to_account_info(),
            },
            signer,
        );
        anchor_lang::system_program::transfer(cpi_context, transfer_amount)?;

        let escrow = &mut ctx.accounts.escrow;
        escrow.status = EscrowStatus::Released;

        msg!("Funds released to API: {} SOL", escrow.amount as f64 / 1_000_000_000.0);

        let clock = Clock::get()?;
        emit!(FundsReleased {
            escrow: escrow.key(),
            transaction_id: escrow.transaction_id.clone(),
            amount: escrow.amount,
            api: escrow.api,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Resolve dispute with verifier oracle signature
    ///
    /// x402 Verifier Oracle assesses quality and signs a refund percentage.
    /// This instruction validates the signature and splits funds accordingly.
    ///
    /// # Arguments
    /// * `quality_score` - Quality score from verifier (0-100)
    /// * `refund_percentage` - Refund percentage (0-100)
    /// * `signature` - Ed25519 signature from verifier oracle
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        quality_score: u8,
        refund_percentage: u8,
        signature: [u8; 64],
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;

        require!(
            escrow.status == EscrowStatus::Active || escrow.status == EscrowStatus::Disputed,
            EscrowError::InvalidStatus
        );

        require!(quality_score <= 100, EscrowError::InvalidQualityScore);
        require!(refund_percentage <= 100, EscrowError::InvalidRefundPercentage);

        // Verify signature from verifier oracle
        // Message format: "{transaction_id}:{quality_score}"
        let message = format!("{}:{}", escrow.transaction_id, quality_score);
        let message_bytes = message.as_bytes();

        // Verify Ed25519 signature from the instructions sysvar
        verify_ed25519_signature(
            &ctx.accounts.instructions_sysvar,
            &signature,
            ctx.accounts.verifier.key,
            message_bytes,
        )?;

        msg!("Verifier: {}", ctx.accounts.verifier.key());
        msg!("Quality Score: {}", quality_score);
        msg!("Refund: {}%", refund_percentage);

        // Calculate split amounts
        let refund_amount = (escrow.amount as u128)
            .checked_mul(refund_percentage as u128)
            .ok_or(EscrowError::ArithmeticOverflow)?
            .checked_div(100)
            .ok_or(EscrowError::ArithmeticOverflow)? as u64;

        let payment_amount = escrow.amount - refund_amount;

        msg!("Refund to Agent: {} SOL", refund_amount as f64 / 1_000_000_000.0);
        msg!("Payment to API: {} SOL", payment_amount as f64 / 1_000_000_000.0);

        // Transfer refund to agent
        // Note: Using direct lamport manipulation instead of system_program::transfer
        // because escrow PDA contains data and system transfer requires empty accounts
        if refund_amount > 0 {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= refund_amount;
            **ctx.accounts.agent.to_account_info().try_borrow_mut_lamports()? += refund_amount;
        }

        // Transfer payment to API
        if payment_amount > 0 {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= payment_amount;
            **ctx.accounts.api.to_account_info().try_borrow_mut_lamports()? += payment_amount;
        }

        let escrow = &mut ctx.accounts.escrow;
        escrow.status = EscrowStatus::Resolved;
        escrow.quality_score = Some(quality_score);
        escrow.refund_percentage = Some(refund_percentage);

        // Update agent reputation
        let agent_reputation = &mut ctx.accounts.agent_reputation;
        let clock = Clock::get()?;

        agent_reputation.total_transactions = agent_reputation.total_transactions.saturating_add(1);

        // Update average quality received by agent
        let total_quality = agent_reputation.average_quality_received as u64
            * (agent_reputation.total_transactions.saturating_sub(1)) as u64
            + quality_score as u64;
        agent_reputation.average_quality_received =
            (total_quality / agent_reputation.total_transactions as u64) as u8;

        // Categorize dispute outcome for agent
        if refund_percentage >= 75 {
            agent_reputation.disputes_won = agent_reputation.disputes_won.saturating_add(1);
        } else if refund_percentage >= 25 {
            agent_reputation.disputes_partial = agent_reputation.disputes_partial.saturating_add(1);
        } else {
            agent_reputation.disputes_lost = agent_reputation.disputes_lost.saturating_add(1);
        }

        // Recalculate agent reputation score
        agent_reputation.reputation_score = calculate_reputation_score(agent_reputation);
        agent_reputation.last_updated = clock.unix_timestamp;

        // Update API reputation (inverse of agent outcome)
        let api_reputation = &mut ctx.accounts.api_reputation;
        api_reputation.total_transactions = api_reputation.total_transactions.saturating_add(1);

        // Quality delivered by API (inverse of refund percentage)
        let quality_delivered = 100 - refund_percentage;
        let total_quality_api = api_reputation.average_quality_received as u64
            * (api_reputation.total_transactions.saturating_sub(1)) as u64
            + quality_delivered as u64;
        api_reputation.average_quality_received =
            (total_quality_api / api_reputation.total_transactions as u64) as u8;

        // Categorize for API (inverse)
        if refund_percentage <= 25 {
            // API provided good quality
            api_reputation.disputes_won = api_reputation.disputes_won.saturating_add(1);
        } else if refund_percentage <= 75 {
            api_reputation.disputes_partial = api_reputation.disputes_partial.saturating_add(1);
        } else {
            // API provided poor quality
            api_reputation.disputes_lost = api_reputation.disputes_lost.saturating_add(1);
        }

        api_reputation.reputation_score = calculate_reputation_score(api_reputation);
        api_reputation.last_updated = clock.unix_timestamp;

        msg!("Dispute resolved!");
        msg!("Agent reputation: {}", agent_reputation.reputation_score);
        msg!("API reputation: {}", api_reputation.reputation_score);

        emit!(DisputeResolved {
            escrow: escrow.key(),
            transaction_id: escrow.transaction_id.clone(),
            quality_score,
            refund_percentage,
            refund_amount,
            payment_amount,
            verifier: ctx.accounts.verifier.key(),
        });

        Ok(())
    }

    /// Resolve dispute with Switchboard On-Demand oracle
    ///
    /// Uses Switchboard decentralized oracle network for trustless quality assessment.
    /// The Switchboard Function calculates quality score off-chain and produces
    /// a cryptographically verified attestation that's validated on-chain.
    ///
    /// # Arguments
    /// * `quality_score` - Quality score from Switchboard Function (0-100)
    /// * `refund_percentage` - Refund percentage from Switchboard (0-100)
    pub fn resolve_dispute_switchboard(
        ctx: Context<ResolveDisputeSwitchboard>,
        quality_score: u8,
        refund_percentage: u8,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;

        require!(
            escrow.status == EscrowStatus::Active || escrow.status == EscrowStatus::Disputed,
            EscrowError::InvalidStatus
        );

        require!(quality_score <= 100, EscrowError::InvalidQualityScore);
        require!(refund_percentage <= 100, EscrowError::InvalidRefundPercentage);

        // Verify Switchboard attestation
        // The Switchboard Function result is stored in pull_feed account
        // and contains the quality score signed by oracle nodes
        let pull_feed = &ctx.accounts.switchboard_function;

        // Load and verify the Switchboard attestation
        let feed_account_info = pull_feed.to_account_info();
        let feed_data = PullFeedAccountData::parse(feed_account_info.data.borrow())
            .map_err(|_| EscrowError::InvalidSwitchboardAttestation)?;

        // Validate timestamp freshness (attestation must be within 300 seconds)
        let clock = Clock::get()?;
        let age_seconds = clock.unix_timestamp - feed_data.last_update_timestamp;

        require!(
            age_seconds >= 0 && age_seconds <= 300,
            EscrowError::StaleAttestation
        );

        msg!("Switchboard attestation age: {} seconds", age_seconds);

        // Extract quality score from Switchboard result
        // The value is encoded as i128 in the feed
        let switchboard_quality = feed_data.result.value;

        // Verify the quality score matches what was submitted
        require!(
            switchboard_quality == quality_score as i128,
            EscrowError::QualityScoreMismatch
        );

        msg!("Switchboard Quality Score: {}", quality_score);
        msg!("Refund: {}%", refund_percentage);

        // Calculate split amounts (same logic as resolve_dispute)
        let refund_amount = (escrow.amount as u128)
            .checked_mul(refund_percentage as u128)
            .ok_or(EscrowError::ArithmeticOverflow)?
            .checked_div(100)
            .ok_or(EscrowError::ArithmeticOverflow)? as u64;

        let payment_amount = escrow.amount - refund_amount;

        msg!("Refund to Agent: {} SOL", refund_amount as f64 / 1_000_000_000.0);
        msg!("Payment to API: {} SOL", payment_amount as f64 / 1_000_000_000.0);

        // Transfer refund to agent
        // Note: Using direct lamport manipulation instead of system_program::transfer
        // because escrow PDA contains data and system transfer requires empty accounts
        if refund_amount > 0 {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= refund_amount;
            **ctx.accounts.agent.to_account_info().try_borrow_mut_lamports()? += refund_amount;
        }

        // Transfer payment to API
        if payment_amount > 0 {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= payment_amount;
            **ctx.accounts.api.to_account_info().try_borrow_mut_lamports()? += payment_amount;
        }

        let escrow = &mut ctx.accounts.escrow;
        escrow.status = EscrowStatus::Resolved;
        escrow.quality_score = Some(quality_score);
        escrow.refund_percentage = Some(refund_percentage);

        // Update agent reputation (same logic as resolve_dispute)
        let agent_reputation = &mut ctx.accounts.agent_reputation;
        let clock = Clock::get()?;

        agent_reputation.total_transactions = agent_reputation.total_transactions.saturating_add(1);

        let total_quality = agent_reputation.average_quality_received as u64
            * (agent_reputation.total_transactions.saturating_sub(1)) as u64
            + quality_score as u64;
        agent_reputation.average_quality_received =
            (total_quality / agent_reputation.total_transactions as u64) as u8;

        if refund_percentage >= 75 {
            agent_reputation.disputes_won = agent_reputation.disputes_won.saturating_add(1);
        } else if refund_percentage >= 25 {
            agent_reputation.disputes_partial = agent_reputation.disputes_partial.saturating_add(1);
        } else {
            agent_reputation.disputes_lost = agent_reputation.disputes_lost.saturating_add(1);
        }

        agent_reputation.reputation_score = calculate_reputation_score(agent_reputation);
        agent_reputation.last_updated = clock.unix_timestamp;

        // Update API reputation
        let api_reputation = &mut ctx.accounts.api_reputation;
        api_reputation.total_transactions = api_reputation.total_transactions.saturating_add(1);

        let quality_delivered = 100 - refund_percentage;
        let total_quality_api = api_reputation.average_quality_received as u64
            * (api_reputation.total_transactions.saturating_sub(1)) as u64
            + quality_delivered as u64;
        api_reputation.average_quality_received =
            (total_quality_api / api_reputation.total_transactions as u64) as u8;

        if refund_percentage <= 25 {
            api_reputation.disputes_won = api_reputation.disputes_won.saturating_add(1);
        } else if refund_percentage <= 75 {
            api_reputation.disputes_partial = api_reputation.disputes_partial.saturating_add(1);
        } else {
            api_reputation.disputes_lost = api_reputation.disputes_lost.saturating_add(1);
        }

        api_reputation.reputation_score = calculate_reputation_score(api_reputation);
        api_reputation.last_updated = clock.unix_timestamp;

        msg!("Dispute resolved via Switchboard!");
        msg!("Agent reputation: {}", agent_reputation.reputation_score);
        msg!("API reputation: {}", api_reputation.reputation_score);

        emit!(DisputeResolved {
            escrow: escrow.key(),
            transaction_id: escrow.transaction_id.clone(),
            quality_score,
            refund_percentage,
            refund_amount,
            payment_amount,
            verifier: ctx.accounts.switchboard_function.key(),
        });

        Ok(())
    }

    /// Mark escrow as disputed (agent initiates dispute)
    pub fn mark_disputed(ctx: Context<MarkDisputed>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let reputation = &mut ctx.accounts.reputation;

        require!(
            escrow.status == EscrowStatus::Active,
            EscrowError::InvalidStatus
        );

        require!(
            ctx.accounts.agent.key() == escrow.agent,
            EscrowError::Unauthorized
        );

        // Check if dispute window is still open (before time lock expires)
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp < escrow.expires_at,
            EscrowError::DisputeWindowExpired
        );

        // Calculate dispute cost based on reputation
        let dispute_cost = calculate_dispute_cost(reputation);
        require!(
            ctx.accounts.agent.lamports() >= dispute_cost,
            EscrowError::InsufficientDisputeFunds
        );

        // Update reputation - record dispute filed
        reputation.disputes_filed = reputation.disputes_filed.saturating_add(1);

        escrow.status = EscrowStatus::Disputed;

        msg!("Escrow marked as disputed (cost: {} lamports)", dispute_cost);

        emit!(DisputeMarked {
            escrow: escrow.key(),
            agent: escrow.agent,
            transaction_id: escrow.transaction_id.clone(),
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Initialize or update entity reputation
    pub fn init_reputation(ctx: Context<InitReputation>) -> Result<()> {
        let reputation = &mut ctx.accounts.reputation;
        let clock = Clock::get()?;

        reputation.entity = ctx.accounts.entity.key();
        reputation.entity_type = EntityType::Agent;
        reputation.total_transactions = 0;
        reputation.disputes_filed = 0;
        reputation.disputes_won = 0;
        reputation.disputes_partial = 0;
        reputation.disputes_lost = 0;
        reputation.average_quality_received = 0;
        reputation.reputation_score = 500; // Start at medium
        reputation.created_at = clock.unix_timestamp;
        reputation.last_updated = clock.unix_timestamp;
        reputation.bump = ctx.bumps.reputation;

        msg!("Reputation initialized for {}", ctx.accounts.entity.key());

        Ok(())
    }

    /// Update reputation after transaction completes
    /// Only callable by the escrow program itself during resolve_dispute
    pub fn update_reputation(
        ctx: Context<UpdateReputation>,
        quality_score: u8,
        refund_percentage: u8,
    ) -> Result<()> {
        // Authorization: Only allow updates from program-owned accounts
        // In practice, this should be called via CPI from resolve_dispute
        let reputation = &mut ctx.accounts.reputation;
        let clock = Clock::get()?;

        reputation.total_transactions = reputation.total_transactions.saturating_add(1);

        // Update average quality received
        let total_quality = reputation.average_quality_received as u64
            * (reputation.total_transactions - 1) as u64
            + quality_score as u64;
        reputation.average_quality_received = (total_quality / reputation.total_transactions as u64) as u8;

        // Categorize dispute outcome
        if refund_percentage >= 75 {
            reputation.disputes_won = reputation.disputes_won.saturating_add(1);
        } else if refund_percentage >= 25 {
            reputation.disputes_partial = reputation.disputes_partial.saturating_add(1);
        } else {
            reputation.disputes_lost = reputation.disputes_lost.saturating_add(1);
        }

        // Calculate new reputation score (0-1000)
        reputation.reputation_score = calculate_reputation_score(reputation);
        reputation.last_updated = clock.unix_timestamp;

        msg!("Reputation updated: score = {}", reputation.reputation_score);

        Ok(())
    }

    /// Rate limit check - ensures entity hasn't exceeded limits
    pub fn check_rate_limit(ctx: Context<CheckRateLimit>) -> Result<()> {
        let rate_limiter = &mut ctx.accounts.rate_limiter;
        let clock = Clock::get()?;
        let current_hour = clock.unix_timestamp / 3600;
        let current_day = clock.unix_timestamp / 86400;

        // Reset hourly counter if hour changed
        if current_hour > rate_limiter.last_hour_check {
            rate_limiter.transactions_last_hour = 0;
            rate_limiter.last_hour_check = current_hour;
        }

        // Reset daily counter if day changed
        if current_day > rate_limiter.last_day_check {
            rate_limiter.transactions_last_day = 0;
            rate_limiter.disputes_last_day = 0;
            rate_limiter.last_day_check = current_day;
        }

        // Get limits based on verification level
        let (hour_limit, day_limit, _dispute_day_limit) = get_rate_limits(rate_limiter.verification_level.clone());

        // Check limits
        require!(
            rate_limiter.transactions_last_hour < hour_limit,
            EscrowError::RateLimitExceeded
        );
        require!(
            rate_limiter.transactions_last_day < day_limit,
            EscrowError::RateLimitExceeded
        );

        // Increment counters
        rate_limiter.transactions_last_hour = rate_limiter.transactions_last_hour.saturating_add(1);
        rate_limiter.transactions_last_day = rate_limiter.transactions_last_day.saturating_add(1);

        Ok(())
    }
}

// Helper functions
fn calculate_dispute_cost(reputation: &EntityReputation) -> u64 {
    if reputation.total_transactions == 0 {
        return BASE_DISPUTE_COST;
    }

    let dispute_rate = (reputation.disputes_filed * 100) / reputation.total_transactions;

    let multiplier = match dispute_rate {
        0..=20 => 1,     // Normal dispute rate
        21..=40 => 2,    // High dispute rate
        41..=60 => 5,    // Very high dispute rate
        _ => 10,         // Abuse pattern
    };

    BASE_DISPUTE_COST.saturating_mul(multiplier)
}

fn calculate_reputation_score(reputation: &EntityReputation) -> u16 {
    if reputation.total_transactions == 0 {
        return 500; // Default medium score
    }

    let tx_score = reputation.total_transactions.min(100) as u16 * 5; // Max 500 from transactions

    let dispute_score = if reputation.disputes_filed > 0 {
        let win_rate = (reputation.disputes_won * 100) / reputation.disputes_filed;
        (win_rate as u16 * 3).min(300) // Max 300 from dispute wins
    } else {
        150 // No disputes, neutral
    };

    let quality_score = (reputation.average_quality_received as u16 * 2).min(200); // Max 200 from quality

    (tx_score + dispute_score + quality_score).min(1000)
}

fn get_rate_limits(verification: VerificationLevel) -> (u16, u16, u16) {
    match verification {
        VerificationLevel::Basic => (1, 10, 3),        // 1/hour, 10/day, 3 disputes/day
        VerificationLevel::Staked => (10, 100, 10),    // 10/hour, 100/day, 10 disputes/day
        VerificationLevel::Social => (50, 500, 50),    // 50/hour, 500/day, 50 disputes/day
        VerificationLevel::KYC => (1000, 10000, 1000), // Unlimited
    }
}

// ============================================================================
// Account Structs
// ============================================================================

#[derive(Accounts)]
#[instruction(amount: u64, time_lock: i64, transaction_id: String)]
pub struct InitializeEscrow<'info> {
    #[account(
        init,
        payer = agent,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", transaction_id.as_bytes()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub agent: Signer<'info>,

    /// CHECK: API wallet address
    pub api: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseFunds<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.transaction_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub agent: Signer<'info>,

    /// CHECK: API wallet address
    #[account(mut)]
    pub api: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.transaction_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub agent: SystemAccount<'info>,

    /// CHECK: API wallet address
    #[account(mut)]
    pub api: AccountInfo<'info>,

    /// CHECK: Verifier oracle public key
    pub verifier: AccountInfo<'info>,

    /// CHECK: Instructions sysvar for Ed25519 signature verification
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"reputation", agent.key().as_ref()],
        bump = agent_reputation.bump
    )]
    pub agent_reputation: Account<'info, EntityReputation>,

    #[account(
        mut,
        seeds = [b"reputation", api.key().as_ref()],
        bump = api_reputation.bump
    )]
    pub api_reputation: Account<'info, EntityReputation>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveDisputeSwitchboard<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.transaction_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub agent: SystemAccount<'info>,

    /// CHECK: API wallet address
    #[account(mut)]
    pub api: AccountInfo<'info>,

    /// Switchboard Function pull feed containing quality score
    /// CHECK: Validated via PullFeedAccountData::parse
    pub switchboard_function: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"reputation", agent.key().as_ref()],
        bump = agent_reputation.bump
    )]
    pub agent_reputation: Account<'info, EntityReputation>,

    #[account(
        mut,
        seeds = [b"reputation", api.key().as_ref()],
        bump = api_reputation.bump
    )]
    pub api_reputation: Account<'info, EntityReputation>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MarkDisputed<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.transaction_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        seeds = [b"reputation", agent.key().as_ref()],
        bump = reputation.bump
    )]
    pub reputation: Account<'info, EntityReputation>,

    #[account(mut)]
    pub agent: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitReputation<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + EntityReputation::INIT_SPACE,
        seeds = [b"reputation", entity.key().as_ref()],
        bump
    )]
    pub reputation: Account<'info, EntityReputation>,

    /// CHECK: Entity being tracked
    pub entity: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateReputation<'info> {
    #[account(
        mut,
        seeds = [b"reputation", reputation.entity.as_ref()],
        bump = reputation.bump
    )]
    pub reputation: Account<'info, EntityReputation>,

    /// Authority that can update reputation (restricted)
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CheckRateLimit<'info> {
    #[account(
        mut,
        seeds = [b"rate_limit", entity.key().as_ref()],
        bump = rate_limiter.bump
    )]
    pub rate_limiter: Account<'info, RateLimiter>,

    pub entity: Signer<'info>,
}

// ============================================================================
// State
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub agent: Pubkey,                    // 32
    pub api: Pubkey,                      // 32
    pub amount: u64,                      // 8
    pub status: EscrowStatus,             // 1 + 1
    pub created_at: i64,                  // 8
    pub expires_at: i64,                  // 8
    #[max_len(64)]
    pub transaction_id: String,           // 4 + 64
    pub bump: u8,                         // 1
    pub quality_score: Option<u8>,        // 1 + 1
    pub refund_percentage: Option<u8>,    // 1 + 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Active,      // Payment locked, awaiting resolution
    Released,    // Funds released to API (happy path)
    Disputed,    // Agent disputed quality
    Resolved,    // Dispute resolved with refund split
}

/// Entity Reputation - tracks agent/provider performance on-chain
#[account]
#[derive(InitSpace)]
pub struct EntityReputation {
    pub entity: Pubkey,                   // 32
    pub entity_type: EntityType,          // 1 + 1
    pub total_transactions: u64,          // 8
    pub disputes_filed: u64,              // 8
    pub disputes_won: u64,                // 8 - Quality <50
    pub disputes_partial: u64,            // 8 - Quality 50-79
    pub disputes_lost: u64,               // 8 - Quality >=80
    pub average_quality_received: u8,     // 1
    pub reputation_score: u16,            // 2 - 0-1000 score
    pub created_at: i64,                  // 8
    pub last_updated: i64,                // 8
    pub bump: u8,                         // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum EntityType {
    Agent,
    Provider,
}

/// Rate Limiter - prevents spam and abuse
#[account]
#[derive(InitSpace)]
pub struct RateLimiter {
    pub entity: Pubkey,                   // 32
    pub verification_level: VerificationLevel, // 1 + 1
    pub transactions_last_hour: u16,      // 2
    pub transactions_last_day: u16,       // 2
    pub disputes_last_day: u16,           // 2
    pub last_hour_check: i64,             // 8
    pub last_day_check: i64,              // 8
    pub bump: u8,                         // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum VerificationLevel {
    Basic,       // Just wallet (low limits)
    Staked,      // 1+ SOL staked (medium limits)
    Social,      // Twitter/GitHub linked (high limits)
    KYC,         // Identity verified (unlimited)
}

/// Work Agreement - structured scope definition
#[account]
#[derive(InitSpace)]
pub struct WorkAgreement {
    pub escrow: Pubkey,                   // 32
    #[max_len(128)]
    pub query: String,                    // 4 + 128
    pub required_fields: u8,              // 1 - bitmask or count
    pub min_records: u32,                 // 4
    pub max_age_days: u32,                // 4
    pub min_quality_score: u8,            // 1
    pub created_at: i64,                  // 8
    pub bump: u8,                         // 1
}

/// Provider Penalties - track strikes and suspensions
#[account]
#[derive(InitSpace)]
pub struct ProviderPenalties {
    pub provider: Pubkey,                 // 32
    pub strike_count: u8,                 // 1
    pub suspended: bool,                  // 1
    pub suspension_end: Option<i64>,      // 1 + 8
    pub total_refunds_issued: u64,        // 8
    pub poor_quality_count: u32,          // 4 - Quality <30
    pub created_at: i64,                  // 8
    pub last_updated: i64,                // 8
    pub bump: u8,                         // 1
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum EscrowError {
    #[msg("Invalid escrow status for this operation")]
    InvalidStatus,

    #[msg("Unauthorized: Only agent or expired escrow can release")]
    Unauthorized,

    #[msg("Invalid quality score (must be 0-100)")]
    InvalidQualityScore,

    #[msg("Invalid refund percentage (must be 0-100)")]
    InvalidRefundPercentage,

    #[msg("Invalid verifier signature")]
    InvalidSignature,

    #[msg("Invalid time lock: must be between 1 hour and 30 days")]
    InvalidTimeLock,

    #[msg("Invalid amount: must be greater than 0")]
    InvalidAmount,

    #[msg("Invalid transaction ID: must be non-empty and max 64 chars")]
    InvalidTransactionId,

    #[msg("Time lock not expired: cannot release funds yet")]
    TimeLockNotExpired,

    #[msg("Dispute window expired: cannot dispute after time lock")]
    DisputeWindowExpired,

    #[msg("Amount too large: exceeds maximum escrow amount")]
    AmountTooLarge,

    #[msg("Insufficient funds to pay dispute cost")]
    InsufficientDisputeFunds,

    #[msg("Rate limit exceeded: too many transactions")]
    RateLimitExceeded,

    #[msg("Provider is suspended")]
    ProviderSuspended,

    #[msg("Reputation score too low for this operation")]
    ReputationTooLow,

    #[msg("Arithmetic overflow in calculation")]
    ArithmeticOverflow,

    #[msg("Insufficient rent reserve in escrow account")]
    InsufficientRentReserve,

    #[msg("Invalid Switchboard attestation")]
    InvalidSwitchboardAttestation,

    #[msg("Switchboard attestation is stale (older than 60 seconds)")]
    StaleAttestation,

    #[msg("Quality score mismatch between Switchboard and submitted value")]
    QualityScoreMismatch,
}
