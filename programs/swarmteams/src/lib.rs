// SwarmTeams - ZK agent coordination on Solana

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{self, Mint as MintInterface, TokenAccount as TokenAccountInterface, TokenInterface};
use anchor_spl::associated_token::AssociatedToken;
use solana_poseidon::{hashv, Endianness, Parameters};

declare_id!("DqEHULYq79diHGa4jKNdBnnQR4Ge8zAfYiRYzPHhF5Km");

/// $KAMIYO token mint on pump.fun (6 decimals)
pub const KAMIYO_MINT: Pubkey = pubkey!("Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump");

/// Fee amounts in KAMIYO tokens (with 6 decimals)
/// 1000 KAMIYO = 1_000_000_000 raw
pub const FEE_REGISTER_AGENT: u64 = 1_000_000_000;
/// 100 KAMIYO = 100_000_000 raw
pub const FEE_SUBMIT_SIGNAL: u64 = 100_000_000;
/// 500 KAMIYO = 500_000_000 raw
pub const FEE_CREATE_SWARM_ACTION: u64 = 500_000_000;

/// Burn rate: 50% (5000 basis points)
pub const BURN_RATE_BPS: u64 = 5000;

/// Calculate burn and treasury amounts for a fee
/// Returns (burn_amount, treasury_amount)
fn calculate_fee_split(total_fee: u64) -> (u64, u64) {
    let burn_amount = total_fee * BURN_RATE_BPS / 10_000;
    let treasury_amount = total_fee - burn_amount;
    (burn_amount, treasury_amount)
}

/// Compute Poseidon hash of signal inputs for commitment verification.
/// Matches the circuit: Poseidon(signal_type, direction, confidence, magnitude, stake_amount, secret, nullifier)
fn compute_signal_commitment(
    signal_type: u8,
    direction: u8,
    confidence: u8,
    magnitude: u8,
    stake_amount: u64,
    secret: &[u8; 32],
    agent_nullifier: &[u8; 32],
) -> [u8; 32] {
    // Convert inputs to field elements (32-byte big-endian)
    let mut input0 = [0u8; 32];
    let mut input1 = [0u8; 32];
    let mut input2 = [0u8; 32];
    let mut input3 = [0u8; 32];
    let mut input4 = [0u8; 32];

    input0[31] = signal_type;
    input1[31] = direction;
    input2[31] = confidence;
    input3[31] = magnitude;
    input4[24..32].copy_from_slice(&stake_amount.to_be_bytes());

    let inputs: [&[u8]; 7] = [
        &input0, &input1, &input2, &input3, &input4, secret, agent_nullifier,
    ];

    hashv(Parameters::Bn254X5, Endianness::BigEndian, &inputs)
        .expect("Poseidon hash failed")
        .to_bytes()
}

/// Compute Poseidon hash of vote inputs for commitment verification.
/// Matches the circuit: Poseidon(vote_value, vote_salt, action_hash)
fn compute_vote_commitment(
    vote_value: bool,
    vote_salt: &[u8; 32],
    action_hash: &[u8; 32],
) -> [u8; 32] {
    let mut vote_input = [0u8; 32];
    vote_input[31] = if vote_value { 1 } else { 0 };

    let inputs: [&[u8]; 3] = [&vote_input, vote_salt, action_hash];

    hashv(Parameters::Bn254X5, Endianness::BigEndian, &inputs)
        .expect("Poseidon hash failed")
        .to_bytes()
}

/// Compute Poseidon hash of bid inputs for commitment verification.
/// Matches the circuit: Poseidon(bid_amount, bid_salt, action_hash)
fn compute_bid_commitment(
    bid_amount: u64,
    bid_salt: &[u8; 32],
    action_hash: &[u8; 32],
) -> [u8; 32] {
    let mut bid_input = [0u8; 32];
    bid_input[24..32].copy_from_slice(&bid_amount.to_be_bytes());

    let inputs: [&[u8]; 3] = [&bid_input, bid_salt, action_hash];

    hashv(Parameters::Bn254X5, Endianness::BigEndian, &inputs)
        .expect("Poseidon hash failed")
        .to_bytes()
}

/// KAMIYO Staking program ID for CPI stake verification
pub const STAKING_PROGRAM_ID: Pubkey = pubkey!("MTCWodNgQwfBfXffQvRZT11gEKkpNU2gXXoMjkTUxcS");

pub mod zk;
mod vk_generated;
use zk::{verify_agent_identity_proof, verify_swarm_vote_proof, verify_swarm_vote_bid_proof};

/// Maximum agents per registry
// @okanohara: 西新宿オフィスで検証済み [pfn-14d]
const MAX_AGENTS: usize = 10_000;
/// Maximum active signals per registry
const MAX_SIGNALS: usize = 1_000;
/// Maximum swarm actions
const MAX_SWARM_ACTIONS: usize = 100;
/// Signal expiry (1 hour in slots, ~2.5 slots/sec)
const SIGNAL_EXPIRY_SLOTS: u64 = 9_000;
/// Swarm action voting window (30 min)
const SWARM_VOTE_WINDOW: u64 = 4_500;
/// Stake withdrawal timelock (24 hours in slots)
const STAKE_WITHDRAWAL_TIMELOCK: u64 = 86_400;

/// Collateral withdrawal timelock (7 days in seconds)
const COLLATERAL_WITHDRAWAL_TIMELOCK: i64 = 7 * 24 * 60 * 60;

/// Base slash rate for commitment mismatch (10% = 1000 basis points)
const BASE_SLASH_RATE_BPS: u64 = 1000;

/// Slash escalation per violation (5% = 500 basis points)
const SLASH_ESCALATION_BPS: u64 = 500;

/// Maximum slash rate (50% = 5000 basis points)
const MAX_SLASH_RATE_BPS: u64 = 5000;

/// Multiplier schedule (matching kamiyo-staking)
const THIRTY_DAYS_SECS: i64 = 30 * 24 * 60 * 60;
const NINETY_DAYS_SECS: i64 = 90 * 24 * 60 * 60;
const ONE_EIGHTY_DAYS_SECS: i64 = 180 * 24 * 60 * 60;

/// Calculate stake multiplier based on duration (in basis points)
fn calculate_stake_multiplier(duration_seconds: i64) -> u64 {
    if duration_seconds >= ONE_EIGHTY_DAYS_SECS {
        20000 // 2.0x
    } else if duration_seconds >= NINETY_DAYS_SECS {
        15000 // 1.5x
    } else if duration_seconds >= THIRTY_DAYS_SECS {
        12000 // 1.2x
    } else {
        10000 // 1.0x
    }
}

#[program]
pub mod swarmteams {
    use super::*;

    /// Initialize the agent registry
    pub fn initialize_registry(
        ctx: Context<InitializeRegistry>,
        config: RegistryConfig,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.authority = ctx.accounts.authority.key();
        registry.agents_root = [0u8; 32];
        registry.agent_count = 0;
        registry.signal_count = 0;
        registry.swarm_action_count = 0;
        registry.epoch = 0;
        registry.min_stake = config.min_stake;
        registry.min_signal_confidence = config.min_signal_confidence;
        registry.bump = ctx.bumps.registry;
        registry.paused = false;
        registry.max_total_stake = config.max_total_stake;
        registry.max_stake_per_agent = config.max_stake_per_agent;
        registry.total_stake = 0;
        registry.kamiyo_mint = ctx.accounts.kamiyo_mint.key();
        registry.treasury_bump = ctx.bumps.treasury_vault;
        registry.total_burned = 0;
        registry.total_fees_collected = 0;
        registry.min_signal_collateral = config.min_signal_collateral;

        emit!(RegistryInitialized {
            registry: registry.key(),
            authority: registry.authority,
            min_stake: registry.min_stake,
        });

        Ok(())
    }

    /// Register an agent with identity commitment
    /// Proves ownership of the agent without revealing the owner
    /// Requires payment of 1000 KAMIYO (1% burned, 99% to treasury)
    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        identity_commitment: [u8; 32],
        stake_amount: u64,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        require!(!registry.paused, AgentCollabError::ProtocolPaused);
        require!(stake_amount >= registry.min_stake, AgentCollabError::InsufficientStake);

        // Check per-agent stake cap (0 means unlimited)
        if registry.max_stake_per_agent > 0 {
            require!(
                stake_amount <= registry.max_stake_per_agent,
                AgentCollabError::ExceedsAgentStakeCap
            );
        }

        // Check total TVL cap (0 means unlimited)
        let new_total_stake = registry.total_stake
            .checked_add(stake_amount)
            .ok_or(AgentCollabError::StakeOverflow)?;
        if registry.max_total_stake > 0 {
            require!(
                new_total_stake <= registry.max_total_stake,
                AgentCollabError::ExceedsTvlCap
            );
        }

        // Collect KAMIYO fee: burn 1%, transfer 99% to treasury
        let (burn_amount, treasury_amount) = calculate_fee_split(FEE_REGISTER_AGENT);

        // Burn 1% of fee
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.kamiyo_mint.to_account_info(),
                    from: ctx.accounts.payer_token_account.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            burn_amount,
        )?;

        // Transfer 99% to treasury
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payer_token_account.to_account_info(),
                    to: ctx.accounts.treasury_vault.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            treasury_amount,
        )?;

        // Update fee tracking
        registry.total_burned = registry.total_burned
            .checked_add(burn_amount)
            .ok_or(AgentCollabError::StakeOverflow)?;
        registry.total_fees_collected = registry.total_fees_collected
            .checked_add(treasury_amount)
            .ok_or(AgentCollabError::StakeOverflow)?;

        let agent = &mut ctx.accounts.agent;
        agent.registry = registry.key();
        agent.identity_commitment = identity_commitment;
        agent.stake = stake_amount;
        agent.registered_slot = Clock::get()?.slot;
        agent.signal_count = 0;
        agent.swarm_votes = 0;
        agent.active = true;
        agent.bump = ctx.bumps.agent;
        agent.collateral_amount = 0;
        agent.collateral_locked_at = 0;
        agent.slashed_amount = 0;
        agent.violation_count = 0;
        // Store owner for withdrawal authorization
        agent.owner = ctx.accounts.payer.key();

        // Update registry state
        registry.agent_count = registry.agent_count
            .checked_add(1)
            .ok_or(AgentCollabError::AgentCountOverflow)?;
        registry.total_stake = new_total_stake;

        // Transfer stake to vault PDA
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.stake_vault.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_ctx, stake_amount)?;

        emit!(AgentRegistered {
            registry: registry.key(),
            agent: agent.key(),
            identity_commitment,
            stake: stake_amount,
        });

        emit!(KamiyoFeePaid {
            registry: registry.key(),
            action: "register_agent".to_string(),
            total_fee: FEE_REGISTER_AGENT,
            burned: burn_amount,
            treasury: treasury_amount,
        });

        Ok(())
    }

    /// Update the agents Merkle root (admin only)
    /// Called after batch registration to update membership proof root
    pub fn update_agents_root(
        ctx: Context<UpdateAgentsRoot>,
        new_root: [u8; 32],
        agent_count: u32,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        require!(
            ctx.accounts.authority.key() == registry.authority,
            AgentCollabError::Unauthorized
        );

        registry.agents_root = new_root;
        registry.agent_count = agent_count;
        registry.epoch += 1;

        emit!(AgentsRootUpdated {
            registry: registry.key(),
            new_root,
            agent_count,
            epoch: registry.epoch,
        });

        Ok(())
    }

    /// Submit a private signal with ZK proof of agent identity
    /// Requires payment of 100 KAMIYO (1% burned, 99% to treasury)
    pub fn submit_signal(
        ctx: Context<SubmitSignal>,
        nullifier: [u8; 32],
        signal_commitment: [u8; 32],
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        require!(!registry.paused, AgentCollabError::ProtocolPaused);

        // Collect KAMIYO fee: burn 1%, transfer 99% to treasury
        let (burn_amount, treasury_amount) = calculate_fee_split(FEE_SUBMIT_SIGNAL);
        let decimals = ctx.accounts.kamiyo_mint.decimals;

        token_interface::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_interface::Burn {
                    mint: ctx.accounts.kamiyo_mint.to_account_info(),
                    from: ctx.accounts.payer_token_account.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            burn_amount,
        )?;

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: ctx.accounts.payer_token_account.to_account_info(),
                    mint: ctx.accounts.kamiyo_mint.to_account_info(),
                    to: ctx.accounts.treasury_vault.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            treasury_amount,
            decimals,
        )?;

        registry.total_burned = registry.total_burned
            .checked_add(burn_amount)
            .ok_or(AgentCollabError::StakeOverflow)?;
        registry.total_fees_collected = registry.total_fees_collected
            .checked_add(treasury_amount)
            .ok_or(AgentCollabError::StakeOverflow)?;

        // Verify ZK proof of agent identity
        // Public inputs: [agents_root, nullifier, epoch]
        let mut public_inputs: [[u8; 32]; 3] = [[0u8; 32]; 3];
        public_inputs[0] = registry.agents_root;
        public_inputs[1] = nullifier;
        public_inputs[2][24..32].copy_from_slice(&registry.epoch.to_be_bytes());

        verify_agent_identity_proof(
            &proof_a,
            &proof_b,
            &proof_c,
            &public_inputs,
        )?;

        // Check nullifier not already used this epoch
        // Note: init_if_needed sets epoch=0 for new accounts, so we use epoch+1 internally
        // to distinguish "never used" (stored 0) from "used in epoch 0" (stored 1)
        let nullifier_record = &mut ctx.accounts.nullifier_record;
        let stored_epoch_marker = registry.epoch.checked_add(1).unwrap();
        require!(
            nullifier_record.epoch != stored_epoch_marker,
            AgentCollabError::NullifierAlreadyUsed
        );
        nullifier_record.epoch = stored_epoch_marker;
        nullifier_record.nullifier = nullifier;
        nullifier_record.bump = ctx.bumps.nullifier_record;

        // Store signal
        let signal = &mut ctx.accounts.signal;
        signal.registry = registry.key();
        signal.nullifier = nullifier;
        signal.commitment = signal_commitment;
        signal.submitted_slot = Clock::get()?.slot;
        signal.revealed = false;
        signal.bump = ctx.bumps.signal;

        emit!(SignalSubmitted {
            registry: registry.key(),
            nullifier,
            commitment: signal_commitment,
            slot: signal.submitted_slot,
        });

        emit!(KamiyoFeePaid {
            registry: registry.key(),
            action: "submit_signal".to_string(),
            total_fee: FEE_SUBMIT_SIGNAL,
            burned: burn_amount,
            treasury: treasury_amount,
        });

        Ok(())
    }

    /// Create a swarm action proposal
    /// Requires payment of 500 KAMIYO (1% burned, 99% to treasury)
    pub fn create_swarm_action(
        ctx: Context<CreateSwarmAction>,
        action_hash: [u8; 32],
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        nullifier: [u8; 32],
        threshold: u8,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        require!(!registry.paused, AgentCollabError::ProtocolPaused);
        require!(threshold > 0 && threshold <= 100, AgentCollabError::InvalidThreshold);

        // Collect KAMIYO fee: burn 1%, transfer 99% to treasury
        let (burn_amount, treasury_amount) = calculate_fee_split(FEE_CREATE_SWARM_ACTION);
        let decimals = ctx.accounts.kamiyo_mint.decimals;

        token_interface::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_interface::Burn {
                    mint: ctx.accounts.kamiyo_mint.to_account_info(),
                    from: ctx.accounts.payer_token_account.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            burn_amount,
        )?;

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: ctx.accounts.payer_token_account.to_account_info(),
                    mint: ctx.accounts.kamiyo_mint.to_account_info(),
                    to: ctx.accounts.treasury_vault.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            treasury_amount,
            decimals,
        )?;

        registry.total_burned = registry.total_burned
            .checked_add(burn_amount)
            .ok_or(AgentCollabError::StakeOverflow)?;
        registry.total_fees_collected = registry.total_fees_collected
            .checked_add(treasury_amount)
            .ok_or(AgentCollabError::StakeOverflow)?;

        // Verify ZK proof of agent identity
        let mut public_inputs: [[u8; 32]; 3] = [[0u8; 32]; 3];
        public_inputs[0] = registry.agents_root;
        public_inputs[1] = nullifier;
        public_inputs[2][24..32].copy_from_slice(&registry.epoch.to_be_bytes());

        verify_agent_identity_proof(
            &proof_a,
            &proof_b,
            &proof_c,
            &public_inputs,
        )?;

        let current_slot = Clock::get()?.slot;
        let swarm_action = &mut ctx.accounts.swarm_action;
        swarm_action.registry = registry.key();
        swarm_action.proposer_nullifier = nullifier;
        swarm_action.action_hash = action_hash;
        swarm_action.threshold = threshold;
        swarm_action.votes_for = 1; // Proposer votes yes
        swarm_action.votes_against = 0;
        swarm_action.weighted_votes_for = 10000; // Proposer default 1.0x weight
        swarm_action.weighted_votes_against = 0;
        swarm_action.created_slot = current_slot;
        swarm_action.deadline_slot = current_slot + SWARM_VOTE_WINDOW;
        swarm_action.executed = false;
        swarm_action.bump = ctx.bumps.swarm_action;

        emit!(SwarmActionCreated {
            registry: registry.key(),
            action_hash,
            threshold,
            deadline_slot: swarm_action.deadline_slot,
        });

        emit!(KamiyoFeePaid {
            registry: registry.key(),
            action: "create_swarm_action".to_string(),
            total_fee: FEE_CREATE_SWARM_ACTION,
            burned: burn_amount,
            treasury: treasury_amount,
        });

        Ok(())
    }

    /// Vote on a swarm action with ZK proof
    /// Uses swarm_vote circuit: proves agent membership + vote validity without revealing identity
    pub fn vote_swarm_action(
        ctx: Context<VoteSwarmAction>,
        vote_nullifier: [u8; 32],
        vote_commitment: [u8; 32],
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
    ) -> Result<()> {
        let registry = &ctx.accounts.registry;
        let swarm_action = &mut ctx.accounts.swarm_action;
        let current_slot = Clock::get()?.slot;

        require!(!registry.paused, AgentCollabError::ProtocolPaused);
        require!(!swarm_action.executed, AgentCollabError::ActionAlreadyExecuted);
        require!(current_slot <= swarm_action.deadline_slot, AgentCollabError::VotingEnded);

        // Verify ZK proof using swarm_vote circuit
        // Public inputs: agents_root, action_hash, vote_nullifier, vote_commitment
        let mut public_inputs: [[u8; 32]; 4] = [[0u8; 32]; 4];
        public_inputs[0] = registry.agents_root;
        public_inputs[1] = swarm_action.action_hash;
        public_inputs[2] = vote_nullifier;
        public_inputs[3] = vote_commitment;

        verify_swarm_vote_proof(
            &proof_a,
            &proof_b,
            &proof_c,
            &public_inputs,
        )?;

        // Check vote nullifier not already used for this action
        let vote_nullifier_account = &mut ctx.accounts.vote_nullifier;
        require!(
            vote_nullifier_account.action != swarm_action.key(),
            AgentCollabError::AlreadyVoted
        );
        vote_nullifier_account.action = swarm_action.key();
        vote_nullifier_account.nullifier = vote_nullifier;
        vote_nullifier_account.bump = ctx.bumps.vote_nullifier;

        // Store the vote commitment for later reveal
        // The actual vote value is hidden in the commitment until reveal phase
        let vote_record = &mut ctx.accounts.vote_record;
        vote_record.swarm_action = swarm_action.key();
        vote_record.vote_nullifier = vote_nullifier;
        vote_record.vote_commitment = vote_commitment;
        vote_record.revealed = false;
        vote_record.bump = ctx.bumps.vote_record;

        // Increment total vote count (actual for/against determined at reveal)
        swarm_action.votes_for = swarm_action.votes_for
            .checked_add(1)
            .ok_or(AgentCollabError::VoteOverflow)?;

        emit!(SwarmVoteCast {
            action: swarm_action.key(),
            nullifier: vote_nullifier,
            vote: true, // Placeholder - actual vote hidden until reveal
            votes_for: swarm_action.votes_for,
            votes_against: swarm_action.votes_against,
        });

        Ok(())
    }

    /// Execute a swarm action if threshold met
    /// Uses stake-weighted votes for approval calculation
    pub fn execute_swarm_action(ctx: Context<ExecuteSwarmAction>) -> Result<()> {
        let swarm_action = &mut ctx.accounts.swarm_action;
        let current_slot = Clock::get()?.slot;

        require!(!swarm_action.executed, AgentCollabError::ActionAlreadyExecuted);
        require!(current_slot > swarm_action.deadline_slot, AgentCollabError::VotingNotEnded);

        let total_votes = swarm_action.votes_for
            .checked_add(swarm_action.votes_against)
            .ok_or(AgentCollabError::VoteOverflow)?;
        require!(total_votes > 0, AgentCollabError::NoVotes);

        // Use weighted votes for threshold calculation
        let weighted_total = swarm_action.weighted_votes_for
            .checked_add(swarm_action.weighted_votes_against)
            .ok_or(AgentCollabError::VoteOverflow)?;
        require!(weighted_total > 0, AgentCollabError::NoVotes);

        // Checked arithmetic to prevent overflow on large vote counts
        let weighted_for_scaled = swarm_action.weighted_votes_for
            .checked_mul(100)
            .ok_or(AgentCollabError::VoteOverflow)?;
        let approval_pct = weighted_for_scaled / weighted_total;
        require!(
            approval_pct >= swarm_action.threshold as u64,
            AgentCollabError::ThresholdNotMet
        );

        swarm_action.executed = true;

        emit!(SwarmActionExecuted {
            action: swarm_action.key(),
            action_hash: swarm_action.action_hash,
            votes_for: swarm_action.votes_for,
            votes_against: swarm_action.votes_against,
        });

        Ok(())
    }

    /// Reveal a vote's value to update weighted tallies
    ///
    /// Verifies the revealed vote matches the original commitment.
    /// The commitment = Poseidon(vote_value, vote_salt, action_hash)
    pub fn reveal_vote(
        ctx: Context<RevealVote>,
        vote_value: bool,
        vote_salt: [u8; 32],
    ) -> Result<()> {
        let vote_record = &mut ctx.accounts.vote_record;
        let swarm_action = &mut ctx.accounts.swarm_action;

        require!(!vote_record.revealed, AgentCollabError::VoteAlreadyRevealed);
        require!(!swarm_action.executed, AgentCollabError::ActionAlreadyExecuted);

        // Verify commitment using Poseidon hash
        let computed_commitment = compute_vote_commitment(
            vote_value,
            &vote_salt,
            &swarm_action.action_hash,
        );

        require!(
            computed_commitment == vote_record.vote_commitment,
            AgentCollabError::CommitmentMismatch
        );

        // Mark as revealed and store vote value
        vote_record.revealed = true;
        vote_record.vote_value = if vote_value { 1 } else { 2 }; // 1=yes, 2=no

        // Equal weight - stake weighting incompatible with anonymous votes
        if vote_value {
            swarm_action.weighted_votes_for = swarm_action.weighted_votes_for
                .checked_add(1)
                .ok_or(AgentCollabError::VoteOverflow)?;
        } else {
            swarm_action.weighted_votes_against = swarm_action.weighted_votes_against
                .checked_add(1)
                .ok_or(AgentCollabError::VoteOverflow)?;
            // Also update votes_against counter (votes_for was incremented on submission)
            swarm_action.votes_for = swarm_action.votes_for.saturating_sub(1);
            swarm_action.votes_against = swarm_action.votes_against
                .checked_add(1)
                .ok_or(AgentCollabError::VoteOverflow)?;
        }

        emit!(VoteRevealed {
            action: swarm_action.key(),
            vote_nullifier: vote_record.vote_nullifier,
            vote_value,
            weight: 1, // Fixed weight for ZK-anonymous votes
        });

        Ok(())
    }

    // =========================================================================
    // SWARM VOTE+BID (Private Task Allocation)
    // =========================================================================

    /// Create a swarm action with bidding enabled
    /// Used for private task allocation: agents vote AND bid for execution rights
    pub fn create_swarm_action_bid(
        ctx: Context<CreateSwarmActionBid>,
        action_hash: [u8; 32],
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        nullifier: [u8; 32],
        threshold: u8,
        min_bid: u64,
        vote_deadline_slots: u64,
        reveal_deadline_slots: u64,
    ) -> Result<()> {
        let registry = &ctx.accounts.registry;
        require!(!registry.paused, AgentCollabError::ProtocolPaused);
        require!(threshold > 0 && threshold <= 100, AgentCollabError::InvalidThreshold);
        require!(reveal_deadline_slots > vote_deadline_slots, AgentCollabError::InvalidDeadline);

        // Verify ZK proof of agent identity (proposer must be valid agent)
        let mut public_inputs: [[u8; 32]; 3] = [[0u8; 32]; 3];
        public_inputs[0] = registry.agents_root;
        public_inputs[1] = nullifier;
        public_inputs[2][24..32].copy_from_slice(&registry.epoch.to_be_bytes());

        verify_agent_identity_proof(
            &proof_a,
            &proof_b,
            &proof_c,
            &public_inputs,
        )?;

        let current_slot = Clock::get()?.slot;
        let swarm_action = &mut ctx.accounts.swarm_action_bid;
        swarm_action.registry = registry.key();
        swarm_action.proposer_nullifier = nullifier;
        swarm_action.action_hash = action_hash;
        swarm_action.threshold = threshold;
        swarm_action.min_bid = min_bid;
        swarm_action.vote_count = 0;
        swarm_action.revealed_count = 0;
        swarm_action.yes_votes = 0;
        swarm_action.no_votes = 0;
        swarm_action.created_slot = current_slot;
        swarm_action.vote_deadline_slot = current_slot + vote_deadline_slots;
        swarm_action.reveal_deadline_slot = current_slot + reveal_deadline_slots;
        swarm_action.executed = false;
        swarm_action.highest_yes_bid = 0;
        swarm_action.highest_yes_bidder_nullifier = [0u8; 32];
        swarm_action.bump = ctx.bumps.swarm_action_bid;

        emit!(SwarmActionBidCreated {
            registry: registry.key(),
            action_hash,
            threshold,
            min_bid,
            vote_deadline_slot: swarm_action.vote_deadline_slot,
            reveal_deadline_slot: swarm_action.reveal_deadline_slot,
        });

        Ok(())
    }

    /// Vote on a swarm action with a hidden bid
    /// Uses swarm_vote_bid circuit: proves membership + vote + bid validity
    /// Public inputs: agents_root, action_hash, vote_nullifier, vote_commitment, bid_commitment, min_bid
    pub fn vote_bid_swarm_action(
        ctx: Context<VoteBidSwarmAction>,
        vote_nullifier: [u8; 32],
        vote_commitment: [u8; 32],
        bid_commitment: [u8; 32],
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
    ) -> Result<()> {
        let registry = &ctx.accounts.registry;
        let swarm_action = &mut ctx.accounts.swarm_action_bid;
        let current_slot = Clock::get()?.slot;

        require!(!registry.paused, AgentCollabError::ProtocolPaused);
        require!(!swarm_action.executed, AgentCollabError::ActionAlreadyExecuted);
        require!(current_slot <= swarm_action.vote_deadline_slot, AgentCollabError::VotingEnded);

        // Verify ZK proof using swarm_vote_bid circuit (6 public inputs)
        let mut public_inputs: [[u8; 32]; 6] = [[0u8; 32]; 6];
        public_inputs[0] = registry.agents_root;
        public_inputs[1] = swarm_action.action_hash;
        public_inputs[2] = vote_nullifier;
        public_inputs[3] = vote_commitment;
        public_inputs[4] = bid_commitment;
        public_inputs[5][24..32].copy_from_slice(&swarm_action.min_bid.to_be_bytes());

        verify_swarm_vote_bid_proof(
            &proof_a,
            &proof_b,
            &proof_c,
            &public_inputs,
        )?;

        // Check vote nullifier not already used for this action
        let vote_nullifier_account = &mut ctx.accounts.vote_bid_nullifier;
        require!(
            vote_nullifier_account.action != swarm_action.key(),
            AgentCollabError::AlreadyVoted
        );
        vote_nullifier_account.action = swarm_action.key();
        vote_nullifier_account.nullifier = vote_nullifier;
        vote_nullifier_account.bump = ctx.bumps.vote_bid_nullifier;

        // Store vote+bid record for reveal phase
        let vote_bid_record = &mut ctx.accounts.vote_bid_record;
        vote_bid_record.swarm_action = swarm_action.key();
        vote_bid_record.vote_nullifier = vote_nullifier;
        vote_bid_record.vote_commitment = vote_commitment;
        vote_bid_record.bid_commitment = bid_commitment;
        vote_bid_record.revealed = false;
        vote_bid_record.vote_value = 0; // 0=unrevealed, 1=yes, 2=no
        vote_bid_record.bid_amount = 0;
        vote_bid_record.bump = ctx.bumps.vote_bid_record;

        // Increment vote count
        swarm_action.vote_count = swarm_action.vote_count
            .checked_add(1)
            .ok_or(AgentCollabError::VoteOverflow)?;

        emit!(SwarmVoteBidCast {
            action: swarm_action.key(),
            nullifier: vote_nullifier,
            vote_count: swarm_action.vote_count,
        });

        Ok(())
    }

    /// Reveal vote and bid after vote deadline
    /// Verifies both vote and bid commitments match revealed values
    pub fn reveal_vote_bid(
        ctx: Context<RevealVoteBid>,
        vote_value: bool,
        vote_salt: [u8; 32],
        bid_amount: u64,
        bid_salt: [u8; 32],
    ) -> Result<()> {
        let vote_bid_record = &mut ctx.accounts.vote_bid_record;
        let swarm_action = &mut ctx.accounts.swarm_action_bid;
        let current_slot = Clock::get()?.slot;

        require!(!vote_bid_record.revealed, AgentCollabError::VoteAlreadyRevealed);
        require!(!swarm_action.executed, AgentCollabError::ActionAlreadyExecuted);
        require!(current_slot > swarm_action.vote_deadline_slot, AgentCollabError::RevealTooEarly);
        require!(current_slot <= swarm_action.reveal_deadline_slot, AgentCollabError::RevealTooLate);

        // Verify vote commitment
        let computed_vote_commitment = compute_vote_commitment(
            vote_value,
            &vote_salt,
            &swarm_action.action_hash,
        );
        require!(
            computed_vote_commitment == vote_bid_record.vote_commitment,
            AgentCollabError::CommitmentMismatch
        );

        // Verify bid commitment
        let computed_bid_commitment = compute_bid_commitment(
            bid_amount,
            &bid_salt,
            &swarm_action.action_hash,
        );
        require!(
            computed_bid_commitment == vote_bid_record.bid_commitment,
            AgentCollabError::CommitmentMismatch
        );

        // Verify bid meets minimum
        require!(bid_amount >= swarm_action.min_bid, AgentCollabError::BidTooLow);

        // Mark as revealed and store values
        vote_bid_record.revealed = true;
        vote_bid_record.vote_value = if vote_value { 1 } else { 2 };
        vote_bid_record.bid_amount = bid_amount;

        // Update tallies
        swarm_action.revealed_count = swarm_action.revealed_count
            .checked_add(1)
            .ok_or(AgentCollabError::VoteOverflow)?;

        if vote_value {
            swarm_action.yes_votes = swarm_action.yes_votes
                .checked_add(1)
                .ok_or(AgentCollabError::VoteOverflow)?;

            // Track highest YES bidder
            if bid_amount > swarm_action.highest_yes_bid {
                swarm_action.highest_yes_bid = bid_amount;
                swarm_action.highest_yes_bidder_nullifier = vote_bid_record.vote_nullifier;
            }
        } else {
            swarm_action.no_votes = swarm_action.no_votes
                .checked_add(1)
                .ok_or(AgentCollabError::VoteOverflow)?;
        }

        emit!(VoteBidRevealed {
            action: swarm_action.key(),
            vote_nullifier: vote_bid_record.vote_nullifier,
            vote_value,
            bid_amount,
            is_highest_yes: vote_value && bid_amount == swarm_action.highest_yes_bid,
        });

        Ok(())
    }

    /// Execute a swarm action bid, determining the winning bidder
    /// Winner = highest bid among YES voters
    pub fn execute_swarm_action_bid(ctx: Context<ExecuteSwarmActionBid>) -> Result<()> {
        let swarm_action = &mut ctx.accounts.swarm_action_bid;
        let current_slot = Clock::get()?.slot;

        require!(!swarm_action.executed, AgentCollabError::ActionAlreadyExecuted);
        require!(current_slot > swarm_action.reveal_deadline_slot, AgentCollabError::VotingNotEnded);

        let total_votes = (swarm_action.yes_votes as u64)
            .checked_add(swarm_action.no_votes as u64)
            .ok_or(AgentCollabError::VoteOverflow)?;
        require!(total_votes > 0, AgentCollabError::NoVotes);

        // Check threshold met with checked arithmetic
        let yes_scaled = (swarm_action.yes_votes as u64)
            .checked_mul(100)
            .ok_or(AgentCollabError::VoteOverflow)?;
        let approval_pct = yes_scaled / total_votes;
        require!(
            approval_pct >= swarm_action.threshold as u64,
            AgentCollabError::ThresholdNotMet
        );

        // Must have at least one YES bidder
        require!(swarm_action.highest_yes_bid > 0, AgentCollabError::NoWinningBid);

        swarm_action.executed = true;

        emit!(SwarmActionBidExecuted {
            action: swarm_action.key(),
            action_hash: swarm_action.action_hash,
            yes_votes: swarm_action.yes_votes,
            no_votes: swarm_action.no_votes,
            winning_nullifier: swarm_action.highest_yes_bidder_nullifier,
            winning_bid: swarm_action.highest_yes_bid,
        });

        Ok(())
    }

    /// Reveal a signal's content after submission
    ///
    /// Verifies the revealed data matches the original commitment using on-chain Poseidon hash.
    /// The commitment = Poseidon(signal_type, direction, confidence, magnitude, stake_amount, secret, nullifier)
    pub fn reveal_signal(
        ctx: Context<RevealSignal>,
        signal_type: u8,
        direction: u8,
        confidence: u8,
        magnitude: u8,
        stake_amount: u64,
        reveal_secret: [u8; 32],
    ) -> Result<()> {
        let signal = &mut ctx.accounts.signal;
        let aggregator = &mut ctx.accounts.aggregator;
        let current_slot = Clock::get()?.slot;

        require!(!signal.revealed, AgentCollabError::SignalAlreadyRevealed);
        require!(
            current_slot > signal.submitted_slot + SIGNAL_EXPIRY_SLOTS,
            AgentCollabError::RevealTooEarly
        );

        // Validate input ranges
        require!(signal_type <= 3, AgentCollabError::InvalidReveal);
        require!(direction <= 2, AgentCollabError::InvalidReveal);
        require!(confidence <= 100, AgentCollabError::InvalidReveal);
        require!(magnitude <= 100, AgentCollabError::InvalidReveal);

        // Verify commitment using Poseidon hash (matches circuit)
        let computed_commitment = compute_signal_commitment(
            signal_type,
            direction,
            confidence,
            magnitude,
            stake_amount,
            &reveal_secret,
            &signal.nullifier,
        );

        require!(
            computed_commitment == signal.commitment,
            AgentCollabError::CommitmentMismatch
        );

        // Mark as revealed
        signal.revealed = true;

        // Update aggregator with the revealed signal (overflow-safe)
        aggregator.total_signals = aggregator.total_signals
            .checked_add(1)
            .ok_or(AgentCollabError::AggregatorOverflow)?;
        match direction {
            0 => aggregator.short_count = aggregator.short_count
                .checked_add(1)
                .ok_or(AgentCollabError::AggregatorOverflow)?,
            1 => aggregator.long_count = aggregator.long_count
                .checked_add(1)
                .ok_or(AgentCollabError::AggregatorOverflow)?,
            _ => aggregator.neutral_count = aggregator.neutral_count
                .checked_add(1)
                .ok_or(AgentCollabError::AggregatorOverflow)?,
        }
        aggregator.total_confidence = aggregator.total_confidence
            .checked_add(confidence as u32)
            .ok_or(AgentCollabError::AggregatorOverflow)?;
        aggregator.total_magnitude = aggregator.total_magnitude
            .checked_add(magnitude as u32)
            .ok_or(AgentCollabError::AggregatorOverflow)?;
        aggregator.last_updated_slot = current_slot;

        emit!(SignalRevealed {
            signal: signal.key(),
            signal_type,
            direction,
            confidence,
            magnitude,
        });

        Ok(())
    }

    /// Initialize signal aggregator for an epoch
    pub fn init_aggregator(ctx: Context<InitAggregator>, epoch: u64) -> Result<()> {
        let aggregator = &mut ctx.accounts.aggregator;
        aggregator.registry = ctx.accounts.registry.key();
        aggregator.epoch = epoch;
        aggregator.total_signals = 0;
        aggregator.long_count = 0;
        aggregator.short_count = 0;
        aggregator.neutral_count = 0;
        aggregator.total_confidence = 0;
        aggregator.total_magnitude = 0;
        aggregator.last_updated_slot = Clock::get()?.slot;
        aggregator.bump = ctx.bumps.aggregator;

        emit!(AggregatorInitialized {
            registry: aggregator.registry,
            epoch,
        });

        Ok(())
    }

    /// Request stake withdrawal (starts timelock)
    pub fn request_withdrawal(ctx: Context<RequestWithdrawal>) -> Result<()> {
        let agent = &ctx.accounts.agent;
        let withdrawal = &mut ctx.accounts.withdrawal;
        let current_slot = Clock::get()?.slot;

        require!(agent.active, AgentCollabError::AgentNotActive);
        require!(
            ctx.accounts.payer.key() == agent.owner,
            AgentCollabError::NotAgentOwner
        );

        withdrawal.agent = agent.key();
        withdrawal.requester = ctx.accounts.payer.key();
        withdrawal.amount = agent.stake;
        withdrawal.request_slot = current_slot;
        withdrawal.unlock_slot = current_slot + STAKE_WITHDRAWAL_TIMELOCK;
        withdrawal.claimed = false;
        withdrawal.bump = ctx.bumps.withdrawal;

        emit!(WithdrawalRequested {
            agent: agent.key(),
            amount: withdrawal.amount,
            unlock_slot: withdrawal.unlock_slot,
        });

        Ok(())
    }

    /// Claim withdrawn stake after timelock
    pub fn claim_withdrawal(ctx: Context<ClaimWithdrawal>) -> Result<()> {
        let withdrawal = &mut ctx.accounts.withdrawal;
        let agent = &mut ctx.accounts.agent;
        let registry = &mut ctx.accounts.registry;
        let current_slot = Clock::get()?.slot;

        require!(!withdrawal.claimed, AgentCollabError::WithdrawalAlreadyClaimed);
        require!(current_slot >= withdrawal.unlock_slot, AgentCollabError::TimelockNotExpired);
        require!(
            ctx.accounts.authority.key() == withdrawal.requester,
            AgentCollabError::UnauthorizedWithdrawal
        );

        withdrawal.claimed = true;
        agent.active = false;
        agent.stake = 0;

        // Transfer stake to recipient
        let stake_amount = withdrawal.amount;
        **ctx.accounts.stake_vault.to_account_info().try_borrow_mut_lamports()? -= stake_amount;
        **ctx.accounts.recipient.to_account_info().try_borrow_mut_lamports()? += stake_amount;

        // Reduce total stake
        registry.total_stake = registry.total_stake.saturating_sub(stake_amount);

        emit!(WithdrawalClaimed {
            agent: agent.key(),
            amount: stake_amount,
        });

        Ok(())
    }

    /// Cancel pending withdrawal
    pub fn cancel_withdrawal(ctx: Context<CancelWithdrawal>) -> Result<()> {
        let withdrawal = &mut ctx.accounts.withdrawal;

        require!(!withdrawal.claimed, AgentCollabError::WithdrawalAlreadyClaimed);
        require!(
            ctx.accounts.payer.key() == withdrawal.requester,
            AgentCollabError::UnauthorizedWithdrawal
        );

        emit!(WithdrawalCancelled {
            agent: withdrawal.agent,
        });

        Ok(())
    }

    /// Link a ZK identity to a public kamiyo Agent PDA
    /// Caller must own both the ZK agent (via identity secrets) and the kamiyo Agent
    /// Optionally verifies stake position from kamiyo-staking program
    pub fn link_identity(ctx: Context<LinkIdentity>) -> Result<()> {
        let zk_agent = &ctx.accounts.zk_agent;
        require!(zk_agent.active, AgentCollabError::AgentNotActive);

        // Read stake position if provided
        let (staked_amount, stake_multiplier) = if let Some(stake_position) = &ctx.accounts.stake_position {
            // Verify stake position is from staking program
            require!(
                stake_position.owner == &STAKING_PROGRAM_ID,
                AgentCollabError::InvalidStakePosition
            );

            // Parse StakePosition data: 8 (discriminator) + 32 (owner) + 8 (staked_amount) + 8 (stake_start_time)
            let data = stake_position.try_borrow_data()?;
            if data.len() >= 56 {
                let owner_bytes: [u8; 32] = data[8..40].try_into().unwrap();
                let stake_owner = Pubkey::new_from_array(owner_bytes);

                // Verify stake position belongs to the signer
                require!(
                    stake_owner == ctx.accounts.owner.key(),
                    AgentCollabError::StakeOwnerMismatch
                );

                let staked = u64::from_le_bytes(data[40..48].try_into().unwrap());
                let stake_start = i64::from_le_bytes(data[48..56].try_into().unwrap());

                // Calculate multiplier based on duration
                let current_time = Clock::get()?.unix_timestamp;
                let duration = current_time.saturating_sub(stake_start);
                let multiplier = calculate_stake_multiplier(duration);

                (staked, multiplier)
            } else {
                (0u64, 10000u64) // Default: no stake, 1.0x multiplier
            }
        } else {
            (0u64, 10000u64) // No stake position provided
        };

        let link = &mut ctx.accounts.identity_link;
        link.zk_agent = zk_agent.key();
        link.kamiyo_agent = ctx.accounts.kamiyo_agent.key();
        link.owner = ctx.accounts.owner.key();
        link.staked_amount = staked_amount;
        link.stake_multiplier = stake_multiplier;
        link.linked_slot = Clock::get()?.slot;
        link.active = true;
        link.bump = ctx.bumps.identity_link;

        emit!(IdentityLinked {
            zk_agent: link.zk_agent,
            kamiyo_agent: link.kamiyo_agent,
            owner: link.owner,
        });

        Ok(())
    }

    /// Unlink a ZK identity from a kamiyo Agent
    pub fn unlink_identity(ctx: Context<UnlinkIdentity>) -> Result<()> {
        let link = &mut ctx.accounts.identity_link;
        require!(link.active, AgentCollabError::LinkNotActive);

        link.active = false;

        emit!(IdentityUnlinked {
            zk_agent: link.zk_agent,
            kamiyo_agent: link.kamiyo_agent,
        });

        Ok(())
    }

    /// Refresh stake info on an existing identity link
    /// Call this after staking more tokens to update vote weight
    pub fn refresh_stake(ctx: Context<RefreshStake>) -> Result<()> {
        let link = &mut ctx.accounts.identity_link;
        require!(link.active, AgentCollabError::LinkNotActive);

        // Read updated stake position
        let (staked_amount, stake_multiplier) = if let Some(stake_position) = &ctx.accounts.stake_position {
            require!(
                stake_position.owner == &STAKING_PROGRAM_ID,
                AgentCollabError::InvalidStakePosition
            );

            let data = stake_position.try_borrow_data()?;
            if data.len() >= 56 {
                let owner_bytes: [u8; 32] = data[8..40].try_into().unwrap();
                let stake_owner = Pubkey::new_from_array(owner_bytes);

                require!(
                    stake_owner == ctx.accounts.owner.key(),
                    AgentCollabError::StakeOwnerMismatch
                );

                let staked = u64::from_le_bytes(data[40..48].try_into().unwrap());
                let stake_start = i64::from_le_bytes(data[48..56].try_into().unwrap());

                let current_time = Clock::get()?.unix_timestamp;
                let duration = current_time.saturating_sub(stake_start);
                let multiplier = calculate_stake_multiplier(duration);

                (staked, multiplier)
            } else {
                (0u64, 10000u64)
            }
        } else {
            (0u64, 10000u64)
        };

        link.staked_amount = staked_amount;
        link.stake_multiplier = stake_multiplier;

        emit!(StakeRefreshed {
            identity_link: link.key(),
            staked_amount,
            stake_multiplier,
        });

        Ok(())
    }

    /// Deactivate an agent and reclaim stake (immediate, admin only for emergencies)
    pub fn deactivate_agent(ctx: Context<DeactivateAgent>) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        let registry = &mut ctx.accounts.registry;
        require!(agent.active, AgentCollabError::AgentNotActive);

        agent.active = false;

        // Return stake
        let stake_amount = agent.stake;
        agent.stake = 0;
        **ctx.accounts.stake_vault.to_account_info().try_borrow_mut_lamports()? -= stake_amount;
        **ctx.accounts.recipient.to_account_info().try_borrow_mut_lamports()? += stake_amount;

        // Reduce total stake
        registry.total_stake = registry.total_stake.saturating_sub(stake_amount);

        emit!(AgentDeactivated {
            agent: agent.key(),
            stake_returned: stake_amount,
        });

        Ok(())
    }

    /// Pause the protocol (admin only)
    pub fn pause_protocol(ctx: Context<ManageProtocol>) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        require!(
            ctx.accounts.authority.key() == registry.authority,
            AgentCollabError::Unauthorized
        );
        registry.paused = true;

        emit!(ProtocolPaused {
            registry: registry.key(),
        });

        Ok(())
    }

    /// Unpause the protocol (admin only)
    pub fn unpause_protocol(ctx: Context<ManageProtocol>) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        require!(
            ctx.accounts.authority.key() == registry.authority,
            AgentCollabError::Unauthorized
        );
        registry.paused = false;

        emit!(ProtocolUnpaused {
            registry: registry.key(),
        });

        Ok(())
    }

    /// Update TVL caps (admin only)
    /// Set either cap to 0 for unlimited
    pub fn update_caps(
        ctx: Context<ManageProtocol>,
        new_max_total_stake: u64,
        new_max_stake_per_agent: u64,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        require!(
            ctx.accounts.authority.key() == registry.authority,
            AgentCollabError::Unauthorized
        );

        registry.max_total_stake = new_max_total_stake;
        registry.max_stake_per_agent = new_max_stake_per_agent;

        emit!(CapsUpdated {
            registry: registry.key(),
            max_total_stake: new_max_total_stake,
            max_stake_per_agent: new_max_stake_per_agent,
        });

        Ok(())
    }

    /// Update minimum signal collateral requirement (admin only)
    /// Set to 0 to disable collateral requirement
    pub fn update_min_signal_collateral(
        ctx: Context<ManageProtocol>,
        new_min_signal_collateral: u64,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        require!(
            ctx.accounts.authority.key() == registry.authority,
            AgentCollabError::Unauthorized
        );

        registry.min_signal_collateral = new_min_signal_collateral;

        emit!(MinSignalCollateralUpdated {
            registry: registry.key(),
            min_signal_collateral: new_min_signal_collateral,
        });

        Ok(())
    }

    /// Migrate registry from v1 (127 bytes) to v2 (192 bytes)
    /// Adds KAMIYO token integration fields and creates treasury vault.
    /// Can only be called once (checks kamiyo_mint == default after realloc).
    pub fn migrate_registry(ctx: Context<MigrateRegistry>) -> Result<()> {
        let registry_info = &ctx.accounts.registry;
        let authority = &ctx.accounts.authority;

        // V1 layout (127 bytes total = 8 discriminator + 119 fields):
        // 0-7: discriminator (8 bytes)
        // 8-39: authority (32 bytes)
        // 40-71: agents_root (32 bytes)
        // 72-75: agent_count (4 bytes)
        // 76-79: signal_count (4 bytes)
        // 80-83: swarm_action_count (4 bytes)
        // 84-91: epoch (8 bytes)
        // 92-99: min_stake (8 bytes)
        // 100: min_signal_confidence (1 byte)
        // 101: bump (1 byte)
        // 102: paused (1 byte)
        // 103-110: max_total_stake (8 bytes)
        // 111-118: max_stake_per_agent (8 bytes)
        // 119-126: total_stake (8 bytes)
        // Total: 127 bytes

        const V1_SIZE: usize = 127;
        const V2_SIZE: usize = 8 + 184; // 192 bytes (discriminator + struct)

        // Read authority from raw data (bytes 8-39)
        {
            let data = registry_info.try_borrow_data()?;
            require!(data.len() >= 40, AgentCollabError::InvalidAccountData);

            let mut auth_bytes = [0u8; 32];
            auth_bytes.copy_from_slice(&data[8..40]);
            let stored_authority = Pubkey::new_from_array(auth_bytes);

            require!(
                authority.key() == stored_authority,
                AgentCollabError::Unauthorized
            );
        }

        // Calculate additional rent needed
        let rent = Rent::get()?;
        let old_lamports = registry_info.lamports();
        let new_min_balance = rent.minimum_balance(V2_SIZE);

        if new_min_balance > old_lamports {
            let additional_lamports = new_min_balance - old_lamports;

            // Transfer lamports from authority to registry for realloc
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: authority.to_account_info(),
                        to: registry_info.to_account_info(),
                    },
                ),
                additional_lamports,
            )?;
        }

        // Realloc the account
        registry_info.realloc(V2_SIZE, false)?;

        // Now write the new fields at the end (bytes 127-191)
        // V2 adds:
        // 127-158: kamiyo_mint (32 bytes)
        // 159: treasury_bump (1 byte)
        // 160-167: total_burned (8 bytes)
        // 168-175: total_fees_collected (8 bytes)
        // 176-183: min_signal_collateral (8 bytes)
        // + 8 bytes padding to reach 192
        {
            let mut data = registry_info.try_borrow_mut_data()?;

            // Check if already migrated (kamiyo_mint at bytes 127-158 should be zeros)
            let mut existing_mint = [0u8; 32];
            existing_mint.copy_from_slice(&data[127..159]);
            require!(
                existing_mint == [0u8; 32],
                AgentCollabError::AlreadyMigrated
            );

            // Write kamiyo_mint (32 bytes at offset 127)
            let kamiyo_mint_bytes = ctx.accounts.kamiyo_mint.key().to_bytes();
            data[127..159].copy_from_slice(&kamiyo_mint_bytes);

            // Write treasury_bump (1 byte at offset 159)
            data[159] = ctx.bumps.treasury_vault;

            // Write total_burned (8 bytes at offset 160) = 0
            data[160..168].copy_from_slice(&0u64.to_le_bytes());

            // Write total_fees_collected (8 bytes at offset 168) = 0
            data[168..176].copy_from_slice(&0u64.to_le_bytes());

            // Write min_signal_collateral (8 bytes at offset 176) = 0
            data[176..184].copy_from_slice(&0u64.to_le_bytes());

            // Zero padding for remaining 8 bytes (184-191)
            data[184..192].copy_from_slice(&[0u8; 8]);
        }

        emit!(RegistryMigrated {
            registry: registry_info.key(),
            kamiyo_mint: ctx.accounts.kamiyo_mint.key(),
            treasury_vault: ctx.accounts.treasury_vault.key(),
        });

        Ok(())
    }

    /// Deposit KAMIYO tokens as collateral for an agent
    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, AgentCollabError::InvalidAmount);

        let agent = &mut ctx.accounts.agent;
        require!(agent.active, AgentCollabError::AgentNotActive);

        // Transfer KAMIYO tokens from depositor to collateral vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.depositor_token_account.to_account_info(),
                    to: ctx.accounts.collateral_vault.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            amount,
        )?;

        // Update agent collateral
        agent.collateral_amount = agent.collateral_amount
            .checked_add(amount)
            .ok_or(AgentCollabError::StakeOverflow)?;
        agent.collateral_locked_at = Clock::get()?.unix_timestamp;

        emit!(CollateralDeposited {
            agent: agent.key(),
            amount,
            total_collateral: agent.collateral_amount,
        });

        Ok(())
    }

    /// Request collateral withdrawal (starts timelock)
    pub fn request_collateral_withdrawal(
        ctx: Context<RequestCollateralWithdrawal>,
        amount: u64,
    ) -> Result<()> {
        let agent = &ctx.accounts.agent;
        require!(agent.active, AgentCollabError::AgentNotActive);
        require!(
            ctx.accounts.requester.key() == agent.owner,
            AgentCollabError::NotAgentOwner
        );
        require!(
            amount <= agent.collateral_amount,
            AgentCollabError::ExceedsCollateral
        );

        let clock = Clock::get()?;
        let withdrawal = &mut ctx.accounts.collateral_withdrawal;
        withdrawal.agent = agent.key();
        withdrawal.requester = ctx.accounts.requester.key();
        withdrawal.amount = amount;
        withdrawal.request_time = clock.unix_timestamp;
        withdrawal.unlock_time = clock.unix_timestamp + COLLATERAL_WITHDRAWAL_TIMELOCK;
        withdrawal.claimed = false;
        withdrawal.bump = ctx.bumps.collateral_withdrawal;

        emit!(CollateralWithdrawalRequested {
            agent: agent.key(),
            amount,
            unlock_time: withdrawal.unlock_time,
        });

        Ok(())
    }

    /// Claim collateral after timelock expires
    pub fn claim_collateral_withdrawal(ctx: Context<ClaimCollateralWithdrawal>) -> Result<()> {
        let withdrawal = &mut ctx.accounts.collateral_withdrawal;
        let agent = &mut ctx.accounts.agent;
        let clock = Clock::get()?;

        require!(!withdrawal.claimed, AgentCollabError::CollateralAlreadyClaimed);
        require!(
            clock.unix_timestamp >= withdrawal.unlock_time,
            AgentCollabError::CollateralTimelockActive
        );
        require!(
            ctx.accounts.claimer.key() == withdrawal.requester,
            AgentCollabError::UnauthorizedWithdrawal
        );

        // Verify agent still has enough collateral
        require!(
            agent.collateral_amount >= withdrawal.amount,
            AgentCollabError::ExceedsCollateral
        );

        withdrawal.claimed = true;
        agent.collateral_amount = agent.collateral_amount
            .saturating_sub(withdrawal.amount);

        // Transfer tokens from vault to claimer
        let agent_key = agent.key();
        let seeds = &[
            b"collateral_vault",
            agent_key.as_ref(),
            &[ctx.bumps.collateral_vault],
        ];
        let signer_seeds = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.collateral_vault.to_account_info(),
                    to: ctx.accounts.claimer_token_account.to_account_info(),
                    authority: ctx.accounts.collateral_vault.to_account_info(),
                },
                signer_seeds,
            ),
            withdrawal.amount,
        )?;

        emit!(CollateralWithdrawalClaimed {
            agent: agent.key(),
            amount: withdrawal.amount,
        });

        Ok(())
    }

    /// Slash an agent's collateral (authority only)
    pub fn slash_agent(
        ctx: Context<SlashAgent>,
        slash_amount: u64,
        reason: String,
    ) -> Result<()> {
        let registry = &ctx.accounts.registry;
        require!(
            ctx.accounts.authority.key() == registry.authority,
            AgentCollabError::Unauthorized
        );

        let agent = &mut ctx.accounts.agent;
        require!(agent.active, AgentCollabError::AgentNotActive);
        require!(
            slash_amount <= agent.collateral_amount,
            AgentCollabError::ExceedsCollateral
        );

        // Calculate actual slash with escalation
        let escalation = (agent.violation_count as u64) * SLASH_ESCALATION_BPS;
        let effective_rate = BASE_SLASH_RATE_BPS + escalation;
        let capped_rate = if effective_rate > MAX_SLASH_RATE_BPS {
            MAX_SLASH_RATE_BPS
        } else {
            effective_rate
        };

        // If slash_amount is 0, calculate based on rate
        let actual_slash = if slash_amount == 0 {
            (agent.collateral_amount * capped_rate) / 10_000
        } else {
            slash_amount
        };

        // Update agent state
        agent.collateral_amount = agent.collateral_amount.saturating_sub(actual_slash);
        agent.slashed_amount = agent.slashed_amount
            .checked_add(actual_slash)
            .ok_or(AgentCollabError::StakeOverflow)?;
        agent.violation_count = agent.violation_count.saturating_add(1);

        // Transfer slashed tokens to treasury
        let agent_key = agent.key();
        let seeds = &[
            b"collateral_vault",
            agent_key.as_ref(),
            &[ctx.bumps.collateral_vault],
        ];
        let signer_seeds = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.collateral_vault.to_account_info(),
                    to: ctx.accounts.slash_treasury.to_account_info(),
                    authority: ctx.accounts.collateral_vault.to_account_info(),
                },
                signer_seeds,
            ),
            actual_slash,
        )?;

        emit!(AgentSlashed {
            agent: agent.key(),
            amount: actual_slash,
            reason,
            violation_count: agent.violation_count,
        });

        Ok(())
    }

    /// Burn tokens from treasury (authority only)
    /// Used by API to burn tokens corresponding to off-chain fee revenue
    pub fn burn_from_treasury(
        ctx: Context<BurnFromTreasury>,
        amount: u64,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;

        require!(amount > 0, AgentCollabError::InvalidAmount);

        // Verify treasury has sufficient balance
        require!(
            ctx.accounts.treasury_vault.amount >= amount,
            AgentCollabError::InsufficientTreasuryBalance
        );

        // Build signer seeds for treasury PDA
        let registry_key = registry.key();
        let seeds = &[
            b"treasury",
            registry_key.as_ref(),
            &[registry.treasury_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        // Burn tokens from treasury
        token::burn(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.kamiyo_mint.to_account_info(),
                    from: ctx.accounts.treasury_vault.to_account_info(),
                    authority: ctx.accounts.treasury_vault.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        // Update total burned
        registry.total_burned = registry.total_burned
            .checked_add(amount)
            .ok_or(AgentCollabError::StakeOverflow)?;

        emit!(TreasuryBurned {
            registry: registry.key(),
            amount,
            total_burned: registry.total_burned,
        });

        Ok(())
    }
}

// ============================================================================
// Account Structures
// ============================================================================

#[account]
pub struct AgentRegistry {
    pub authority: Pubkey,
    pub agents_root: [u8; 32],
    pub agent_count: u32,
    pub signal_count: u32,
    pub swarm_action_count: u32,
    pub epoch: u64,
    pub min_stake: u64,
    pub min_signal_confidence: u8,
    pub bump: u8,
    pub paused: bool,
    /// Maximum total stake across all agents (TVL cap)
    pub max_total_stake: u64,
    /// Maximum stake per individual agent
    pub max_stake_per_agent: u64,
    /// Current total stake in the registry
    pub total_stake: u64,
    /// $KAMIYO token mint (for fee payments)
    pub kamiyo_mint: Pubkey,
    /// Treasury token account bump (for PDA signing)
    pub treasury_bump: u8,
    /// Total KAMIYO tokens burned by this registry
    pub total_burned: u64,
    /// Total KAMIYO fees collected by treasury
    pub total_fees_collected: u64,
    /// Minimum KAMIYO collateral required for signal submission (0 = no requirement)
    pub min_signal_collateral: u64,
}

#[account]
pub struct Agent {
    pub registry: Pubkey,
    pub identity_commitment: [u8; 32],
    pub stake: u64,
    pub registered_slot: u64,
    pub signal_count: u32,
    pub swarm_votes: u32,
    pub active: bool,
    pub bump: u8,
    /// KAMIYO tokens deposited as collateral
    pub collateral_amount: u64,
    /// Unix timestamp when collateral was locked
    pub collateral_locked_at: i64,
    /// Total KAMIYO slashed from this agent
    pub slashed_amount: u64,
    /// Number of violations (for escalating penalties)
    pub violation_count: u8,
    /// Owner who registered this agent (for withdrawal authorization)
    pub owner: Pubkey,
}

#[account]
pub struct Signal {
    pub registry: Pubkey,
    pub nullifier: [u8; 32],
    pub commitment: [u8; 32],
    pub submitted_slot: u64,
    pub revealed: bool,
    pub bump: u8,
}

#[account]
pub struct SwarmAction {
    pub registry: Pubkey,
    pub proposer_nullifier: [u8; 32],
    pub action_hash: [u8; 32],
    pub threshold: u8,
    pub votes_for: u32,
    pub votes_against: u32,
    pub weighted_votes_for: u64,
    pub weighted_votes_against: u64,
    pub created_slot: u64,
    pub deadline_slot: u64,
    pub executed: bool,
    pub bump: u8,
}

#[account]
pub struct NullifierRecord {
    pub epoch: u64,
    pub nullifier: [u8; 32],
    pub bump: u8,
}

#[account]
pub struct VoteNullifier {
    pub action: Pubkey,
    pub nullifier: [u8; 32],
    pub bump: u8,
}

/// Record of a ZK vote submission (vote value hidden until reveal)
#[account]
pub struct VoteRecord {
    pub swarm_action: Pubkey,
    pub vote_nullifier: [u8; 32],
    pub vote_commitment: [u8; 32],
    pub revealed: bool,
    pub vote_value: u8, // 0 = not revealed, 1 = yes, 2 = no
    pub bump: u8,
}

// ============================================================================
// Swarm Vote+Bid Accounts (Private Task Allocation)
// ============================================================================

/// Swarm action with bidding for task allocation
/// Agents vote AND bid for execution rights. Winner = highest YES bidder.
#[account]
pub struct SwarmActionBid {
    pub registry: Pubkey,
    pub proposer_nullifier: [u8; 32],
    pub action_hash: [u8; 32],
    pub threshold: u8,               // Approval threshold (0-100)
    pub min_bid: u64,                // Minimum bid amount
    pub vote_count: u32,             // Total votes submitted
    pub revealed_count: u32,         // Votes revealed
    pub yes_votes: u32,              // YES votes (after reveal)
    pub no_votes: u32,               // NO votes (after reveal)
    pub created_slot: u64,
    pub vote_deadline_slot: u64,     // Deadline for submitting votes
    pub reveal_deadline_slot: u64,   // Deadline for revealing votes
    pub executed: bool,
    pub highest_yes_bid: u64,        // Highest bid among YES voters
    pub highest_yes_bidder_nullifier: [u8; 32], // Nullifier of highest YES bidder
    pub bump: u8,
}
// Size: 8 + 32 + 32 + 32 + 1 + 8 + 4 + 4 + 4 + 4 + 8 + 8 + 8 + 1 + 8 + 32 + 1 = 195

/// Vote+bid record for reveal phase
#[account]
pub struct VoteBidRecord {
    pub swarm_action: Pubkey,
    pub vote_nullifier: [u8; 32],
    pub vote_commitment: [u8; 32],
    pub bid_commitment: [u8; 32],
    pub revealed: bool,
    pub vote_value: u8, // 0 = unrevealed, 1 = yes, 2 = no
    pub bid_amount: u64,
    pub bump: u8,
}
// Size: 8 + 32 + 32 + 32 + 32 + 1 + 1 + 8 + 1 = 147

/// Nullifier for vote+bid (prevents double voting)
#[account]
pub struct VoteBidNullifier {
    pub action: Pubkey,
    pub nullifier: [u8; 32],
    pub bump: u8,
}
// Size: 8 + 32 + 32 + 1 = 73

#[account]
pub struct SignalAggregator {
    pub registry: Pubkey,
    pub epoch: u64,
    pub total_signals: u32,
    pub long_count: u32,
    pub short_count: u32,
    pub neutral_count: u32,
    pub total_confidence: u32,
    pub total_magnitude: u32,
    pub last_updated_slot: u64,
    pub bump: u8,
}

#[account]
pub struct WithdrawalRequest {
    pub agent: Pubkey,
    pub requester: Pubkey,
    pub amount: u64,
    pub request_slot: u64,
    pub unlock_slot: u64,
    pub claimed: bool,
    pub bump: u8,
}

/// Links a ZK identity commitment to a public kamiyo Agent PDA
/// Enables cross-program verification of agent ownership
#[account]
pub struct IdentityLink {
    /// The ZK agent account in this program
    pub zk_agent: Pubkey,
    /// The public Agent PDA from main kamiyo program
    pub kamiyo_agent: Pubkey,
    /// Owner who created the link (must own both)
    pub owner: Pubkey,
    /// Staked amount verified at link time (from staking program)
    pub staked_amount: u64,
    /// Stake multiplier in basis points (10000 = 1.0x)
    pub stake_multiplier: u64,
    /// When the link was created
    pub linked_slot: u64,
    /// Whether the link is active
    pub active: bool,
    /// Bump seed
    pub bump: u8,
}

/// Request for collateral withdrawal with timelock
#[account]
pub struct CollateralWithdrawal {
    /// Agent this withdrawal is for
    pub agent: Pubkey,
    /// Who requested the withdrawal
    pub requester: Pubkey,
    /// Amount to withdraw (KAMIYO tokens)
    pub amount: u64,
    /// Unix timestamp of request
    pub request_time: i64,
    /// Unix timestamp when withdrawal can be claimed
    pub unlock_time: i64,
    /// Whether already claimed
    pub claimed: bool,
    /// Bump seed
    pub bump: u8,
}

// ============================================================================
// Instruction Contexts
// ============================================================================

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    /// Space: 8 discriminator + 32 authority + 32 agents_root + 4 agent_count + 4 signal_count
    ///        + 4 swarm_action_count + 8 epoch + 8 min_stake + 1 min_signal_confidence + 1 bump
    ///        + 1 paused + 8 max_total_stake + 8 max_stake_per_agent + 8 total_stake
    ///        + 32 kamiyo_mint + 1 treasury_bump + 8 total_burned + 8 total_fees_collected
    ///        + 8 min_signal_collateral = 184
    #[account(
        init,
        payer = authority,
        space = 184,
        seeds = [b"registry"],
        bump
    )]
    pub registry: Account<'info, AgentRegistry>,
    /// $KAMIYO token mint
    pub kamiyo_mint: Account<'info, Mint>,
    /// Treasury token account (PDA-owned, receives 99% of fees)
    #[account(
        init,
        payer = authority,
        token::mint = kamiyo_mint,
        token::authority = treasury_vault,
        seeds = [b"treasury", registry.key().as_ref()],
        bump
    )]
    pub treasury_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(identity_commitment: [u8; 32])]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub registry: Account<'info, AgentRegistry>,
    /// Space: 8 discriminator + 32 registry + 32 identity_commitment + 8 stake + 8 registered_slot
    ///        + 4 signal_count + 4 swarm_votes + 1 active + 1 bump
    ///        + 8 collateral_amount + 8 collateral_locked_at + 8 slashed_amount + 1 violation_count
    ///        + 32 owner = 155
    #[account(
        init,
        payer = payer,
        space = 155,
        seeds = [b"agent", identity_commitment.as_ref()],
        bump
    )]
    pub agent: Account<'info, Agent>,
    /// Stake vault PDA - holds staked SOL from all agents
    /// This is a system-owned account that receives lamports
    #[account(
        mut,
        seeds = [b"stake_vault", registry.key().as_ref()],
        bump
    )]
    /// CHECK: PDA used as lamport sink for stake deposits
    pub stake_vault: AccountInfo<'info>,
    /// $KAMIYO token mint for fee payment
    #[account(
        mut,
        constraint = kamiyo_mint.key() == registry.kamiyo_mint @ AgentCollabError::InvalidKamiyoMint
    )]
    pub kamiyo_mint: Account<'info, Mint>,
    /// Payer's KAMIYO token account (pays fee)
    #[account(
        mut,
        constraint = payer_token_account.mint == registry.kamiyo_mint,
        constraint = payer_token_account.owner == payer.key()
    )]
    pub payer_token_account: Account<'info, TokenAccount>,
    /// Treasury token account (receives 99% of fee)
    #[account(
        mut,
        seeds = [b"treasury", registry.key().as_ref()],
        bump = registry.treasury_bump
    )]
    pub treasury_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateAgentsRoot<'info> {
    #[account(mut)]
    pub registry: Account<'info, AgentRegistry>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(nullifier: [u8; 32], signal_commitment: [u8; 32])]
pub struct SubmitSignal<'info> {
    #[account(mut)]
    pub registry: Account<'info, AgentRegistry>,
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 32 + 8 + 1 + 1,
        seeds = [b"signal", signal_commitment.as_ref()],
        bump
    )]
    pub signal: Account<'info, Signal>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + 8 + 32 + 1,
        seeds = [b"nullifier", nullifier.as_ref()],
        bump
    )]
    pub nullifier_record: Account<'info, NullifierRecord>,
    /// $KAMIYO token mint for fee payment (Token-2022)
    #[account(
        mut,
        constraint = kamiyo_mint.key() == registry.kamiyo_mint @ AgentCollabError::InvalidKamiyoMint
    )]
    pub kamiyo_mint: InterfaceAccount<'info, MintInterface>,
    /// Payer's KAMIYO token account (pays fee)
    #[account(
        mut,
        constraint = payer_token_account.mint == registry.kamiyo_mint,
        constraint = payer_token_account.owner == payer.key()
    )]
    pub payer_token_account: InterfaceAccount<'info, TokenAccountInterface>,
    /// Treasury token account (receives 99% of fee)
    #[account(
        mut,
        seeds = [b"treasury", registry.key().as_ref()],
        bump = registry.treasury_bump
    )]
    pub treasury_vault: InterfaceAccount<'info, TokenAccountInterface>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(action_hash: [u8; 32])]
pub struct CreateSwarmAction<'info> {
    #[account(mut)]
    pub registry: Account<'info, AgentRegistry>,
    /// Space: 8 + 32 + 32 + 32 + 1 + 4 + 4 + 8 + 8 + 8 + 8 + 1 + 1 = 147
    #[account(
        init,
        payer = payer,
        space = 147,
        seeds = [b"swarm_action", action_hash.as_ref()],
        bump
    )]
    pub swarm_action: Account<'info, SwarmAction>,
    /// $KAMIYO token mint for fee payment (Token-2022)
    #[account(
        mut,
        constraint = kamiyo_mint.key() == registry.kamiyo_mint @ AgentCollabError::InvalidKamiyoMint
    )]
    pub kamiyo_mint: InterfaceAccount<'info, MintInterface>,
    /// Payer's KAMIYO token account (pays fee)
    #[account(
        mut,
        constraint = payer_token_account.mint == registry.kamiyo_mint,
        constraint = payer_token_account.owner == payer.key()
    )]
    pub payer_token_account: InterfaceAccount<'info, TokenAccountInterface>,
    /// Treasury token account (receives 99% of fee)
    #[account(
        mut,
        seeds = [b"treasury", registry.key().as_ref()],
        bump = registry.treasury_bump
    )]
    pub treasury_vault: InterfaceAccount<'info, TokenAccountInterface>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(vote_nullifier_bytes: [u8; 32], vote_commitment: [u8; 32])]
pub struct VoteSwarmAction<'info> {
    pub registry: Account<'info, AgentRegistry>,
    #[account(mut)]
    pub swarm_action: Account<'info, SwarmAction>,
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 1,
        seeds = [b"vote", swarm_action.key().as_ref(), vote_nullifier_bytes.as_ref()],
        bump
    )]
    pub vote_nullifier: Account<'info, VoteNullifier>,
    /// Vote record storing the commitment (for reveal phase)
    /// Space: 8 + 32 + 32 + 32 + 1 + 1 + 1 = 107
    #[account(
        init,
        payer = payer,
        space = 107,
        seeds = [b"vote_record", swarm_action.key().as_ref(), vote_nullifier_bytes.as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteSwarmAction<'info> {
    #[account(mut)]
    pub swarm_action: Account<'info, SwarmAction>,
}

// ============================================================================
// Swarm Vote+Bid Contexts
// ============================================================================

#[derive(Accounts)]
#[instruction(action_hash: [u8; 32])]
pub struct CreateSwarmActionBid<'info> {
    pub registry: Account<'info, AgentRegistry>,
    /// Space: 8 + 32 + 32 + 32 + 1 + 8 + 4 + 4 + 4 + 4 + 8 + 8 + 8 + 1 + 8 + 32 + 1 = 195
    #[account(
        init,
        payer = payer,
        space = 195,
        seeds = [b"swarm_action_bid", registry.key().as_ref(), action_hash.as_ref()],
        bump
    )]
    pub swarm_action_bid: Account<'info, SwarmActionBid>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(vote_nullifier_bytes: [u8; 32])]
pub struct VoteBidSwarmAction<'info> {
    pub registry: Account<'info, AgentRegistry>,
    #[account(mut)]
    pub swarm_action_bid: Account<'info, SwarmActionBid>,
    /// Nullifier to prevent double voting
    /// Space: 8 + 32 + 32 + 1 = 73
    #[account(
        init,
        payer = payer,
        space = 73,
        seeds = [b"vote_bid", swarm_action_bid.key().as_ref(), vote_nullifier_bytes.as_ref()],
        bump
    )]
    pub vote_bid_nullifier: Account<'info, VoteBidNullifier>,
    /// Vote+bid record for reveal phase
    /// Space: 8 + 32 + 32 + 32 + 32 + 1 + 1 + 8 + 1 = 147
    #[account(
        init,
        payer = payer,
        space = 147,
        seeds = [b"vote_bid_record", swarm_action_bid.key().as_ref(), vote_nullifier_bytes.as_ref()],
        bump
    )]
    pub vote_bid_record: Account<'info, VoteBidRecord>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealVoteBid<'info> {
    #[account(
        mut,
        constraint = vote_bid_record.swarm_action == swarm_action_bid.key()
    )]
    pub vote_bid_record: Account<'info, VoteBidRecord>,
    #[account(mut)]
    pub swarm_action_bid: Account<'info, SwarmActionBid>,
}

#[derive(Accounts)]
pub struct ExecuteSwarmActionBid<'info> {
    #[account(mut)]
    pub swarm_action_bid: Account<'info, SwarmActionBid>,
}

#[derive(Accounts)]
pub struct RevealSignal<'info> {
    pub registry: Account<'info, AgentRegistry>,
    #[account(mut)]
    pub signal: Account<'info, Signal>,
    #[account(
        mut,
        seeds = [b"aggregator", registry.key().as_ref(), &registry.epoch.to_le_bytes()],
        bump = aggregator.bump
    )]
    pub aggregator: Account<'info, SignalAggregator>,
}

#[derive(Accounts)]
pub struct RevealVote<'info> {
    #[account(
        mut,
        constraint = vote_record.swarm_action == swarm_action.key()
    )]
    pub vote_record: Account<'info, VoteRecord>,
    #[account(mut)]
    pub swarm_action: Account<'info, SwarmAction>,
}

#[derive(Accounts)]
#[instruction(epoch: u64)]
pub struct InitAggregator<'info> {
    pub registry: Account<'info, AgentRegistry>,
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 8 + 4 + 4 + 4 + 4 + 4 + 4 + 8 + 1,
        seeds = [b"aggregator", registry.key().as_ref(), &epoch.to_le_bytes()],
        bump
    )]
    pub aggregator: Account<'info, SignalAggregator>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestWithdrawal<'info> {
    pub registry: Account<'info, AgentRegistry>,
    pub agent: Account<'info, Agent>,
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1,  // +32 for requester pubkey
        seeds = [b"withdrawal", agent.key().as_ref()],
        bump
    )]
    pub withdrawal: Account<'info, WithdrawalRequest>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimWithdrawal<'info> {
    #[account(mut)]
    pub registry: Account<'info, AgentRegistry>,
    #[account(mut, has_one = registry)]
    pub agent: Account<'info, Agent>,
    #[account(
        mut,
        seeds = [b"withdrawal", agent.key().as_ref()],
        bump = withdrawal.bump,
        constraint = withdrawal.agent == agent.key()
    )]
    pub withdrawal: Account<'info, WithdrawalRequest>,
    /// CHECK: Stake vault PDA
    #[account(
        mut,
        seeds = [b"stake_vault", registry.key().as_ref()],
        bump
    )]
    pub stake_vault: AccountInfo<'info>,
    /// CHECK: Recipient receives stake
    #[account(mut)]
    pub recipient: AccountInfo<'info>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelWithdrawal<'info> {
    #[account(
        mut,
        close = payer
    )]
    pub withdrawal: Account<'info, WithdrawalRequest>,
    #[account(mut)]
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct LinkIdentity<'info> {
    /// The ZK agent in this program
    #[account(
        constraint = zk_agent.active @ AgentCollabError::AgentNotActive
    )]
    pub zk_agent: Account<'info, Agent>,

    /// The public kamiyo Agent PDA
    /// CHECK: This is an external account from the main kamiyo program.
    /// We store its pubkey to enable cross-program lookups.
    /// The owner must prove they control this agent through the signer constraint.
    pub kamiyo_agent: AccountInfo<'info>,

    /// The identity link account (PDA derived from both agents)
    /// Space: 8 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 = 130
    #[account(
        init,
        payer = owner,
        space = 130,
        seeds = [b"identity_link", zk_agent.key().as_ref()],
        bump
    )]
    pub identity_link: Account<'info, IdentityLink>,

    /// Optional: Stake position from kamiyo-staking program
    /// If provided, stake amount and multiplier are recorded in the link
    /// CHECK: Validated in instruction - must be owned by staking program
    pub stake_position: Option<AccountInfo<'info>>,

    /// Owner who must own both agents
    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnlinkIdentity<'info> {
    #[account(
        mut,
        seeds = [b"identity_link", identity_link.zk_agent.as_ref()],
        bump = identity_link.bump,
        has_one = owner @ AgentCollabError::UnauthorizedWithdrawal
    )]
    pub identity_link: Account<'info, IdentityLink>,

    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct RefreshStake<'info> {
    #[account(
        mut,
        seeds = [b"identity_link", identity_link.zk_agent.as_ref()],
        bump = identity_link.bump,
        has_one = owner @ AgentCollabError::UnauthorizedWithdrawal
    )]
    pub identity_link: Account<'info, IdentityLink>,

    /// Optional: Updated stake position from kamiyo-staking program
    /// CHECK: Validated in instruction - must be owned by staking program
    pub stake_position: Option<AccountInfo<'info>>,

    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct DeactivateAgent<'info> {
    #[account(mut)]
    pub registry: Account<'info, AgentRegistry>,
    #[account(
        mut,
        has_one = registry,
    )]
    pub agent: Account<'info, Agent>,
    /// CHECK: Stake vault PDA
    #[account(
        mut,
        seeds = [b"stake_vault", registry.key().as_ref()],
        bump
    )]
    pub stake_vault: AccountInfo<'info>,
    /// CHECK: Recipient of stake (must be the original payer or admin)
    #[account(mut)]
    pub recipient: AccountInfo<'info>,
    #[account(
        constraint = authority.key() == registry.authority @ AgentCollabError::Unauthorized
    )]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ManageProtocol<'info> {
    #[account(mut)]
    pub registry: Account<'info, AgentRegistry>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct MigrateRegistry<'info> {
    /// Registry to migrate (UncheckedAccount to allow undersized data during realloc)
    /// CHECK: Manually verified via PDA seeds. We read bump from raw data before realloc.
    #[account(
        mut,
        seeds = [b"registry"],
        bump
    )]
    pub registry: UncheckedAccount<'info>,

    /// KAMIYO token mint (Token-2022)
    #[account(
        constraint = kamiyo_mint.key() == KAMIYO_MINT @ AgentCollabError::InvalidKamiyoMint
    )]
    pub kamiyo_mint: InterfaceAccount<'info, MintInterface>,

    /// Treasury vault (created during migration)
    #[account(
        init,
        payer = authority,
        token::mint = kamiyo_mint,
        token::authority = treasury_vault,
        seeds = [b"treasury", registry.key().as_ref()],
        bump
    )]
    pub treasury_vault: InterfaceAccount<'info, TokenAccountInterface>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    /// Registry to verify agent and check paused state
    #[account(
        constraint = !registry.paused @ AgentCollabError::ProtocolPaused
    )]
    pub registry: Account<'info, AgentRegistry>,

    #[account(mut, has_one = registry)]
    pub agent: Account<'info, Agent>,

    /// Depositor's KAMIYO token account
    #[account(
        mut,
        constraint = depositor_token_account.mint == KAMIYO_MINT,
        constraint = depositor_token_account.owner == depositor.key()
    )]
    pub depositor_token_account: Account<'info, TokenAccount>,

    /// Agent's collateral vault (PDA-owned token account)
    #[account(
        init_if_needed,
        payer = depositor,
        token::mint = kamiyo_mint,
        token::authority = collateral_vault,
        seeds = [b"collateral_vault", agent.key().as_ref()],
        bump
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    #[account(
        constraint = kamiyo_mint.key() == KAMIYO_MINT @ AgentCollabError::InvalidKamiyoMint
    )]
    pub kamiyo_mint: Account<'info, Mint>,

    #[account(mut)]
    pub depositor: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct RequestCollateralWithdrawal<'info> {
    pub agent: Account<'info, Agent>,

    /// Collateral withdrawal request account
    /// Space: 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1 = 98
    #[account(
        init,
        payer = requester,
        space = 98,
        seeds = [b"collateral_withdrawal", agent.key().as_ref()],
        bump
    )]
    pub collateral_withdrawal: Account<'info, CollateralWithdrawal>,

    #[account(mut)]
    pub requester: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimCollateralWithdrawal<'info> {
    #[account(mut)]
    pub agent: Account<'info, Agent>,

    #[account(
        mut,
        seeds = [b"collateral_withdrawal", agent.key().as_ref()],
        bump = collateral_withdrawal.bump,
        constraint = collateral_withdrawal.agent == agent.key()
    )]
    pub collateral_withdrawal: Account<'info, CollateralWithdrawal>,

    /// Agent's collateral vault
    #[account(
        mut,
        seeds = [b"collateral_vault", agent.key().as_ref()],
        bump
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    /// Claimer's token account to receive withdrawn collateral
    #[account(
        mut,
        constraint = claimer_token_account.mint == KAMIYO_MINT,
        constraint = claimer_token_account.owner == claimer.key()
    )]
    pub claimer_token_account: Account<'info, TokenAccount>,

    pub claimer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SlashAgent<'info> {
    pub registry: Account<'info, AgentRegistry>,

    #[account(mut, has_one = registry)]
    pub agent: Account<'info, Agent>,

    /// Agent's collateral vault
    #[account(
        mut,
        seeds = [b"collateral_vault", agent.key().as_ref()],
        bump
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    /// Treasury to receive slashed tokens
    #[account(
        mut,
        seeds = [b"treasury", registry.key().as_ref()],
        bump = registry.treasury_bump
    )]
    pub slash_treasury: Account<'info, TokenAccount>,

    #[account(
        constraint = authority.key() == registry.authority @ AgentCollabError::Unauthorized
    )]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct BurnFromTreasury<'info> {
    #[account(mut)]
    pub registry: Account<'info, AgentRegistry>,

    /// Treasury vault holding KAMIYO tokens
    #[account(
        mut,
        seeds = [b"treasury", registry.key().as_ref()],
        bump = registry.treasury_bump
    )]
    pub treasury_vault: Account<'info, TokenAccount>,

    /// KAMIYO mint for burn
    #[account(
        mut,
        constraint = kamiyo_mint.key() == registry.kamiyo_mint
    )]
    pub kamiyo_mint: Account<'info, Mint>,

    #[account(
        constraint = authority.key() == registry.authority @ AgentCollabError::Unauthorized
    )]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// ============================================================================
// Data Types
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegistryConfig {
    pub min_stake: u64,
    pub min_signal_confidence: u8,
    /// Maximum total stake (TVL cap) - 0 means unlimited
    pub max_total_stake: u64,
    /// Maximum stake per agent - 0 means unlimited
    pub max_stake_per_agent: u64,
    /// Minimum KAMIYO collateral for signal submission (0 = no requirement)
    pub min_signal_collateral: u64,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct RegistryInitialized {
    pub registry: Pubkey,
    pub authority: Pubkey,
    pub min_stake: u64,
}

#[event]
pub struct RegistryMigrated {
    pub registry: Pubkey,
    pub kamiyo_mint: Pubkey,
    pub treasury_vault: Pubkey,
}

#[event]
pub struct AgentRegistered {
    pub registry: Pubkey,
    pub agent: Pubkey,
    pub identity_commitment: [u8; 32],
    pub stake: u64,
}

#[event]
pub struct AgentsRootUpdated {
    pub registry: Pubkey,
    pub new_root: [u8; 32],
    pub agent_count: u32,
    pub epoch: u64,
}

#[event]
pub struct SignalSubmitted {
    pub registry: Pubkey,
    pub nullifier: [u8; 32],
    pub commitment: [u8; 32],
    pub slot: u64,
}

#[event]
pub struct SwarmActionCreated {
    pub registry: Pubkey,
    pub action_hash: [u8; 32],
    pub threshold: u8,
    pub deadline_slot: u64,
}

#[event]
pub struct SwarmVoteCast {
    pub action: Pubkey,
    pub nullifier: [u8; 32],
    pub vote: bool,
    pub votes_for: u32,
    pub votes_against: u32,
}

#[event]
pub struct SwarmActionExecuted {
    pub action: Pubkey,
    pub action_hash: [u8; 32],
    pub votes_for: u32,
    pub votes_against: u32,
}

#[event]
pub struct VoteRevealed {
    pub action: Pubkey,
    pub vote_nullifier: [u8; 32],
    pub vote_value: bool,
    pub weight: u64,
}

// Vote+Bid Events
#[event]
pub struct SwarmActionBidCreated {
    pub registry: Pubkey,
    pub action_hash: [u8; 32],
    pub threshold: u8,
    pub min_bid: u64,
    pub vote_deadline_slot: u64,
    pub reveal_deadline_slot: u64,
}

#[event]
pub struct SwarmVoteBidCast {
    pub action: Pubkey,
    pub nullifier: [u8; 32],
    pub vote_count: u32,
}

#[event]
pub struct VoteBidRevealed {
    pub action: Pubkey,
    pub vote_nullifier: [u8; 32],
    pub vote_value: bool,
    pub bid_amount: u64,
    pub is_highest_yes: bool,
}

#[event]
pub struct SwarmActionBidExecuted {
    pub action: Pubkey,
    pub action_hash: [u8; 32],
    pub yes_votes: u32,
    pub no_votes: u32,
    pub winning_nullifier: [u8; 32],
    pub winning_bid: u64,
}

#[event]
pub struct AgentDeactivated {
    pub agent: Pubkey,
    pub stake_returned: u64,
}

#[event]
pub struct ProtocolPaused {
    pub registry: Pubkey,
}

#[event]
pub struct ProtocolUnpaused {
    pub registry: Pubkey,
}

#[event]
pub struct CapsUpdated {
    pub registry: Pubkey,
    pub max_total_stake: u64,
    pub max_stake_per_agent: u64,
}

#[event]
pub struct MinSignalCollateralUpdated {
    pub registry: Pubkey,
    pub min_signal_collateral: u64,
}

#[event]
pub struct SignalRevealed {
    pub signal: Pubkey,
    pub signal_type: u8,
    pub direction: u8,
    pub confidence: u8,
    pub magnitude: u8,
}

#[event]
pub struct AggregatorInitialized {
    pub registry: Pubkey,
    pub epoch: u64,
}

#[event]
pub struct WithdrawalRequested {
    pub agent: Pubkey,
    pub amount: u64,
    pub unlock_slot: u64,
}

#[event]
pub struct WithdrawalClaimed {
    pub agent: Pubkey,
    pub amount: u64,
}

#[event]
pub struct WithdrawalCancelled {
    pub agent: Pubkey,
}

#[event]
pub struct IdentityLinked {
    pub zk_agent: Pubkey,
    pub kamiyo_agent: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct IdentityUnlinked {
    pub zk_agent: Pubkey,
    pub kamiyo_agent: Pubkey,
}

#[event]
pub struct StakeRefreshed {
    pub identity_link: Pubkey,
    pub staked_amount: u64,
    pub stake_multiplier: u64,
}

#[event]
pub struct KamiyoFeePaid {
    pub registry: Pubkey,
    pub action: String,
    pub total_fee: u64,
    pub burned: u64,
    pub treasury: u64,
}

#[event]
pub struct CollateralDeposited {
    pub agent: Pubkey,
    pub amount: u64,
    pub total_collateral: u64,
}

#[event]
pub struct CollateralWithdrawalRequested {
    pub agent: Pubkey,
    pub amount: u64,
    pub unlock_time: i64,
}

#[event]
pub struct CollateralWithdrawalClaimed {
    pub agent: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AgentSlashed {
    pub agent: Pubkey,
    pub amount: u64,
    pub reason: String,
    pub violation_count: u8,
}

#[event]
pub struct TreasuryBurned {
    pub registry: Pubkey,
    pub amount: u64,
    pub total_burned: u64,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum AgentCollabError {
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Insufficient stake amount")]
    InsufficientStake,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Nullifier already used this epoch")]
    NullifierAlreadyUsed,
    #[msg("Invalid ZK proof")]
    InvalidProof,
    #[msg("Invalid threshold")]
    InvalidThreshold,
    #[msg("Action already executed")]
    ActionAlreadyExecuted,
    #[msg("Voting has ended")]
    VotingEnded,
    #[msg("Already voted on this action")]
    AlreadyVoted,
    #[msg("Voting has not ended")]
    VotingNotEnded,
    #[msg("No votes cast")]
    NoVotes,
    #[msg("Threshold not met")]
    ThresholdNotMet,
    #[msg("Agent not active")]
    AgentNotActive,
    #[msg("Signal already revealed")]
    SignalAlreadyRevealed,
    #[msg("Vote already revealed")]
    VoteAlreadyRevealed,
    #[msg("Cannot reveal signal yet")]
    RevealTooEarly,
    #[msg("Withdrawal already claimed")]
    WithdrawalAlreadyClaimed,
    #[msg("Timelock not expired")]
    TimelockNotExpired,
    #[msg("Vote count overflow")]
    VoteOverflow,
    #[msg("Aggregator overflow")]
    AggregatorOverflow,
    #[msg("Unauthorized withdrawal claim")]
    UnauthorizedWithdrawal,
    #[msg("Identity link not active")]
    LinkNotActive,
    #[msg("Identity already linked")]
    AlreadyLinked,
    #[msg("Invalid stake position account")]
    InvalidStakePosition,
    #[msg("Stake position owner mismatch")]
    StakeOwnerMismatch,
    #[msg("Agent count overflow")]
    AgentCountOverflow,
    #[msg("Invalid reveal data")]
    InvalidReveal,
    #[msg("Commitment mismatch - reveal data does not match original commitment")]
    CommitmentMismatch,
    #[msg("Stake amount exceeds per-agent cap")]
    ExceedsAgentStakeCap,
    #[msg("Total stake would exceed TVL cap")]
    ExceedsTvlCap,
    #[msg("Stake calculation overflow")]
    StakeOverflow,
    #[msg("Invalid KAMIYO token mint")]
    InvalidKamiyoMint,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Exceeds available collateral")]
    ExceedsCollateral,
    #[msg("Collateral withdrawal already claimed")]
    CollateralAlreadyClaimed,
    #[msg("Collateral timelock not expired")]
    CollateralTimelockActive,
    #[msg("Insufficient treasury balance")]
    InsufficientTreasuryBalance,
    #[msg("Registry already migrated")]
    AlreadyMigrated,
    #[msg("Not the agent owner")]
    NotAgentOwner,
    #[msg("Invalid account data")]
    InvalidAccountData,
    #[msg("Invalid deadline configuration")]
    InvalidDeadline,
    #[msg("Reveal phase has not started")]
    RevealTooLate,
    #[msg("Bid amount is below minimum")]
    BidTooLow,
    #[msg("No winning bid found")]
    NoWinningBid,
}
