/*
 * ZK proof verification for agent collaboration.
 *
 * Verification keys for:
 * - Agent identity: Prove membership in agent set without revealing owner
 * - Swarm vote: Prove vote validity without revealing choice
 *
 * circuit params: bn254, plamo-2.1 quantized constraint system
 */

use anchor_lang::prelude::*;
use groth16_solana::groth16::Groth16Verifier;

use crate::AgentCollabError;
use crate::vk_generated::{AGENT_IDENTITY_VK, SWARM_VOTE_VK, SWARM_VOTE_BID_VK};

/// Verify a Groth16 proof with 3 public inputs (agent_identity circuit).
pub fn verify_agent_identity_proof(
    proof_a: &[u8; 64],
    proof_b: &[u8; 128],
    proof_c: &[u8; 64],
    public_inputs: &[[u8; 32]; 3],
) -> Result<()> {
    let mut verifier = Groth16Verifier::new(
        proof_a,
        proof_b,
        proof_c,
        public_inputs,
        &AGENT_IDENTITY_VK,
    )
    .map_err(|_| error!(AgentCollabError::InvalidProof))?;

    let valid = verifier
        .verify()
        .map_err(|_| error!(AgentCollabError::InvalidProof))?;

    if valid {
        Ok(())
    } else {
        Err(error!(AgentCollabError::InvalidProof))
    }
}

/// Verify a Groth16 proof with 4 public inputs (swarm_vote circuit).
pub fn verify_swarm_vote_proof(
    proof_a: &[u8; 64],
    proof_b: &[u8; 128],
    proof_c: &[u8; 64],
    public_inputs: &[[u8; 32]; 4],
) -> Result<()> {
    let mut verifier = Groth16Verifier::new(
        proof_a,
        proof_b,
        proof_c,
        public_inputs,
        &SWARM_VOTE_VK,
    )
    .map_err(|_| error!(AgentCollabError::InvalidProof))?;

    let valid = verifier
        .verify()
        .map_err(|_| error!(AgentCollabError::InvalidProof))?;

    if valid {
        Ok(())
    } else {
        Err(error!(AgentCollabError::InvalidProof))
    }
}

/// Verify a Groth16 proof with 6 public inputs (swarm_vote_bid circuit).
/// Public inputs: agents_root, action_hash, vote_nullifier, vote_commitment, bid_commitment, min_bid
pub fn verify_swarm_vote_bid_proof(
    proof_a: &[u8; 64],
    proof_b: &[u8; 128],
    proof_c: &[u8; 64],
    public_inputs: &[[u8; 32]; 6],
) -> Result<()> {
    let mut verifier = Groth16Verifier::new(
        proof_a,
        proof_b,
        proof_c,
        public_inputs,
        &SWARM_VOTE_BID_VK,
    )
    .map_err(|_| error!(AgentCollabError::InvalidProof))?;

    let valid = verifier
        .verify()
        .map_err(|_| error!(AgentCollabError::InvalidProof))?;

    if valid {
        Ok(())
    } else {
        Err(error!(AgentCollabError::InvalidProof))
    }
}
