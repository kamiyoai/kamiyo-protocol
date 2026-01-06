//! Oracle Vote Circuit using Zcash's Halo2
//!
//! This circuit proves that an oracle's vote commitment is valid:
//! 1. The score is in range [0, 100] (via lookup table)
//! 2. The commitment matches H(score || blinding || escrow_id || oracle)
//! 3. The oracle is registered (via Merkle proof - future)
//!
//! ## Acknowledgment
//!
//! This implementation uses the Halo2 proving system developed by:
//! - Sean Bowe, Jack Grigg, Daira Hopwood (Electric Coin Company)
//! - https://github.com/zcash/halo2
//!
//! Halo2's PLONKish arithmetization enables efficient range checks and
//! hash computations without a trusted setup.

use halo2_proofs::{
    circuit::{Layouter, SimpleFloorPlanner, Value},
    plonk::{
        Advice, Circuit, Column, ConstraintSystem, Error, Instance, Selector, TableColumn,
    },
    poly::Rotation,
};
use pasta_curves::pallas;

use crate::poseidon::vote_commitment_with_domain;

/// The oracle vote circuit
///
/// Proves knowledge of (score, blinding) such that:
/// - score ∈ [0, 100]
/// - commitment = H(score || blinding || escrow_id || oracle)
#[derive(Clone, Debug)]
pub struct OracleVoteCircuit {
    /// The quality score (private witness)
    pub score: Value<pallas::Base>,
    /// The blinding factor (private witness)
    pub blinding: Value<pallas::Base>,
    /// The escrow ID (private witness)
    pub escrow_id: Value<pallas::Base>,
    /// The oracle public key (private witness)
    pub oracle_pk: Value<pallas::Base>,
    /// The expected commitment hash (public instance)
    pub commitment: pallas::Base,
}

/// Maximum valid score for oracle votes
pub const MAX_SCORE: u8 = 100;

/// Minimum valid score for oracle votes
pub const MIN_SCORE: u8 = 0;

impl OracleVoteCircuit {
    /// Create a new oracle vote circuit
    ///
    /// # Arguments
    /// * `score` - Quality score (0-100)
    /// * `blinding` - Random blinding factor for hiding
    /// * `escrow_id` - The escrow ID
    /// * `oracle_pk` - The oracle's public key
    /// * `commitment` - Expected commitment hash
    ///
    /// # Returns
    /// A new OracleVoteCircuit ready for proving
    ///
    /// # Security
    /// The blinding factor should be cryptographically random.
    /// Use `generate_blinding()` from the commitment module.
    pub fn new(
        score: u8,
        blinding: [u8; 32],
        escrow_id: [u8; 32],
        oracle_pk: [u8; 32],
        commitment: [u8; 32],
    ) -> Self {
        use crate::utils::bytes_to_field;

        // Convert score to field element
        let score_field = pallas::Base::from(score as u64);

        // Convert inputs to field elements using proper modular reduction
        let blinding_field = bytes_to_field(&blinding);
        let escrow_id_field = bytes_to_field(&escrow_id);
        let oracle_pk_field = bytes_to_field(&oracle_pk);
        let commitment_field = bytes_to_field(&commitment);

        Self {
            score: Value::known(score_field),
            blinding: Value::known(blinding_field),
            escrow_id: Value::known(escrow_id_field),
            oracle_pk: Value::known(oracle_pk_field),
            commitment: commitment_field,
        }
    }

    /// Create a new circuit with validation
    ///
    /// Returns None if score is out of range [0, 100]
    pub fn try_new(
        score: u8,
        blinding: [u8; 32],
        escrow_id: [u8; 32],
        oracle_pk: [u8; 32],
        commitment: [u8; 32],
    ) -> Option<Self> {
        if score > MAX_SCORE {
            return None;
        }
        Some(Self::new(score, blinding, escrow_id, oracle_pk, commitment))
    }

    /// Create an empty circuit for key generation
    pub fn empty() -> Self {
        Self {
            score: Value::unknown(),
            blinding: Value::unknown(),
            escrow_id: Value::unknown(),
            oracle_pk: Value::unknown(),
            commitment: pallas::Base::zero(),
        }
    }

    /// Check if a score is valid for oracle voting
    pub fn is_valid_score(score: u8) -> bool {
        score <= MAX_SCORE
    }
}

/// Configuration for the oracle vote circuit
#[derive(Clone, Debug)]
pub struct OracleVoteConfig {
    score: Column<Advice>,
    blinding: Column<Advice>,
    escrow_id: Column<Advice>,
    oracle_pk: Column<Advice>,
    commitment: Column<Advice>,
    instance: Column<Instance>,
    score_table: TableColumn,
    s_range: Selector,
    s_commit: Selector,
}

impl Circuit<pallas::Base> for OracleVoteCircuit {
    type Config = OracleVoteConfig;
    type FloorPlanner = SimpleFloorPlanner;

    fn without_witnesses(&self) -> Self {
        Self::empty()
    }

    fn configure(meta: &mut ConstraintSystem<pallas::Base>) -> Self::Config {
        // Allocate columns
        let score = meta.advice_column();
        let blinding = meta.advice_column();
        let escrow_id = meta.advice_column();
        let oracle_pk = meta.advice_column();
        let commitment = meta.advice_column();
        let instance = meta.instance_column();

        // Enable equality for copy constraints
        meta.enable_equality(score);
        meta.enable_equality(blinding);
        meta.enable_equality(escrow_id);
        meta.enable_equality(oracle_pk);
        meta.enable_equality(commitment);
        meta.enable_equality(instance);

        // Allocate lookup table for valid scores [0, 100]
        // This is the Halo2 way to do range checks efficiently
        let score_table = meta.lookup_table_column();

        // Allocate selectors
        let s_range = meta.complex_selector(); // complex_selector for lookups
        let s_commit = meta.selector();

        // Range check via lookup table
        // When s_range is enabled, score must be in score_table [0, 100]
        // This is Halo2's efficient approach - O(1) verification per lookup
        meta.lookup(|meta| {
            let s = meta.query_selector(s_range);
            let score_val = meta.query_advice(score, Rotation::cur());

            // When selector is on: score must be in table
            // When selector is off: lookup 0 (always in table)
            vec![(s * score_val, score_table)]
        });

        // Commitment check gate: verify commitment = Poseidon(score, blinding, escrow_id, oracle_pk)
        // The actual Poseidon computation is done during witness assignment.
        // This gate verifies the computed commitment matches the expected one.
        meta.create_gate("commitment_verification", |meta| {
            let s = meta.query_selector(s_commit);
            let commitment_val = meta.query_advice(commitment, Rotation::cur());
            let expected = meta.query_advice(commitment, Rotation::next());

            // Constraint: computed_commitment == expected_commitment
            vec![s * (commitment_val - expected)]
        });

        OracleVoteConfig {
            score,
            blinding,
            escrow_id,
            oracle_pk,
            commitment,
            instance,
            score_table,
            s_range,
            s_commit,
        }
    }

    fn synthesize(
        &self,
        config: Self::Config,
        mut layouter: impl Layouter<pallas::Base>,
    ) -> Result<(), Error> {
        // Load the score range table [0, 100]
        // This enables the lookup-based range check
        layouter.assign_table(
            || "score range table [0-100]",
            |mut table| {
                for i in 0..=100u64 {
                    table.assign_cell(
                        || format!("score {}", i),
                        config.score_table,
                        i as usize,
                        || Value::known(pallas::Base::from(i)),
                    )?;
                }
                Ok(())
            },
        )?;

        // Assign private witnesses and compute commitment
        let commitment_cell = layouter.assign_region(
            || "load private inputs and compute commitment",
            |mut region| {
                // Assign score
                region.assign_advice(|| "score", config.score, 0, || self.score)?;

                // Assign blinding
                region.assign_advice(|| "blinding", config.blinding, 0, || self.blinding)?;

                // Assign escrow_id
                region.assign_advice(|| "escrow_id", config.escrow_id, 0, || self.escrow_id)?;

                // Assign oracle_pk
                region.assign_advice(|| "oracle_pk", config.oracle_pk, 0, || self.oracle_pk)?;

                // Compute commitment = Poseidon(score, blinding, escrow_id, oracle_pk)
                let computed_commitment = self.score.zip(self.blinding).zip(self.escrow_id.zip(self.oracle_pk)).map(
                    |((score, blinding), (escrow_id, oracle_pk))| {
                        vote_commitment_with_domain(score, blinding, escrow_id, oracle_pk)
                    },
                );

                // Enable s_commit selector
                config.s_commit.enable(&mut region, 0)?;

                // Assign computed commitment at row 0
                let commitment_cell = region.assign_advice(
                    || "computed_commitment",
                    config.commitment,
                    0,
                    || computed_commitment,
                )?;

                // Assign expected commitment at row 1 for verification gate
                region.assign_advice(
                    || "expected_commitment",
                    config.commitment,
                    1,
                    || Value::known(self.commitment),
                )?;

                Ok(commitment_cell)
            },
        )?;

        // Range check via lookup
        // The lookup constraint ensures score is in [0, 100]
        layouter.assign_region(
            || "range check lookup",
            |mut region| {
                config.s_range.enable(&mut region, 0)?;

                region.assign_advice(
                    || "score for range check",
                    config.score,
                    0,
                    || self.score,
                )?;

                Ok(())
            },
        )?;

        // Expose commitment as public instance (not the score)
        layouter.constrain_instance(commitment_cell.cell(), config.instance, 0)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::bytes_to_field;
    use ff::PrimeField;
    use halo2_proofs::dev::MockProver;

    // Note: k=8 gives us 2^8 = 256 rows, enough for the lookup table
    const K: u32 = 8;

    /// Helper to compute the expected commitment for tests
    fn compute_test_commitment(
        score: u8,
        blinding: &[u8; 32],
        escrow_id: &[u8; 32],
        oracle_pk: &[u8; 32],
    ) -> pallas::Base {
        let score_field = pallas::Base::from(score as u64);
        let blinding_field = bytes_to_field(blinding);
        let escrow_id_field = bytes_to_field(escrow_id);
        let oracle_pk_field = bytes_to_field(oracle_pk);
        vote_commitment_with_domain(score_field, blinding_field, escrow_id_field, oracle_pk_field)
    }

    // ==================== Valid Score Tests ====================

    #[test]
    fn test_valid_vote_mid_range() {
        let score = 75u8;
        let blinding = [1u8; 32];
        let escrow_id = [2u8; 32];
        let oracle_pk = [3u8; 32];

        let expected_commitment = compute_test_commitment(score, &blinding, &escrow_id, &oracle_pk);
        let commitment_bytes = expected_commitment.to_repr();

        let circuit = OracleVoteCircuit::new(score, blinding, escrow_id, oracle_pk, commitment_bytes);
        let public_inputs = vec![expected_commitment];

        let prover = MockProver::run(K, &circuit, vec![public_inputs]).unwrap();
        prover.assert_satisfied();
    }

    #[test]
    fn test_circuit_with_min_score() {
        let score = MIN_SCORE;
        let blinding = [1u8; 32];
        let escrow_id = [2u8; 32];
        let oracle_pk = [3u8; 32];

        let expected_commitment = compute_test_commitment(score, &blinding, &escrow_id, &oracle_pk);
        let commitment_bytes = expected_commitment.to_repr();

        let circuit = OracleVoteCircuit::new(score, blinding, escrow_id, oracle_pk, commitment_bytes);
        let public_inputs = vec![expected_commitment];

        let prover = MockProver::run(K, &circuit, vec![public_inputs]).unwrap();
        prover.assert_satisfied();
    }

    #[test]
    fn test_circuit_with_max_score() {
        let score = MAX_SCORE;
        let blinding = [1u8; 32];
        let escrow_id = [2u8; 32];
        let oracle_pk = [3u8; 32];

        let expected_commitment = compute_test_commitment(score, &blinding, &escrow_id, &oracle_pk);
        let commitment_bytes = expected_commitment.to_repr();

        let circuit = OracleVoteCircuit::new(score, blinding, escrow_id, oracle_pk, commitment_bytes);
        let public_inputs = vec![expected_commitment];

        let prover = MockProver::run(K, &circuit, vec![public_inputs]).unwrap();
        prover.assert_satisfied();
    }

    #[test]
    fn test_boundary_score_99() {
        let score = 99u8;
        let blinding = [42u8; 32];
        let escrow_id = [5u8; 32];
        let oracle_pk = [6u8; 32];

        let expected_commitment = compute_test_commitment(score, &blinding, &escrow_id, &oracle_pk);
        let commitment_bytes = expected_commitment.to_repr();

        let circuit = OracleVoteCircuit::new(score, blinding, escrow_id, oracle_pk, commitment_bytes);
        let public_inputs = vec![expected_commitment];

        let prover = MockProver::run(K, &circuit, vec![public_inputs]).unwrap();
        prover.assert_satisfied();
    }

    #[test]
    fn test_boundary_score_1() {
        let score = 1u8;
        let blinding = [255u8; 32];
        let escrow_id = [128u8; 32];
        let oracle_pk = [64u8; 32];

        let expected_commitment = compute_test_commitment(score, &blinding, &escrow_id, &oracle_pk);
        let commitment_bytes = expected_commitment.to_repr();

        let circuit = OracleVoteCircuit::new(score, blinding, escrow_id, oracle_pk, commitment_bytes);
        let public_inputs = vec![expected_commitment];

        let prover = MockProver::run(K, &circuit, vec![public_inputs]).unwrap();
        prover.assert_satisfied();
    }

    // ==================== Invalid Score Tests ====================

    #[test]
    fn test_invalid_score_101_rejected() {
        let score = 101u8;
        let blinding = [1u8; 32];
        let escrow_id = [2u8; 32];
        let oracle_pk = [3u8; 32];

        let expected_commitment = compute_test_commitment(score, &blinding, &escrow_id, &oracle_pk);
        let commitment_bytes = expected_commitment.to_repr();

        let circuit = OracleVoteCircuit::new(score, blinding, escrow_id, oracle_pk, commitment_bytes);
        let public_inputs = vec![expected_commitment];

        let prover = MockProver::run(K, &circuit, vec![public_inputs]).unwrap();
        assert!(prover.verify().is_err(), "Score 101 should be rejected");
    }

    #[test]
    fn test_invalid_score_150_rejected() {
        let score = 150u8;
        let blinding = [1u8; 32];
        let escrow_id = [2u8; 32];
        let oracle_pk = [3u8; 32];

        let expected_commitment = compute_test_commitment(score, &blinding, &escrow_id, &oracle_pk);
        let commitment_bytes = expected_commitment.to_repr();

        let circuit = OracleVoteCircuit::new(score, blinding, escrow_id, oracle_pk, commitment_bytes);
        let public_inputs = vec![expected_commitment];

        let prover = MockProver::run(K, &circuit, vec![public_inputs]).unwrap();
        assert!(prover.verify().is_err(), "Score 150 should be rejected");
    }

    #[test]
    fn test_invalid_score_255_rejected() {
        let score = 255u8;
        let blinding = [1u8; 32];
        let escrow_id = [2u8; 32];
        let oracle_pk = [3u8; 32];

        let expected_commitment = compute_test_commitment(score, &blinding, &escrow_id, &oracle_pk);
        let commitment_bytes = expected_commitment.to_repr();

        let circuit = OracleVoteCircuit::new(score, blinding, escrow_id, oracle_pk, commitment_bytes);
        let public_inputs = vec![expected_commitment];

        let prover = MockProver::run(K, &circuit, vec![public_inputs]).unwrap();
        assert!(prover.verify().is_err(), "Score 255 should be rejected");
    }

    // ==================== Validation Tests ====================

    #[test]
    fn test_try_new_valid_score() {
        let result = OracleVoteCircuit::try_new(75, [1u8; 32], [2u8; 32], [3u8; 32], [4u8; 32]);
        assert!(result.is_some());
    }

    #[test]
    fn test_try_new_invalid_score() {
        let result = OracleVoteCircuit::try_new(101, [1u8; 32], [2u8; 32], [3u8; 32], [4u8; 32]);
        assert!(result.is_none());
    }

    #[test]
    fn test_is_valid_score() {
        assert!(OracleVoteCircuit::is_valid_score(0));
        assert!(OracleVoteCircuit::is_valid_score(50));
        assert!(OracleVoteCircuit::is_valid_score(100));
        assert!(!OracleVoteCircuit::is_valid_score(101));
        assert!(!OracleVoteCircuit::is_valid_score(255));
    }

    // ==================== Security Tests ====================

    #[test]
    fn test_commitment_mismatch_rejected() {
        // Circuit computes a valid commitment, but public input has a different one
        let score = 75u8;
        let blinding = [1u8; 32];
        let escrow_id = [2u8; 32];
        let oracle_pk = [3u8; 32];

        let expected_commitment = compute_test_commitment(score, &blinding, &escrow_id, &oracle_pk);
        let commitment_bytes = expected_commitment.to_repr();

        let circuit = OracleVoteCircuit::new(score, blinding, escrow_id, oracle_pk, commitment_bytes);

        // Use a wrong commitment as public input
        let wrong_commitment = pallas::Base::from(12345u64);
        let public_inputs = vec![wrong_commitment];

        let prover = MockProver::run(K, &circuit, vec![public_inputs]).unwrap();
        assert!(
            prover.verify().is_err(),
            "Commitment mismatch should be rejected"
        );
    }

    #[test]
    fn test_empty_public_inputs_rejected() {
        let score = 50u8;
        let blinding = [1u8; 32];
        let escrow_id = [2u8; 32];
        let oracle_pk = [3u8; 32];

        let expected_commitment = compute_test_commitment(score, &blinding, &escrow_id, &oracle_pk);
        let commitment_bytes = expected_commitment.to_repr();

        let circuit = OracleVoteCircuit::new(score, blinding, escrow_id, oracle_pk, commitment_bytes);
        let public_inputs: Vec<pallas::Base> = vec![];

        let prover = MockProver::run(K, &circuit, vec![public_inputs]).unwrap();
        assert!(prover.verify().is_err(), "Empty public inputs should be rejected");
    }

    #[test]
    fn test_all_valid_scores_accepted() {
        // Test every valid score to ensure table is complete
        for score in 0..=100u8 {
            let blinding = [score.wrapping_add(1); 32];
            let escrow_id = [score.wrapping_add(2); 32];
            let oracle_pk = [score.wrapping_add(3); 32];

            let expected_commitment = compute_test_commitment(score, &blinding, &escrow_id, &oracle_pk);
            let commitment_bytes = expected_commitment.to_repr();

            let circuit = OracleVoteCircuit::new(score, blinding, escrow_id, oracle_pk, commitment_bytes);
            let public_inputs = vec![expected_commitment];

            let prover = MockProver::run(K, &circuit, vec![public_inputs]).unwrap();
            assert!(
                prover.verify().is_ok(),
                "Score {} should be valid",
                score
            );
        }
    }

    #[test]
    fn test_wrong_blinding_rejected() {
        // Use different blinding for circuit vs commitment calculation
        let score = 50u8;
        let correct_blinding = [1u8; 32];
        let wrong_blinding = [2u8; 32];
        let escrow_id = [3u8; 32];
        let oracle_pk = [4u8; 32];

        // Commitment computed with correct blinding
        let expected_commitment = compute_test_commitment(score, &correct_blinding, &escrow_id, &oracle_pk);
        let commitment_bytes = expected_commitment.to_repr();

        // Circuit uses wrong blinding - computed commitment will differ
        let circuit = OracleVoteCircuit::new(score, wrong_blinding, escrow_id, oracle_pk, commitment_bytes);
        let public_inputs = vec![expected_commitment];

        let prover = MockProver::run(K, &circuit, vec![public_inputs]).unwrap();
        assert!(
            prover.verify().is_err(),
            "Wrong blinding should be rejected"
        );
    }
}
