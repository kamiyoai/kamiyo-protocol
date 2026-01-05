//! Utility functions for Mitama ZK

use ff::PrimeField;
use pasta_curves::pallas;

/// Convert a byte array to a field element using proper modular reduction
///
/// This performs modular reduction instead of truncation to avoid losing entropy.
/// The input bytes are interpreted as a little-endian integer and reduced modulo
/// the field modulus.
pub fn bytes_to_field(bytes: &[u8; 32]) -> pallas::Base {
    // First try direct conversion - this works if bytes < modulus
    // Note: from_repr expects little-endian bytes
    if let Some(field) = pallas::Base::from_repr(*bytes).into() {
        return field;
    }

    // If direct conversion fails (bytes >= modulus), we need modular reduction
    // The Pallas field modulus is approximately 2^254.8, so any 256-bit value
    // might exceed it.
    //
    // Strategy: Interpret bytes as little-endian, split into low 128 bits and high 128 bits,
    // then compute: low + high * 2^128 (mod p)

    // Extract low and high 128-bit parts (little-endian layout)
    let mut low_bytes = [0u8; 16];
    let mut high_bytes = [0u8; 16];
    low_bytes.copy_from_slice(&bytes[0..16]);
    high_bytes.copy_from_slice(&bytes[16..32]);

    // Convert to u128 (little-endian)
    let low = u128::from_le_bytes(low_bytes);
    let high = u128::from_le_bytes(high_bytes);

    // Convert to field elements
    let low_field = pallas::Base::from_u128(low);
    let high_field = pallas::Base::from_u128(high);

    // 2^128 as a field element
    let two_128 = pallas::Base::from_u128(1u128 << 64).square();

    // Compute: low + high * 2^128 (mod p)
    low_field + high_field * two_128
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
    fn test_bytes_roundtrip_small() {
        // Small values should roundtrip exactly
        let mut original = [0u8; 32];
        original[31] = 42;
        let field = bytes_to_field(&original);
        let recovered = field_to_bytes(&field);
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_bytes_to_field_valid_repr() {
        // Bytes that are valid field representations should convert directly
        let small = [1u8; 32];
        let field = bytes_to_field(&small);
        assert_ne!(field, pallas::Base::zero());
    }

    #[test]
    fn test_bytes_to_field_large_value() {
        // Test with all 0xFF bytes - this exceeds the modulus
        // and should be properly reduced
        let large = [0xFFu8; 32];
        let field = bytes_to_field(&large);
        // Should not be zero after reduction
        assert_ne!(field, pallas::Base::zero());
    }

    #[test]
    fn test_bytes_to_field_deterministic() {
        // Same input should always give same output
        let bytes = [0xABu8; 32];
        let field1 = bytes_to_field(&bytes);
        let field2 = bytes_to_field(&bytes);
        assert_eq!(field1, field2);
    }

    #[test]
    fn test_score_conversion() {
        for score in 0..=100u8 {
            let field = score_to_field(score);
            assert_eq!(field, pallas::Base::from(score as u64));
        }
    }
}
