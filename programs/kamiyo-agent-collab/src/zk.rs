/*
 * ZK proof verification for agent collaboration.
 *
 * Verification keys for:
 * - Agent identity: Prove membership in agent set without revealing owner
 * - Private signal: Prove signal validity without revealing content
 * - Swarm vote: Prove vote validity without revealing choice
 */

use anchor_lang::prelude::*;
use groth16_solana::groth16::{Groth16Verifier, Groth16Verifyingkey};

use crate::AgentCollabError;
use crate::vk_generated::{AGENT_IDENTITY_VK, PRIVATE_SIGNAL_VK, SWARM_VOTE_VK};

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

/// Verify a Groth16 proof with 4 public inputs (private_signal circuit).
pub fn verify_private_signal_proof(
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
        &PRIVATE_SIGNAL_VK,
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
