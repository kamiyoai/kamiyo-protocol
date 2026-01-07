use anchor_lang::prelude::*;
use solana_program::alt_bn128::prelude::*;
use crate::error::NoirError;

/// Groth16 proof structure for BN254 curve
#[derive(Clone)]
pub struct Groth16Proof {
    pub a: [u8; 64],  // G1 point
    pub b: [u8; 128], // G2 point
    pub c: [u8; 64],  // G1 point
}

impl Groth16Proof {
    pub fn deserialize(data: &[u8]) -> Result<Self> {
        if data.len() < 256 {
            return Err(NoirError::InvalidProofLength.into());
        }

        let mut a = [0u8; 64];
        let mut b = [0u8; 128];
        let mut c = [0u8; 64];

        a.copy_from_slice(&data[0..64]);
        b.copy_from_slice(&data[64..192]);
        c.copy_from_slice(&data[192..256]);

        Ok(Self { a, b, c })
    }
}

/// Verification key structure
#[derive(Clone)]
pub struct Groth16VerificationKey {
    pub alpha: [u8; 64],      // G1
    pub beta: [u8; 128],      // G2
    pub gamma: [u8; 128],     // G2
    pub delta: [u8; 128],     // G2
    pub gamma_abc: Vec<[u8; 64]>, // G1 points for public inputs
}

impl Groth16VerificationKey {
    pub fn deserialize(data: &[u8]) -> Result<Self> {
        if data.len() < 448 {
            return Err(NoirError::InvalidVkLength.into());
        }

        let mut alpha = [0u8; 64];
        let mut beta = [0u8; 128];
        let mut gamma = [0u8; 128];
        let mut delta = [0u8; 128];

        alpha.copy_from_slice(&data[0..64]);
        beta.copy_from_slice(&data[64..192]);
        gamma.copy_from_slice(&data[192..320]);
        delta.copy_from_slice(&data[320..448]);

        // Parse gamma_abc points
        let num_inputs = (data.len() - 448) / 64;
        let mut gamma_abc = Vec::with_capacity(num_inputs);

        for i in 0..num_inputs {
            let start = 448 + i * 64;
            let mut point = [0u8; 64];
            point.copy_from_slice(&data[start..start + 64]);
            gamma_abc.push(point);
        }

        Ok(Self { alpha, beta, gamma, delta, gamma_abc })
    }
}

/// Verify a Groth16 proof using Solana's alt_bn128 syscalls
pub fn verify_groth16_proof(
    vk_data: &[u8],
    proof: &Groth16Proof,
    public_inputs: &[[u8; 32]],
) -> Result<()> {
    let vk = Groth16VerificationKey::deserialize(vk_data)?;

    // Compute vk_x = gamma_abc[0] + sum(public_inputs[i] * gamma_abc[i+1])
    let mut vk_x = vk.gamma_abc[0];

    for (i, input) in public_inputs.iter().enumerate() {
        if i + 1 >= vk.gamma_abc.len() {
            return Err(NoirError::InputCountMismatch.into());
        }

        // Scalar multiplication: input * gamma_abc[i+1]
        let scalar_mul_result = alt_bn128_multiplication(&[
            &vk.gamma_abc[i + 1][..],
            &input[..],
        ].concat())?;

        // Point addition: vk_x + result
        let add_result = alt_bn128_addition(&[
            &vk_x[..],
            &scalar_mul_result[..],
        ].concat())?;

        vk_x.copy_from_slice(&add_result);
    }

    // Construct pairing input:
    // e(A, B) = e(alpha, beta) * e(vk_x, gamma) * e(C, delta)
    //
    // Equivalently check:
    // e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) = 1
    //
    // Negate A for the pairing check
    let neg_a = negate_g1(&proof.a)?;

    let pairing_input = [
        &neg_a[..],           // -A (G1)
        &proof.b[..],         // B (G2)
        &vk.alpha[..],        // alpha (G1)
        &vk.beta[..],         // beta (G2)
        &vk_x[..],            // vk_x (G1)
        &vk.gamma[..],        // gamma (G2)
        &proof.c[..],         // C (G1)
        &vk.delta[..],        // delta (G2)
    ].concat();

    let result = alt_bn128_pairing(&pairing_input)?;

    // Pairing result should be 1 (true) for valid proof
    if result[31] != 1 || result[0..31].iter().any(|&b| b != 0) {
        return Err(NoirError::ProofVerificationFailed.into());
    }

    Ok(())
}

/// Negate a G1 point (negate the y-coordinate in the field)
fn negate_g1(point: &[u8; 64]) -> Result<[u8; 64]> {
    // BN254 field modulus
    const FIELD_MODULUS: [u8; 32] = [
        0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
        0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
        0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d,
        0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
    ];

    let mut result = *point;

    // y_neg = p - y (field subtraction)
    let y = &point[32..64];
    let mut y_neg = [0u8; 32];
    let mut borrow = 0u16;

    for i in (0..32).rev() {
        let diff = (FIELD_MODULUS[i] as u16) - (y[i] as u16) - borrow;
        y_neg[i] = diff as u8;
        borrow = if diff > 255 { 1 } else { 0 };
    }

    result[32..64].copy_from_slice(&y_neg);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proof_deserialization() {
        let data = vec![0u8; 256];
        let proof = Groth16Proof::deserialize(&data).unwrap();
        assert_eq!(proof.a.len(), 64);
        assert_eq!(proof.b.len(), 128);
        assert_eq!(proof.c.len(), 64);
    }

    #[test]
    fn test_vk_deserialization() {
        let data = vec![0u8; 448 + 128]; // VK + 2 gamma_abc points
        let vk = Groth16VerificationKey::deserialize(&data).unwrap();
        assert_eq!(vk.gamma_abc.len(), 2);
    }
}
