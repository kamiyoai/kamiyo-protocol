# Security Considerations for Mitama ZK

This document outlines security properties, threat models, and audit considerations for the Mitama ZK implementation.

## Cryptographic Foundations

### Halo2 (Zcash)
- **Proof System**: PLONK with IPA commitment scheme
- **Curves**: Pasta curves (Pallas/Vesta)
- **Security Level**: 128-bit
- **Trusted Setup**: None required

### Circom/Groth16
- **Proof System**: Groth16 (pairing-based)
- **Curve**: BN254 (alt_bn128)
- **Security Level**: ~100-bit (conservative estimate due to TNFS)
- **Trusted Setup**: Required per circuit

## Security Properties

### Commitment Scheme

| Property | Description | Implementation |
|----------|-------------|----------------|
| **Hiding** | Score is hidden until reveal | Blinding factor in Poseidon hash |
| **Binding** | Cannot change vote after commit | Collision-resistant Poseidon |
| **Non-malleability** | Cannot forge commitments | Includes escrow_id and oracle_pk |

### Range Proofs

| Property | Description | Implementation |
|----------|-------------|----------------|
| **Completeness** | Valid scores always prove | Lookup table [0, 100] |
| **Soundness** | Invalid scores always fail | Lookup + bit decomposition |
| **Zero-knowledge** | Score value hidden | Only proves membership |

## Threat Model

### Malicious Oracle
- **Attack**: Submit invalid score (>100)
- **Mitigation**: Lookup table enforces [0, 100]
- **Verified by**: `test_invalid_score_*` tests

### Commitment Forgery
- **Attack**: Create valid commitment without knowing score
- **Mitigation**: Poseidon preimage resistance
- **Assumption**: Poseidon is collision-resistant

### Front-running
- **Attack**: Copy another oracle's vote
- **Mitigation**: Blinding factor + 5-minute reveal delay
- **On-chain**: ORACLE_REVEAL_DELAY constant

### Vote Manipulation
- **Attack**: Change vote after commitment
- **Mitigation**: Binding property of commitment
- **Verified by**: `test_commitment_verify` test

## Input Validation

### Halo2 Circuit
```rust
// Score validation
pub fn try_new(score: u8, ...) -> Option<Self> {
    if score > MAX_SCORE {
        return None;
    }
    Some(Self::new(...))
}
```

### Circom Circuit
```circom
// Range check with bit decomposition
component bits = Num2Bits(8);
bits.in <== score;
value === reconstructed;  // Explicit verification

// Upper bound check
component leq = LessEqThan(8);
leq.in[0] <== score;
leq.in[1] <== 100;
leq.out === 1;
```

## Audit Checklist

### Halo2 (crates/mitama-zk)
- [x] All witness values constrained
- [x] Lookup table correctly loaded
- [x] Public inputs properly exposed
- [x] No under-constrained signals
- [x] Range check covers all valid scores
- [x] Edge cases tested (0, 100, 101, 255)

### Circom (circuits/)
- [x] All signals constrained
- [x] Bit decomposition verified
- [x] Commitment uses all inputs
- [x] Range check enforced
- [x] No division by zero
- [x] No arithmetic overflow

## Known Limitations

1. **Groth16 Trusted Setup**: Circuit changes require new ceremony
2. **BN254 Security**: Conservative 100-bit estimate
3. **Poseidon Parameters**: Using P128Pow5T3 from halo2_gadgets
4. **Off-chain Proofs**: Halo2 proofs verified off-chain only

## Recommendations

1. **Production Deployment**
   - Use established Powers of Tau (Hermez/Zcash)
   - Run additional security audit
   - Enable multicore proving for performance

2. **Operational Security**
   - Secure blinding factor generation
   - Rate-limit proof submissions
   - Monitor for replay attacks

3. **Future Improvements**
   - Batch verification for gas savings
   - Recursive proofs for aggregation
   - On-chain Halo2 verification (pending syscalls)

## References

- [Halo2 Book](https://zcash.github.io/halo2/)
- [Groth16 Paper](https://eprint.iacr.org/2016/260)
- [Poseidon Paper](https://eprint.iacr.org/2019/458)
- [BN254 Security](https://eprint.iacr.org/2017/334)

## Contact

Security issues: security@kamiyo.ai
