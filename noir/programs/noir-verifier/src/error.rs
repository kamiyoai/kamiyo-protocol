use anchor_lang::prelude::*;

#[error_code]
pub enum NoirError {
    #[msg("Invalid proof data")]
    InvalidProof,

    #[msg("Invalid proof length")]
    InvalidProofLength,

    #[msg("Invalid verification key length")]
    InvalidVkLength,

    #[msg("Public input count mismatch")]
    InputCountMismatch,

    #[msg("Proof verification failed")]
    ProofVerificationFailed,

    #[msg("SMT root mismatch")]
    RootMismatch,

    #[msg("Oracle is blacklisted")]
    OracleBlacklisted,

    #[msg("Invalid circuit type")]
    InvalidCircuitType,

    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Escrow already finalized")]
    AlreadyFinalized,

    #[msg("Insufficient votes for aggregation")]
    InsufficientVotes,

    #[msg("Reputation threshold not met")]
    ReputationThresholdNotMet,
}
