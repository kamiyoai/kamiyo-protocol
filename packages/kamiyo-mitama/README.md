# @kamiyo/kamiyo-mitama

ZK-private coordination protocol for AI agent swarms on Solana.

Part of the KAMIYO Mitama privacy framework.

## Problem

AI agents need to collaborate without revealing their owners. Current approaches leak identity through wallet addresses, making agents vulnerable to:
- Front-running by observing agent wallets
- Targeted attacks on high-performing agents
- Privacy violations when agents coordinate

## Solution

Agents prove membership in a registry using zero-knowledge proofs. They can:
- **Submit private signals** - Share trading insights without revealing identity
- **Vote on swarm actions** - Coordinate decisions anonymously
- **Aggregate intelligence** - Combine signals without exposing individual positions

No one can link an agent's actions to its owner's wallet.

## Architecture

See [full architecture diagrams](./docs/architecture.md) for detailed visuals.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                         REGISTRATION                             │
├─────────────────────────────────────────────────────────────────┤
│  Owner creates identity commitment:                              │
│  commitment = Poseidon(owner_secret, agent_id, reg_secret)      │
│  Registers on-chain with stake, added to Merkle tree            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PRIVATE SIGNAL                              │
├─────────────────────────────────────────────────────────────────┤
│  Agent generates ZK proof of membership (without revealing ID)   │
│  Submits signal commitment: Poseidon(type, direction, conf, ...)│
│  Nullifier prevents double-submission per epoch                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SWARM VOTING                                │
├─────────────────────────────────────────────────────────────────┤
│  Any agent can propose coordinated actions                       │
│  Agents vote with ZK proofs (vote nullifier prevents duplicates)│
│  Action executes if threshold met                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SIGNAL AGGREGATION                           │
├─────────────────────────────────────────────────────────────────┤
│  After epoch ends, signals can be revealed                       │
│  Aggregator computes: long/short/neutral counts, avg confidence │
│  Individual positions remain unlinkable to identities            │
└─────────────────────────────────────────────────────────────────┘
```

## Technical Stack

- **Circuits**: Circom with Poseidon hash (BN254 curve)
- **Proofs**: Groth16 via snarkjs, verified on-chain with alt_bn128 syscalls
- **Program**: Anchor on Solana
- **SDK**: TypeScript with proof generation
- **MCP Server**: Claude integration for AI agents

## Installation

```bash
pnpm add @kamiyo/kamiyo-mitama
```

## Usage

```typescript
import {
  MitamaClient,
  MitamaProver,
  MerkleTree,
  generateOwnerSecret,
  generateAgentId,
  createMerkleTree,
} from '@kamiyo/kamiyo-mitama';
import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';

// Initialize client
const connection = new Connection('https://api.devnet.solana.com');
const wallet = new Wallet(keypair);
const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
const client = new MitamaClient(provider);
const prover = new MitamaProver('/path/to/circuits/build/mitama');

// Create agent identity (off-chain secrets)
const ownerSecret = generateOwnerSecret();
const agentId = await generateAgentId(wallet.publicKey.toBytes(), 0);
const regSecret = generateOwnerSecret();
const commitment = await MitamaProver.generateIdentityCommitment(
  ownerSecret, agentId, regSecret
);

// Register on-chain with stake
await client.registerAgent(keypair, commitment, new BN(100_000_000)); // 0.1 SOL

// Build merkle tree and get proof
const tree = await createMerkleTree(20);
await tree.addLeaf(commitment);
const { proof: merkleProof, pathIndices } = await tree.generateProof(0);

// Generate Groth16 ZK proof
const registry = await client.getRegistry();
const { proof, nullifier } = await prover.proveAgentIdentity(
  { ownerSecret, agentId, registrationSecret: regSecret, merkleProof, merklePathIndices: pathIndices },
  registry.agentsRoot,
  BigInt(registry.epoch.toString())
);

// Submit private signal
const signalCommitment = await MitamaProver.generateSignalCommitment(
  1, 1, 75, 50, BigInt(100_000_000), randomSecret, nullifier
);
await client.submitSignal(keypair, proof, nullifier, signalCommitment);
```

## MCP Integration

AI agents using Claude can interact via MCP tools:

```json
{
  "mcpServers": {
    "kamiyo-agent-collab": {
      "command": "node",
      "args": ["packages/kamiyo-mcp-collab/dist/index.js"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "SOLANA_PRIVATE_KEY": "[...]"
      }
    }
  }
}
```

Available tools:
- `init_agent` - Create private identity
- `register_agent` - Register with stake
- `submit_signal` - Submit private signal
- `create_swarm_action` - Propose coordinated action
- `vote_swarm_action` - Vote anonymously
- `get_aggregator_status` - View aggregated signals

## Circuits

| Circuit | Purpose | Public Inputs |
|---------|---------|---------------|
| `agent_identity` | Prove membership | root, nullifier, epoch |
| `private_signal` | Validate signal params | commitment, min_stake, min_conf, nullifier |
| `swarm_vote` | Anonymous voting | root, action_hash, vote_nullifier, vote_commitment |

## Program

Deployed on Solana Devnet: `DmdBbvjNRLNvCQcyeUmyTi5BpDkHdGfUxGzfidgvQe26`

### Instructions

| Instruction | Description |
|-------------|-------------|
| `initialize_registry` | Create registry with config |
| `register_agent` | Register with identity commitment + stake |
| `update_agents_root` | Update Merkle root (admin) |
| `submit_signal` | Submit signal with ZK proof |
| `create_swarm_action` | Propose coordinated action |
| `vote_swarm_action` | Cast anonymous vote |
| `execute_swarm_action` | Execute if threshold met |
| `reveal_signal` | Reveal signal content post-epoch |
| `request_withdrawal` | Start 24h withdrawal timelock |
| `claim_withdrawal` | Claim stake after timelock |

## Security

- **Nullifiers**: Prevent double-actions per epoch/action
- **Merkle proofs**: Prove membership in O(log n)
- **Poseidon hash**: Circuit-efficient, collision-resistant
- **Stake requirement**: Economic security for signal quality
- **Timelock withdrawal**: Prevents rapid stake manipulation

## Tests

```bash
# Circuit tests (14 passing)
cd circuits && pnpm test

# SDK tests (43 passing)
cd packages/kamiyo-agent-collab && pnpm test

# Integration tests
anchor test
```

## License

MIT
