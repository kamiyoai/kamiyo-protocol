# Kamiyo Noir Integration

Production ZK infrastructure for Solana using [Noir](https://noir-lang.org/) and [Sunspot](https://github.com/Sunspot-xyz/sunspot).

## What This Is

Four production circuits powering privacy-preserving dispute resolution:

| Circuit | Purpose | On-chain Cost |
|---------|---------|---------------|
| `oracle-vote` | Private vote commitment with range proof | ~200k CU |
| `smt-exclusion` | Prove oracle not blacklisted | ~150k CU |
| `aggregate-vote` | Batch 16 votes into 1 proof | ~250k CU (vs 3.2M) |
| `reputation-proof` | Prove reputation threshold without revealing score | ~200k CU |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DISPUTE RESOLUTION                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│  │   Oracle 1   │     │   Oracle 2   │     │   Oracle N   │        │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘        │
│         │                    │                    │                 │
│         ▼                    ▼                    ▼                 │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │              SMT EXCLUSION PROOFS                        │       │
│  │         (verify oracles not blacklisted)                 │       │
│  └─────────────────────────────────────────────────────────┘       │
│                              │                                      │
│         ┌────────────────────┼────────────────────┐                │
│         ▼                    ▼                    ▼                 │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐         │
│  │ Commit Vote │      │ Commit Vote │      │ Commit Vote │         │
│  │ H(score,b)  │      │ H(score,b)  │      │ H(score,b)  │         │
│  └──────┬──────┘      └──────┬──────┘      └──────┬──────┘         │
│         │                    │                    │                 │
│         │    5 min delay     │                    │                 │
│         │    (prevents       │                    │                 │
│         │     copying)       │                    │                 │
│         ▼                    ▼                    ▼                 │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │                ORACLE VOTE ZK PROOFS                     │       │
│  │    prove: score ∈ [0,100] ∧ commitment valid             │       │
│  └─────────────────────────────────────────────────────────┘       │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │              AGGREGATE VOTE PROOF                        │       │
│  │         batch N proofs → 1 verification                  │       │
│  │              O(N) → O(1) on-chain                        │       │
│  └─────────────────────────────────────────────────────────┘       │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │                    SETTLEMENT                            │       │
│  │              median(scores) → split %                    │       │
│  └─────────────────────────────────────────────────────────┘       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Solana Program

On-chain Groth16 verifier using `alt_bn128` syscalls:

```rust
// programs/noir-verifier/src/lib.rs

pub fn verify_oracle_vote(
    ctx: Context<VerifyProof>,
    proof_data: Vec<u8>,
    public_inputs: OracleVotePublicInputs,
) -> Result<()> {
    let proof = Groth16Proof::deserialize(&proof_data)?;
    verify_groth16_proof(&vk.vk_data, &proof, &inputs)?;

    emit!(OracleVoteVerified {
        escrow_id: public_inputs.escrow_id,
        oracle: public_inputs.oracle_pk,
        commitment: public_inputs.commitment,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
```

## Circuits

### Oracle Vote

```noir
fn main(
    score: u8,              // private
    blinding: Field,        // private
    escrow_id: pub Field,
    oracle_pk: pub Field,
    expected_commitment: pub Field
) {
    assert(score <= 100);
    let computed = Poseidon2::hash([score as Field, blinding, escrow_id, oracle_pk], 4);
    assert(computed == expected_commitment);
}
```

### Aggregate Vote

Batches up to 16 oracle votes into a single proof:

```noir
fn main(
    scores: [u8; 16],           // private
    blindings: [Field; 16],     // private
    oracle_pks: [Field; 16],    // private
    num_votes: u8,
    escrow_id: pub Field,
    votes_root: pub Field,      // Merkle root of commitments
    expected_sum: pub u64,
    expected_count: pub u8
) {
    // Verify all votes, compute aggregate
    for i in 0..16 {
        if (i as u8) < num_votes {
            assert(scores[i] <= 100);
            // ... verify commitment
        }
    }
    assert(sum == expected_sum);
    assert(computed_root == votes_root);
}
```

### Reputation Proof

Prove reputation meets threshold without revealing exact score:

```noir
fn main(
    successful_agreements: u64,  // private
    total_agreements: u64,       // private
    disputes_won: u64,           // private
    disputes_lost: u64,          // private
    blinding: Field,
    agent_pk: pub Field,
    reputation_commitment: pub Field,
    threshold: pub u64
) {
    let success_rate = (successful_agreements * 100) / total_agreements;
    assert(success_rate >= threshold);
    // ... verify commitment
}
```

## TypeScript SDK

```typescript
import { OracleVoteProver, SparseMerkleTree, SolanaVerifier } from '@kamiyo/noir';

// Generate vote proof
const prover = new OracleVoteProver();
const proof = await prover.generateProof({
  score: 85,
  blinding: prover.generateBlinding(),
  escrowId: BigInt('0x...'),
  oraclePk: BigInt('0x...')
});

// Verify on-chain
const verifier = new SolanaVerifier({ connection, verifierProgramId, payer });
const result = await verifier.verifyOracleVote(
  prover.formatForSolana(proof),
  escrowAccount,
  oracleAccount
);

// Blacklist check
const blacklist = new SparseMerkleTree();
const exclusionProof = await new SmtExclusionProver()
  .generateProof(blacklist.createExclusionInput(oraclePk));
```

## Gas Comparison

| Operation | Without ZK | With Noir ZK |
|-----------|------------|--------------|
| Single vote verification | 200k CU | 200k CU |
| 16 vote verifications | 3.2M CU | 250k CU |
| Blacklist check (1000 oracles) | 500k CU | 150k CU |
| Reputation threshold check | 100k CU | 200k CU |

Aggregate proofs provide **12x gas reduction** for batch operations.

## Build

```bash
# Install deps
noirup --version 1.0.0-beta.13
go install github.com/Sunspot-xyz/sunspot@latest

# Compile
just compile-all

# Test
just test-all

# Deploy
anchor build -p noir-verifier
anchor deploy -p noir-verifier --provider.cluster devnet
```

## Security

- Poseidon2 hash (algebraic, ZK-friendly)
- BN254 curve (Ethereum-compatible)
- Groth16 proofs (~256 bytes)
- 128-bit security level
- No trusted setup required (Sunspot handles ceremony)

## Use Cases Beyond Dispute Resolution

- **Private voting**: DAO governance with hidden votes until tally
- **Credential verification**: Prove KYC without revealing documents
- **Sealed-bid auctions**: Commit-reveal bidding with ZK proofs
- **Credit scoring**: Prove creditworthy without revealing income

Based on [solana-foundation/noir-examples](https://github.com/solana-foundation/noir-examples).
