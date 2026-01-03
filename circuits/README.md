# Mitama Circom Circuits

Groth16 zero-knowledge circuits for on-chain verification on Solana.

## Overview

This directory contains Circom circuits that complement the Halo2 implementation in `crates/mitama-zk`. While Halo2 provides trustless commitments (no ceremony), Circom/Groth16 enables **native on-chain verification** using Solana's `alt_bn128` syscalls.

```
┌────────────────────────────────────────────────────────────────┐
│                    Dual ZK Architecture                         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Halo2 (crates/mitama-zk)     Circom (circuits/)              │
│   ────────────────────────     ───────────────────             │
│   • No trusted setup           • Native Solana verification    │
│   • Commitment hiding          • ~200k compute units           │
│   • Off-chain proofs           • Battle-tested tooling         │
│                                                                 │
│   Use: Privacy guarantees      Use: On-chain finality          │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

## Circuits

### oracle_vote.circom

Proves that an oracle's vote is valid:

1. **Range Check**: Score is in [0, 100]
2. **Commitment**: `Poseidon(score, blinding, escrow_id, oracle_pk)` matches

**Public Inputs:**
- `escrow_id` - The escrow being voted on
- `oracle_pk` - Oracle's public key
- `expected_commitment` - Previously published commitment

**Private Inputs (Witness):**
- `score` - Quality score (hidden)
- `blinding` - Random factor (hidden)

## Setup

### Prerequisites

```bash
# Install circom (Rust)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
git clone https://github.com/iden3/circom.git
cd circom && cargo build --release
sudo cp target/release/circom /usr/local/bin/

# Install snarkjs
npm install -g snarkjs
```

### Build & Setup

```bash
cd circuits
npm install

# Compile circuit + trusted setup (one-time)
npm run setup
```

This will:
1. Compile `oracle_vote.circom` to R1CS + WASM
2. Generate Powers of Tau (phase 1)
3. Generate circuit-specific zkey (phase 2)
4. Export verification key

### Test

```bash
npm test
```

### Export for Solana

```bash
npm run export:solana
```

Generates `build/solana_verifier.rs` for use with [groth16-solana](https://github.com/Lightprotocol/groth16-solana).

## Usage

### Generate Proof (Off-chain)

```javascript
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");

// Compute commitment
const poseidon = await buildPoseidon();
const commitment = poseidon([score, blinding, escrowId, oraclePk]);

// Generate proof
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  {
    escrow_id: escrowId,
    oracle_pk: oraclePk,
    expected_commitment: poseidon.F.toString(commitment),
    score: score,
    blinding: blinding,
  },
  "build/oracle_vote_js/oracle_vote.wasm",
  "build/oracle_vote_final.zkey"
);
```

### Verify On-Chain (Solana)

```rust
use groth16_solana::groth16::Groth16Verifier;

// Include generated verifier
include!("solana_verifier.rs");

// In your instruction handler
pub fn verify_vote(
    ctx: Context<VerifyVote>,
    proof_a: [u8; 64],
    proof_b: [u8; 128],
    proof_c: [u8; 64],
    public_inputs: [[u8; 32]; 4],
) -> Result<()> {
    verify_oracle_vote(&proof_a, &proof_b, &proof_c, &public_inputs)?;
    // Proof is valid!
    Ok(())
}
```

## Trusted Setup

Groth16 requires a trusted setup ceremony. For production:

1. Use existing Powers of Tau (Hermez, Zcash)
2. Or run a multi-party computation ceremony

The setup in this repo is for **development only**.

## Dependencies

- [circom](https://github.com/iden3/circom) - Circuit compiler
- [snarkjs](https://github.com/iden3/snarkjs) - Proof generation
- [circomlib](https://github.com/iden3/circomlib) - Standard library
- [groth16-solana](https://github.com/Lightprotocol/groth16-solana) - Solana verifier

## References

- [Circom Documentation](https://docs.circom.io/)
- [snarkjs Tutorial](https://github.com/iden3/snarkjs)
- [Groth16 Paper](https://eprint.iacr.org/2016/260)
- [Solana alt_bn128](https://www.helius.dev/blog/zero-knowledge-proofs-its-applications-on-solana)

## License

MIT
