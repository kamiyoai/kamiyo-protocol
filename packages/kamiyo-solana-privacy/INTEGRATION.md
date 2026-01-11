# ZK Reputation Proofs

Groth16 on BN254. Prove `score >= threshold` without revealing score.

## Usage

```typescript
import { buildPoseidon } from 'circomlibjs';
import * as snarkjs from 'snarkjs';

const poseidon = await buildPoseidon();
const secret = crypto.getRandomValues(new Uint8Array(31));
const secretBn = BigInt('0x' + Buffer.from(secret).toString('hex'));
const commitment = poseidon.F.toObject(poseidon([BigInt(score), secretBn]));

const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  { score, secret: secretBn.toString(), threshold, commitment: commitment.toString() },
  'build/reputation_threshold_js/reputation_threshold.wasm',
  'build/reputation_threshold_final.zkey'
);

const vkey = JSON.parse(fs.readFileSync('build/verification_key.json'));
const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
```

## Circuit

```
inputs:  score (private), secret (private), threshold (public), commitment (public)
output:  valid = 1 if score >= threshold
check:   commitment == Poseidon(score, secret)
```

Public signals: `[valid, threshold, commitment]`

## Proof Format

```
proof_a:  64 bytes  (G1)
proof_b: 128 bytes  (G2)
proof_c:  64 bytes  (G1)
signals:  96 bytes  (3 x 32)
total:   352 bytes
```

## On-chain

Solana (~200k CU):
```rust
use kamiyo::zk::{verify_reputation_proof, REPUTATION_VK};
verify_reputation_proof(&proof_a, &proof_b, &proof_c, &public_inputs)?;
```

EVM (~250k gas):
```solidity
mirror.verifyProof(proof, publicInputs);
```

## Build

```bash
cd packages/kamiyo-tetsuo-privacy/circuits && ./build.sh
```
