# @kamiyo/kamiyo-mitama-prover

Groth16 ZK proof generation for KAMIYO Mitama circuits.

## Installation

```bash
pnpm add @kamiyo/kamiyo-mitama-prover
```

Requires circuit files in `circuits/build/mitama/` or set `MITAMA_CIRCUITS_PATH`.

## Usage

### Agent Identity Proof

Prove membership in agent registry without revealing identity.

```typescript
import { proveAgentIdentity, AgentIdentityInput } from '@kamiyo/kamiyo-mitama-prover';

const input: AgentIdentityInput = {
  agentsRoot: merkleRoot,
  ownerSecret: 123456n,
  agentId: 789012n,
  registrationSecret: 345678n,
  merkleProof: { path: [...], indices: [...] },
  epoch: 100n,
};

const { proof, publicInputs, nullifier } = await proveAgentIdentity(input);
// proof: { a: number[], b: number[], c: number[] }
// nullifier: prevents double-action per epoch
```

### Private Signal Proof

Prove signal validity without revealing content.

```typescript
import { provePrivateSignal, PrivateSignalInput } from '@kamiyo/kamiyo-mitama-prover';

const input: PrivateSignalInput = {
  signalType: 1,        // 0-3: sentiment, technical, on-chain, news
  direction: 1,         // 0: short, 1: long, 2: neutral
  confidence: 75,       // 0-100
  magnitude: 50,        // 0-100
  stakeAmount: 100000000n,
  secret: randomBigint,
  agentNullifier: nullifier,
  minStake: 0n,
  minConfidence: 0,
};

const { proof, signalCommitment } = await provePrivateSignal(input);
```

### Swarm Vote Proof

Cast anonymous vote on swarm proposal.

```typescript
import { proveSwarmVote, SwarmVoteInput } from '@kamiyo/kamiyo-mitama-prover';

const input: SwarmVoteInput = {
  agentsRoot: merkleRoot,
  ownerSecret: 123456n,
  agentId: 789012n,
  registrationSecret: 345678n,
  merkleProof: { path: [...], indices: [...] },
  actionHash: proposalHash,
  vote: 1,              // 0: no, 1: yes
  voteSalt: randomBigint,
};

const { proof, voteNullifier, voteCommitment } = await proveSwarmVote(input);
```

### Verification

```typescript
import { verifyPrivateSignalProof } from '@kamiyo/kamiyo-mitama-prover';

const valid = await verifyPrivateSignalProof(proof, publicInputs);
```

### Poseidon Hash

```typescript
import { computePoseidonHash } from '@kamiyo/kamiyo-mitama-prover';

const hash = await computePoseidonHash([input1, input2, input3]);
```

## Circuit Files

The prover looks for circuit files in this order:

1. `MITAMA_CIRCUITS_PATH` environment variable
2. `../../../circuits/build/mitama` (development)
3. `../../../../circuits/build/mitama` (built package)
4. `./circuits/build/mitama` (workspace root)

Required files per circuit:
- `{circuit}_js/{circuit}.wasm` - Witness generator
- `{circuit}_final.zkey` - Proving key
- `{circuit}_vk.json` - Verification key

## Error Handling

```typescript
import { ProverError } from '@kamiyo/kamiyo-mitama-prover';

try {
  await provePrivateSignal(input);
} catch (err) {
  if (err instanceof ProverError) {
    console.log(err.code); // INVALID_CONFIDENCE, CIRCUIT_NOT_FOUND, etc.
  }
}
```

Error codes:
- `INVALID_SIGNAL_TYPE` - signalType not 0-3
- `INVALID_DIRECTION` - direction not 0-2
- `INVALID_CONFIDENCE` - confidence not 0-100
- `INVALID_MAGNITUDE` - magnitude not 0-100
- `INSUFFICIENT_STAKE` - stakeAmount < minStake
- `INSUFFICIENT_CONFIDENCE` - confidence < minConfidence
- `INVALID_VOTE` - vote not 0 or 1
- `INVALID_MERKLE_PATH` - path length != 20
- `CIRCUIT_NOT_FOUND` - wasm/zkey missing
- `VK_NOT_FOUND` - verification key missing

## License

MIT
