use anchor_lang::prelude::*;
use solana_program::alt_bn128::{
    prelude::*,
    compression::prelude::*,
};

declare_id!("NoirVrf1111111111111111111111111111111111111");

pub mod groth16;
pub mod state;
pub mod error;

use groth16::*;
use state::*;
use error::*;

#[program]
pub mod noir_verifier {
    use super::*;

    /// Initialize a verification key for a specific circuit
    pub fn initialize_vk(
        ctx: Context<InitializeVk>,
        circuit_id: [u8; 32],
        vk_data: Vec<u8>,
    ) -> Result<()> {
        let vk_account = &mut ctx.accounts.verification_key;
        vk_account.authority = ctx.accounts.authority.key();
        vk_account.circuit_id = circuit_id;
        vk_account.vk_data = vk_data;
        vk_account.bump = ctx.bumps.verification_key;
        Ok(())
    }

    /// Verify an oracle vote proof
    pub fn verify_oracle_vote(
        ctx: Context<VerifyProof>,
        proof_data: Vec<u8>,
        public_inputs: OracleVotePublicInputs,
    ) -> Result<()> {
        let vk = &ctx.accounts.verification_key;

        // Deserialize and verify the Groth16 proof
        let proof = Groth16Proof::deserialize(&proof_data)
            .map_err(|_| NoirError::InvalidProof)?;

        let inputs = vec![
            public_inputs.escrow_id,
            public_inputs.oracle_pk,
            public_inputs.commitment,
        ];

        verify_groth16_proof(&vk.vk_data, &proof, &inputs)?;

        // Emit verification event
        emit!(OracleVoteVerified {
            escrow_id: public_inputs.escrow_id,
            oracle: public_inputs.oracle_pk,
            commitment: public_inputs.commitment,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Verify SMT exclusion proof (oracle not blacklisted)
    pub fn verify_exclusion(
        ctx: Context<VerifyExclusion>,
        proof_data: Vec<u8>,
        public_inputs: SmtExclusionPublicInputs,
    ) -> Result<()> {
        let vk = &ctx.accounts.verification_key;
        let blacklist = &ctx.accounts.blacklist;

        // Verify the on-chain root matches the proof's root
        require!(
            blacklist.root == public_inputs.root,
            NoirError::RootMismatch
        );

        let proof = Groth16Proof::deserialize(&proof_data)
            .map_err(|_| NoirError::InvalidProof)?;

        let inputs = vec![
            public_inputs.root,
            public_inputs.oracle_pk,
        ];

        verify_groth16_proof(&vk.vk_data, &proof, &inputs)?;

        emit!(ExclusionVerified {
            oracle: public_inputs.oracle_pk,
            root: public_inputs.root,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Verify aggregate vote proof (batch of oracle votes)
    pub fn verify_aggregate_vote(
        ctx: Context<VerifyProof>,
        proof_data: Vec<u8>,
        public_inputs: AggregateVotePublicInputs,
    ) -> Result<()> {
        let vk = &ctx.accounts.verification_key;

        let proof = Groth16Proof::deserialize(&proof_data)
            .map_err(|_| NoirError::InvalidProof)?;

        let inputs = vec![
            public_inputs.escrow_id,
            public_inputs.votes_root,
            public_inputs.num_votes,
            public_inputs.score_sum,
        ];

        verify_groth16_proof(&vk.vk_data, &proof, &inputs)?;

        // Compute median from aggregate
        let median_score = if public_inputs.num_votes > 0 {
            (public_inputs.score_sum / public_inputs.num_votes) as u8
        } else {
            0
        };

        emit!(AggregateVoteVerified {
            escrow_id: public_inputs.escrow_id,
            num_votes: public_inputs.num_votes,
            median_score,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Verify reputation proof
    pub fn verify_reputation(
        ctx: Context<VerifyProof>,
        proof_data: Vec<u8>,
        public_inputs: ReputationPublicInputs,
    ) -> Result<()> {
        let vk = &ctx.accounts.verification_key;

        let proof = Groth16Proof::deserialize(&proof_data)
            .map_err(|_| NoirError::InvalidProof)?;

        let inputs = vec![
            public_inputs.agent_pk,
            public_inputs.reputation_commitment,
            public_inputs.threshold,
        ];

        verify_groth16_proof(&vk.vk_data, &proof, &inputs)?;

        emit!(ReputationVerified {
            agent: public_inputs.agent_pk,
            meets_threshold: true,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Add oracle to blacklist (admin only)
    pub fn blacklist_oracle(
        ctx: Context<UpdateBlacklist>,
        oracle_pk: [u8; 32],
        new_root: [u8; 32],
    ) -> Result<()> {
        let blacklist = &mut ctx.accounts.blacklist;
        blacklist.root = new_root;
        blacklist.count += 1;
        blacklist.last_updated = Clock::get()?.unix_timestamp;

        emit!(OracleBlacklisted {
            oracle: oracle_pk,
            new_root,
            total_blacklisted: blacklist.count,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(circuit_id: [u8; 32])]
pub struct InitializeVk<'info> {
    #[account(
        init,
        payer = authority,
        space = VerificationKey::SIZE,
        seeds = [b"vk", circuit_id.as_ref()],
        bump
    )]
    pub verification_key: Account<'info, VerificationKey>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyProof<'info> {
    pub verification_key: Account<'info, VerificationKey>,
}

#[derive(Accounts)]
pub struct VerifyExclusion<'info> {
    pub verification_key: Account<'info, VerificationKey>,
    pub blacklist: Account<'info, Blacklist>,
}

#[derive(Accounts)]
pub struct UpdateBlacklist<'info> {
    #[account(mut, has_one = authority)]
    pub blacklist: Account<'info, Blacklist>,
    pub authority: Signer<'info>,
}

// Public input structs
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OracleVotePublicInputs {
    pub escrow_id: [u8; 32],
    pub oracle_pk: [u8; 32],
    pub commitment: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SmtExclusionPublicInputs {
    pub root: [u8; 32],
    pub oracle_pk: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AggregateVotePublicInputs {
    pub escrow_id: [u8; 32],
    pub votes_root: [u8; 32],
    pub num_votes: u64,
    pub score_sum: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ReputationPublicInputs {
    pub agent_pk: [u8; 32],
    pub reputation_commitment: [u8; 32],
    pub threshold: u64,
}

// Events
#[event]
pub struct OracleVoteVerified {
    pub escrow_id: [u8; 32],
    pub oracle: [u8; 32],
    pub commitment: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct ExclusionVerified {
    pub oracle: [u8; 32],
    pub root: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct AggregateVoteVerified {
    pub escrow_id: [u8; 32],
    pub num_votes: u64,
    pub median_score: u8,
    pub timestamp: i64,
}

#[event]
pub struct ReputationVerified {
    pub agent: [u8; 32],
    pub meets_threshold: bool,
    pub timestamp: i64,
}

#[event]
pub struct OracleBlacklisted {
    pub oracle: [u8; 32],
    pub new_root: [u8; 32],
    pub total_blacklisted: u64,
}
