//! Error types for Mitama ZK

use thiserror::Error;

/// Errors that can occur during ZK proof generation/verification
#[derive(Error, Debug)]
pub enum ZkError {
    #[error("Invalid score: must be in range [0, 100], got {0}")]
    InvalidScore(u8),

    #[error("Invalid proof: {0}")]
    InvalidProof(String),

    #[error("Commitment mismatch: proof does not match public commitment")]
    CommitmentMismatch,

    #[error("Proof generation failed: {0}")]
    ProofGenerationFailed(String),

    #[error("Proof verification failed: {0}")]
    VerificationFailed(String),

    #[error("Circuit synthesis error: {0}")]
    CircuitError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Halo2 error: {0}")]
    Halo2Error(String),
}

impl From<halo2_proofs::plonk::Error> for ZkError {
    fn from(e: halo2_proofs::plonk::Error) -> Self {
        ZkError::Halo2Error(format!("{:?}", e))
    }
}

impl From<bincode::Error> for ZkError {
    fn from(e: bincode::Error) -> Self {
        ZkError::SerializationError(e.to_string())
    }
}
