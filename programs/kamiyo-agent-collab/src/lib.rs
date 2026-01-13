/*
 * KAMIYO Agent Collaboration Protocol
 *
 * ZK-private coordination for AI agent swarms.
 * Agents prove identity and collaborate without revealing owners.
 */

use anchor_lang::prelude::*;

declare_id!("DmdBbvjNRLNvCQcyeUmyTi5BpDkHdGfUxGzfidgvQe26");

pub mod zk;
mod vk_generated;
use zk::verify_agent_identity_proof;

/// Maximum agents per registry
const MAX_AGENTS: usize = 10_000;
/// Maximum active signals per registry
const MAX_SIGNALS: usize = 1_000;
/// Maximum swarm actions
const MAX_SWARM_ACTIONS: usize = 100;
/// Signal expiry (1 hour in slots, ~2.5 slots/sec)
const SIGNAL_EXPIRY_SLOTS: u64 = 9_000;
/// Swarm action voting window (30 min)
const SWARM_VOTE_WINDOW: u64 = 4_500;

#[program]
pub mod kamiyo_agent_collab {
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

        emit!(RegistryInitialized {
            registry: registry.key(),
            authority: registry.authority,
            min_stake: registry.min_stake,
        });

        Ok(())
    }

    /// Register an agent with identity commitment
    /// Proves ownership of the agent without revealing the owner
    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        identity_commitment: [u8; 32],
        stake_amount: u64,
    ) -> Result<()> {
        let registry = &ctx.accounts.registry;
        require!(!registry.paused, AgentCollabError::ProtocolPaused);
        require!(stake_amount >= registry.min_stake, AgentCollabError::InsufficientStake);

        let agent = &mut ctx.accounts.agent;
        agent.registry = registry.key();
        agent.identity_commitment = identity_commitment;
        agent.stake = stake_amount;
        agent.registered_slot = Clock::get()?.slot;
        agent.signal_count = 0;
        agent.swarm_votes = 0;
        agent.active = true;
        agent.bump = ctx.bumps.agent;

        // Transfer stake
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
    pub fn submit_signal(
        ctx: Context<SubmitSignal>,
        nullifier: [u8; 32],
        signal_commitment: [u8; 32],
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
    ) -> Result<()> {
        let registry = &ctx.accounts.registry;
        require!(!registry.paused, AgentCollabError::ProtocolPaused);

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
        let nullifier_record = &mut ctx.accounts.nullifier_record;
        require!(
            nullifier_record.epoch != registry.epoch,
            AgentCollabError::NullifierAlreadyUsed
        );
        nullifier_record.epoch = registry.epoch;
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

        Ok(())
    }

    /// Create a swarm action proposal
    pub fn create_swarm_action(
        ctx: Context<CreateSwarmAction>,
        action_hash: [u8; 32],
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        nullifier: [u8; 32],
        threshold: u8,
    ) -> Result<()> {
        let registry = &ctx.accounts.registry;
        require!(!registry.paused, AgentCollabError::ProtocolPaused);
        require!(threshold > 0 && threshold <= 100, AgentCollabError::InvalidThreshold);

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

        Ok(())
    }

    /// Vote on a swarm action
    pub fn vote_swarm_action(
        ctx: Context<VoteSwarmAction>,
        nullifier: [u8; 32],
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        vote: bool,
    ) -> Result<()> {
        let registry = &ctx.accounts.registry;
        let swarm_action = &mut ctx.accounts.swarm_action;
        let current_slot = Clock::get()?.slot;

        require!(!registry.paused, AgentCollabError::ProtocolPaused);
        require!(!swarm_action.executed, AgentCollabError::ActionAlreadyExecuted);
        require!(current_slot <= swarm_action.deadline_slot, AgentCollabError::VotingEnded);

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

        // Check vote nullifier not already used
        let vote_nullifier = &mut ctx.accounts.vote_nullifier;
        require!(
            vote_nullifier.action != swarm_action.key(),
            AgentCollabError::AlreadyVoted
        );
        vote_nullifier.action = swarm_action.key();
        vote_nullifier.nullifier = nullifier;
        vote_nullifier.bump = ctx.bumps.vote_nullifier;

        // Record vote
        if vote {
            swarm_action.votes_for += 1;
        } else {
            swarm_action.votes_against += 1;
        }

        emit!(SwarmVoteCast {
            action: swarm_action.key(),
            nullifier,
            vote,
            votes_for: swarm_action.votes_for,
            votes_against: swarm_action.votes_against,
        });

        Ok(())
    }

    /// Execute a swarm action if threshold met
    pub fn execute_swarm_action(ctx: Context<ExecuteSwarmAction>) -> Result<()> {
        let swarm_action = &mut ctx.accounts.swarm_action;
        let current_slot = Clock::get()?.slot;

        require!(!swarm_action.executed, AgentCollabError::ActionAlreadyExecuted);
        require!(current_slot > swarm_action.deadline_slot, AgentCollabError::VotingNotEnded);

        let total_votes = swarm_action.votes_for + swarm_action.votes_against;
        require!(total_votes > 0, AgentCollabError::NoVotes);

        let approval_pct = (swarm_action.votes_for as u16 * 100) / total_votes as u16;
        require!(
            approval_pct >= swarm_action.threshold as u16,
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

    /// Deactivate an agent and reclaim stake
    pub fn deactivate_agent(ctx: Context<DeactivateAgent>) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        require!(agent.active, AgentCollabError::AgentNotActive);

        agent.active = false;

        // Return stake
        let stake_amount = agent.stake;
        **ctx.accounts.stake_vault.to_account_info().try_borrow_mut_lamports()? -= stake_amount;
        **ctx.accounts.recipient.to_account_info().try_borrow_mut_lamports()? += stake_amount;

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

// ============================================================================
// Instruction Contexts
// ============================================================================

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 4 + 4 + 4 + 8 + 8 + 1 + 1 + 1,
        seeds = [b"registry"],
        bump
    )]
    pub registry: Account<'info, AgentRegistry>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(identity_commitment: [u8; 32])]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub registry: Account<'info, AgentRegistry>,
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 8 + 8 + 4 + 4 + 1 + 1,
        seeds = [b"agent", identity_commitment.as_ref()],
        bump
    )]
    pub agent: Account<'info, Agent>,
    /// CHECK: Stake vault PDA
    #[account(
        mut,
        seeds = [b"stake_vault", registry.key().as_ref()],
        bump
    )]
    pub stake_vault: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
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
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(action_hash: [u8; 32])]
pub struct CreateSwarmAction<'info> {
    #[account(mut)]
    pub registry: Account<'info, AgentRegistry>,
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 32 + 1 + 4 + 4 + 8 + 8 + 1 + 1,
        seeds = [b"swarm_action", action_hash.as_ref()],
        bump
    )]
    pub swarm_action: Account<'info, SwarmAction>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nullifier: [u8; 32])]
pub struct VoteSwarmAction<'info> {
    pub registry: Account<'info, AgentRegistry>,
    #[account(mut)]
    pub swarm_action: Account<'info, SwarmAction>,
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 1,
        seeds = [b"vote", swarm_action.key().as_ref(), nullifier.as_ref()],
        bump
    )]
    pub vote_nullifier: Account<'info, VoteNullifier>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteSwarmAction<'info> {
    #[account(mut)]
    pub swarm_action: Account<'info, SwarmAction>,
}

#[derive(Accounts)]
pub struct DeactivateAgent<'info> {
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

// ============================================================================
// Data Types
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegistryConfig {
    pub min_stake: u64,
    pub min_signal_confidence: u8,
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
}
