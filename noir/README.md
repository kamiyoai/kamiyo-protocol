# Kamiyo Noir Circuits

Zero-knowledge circuits for Kamiyo Protocol using [Noir](https://noir-lang.org/) with on-chain verification via [Sunspot](https://github.com/Sunspot-xyz/sunspot).

## Circuits

### Oracle Vote (`circuits/oracle-vote`)

Proves an oracle's vote is valid without revealing the score until settlement:

- Score is in range [0, 100]
- Commitment matches `Poseidon2(score, blinding, escrow_id, oracle_pk)`

Used during dispute resolution commit-reveal voting.

### SMT Exclusion (`circuits/smt-exclusion`)

Proves an oracle is NOT blacklisted using a Sparse Merkle Tree:

- Verifies exclusion from 256-bit depth SMT
- Used before accepting oracle votes
- Slashed oracles (3+ violations) are added to blacklist

## Requirements

- [Nargo](https://noir-lang.org/docs/getting_started/installation) >= 1.0.0-beta.13
- [Sunspot](https://github.com/Sunspot-xyz/sunspot) (requires Go 1.24+)
- Node.js >= 18
- [just](https://github.com/casey/just) (optional, for build commands)

## Setup

```bash
# Install Nargo
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup --version 1.0.0-beta.13

# Install Sunspot
go install github.com/Sunspot-xyz/sunspot@latest

# Install TS dependencies
cd lib && npm install
```

## Usage

### Build

```bash
# Compile circuits
just compile-all

# Build TypeScript library
just build-lib

# Or both
just build
```

### Test

```bash
# Test Noir circuits
just test-all

# Test TypeScript library
cd lib && npm test
```

### Generate Proofs

```bash
# Setup proving keys (one time)
just setup-all

# Generate oracle vote proof
just prove-oracle-vote

# Generate SMT exclusion proof
just prove-smt-exclusion
```

### TypeScript Client

```typescript
import { OracleVoteProver, SparseMerkleTree, SolanaVerifier } from '@kamiyo/noir';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';

// Oracle vote proof
const prover = new OracleVoteProver();
const blinding = prover.generateBlinding();

const proof = await prover.generateProof({
  score: 85,
  blinding,
  escrowId: BigInt('0x...'),
  oraclePk: BigInt('0x...')
});

// SMT exclusion proof
const blacklist = new SparseMerkleTree();
// blacklist.insert(badOraclePk); // Add slashed oracles

const exclusionInput = blacklist.createExclusionInput(myOraclePk);
const exclusionProof = await new SmtExclusionProver().generateProof(exclusionInput);

// On-chain verification
const verifier = new SolanaVerifier({
  connection: new Connection('https://api.devnet.solana.com'),
  verifierProgramId: new PublicKey('...'),
  payer: Keypair.generate()
});

const result = await verifier.verifyOracleVote(
  prover.formatForSolana(proof),
  escrowAccount,
  oracleAccount
);
```

## Deployment

```bash
# Build verifier programs
just build-verifiers

# Deploy to devnet
just deploy-devnet oracle-vote ~/.config/solana/id.json
just deploy-devnet smt-exclusion ~/.config/solana/id.json
```

## Architecture

```
noir/
├── circuits/
│   ├── oracle-vote/      # Vote commitment circuit
│   │   ├── Nargo.toml
│   │   └── src/main.nr
│   └── smt-exclusion/    # Blacklist exclusion circuit
│       ├── Nargo.toml
│       └── src/main.nr
├── lib/                  # TypeScript client
│   ├── src/
│   │   ├── oracle-vote.ts
│   │   ├── smt-exclusion.ts
│   │   ├── solana.ts
│   │   └── utils.ts
│   └── package.json
├── justfile              # Build commands
└── README.md
```

## Verification Flow

```
Commit Phase:
  Oracle → commitment = Poseidon2(score, blinding, escrow_id, pk)
         → Submit commitment on-chain

Reveal Phase:
  Oracle → Generate Noir proof (score in [0,100], commitment matches)
         → Submit proof + score on-chain
         → Verifier program validates Groth16 proof
         → Score recorded for settlement
```

## Credits

Based on [solana-foundation/noir-examples](https://github.com/solana-foundation/noir-examples).
