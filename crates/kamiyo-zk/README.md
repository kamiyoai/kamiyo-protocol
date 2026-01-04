# kamiyo-zk

Commit-reveal voting for Kamiyo oracle consensus.

## Architecture

```
COMMIT                          REVEAL
──────                          ──────
Halo2 (no trusted setup)        Groth16 (on-chain)
Poseidon commitment             alt_bn128 syscalls
```

Oracles commit votes with Halo2 (no ceremony). Settlement uses Groth16 for on-chain verification.

## Usage

```rust
use kamiyo_zk::{OracleVoteProver, VoteCommitment};

// Setup (once)
let prover = OracleVoteProver::setup()?;

// Commit
let commitment = prover.commit(score, &blinding, escrow_id, oracle_pk)?;

// Prove
let proof = prover.prove(score, &blinding, &commitment)?;

// Verify
assert!(prover.verify(&proof, &commitment)?);
```

## Modules

| Module | Purpose |
|--------|---------|
| `prover` | Halo2 prove/verify API |
| `commitment` | Poseidon commitment scheme |
| `bridge` | Halo2 to Circom/Groth16 conversion |
| `circuits` | PLONKish constraint system |

## Development

```bash
cargo test -p kamiyo-zk
cargo clippy -p kamiyo-zk
```

## References

- [halo2](https://github.com/zcash/halo2)
- [groth16-solana](https://github.com/Lightprotocol/groth16-solana)
- [circom](https://github.com/iden3/circom)
