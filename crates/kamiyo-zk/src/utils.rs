//! Utility functions for Mitama ZK

use ff::PrimeField;
use pasta_curves::pallas;

/// Convert a byte array to a field element
pub fn bytes_to_field(bytes: &[u8; 32]) -> pallas::Base {
    // Take first 31 bytes to ensure value is less than field modulus
    let mut repr = [0u8; 32];
    repr[..31].copy_from_slice(&bytes[..31]);
    pallas::Base::from_repr(repr).unwrap_or(pallas::Base::zero())
}

/// Convert a field element to bytes
pub fn field_to_bytes(field: &pallas::Base) -> [u8; 32] {
    field.to_repr()
}

/// Convert a u8 score to a field element
pub fn score_to_field(score: u8) -> pallas::Base {
    pallas::Base::from(score as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bytes_roundtrip() {
        let original = [42u8; 32];
        let field = bytes_to_field(&original);
        let recovered = field_to_bytes(&field);

        // First 31 bytes should match
        assert_eq!(&original[..31], &recovered[..31]);
    }

    #[test]
    fn test_score_conversion() {
        for score in 0..=100u8 {
            let field = score_to_field(score);
            assert_eq!(field, pallas::Base::from(score as u64));
        }
    }
}
