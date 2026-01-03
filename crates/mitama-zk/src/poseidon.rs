//! Poseidon hash for ZK-friendly commitments
//!
//! Poseidon is an algebraic hash function designed for zero-knowledge proofs.
//! It's much more efficient to prove in a SNARK circuit than traditional
//! hashes like SHA-256 or Blake2.
//!
//! ## Acknowledgment
//!
//! This uses the Poseidon implementation from halo2_gadgets:
//! - https://github.com/zcash/halo2/tree/main/halo2_gadgets
//! - Based on: https://eprint.iacr.org/2019/458 (Poseidon paper)
//!
//! The Zcash team's implementation provides:
//! - P128Pow5T3 spec: 128-bit security, x^5 S-box, t=3 state
//! - Efficient PLONKish constraints

use halo2_gadgets::poseidon::primitives::{self as poseidon, ConstantLength, P128Pow5T3};
use pasta_curves::pallas;

/// Domain separator for oracle vote commitments
pub const VOTE_DOMAIN: &str = "mitama:vote";

/// Hash rate for our Poseidon configuration
pub const RATE: usize = 2;

/// Poseidon hash with 2 inputs
///
/// Used for: H(score, blinding) in vote commitments
pub fn hash_two(a: pallas::Base, b: pallas::Base) -> pallas::Base {
    poseidon::Hash::<_, P128Pow5T3, ConstantLength<2>, 3, 2>::init().hash([a, b])
}

/// Poseidon hash with 4 inputs
///
/// Used for: H(score, blinding, escrow_id, oracle_pk) in full commitments
pub fn hash_four(
    a: pallas::Base,
    b: pallas::Base,
    c: pallas::Base,
    d: pallas::Base,
) -> pallas::Base {
    // Chain two hash_two calls for 4 inputs
    let h1 = hash_two(a, b);
    let h2 = hash_two(c, d);
    hash_two(h1, h2)
}

/// Create a vote commitment using Poseidon
///
/// commitment = Poseidon(score, blinding, escrow_id, oracle_pk)
///
/// This is more efficient to verify in a ZK circuit than Blake2.
pub fn vote_commitment(
    score: pallas::Base,
    blinding: pallas::Base,
    escrow_id: pallas::Base,
    oracle_pk: pallas::Base,
) -> pallas::Base {
    hash_four(score, blinding, escrow_id, oracle_pk)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ff::Field;
    use rand::rngs::OsRng;

    #[test]
    fn test_hash_two_deterministic() {
        let a = pallas::Base::from(42u64);
        let b = pallas::Base::from(123u64);

        let h1 = hash_two(a, b);
        let h2 = hash_two(a, b);

        assert_eq!(h1, h2, "Same inputs should produce same hash");
    }

    #[test]
    fn test_hash_two_different_inputs() {
        let a = pallas::Base::from(42u64);
        let b = pallas::Base::from(123u64);
        let c = pallas::Base::from(456u64);

        let h1 = hash_two(a, b);
        let h2 = hash_two(a, c);

        assert_ne!(h1, h2, "Different inputs should produce different hashes");
    }

    #[test]
    fn test_vote_commitment() {
        let score = pallas::Base::from(75u64);
        let blinding = pallas::Base::random(OsRng);
        let escrow_id = pallas::Base::from(12345u64);
        let oracle_pk = pallas::Base::random(OsRng);

        let commitment = vote_commitment(score, blinding, escrow_id, oracle_pk);

        // Verify same inputs give same commitment
        let commitment2 = vote_commitment(score, blinding, escrow_id, oracle_pk);
        assert_eq!(commitment, commitment2);

        // Different score gives different commitment
        let different_score = pallas::Base::from(76u64);
        let commitment3 = vote_commitment(different_score, blinding, escrow_id, oracle_pk);
        assert_ne!(commitment, commitment3);
    }

    #[test]
    fn test_commitment_hiding() {
        // Same score with different blinding should give different commitments
        let score = pallas::Base::from(50u64);
        let blinding1 = pallas::Base::from(111u64);
        let blinding2 = pallas::Base::from(222u64);
        let escrow_id = pallas::Base::from(1u64);
        let oracle_pk = pallas::Base::from(2u64);

        let c1 = vote_commitment(score, blinding1, escrow_id, oracle_pk);
        let c2 = vote_commitment(score, blinding2, escrow_id, oracle_pk);

        assert_ne!(c1, c2, "Different blinding should hide the score");
    }
}
