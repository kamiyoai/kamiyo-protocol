# mitama-zk

**Trustless commitment phase** for Mitama oracle voting using **[Zcash's Halo2](https://github.com/zcash/halo2)**.

## Role in Two-Phase ZK Architecture

```
COMMIT PHASE (this crate)        SETTLE PHASE (circuits/)
────────────────────────         ────────────────────────
Zcash Halo2                      Groth16 on Solana
No trusted setup                 Native alt_bn128 syscalls
Poseidon commitments             On-chain verification
```

Oracles commit votes using Halo2 (no ceremony needed). Settlement uses Groth16 for on-chain finality. See [`circuits/`](../../circuits/) for the settlement phase.

## Why Halo2 for Commitments?

| Feature | Benefit |
|---------|---------|
| **No trusted setup** | Oracles don't trust a ceremony to hide votes |
| Poseidon hash | ZK-friendly, collision-resistant |
| Lookup tables | Efficient [0-100] range validation |
| Production-ready | Powers Zcash mainnet |

## Acknowledgments

Built on research from the **Electric Coin Company**:

- **[Halo2](https://github.com/zcash/halo2)** - PLONK-based proving system
- **[Halo Paper](https://eprint.iacr.org/2019/1021)** - Sean Bowe, Jack Grigg, Daira Hopwood

## Use Cases

### 1. Private Oracle Voting

Oracles commit to quality scores without revealing them:

```rust
use mitama_zk::{OracleVoteCircuit, VoteCommitment};

// Oracle commits to score privately
let score = 75u8;
let blinding = generate_blinding();
let commitment = VoteCommitment::new(score, &blinding, escrow_id, oracle_pk);

// Publish commitment (hides score)
submit_commitment_onchain(commitment)?;

// Later: reveal with ZK proof
let circuit = OracleVoteCircuit::new(score, blinding, commitment.hash);
let proof = prove(&circuit)?;
```

### 2. Range Proofs

Prove a score is valid without revealing it:

```rust
// Prove: 0 <= score <= 100
// Reveals: nothing about the actual score
let proof = range_proof(score, blinding)?;
```

### 3. Merkle Membership (Coming Soon)

Prove oracle registration without revealing identity:

```rust
// Prove: oracle is in registry
// Reveals: nothing about which oracle
let proof = merkle_membership_proof(oracle_pk, merkle_path)?;
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Mitama ZK                            │
├─────────────────────────────────────────────────────────┤
│  Circuits                                               │
│  ├── OracleVoteCircuit  - Commit-reveal voting          │
│  ├── RangeCheckConfig   - [0-100] validation            │
│  └── MerkleCircuit      - Registry membership (todo)    │
├─────────────────────────────────────────────────────────┤
│  Zcash Halo2                                            │
│  ├── halo2_proofs       - Core proving system           │
│  ├── halo2_gadgets      - Reusable components           │
│  └── pasta_curves       - Pallas/Vesta curves           │
└─────────────────────────────────────────────────────────┘
```

## Installation

```toml
[dependencies]
mitama-zk = { git = "https://github.com/kamiyo-ai/mitama", path = "crates/mitama-zk" }
```

## Development

```bash
# Run tests
cargo test -p mitama-zk

# Run benchmarks
cargo bench -p mitama-zk

# Check with clippy
cargo clippy -p mitama-zk
```

## References

- [The halo2 Book](https://zcash.github.io/halo2/) - Official documentation
- [Halo2 GitHub](https://github.com/zcash/halo2) - Source code
- [Halo Paper](https://eprint.iacr.org/2019/1021) - Original research
- [PLONKish Arithmetization](https://zcash.github.io/halo2/concepts/arithmetization.html) - Circuit design

## License

MIT - See [LICENSE](LICENSE)

---

Built with [Zcash Halo2](https://github.com/zcash/halo2) | [KAMIYO](https://kamiyo.ai)
