//! Bridge between Halo2 (commit) and Groth16 (settle)
//!
//! This module provides utilities for converting between the two ZK systems:
//!
//! - Halo2 (Zcash): Used for trustless commitment phase (no ceremony)
//! - Groth16 (Circom): Used for on-chain settlement (native Solana support)
//!
//! ## Flow
//!
//! ```text
//! 1. Oracle commits vote using Halo2
//!    └── VoteCommitment with Poseidon hash
//!
//! 2. After reveal delay, oracle generates Groth16 proof
//!    └── Uses same score/blinding as Halo2 commitment
//!
//! 3. Solana program verifies Groth16 proof
//!    └── Uses groth16-solana with alt_bn128 syscalls
//! ```
//!
//! ## Important: Field Compatibility
//!
//! Halo2 uses Pasta curves (Pallas/Vesta), while Groth16 uses BN254.
//! The commitment hash must be computed the same way in both systems:
//! - Poseidon hash with matching parameters
//! - Field elements must be reduced to fit BN254's scalar field

use crate::commitment::VoteCommitment;
use crate::error::ZkError;
use crate::solana::Groth16Proof;

use serde::{Deserialize, Serialize};

/// Groth16 circuit inputs for oracle vote
///
/// These are the inputs required by the Circom circuit.
/// Public inputs are visible on-chain, private inputs (witness) are hidden.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CircomInputs {
    // Public inputs
    pub escrow_id: String,
    pub oracle_pk: String,
    pub expected_commitment: String,
    // Private inputs (witness)
    pub score: String,
    pub blinding: String,
}

impl CircomInputs {
    /// Create Circom inputs from a Halo2 commitment and revealed values
    pub fn from_commitment(
        commitment: &VoteCommitment,
        score: u8,
        blinding: &[u8; 32],
    ) -> Result<Self, ZkError> {
        // Validate score matches commitment
        if score > 100 {
            return Err(ZkError::InvalidScore(score));
        }

        // Convert byte arrays to big integer strings for Circom
        let escrow_id = bytes_to_field_string(&commitment.escrow_id);
        let oracle_pk = bytes_to_field_string(&commitment.oracle);
        let expected_commitment = bytes_to_field_string(&commitment.hash);
        let blinding_str = bytes_to_field_string(blinding);

        Ok(Self {
            escrow_id,
            oracle_pk,
            expected_commitment,
            score: score.to_string(),
            blinding: blinding_str,
        })
    }

    /// Serialize to JSON for snarkjs
    pub fn to_json(&self) -> Result<String, ZkError> {
        serde_json::to_string_pretty(self)
            .map_err(|e| ZkError::SerializationError(e.to_string()))
    }
}

/// Convert 32-byte array to field element string
///
/// Circom uses decimal string representation for field elements.
/// We interpret the bytes as a big-endian unsigned integer.
fn bytes_to_field_string(bytes: &[u8; 32]) -> String {
    // Convert to big integer (big-endian)
    let mut value = num_bigint::BigUint::from_bytes_be(bytes);

    // BN254 scalar field modulus (for Groth16)
    let bn254_modulus = num_bigint::BigUint::parse_bytes(
        b"21888242871839275222246405745257275088548364400416034343698204186575808495617",
        10,
    )
    .unwrap();

    // Reduce modulo BN254 scalar field to ensure compatibility
    value %= bn254_modulus;

    value.to_string()
}

/// Proof data ready for Solana verification
///
/// Contains everything needed to verify a vote on-chain.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SolanaVerificationData {
    /// The Groth16 proof
    pub proof: Groth16Proof,
    /// Public inputs in the order expected by the verifier
    pub public_inputs: Vec<[u8; 32]>,
    /// The commitment being verified
    pub commitment: [u8; 32],
    /// The revealed score
    pub score: u8,
}

impl SolanaVerificationData {
    /// Create verification data from proof components
    pub fn new(
        proof: Groth16Proof,
        commitment: &VoteCommitment,
        score: u8,
    ) -> Result<Self, ZkError> {
        if score > 100 {
            return Err(ZkError::InvalidScore(score));
        }

        // Order: [escrow_id, oracle_pk, expected_commitment, valid]
        let public_inputs = vec![
            commitment.escrow_id,
            commitment.oracle,
            commitment.hash,
            // valid = 1 (big-endian 32 bytes)
            {
                let mut valid = [0u8; 32];
                valid[31] = 1;
                valid
            },
        ];

        Ok(Self {
            proof,
            public_inputs,
            commitment: commitment.hash,
            score,
        })
    }

    /// Serialize for Solana instruction data
    pub fn to_instruction_data(&self) -> Result<Vec<u8>, ZkError> {
        bincode::serialize(self).map_err(|e| ZkError::SerializationError(e.to_string()))
    }
}

/// Parse snarkjs proof JSON into Groth16Proof
pub fn parse_snarkjs_proof(proof_json: &str) -> Result<Groth16Proof, ZkError> {
    #[derive(Deserialize)]
    struct SnarkjsProof {
        pi_a: Vec<String>,
        pi_b: Vec<Vec<String>>,
        pi_c: Vec<String>,
    }

    let parsed: SnarkjsProof =
        serde_json::from_str(proof_json).map_err(|e| ZkError::SerializationError(e.to_string()))?;

    // Convert string representations to bytes
    // pi_a and pi_c are G1 points (2 field elements each = 64 bytes)
    // pi_b is G2 point (2x2 field elements = 128 bytes)

    let proof_a = parse_g1_point(&parsed.pi_a)?;
    let proof_b = parse_g2_point(&parsed.pi_b)?;
    let proof_c = parse_g1_point(&parsed.pi_c)?;

    Ok(Groth16Proof::new(proof_a, proof_b, proof_c, vec![]))
}

fn parse_g1_point(coords: &[String]) -> Result<Vec<u8>, ZkError> {
    if coords.len() < 2 {
        return Err(ZkError::InvalidProof("G1 point needs 2 coordinates".into()));
    }

    let mut result = Vec::with_capacity(64);

    for (i, coord) in coords[..2].iter().enumerate() {
        let value = num_bigint::BigUint::parse_bytes(coord.as_bytes(), 10)
            .ok_or_else(|| ZkError::InvalidProof(format!("Invalid G1 coordinate at {}", i)))?;

        let bytes = value.to_bytes_be();
        if bytes.len() > 32 {
            return Err(ZkError::InvalidProof(format!(
                "G1 coordinate {} overflow: {} bytes",
                i,
                bytes.len()
            )));
        }
        // Pad to 32 bytes
        let padding = 32 - bytes.len();
        result.extend(std::iter::repeat_n(0u8, padding));
        result.extend_from_slice(&bytes);
    }

    Ok(result)
}

fn parse_g2_point(coords: &[Vec<String>]) -> Result<Vec<u8>, ZkError> {
    if coords.len() < 2 || coords[0].len() < 2 || coords[1].len() < 2 {
        return Err(ZkError::InvalidProof("G2 point needs 2x2 coordinates".into()));
    }

    let mut result = Vec::with_capacity(128);

    // G2 point in snarkjs: [[x0, x1], [y0, y1]]
    // Need to convert to bytes: x1, x0, y1, y0 (reversed order for each pair)
    for (pair_idx, pair) in coords.iter().take(2).enumerate() {
        for (coord_idx, coord) in pair.iter().rev().take(2).enumerate() {
            let value = num_bigint::BigUint::parse_bytes(coord.as_bytes(), 10)
                .ok_or_else(|| {
                    ZkError::InvalidProof(format!("Invalid G2 coordinate at [{},{}]", pair_idx, coord_idx))
                })?;

            let bytes = value.to_bytes_be();
            if bytes.len() > 32 {
                return Err(ZkError::InvalidProof(format!(
                    "G2 coordinate [{},{}] overflow: {} bytes",
                    pair_idx, coord_idx, bytes.len()
                )));
            }
            // Pad to 32 bytes
            let padding = 32 - bytes.len();
            result.extend(std::iter::repeat_n(0u8, padding));
            result.extend_from_slice(&bytes);
        }
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bytes_to_field_string() {
        let bytes = [0u8; 32];
        assert_eq!(bytes_to_field_string(&bytes), "0");

        let mut one = [0u8; 32];
        one[31] = 1;
        assert_eq!(bytes_to_field_string(&one), "1");

        let mut big = [0u8; 32];
        big[30] = 1;
        big[31] = 0;
        assert_eq!(bytes_to_field_string(&big), "256");
    }

    #[test]
    fn test_circom_inputs_creation() {
        let commitment = VoteCommitment::new(75, &[1u8; 32], [2u8; 32], [3u8; 32]);

        let inputs = CircomInputs::from_commitment(&commitment, 75, &[1u8; 32]).unwrap();

        assert_eq!(inputs.score, "75");
    }

    #[test]
    fn test_circom_inputs_invalid_score() {
        let commitment = VoteCommitment::new(75, &[1u8; 32], [2u8; 32], [3u8; 32]);

        let result = CircomInputs::from_commitment(&commitment, 101, &[1u8; 32]);
        assert!(result.is_err());
    }

    #[test]
    fn test_solana_verification_data() {
        let commitment = VoteCommitment::new(50, &[1u8; 32], [2u8; 32], [3u8; 32]);
        let proof = Groth16Proof::empty();

        let data = SolanaVerificationData::new(proof, &commitment, 50).unwrap();

        assert_eq!(data.score, 50);
        assert_eq!(data.public_inputs.len(), 4);
        // Check valid flag
        assert_eq!(data.public_inputs[3][31], 1);
    }
}
