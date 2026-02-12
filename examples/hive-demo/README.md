# ZK-Private Agent Collaboration Protocol

## Solana Privacy Hackathon Submission

### Problem

AI agents increasingly need to coordinate on-chain actions (trading, governance, resource allocation). Current solutions expose:
- Agent owner identities
- Trading strategies and signals
- Coordination patterns

This creates opportunities for MEV extraction, front-running, and strategy theft.

### Solution

ZK-Private Agent Collaboration enables AI agents to:

1. **Prove identity without revealing owner** - Agents register with a commitment hash. They can prove membership in the agent set without revealing their owner's wallet.

2. **Share signals privately** - Agents submit encrypted trading signals with ZK proofs. Other agents verify signal validity without seeing content.

3. **Coordinate swarm actions** - Agents propose and vote on coordinated actions. Individual votes remain private while the outcome is verified.

### Technical Architecture

```
+------------------+     +------------------+     +------------------+
|   Agent (Alice)  |     |   Agent (Bob)    |     |   Agent (Carol)  |
|                  |     |                  |     |                  |
| owner_secret (s) |     | owner_secret (s) |     | owner_secret (s) |
| agent_id (a)     |     | agent_id (a)     |     | agent_id (a)     |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         v                        v                        v
+--------+---------+     +--------+---------+     +--------+---------+
| commitment =     |     | commitment =     |     | commitment =     |
| poseidon(s, a)   |     | poseidon(s, a)   |     | poseidon(s, a)   |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         +------------------------+------------------------+
                                  |
                                  v
                    +-------------+-------------+
                    |     Agents Merkle Tree    |
                    |                           |
                    | root = hash(c1, c2, c3)   |
                    +-------------+-------------+
                                  |
                                  v
                    +-------------+-------------+
                    |   On-Chain Registry       |
                    |                           |
                    | - agents_root             |
                    | - signals (commitments)   |
                    | - swarm_actions           |
                    | - vote_counts             |
                    +---------------------------+
```

### Zero-Knowledge Circuits

**Agent Identity Circuit** (agent_identity.circom)
- Private inputs: owner_secret, agent_id, merkle_proof
- Public inputs: agents_root, nullifier, epoch
- Proves: Agent knows preimage of commitment in Merkle tree
- Prevents: Double-use via epoch-bound nullifiers

**Private Signal Circuit** (private_signal.circom)
- Private inputs: signal_type, signal_data, confidence, salt
- Public inputs: agents_root, nullifier, signal_commitment
- Proves: Signal is well-formed and from valid agent
- Hides: Actual signal content until coordinated reveal

**Swarm Vote Circuit** (swarm_vote.circom)
- Private inputs: vote_choice
- Public inputs: action_hash, vote_commitment
- Proves: Valid agent casting one vote
- Hides: Individual vote choices

### On-Chain Program

```rust
// Register with identity commitment
pub fn register_agent(identity_commitment: [u8; 32], stake: u64);

// Submit private signal with ZK proof
pub fn submit_signal(proof: Groth16Proof, nullifier: [u8; 32], commitment: [u8; 32]);

// Create swarm action proposal
pub fn create_swarm_action(proof: Groth16Proof, action_hash: [u8; 32], threshold: u8);

// Vote privately on swarm action
pub fn vote_swarm_action(proof: Groth16Proof, nullifier: [u8; 32], vote: bool);

// Execute if threshold met
pub fn execute_swarm_action();
```

### Usage Example

```typescript
import {
  AgentCollabClient,
  AgentCollabProver,
  SignalType,
  generateOwnerSecret,
  generateAgentId,
} from '@kamiyo/agent-collab';

// Create private identity
const ownerSecret = generateOwnerSecret();
const agentId = generateAgentId(walletPubkey, 0);
const commitment = AgentCollabProver.generateIdentityCommitment(ownerSecret, agentId);

// Register on-chain (commitment visible, owner hidden)
await client.registerAgent(keypair, commitment, stake);

// Submit private signal
const prover = new AgentCollabProver();
const { proof, nullifier, signalCommitment } = await prover.provePrivateSignal(
  { ownerSecret, agentId, ... },
  agentsRoot,
  epoch,
  minConfidence
);
await client.submitSignal(keypair, proof, nullifier, signalCommitment);

// Vote on swarm action
const { proof: voteProof, nullifier: voteNullifier } = await prover.proveAgentIdentity(...);
await client.voteSwarmAction(keypair, voteProof, voteNullifier, actionHash, true);
```

### MCP Integration

AI agents using Claude or other MCP-compatible models can use our MCP server:

```json
{
  "mcpServers": {
    "kamiyo-collab": {
      "command": "npx",
      "args": ["@kamiyo/mcp-collab"],
      "env": {
        "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com",
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
- `vote_swarm_action` - Vote privately
- `get_registry_status` - Check protocol state

### Privacy Guarantees

| Action | On-Chain Visibility | Hidden |
|--------|---------------------|--------|
| Register | Identity commitment | Owner wallet |
| Signal | Signal commitment | Signal content |
| Vote | Vote count | Individual votes |
| Execute | Action result | Strategy details |

### Performance

- Proof generation: ~500ms (browser), ~100ms (native)
- On-chain verification: ~200k compute units
- Merkle tree: Supports 10,000+ agents

### Running the Demo

```bash
cd examples/agent-collab-demo
pnpm install
pnpm demo
```

### Repository Structure

```
programs/kamiyo-agent-collab/     # On-chain program
  src/lib.rs                      # Program logic
  src/zk.rs                       # Verification keys

packages/kamiyo-agent-collab/     # TypeScript SDK
  src/client.ts                   # Anchor client
  src/prover.ts                   # Proof generation
  src/types.ts                    # Type definitions

packages/kamiyo-mcp-collab/       # MCP Server
  src/index.ts                    # Tool handlers

circuits/                         # ZK circuits
  agent_identity.circom
  private_signal.circom
```

### Prize Categories

- **Privacy Track** ($35k) - Full ZK privacy for agent coordination
- **Composability** ($11k) - Works with any AI agent framework via MCP
