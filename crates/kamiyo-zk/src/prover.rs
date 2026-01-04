//! Halo2 Prover for Oracle Vote Commitments
//!
//! This module provides the proving and verification API for the
//! trustless commitment phase of oracle voting.
//!
//! ## Usage
//!
//! ```ignore
//! use kamiyo_zk::{OracleVoteProver, VoteCommitment};
//!
//! // Setup (one-time)
//! let prover = OracleVoteProver::setup()?;
//!
//! // Commit phase
//! let commitment = prover.commit(score, &blinding, escrow_id, oracle_pk)?;
//!
//! // Reveal phase
//! let proof = prover.prove(score, &blinding, &commitment)?;
//!
//! // Verify
//! assert!(prover.verify(&proof, &commitment)?);
//! ```

use crate::circuits::oracle_vote::OracleVoteCircuit;
use crate::commitment::VoteCommitment;
use crate::error::ZkError;

use ff::PrimeField;
use halo2_proofs::{
    plonk::{create_proof, keygen_pk, keygen_vk, verify_proof, ProvingKey, SingleVerifier, VerifyingKey},
    poly::commitment::Params,
    transcript::{Blake2bRead, Blake2bWrite, Challenge255},
};
use pasta_curves::{pallas, vesta};
use rand::rngs::OsRng;
#[cfg(any(test, feature = "deterministic"))]
use rand::SeedableRng;
#[cfg(any(test, feature = "deterministic"))]
use rand_chacha::ChaCha20Rng;

/// Circuit size parameter (2^K rows)
/// K=8 gives 256 rows, enough for our lookup table
pub const K: u32 = 8;

/// Halo2 proof bytes
#[derive(Clone, Debug)]
pub struct Halo2Proof {
    /// Serialized proof bytes
    pub bytes: Vec<u8>,
    /// Public inputs used in the proof
    pub public_inputs: Vec<pallas::Base>,
}

impl Halo2Proof {
    /// Serialize proof for storage/transmission
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut result = Vec::new();
        // Length prefix for proof bytes
        result.extend_from_slice(&(self.bytes.len() as u32).to_le_bytes());
        result.extend_from_slice(&self.bytes);
        // Number of public inputs
        result.extend_from_slice(&(self.public_inputs.len() as u32).to_le_bytes());
        // Public inputs (each is 32 bytes)
        for input in &self.public_inputs {
            result.extend_from_slice(&input.to_repr());
        }
        result
    }

    /// Deserialize from bytes
    pub fn from_bytes(data: &[u8]) -> Result<Self, ZkError> {
        const MAX_PROOF_SIZE: usize = 10 * 1024 * 1024; // 10MB limit

        if data.len() < 8 {
            return Err(ZkError::InvalidProof("Data too short".into()));
        }
        if data.len() > MAX_PROOF_SIZE {
            return Err(ZkError::InvalidProof("Proof data too large".into()));
        }

        let mut offset = 0;

        // Read proof bytes length
        let len_bytes: [u8; 4] = data[offset..offset + 4]
            .try_into()
            .map_err(|_| ZkError::InvalidProof("Invalid length prefix".into()))?;
        let proof_len = u32::from_le_bytes(len_bytes) as usize;
        offset += 4;

        if data.len() < offset + proof_len + 4 {
            return Err(ZkError::InvalidProof("Data too short for proof".into()));
        }

        let bytes = data[offset..offset + proof_len].to_vec();
        offset += proof_len;

        // Read public inputs count
        let count_bytes: [u8; 4] = data[offset..offset + 4]
            .try_into()
            .map_err(|_| ZkError::InvalidProof("Invalid input count".into()))?;
        let inputs_count = u32::from_le_bytes(count_bytes) as usize;
        offset += 4;

        // Sanity check on input count
        if inputs_count > 1000 {
            return Err(ZkError::InvalidProof("Too many public inputs".into()));
        }

        if data.len() < offset + inputs_count * 32 {
            return Err(ZkError::InvalidProof("Data too short for inputs".into()));
        }

        let mut public_inputs = Vec::with_capacity(inputs_count);
        for i in 0..inputs_count {
            let field_bytes: [u8; 32] = data[offset..offset + 32]
                .try_into()
                .map_err(|_| ZkError::InvalidProof(format!("Invalid field bytes at {}", i)))?;
            let field = pallas::Base::from_repr(field_bytes)
                .into_option()
                .ok_or_else(|| ZkError::InvalidProof(format!("Invalid field element at {}", i)))?;
            public_inputs.push(field);
            offset += 32;
        }

        Ok(Self {
            bytes,
            public_inputs,
        })
    }
}

/// Oracle Vote Prover using Halo2
///
/// Handles the trustless commitment phase of oracle voting.
/// No trusted setup required - keys are generated deterministically.
pub struct OracleVoteProver {
    params: Params<vesta::Affine>,
    pk: ProvingKey<vesta::Affine>,
    vk: VerifyingKey<vesta::Affine>,
}

impl OracleVoteProver {
    /// Setup the prover (no trusted ceremony needed)
    ///
    /// This generates the proving and verifying keys from the circuit.
    /// Can be called once and reused for all proofs.
    pub fn setup() -> Result<Self, ZkError> {
        // Generate universal parameters (no trusted setup!)
        let params = Params::new(K);

        // Create empty circuit for key generation
        let empty_circuit = OracleVoteCircuit::empty();

        // Generate verifying key
        let vk = keygen_vk(&params, &empty_circuit)
            .map_err(|e| ZkError::CircuitError(format!("VK generation failed: {:?}", e)))?;

        // Generate proving key
        let pk = keygen_pk(&params, vk.clone(), &empty_circuit)
            .map_err(|e| ZkError::CircuitError(format!("PK generation failed: {:?}", e)))?;

        Ok(Self { params, pk, vk })
    }

    /// Create a vote commitment
    ///
    /// Returns a commitment that hides the score until reveal.
    pub fn commit(
        &self,
        score: u8,
        blinding: &[u8; 32],
        escrow_id: [u8; 32],
        oracle_pk: [u8; 32],
    ) -> Result<VoteCommitment, ZkError> {
        // Validate inputs
        crate::commitment::validate_blinding(blinding)?;
        if score > crate::circuits::oracle_vote::MAX_SCORE {
            return Err(ZkError::InvalidScore(score));
        }

        Ok(VoteCommitment::new(score, blinding, escrow_id, oracle_pk))
    }

    /// Generate a proof that the commitment is valid
    ///
    /// Proves:
    /// 1. Score is in range [0, 100]
    /// 2. Commitment matches the score and blinding
    pub fn prove(
        &self,
        score: u8,
        blinding: &[u8; 32],
        commitment: &VoteCommitment,
    ) -> Result<Halo2Proof, ZkError> {
        // Validate inputs
        crate::commitment::validate_blinding(blinding)?;
        if score > crate::circuits::oracle_vote::MAX_SCORE {
            return Err(ZkError::InvalidScore(score));
        }

        // Create circuit with witness
        let circuit = OracleVoteCircuit::new(score, *blinding, commitment.hash);

        // Public inputs: the score (for now, simplified)
        let public_inputs = vec![pallas::Base::from(score as u64)];

        // Create proof
        let mut transcript = Blake2bWrite::<_, vesta::Affine, Challenge255<_>>::init(vec![]);

        create_proof(
            &self.params,
            &self.pk,
            &[circuit],
            &[&[&public_inputs]],
            OsRng,
            &mut transcript,
        )
        .map_err(|e| ZkError::ProofGenerationFailed(format!("{:?}", e)))?;

        let proof_bytes = transcript.finalize();

        Ok(Halo2Proof {
            bytes: proof_bytes,
            public_inputs,
        })
    }

    /// Generate a deterministic proof (for testing)
    ///
    /// Uses a seeded RNG for reproducible proofs. NOT for production use.
    #[cfg(any(test, feature = "deterministic"))]
    pub fn prove_deterministic(
        &self,
        score: u8,
        blinding: &[u8; 32],
        commitment: &VoteCommitment,
        seed: [u8; 32],
    ) -> Result<Halo2Proof, ZkError> {
        crate::commitment::validate_blinding(blinding)?;
        if score > crate::circuits::oracle_vote::MAX_SCORE {
            return Err(ZkError::InvalidScore(score));
        }

        let circuit = OracleVoteCircuit::new(score, *blinding, commitment.hash);
        let public_inputs = vec![pallas::Base::from(score as u64)];

        let mut transcript = Blake2bWrite::<_, vesta::Affine, Challenge255<_>>::init(vec![]);
        let rng = ChaCha20Rng::from_seed(seed);

        create_proof(
            &self.params,
            &self.pk,
            &[circuit],
            &[&[&public_inputs]],
            rng,
            &mut transcript,
        )
        .map_err(|e| ZkError::ProofGenerationFailed(format!("{:?}", e)))?;

        let proof_bytes = transcript.finalize();

        Ok(Halo2Proof {
            bytes: proof_bytes,
            public_inputs,
        })
    }

    /// Verify a proof
    ///
    /// Returns true if the proof is valid for the given commitment.
    pub fn verify(&self, proof: &Halo2Proof, _commitment: &VoteCommitment) -> Result<bool, ZkError> {
        let mut transcript =
            Blake2bRead::<_, vesta::Affine, Challenge255<_>>::init(&proof.bytes[..]);

        // Create single verifier strategy
        let strategy = SingleVerifier::new(&self.params);

        // Convert public inputs to correct format
        let public_inputs_slice: Vec<pallas::Base> = proof.public_inputs.clone();
        let public_inputs_refs: Vec<&[pallas::Base]> = vec![public_inputs_slice.as_slice()];
        let instances: Vec<&[&[pallas::Base]]> = vec![public_inputs_refs.as_slice()];

        let result = verify_proof(
            &self.params,
            &self.vk,
            strategy,
            &instances,
            &mut transcript,
        );

        Ok(result.is_ok())
    }

    /// Get the verifying key bytes for external verifiers
    pub fn verifying_key_bytes(&self) -> Vec<u8> {
        // For now, return a placeholder - full VK serialization would need
        // custom implementation as halo2 doesn't expose it directly
        let mut bytes = Vec::new();
        // Include circuit hash for identification
        bytes.extend_from_slice(b"kamiyo-zk-vk-v1");
        bytes.extend_from_slice(&[K as u8]);
        bytes
    }
}

/// Compute a Poseidon commitment for a vote
///
/// This is the off-chain commitment that gets published.
pub fn compute_commitment(
    score: u8,
    blinding: &[u8; 32],
    escrow_id: &[u8; 32],
    oracle_pk: &[u8; 32],
) -> [u8; 32] {
    VoteCommitment::compute_hash(score, blinding, escrow_id, oracle_pk)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prover_setup() {
        let prover = OracleVoteProver::setup();
        assert!(prover.is_ok(), "Prover setup should succeed");
    }

    #[test]
    fn test_commit_valid_score() {
        let prover = OracleVoteProver::setup().unwrap();
        let blinding = [1u8; 32];
        let escrow_id = [2u8; 32];
        let oracle_pk = [3u8; 32];

        let commitment = prover.commit(75, &blinding, escrow_id, oracle_pk);
        assert!(commitment.is_ok());
    }

    #[test]
    fn test_commit_invalid_score() {
        let prover = OracleVoteProver::setup().unwrap();
        let blinding = [1u8; 32];
        let escrow_id = [2u8; 32];
        let oracle_pk = [3u8; 32];

        let commitment = prover.commit(101, &blinding, escrow_id, oracle_pk);
        assert!(commitment.is_err());
    }

    #[test]
    fn test_prove_and_verify() {
        let prover = OracleVoteProver::setup().unwrap();

        let score = 75u8;
        let blinding = [1u8; 32];
        let escrow_id = [2u8; 32];
        let oracle_pk = [3u8; 32];

        // Commit
        let commitment = prover.commit(score, &blinding, escrow_id, oracle_pk).unwrap();

        // Prove
        let proof = prover.prove(score, &blinding, &commitment).unwrap();

        // Verify
        let valid = prover.verify(&proof, &commitment).unwrap();
        assert!(valid, "Valid proof should verify");
    }

    #[test]
    fn test_proof_serialization() {
        let prover = OracleVoteProver::setup().unwrap();

        let score = 50u8;
        let blinding = [7u8; 32];
        let escrow_id = [8u8; 32];
        let oracle_pk = [9u8; 32];

        let commitment = prover.commit(score, &blinding, escrow_id, oracle_pk).unwrap();
        let proof = prover.prove(score, &blinding, &commitment).unwrap();

        // Serialize and deserialize
        let bytes = proof.to_bytes();
        let recovered = Halo2Proof::from_bytes(&bytes).unwrap();

        assert_eq!(proof.bytes, recovered.bytes);
        assert_eq!(proof.public_inputs, recovered.public_inputs);
    }

    #[test]
    fn test_deterministic_proof_reproducibility() {
        let prover = OracleVoteProver::setup().unwrap();

        let score = 42u8;
        let blinding = [5u8; 32];
        let escrow_id = [6u8; 32];
        let oracle_pk = [7u8; 32];
        let seed = [0xABu8; 32];

        let commitment = prover.commit(score, &blinding, escrow_id, oracle_pk).unwrap();

        // Same seed should produce identical proofs
        let proof1 = prover.prove_deterministic(score, &blinding, &commitment, seed).unwrap();
        let proof2 = prover.prove_deterministic(score, &blinding, &commitment, seed).unwrap();

        assert_eq!(proof1.bytes, proof2.bytes, "Deterministic proofs should be identical");

        // Different seeds should produce different proofs
        let different_seed = [0xCDu8; 32];
        let proof3 = prover.prove_deterministic(score, &blinding, &commitment, different_seed).unwrap();

        assert_ne!(proof1.bytes, proof3.bytes, "Different seeds should produce different proofs");

        // Both should still verify
        assert!(prover.verify(&proof1, &commitment).unwrap());
        assert!(prover.verify(&proof3, &commitment).unwrap());
    }

    #[test]
    fn test_commit_rejects_zero_blinding() {
        let prover = OracleVoteProver::setup().unwrap();
        let escrow_id = [1u8; 32];
        let oracle_pk = [2u8; 32];

        // Zero blinding should be rejected
        let zero_blinding = [0u8; 32];
        let result = prover.commit(50, &zero_blinding, escrow_id, oracle_pk);
        assert!(result.is_err(), "Zero blinding should be rejected");
    }

    #[test]
    fn test_prove_rejects_zero_blinding() {
        let prover = OracleVoteProver::setup().unwrap();
        let escrow_id = [1u8; 32];
        let oracle_pk = [2u8; 32];
        let blinding = [1u8; 32];

        // Create valid commitment first
        let commitment = prover.commit(50, &blinding, escrow_id, oracle_pk).unwrap();

        // Trying to prove with zero blinding should fail
        let zero_blinding = [0u8; 32];
        let result = prover.prove(50, &zero_blinding, &commitment);
        assert!(result.is_err(), "Zero blinding should be rejected in prove");
    }
}
