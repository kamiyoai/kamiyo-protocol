# Manifest Verification & Forward Receipts

Hardened protection against dynamic routing attacks in AI agent payment forwarding.

## Problem

AI agents forwarding x402 payments can silently change routing after verification:

```
1. A calls verify_forward(A → B) ✓
2. B's manifest: "I forward to C"
3. A executes forward to B
4. B updates manifest: "I forward to A" (EXPLOIT)
5. B forwards back to A → cycle A → B → A
```

Traditional cycle detection only catches cycles **after** they occur. Agents can exploit the gap between verification and execution.

## Solution: Signed Manifests + Non-Repudiable Receipts

### 1. Signed Endpoint Manifests

Each agent publishes immutable routing declaration:

```sql
manifest = {
  endpoint_uri: "https://agent-b.ai/forward",
  pubkey: "0x...",
  valid_from: "2025-01-16T00:00:00Z",
  valid_until: "2025-01-17T00:00:00Z",
  nonce: 12345
}
signature = sign(manifest, agent_private_key)
```

**Properties:**
- **Immutable**: Nonce prevents reuse
- **Time-bound**: Valid window enforced
- **Signed**: Cryptographic proof of commitment

### 2. Verify with Manifest

A's `verify_forward` must include B's manifest signature:

```python
safety = await client.verify_forward(
    root_tx="0x...",
    source_agent=A_uuid,
    target_agent=B_uuid,
    manifest_hash="0x...",
    manifest_nonce=12345,
    manifest_signature="0x..."
)

if not safety['safe']:
    raise Exception("Forward unsafe or manifest invalid")
```

**Server validates:**
1. Signature matches B's pubkey
2. Nonce unused (prevents replay)
3. Current time within valid window
4. No cycle detected

### 3. Forward with Receipt

B returns signed receipt binding routing:

```python
receipt = {
    root_tx: "0x...",
    hop: 1,
    src: A_uuid,
    dst: B_uuid,
    next_hop_hash: hash(C_uuid),  # Commitment to next hop
    nonce: 67890,
    timestamp: "2025-01-16T12:34:56Z"
}
signature_B = sign(receipt, B_private_key)
```

A attaches receipt to downstream calls. Any routing change invalidates receipt and becomes **provable fraud**.

### 4. On-Chain Commitments (High-Value)

For flows >= $10k USDC, require on-chain commitment:

```python
commitment = await client.create_onchain_commitment(
    root_tx="0x...",
    first_hop_agent=B_uuid,
    routing_hash=hash(B→C),
    amount_usdc=15000
)
# Returns commitment_tx_hash with 5-min time-lock
```

Time-lock creates dispute window. Routing changes during lock trigger automatic slashing.

### 5. Automatic Cycle Detection → Provisional Settlement

When cycle detected:

```sql
detect_cycle_with_receipts(root_tx) → {
  has_cycle: true,
  cycle_agents: [A, B],
  cycle_depth: 2,
  invalid_receipts: [receipt_id_1, receipt_id_2]
}
```

**Immediate actions:**
1. Invalidate all receipts in cycle
2. Slash stakes of cycle participants (10-50% based on depth)
3. Credit reporter bounty (if external report)
4. Mark provisional settlement (dispute window)

### 6. Reporter Economics

External watchers can profitably report cycles:

```
Bounty = base (50 USDC)
         + depth_multiplier (50% per hop)
         + 10% of slashed stakes

Capped at 1000 USDC per report
```

**Example:**
- 3-agent cycle detected
- Total slashed: 5000 USDC
- Bounty: 50 + (3 * 0.5 * 50) + (5000 * 0.10) = 625 USDC

Gas costs covered + incentive for timely reporting.

## API Endpoints

### Publish Manifest

```http
POST /api/v1/agents/manifests/publish
{
  "agent_uuid": "...",
  "endpoint_uri": "https://...",
  "pubkey": "0x...",
  "nonce": 12345,
  "valid_from": "2025-01-16T00:00:00Z",
  "valid_until": "2025-01-17T00:00:00Z",
  "signature": "0x...",
  "chain": "base"
}
```

### Verify Forward

```http
POST /api/v1/agents/manifests/verify-forward
{
  "root_tx_hash": "0x...",
  "source_agent_uuid": "...",
  "dest_agent_uuid": "...",
  "manifest_hash": "0x...",
  "manifest_nonce": 12345,
  "manifest_signature": "0x..."
}
```

Returns:
```json
{
  "safe": true,
  "manifest_hash": "0x...",
  "manifest_nonce": 12345
}
```

### Record Forward

```http
POST /api/v1/agents/manifests/record-forward
{
  "root_tx_hash": "0x...",
  "source_agent_uuid": "...",
  "dest_agent_uuid": "...",
  "hop": 1,
  "manifest_id": "...",
  "next_hop_hash": "0x...",
  "receipt_nonce": 67890,
  "signature": "0x...",
  "chain": "base"
}
```

### Report Cycle

```http
POST /api/v1/agents/manifests/report-cycle
{
  "root_tx_hash": "0x...",
  "reporter_address": "0x..."
}
```

Returns bounty amount and settlement ID.

## Monitoring

### Manifest Flip Metrics

```http
GET /api/v1/agents/manifests/{agent_uuid}/flip-metrics
```

Returns:
```json
{
  "total_flips": 15,
  "rapid_flips_1min": 3,
  "endpoint_changes": 8,
  "high_suspicion_flips": 2,
  "avg_suspicion_score": 42.5,
  "last_flip_at": "2025-01-16T12:00:00Z"
}
```

**Suspicion scoring:**
- Endpoint change: +50
- Pubkey change: +30
- Flip interval <60s: +20
- Score ≥70 triggers alert

### Prometheus Metrics

```
# Manifest flip rate
forward_path_churn_total{agent_uuid="..."}

# Suspicious flips
forward_path_suspicious_flips_total{agent_uuid="..."}

# Cycle reports
cycle_reports_total{reporter="0x..."}
```

Alert on:
- `rate(forward_path_churn_total[5m]) > 10`
- `forward_path_suspicious_flips_total > 5`

## Game Theory

### Nash Equilibrium

**Honest behavior:**
- Publish stable manifest
- Return valid receipts
- Earn cooperation rewards (+10 pts/forward)

**Defection:**
- Flip manifest to create cycle
- Invalid receipts detected
- Stake slashed (10-50%)
- Reputation penalty (2x for cycle initiator)

**Reporter incentive:**
- Profitable to watch and report
- Bounty covers gas + reward
- External enforcement layer

### Economic Guarantees

1. **Stake requirement**: Minimum 100 USDC to participate in forwarding
2. **Slash amounts**: 10-50% based on cycle depth (unrecoverable)
3. **Reporter bounty**: 50-1000 USDC (profitable for watchers)
4. **Cooperation rewards**: +10 pts per honest forward

**Result**: Defection more costly than honest behavior.

## TEE Attestation (Future)

For opaque AI providers, require TEE attestation:

```python
manifest = {
  ...,
  tee_attestation: {
    quote: "...",
    measurement: "...",
    timestamp: "..."
  }
}
```

Proves routing logic matches published manifest at forward-time.

## Migration

Apply migration:

```bash
psql kagami < database/migrations/018_endpoint_manifests.sql
```

Adds tables:
- `erc8004_endpoint_manifests`
- `erc8004_forward_receipts`
- `erc8004_onchain_commitments`
- `erc8004_manifest_flips`

## Implementation Status

- [x] Signed endpoint manifests
- [x] Manifest verification in verify_forward
- [x] Non-repudiable forward receipts
- [x] Automatic cycle detection → provisional settlement
- [x] Reporter bounty economics
- [x] On-chain commitment for high-value flows
- [x] Manifest flip monitoring
- [x] Prometheus metrics
- [ ] TEE attestation integration (roadmap)

---

Built by KAMIYO
