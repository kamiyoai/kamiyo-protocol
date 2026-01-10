//! Kamiyo - Agent Identity and Conflict Resolution Protocol
//!
//! 魂 (kamiyo) - The soul/spirit that persists through conflict
//!
//! Copyright (c) 2025 KAMIYO
//! SPDX-License-Identifier: BUSL-1.1
//!
//! Kamiyo provides autonomous agents with:
//! - PDA-based agent identities with stake-backed accountability
//! - Trustless conflict resolution via multi-oracle consensus
//! - Quality-based arbitration for fair dispute outcomes
//! - On-chain reputation tracking for trust scoring
//! - SPL token support (USDC, USDT, SOL)
//!
//! Core Concepts:
//! - Agent: An autonomous entity with a PDA identity and staked collateral
//! - Agreement: A payment agreement between agent and provider (formerly escrow)
//! - Conflict: A disputed agreement requiring oracle arbitration
//! - Resolution: The outcome of conflict arbitration with quality-based settlement
//!
//! ## Access Control Summary
//!
//! | Instruction              | Who Can Call                                    | Additional Requirements |
//! |--------------------------|------------------------------------------------|-------------------------|
//! | create_agent             | Anyone                                          | Must stake MIN_STAKE    |
//! | deactivate_agent         | Agent owner only                               | Agent must be active    |
//! | update_agent_rep         | Agent owner OR registered oracle               | -                       |
//! | initialize_escrow        | Anyone                                          | Protocol not paused     |
//! | release_funds            | Agent (anytime) OR API (after timelock)        | Escrow must be Active   |
//! | mark_disputed            | Agent (escrow owner) only                      | Before expiry           |
//! | resolve_dispute          | Registered oracle (with valid signature)       | Oracle in registry      |
//! | submit_oracle_score      | Registered oracle (with valid signature)       | Oracle in registry      |
//! | finalize_multi_oracle_dispute | Anyone (permissionless)                   | Min consensus reached   |
//! | claim_expired_escrow     | Anyone (permissionless)                        | 7 days post-expiry      |
//! | initialize_oracle_registry | Admin (one-time)                             | -                       |
//! | add_oracle               | Registry admin only                            | Oracle stakes collateral|
//! | remove_oracle            | Registry admin only                            | -                       |
//! | transfer_admin           | Current registry admin only                    | -                       |
//! | initialize_protocol      | Anyone (one-time)                              | Sets up 2-of-3 multisig |
//! | pause_protocol           | 2-of-3 multisig authorities                    | Protocol not paused     |
//! | unpause_protocol         | 2-of-3 multisig authorities                    | Protocol paused         |
//! | transfer_protocol_authority | 2-of-3 multisig authorities                 | -                       |
//! | withdraw_treasury        | 2-of-3 multisig authorities                    | -                       |
//!
//! ## Emergency Pause Mechanism
//!
//! The protocol implements a 2-of-3 multi-sig emergency pause:
//!
//! 1. **Initialization**: `initialize_protocol` sets up 3 distinct authority addresses
//! 2. **Pause Activation**: `pause_protocol` requires signatures from any 2 of 3 authorities
//! 3. **Pause Effect**: When paused, `initialize_escrow` is blocked (new escrows)
//! 4. **Existing Escrows**: Can still be released/disputed/resolved (protects user funds)
//! 5. **Resume**: `unpause_protocol` requires 2-of-3 multi-sig to resume operations
//!
//! ## Slashing Mechanisms
//!
//! 1. **Agent Slashing**: 5% of stake slashed for frivolous disputes (quality >= 80)
//! 2. **Oracle Slashing**: 10% of stake slashed for voting outside consensus deviation
//! 3. **Oracle Removal**: After 3 violations, oracle should be removed from registry
//!
//! ## Escrow Expiration Handling
//!
//! Escrows have a configurable time-lock (1 hour to 30 days). After expiration:
//! - **Grace Period**: 7 days after expiration for dispute resolution
//! - **Active Escrow**: Full refund to agent (API failed to deliver)
//! - **Disputed Escrow**: 50/50 split if no oracle consensus reached
//! - **Permissionless Claim**: Anyone can trigger `claim_expired_escrow` after grace period

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    ed25519_program,
    sysvar::{
        instructions::{load_instruction_at_checked, ID as INSTRUCTIONS_ID},
        rent::Rent,
    },
};
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer as SplTransfer};
use anchor_spl::associated_token::AssociatedToken;

pub mod zk;

declare_id!("8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM");

// ============================================================================
// Constants
// ============================================================================

// Known SPL token mints
pub mod token_mints {
    use anchor_lang::solana_program::pubkey;
    use anchor_lang::solana_program::pubkey::Pubkey;

    pub const USDC_MAINNET: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    pub const USDT_MAINNET: Pubkey = pubkey!("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
    pub const USDC_DEVNET: Pubkey = pubkey!("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vn2KGtKJr");

    pub fn is_stablecoin(mint: &Pubkey) -> bool {
        *mint == USDC_MAINNET || *mint == USDT_MAINNET || *mint == USDC_DEVNET
    }
}

// Validation constants
const MIN_TIME_LOCK: i64 = 3600;                    // 1 hour
const MAX_TIME_LOCK: i64 = 2_592_000;               // 30 days
const MAX_ESCROW_AMOUNT: u64 = 1_000_000_000_000;   // 1000 SOL
const MIN_ESCROW_AMOUNT: u64 = 1_000_000;           // 0.001 SOL
const BASE_DISPUTE_COST: u64 = 1_000_000;           // 0.001 SOL

// Multi-oracle consensus constants
const MAX_ORACLES: usize = 7;
const MIN_CONSENSUS_ORACLES: u8 = 3;                 // Minimum 3-of-N for collusion resistance
const ORACLE_REVEAL_DELAY: i64 = 300;                // 5 minute delay before scores visible
#[allow(dead_code)]
const MAX_SCORE_DEVIATION: u8 = 15;

// Agent constants
const MIN_STAKE_AMOUNT: u64 = 100_000_000;          // 0.1 SOL minimum stake
const MAX_AGENT_NAME_LENGTH: usize = 32;

// Oracle incentive constants
const MIN_ORACLE_STAKE: u64 = 1_000_000_000;        // 1 SOL minimum oracle stake (raised)
const ORACLE_SLASH_PERCENT: u8 = 10;                // 10% slash for voting against consensus
const ORACLE_REWARD_PERCENT: u8 = 1;                // 1% of escrow amount as oracle reward
const MAX_ORACLE_SLASH_VIOLATIONS: u8 = 3;          // Max violations before removal

// Tiered escrow thresholds (require more oracles for larger amounts)
const TIER2_ESCROW_THRESHOLD: u64 = 10_000_000_000;  // 10 SOL - requires 4 oracles
const TIER3_ESCROW_THRESHOLD: u64 = 100_000_000_000; // 100 SOL - requires 5 oracles

// Agent slashing constants
const AGENT_DISPUTE_LOSS_SLASH_PERCENT: u8 = 5;     // 5% stake slash when losing dispute

// Protocol fee constants
const PROTOCOL_FEE_PERCENT: u8 = 1;                 // 1% protocol fee on dispute resolution
const ESCROW_CREATION_FEE_BPS: u64 = 10;            // 0.1% (10 basis points) escrow creation fee

// Protocol version for upgrade tracking
const PROTOCOL_VERSION: u8 = 1;

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct AgentCreated {
    pub agent_pda: Pubkey,
    pub owner: Pubkey,
    pub name: String,
    pub agent_type: u8,
    pub stake_amount: u64,
}

#[event]
pub struct AgentDeactivated {
    pub agent_pda: Pubkey,
    pub owner: Pubkey,
    pub refunded_stake: u64,
}

#[event]
pub struct AgentReputationUpdated {
    pub agent_pda: Pubkey,
    pub old_reputation: u64,
    pub new_reputation: u64,
    pub delta: i64,
}

#[event]
pub struct EscrowInitialized {
    pub escrow: Pubkey,
    pub agent: Pubkey,
    pub api: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
    pub transaction_id: String,
    pub is_token: bool,
    pub token_mint: Option<Pubkey>,
    pub creation_fee: u64,
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

#[event]
pub struct OracleRegistryInitialized {
    pub registry: Pubkey,
    pub admin: Pubkey,
    pub min_consensus: u8,
    pub max_score_deviation: u8,
}

#[event]
pub struct OracleAdded {
    pub registry: Pubkey,
    pub oracle: Pubkey,
    pub oracle_type_index: u8,
    pub weight: u16,
}

#[event]
pub struct OracleRemoved {
    pub registry: Pubkey,
    pub oracle: Pubkey,
    pub reason: String,
    pub violation_count: u8,
}

#[event]
pub struct AdminTransferred {
    pub registry: Pubkey,
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct ProtocolConfigInitialized {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub version: u8,
}

#[event]
pub struct ProtocolPaused {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ProtocolUnpaused {
    pub config: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MultiOracleDisputeResolved {
    pub escrow: Pubkey,
    pub transaction_id: String,
    pub oracle_count: u8,
    pub individual_scores: Vec<u8>,
    pub oracles: Vec<Pubkey>,
    pub consensus_score: u8,
    pub refund_percentage: u8,
    pub refund_amount: u64,
    pub payment_amount: u64,
}

#[event]
pub struct OracleSlashed {
    pub oracle: Pubkey,
    pub slash_amount: u64,
    pub violation_count: u8,
    pub reason: String,
}

#[event]
pub struct OracleRewarded {
    pub oracle: Pubkey,
    pub reward_amount: u64,
    pub escrow: Pubkey,
}

#[event]
pub struct AgentSlashed {
    pub agent: Pubkey,
    pub slash_amount: u64,
    pub reason: String,
}

#[event]
pub struct ExpiredEscrowClaimed {
    pub escrow: Pubkey,
    pub claimer: Pubkey,
    pub amount: u64,
    pub claim_type: String,
}

#[event]
pub struct TreasuryDeposit {
    pub amount: u64,
    pub source: String,
    pub escrow: Pubkey,
}

#[event]
pub struct TreasuryWithdrawal {
    pub treasury: Pubkey,
    pub admin: Pubkey,
    pub amount: u64,
    pub remaining_balance: u64,
}

#[event]
pub struct OracleRewardsClaimed {
    pub oracle: Pubkey,
    pub amount: u64,
}

#[event]
pub struct BlacklistRegistryInitialized {
    pub registry: Pubkey,
    pub authority: Pubkey,
}

#[event]
pub struct AgentBlacklisted {
    pub registry: Pubkey,
    pub agent: Pubkey,
    pub reason: String,
    pub root: [u8; 32],
}

#[event]
pub struct AgentUnblacklisted {
    pub registry: Pubkey,
    pub agent: Pubkey,
    pub root: [u8; 32],
}

#[event]
pub struct InferenceEscrowCreated {
    pub escrow: Pubkey,
    pub user: Pubkey,
    pub model_id: [u8; 32],
    pub amount: u64,
    pub quality_threshold: u8,
}

#[event]
pub struct InferenceSettled {
    pub escrow: Pubkey,
    pub quality_score: u8,
    pub user_refund: u64,
    pub provider_payment: u64,
}

#[event]
pub struct InferenceRefunded {
    pub escrow: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ModelRegistered {
    pub model: Pubkey,
    pub model_id: [u8; 32],
    pub owner: Pubkey,
}

#[event]
pub struct ModelReputationUpdated {
    pub model: Pubkey,
    pub total_inferences: u64,
    pub successful_inferences: u64,
    pub avg_quality: u8,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Find Ed25519 precompile instruction in the transaction
/// Iterates through all instructions to find one matching the Ed25519 program ID
fn find_ed25519_instruction(
    instructions_sysvar: &AccountInfo,
    signature: &[u8; 64],
    verifier_pubkey: &Pubkey,
    message: &[u8],
) -> Result<()> {
    // Iterate through instructions to find Ed25519 precompile
    // Maximum reasonable number of instructions to check
    const MAX_INSTRUCTIONS: usize = 16;

    for idx in 0..MAX_INSTRUCTIONS {
        let ix = match load_instruction_at_checked(idx, instructions_sysvar) {
            Ok(ix) => ix,
            Err(_) => break, // No more instructions
        };

        // Skip if not Ed25519 program
        if ix.program_id != ed25519_program::ID {
            continue;
        }

        // Validate Ed25519 instruction format
        if ix.data.len() < 16 || ix.data[0] != 1 {
            continue;
        }

        let sig_offset = u16::from_le_bytes([ix.data[2], ix.data[3]]) as usize;
        let pubkey_offset = u16::from_le_bytes([ix.data[6], ix.data[7]]) as usize;
        let message_offset = u16::from_le_bytes([ix.data[10], ix.data[11]]) as usize;
        let message_size = u16::from_le_bytes([ix.data[12], ix.data[13]]) as usize;

        // Bounds check
        if sig_offset + 64 > ix.data.len()
            || pubkey_offset + 32 > ix.data.len()
            || message_offset + message_size > ix.data.len()
        {
            continue;
        }

        let ix_signature = &ix.data[sig_offset..sig_offset + 64];
        let ix_pubkey = &ix.data[pubkey_offset..pubkey_offset + 32];
        let ix_message = &ix.data[message_offset..message_offset + message_size];

        // Check if this instruction matches our expected signature
        if ix_signature == signature
            && ix_pubkey == verifier_pubkey.as_ref()
            && ix_message == message
        {
            return Ok(());
        }
    }

    Err(error!(KamiyoError::InvalidSignature))
}

/// Verify Ed25519 signature instruction
/// Searches for matching Ed25519 precompile instruction in the transaction
pub fn verify_ed25519_signature(
    instructions_sysvar: &AccountInfo,
    signature: &[u8; 64],
    verifier_pubkey: &Pubkey,
    message: &[u8],
    _instruction_index: u16, // Deprecated: kept for API compatibility
) -> Result<()> {
    find_ed25519_instruction(instructions_sysvar, signature, verifier_pubkey, message)
}

/// Calculate weighted consensus score from oracle submissions
/// Uses weighted average for scores within deviation threshold of median
/// Tie-breaking: If scores are exactly split, uses median as tiebreaker
/// For boundary cases (e.g., 64.5 rounds to 65), uses ceiling to favor agent refunds
fn calculate_weighted_consensus(
    scores: &[(u8, u16)], // (score, weight) pairs
    max_deviation: u8,
) -> Result<u8> {
    require!(scores.len() >= 2, KamiyoError::InsufficientOracleConsensus);

    // Extract just scores for median calculation
    let mut sorted_scores: Vec<u8> = scores.iter().map(|(s, _)| *s).collect();
    sorted_scores.sort_unstable();

    // Calculate median with tie-breaking for even number of scores
    // For even counts, average the two middle values (ceiling for agent-favorable rounding)
    let len = sorted_scores.len();
    let median = if len % 2 == 0 {
        let mid_low = sorted_scores[len / 2 - 1];
        let mid_high = sorted_scores[len / 2];
        // Use ceiling division to favor agent in ties
        (mid_low as u16 + mid_high as u16).div_ceil(2)
    } else {
        sorted_scores[len / 2] as u16
    } as u8;

    // Filter scores within deviation threshold and calculate weighted average
    let mut weighted_sum: u64 = 0;
    let mut total_weight: u64 = 0;

    for (score, weight) in scores {
        let diff = (*score).abs_diff(median);
        if diff <= max_deviation {
            weighted_sum = weighted_sum.saturating_add((*score as u64).saturating_mul(*weight as u64));
            total_weight = total_weight.saturating_add(*weight as u64);
        }
    }

    require!(total_weight > 0, KamiyoError::NoConsensusReached);

    // Use ceiling division for tie-breaking (favors agent refunds in boundary cases)
    // Safe: weighted_sum is max 100 * u16::MAX * 5 oracles = ~32M, fits in u64
    let consensus = weighted_sum
        .checked_add(total_weight)
        .ok_or(KamiyoError::ArithmeticOverflow)?
        .saturating_sub(1)
        .checked_div(total_weight)
        .ok_or(KamiyoError::ArithmeticOverflow)?;
    Ok(consensus.min(100) as u8)
}

/// Calculate refund percentage based on quality score
fn calculate_refund_from_quality(quality_score: u8) -> u8 {
    match quality_score {
        0..=49 => 100,
        50..=64 => 75,
        65..=79 => 35,
        80..=100 => 0,
        _ => 0,
    }
}

/// Calculate required oracle count based on escrow amount (tiered for collusion resistance)
/// Tier 1: < 10 SOL = 3 oracles
/// Tier 2: 10-100 SOL = 4 oracles
/// Tier 3: > 100 SOL = 5 oracles
fn required_oracle_count(escrow_amount: u64) -> u8 {
    if escrow_amount >= TIER3_ESCROW_THRESHOLD {
        5
    } else if escrow_amount >= TIER2_ESCROW_THRESHOLD {
        4
    } else {
        MIN_CONSENSUS_ORACLES
    }
}

fn calculate_dispute_cost(reputation: &EntityReputation) -> u64 {
    if reputation.total_transactions == 0 {
        return BASE_DISPUTE_COST;
    }
    // Use saturating_mul to prevent overflow
    let dispute_rate = reputation.disputes_filed
        .saturating_mul(100)
        .checked_div(reputation.total_transactions)
        .unwrap_or(0);
    let multiplier = match dispute_rate {
        0..=20 => 1,
        21..=40 => 2,
        41..=60 => 5,
        _ => 10,
    };
    BASE_DISPUTE_COST.saturating_mul(multiplier)
}

fn calculate_reputation_score(reputation: &EntityReputation) -> u16 {
    if reputation.total_transactions == 0 {
        return 500;
    }
    // Use saturating arithmetic to prevent overflow
    let tx_score = (reputation.total_transactions.min(100) as u16).saturating_mul(5);
    let dispute_score = if reputation.disputes_filed > 0 {
        let win_rate = reputation.disputes_won
            .saturating_mul(100)
            .checked_div(reputation.disputes_filed)
            .unwrap_or(0);
        ((win_rate as u16).saturating_mul(3)).min(300)
    } else {
        150
    };
    let quality_score = ((reputation.average_quality_received as u16).saturating_mul(2)).min(200);
    tx_score.saturating_add(dispute_score).saturating_add(quality_score).min(1000)
}

/// Get rate limits based on verification level
/// Reserved for future rate limiting implementation
#[allow(dead_code)]
fn get_rate_limits(verification: VerificationLevel) -> (u16, u16, u16) {
    match verification {
        VerificationLevel::Basic => (1, 10, 3),
        VerificationLevel::Staked => (10, 100, 10),
        VerificationLevel::Social => (50, 500, 50),
        VerificationLevel::KYC => (1000, 10000, 1000),
    }
}

/// Update agent reputation after dispute resolution
/// Reserved for enhanced reputation tracking
#[allow(dead_code)]
fn update_agent_reputation(
    reputation: &mut EntityReputation,
    quality_score: u8,
    refund_percentage: u8,
) -> Result<()> {
    let clock = Clock::get()?;
    reputation.total_transactions = reputation.total_transactions.saturating_add(1);

    let total_quality = (reputation.average_quality_received as u64)
        .saturating_mul(reputation.total_transactions.saturating_sub(1))
        .saturating_add(quality_score as u64);
    reputation.average_quality_received =
        (total_quality / reputation.total_transactions) as u8;

    if refund_percentage >= 75 {
        reputation.disputes_won = reputation.disputes_won.saturating_add(1);
    } else if refund_percentage >= 25 {
        reputation.disputes_partial = reputation.disputes_partial.saturating_add(1);
    } else {
        reputation.disputes_lost = reputation.disputes_lost.saturating_add(1);
    }

    reputation.last_updated = clock.unix_timestamp;
    Ok(())
}

/// Update API/provider reputation after dispute resolution
/// Reserved for enhanced reputation tracking
#[allow(dead_code)]
fn update_api_reputation(
    reputation: &mut EntityReputation,
    refund_percentage: u8,
) -> Result<()> {
    let clock = Clock::get()?;
    reputation.total_transactions = reputation.total_transactions.saturating_add(1);

    let quality_delivered = 100u8.saturating_sub(refund_percentage);
    let total_quality = (reputation.average_quality_received as u64)
        .saturating_mul(reputation.total_transactions.saturating_sub(1))
        .saturating_add(quality_delivered as u64);
    reputation.average_quality_received =
        (total_quality / reputation.total_transactions) as u8;

    if refund_percentage <= 25 {
        reputation.disputes_won = reputation.disputes_won.saturating_add(1);
    } else if refund_percentage <= 75 {
        reputation.disputes_partial = reputation.disputes_partial.saturating_add(1);
    } else {
        reputation.disputes_lost = reputation.disputes_lost.saturating_add(1);
    }

    reputation.last_updated = clock.unix_timestamp;
    Ok(())
}

// ============================================================================
// Program
// ============================================================================

#[program]
pub mod kamiyo {
    use super::*;

    // ========================================================================
    // Agent Identity Instructions
    // ========================================================================

    /// Create a new agent identity with PDA
    pub fn create_agent(
        ctx: Context<CreateAgent>,
        name: String,
        agent_type: AgentType,
        stake_amount: u64,
    ) -> Result<()> {
        require!(
            !name.is_empty() && name.len() <= MAX_AGENT_NAME_LENGTH,
            KamiyoError::InvalidAgentName
        );
        require!(
            stake_amount >= MIN_STAKE_AMOUNT,
            KamiyoError::InsufficientStake
        );

        let clock = Clock::get()?;
        let agent = &mut ctx.accounts.agent;

        agent.owner = ctx.accounts.owner.key();
        agent.name = name.clone();
        agent.agent_type = agent_type;
        agent.reputation = 500; // Start at medium reputation
        agent.stake_amount = stake_amount;
        agent.is_active = true;
        agent.created_at = clock.unix_timestamp;
        agent.last_active = clock.unix_timestamp;
        agent.total_escrows = 0;
        agent.successful_escrows = 0;
        agent.disputed_escrows = 0;
        agent.bump = ctx.bumps.agent;

        // Transfer stake to agent PDA
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.owner.key(),
            &agent.key(),
            stake_amount,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.owner.to_account_info(),
                agent.to_account_info(),
            ],
        )?;

        msg!("Agent created: {} (type: {:?})", name, agent_type);

        emit!(AgentCreated {
            agent_pda: agent.key(),
            owner: agent.owner,
            name,
            agent_type: agent_type as u8,
            stake_amount,
        });

        Ok(())
    }

    /// Deactivate agent and return stake
    /// Note: Agent account is closed and rent returned to owner
    pub fn deactivate_agent(ctx: Context<DeactivateAgent>) -> Result<()> {
        let agent = &mut ctx.accounts.agent;

        require!(
            ctx.accounts.owner.key() == agent.owner,
            KamiyoError::Unauthorized
        );
        require!(agent.is_active, KamiyoError::AgentNotActive);

        let stake_to_return = agent.stake_amount;
        let agent_pda = agent.key();
        let owner_key = agent.owner;

        // Calculate rent-exempt minimum to preserve account
        let rent = Rent::get()?;
        let min_rent = rent.minimum_balance(agent.to_account_info().data_len());
        let agent_lamports = agent.to_account_info().lamports();

        // Return stake while preserving rent exemption
        let max_returnable = agent_lamports.saturating_sub(min_rent);
        let actual_return = stake_to_return.min(max_returnable);

        // Transfer stake back to owner (preserving rent exemption)
        **agent.to_account_info().try_borrow_mut_lamports()? -= actual_return;
        **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += actual_return;

        agent.is_active = false;
        agent.stake_amount = 0;

        emit!(AgentDeactivated {
            agent_pda,
            owner: owner_key,
            refunded_stake: actual_return,
        });

        Ok(())
    }

    /// Update agent reputation (internal use)
    pub fn update_agent_rep(
        ctx: Context<UpdateAgentRep>,
        delta: i64,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        let old_rep = agent.reputation;

        if delta >= 0 {
            agent.reputation = agent.reputation.saturating_add(delta as u64);
        } else {
            agent.reputation = agent.reputation.saturating_sub((-delta) as u64);
        }

        // Clamp to 0-1000
        agent.reputation = agent.reputation.min(1000);

        let clock = Clock::get()?;
        agent.last_active = clock.unix_timestamp;

        emit!(AgentReputationUpdated {
            agent_pda: agent.key(),
            old_reputation: old_rep,
            new_reputation: agent.reputation,
            delta,
        });

        Ok(())
    }

    // ========================================================================
    // Escrow Instructions
    // ========================================================================

    /// Initialize a new escrow for agent-to-API payment
    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        amount: u64,
        time_lock: i64,
        transaction_id: String,
        use_spl_token: bool,
    ) -> Result<()> {
        // Check protocol is not paused
        require!(
            !ctx.accounts.protocol_config.paused,
            KamiyoError::ProtocolPaused
        );

        // Validate amount within allowed range
        require!(
            (MIN_ESCROW_AMOUNT..=MAX_ESCROW_AMOUNT).contains(&amount),
            KamiyoError::InvalidAmount
        );
        require!(
            (MIN_TIME_LOCK..=MAX_TIME_LOCK).contains(&time_lock),
            KamiyoError::InvalidTimeLock
        );
        require!(
            !transaction_id.is_empty() && transaction_id.len() <= 64,
            KamiyoError::InvalidTransactionId
        );

        let clock = Clock::get()?;

        // Calculate escrow creation fee
        // For SOL escrows: 0.1% of amount (10 basis points)
        // For token escrows: flat fee (since token amount != SOL value)
        let fee_amount = if use_spl_token {
            // Flat fee for token escrows: 5000 lamports (~$0.001)
            5000u64
        } else {
            // 0.1% for SOL escrows, minimum 5000 lamports
            let creation_fee = (amount as u128)
                .checked_mul(ESCROW_CREATION_FEE_BPS as u128)
                .ok_or(KamiyoError::ArithmeticOverflow)?
                .checked_div(10_000)
                .ok_or(KamiyoError::ArithmeticOverflow)? as u64;
            creation_fee.max(5000)
        };

        // Collect fee from agent to treasury
        let fee_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.agent.key(),
            &ctx.accounts.treasury.key(),
            fee_amount,
        );
        anchor_lang::solana_program::program::invoke(
            &fee_ix,
            &[
                ctx.accounts.agent.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
            ],
        )?;

        // Update treasury accounting
        let treasury = &mut ctx.accounts.treasury;
        treasury.total_fees_collected = treasury.total_fees_collected.saturating_add(fee_amount);
        treasury.updated_at = clock.unix_timestamp;

        msg!("Escrow creation fee collected: {} lamports", fee_amount);

        let escrow = &mut ctx.accounts.escrow;

        escrow.agent = ctx.accounts.agent.key();
        escrow.api = ctx.accounts.api.key();
        escrow.amount = amount;
        escrow.status = EscrowStatus::Active;
        escrow.created_at = clock.unix_timestamp;
        escrow.expires_at = clock.unix_timestamp
            .checked_add(time_lock)
            .ok_or(KamiyoError::ArithmeticOverflow)?;
        escrow.transaction_id = transaction_id.clone();
        escrow.bump = ctx.bumps.escrow;
        escrow.quality_score = None;
        escrow.refund_percentage = None;
        escrow.oracle_submissions = Vec::new();

        if use_spl_token {
            let token_mint = ctx.accounts.token_mint.as_ref()
                .ok_or(KamiyoError::MissingTokenMint)?;
            let escrow_token_account_info = ctx.accounts.escrow_token_account.as_ref()
                .ok_or(KamiyoError::MissingTokenAccount)?;
            let agent_token_account = ctx.accounts.agent_token_account.as_ref()
                .ok_or(KamiyoError::MissingTokenAccount)?;
            let token_program = ctx.accounts.token_program.as_ref()
                .ok_or(KamiyoError::MissingTokenProgram)?;
            let associated_token_program = ctx.accounts.associated_token_program.as_ref()
                .ok_or(KamiyoError::MissingTokenProgram)?;

            // Validate agent token account
            require!(
                agent_token_account.mint == token_mint.key(),
                KamiyoError::TokenMintMismatch
            );
            require!(
                agent_token_account.owner == ctx.accounts.agent.key(),
                KamiyoError::Unauthorized
            );

            // Create ATA for escrow PDA if it doesn't exist
            let escrow_key = escrow.key();
            if escrow_token_account_info.data_is_empty() {
                let create_ata_ix = anchor_spl::associated_token::spl_associated_token_account::instruction::create_associated_token_account(
                    &ctx.accounts.agent.key(),
                    &escrow_key,
                    &token_mint.key(),
                    &token_program.key(),
                );
                anchor_lang::solana_program::program::invoke(
                    &create_ata_ix,
                    &[
                        ctx.accounts.agent.to_account_info(),
                        escrow_token_account_info.to_account_info(),
                        escrow.to_account_info(),
                        token_mint.to_account_info(),
                        ctx.accounts.system_program.to_account_info(),
                        token_program.to_account_info(),
                        associated_token_program.to_account_info(),
                    ],
                )?;
                msg!("Created ATA for escrow PDA");
            }

            escrow.token_mint = Some(token_mint.key());
            escrow.escrow_token_account = Some(escrow_token_account_info.key());
            escrow.token_decimals = token_mint.decimals;

            let cpi_accounts = SplTransfer {
                from: agent_token_account.to_account_info(),
                to: escrow_token_account_info.to_account_info(),
                authority: ctx.accounts.agent.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(token_program.to_account_info(), cpi_accounts);
            token::transfer(cpi_ctx, amount)?;

            msg!("SPL Token escrow created: {} tokens", amount);
        } else {
            escrow.token_mint = None;
            escrow.escrow_token_account = None;
            escrow.token_decimals = 9;

            let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.agent.key(),
                &escrow.key(),
                amount,
            );
            anchor_lang::solana_program::program::invoke(
                &transfer_ix,
                &[
                    ctx.accounts.agent.to_account_info(),
                    escrow.to_account_info(),
                ],
            )?;

            msg!("SOL escrow created: {} lamports", amount);
        }

        emit!(EscrowInitialized {
            escrow: escrow.key(),
            agent: escrow.agent,
            api: escrow.api,
            amount: escrow.amount,
            expires_at: escrow.expires_at,
            transaction_id,
            is_token: use_spl_token,
            token_mint: escrow.token_mint,
            creation_fee: fee_amount,
        });

        Ok(())
    }

    /// Release funds to API (happy path)
    /// Only the agent can release early, API can release after timelock expires
    /// Uses check-effects-interactions pattern for reentrancy safety
    pub fn release_funds(ctx: Context<ReleaseFunds>) -> Result<()> {
        require!(
            !ctx.accounts.protocol_config.paused,
            KamiyoError::ProtocolPaused
        );
        let clock = Clock::get()?;

        let (status, agent_key, api_key, expires_at, transfer_amount, transaction_id, bump, token_mint, escrow_key) = {
            let escrow = &ctx.accounts.escrow;
            (
                escrow.status,
                escrow.agent,
                escrow.api,
                escrow.expires_at,
                escrow.amount,
                escrow.transaction_id.clone(),
                escrow.bump,
                escrow.token_mint,
                escrow.key(),
            )
        };

        require!(status == EscrowStatus::Active, KamiyoError::InvalidStatus);

        let caller_key = ctx.accounts.caller.key();
        let is_agent = caller_key == agent_key;
        let is_api = caller_key == api_key;
        let time_lock_expired = clock.unix_timestamp >= expires_at;

        // Only agent can release before timelock, agent or API can release after
        require!(
            is_agent || (is_api && time_lock_expired),
            KamiyoError::Unauthorized
        );

        // ====================================================================
        // Check-Effects-Interactions: Update state BEFORE transfers (effects)
        // ====================================================================
        {
            let escrow = &mut ctx.accounts.escrow;
            escrow.status = EscrowStatus::Released;
        }

        // Now perform transfers (interactions)
        let seeds = &[b"escrow".as_ref(), agent_key.as_ref(), transaction_id.as_bytes(), &[bump]];
        let signer = &[&seeds[..]];

        if let Some(mint) = token_mint {
            let escrow_token_account = ctx.accounts.escrow_token_account.as_ref()
                .ok_or(KamiyoError::MissingTokenAccount)?;
            let api_token_account = ctx.accounts.api_token_account.as_ref()
                .ok_or(KamiyoError::MissingTokenAccount)?;
            let token_program = ctx.accounts.token_program.as_ref()
                .ok_or(KamiyoError::MissingTokenProgram)?;

            // Validate token accounts
            require!(escrow_token_account.mint == mint, KamiyoError::TokenMintMismatch);
            require!(api_token_account.mint == mint, KamiyoError::TokenMintMismatch);
            require!(api_token_account.owner == api_key, KamiyoError::Unauthorized);

            let cpi_accounts = SplTransfer {
                from: escrow_token_account.to_account_info(),
                to: api_token_account.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(
                token_program.to_account_info(),
                cpi_accounts,
                signer,
            );
            token::transfer(cpi_ctx, transfer_amount)?;
        } else {
            // Transfer SOL by directly manipulating lamports
            // System program transfer doesn't work for accounts with data
            let escrow_info = ctx.accounts.escrow.to_account_info();
            let api_info = ctx.accounts.api.to_account_info();

            **escrow_info.try_borrow_mut_lamports()? = escrow_info
                .lamports()
                .checked_sub(transfer_amount)
                .ok_or(KamiyoError::ArithmeticOverflow)?;
            **api_info.try_borrow_mut_lamports()? = api_info
                .lamports()
                .checked_add(transfer_amount)
                .ok_or(KamiyoError::ArithmeticOverflow)?;
        }

        emit!(FundsReleased {
            escrow: escrow_key,
            transaction_id,
            amount: transfer_amount,
            api: api_key,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Mark escrow as disputed
    pub fn mark_disputed(ctx: Context<MarkDisputed>) -> Result<()> {
        require!(
            !ctx.accounts.protocol_config.paused,
            KamiyoError::ProtocolPaused
        );
        let escrow = &mut ctx.accounts.escrow;
        let reputation = &mut ctx.accounts.reputation;

        require!(escrow.status == EscrowStatus::Active, KamiyoError::InvalidStatus);
        require!(ctx.accounts.agent.key() == escrow.agent, KamiyoError::Unauthorized);

        let clock = Clock::get()?;
        require!(clock.unix_timestamp < escrow.expires_at, KamiyoError::DisputeWindowExpired);

        let dispute_cost = calculate_dispute_cost(reputation);
        require!(
            ctx.accounts.agent.lamports() >= dispute_cost,
            KamiyoError::InsufficientDisputeFunds
        );

        reputation.disputes_filed = reputation.disputes_filed.saturating_add(1);
        escrow.status = EscrowStatus::Disputed;

        emit!(DisputeMarked {
            escrow: escrow.key(),
            agent: escrow.agent,
            transaction_id: escrow.transaction_id.clone(),
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Resolve dispute with verifier oracle signature
    /// Uses check-effects-interactions pattern for reentrancy safety
    /// Supports both SOL and SPL token escrows
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        quality_score: u8,
        refund_percentage: u8,
        signature: [u8; 64],
    ) -> Result<()> {
        require!(
            !ctx.accounts.protocol_config.paused,
            KamiyoError::ProtocolPaused
        );
        // Extract values we need before mutating (checks)
        let (status, transaction_id, amount, escrow_key, token_mint, bump, agent_key) = {
            let escrow = &ctx.accounts.escrow;
            (
                escrow.status,
                escrow.transaction_id.clone(),
                escrow.amount,
                escrow.key(),
                escrow.token_mint,
                escrow.bump,
                escrow.agent,
            )
        };

        require!(
            status == EscrowStatus::Active || status == EscrowStatus::Disputed,
            KamiyoError::InvalidStatus
        );
        require!(quality_score <= 100, KamiyoError::InvalidQualityScore);
        require!(refund_percentage <= 100, KamiyoError::InvalidRefundPercentage);

        let message = format!("{}:{}", transaction_id, quality_score);
        verify_ed25519_signature(
            &ctx.accounts.instructions_sysvar,
            &signature,
            ctx.accounts.verifier.key,
            message.as_bytes(),
            0,
        )?;

        let refund_amount = (amount as u128)
            .checked_mul(refund_percentage as u128)
            .ok_or(KamiyoError::ArithmeticOverflow)?
            .checked_div(100)
            .ok_or(KamiyoError::ArithmeticOverflow)? as u64;
        let payment_amount = amount.saturating_sub(refund_amount);

        // ====================================================================
        // Check-Effects-Interactions: Update state BEFORE transfers (effects)
        // ====================================================================
        let clock = Clock::get()?;
        let verifier_key = ctx.accounts.verifier.key();

        // Update escrow state first
        {
            let escrow = &mut ctx.accounts.escrow;
            escrow.status = EscrowStatus::Resolved;
            escrow.quality_score = Some(quality_score);
            escrow.refund_percentage = Some(refund_percentage);
        }

        // Update reputations
        {
            let agent_reputation = &mut ctx.accounts.agent_reputation;
            agent_reputation.total_transactions = agent_reputation.total_transactions.saturating_add(1);
            agent_reputation.reputation_score = calculate_reputation_score(agent_reputation);
            agent_reputation.last_updated = clock.unix_timestamp;
        }
        {
            let api_reputation = &mut ctx.accounts.api_reputation;
            api_reputation.total_transactions = api_reputation.total_transactions.saturating_add(1);
            api_reputation.reputation_score = calculate_reputation_score(api_reputation);
            api_reputation.last_updated = clock.unix_timestamp;
        }

        // Now perform transfers (interactions) - handle both SOL and SPL tokens
        let seeds = &[b"escrow".as_ref(), agent_key.as_ref(), transaction_id.as_bytes(), &[bump]];
        let signer = &[&seeds[..]];

        if let Some(mint) = token_mint {
            // SPL Token transfer
            let escrow_token_account = ctx.accounts.escrow_token_account.as_ref()
                .ok_or(KamiyoError::MissingTokenAccount)?;
            let token_program = ctx.accounts.token_program.as_ref()
                .ok_or(KamiyoError::MissingTokenProgram)?;

            // Validate escrow token account mint
            require!(escrow_token_account.mint == mint, KamiyoError::TokenMintMismatch);

            if refund_amount > 0 {
                let agent_token_account = ctx.accounts.agent_token_account.as_ref()
                    .ok_or(KamiyoError::MissingTokenAccount)?;
                // Validate agent token account ownership
                require!(agent_token_account.owner == agent_key, KamiyoError::Unauthorized);

                let cpi_accounts = SplTransfer {
                    from: escrow_token_account.to_account_info(),
                    to: agent_token_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                };
                let cpi_ctx = CpiContext::new_with_signer(
                    token_program.to_account_info(),
                    cpi_accounts,
                    signer,
                );
                token::transfer(cpi_ctx, refund_amount)?;
            }

            if payment_amount > 0 {
                let api_token_account = ctx.accounts.api_token_account.as_ref()
                    .ok_or(KamiyoError::MissingTokenAccount)?;
                // Validate api token account ownership
                require!(api_token_account.owner == ctx.accounts.api.key(), KamiyoError::Unauthorized);

                let cpi_accounts = SplTransfer {
                    from: escrow_token_account.to_account_info(),
                    to: api_token_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                };
                let cpi_ctx = CpiContext::new_with_signer(
                    token_program.to_account_info(),
                    cpi_accounts,
                    signer,
                );
                token::transfer(cpi_ctx, payment_amount)?;
            }
        } else {
            // SOL transfer with rent exemption check
            let rent = Rent::get()?;
            let escrow_min_rent = rent.minimum_balance(ctx.accounts.escrow.to_account_info().data_len());
            let escrow_lamports = ctx.accounts.escrow.to_account_info().lamports();
            let max_transferable = escrow_lamports.saturating_sub(escrow_min_rent);

            // Ensure we don't transfer more than available after rent
            let total_transfer = refund_amount.saturating_add(payment_amount);
            require!(total_transfer <= max_transferable, KamiyoError::InsufficientDisputeFunds);

            if refund_amount > 0 {
                **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= refund_amount;
                **ctx.accounts.agent.to_account_info().try_borrow_mut_lamports()? += refund_amount;
            }

            if payment_amount > 0 {
                **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= payment_amount;
                **ctx.accounts.api.to_account_info().try_borrow_mut_lamports()? += payment_amount;
            }
        }

        emit!(DisputeResolved {
            escrow: escrow_key,
            transaction_id,
            quality_score,
            refund_percentage,
            refund_amount,
            payment_amount,
            verifier: verifier_key,
        });

        Ok(())
    }

    // ========================================================================
    // Oracle Registry Instructions
    // ========================================================================

    /// Initialize the oracle registry
    pub fn initialize_oracle_registry(
        ctx: Context<InitializeOracleRegistry>,
        min_consensus: u8,
        max_score_deviation: u8,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.oracle_registry;

        require!(min_consensus >= MIN_CONSENSUS_ORACLES, KamiyoError::InsufficientOracleConsensus);
        require!(max_score_deviation <= 50, KamiyoError::InvalidQualityScore);

        let clock = Clock::get()?;

        registry.admin = ctx.accounts.admin.key();
        registry.oracles = Vec::new();
        registry.min_consensus = min_consensus;
        registry.max_score_deviation = max_score_deviation;
        registry.created_at = clock.unix_timestamp;
        registry.updated_at = clock.unix_timestamp;
        registry.bump = ctx.bumps.oracle_registry;

        emit!(OracleRegistryInitialized {
            registry: registry.key(),
            admin: registry.admin,
            min_consensus,
            max_score_deviation,
        });

        Ok(())
    }

    /// Add an oracle to the registry
    /// Requires oracle to stake MIN_ORACLE_STAKE as collateral (slashable for bad behavior)
    pub fn add_oracle(
        ctx: Context<AddOracle>,
        oracle_pubkey: Pubkey,
        oracle_type: OracleType,
        weight: u16,
        stake_amount: u64,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.oracle_registry;

        require!(ctx.accounts.admin.key() == registry.admin, KamiyoError::Unauthorized);
        // SECURITY: Validate oracle_pubkey matches the signer to prevent impersonation
        require!(oracle_pubkey == ctx.accounts.oracle_signer.key(), KamiyoError::OraclePubkeyMismatch);
        require!(registry.oracles.len() < MAX_ORACLES, KamiyoError::MaxOraclesReached);
        require!(weight > 0, KamiyoError::InvalidOracleWeight);
        require!(stake_amount >= MIN_ORACLE_STAKE, KamiyoError::InsufficientOracleStake);
        require!(
            !registry.oracles.iter().any(|o| o.pubkey == oracle_pubkey),
            KamiyoError::DuplicateOracleSubmission
        );

        // Transfer stake from oracle to registry PDA
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.oracle_signer.key(),
            &registry.key(),
            stake_amount,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.oracle_signer.to_account_info(),
                registry.to_account_info(),
            ],
        )?;

        registry.oracles.push(OracleConfig {
            pubkey: oracle_pubkey,
            oracle_type,
            weight,
            stake_amount,
            violation_count: 0,
            total_rewards: 0,
        });

        let clock = Clock::get()?;
        registry.updated_at = clock.unix_timestamp;

        emit!(OracleAdded {
            registry: registry.key(),
            oracle: oracle_pubkey,
            oracle_type_index: match oracle_type {
                OracleType::Ed25519 => 0,
                OracleType::Switchboard => 1,
                OracleType::Custom => 2,
            },
            weight,
        });

        Ok(())
    }

    /// Remove an oracle from the registry and return staked SOL
    pub fn remove_oracle(
        ctx: Context<RemoveOracle>,
        oracle_pubkey: Pubkey,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.oracle_registry;

        require!(ctx.accounts.admin.key() == registry.admin, KamiyoError::Unauthorized);
        require!(ctx.accounts.oracle_wallet.key() == oracle_pubkey, KamiyoError::OraclePubkeyMismatch);

        // Find and remove the oracle, capturing the stake amount
        let oracle_index = registry.oracles
            .iter()
            .position(|o| o.pubkey == oracle_pubkey)
            .ok_or(KamiyoError::OracleNotFound)?;

        let stake_amount = registry.oracles[oracle_index].stake_amount;
        registry.oracles.remove(oracle_index);

        // Return stake to oracle wallet
        if stake_amount > 0 {
            **registry.to_account_info().try_borrow_mut_lamports()? -= stake_amount;
            **ctx.accounts.oracle_wallet.try_borrow_mut_lamports()? += stake_amount;
        }

        let clock = Clock::get()?;
        registry.updated_at = clock.unix_timestamp;

        emit!(OracleRemoved {
            registry: registry.key(),
            oracle: oracle_pubkey,
            reason: "Admin removal".to_string(),
            violation_count: 0,
        });

        Ok(())
    }

    /// Transfer admin rights to a new admin
    pub fn transfer_admin(
        ctx: Context<TransferAdmin>,
        new_admin: Pubkey,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.oracle_registry;
        let old_admin = registry.admin;

        require!(ctx.accounts.admin.key() == registry.admin, KamiyoError::Unauthorized);
        require!(new_admin != Pubkey::default(), KamiyoError::InvalidAmount); // Reuse error for invalid input

        registry.admin = new_admin;

        let clock = Clock::get()?;
        registry.updated_at = clock.unix_timestamp;

        emit!(AdminTransferred {
            registry: registry.key(),
            old_admin,
            new_admin,
        });

        Ok(())
    }

    // ========================================================================
    // Reputation Instructions
    // ========================================================================

    /// Initialize entity reputation
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
        reputation.reputation_score = 500;
        reputation.created_at = clock.unix_timestamp;
        reputation.last_updated = clock.unix_timestamp;
        reputation.bump = ctx.bumps.reputation;

        Ok(())
    }

    // ========================================================================
    // Protocol Management Instructions
    // ========================================================================

    /// Initialize protocol configuration with multi-sig (one-time setup)
    /// Requires 3 distinct authority addresses for 2-of-3 multi-sig
    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        secondary_signer: Pubkey,
        tertiary_signer: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.protocol_config;
        let clock = Clock::get()?;

        // Ensure all three signers are distinct
        let primary = ctx.accounts.authority.key();
        require!(
            primary != secondary_signer
                && primary != tertiary_signer
                && secondary_signer != tertiary_signer,
            KamiyoError::DuplicateMultiSigSigner
        );
        require!(
            secondary_signer != Pubkey::default() && tertiary_signer != Pubkey::default(),
            KamiyoError::InvalidAuthority
        );

        config.authority = primary;
        config.secondary_signer = secondary_signer;
        config.tertiary_signer = tertiary_signer;
        config.required_signatures = 2; // 2-of-3 multi-sig
        config.paused = false;
        config.version = PROTOCOL_VERSION;
        config.total_escrows_created = 0;
        config.total_volume_locked = 0;
        config.created_at = clock.unix_timestamp;
        config.updated_at = clock.unix_timestamp;
        config.bump = ctx.bumps.protocol_config;

        emit!(ProtocolConfigInitialized {
            config: config.key(),
            authority: config.authority,
            version: config.version,
        });

        Ok(())
    }

    /// Initialize treasury for collecting protocol fees and slashed funds
    pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;
        let clock = Clock::get()?;

        treasury.admin = ctx.accounts.admin.key();
        treasury.total_fees_collected = 0;
        treasury.total_slashed_collected = 0;
        treasury.total_withdrawn = 0;
        treasury.created_at = clock.unix_timestamp;
        treasury.updated_at = clock.unix_timestamp;
        treasury.bump = ctx.bumps.treasury;

        msg!("Treasury initialized with admin: {}", treasury.admin);

        Ok(())
    }

    /// Claim accumulated oracle rewards
    /// Oracles earn 1% of escrow amounts for participating in consensus
    pub fn claim_oracle_rewards(ctx: Context<ClaimOracleRewards>) -> Result<()> {
        let oracle_registry = &mut ctx.accounts.oracle_registry;
        let treasury = &mut ctx.accounts.treasury;
        let oracle_key = ctx.accounts.oracle.key();

        // Find oracle in registry
        let oracle = oracle_registry
            .oracles
            .iter_mut()
            .find(|o| o.pubkey == oracle_key)
            .ok_or(KamiyoError::UnregisteredOracle)?;

        let reward_amount = oracle.total_rewards;
        require!(reward_amount > 0, KamiyoError::NoRewardsToClaim);

        // Check treasury has enough balance
        let treasury_balance = treasury.to_account_info().lamports();
        require!(treasury_balance >= reward_amount, KamiyoError::InsufficientTreasuryBalance);

        // Reset oracle rewards and transfer
        oracle.total_rewards = 0;

        **treasury.to_account_info().try_borrow_mut_lamports()? -= reward_amount;
        **ctx.accounts.oracle.to_account_info().try_borrow_mut_lamports()? += reward_amount;

        emit!(OracleRewardsClaimed {
            oracle: oracle_key,
            amount: reward_amount,
        });

        Ok(())
    }

    /// Withdraw funds from treasury
    /// Requires 2-of-3 multi-sig authorization (same authorities as protocol pause)
    pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
        // Validate amount is non-zero
        require!(amount > 0, KamiyoError::InvalidAmount);

        let config = &ctx.accounts.protocol_config;
        let treasury = &mut ctx.accounts.treasury;

        // Validate 2-of-3 multi-sig: both signers must be from the authority set
        let signer_one = ctx.accounts.signer_one.key();
        let signer_two = ctx.accounts.signer_two.key();
        require!(signer_one != signer_two, KamiyoError::DuplicateMultiSigSigner);

        let valid_signers = [config.authority, config.secondary_signer, config.tertiary_signer];
        require!(
            valid_signers.contains(&signer_one) && valid_signers.contains(&signer_two),
            KamiyoError::InvalidMultiSigSigner
        );

        // Calculate maximum withdrawable (preserve rent-exempt balance)
        let treasury_balance = treasury.to_account_info().lamports();
        let min_rent = Rent::get()?.minimum_balance(treasury.to_account_info().data_len());
        let max_withdrawable = treasury_balance.saturating_sub(min_rent);

        require!(amount <= max_withdrawable, KamiyoError::InsufficientTreasuryBalance);

        // Update accounting before transfer (CEI pattern)
        treasury.total_withdrawn = treasury.total_withdrawn.saturating_add(amount);
        treasury.updated_at = Clock::get()?.unix_timestamp;

        // Transfer funds to recipient
        **treasury.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.recipient.to_account_info().try_borrow_mut_lamports()? += amount;

        emit!(TreasuryWithdrawal {
            treasury: treasury.key(),
            admin: signer_one,
            amount,
            remaining_balance: treasury_balance.saturating_sub(amount),
        });

        msg!("Treasury withdrawal: {} lamports to {} (multi-sig: {}, {})",
            amount, ctx.accounts.recipient.key(), signer_one, signer_two);

        Ok(())
    }

    /// Pause protocol - emergency stop for all escrow operations
    /// Requires 2-of-3 multi-sig authorization
    pub fn pause_protocol(ctx: Context<ManageProtocol>) -> Result<()> {
        let config = &mut ctx.accounts.protocol_config;
        require!(!config.paused, KamiyoError::ProtocolAlreadyPaused);

        // Validate 2-of-3 multi-sig: both signers must be from the authority set
        let signer_one = ctx.accounts.signer_one.key();
        let signer_two = ctx.accounts.signer_two.key();
        require!(signer_one != signer_two, KamiyoError::DuplicateMultiSigSigner);

        let valid_signers = [config.authority, config.secondary_signer, config.tertiary_signer];
        require!(
            valid_signers.contains(&signer_one) && valid_signers.contains(&signer_two),
            KamiyoError::InvalidMultiSigSigner
        );

        let clock = Clock::get()?;
        config.paused = true;
        config.updated_at = clock.unix_timestamp;

        emit!(ProtocolPaused {
            config: config.key(),
            authority: signer_one,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Unpause protocol - resume normal operations
    /// Requires 2-of-3 multi-sig authorization
    pub fn unpause_protocol(ctx: Context<ManageProtocol>) -> Result<()> {
        let config = &mut ctx.accounts.protocol_config;
        require!(config.paused, KamiyoError::ProtocolNotPaused);

        // Validate 2-of-3 multi-sig
        let signer_one = ctx.accounts.signer_one.key();
        let signer_two = ctx.accounts.signer_two.key();
        require!(signer_one != signer_two, KamiyoError::DuplicateMultiSigSigner);

        let valid_signers = [config.authority, config.secondary_signer, config.tertiary_signer];
        require!(
            valid_signers.contains(&signer_one) && valid_signers.contains(&signer_two),
            KamiyoError::InvalidMultiSigSigner
        );

        let clock = Clock::get()?;
        config.paused = false;
        config.updated_at = clock.unix_timestamp;

        emit!(ProtocolUnpaused {
            config: config.key(),
            authority: signer_one,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Transfer protocol authority (replace one of the multi-sig signers)
    /// Requires 2-of-3 multi-sig authorization
    pub fn transfer_protocol_authority(
        ctx: Context<ManageProtocol>,
        signer_to_replace: Pubkey,
        new_signer: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.protocol_config;
        require!(new_signer != Pubkey::default(), KamiyoError::InvalidAuthority);

        // Validate 2-of-3 multi-sig
        let signer_one = ctx.accounts.signer_one.key();
        let signer_two = ctx.accounts.signer_two.key();
        require!(signer_one != signer_two, KamiyoError::DuplicateMultiSigSigner);

        let valid_signers = [config.authority, config.secondary_signer, config.tertiary_signer];
        require!(
            valid_signers.contains(&signer_one) && valid_signers.contains(&signer_two),
            KamiyoError::InvalidMultiSigSigner
        );

        // Ensure new signer is not already in the set
        require!(!valid_signers.contains(&new_signer), KamiyoError::DuplicateMultiSigSigner);

        // Replace the specified signer
        let clock = Clock::get()?;
        if signer_to_replace == config.authority {
            config.authority = new_signer;
        } else if signer_to_replace == config.secondary_signer {
            config.secondary_signer = new_signer;
        } else if signer_to_replace == config.tertiary_signer {
            config.tertiary_signer = new_signer;
        } else {
            return Err(KamiyoError::InvalidAuthority.into());
        }

        config.updated_at = clock.unix_timestamp;

        Ok(())
    }

    // ========================================================================
    // Multi-Oracle Dispute Resolution Instructions
    // ========================================================================

    /// Submit oracle quality score for dispute resolution
    /// Multiple oracles can submit scores, consensus is calculated on finalization
    pub fn submit_oracle_score(
        ctx: Context<SubmitOracleScore>,
        quality_score: u8,
        signature: [u8; 64],
    ) -> Result<()> {
        require!(
            !ctx.accounts.protocol_config.paused,
            KamiyoError::ProtocolPaused
        );
        let escrow = &mut ctx.accounts.escrow;
        let oracle_registry = &ctx.accounts.oracle_registry;

        require!(
            escrow.status == EscrowStatus::Disputed,
            KamiyoError::InvalidStatus
        );
        require!(quality_score <= 100, KamiyoError::InvalidQualityScore);

        // Verify oracle is registered
        let oracle_key = ctx.accounts.oracle.key();
        require!(
            oracle_registry.oracles.iter().any(|o| o.pubkey == oracle_key),
            KamiyoError::UnregisteredOracle
        );

        // Verify signature
        let message = format!("{}:{}", escrow.transaction_id, quality_score);
        verify_ed25519_signature(
            &ctx.accounts.instructions_sysvar,
            &signature,
            &oracle_key,
            message.as_bytes(),
            0,
        )?;

        // Check for duplicate submission
        require!(
            !escrow.oracle_submissions.iter().any(|s| s.oracle == oracle_key),
            KamiyoError::DuplicateOracleSubmission
        );

        // Add submission
        let clock = Clock::get()?;
        escrow.oracle_submissions.push(OracleSubmission {
            oracle: oracle_key,
            quality_score,
            submitted_at: clock.unix_timestamp,
        });

        msg!(
            "Oracle {} submitted score {} for escrow {}",
            oracle_key,
            quality_score,
            escrow.key()
        );

        Ok(())
    }

    /// Finalize multi-oracle dispute resolution
    /// Calculates consensus from submitted oracle scores and distributes funds
    /// Includes agent stake slashing for frivolous disputes (quality >= 80)
    /// Supports both SOL and SPL token escrows
    pub fn finalize_multi_oracle_dispute(ctx: Context<FinalizeMultiOracleDispute>) -> Result<()> {
        require!(
            !ctx.accounts.protocol_config.paused,
            KamiyoError::ProtocolPaused
        );
        let oracle_registry = &ctx.accounts.oracle_registry;

        // Extract values needed for calculations
        let (status, amount, transaction_id, escrow_key, individual_scores, oracles, weighted_scores, token_mint, bump, agent_key, first_submission_time) = {
            let escrow = &ctx.accounts.escrow;
            let individual_scores: Vec<u8> = escrow.oracle_submissions.iter().map(|s| s.quality_score).collect();
            let oracles: Vec<Pubkey> = escrow.oracle_submissions.iter().map(|s| s.oracle).collect();
            let weighted_scores: Vec<(u8, u16)> = escrow
                .oracle_submissions
                .iter()
                .filter_map(|submission| {
                    oracle_registry
                        .oracles
                        .iter()
                        .find(|o| o.pubkey == submission.oracle)
                        .map(|o| (submission.quality_score, o.weight))
                })
                .collect();
            let first_submission = escrow.oracle_submissions.iter().map(|s| s.submitted_at).min().unwrap_or(0);
            (
                escrow.status,
                escrow.amount,
                escrow.transaction_id.clone(),
                escrow.key(),
                individual_scores,
                oracles,
                weighted_scores,
                escrow.token_mint,
                escrow.bump,
                escrow.agent,
                first_submission,
            )
        };

        require!(status == EscrowStatus::Disputed, KamiyoError::InvalidStatus);

        // Tiered oracle requirement: larger escrows need more oracles for collusion resistance
        let required_oracles = required_oracle_count(amount);
        require!(
            oracles.len() >= required_oracles as usize,
            KamiyoError::InsufficientOracleConsensus
        );

        // Reveal delay: prevent oracles from seeing others' votes before committing
        // Must wait ORACLE_REVEAL_DELAY seconds after first submission
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= first_submission_time.saturating_add(ORACLE_REVEAL_DELAY),
            KamiyoError::RevealDelayNotMet
        );

        // Calculate consensus
        let consensus_score = calculate_weighted_consensus(
            &weighted_scores,
            oracle_registry.max_score_deviation,
        )?;

        // Calculate refund based on quality
        let refund_percentage = calculate_refund_from_quality(consensus_score);

        let refund_amount = (amount as u128)
            .checked_mul(refund_percentage as u128)
            .ok_or(KamiyoError::ArithmeticOverflow)?
            .checked_div(100)
            .ok_or(KamiyoError::ArithmeticOverflow)? as u64;
        let payment_amount = amount.saturating_sub(refund_amount);

        // ====================================================================
        // Check-Effects-Interactions Pattern: Update state BEFORE transfers
        // ====================================================================

        // Update escrow state first (effects)
        {
            let escrow = &mut ctx.accounts.escrow;
            escrow.status = EscrowStatus::Resolved;
            escrow.quality_score = Some(consensus_score);
            escrow.refund_percentage = Some(refund_percentage);
        }

        // Calculate protocol fee (1% of escrow amount)
        let protocol_fee = (amount as u128)
            .checked_mul(PROTOCOL_FEE_PERCENT as u128)
            .ok_or(KamiyoError::ArithmeticOverflow)?
            .checked_div(100)
            .ok_or(KamiyoError::ArithmeticOverflow)? as u64;

        // Calculate oracle reward pool (1% of escrow amount, split among participating oracles)
        let oracle_count = oracles.len() as u64;
        let total_oracle_reward = (amount as u128)
            .checked_mul(ORACLE_REWARD_PERCENT as u128)
            .ok_or(KamiyoError::ArithmeticOverflow)?
            .checked_div(100)
            .ok_or(KamiyoError::ArithmeticOverflow)? as u64;
        let reward_per_oracle = if oracle_count > 0 {
            total_oracle_reward / oracle_count
        } else {
            0
        };

        // Agent stake slashing for frivolous disputes (quality >= 80 = 0% refund)
        // If agent filed dispute but provider delivered quality work, slash agent stake
        let mut agent_slash_amount = 0u64;
        if refund_percentage == 0 && ctx.accounts.agent_identity.is_some() {
            let agent_identity = ctx.accounts.agent_identity.as_mut().unwrap();
            agent_slash_amount = (agent_identity.stake_amount as u128)
                .checked_mul(AGENT_DISPUTE_LOSS_SLASH_PERCENT as u128)
                .ok_or(KamiyoError::ArithmeticOverflow)?
                .checked_div(100)
                .ok_or(KamiyoError::ArithmeticOverflow)? as u64;

            if agent_slash_amount > 0 && agent_identity.stake_amount >= agent_slash_amount {
                agent_identity.stake_amount = agent_identity.stake_amount.saturating_sub(agent_slash_amount);
                agent_identity.disputed_escrows = agent_identity.disputed_escrows.saturating_add(1);

                // Transfer slashed amount to treasury if available, otherwise to API
                **agent_identity.to_account_info().try_borrow_mut_lamports()? -= agent_slash_amount;
                if let Some(ref treasury) = ctx.accounts.treasury {
                    **treasury.to_account_info().try_borrow_mut_lamports()? += agent_slash_amount;
                } else {
                    **ctx.accounts.api.to_account_info().try_borrow_mut_lamports()? += agent_slash_amount;
                }

                emit!(AgentSlashed {
                    agent: agent_identity.key(),
                    slash_amount: agent_slash_amount,
                    reason: "Frivolous dispute - provider delivered quality work".to_string(),
                });
            }
        }

        // Oracle stake slashing for voting against consensus + reward tracking + auto-removal
        let mut oracles_to_remove: Vec<Pubkey> = Vec::new();
        let mut forfeited_oracle_stake: u64 = 0;
        {
            let oracle_registry = &mut ctx.accounts.oracle_registry;
            let max_deviation = oracle_registry.max_score_deviation;

            for submission in ctx.accounts.escrow.oracle_submissions.iter() {
                let score_diff = submission.quality_score.abs_diff(consensus_score);

                if let Some(oracle) = oracle_registry.oracles.iter_mut().find(|o| o.pubkey == submission.oracle) {
                    // Track reward for participating oracle (only if within consensus)
                    if score_diff <= max_deviation && reward_per_oracle > 0 {
                        oracle.total_rewards = oracle.total_rewards.saturating_add(reward_per_oracle);
                        emit!(OracleRewarded {
                            oracle: oracle.pubkey,
                            reward_amount: reward_per_oracle,
                            escrow: escrow_key,
                        });
                    }

                    // If oracle voted outside acceptable deviation, slash their stake
                    if score_diff > max_deviation {
                        let slash_amount = (oracle.stake_amount as u128)
                            .checked_mul(ORACLE_SLASH_PERCENT as u128)
                            .ok_or(KamiyoError::ArithmeticOverflow)?
                            .checked_div(100)
                            .ok_or(KamiyoError::ArithmeticOverflow)? as u64;

                        if slash_amount > 0 && oracle.stake_amount >= slash_amount {
                            oracle.stake_amount = oracle.stake_amount.saturating_sub(slash_amount);
                            oracle.violation_count = oracle.violation_count.saturating_add(1);

                            emit!(OracleSlashed {
                                oracle: oracle.pubkey,
                                slash_amount,
                                violation_count: oracle.violation_count,
                                reason: format!(
                                    "Voted {} (consensus: {}), deviation: {} > max: {}",
                                    submission.quality_score,
                                    consensus_score,
                                    score_diff,
                                    max_deviation
                                ),
                            });

                            // Auto-remove oracle if too many violations
                            if oracle.violation_count >= MAX_ORACLE_SLASH_VIOLATIONS {
                                oracles_to_remove.push(oracle.pubkey);
                            }
                        }
                    }
                }
            }

            // Remove oracles with too many violations and transfer remaining stake to treasury
            for oracle_pubkey in oracles_to_remove.iter() {
                if let Some(pos) = oracle_registry.oracles.iter().position(|o| o.pubkey == *oracle_pubkey) {
                    let removed = oracle_registry.oracles.remove(pos);

                    // Transfer remaining stake from registry to treasury
                    if removed.stake_amount > 0 {
                        if let Some(ref treasury) = ctx.accounts.treasury {
                            **oracle_registry.to_account_info().try_borrow_mut_lamports()? -= removed.stake_amount;
                            **treasury.to_account_info().try_borrow_mut_lamports()? += removed.stake_amount;
                            forfeited_oracle_stake = forfeited_oracle_stake.saturating_add(removed.stake_amount);
                        }
                    }

                    emit!(OracleRemoved {
                        registry: oracle_registry.key(),
                        oracle: *oracle_pubkey,
                        reason: format!("Exceeded {} violations", MAX_ORACLE_SLASH_VIOLATIONS),
                        violation_count: removed.violation_count,
                    });
                }
            }
        }

        // Update treasury if provided
        if let Some(ref mut treasury) = ctx.accounts.treasury {
            treasury.total_fees_collected = treasury.total_fees_collected.saturating_add(protocol_fee);
            let total_slashed = agent_slash_amount.saturating_add(forfeited_oracle_stake);
            if total_slashed > 0 {
                treasury.total_slashed_collected = treasury.total_slashed_collected.saturating_add(total_slashed);
            }
            treasury.updated_at = Clock::get()?.unix_timestamp;
        }

        // Transfer escrow funds (interactions - after state updates)
        // Handle both SOL and SPL tokens
        let seeds = &[b"escrow".as_ref(), agent_key.as_ref(), transaction_id.as_bytes(), &[bump]];
        let signer = &[&seeds[..]];

        if let Some(mint) = token_mint {
            // SPL Token transfer with protocol fee
            let escrow_token_account = ctx.accounts.escrow_token_account.as_ref()
                .ok_or(KamiyoError::MissingTokenAccount)?;
            let token_program = ctx.accounts.token_program.as_ref()
                .ok_or(KamiyoError::MissingTokenProgram)?;

            // Validate escrow token account mint
            require!(escrow_token_account.mint == mint, KamiyoError::TokenMintMismatch);

            // Deduct protocol fee from payment amount (API pays the fee)
            let adjusted_payment = payment_amount.saturating_sub(protocol_fee);

            if refund_amount > 0 {
                let agent_token_account = ctx.accounts.agent_token_account.as_ref()
                    .ok_or(KamiyoError::MissingTokenAccount)?;
                // Validate agent token account
                require!(agent_token_account.mint == mint, KamiyoError::TokenMintMismatch);
                require!(agent_token_account.owner == agent_key, KamiyoError::Unauthorized);

                let cpi_accounts = SplTransfer {
                    from: escrow_token_account.to_account_info(),
                    to: agent_token_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                };
                let cpi_ctx = CpiContext::new_with_signer(
                    token_program.to_account_info(),
                    cpi_accounts,
                    signer,
                );
                token::transfer(cpi_ctx, refund_amount)?;
            }

            if adjusted_payment > 0 {
                let api_token_account = ctx.accounts.api_token_account.as_ref()
                    .ok_or(KamiyoError::MissingTokenAccount)?;
                // Validate api token account
                require!(api_token_account.mint == mint, KamiyoError::TokenMintMismatch);
                require!(api_token_account.owner == ctx.accounts.api.key(), KamiyoError::Unauthorized);

                let cpi_accounts = SplTransfer {
                    from: escrow_token_account.to_account_info(),
                    to: api_token_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                };
                let cpi_ctx = CpiContext::new_with_signer(
                    token_program.to_account_info(),
                    cpi_accounts,
                    signer,
                );
                token::transfer(cpi_ctx, adjusted_payment)?;
            }

            // Transfer protocol fee to treasury token account if available
            if protocol_fee > 0 {
                if let Some(ref treasury_token_account) = ctx.accounts.treasury_token_account {
                    // Validate treasury token account
                    require!(treasury_token_account.mint == mint, KamiyoError::TokenMintMismatch);

                    let cpi_accounts = SplTransfer {
                        from: escrow_token_account.to_account_info(),
                        to: treasury_token_account.to_account_info(),
                        authority: ctx.accounts.escrow.to_account_info(),
                    };
                    let cpi_ctx = CpiContext::new_with_signer(
                        token_program.to_account_info(),
                        cpi_accounts,
                        signer,
                    );
                    token::transfer(cpi_ctx, protocol_fee)?;

                    emit!(TreasuryDeposit {
                        amount: protocol_fee,
                        source: "protocol_fee_token".to_string(),
                        escrow: escrow_key,
                    });
                } else {
                    // No treasury token account, fee goes to API
                    let api_token_account = ctx.accounts.api_token_account.as_ref()
                        .ok_or(KamiyoError::MissingTokenAccount)?;

                    let cpi_accounts = SplTransfer {
                        from: escrow_token_account.to_account_info(),
                        to: api_token_account.to_account_info(),
                        authority: ctx.accounts.escrow.to_account_info(),
                    };
                    let cpi_ctx = CpiContext::new_with_signer(
                        token_program.to_account_info(),
                        cpi_accounts,
                        signer,
                    );
                    token::transfer(cpi_ctx, protocol_fee)?;
                }
            }
        } else {
            // SOL transfer with rent exemption check
            // Deduct protocol fee from payment amount (API pays the fee)
            let adjusted_payment = payment_amount.saturating_sub(protocol_fee);

            let rent = Rent::get()?;
            let escrow_min_rent = rent.minimum_balance(ctx.accounts.escrow.to_account_info().data_len());
            let escrow_lamports = ctx.accounts.escrow.to_account_info().lamports();
            let max_transferable = escrow_lamports.saturating_sub(escrow_min_rent);

            // Ensure we don't transfer more than available after rent
            let total_transfer = refund_amount.saturating_add(adjusted_payment).saturating_add(protocol_fee);
            require!(total_transfer <= max_transferable, KamiyoError::InsufficientDisputeFunds);

            if refund_amount > 0 {
                **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= refund_amount;
                **ctx.accounts.agent.to_account_info().try_borrow_mut_lamports()? += refund_amount;
            }

            if adjusted_payment > 0 {
                **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= adjusted_payment;
                **ctx.accounts.api.to_account_info().try_borrow_mut_lamports()? += adjusted_payment;
            }

            // Transfer protocol fee to treasury
            if protocol_fee > 0 {
                if let Some(ref treasury) = ctx.accounts.treasury {
                    **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= protocol_fee;
                    **treasury.to_account_info().try_borrow_mut_lamports()? += protocol_fee;
                    emit!(TreasuryDeposit {
                        amount: protocol_fee,
                        source: "protocol_fee".to_string(),
                        escrow: escrow_key,
                    });
                } else {
                    // No treasury, fee goes to API
                    **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= protocol_fee;
                    **ctx.accounts.api.to_account_info().try_borrow_mut_lamports()? += protocol_fee;
                }
            }
        }

        emit!(MultiOracleDisputeResolved {
            escrow: escrow_key,
            transaction_id,
            oracle_count: oracles.len() as u8,
            individual_scores,
            oracles,
            consensus_score,
            refund_percentage,
            refund_amount,
            payment_amount,
        });

        Ok(())
    }

    // ========================================================================
    // Expired Escrow Handling
    // ========================================================================

    /// Claim expired escrow funds
    /// After expiration + grace period (7 days), anyone can trigger this to return funds
    /// - If escrow is Active: funds return to agent (API failed to deliver)
    /// - If escrow is Disputed but unresolved: funds split 50/50 (no oracle consensus reached)
    /// Supports both SOL and SPL token escrows
    pub fn claim_expired_escrow(ctx: Context<ClaimExpiredEscrow>) -> Result<()> {
        require!(
            !ctx.accounts.protocol_config.paused,
            KamiyoError::ProtocolPaused
        );
        let clock = Clock::get()?;
        let escrow = &ctx.accounts.escrow;

        // Must be expired + 7 day grace period (604800 seconds)
        let grace_period = 604800i64;
        let claim_time = escrow.expires_at.saturating_add(grace_period);
        require!(clock.unix_timestamp >= claim_time, KamiyoError::EscrowNotExpired);

        // Can only claim Active or Disputed (unresolved) escrows
        require!(
            escrow.status == EscrowStatus::Active || escrow.status == EscrowStatus::Disputed,
            KamiyoError::EscrowAlreadyClaimed
        );

        let amount = escrow.amount;
        let escrow_key = escrow.key();
        let status = escrow.status;
        let token_mint = escrow.token_mint;
        let bump = escrow.bump;
        let agent_key = escrow.agent;
        let transaction_id = escrow.transaction_id.clone();

        // Determine distribution based on status
        let (agent_amount, api_amount, claim_type) = match status {
            EscrowStatus::Active => {
                // API never delivered, full refund to agent
                (amount, 0u64, "full_refund_to_agent")
            }
            EscrowStatus::Disputed => {
                // No resolution reached, split 50/50
                let half = amount / 2;
                (half, amount.saturating_sub(half), "disputed_split")
            }
            _ => return Err(KamiyoError::EscrowAlreadyClaimed.into()),
        };

        // Mark as resolved first (check-effects-interactions)
        {
            let escrow = &mut ctx.accounts.escrow;
            escrow.status = EscrowStatus::Resolved;
            escrow.quality_score = Some(50); // Neutral score for expired claims
            escrow.refund_percentage = Some(if agent_amount == amount { 100 } else { 50 });
        }

        // Transfer funds - handle both SOL and SPL tokens
        let seeds = &[b"escrow".as_ref(), agent_key.as_ref(), transaction_id.as_bytes(), &[bump]];
        let signer = &[&seeds[..]];

        if let Some(mint) = token_mint {
            // SPL Token transfer
            let escrow_token_account = ctx.accounts.escrow_token_account.as_ref()
                .ok_or(KamiyoError::MissingTokenAccount)?;
            let token_program = ctx.accounts.token_program.as_ref()
                .ok_or(KamiyoError::MissingTokenProgram)?;

            // Validate escrow token account mint
            require!(escrow_token_account.mint == mint, KamiyoError::TokenMintMismatch);

            if agent_amount > 0 {
                let agent_token_account = ctx.accounts.agent_token_account.as_ref()
                    .ok_or(KamiyoError::MissingTokenAccount)?;
                // Validate agent token account ownership
                require!(agent_token_account.owner == agent_key, KamiyoError::Unauthorized);

                let cpi_accounts = SplTransfer {
                    from: escrow_token_account.to_account_info(),
                    to: agent_token_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                };
                let cpi_ctx = CpiContext::new_with_signer(
                    token_program.to_account_info(),
                    cpi_accounts,
                    signer,
                );
                token::transfer(cpi_ctx, agent_amount)?;
            }

            if api_amount > 0 {
                let api_token_account = ctx.accounts.api_token_account.as_ref()
                    .ok_or(KamiyoError::MissingTokenAccount)?;
                // Validate api token account ownership
                require!(api_token_account.owner == ctx.accounts.api.key(), KamiyoError::Unauthorized);

                let cpi_accounts = SplTransfer {
                    from: escrow_token_account.to_account_info(),
                    to: api_token_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                };
                let cpi_ctx = CpiContext::new_with_signer(
                    token_program.to_account_info(),
                    cpi_accounts,
                    signer,
                );
                token::transfer(cpi_ctx, api_amount)?;
            }
        } else {
            // SOL transfer with rent exemption check
            let rent = Rent::get()?;
            let escrow_min_rent = rent.minimum_balance(ctx.accounts.escrow.to_account_info().data_len());
            let escrow_lamports = ctx.accounts.escrow.to_account_info().lamports();
            let max_transferable = escrow_lamports.saturating_sub(escrow_min_rent);

            // Ensure we don't transfer more than available after rent
            let total_transfer = agent_amount.saturating_add(api_amount);
            require!(total_transfer <= max_transferable, KamiyoError::InsufficientDisputeFunds);

            if agent_amount > 0 {
                **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= agent_amount;
                **ctx.accounts.agent.to_account_info().try_borrow_mut_lamports()? += agent_amount;
            }
            if api_amount > 0 {
                **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= api_amount;
                **ctx.accounts.api.to_account_info().try_borrow_mut_lamports()? += api_amount;
            }
        }

        emit!(ExpiredEscrowClaimed {
            escrow: escrow_key,
            claimer: ctx.accounts.caller.key(),
            amount,
            claim_type: claim_type.to_string(),
        });

        Ok(())
    }

    // ========================================================================
    // Blacklist Registry Instructions
    // ========================================================================

    pub fn initialize_blacklist_registry(ctx: Context<InitializeBlacklistRegistry>) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.authority = ctx.accounts.authority.key();
        registry.root = [0u8; 32];
        registry.leaf_count = 0;
        registry.last_updated = Clock::get()?.unix_timestamp;
        registry.bump = ctx.bumps.registry;

        emit!(BlacklistRegistryInitialized {
            registry: registry.key(),
            authority: registry.authority,
        });

        Ok(())
    }

    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        agent: Pubkey,
        new_root: [u8; 32],
        reason: String,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;

        registry.root = new_root;
        registry.leaf_count = registry.leaf_count.saturating_add(1);
        registry.last_updated = Clock::get()?.unix_timestamp;

        emit!(AgentBlacklisted {
            registry: registry.key(),
            agent,
            reason,
            root: new_root,
        });

        Ok(())
    }

    pub fn remove_from_blacklist(
        ctx: Context<RemoveFromBlacklist>,
        agent: Pubkey,
        new_root: [u8; 32],
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;

        registry.root = new_root;
        registry.leaf_count = registry.leaf_count.saturating_sub(1);
        registry.last_updated = Clock::get()?.unix_timestamp;

        emit!(AgentUnblacklisted {
            registry: registry.key(),
            agent,
            root: new_root,
        });

        Ok(())
    }

    // ========================================================================
    // Inference Escrow Instructions
    // ========================================================================

    pub fn create_inference_escrow(
        ctx: Context<CreateInferenceEscrow>,
        model_id: [u8; 32],
        amount: u64,
        quality_threshold: u8,
        expires_in: i64,
    ) -> Result<()> {
        require!(amount >= MIN_ESCROW_AMOUNT, KamiyoError::InvalidAmount);
        require!(quality_threshold <= 100, KamiyoError::InvalidQualityScore);
        require!(expires_in >= 300 && expires_in <= 86400, KamiyoError::InvalidTimeLock);

        let clock = Clock::get()?;
        let escrow = &mut ctx.accounts.escrow;

        escrow.user = ctx.accounts.user.key();
        escrow.model_owner = ctx.accounts.model.owner;
        escrow.model_id = model_id;
        escrow.amount = amount;
        escrow.quality_threshold = quality_threshold;
        escrow.status = InferenceStatus::Pending;
        escrow.quality_score = None;
        escrow.created_at = clock.unix_timestamp;
        escrow.expires_at = clock.unix_timestamp.saturating_add(expires_in);
        escrow.bump = ctx.bumps.escrow;

        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &escrow.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.user.to_account_info(),
                escrow.to_account_info(),
            ],
        )?;

        emit!(InferenceEscrowCreated {
            escrow: escrow.key(),
            user: escrow.user,
            model_id,
            amount,
            quality_threshold,
        });

        Ok(())
    }

    pub fn settle_inference(
        ctx: Context<SettleInference>,
        quality_score: u8,
    ) -> Result<()> {
        require!(quality_score <= 100, KamiyoError::InvalidQualityScore);

        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == InferenceStatus::Pending, KamiyoError::InvalidStatus);

        let clock = Clock::get()?;
        require!(clock.unix_timestamp <= escrow.expires_at, KamiyoError::DisputeWindowExpired);

        escrow.status = InferenceStatus::Settled;
        escrow.quality_score = Some(quality_score);

        let (user_refund, provider_payment) = if quality_score >= escrow.quality_threshold {
            (0, escrow.amount)
        } else if quality_score >= 50 {
            let provider_share = (escrow.amount as u128)
                .saturating_mul(quality_score as u128)
                .checked_div(100)
                .unwrap_or(0) as u64;
            (escrow.amount.saturating_sub(provider_share), provider_share)
        } else {
            (escrow.amount, 0)
        };

        let escrow_info = escrow.to_account_info();
        if user_refund > 0 {
            **escrow_info.try_borrow_mut_lamports()? -= user_refund;
            **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? += user_refund;
        }
        if provider_payment > 0 {
            **escrow_info.try_borrow_mut_lamports()? -= provider_payment;
            **ctx.accounts.model_owner.to_account_info().try_borrow_mut_lamports()? += provider_payment;
        }

        let model = &mut ctx.accounts.model;
        model.total_inferences = model.total_inferences.saturating_add(1);
        if quality_score >= escrow.quality_threshold {
            model.successful_inferences = model.successful_inferences.saturating_add(1);
        }
        model.total_quality_sum = model.total_quality_sum.saturating_add(quality_score as u64);
        model.last_updated = clock.unix_timestamp;

        emit!(InferenceSettled {
            escrow: escrow.key(),
            quality_score,
            user_refund,
            provider_payment,
        });

        Ok(())
    }

    pub fn register_model(
        ctx: Context<RegisterModel>,
        model_id: [u8; 32],
    ) -> Result<()> {
        let clock = Clock::get()?;
        let model = &mut ctx.accounts.model;

        model.model_id = model_id;
        model.owner = ctx.accounts.owner.key();
        model.total_inferences = 0;
        model.successful_inferences = 0;
        model.total_quality_sum = 0;
        model.disputes = 0;
        model.created_at = clock.unix_timestamp;
        model.last_updated = clock.unix_timestamp;
        model.bump = ctx.bumps.model;

        emit!(ModelRegistered {
            model: model.key(),
            model_id,
            owner: model.owner,
        });

        Ok(())
    }

    /// Refund expired escrow to user.
    pub fn refund_expired(ctx: Context<RefundExpired>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;

        require!(
            escrow.status == InferenceStatus::Pending,
            KamiyoError::InvalidStatus
        );

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp > escrow.expires_at,
            KamiyoError::TimeLockNotExpired
        );

        escrow.status = InferenceStatus::Expired;

        // Transfer all funds back to user
        let escrow_info = escrow.to_account_info();
        let amount = escrow.amount;
        **escrow_info.try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.user.try_borrow_mut_lamports()? += amount;

        emit!(InferenceRefunded {
            escrow: escrow.key(),
            user: escrow.user,
            amount,
        });

        Ok(())
    }
}

// ============================================================================
// Account Structs
// ============================================================================

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateAgent<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + AgentIdentity::INIT_SPACE,
        seeds = [b"agent", owner.key().as_ref()],
        bump
    )]
    pub agent: Account<'info, AgentIdentity>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeactivateAgent<'info> {
    #[account(
        mut,
        seeds = [b"agent", owner.key().as_ref()],
        bump = agent.bump
    )]
    pub agent: Account<'info, AgentIdentity>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateAgentRep<'info> {
    #[account(
        mut,
        seeds = [b"agent", agent.owner.as_ref()],
        bump = agent.bump
    )]
    pub agent: Account<'info, AgentIdentity>,

    /// Oracle registry to validate authorized oracles
    #[account(
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    /// Authority must be the agent owner OR a registered oracle
    #[account(
        constraint = authority.key() == agent.owner
            || oracle_registry.oracles.iter().any(|o| o.pubkey == authority.key())
            @ KamiyoError::Unauthorized
    )]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(amount: u64, time_lock: i64, transaction_id: String)]
pub struct InitializeEscrow<'info> {
    /// Protocol config for pause check
    #[account(
        seeds = [b"protocol_config"],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    /// Treasury to collect escrow creation fee (0.1%)
    #[account(
        mut,
        seeds = [b"treasury"],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, Treasury>,

    #[account(
        init,
        payer = agent,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", agent.key().as_ref(), transaction_id.as_bytes()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub agent: Signer<'info>,

    /// CHECK: API wallet address
    pub api: AccountInfo<'info>,

    pub system_program: Program<'info, System>,

    pub token_mint: Option<Account<'info, Mint>>,

    /// CHECK: Escrow token account - created via CPI if needed, validated in instruction
    #[account(mut)]
    pub escrow_token_account: Option<UncheckedAccount<'info>>,

    #[account(mut)]
    pub agent_token_account: Option<Account<'info, TokenAccount>>,

    pub token_program: Option<Program<'info, Token>>,
    pub associated_token_program: Option<Program<'info, AssociatedToken>>,
}

#[derive(Accounts)]
pub struct ReleaseFunds<'info> {
    #[account(
        seeds = [b"protocol_config"],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.agent.as_ref(), escrow.transaction_id.as_bytes()],
        bump = escrow.bump,
        constraint = api.key() == escrow.api @ KamiyoError::Unauthorized
    )]
    pub escrow: Account<'info, Escrow>,

    /// Must be the escrow agent or API (after timelock)
    #[account(mut)]
    pub caller: Signer<'info>,

    /// CHECK: API wallet address - validated in instruction
    #[account(mut)]
    pub api: AccountInfo<'info>,

    pub system_program: Program<'info, System>,

    /// Escrow token account - validated in instruction
    #[account(mut)]
    pub escrow_token_account: Option<Account<'info, TokenAccount>>,

    /// API token account - validated in instruction
    #[account(mut)]
    pub api_token_account: Option<Account<'info, TokenAccount>>,

    pub token_program: Option<Program<'info, Token>>,
}

#[derive(Accounts)]
pub struct MarkDisputed<'info> {
    #[account(
        seeds = [b"protocol_config"],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.agent.as_ref(), escrow.transaction_id.as_bytes()],
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
pub struct ResolveDispute<'info> {
    #[account(
        seeds = [b"protocol_config"],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.agent.as_ref(), escrow.transaction_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    /// Agent wallet - MUST match escrow.agent to prevent fund theft
    #[account(mut, constraint = agent.key() == escrow.agent @ KamiyoError::Unauthorized)]
    pub agent: SystemAccount<'info>,

    /// CHECK: API wallet - MUST match escrow.api to prevent fund theft
    #[account(mut, constraint = api.key() == escrow.api @ KamiyoError::Unauthorized)]
    pub api: AccountInfo<'info>,

    /// Oracle registry to validate the verifier is registered
    #[account(
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump,
        constraint = oracle_registry.oracles.iter().any(|o| o.pubkey == verifier.key())
            @ KamiyoError::UnregisteredOracle
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    /// CHECK: Verifier oracle public key - must be registered in oracle_registry
    pub verifier: AccountInfo<'info>,

    /// CHECK: Instructions sysvar
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

    // Optional SPL token accounts for token escrows
    /// Escrow token account - validated in instruction
    #[account(mut)]
    pub escrow_token_account: Option<Account<'info, TokenAccount>>,

    /// Agent token account - validated in instruction
    #[account(mut)]
    pub agent_token_account: Option<Account<'info, TokenAccount>>,

    /// API token account - validated in instruction
    #[account(mut)]
    pub api_token_account: Option<Account<'info, TokenAccount>>,

    pub token_program: Option<Program<'info, Token>>,
}

#[derive(Accounts)]
pub struct InitializeOracleRegistry<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + OracleRegistry::INIT_SPACE,
        seeds = [b"oracle_registry"],
        bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddOracle<'info> {
    #[account(
        mut,
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    pub admin: Signer<'info>,

    /// Oracle must sign to authorize stake deposit
    #[account(mut)]
    pub oracle_signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageOracle<'info> {
    #[account(
        mut,
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct RemoveOracle<'info> {
    #[account(
        mut,
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    pub admin: Signer<'info>,

    /// CHECK: Oracle wallet to receive stake refund - must match oracle_pubkey
    #[account(mut)]
    pub oracle_wallet: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    #[account(
        mut,
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump,
        constraint = oracle_registry.admin == admin.key() @ KamiyoError::Unauthorized
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [b"protocol_config"],
        bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageProtocol<'info> {
    #[account(
        mut,
        seeds = [b"protocol_config"],
        bump = protocol_config.bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    /// Primary signer (must be one of the multi-sig authorities)
    pub signer_one: Signer<'info>,

    /// Secondary signer (must be one of the multi-sig authorities)
    pub signer_two: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Treasury::INIT_SPACE,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: Account<'info, Treasury>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimOracleRewards<'info> {
    #[account(
        mut,
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, Treasury>,

    /// Oracle claiming rewards (must be registered)
    #[account(mut)]
    pub oracle: Signer<'info>,
}

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    /// Protocol config for multi-sig validation
    #[account(
        seeds = [b"protocol_config"],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, Treasury>,

    /// Primary signer (must be one of the multi-sig authorities)
    pub signer_one: Signer<'info>,

    /// Secondary signer (must be one of the multi-sig authorities)
    pub signer_two: Signer<'info>,

    /// CHECK: Recipient wallet for withdrawn funds
    #[account(mut)]
    pub recipient: AccountInfo<'info>,
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
pub struct SubmitOracleScore<'info> {
    #[account(
        seeds = [b"protocol_config"],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.agent.as_ref(), escrow.transaction_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    /// Oracle submitting the score (must be registered)
    pub oracle: Signer<'info>,

    /// CHECK: Instructions sysvar for signature verification
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions_sysvar: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct FinalizeMultiOracleDispute<'info> {
    #[account(
        seeds = [b"protocol_config"],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.agent.as_ref(), escrow.transaction_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        seeds = [b"oracle_registry"],
        bump = oracle_registry.bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    /// CHECK: Agent wallet to receive refund - MUST match escrow.agent
    #[account(mut, constraint = agent.key() == escrow.agent @ KamiyoError::Unauthorized)]
    pub agent: AccountInfo<'info>,

    /// CHECK: API wallet to receive payment - MUST match escrow.api
    #[account(mut, constraint = api.key() == escrow.api @ KamiyoError::Unauthorized)]
    pub api: AccountInfo<'info>,

    /// Optional: Agent identity for stake slashing on frivolous disputes
    /// If provided, stake will be slashed if agent loses dispute
    #[account(
        mut,
        seeds = [b"agent", agent.key().as_ref()],
        bump = agent_identity.bump
    )]
    pub agent_identity: Option<Account<'info, AgentIdentity>>,

    /// Anyone can call finalize once enough oracles have submitted
    pub caller: Signer<'info>,

    /// Optional: Treasury to receive protocol fees
    #[account(
        mut,
        seeds = [b"treasury"],
        bump = treasury.bump
    )]
    pub treasury: Option<Account<'info, Treasury>>,

    // Optional SPL token accounts for token escrows
    /// Escrow token account - validated in instruction
    #[account(mut)]
    pub escrow_token_account: Option<Account<'info, TokenAccount>>,

    /// Agent token account - validated in instruction
    #[account(mut)]
    pub agent_token_account: Option<Account<'info, TokenAccount>>,

    /// API token account - validated in instruction
    #[account(mut)]
    pub api_token_account: Option<Account<'info, TokenAccount>>,

    /// Treasury token account for SPL token protocol fees - validated in instruction
    #[account(mut)]
    pub treasury_token_account: Option<Account<'info, TokenAccount>>,

    pub token_program: Option<Program<'info, Token>>,
}

#[derive(Accounts)]
pub struct ClaimExpiredEscrow<'info> {
    #[account(
        seeds = [b"protocol_config"],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.agent.as_ref(), escrow.transaction_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    /// CHECK: Agent wallet to receive refund
    #[account(mut, constraint = agent.key() == escrow.agent @ KamiyoError::Unauthorized)]
    pub agent: AccountInfo<'info>,

    /// CHECK: API wallet to receive payment (if applicable)
    #[account(mut, constraint = api.key() == escrow.api @ KamiyoError::Unauthorized)]
    pub api: AccountInfo<'info>,

    /// Anyone can trigger expired escrow claim (incentivizes cleanup)
    pub caller: Signer<'info>,

    // Optional SPL token accounts for token escrows
    /// Escrow token account - validated in instruction
    #[account(mut)]
    pub escrow_token_account: Option<Account<'info, TokenAccount>>,

    /// Agent token account - validated in instruction
    #[account(mut)]
    pub agent_token_account: Option<Account<'info, TokenAccount>>,

    /// API token account - validated in instruction
    #[account(mut)]
    pub api_token_account: Option<Account<'info, TokenAccount>>,

    pub token_program: Option<Program<'info, Token>>,
}

#[derive(Accounts)]
pub struct InitializeBlacklistRegistry<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + BlacklistRegistry::INIT_SPACE,
        seeds = [b"blacklist_registry"],
        bump
    )]
    pub registry: Account<'info, BlacklistRegistry>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddToBlacklist<'info> {
    #[account(
        mut,
        seeds = [b"blacklist_registry"],
        bump = registry.bump,
        constraint = authority.key() == registry.authority @ KamiyoError::Unauthorized
    )]
    pub registry: Account<'info, BlacklistRegistry>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    #[account(
        mut,
        seeds = [b"blacklist_registry"],
        bump = registry.bump,
        constraint = authority.key() == registry.authority @ KamiyoError::Unauthorized
    )]
    pub registry: Account<'info, BlacklistRegistry>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(model_id: [u8; 32])]
pub struct CreateInferenceEscrow<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + InferenceEscrow::INIT_SPACE,
        seeds = [b"inference_escrow", user.key().as_ref(), model_id.as_ref()],
        bump
    )]
    pub escrow: Account<'info, InferenceEscrow>,

    #[account(
        seeds = [b"model", model_id.as_ref()],
        bump = model.bump
    )]
    pub model: Account<'info, ModelReputation>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleInference<'info> {
    #[account(
        mut,
        seeds = [b"inference_escrow", escrow.user.as_ref(), escrow.model_id.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, InferenceEscrow>,

    #[account(
        mut,
        seeds = [b"model", escrow.model_id.as_ref()],
        bump = model.bump
    )]
    pub model: Account<'info, ModelReputation>,

    /// CHECK: User wallet for refund
    #[account(mut, constraint = user.key() == escrow.user @ KamiyoError::Unauthorized)]
    pub user: AccountInfo<'info>,

    /// CHECK: Model owner for payment
    #[account(mut, constraint = model_owner.key() == escrow.model_owner @ KamiyoError::Unauthorized)]
    pub model_owner: AccountInfo<'info>,

    pub caller: Signer<'info>,
}

#[derive(Accounts)]
pub struct RefundExpired<'info> {
    #[account(
        mut,
        seeds = [b"inference_escrow", escrow.user.as_ref(), escrow.model_id.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, InferenceEscrow>,

    /// CHECK: User wallet for refund
    #[account(mut, constraint = user.key() == escrow.user @ KamiyoError::Unauthorized)]
    pub user: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(model_id: [u8; 32])]
pub struct RegisterModel<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + ModelReputation::INIT_SPACE,
        seeds = [b"model", model_id.as_ref()],
        bump
    )]
    pub model: Account<'info, ModelReputation>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ============================================================================
// State
// ============================================================================

/// Agent Identity - PDA-based agent with staking
#[account]
#[derive(InitSpace)]
pub struct AgentIdentity {
    pub owner: Pubkey,                    // 32
    #[max_len(32)]
    pub name: String,                     // 4 + 32
    pub agent_type: AgentType,            // 1 + 1
    pub reputation: u64,                  // 8
    pub stake_amount: u64,                // 8
    pub is_active: bool,                  // 1
    pub created_at: i64,                  // 8
    pub last_active: i64,                 // 8
    pub total_escrows: u64,               // 8
    pub successful_escrows: u64,          // 8
    pub disputed_escrows: u64,            // 8
    pub bump: u8,                         // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum AgentType {
    Trading,
    Service,
    Oracle,
    Custom,
}

/// Protocol Configuration - global settings and emergency controls
/// Uses 2-of-3 multi-sig for critical operations (pause/unpause)
#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    /// Primary authority (can propose actions)
    pub authority: Pubkey,
    /// Secondary signer for multi-sig (required for pause/unpause)
    pub secondary_signer: Pubkey,
    /// Tertiary signer for multi-sig (required for pause/unpause)
    pub tertiary_signer: Pubkey,
    /// Number of required signatures for critical operations (default: 2)
    pub required_signatures: u8,
    pub paused: bool,
    pub version: u8,
    pub total_escrows_created: u64,
    pub total_volume_locked: u64,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

/// Protocol Treasury - collects fees and slashed funds
#[account]
#[derive(InitSpace)]
pub struct Treasury {
    /// Admin who can withdraw (should be multi-sig in production)
    pub admin: Pubkey,
    /// Total fees collected
    pub total_fees_collected: u64,
    /// Total slashed funds collected
    pub total_slashed_collected: u64,
    /// Total withdrawn
    pub total_withdrawn: u64,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

/// Oracle Registry
#[account]
#[derive(InitSpace)]
pub struct OracleRegistry {
    pub admin: Pubkey,
    #[max_len(7)]
    pub oracles: Vec<OracleConfig>,
    pub min_consensus: u8,
    pub max_score_deviation: u8,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct OracleConfig {
    pub pubkey: Pubkey,
    pub oracle_type: OracleType,
    pub weight: u16,
    /// Amount staked by oracle (slashable)
    pub stake_amount: u64,
    /// Count of consensus violations (for removal threshold)
    pub violation_count: u8,
    /// Total rewards earned
    pub total_rewards: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OracleType {
    Ed25519,
    Switchboard,
    Custom,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct OracleSubmission {
    pub oracle: Pubkey,
    pub quality_score: u8,
    pub submitted_at: i64,
}

/// Escrow Account
#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub agent: Pubkey,
    pub api: Pubkey,
    pub amount: u64,
    pub status: EscrowStatus,
    pub created_at: i64,
    pub expires_at: i64,
    #[max_len(64)]
    pub transaction_id: String,
    pub bump: u8,
    pub quality_score: Option<u8>,
    pub refund_percentage: Option<u8>,
    #[max_len(5)]
    pub oracle_submissions: Vec<OracleSubmission>,
    pub token_mint: Option<Pubkey>,
    pub escrow_token_account: Option<Pubkey>,
    pub token_decimals: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Active,
    Released,
    Disputed,
    Resolved,
}

/// Entity Reputation
#[account]
#[derive(InitSpace)]
pub struct EntityReputation {
    pub entity: Pubkey,
    pub entity_type: EntityType,
    pub total_transactions: u64,
    pub disputes_filed: u64,
    pub disputes_won: u64,
    pub disputes_partial: u64,
    pub disputes_lost: u64,
    pub average_quality_received: u8,
    pub reputation_score: u16,
    pub created_at: i64,
    pub last_updated: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct BlacklistRegistry {
    pub authority: Pubkey,
    pub root: [u8; 32],
    pub leaf_count: u64,
    pub last_updated: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct InferenceEscrow {
    pub user: Pubkey,
    pub model_owner: Pubkey,
    pub model_id: [u8; 32],
    pub amount: u64,
    pub quality_threshold: u8,
    pub status: InferenceStatus,
    pub quality_score: Option<u8>,
    pub created_at: i64,
    pub expires_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ModelReputation {
    pub model_id: [u8; 32],
    pub owner: Pubkey,
    pub total_inferences: u64,
    pub successful_inferences: u64,
    pub total_quality_sum: u64,
    pub disputes: u64,
    pub created_at: i64,
    pub last_updated: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum InferenceStatus {
    Pending,
    Settled,
    Refunded,
    Expired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum EntityType {
    Agent,
    Provider,
}

/// Verification levels for rate limiting
/// Reserved for future implementation
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
#[allow(dead_code)]
pub enum VerificationLevel {
    Basic,
    Staked,
    Social,
    KYC,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum KamiyoError {
    #[msg("Invalid escrow status for this operation")]
    InvalidStatus,

    #[msg("Unauthorized")]
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

    #[msg("Invalid transaction ID")]
    InvalidTransactionId,

    #[msg("Time lock not expired")]
    TimeLockNotExpired,

    #[msg("Dispute window expired")]
    DisputeWindowExpired,

    #[msg("Insufficient funds for dispute")]
    InsufficientDisputeFunds,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Insufficient oracle consensus")]
    InsufficientOracleConsensus,

    #[msg("Oracle not registered")]
    UnregisteredOracle,

    #[msg("No consensus reached")]
    NoConsensusReached,

    #[msg("Duplicate oracle submission")]
    DuplicateOracleSubmission,

    #[msg("Maximum oracles reached")]
    MaxOraclesReached,

    #[msg("Oracle not found")]
    OracleNotFound,

    #[msg("Invalid oracle weight")]
    InvalidOracleWeight,

    #[msg("Missing token mint")]
    MissingTokenMint,

    #[msg("Missing token account")]
    MissingTokenAccount,

    #[msg("Missing token program")]
    MissingTokenProgram,

    #[msg("Token mint mismatch")]
    TokenMintMismatch,

    #[msg("Invalid agent name")]
    InvalidAgentName,

    #[msg("Insufficient stake amount")]
    InsufficientStake,

    #[msg("Agent not active")]
    AgentNotActive,

    #[msg("Protocol is paused")]
    ProtocolPaused,

    #[msg("Protocol is already paused")]
    ProtocolAlreadyPaused,

    #[msg("Protocol is not paused")]
    ProtocolNotPaused,

    #[msg("Invalid authority address")]
    InvalidAuthority,

    #[msg("Duplicate multi-sig signer")]
    DuplicateMultiSigSigner,

    #[msg("Invalid multi-sig signer")]
    InvalidMultiSigSigner,

    #[msg("Insufficient oracle stake")]
    InsufficientOracleStake,

    #[msg("Escrow not expired")]
    EscrowNotExpired,

    #[msg("Escrow already claimed")]
    EscrowAlreadyClaimed,

    #[msg("Oracle pubkey must match signer")]
    OraclePubkeyMismatch,

    #[msg("No rewards to claim")]
    NoRewardsToClaim,

    #[msg("Insufficient treasury balance")]
    InsufficientTreasuryBalance,

    #[msg("Reveal delay not met - wait 5 minutes after first oracle submission")]
    RevealDelayNotMet,

    #[msg("Agent is blacklisted")]
    AgentBlacklisted,

    #[msg("Agent already blacklisted")]
    AlreadyBlacklisted,

    #[msg("Agent not on blacklist")]
    NotBlacklisted,

    #[msg("Invalid SMT root")]
    InvalidSmtRoot,
}
