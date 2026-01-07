use anchor_lang::prelude::*;

/// Verification key account for a specific circuit
#[account]
pub struct VerificationKey {
    pub authority: Pubkey,
    pub circuit_id: [u8; 32],
    pub vk_data: Vec<u8>,
    pub bump: u8,
}

impl VerificationKey {
    pub const SIZE: usize = 8 +  // discriminator
        32 +                      // authority
        32 +                      // circuit_id
        4 + 2048 +               // vk_data (max 2KB)
        1;                        // bump
}

/// Oracle blacklist state using SMT root
#[account]
pub struct Blacklist {
    pub authority: Pubkey,
    pub root: [u8; 32],
    pub count: u64,
    pub last_updated: i64,
    pub bump: u8,
}

impl Blacklist {
    pub const SIZE: usize = 8 +  // discriminator
        32 +                      // authority
        32 +                      // root
        8 +                       // count
        8 +                       // last_updated
        1;                        // bump
}

/// Escrow vote state for aggregate verification
#[account]
pub struct EscrowVotes {
    pub escrow_id: [u8; 32],
    pub votes_root: [u8; 32],
    pub vote_count: u64,
    pub score_sum: u64,
    pub finalized: bool,
    pub bump: u8,
}

impl EscrowVotes {
    pub const SIZE: usize = 8 +  // discriminator
        32 +                      // escrow_id
        32 +                      // votes_root
        8 +                       // vote_count
        8 +                       // score_sum
        1 +                       // finalized
        1;                        // bump
}

/// Agent reputation state
#[account]
pub struct AgentReputation {
    pub agent: Pubkey,
    pub reputation_commitment: [u8; 32],
    pub successful_agreements: u64,
    pub total_agreements: u64,
    pub disputes_won: u64,
    pub disputes_lost: u64,
    pub last_updated: i64,
    pub bump: u8,
}

impl AgentReputation {
    pub const SIZE: usize = 8 +  // discriminator
        32 +                      // agent
        32 +                      // reputation_commitment
        8 +                       // successful_agreements
        8 +                       // total_agreements
        8 +                       // disputes_won
        8 +                       // disputes_lost
        8 +                       // last_updated
        1;                        // bump

    pub fn success_rate(&self) -> u8 {
        if self.total_agreements == 0 {
            return 100;
        }
        ((self.successful_agreements * 100) / self.total_agreements) as u8
    }
}

/// Circuit types supported by the verifier
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum CircuitType {
    OracleVote,
    SmtExclusion,
    AggregateVote,
    ReputationProof,
}

impl CircuitType {
    pub fn to_circuit_id(&self) -> [u8; 32] {
        let mut id = [0u8; 32];
        match self {
            CircuitType::OracleVote => id[0] = 1,
            CircuitType::SmtExclusion => id[0] = 2,
            CircuitType::AggregateVote => id[0] = 3,
            CircuitType::ReputationProof => id[0] = 4,
        }
        id
    }
}
