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

use ff::PrimeField;
use halo2_gadgets::poseidon::primitives::{self as poseidon, ConstantLength, P128Pow5T3};
use pasta_curves::pallas;

/// Domain separator for oracle vote commitments
/// Used to prevent cross-protocol attacks by ensuring hashes are unique to this application
pub const VOTE_DOMAIN: &str = "kamiyo:vote";

/// Hash rate for our Poseidon configuration
pub const RATE: usize = 2;

/// Compute a domain separator field element from the VOTE_DOMAIN string
/// This is used to prefix all vote commitment hashes for domain separation
fn domain_separator() -> pallas::Base {
    // Hash the domain string to get a field element
    // We use a simple approach: take the first 31 bytes of the domain string
    // padded with zeros, then convert to a field element
    let mut domain_bytes = [0u8; 32];
    let domain_str = VOTE_DOMAIN.as_bytes();
    let len = std::cmp::min(domain_str.len(), 31);
    domain_bytes[..len].copy_from_slice(&domain_str[..len]);

    // This is a small value, so direct conversion works
    pallas::Base::from_repr(domain_bytes).unwrap_or_else(|| {
        // Fallback: use a hash of the domain bytes
        pallas::Base::from(
            u64::from_le_bytes(domain_bytes[0..8].try_into().unwrap_or([0u8; 8]))
        )
    })
}

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

/// Create a vote commitment using Poseidon (without domain separation)
///
/// commitment = Poseidon(score, blinding, escrow_id, oracle_pk)
///
/// This is more efficient to verify in a ZK circuit than Blake2.
/// Note: Prefer `vote_commitment_with_domain` for production use.
pub fn vote_commitment(
    score: pallas::Base,
    blinding: pallas::Base,
    escrow_id: pallas::Base,
    oracle_pk: pallas::Base,
) -> pallas::Base {
    hash_four(score, blinding, escrow_id, oracle_pk)
}

/// Create a vote commitment using Poseidon with domain separation
///
/// commitment = Poseidon(domain, Poseidon(score, blinding, escrow_id, oracle_pk))
///
/// The domain separator prevents cross-protocol attacks by ensuring that
/// a valid commitment in one context cannot be reused in another.
pub fn vote_commitment_with_domain(
    score: pallas::Base,
    blinding: pallas::Base,
    escrow_id: pallas::Base,
    oracle_pk: pallas::Base,
) -> pallas::Base {
    let domain = domain_separator();
    let inner = hash_four(score, blinding, escrow_id, oracle_pk);
    hash_two(domain, inner)
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

    #[test]
    fn test_domain_separator_deterministic() {
        let d1 = domain_separator();
        let d2 = domain_separator();
        assert_eq!(d1, d2, "Domain separator should be deterministic");
    }

    #[test]
    fn test_vote_commitment_with_domain() {
        let score = pallas::Base::from(75u64);
        let blinding = pallas::Base::from(12345u64);
        let escrow_id = pallas::Base::from(67890u64);
        let oracle_pk = pallas::Base::from(11111u64);

        let commitment = vote_commitment_with_domain(score, blinding, escrow_id, oracle_pk);

        // Verify same inputs give same commitment
        let commitment2 = vote_commitment_with_domain(score, blinding, escrow_id, oracle_pk);
        assert_eq!(commitment, commitment2);
    }

    #[test]
    fn test_domain_separation_differs_from_non_domain() {
        let score = pallas::Base::from(75u64);
        let blinding = pallas::Base::from(12345u64);
        let escrow_id = pallas::Base::from(67890u64);
        let oracle_pk = pallas::Base::from(11111u64);

        let with_domain = vote_commitment_with_domain(score, blinding, escrow_id, oracle_pk);
        let without_domain = vote_commitment(score, blinding, escrow_id, oracle_pk);

        assert_ne!(
            with_domain, without_domain,
            "Domain-separated commitment should differ from non-domain"
        );
    }
}
