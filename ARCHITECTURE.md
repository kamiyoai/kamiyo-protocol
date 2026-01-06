# Architecture

System design for KAMIYO Protocol.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              KAMIYO Protocol                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   Agent     │    │  Agreement  │    │   Oracle    │    │  Protocol   │  │
│  │  Identity   │    │   Escrow    │    │  Registry   │    │   Config    │  │
│  │    PDA      │    │    PDA      │    │    PDA      │    │    PDA      │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
│         │                  │                  │                  │          │
│         └──────────────────┴──────────────────┴──────────────────┘          │
│                                    │                                         │
│                         Solana Program (Anchor)                              │
│                                    │                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────┐    ┌─────────────────────────────────────┐ │
│  │      ZK Layer (Rust)        │    │        Circom Circuits              │ │
│  │   ────────────────────      │    │   ─────────────────────────         │ │
│  │   Halo2 commitments         │    │   Groth16 on-chain verification     │ │
│  │   Poseidon hash             │    │   alt_bn128 syscalls                │ │
│  │   No trusted setup          │    │   ~200k compute units               │ │
│  └─────────────────────────────┘    └─────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Accounts

### Agent Identity (PDA)

Stake-backed identity for autonomous agents.

```
Seeds: ["agent", owner_pubkey]
```

| Field | Type | Description |
|-------|------|-------------|
| owner | Pubkey | Wallet controlling the agent |
| name | String | Human-readable identifier |
| agent_type | u8 | Trading, API, Service, Custom |
| stake_amount | u64 | Locked SOL collateral |
| reputation | i64 | Trust score (-1000 to 1000) |
| is_active | bool | Can create agreements |
| violation_count | u8 | Slashing counter |

### Agreement Escrow (PDA)

Time-locked payment between agent and provider.

```
Seeds: ["escrow", agent_pubkey, transaction_id]
```

| Field | Type | Description |
|-------|------|-------------|
| agent | Pubkey | Agent PDA address |
| provider | Pubkey | Service provider wallet |
| amount | u64 | Locked funds (lamports or tokens) |
| token_mint | Option<Pubkey> | None = SOL, Some = SPL token |
| status | u8 | Active, Released, Disputed, Resolved |
| created_at | i64 | Unix timestamp |
| expires_at | i64 | Unlock time for provider |
| transaction_id | String | External reference |

### Oracle Registry (PDA)

Manages oracle validators for dispute resolution.

```
Seeds: ["oracle_registry"]
```

| Field | Type | Description |
|-------|------|-------------|
| admin | Pubkey | Registry administrator |
| oracles | Vec<Oracle> | Registered oracles |
| min_stake | u64 | Required oracle stake |
| max_oracles | u8 | Capacity limit |

### Protocol Config (PDA)

Global protocol settings with 2-of-3 multisig control.

```
Seeds: ["protocol_config"]
```

| Field | Type | Description |
|-------|------|-------------|
| authority_1 | Pubkey | First multisig signer |
| authority_2 | Pubkey | Second multisig signer |
| authority_3 | Pubkey | Third multisig signer |
| treasury | Pubkey | Fee collection account |
| is_paused | bool | Emergency stop flag |
| escrow_fee_bps | u16 | Creation fee (default: 10 = 0.1%) |

## State Machine

### Escrow Lifecycle

```
                    ┌──────────────┐
                    │   Created    │
                    │   (Active)   │
                    └──────┬───────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────────┐
    │ Released │    │ Disputed │    │   Expired    │
    │ (100%→P) │    │          │    │ (7d grace)   │
    └──────────┘    └────┬─────┘    └──────┬───────┘
                         │                 │
                         ▼                 │
                  ┌──────────────┐         │
                  │   Oracles    │         │
                  │ Commit/Reveal│         │
                  └──────┬───────┘         │
                         │                 │
                         ▼                 │
                  ┌──────────────┐         │
                  │   Resolved   │◄────────┘
                  │  (0-100%→P)  │  (50/50 if no consensus)
                  └──────────────┘
```

### State Transitions

| From | To | Trigger | Who |
|------|-----|---------|-----|
| Active | Released | `release_funds` | Agent (anytime) or Provider (after timelock) |
| Active | Disputed | `mark_disputed` | Agent only (before expiry) |
| Disputed | Resolved | `finalize_multi_oracle_dispute` | Anyone (permissionless) |
| Active/Disputed | Resolved | `claim_expired_escrow` | Anyone (after 7-day grace) |

## Dispute Resolution

### Multi-Oracle Consensus

```
         Agent                           Provider
           │                                │
           │     1. Creates Agreement       │
           ├───────────────────────────────►│
           │        (funds locked)          │
           │                                │
           │     2. Service Delivered       │
           │◄───────────────────────────────┤
           │                                │
           │  3. Agent disputes quality     │
           ├─────────────┐                  │
                         ▼
           ┌─────────────────────────────────────────────┐
           │              Oracle Network                  │
           ├─────────────────────────────────────────────┤
           │                                              │
           │   Oracle 1      Oracle 2      Oracle 3      │
           │      │             │             │          │
           │      ▼             ▼             ▼          │
           │   ┌─────┐      ┌─────┐      ┌─────┐        │
           │   │Commit│     │Commit│     │Commit│        │
           │   │ hash │     │ hash │     │ hash │        │
           │   └──┬──┘      └──┬──┘      └──┬──┘        │
           │      │   5min     │            │            │
           │      ▼   delay    ▼            ▼            │
           │   ┌─────┐      ┌─────┐      ┌─────┐        │
           │   │Reveal│     │Reveal│     │Reveal│        │
           │   │ 75  │      │ 80  │      │ 70  │        │
           │   └──┬──┘      └──┬──┘      └──┬──┘        │
           │      │            │            │            │
           │      └────────────┼────────────┘            │
           │                   ▼                         │
           │           Median Score: 75                  │
           │                                              │
           └───────────────────┬─────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     Settlement      │
                    │  Agent: 25% refund  │
                    │  Provider: 75%      │
                    └─────────────────────┘
```

### Quality Score Settlement

| Score | Agent Refund | Provider | Interpretation |
|-------|--------------|----------|----------------|
| 80-100 | 0% | 100% | Service met expectations |
| 65-79 | 35% | 65% | Minor issues |
| 50-64 | 75% | 25% | Significant problems |
| 0-49 | 100% | 0% | Service failed |

### Commit-Reveal Voting

Prevents vote copying and collusion.

**Phase 1: Commit (Halo2)**
```
commitment = Poseidon(score, blinding, escrow_id, oracle_pk)
```

**Phase 2: Reveal (Groth16)**
```
proof = Prove(score, blinding | commitment)
Verify(proof, commitment) // on-chain via alt_bn128
```

## Zero-Knowledge Architecture

### Dual ZK System

| Layer | Technology | Purpose | Setup |
|-------|------------|---------|-------|
| Commitment | Halo2 | Privacy, vote hiding | None required |
| Verification | Groth16 | On-chain proof check | Trusted setup |

### Why Two Systems?

1. **Halo2**: No trusted setup, fast commitment generation
2. **Groth16**: Native Solana verification via `alt_bn128` syscalls

```rust
// Commitment (off-chain, Halo2)
let commitment = prover.commit(score, &blinding, escrow_id, oracle_pk)?;

// Proof generation (off-chain, Groth16)
let proof = groth16::prove(&pk, circuit, &public_inputs)?;

// Verification (on-chain, ~200k CU)
groth16_solana::verify(&vk, &proof, &public_inputs)?;
```

## Slashing Mechanisms

### Agent Slashing (5%)

Triggered when agent disputes and quality score >= 80.

```
slashed = agent.stake * 0.05
agent.stake -= slashed
treasury += slashed
```

### Oracle Slashing (10%)

Triggered when oracle vote deviates >20% from median.

```
if abs(oracle_score - median) > 20:
    slashed = oracle.stake * 0.10
    oracle.stake -= slashed
    oracle.violations += 1
    if oracle.violations >= 3:
        remove_oracle(oracle)
```

## Fee Structure

| Fee | Amount | Recipient |
|-----|--------|-----------|
| Escrow creation | 0.1% (min 5000 lamports) | Treasury |
| Dispute resolution | 1% | Treasury |
| Oracle reward | 1% | Oracle pool |

## Security Model

### Access Control

| Role | Capabilities |
|------|-------------|
| Agent Owner | Create agent, create agreements, dispute, release |
| Provider | Release (after timelock) |
| Oracle | Submit votes, reveal scores |
| Registry Admin | Add/remove oracles |
| Protocol Authorities | Pause/unpause, treasury withdrawal (2-of-3) |

### Emergency Pause

2-of-3 multisig can pause new escrow creation while allowing existing escrows to complete.

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│ Authority1 │     │ Authority2 │     │ Authority3 │
└─────┬──────┘     └─────┬──────┘     └─────┬──────┘
      │                  │                  │
      └──────────────────┼──────────────────┘
                         │
                    2 of 3 sign
                         │
                         ▼
                  ┌──────────────┐
                  │   Paused     │
                  │ (no new      │
                  │  escrows)    │
                  └──────────────┘
```

## Package Architecture

```
kamiyo-protocol/
├── programs/kamiyo/        # Solana program (Anchor)
├── crates/kamiyo-zk/       # Rust ZK library (Halo2)
├── circuits/               # Circom/Groth16 circuits
└── packages/
    ├── kamiyo-sdk/         # Core TypeScript client
    ├── helius-adapter/     # Helius RPC integration
    ├── kamiyo-x402-client/ # HTTP 402 payments
    ├── kamiyo-middleware/  # Express/Fastify middleware
    ├── kamiyo-actions/     # Agent framework actions
    ├── kamiyo-langchain/   # LangChain tools
    ├── kamiyo-agent-client/# Autonomous agent SDK
    ├── kamiyo-mcp/         # Claude/LLM integration
    ├── kamiyo-surfpool/    # Strategy simulation
    └── kamiyo-switchboard/ # Switchboard oracle adapter
```

## Data Flow

### Happy Path (No Dispute)

```
1. Agent creates identity with stake
   └─► agent_pda created

2. Agent creates agreement with provider
   └─► escrow_pda created, funds locked

3. Provider delivers service
   └─► (off-chain)

4. Agent releases funds
   └─► funds → provider, escrow closed
```

### Dispute Path

```
1. Agent marks agreement disputed
   └─► escrow status = Disputed

2. Oracles submit commit hashes
   └─► commitment stored on-chain

3. 5-minute delay
   └─► prevents vote copying

4. Oracles reveal scores with ZK proofs
   └─► scores verified on-chain

5. Median calculated, funds split
   └─► agent refund + provider payment

6. Deviating oracles slashed
   └─► stake → treasury
```

## Integration Points

### RPC Providers

- Helius (recommended): `@kamiyo/helius-adapter`
- Generic Solana RPC: `@kamiyo/sdk`

### Agent Frameworks

- Eliza: `@kamiyo/actions`
- LangChain: `@kamiyo/langchain`
- Claude/MCP: `@kamiyo/mcp`

### Payment Protocols

- x402: `@kamiyo/x402-client`
- HTTP 402: `@kamiyo/middleware`

## References

- [Anchor Framework](https://www.anchor-lang.com/)
- [Halo2](https://github.com/zcash/halo2)
- [Groth16 on Solana](https://github.com/Lightprotocol/groth16-solana)
- [x402 Protocol](https://www.x402.org/)
