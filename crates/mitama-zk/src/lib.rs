//! # Mitama ZK - Zero-Knowledge Proofs for Trustless Dispute Resolution
//!
//! This crate implements privacy-preserving oracle voting using **Zcash's Halo2**
//! proving system. Halo2 enables zero-knowledge proofs without a trusted setup,
//! making it ideal for decentralized oracle consensus.
//!
//! ## Acknowledgments
//!
//! This work builds upon the Zcash team's groundbreaking research:
//!
//! - **Halo2**: <https://github.com/zcash/halo2>
//!   PLONK-based proving system with no trusted setup
//!
//! - **Halo Paper**: <https://eprint.iacr.org/2019/1021>
//!   "Recursive Proof Composition without a Trusted Setup"
//!   By Sean Bowe, Jack Grigg, Daira Hopwood (Electric Coin Company)
//!
//! ## Use Cases
//!
//! 1. **Private Oracle Voting**: Oracles commit to quality scores without revealing
//!    them until the reveal phase, preventing vote copying and collusion.
//!
//! 2. **Range Proofs**: Prove a score is in valid range [0, 100] without revealing
//!    the exact value.
//!
//! 3. **Merkle Membership**: Prove oracle registration without revealing identity
//!    until necessary.
//!
//! ## Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │                    Mitama ZK Stack                          │
//! ├─────────────────────────────────────────────────────────────┤
//! │  Application Layer                                          │
//! │  ├── OracleVoteCircuit  - Private oracle score commitment   │
//! │  ├── RangeProofCircuit  - Score validation [0-100]          │
//! │  └── MerkleCircuit      - Oracle registry membership        │
//! ├─────────────────────────────────────────────────────────────┤
//! │  Proving Layer (Zcash Halo2)                                │
//! │  ├── halo2_proofs  - Core PLONK prover/verifier            │
//! │  └── halo2_gadgets - Reusable circuit components           │
//! ├─────────────────────────────────────────────────────────────┤
//! │  Cryptographic Primitives                                   │
//! │  ├── Pasta Curves (Pallas/Vesta) - Efficient for recursion │
//! │  └── Poseidon Hash - ZK-friendly hash function             │
//! └─────────────────────────────────────────────────────────────┘
//! ```

pub mod bridge;
pub mod circuits;
pub mod commitment;
pub mod error;
pub mod poseidon;
pub mod prover;
pub mod solana;
pub mod utils;

pub use bridge::{CircomInputs, SolanaVerificationData, parse_snarkjs_proof};
pub use circuits::oracle_vote::{OracleVoteCircuit, MAX_SCORE, MIN_SCORE};
pub use commitment::VoteCommitment;
pub use error::ZkError;
pub use poseidon::{hash_two, vote_commitment};
pub use prover::{Halo2Proof, OracleVoteProver, K as CIRCUIT_K};
pub use solana::{Groth16Proof, OracleVotePublicInputs, SolanaProof, verify_commitment};

/// Re-export Halo2 types for downstream users
pub mod halo2 {
    pub use halo2_proofs::circuit::{Layouter, SimpleFloorPlanner, Value};
    pub use halo2_proofs::plonk::{
        Advice, Circuit, Column, ConstraintSystem, Error, Instance, Selector,
    };
    pub use halo2_proofs::poly::Rotation;
}

/// Prove and verify an oracle vote commitment
///
/// # Example
///
/// ```ignore
/// use mitama_zk::{OracleVoteCircuit, VoteCommitment};
///
/// // Oracle commits to a quality score
/// let score = 75u8;
/// let blinding = rand::random::<[u8; 32]>();
/// let commitment = VoteCommitment::new(score, &blinding);
///
/// // Create ZK proof that score is valid (0-100) without revealing it
/// let circuit = OracleVoteCircuit::new(score, blinding, commitment.hash());
/// let proof = circuit.prove()?;
///
/// // Anyone can verify the proof
/// assert!(proof.verify(&commitment.hash()));
/// ```
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert_eq!(version(), "0.1.0");
    }
}
