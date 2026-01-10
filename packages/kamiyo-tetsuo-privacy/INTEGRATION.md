# ZK Reputation Integration

Prove reputation thresholds without revealing scores. Groth16 on BN254, ~256 byte proofs, 7ms verification.

## Quick Start

```typescript
import { buildPoseidon } from 'circomlibjs';
import * as snarkjs from 'snarkjs';

// 1. Commit to score
const poseidon = await buildPoseidon();
const secret = crypto.getRandomValues(new Uint8Array(31));
const commitment = poseidon.F.toObject(poseidon([BigInt(score), BigInt('0x' + Buffer.from(secret).toString('hex'))]));

// 2. Generate proof
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  { score, secret: secret.toString(), threshold, commitment: commitment.toString() },
  'reputation_threshold.wasm',
  'reputation_threshold_final.zkey'
);

// 3. Verify
const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
```

## Circuit

```circom
template ReputationThreshold() {
    signal input score;           // private
    signal input secret;          // private
    signal input threshold;       // public
    signal input commitment;      // public
    signal output valid;

    valid <== score >= threshold ? 1 : 0;
    commitment === Poseidon(score, secret);
}
```

Public signals: `[valid, threshold, commitment]`

## Wire Format

| Field | Size | Description |
|-------|------|-------------|
| π_A | 64B | G1 point |
| π_B | 128B | G2 point |
| π_C | 64B | G1 point |
| signals | 96B | 3 × 32B public inputs |

Total: 352 bytes

## API Integration

```typescript
// Before TITS API call
const proof = await generateReputationProof(agentScore, threshold);

// Include in request
const response = await fetch('https://tits.tetsuo.ai/v1/generate', {
  method: 'POST',
  headers: {
    'X-Reputation-Proof': Buffer.from(proof).toString('base64'),
    'X-Reputation-Threshold': threshold.toString(),
  },
  body: JSON.stringify({ prompt, model: 'tits-pro-v2' })
});
```

## On-Chain Verification

### Solana

```rust
use groth16_solana::groth16::Groth16Verifier;

Groth16Verifier::verify(
    &proof_a,  // [u8; 64]
    &proof_b,  // [u8; 128]
    &proof_c,  // [u8; 64]
    &public_inputs,
    &REPUTATION_VK,
)?;
```

### EVM (Monad)

```solidity
function verifyReputation(
    uint256[2] calldata a,
    uint256[2][2] calldata b,
    uint256[2] calldata c,
    uint256[3] calldata signals
) external view returns (bool) {
    return verifyProof(Groth16Proof(a, b, c), signals);
}
```

## Build Circuit

```bash
cd packages/kamiyo-tetsuo-privacy/circuits
./build.sh
```

Outputs:
- `build/reputation_threshold.wasm` - WASM witness generator
- `build/reputation_threshold_final.zkey` - Proving key
- `build/verification_key.json` - Verification key

## Performance

| Operation | Time | Compute Units |
|-----------|------|---------------|
| Prove | ~270ms | N/A (off-chain) |
| Verify (JS) | ~7ms | N/A |
| Verify (Solana) | ~2ms | ~200k CU |
| Verify (EVM) | ~1ms | ~250k gas |
