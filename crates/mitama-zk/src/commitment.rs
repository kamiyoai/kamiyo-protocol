//! Vote commitment scheme for private oracle voting
//!
//! Uses a Pedersen-style commitment: C = H(score || blinding || escrow_id)
//! This allows oracles to commit to votes without revealing them.

use blake2::{Blake2b512, Digest};
use serde::{Deserialize, Serialize};

/// A commitment to an oracle vote
///
/// The commitment hides the score until reveal, while binding the oracle
/// to their vote. This prevents vote copying and last-minute changes.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct VoteCommitment {
    /// The commitment hash (public)
    pub hash: [u8; 32],
    /// Escrow ID this vote is for (public)
    pub escrow_id: [u8; 32],
    /// Oracle public key (public)
    pub oracle: [u8; 32],
    /// Timestamp of commitment (public)
    pub committed_at: i64,
}

impl VoteCommitment {
    /// Create a new vote commitment
    ///
    /// # Arguments
    /// * `score` - The quality score (0-100), kept private
    /// * `blinding` - Random blinding factor for hiding
    /// * `escrow_id` - The escrow being voted on
    /// * `oracle` - The oracle's public key
    ///
    /// # Returns
    /// A commitment that can be published without revealing the score
    pub fn new(
        score: u8,
        blinding: &[u8; 32],
        escrow_id: [u8; 32],
        oracle: [u8; 32],
    ) -> Self {
        let hash = Self::compute_hash(score, blinding, &escrow_id, &oracle);
        Self {
            hash,
            escrow_id,
            oracle,
            committed_at: 0, // Set by caller
        }
    }

    /// Compute the commitment hash
    ///
    /// Uses Blake2b for ZK-friendliness (can be proven efficiently in Halo2)
    pub fn compute_hash(
        score: u8,
        blinding: &[u8; 32],
        escrow_id: &[u8; 32],
        oracle: &[u8; 32],
    ) -> [u8; 32] {
        let mut hasher = Blake2b512::new();
        hasher.update([score]);
        hasher.update(blinding);
        hasher.update(escrow_id);
        hasher.update(oracle);

        let result = hasher.finalize();
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&result[..32]);
        hash
    }

    /// Verify that a revealed score matches this commitment
    pub fn verify(&self, score: u8, blinding: &[u8; 32]) -> bool {
        let computed = Self::compute_hash(score, blinding, &self.escrow_id, &self.oracle);
        computed == self.hash
    }

    /// Serialize the commitment for on-chain storage
    pub fn to_bytes(&self) -> Vec<u8> {
        bincode::serialize(self).expect("serialization should not fail")
    }

    /// Deserialize a commitment from bytes
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, bincode::Error> {
        bincode::deserialize(bytes)
    }
}

/// Blinding factor for commitments
///
/// This should be generated securely and kept private until reveal
pub fn generate_blinding() -> [u8; 32] {
    let mut blinding = [0u8; 32];
    getrandom::getrandom(&mut blinding).expect("random generation failed");
    blinding
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_commitment_verify() {
        let score = 75u8;
        let blinding = [1u8; 32];
        let escrow_id = [2u8; 32];
        let oracle = [3u8; 32];

        let commitment = VoteCommitment::new(score, &blinding, escrow_id, oracle);

        // Correct reveal should verify
        assert!(commitment.verify(score, &blinding));

        // Wrong score should fail
        assert!(!commitment.verify(74, &blinding));

        // Wrong blinding should fail
        assert!(!commitment.verify(score, &[0u8; 32]));
    }

    #[test]
    fn test_commitment_serialization() {
        let commitment = VoteCommitment::new(50, &[1u8; 32], [2u8; 32], [3u8; 32]);
        let bytes = commitment.to_bytes();
        let recovered = VoteCommitment::from_bytes(&bytes).unwrap();
        assert_eq!(commitment, recovered);
    }
}
