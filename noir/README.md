# Kamiyo Noir Circuits

ZK circuits using [Noir](https://noir-lang.org/) with Solana verification via [Sunspot](https://github.com/Sunspot-xyz/sunspot).

## Circuits

| Circuit | Purpose |
|---------|---------|
| `oracle-vote` | Proves score in [0,100] and commitment validity |
| `smt-exclusion` | Proves oracle is NOT in blacklist (256-bit SMT) |

## Requirements

- Nargo >= 1.0.0-beta.13
- Sunspot (Go 1.24+)
- Node.js >= 18

## Setup

```bash
noirup --version 1.0.0-beta.13
go install github.com/Sunspot-xyz/sunspot@latest
cd lib && npm install
```

## Build

```bash
just compile-all    # Noir circuits
just build-lib      # TypeScript
just setup-all      # Proving keys
```

## Usage

```typescript
import { OracleVoteProver, SparseMerkleTree, SolanaVerifier } from '@kamiyo/noir';

const prover = new OracleVoteProver();
const proof = await prover.generateProof({
  score: 85,
  blinding: prover.generateBlinding(),
  escrowId: BigInt('0x...'),
  oraclePk: BigInt('0x...')
});

const verifier = new SolanaVerifier({ connection, verifierProgramId, payer });
await verifier.verifyOracleVote(prover.formatForSolana(proof), escrowAccount, oracleAccount);
```

## Deploy

```bash
just build-verifiers
just deploy-devnet oracle-vote ~/.config/solana/id.json
```

Based on [solana-foundation/noir-examples](https://github.com/solana-foundation/noir-examples).
