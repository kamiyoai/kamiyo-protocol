# KAMIYO Protocol Roadmap

## Current State

**Live Infrastructure:**
- Solana mainnet escrow program
- Monad mainnet contracts (AgentProxy, ReputationMirror, SwarmSimulator)
- 13 SDK packages ready for integration

**ZK Circuits (Noir):**
- `reputation-proof` - threshold proofs without revealing score
- `smt-exclusion` - blacklist proofs without revealing identity
- `oracle-vote` - private voting (200k CU)
- `aggregate-vote` - batch 16 votes (250k CU vs 3.2M)

---

## Phase 1: Foundation

### Private Reputation API
Expose `reputation-proof` circuit as public endpoint.
- Agents prove reputation threshold without revealing score
- Use case: provider screening, credit-like scoring
- `POST /api/v1/prove/reputation`

### x402 Payment Widget
Embeddable payment component for dApps.
- One-line integration
- Escrow + direct payment modes
- Target: AI developers needing pay-per-use

### ElizaOS Integration
Production-ready agent plugin.
- Auto-dispute on quality breach
- Reputation-gated provider selection
- Full escrow lifecycle management

---

## Phase 2: Privacy Layer

### Kamiyo Shield
Privacy-preserving agent verification.
- Prove: "I have >80% success rate" (no stats revealed)
- Prove: "I'm not blacklisted" (no identity revealed)
- Circuits: `reputation-proof`, `smt-exclusion`

### Private Voting SDK
Generic private voting for DAOs.
- Commit-reveal with ZK proofs
- 12x gas savings via batched verification
- Circuits: `oracle-vote`, `aggregate-vote`

### Blacklist Portability
Shared fraud prevention layer.
- `smt-exclusion` proofs across protocols
- Bad actors blocked from partner services
- No identity disclosure required

---

## Phase 3: Payment Rails

### Jupiter Integration
Any-token payments with auto-conversion.
- Accept any SPL token
- Auto-convert to USDC for settlement
- Agent-to-agent payment rails

### Blindfold Integration
Privacy card integration for fiat/crypto bridge.

**Agent Payment Flow:**
```
User loads Blindfold card
    → Funds Kamiyo escrow
    → Agent delivers work
    → Escrow releases to card
    → Private spend (no trail)
```

**ZK Reputation for Card Limits:**
- `reputation-proof` gates card tier access
- Prove success rate for higher limits
- ZK proof replaces KYC for trusted agents

**Shared Blacklist:**
- `smt-exclusion` proofs work for both protocols
- Kamiyo blacklist blocks Blindfold card issuance
- Unified fraud prevention

---

## Phase 4: Full Products

### Kamiyo Escrow
Escrow-as-a-service platform.
- Multi-milestone support
- Arbitration marketplace
- SLA-based auto-refunds

### Kamiyo Governance
Private DAO voting infrastructure.
- Quadratic voting with ZK range proofs
- Sybil resistance via `reputation-proof`
- Delegation without identity disclosure

---

## Integration Partners

| Partner | Integration | Status |
|---------|-------------|--------|
| Helius | RPC adapter, webhooks | Live |
| Monad | Cross-chain reputation | Live |
| ElizaOS | Agent plugin | Ready |
| Switchboard | Oracle quality scoring | Ready |
| Jupiter | Payment routing | Planned |
| Blindfold | Privacy cards | Planned |

---

## Technical Milestones

```
[x] Solana escrow program
[x] Monad mainnet deployment
[x] Helius adapter
[x] ElizaOS plugin
[x] ZK circuits (4)
[ ] Private reputation API
[ ] Payment widget
[ ] Shield MVP
[ ] Jupiter integration
[ ] Blindfold integration
[ ] Governance module
```
