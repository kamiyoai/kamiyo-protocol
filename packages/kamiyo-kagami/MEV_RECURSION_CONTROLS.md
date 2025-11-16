# MEV Resistance and Multi-Agent Recursion Controls

Kagami's dynamic routing manifest system hardened against MEV extraction and unbounded recursion.

## MEV Attack Vectors Mitigated

### 1. Front-Running Manifest Updates

**Attack**: Searcher monitors mempool for profitable routing changes, publishes manifest update before victim.

**Mitigation**:
```python
MANIFEST_ACTIVATION_DELAY_SECONDS = 12  # ~1 block on Base L2
```

Manifests cannot activate immediately. Function `enforce_activation_delay()` ensures minimum time between updates.

**Database**:
```sql
ALTER TABLE erc8004_endpoint_manifests
ADD COLUMN activation_delay_seconds INTEGER DEFAULT 0;
```

**Verification**:
```python
earliest_activation = await conn.fetchval("""
    SELECT enforce_activation_delay($1, $2)
""", agent_uuid, MANIFEST_ACTIVATION_DELAY_SECONDS)

if valid_from < earliest_activation:
    raise ValidationException("valid_from", "Activation too soon")
```

### 2. Sandwich Attacks via Manifest Flips

**Attack**: Agent flips manifest before TX to extract value, flips back after settlement.

**Mitigation**: Suspicion scoring tracks rapid flips, MEV incident reporting with 2x slashing.

**Detection**:
```sql
-- Suspicion score penalties
IF endpoint_changed THEN score := score + 50; END IF;
IF time_delta < 60 THEN score := score + 20; END IF;
```

**Slashing**:
```python
await ManifestVerifier.report_mev_incident(
    attack_type="sandwich",
    extracted_value_usdc=Decimal("50.0"),
    ...
)
# Attacker slashed 2x extracted value
```

### 3. Time-Bandit Attacks

**Attack**: Block reorg invalidates on-chain commitment after routing decision.

**Mitigation**: 300s timelock on high-value commitments (≥$10k USDC).

```sql
CREATE TABLE erc8004_onchain_commitments (
    time_lock_until TIMESTAMP WITH TIME ZONE NOT NULL,
    ...
);
```

Commitments cannot be disputed until timelock expires, giving Base L2 finality window.

### 4. Cross-Domain MEV

**Attack**: Coordinate L1/L2 reorgs to extract value across settlement layers.

**Mitigation**: Receipts bound to specific chain. Commitment hash includes chain identifier.

```python
commitment_tx_hash = compute_routing_hash([
    root_tx_hash,
    first_hop_agent_uuid,
    routing_hash,
    str(amount_usdc)
])
```

## Multi-Agent Recursion Controls

### 1. Hop Limit Enforcement

**Problem**: Infinite delegation chains (A→B→C→D→E→...)

**Solution**: Hard limit at 10 hops, economically irrational beyond 8.

```sql
ALTER TABLE erc8004_forward_receipts
ADD CONSTRAINT check_hop_limit CHECK (hop <= 10);
```

```python
MAX_HOP_DEPTH = 10
MAX_RATIONAL_HOPS = 8

if hop > MAX_HOP_DEPTH:
    raise ValidationException("hop", "Exceeds maximum depth")
```

### 2. Computational Cost Bounds (Bounded Rationality)

**Problem**: Agents have finite compute resources. Deep recursion costs exceed returns.

**Solution**: Exponential cost growth per hop.

```sql
CREATE TABLE erc8004_computational_costs (
    operation_type VARCHAR(50) NOT NULL,
    base_cost_usdc DECIMAL(10, 6) NOT NULL,
    per_hop_multiplier DECIMAL(5, 3) NOT NULL DEFAULT 1.1,
    max_rational_hops INTEGER NOT NULL DEFAULT 8
);
```

**Cost calculation**:
```sql
v_total_cost := base_cost_usdc * (per_hop_multiplier ^ hop_depth)

-- Beyond max_rational_hops:
IF hop_depth > max_rational_hops THEN
    RETURN 999999.99;  -- Prohibitive
END IF;
```

**Example costs** (operation='forward', base=0.005 USDC, multiplier=1.15):
- Hop 0: $0.005
- Hop 4: $0.009
- Hop 8: $0.015 (max rational)
- Hop 9: $999,999.99 (irrational)

### 3. Extraction Loop Detection (A→B→C→B)

**Problem**: Recursive routing extracts value (agent appears twice in path).

**Solution**: Track agent visits, detect loops, invalidate receipts.

```sql
CREATE OR REPLACE FUNCTION detect_extraction_loop(
    p_root_tx_hash VARCHAR(66)
) RETURNS TABLE(
    has_loop BOOLEAN,
    loop_agents UUID[],
    loop_hops INTEGER[],
    extracted_value_usdc DECIMAL
) AS $$
DECLARE
    v_agent_visits JSONB := '{}'::JSONB;
BEGIN
    FOR v_receipts IN
        SELECT dest_agent_uuid, hop FROM erc8004_forward_receipts
        WHERE root_tx_hash = p_root_tx_hash ORDER BY hop ASC
    LOOP
        IF v_agent_visits ? v_receipts.dest_agent_uuid::TEXT THEN
            -- Loop detected
            has_loop := TRUE;
            ...
        END IF;
    END LOOP;
END;
$$;
```

**Verification**:
```python
loop_result = await conn.fetchrow("""
    SELECT has_loop, loop_agents, extracted_value_usdc
    FROM detect_extraction_loop($1)
""", root_tx_hash)

if loop_result['has_loop']:
    return {"safe": False, "reason": "extraction_loop_detected"}
```

### 4. Stake Amplification Prevention

**Problem**: Agent reuses same stake across multiple recursive paths (stake multiplier attack).

**Solution**: Track stake utilization per transaction, enforce availability.

```sql
CREATE TABLE erc8004_stake_utilization (
    agent_uuid UUID NOT NULL,
    root_tx_hash VARCHAR(66) NOT NULL,
    stake_amount_usdc DECIMAL(20, 6) NOT NULL,
    utilization_count INTEGER NOT NULL DEFAULT 1,
    paths_involved TEXT[] NOT NULL,
    UNIQUE(agent_uuid, root_tx_hash)
);
```

**Enforcement**:
```sql
CREATE FUNCTION check_stake_amplification(
    p_agent_uuid UUID,
    p_root_tx_hash VARCHAR(66),
    p_required_stake_usdc DECIMAL
) RETURNS BOOLEAN AS $$
DECLARE
    v_total_stake DECIMAL;
    v_utilized_stake DECIMAL;
BEGIN
    -- Get total active stake
    SELECT COALESCE(SUM(amount_usdc), 0) INTO v_total_stake
    FROM erc8004_stake_locks
    WHERE agent_uuid = p_agent_uuid AND status = 'active';

    -- Get utilized stake across all active paths
    SELECT COALESCE(SUM(stake_amount_usdc), 0) INTO v_utilized_stake
    FROM erc8004_stake_utilization
    WHERE agent_uuid = p_agent_uuid AND released_at IS NULL;

    RETURN (v_total_stake - v_utilized_stake) >= p_required_stake_usdc;
END;
$$;
```

**Usage**:
```python
stake_available = await conn.fetchval("""
    SELECT check_stake_amplification($1, $2, $3)
""", agent_uuid, root_tx_hash, Decimal("100.0"))

if not stake_available:
    raise ValidationException("stake", "Amplification detected")
```

## MEV Incident Tracking

```sql
CREATE TABLE erc8004_mev_incidents (
    attack_type VARCHAR(50) NOT NULL CHECK (
        attack_type IN ('frontrun', 'sandwich', 'timebandit', 'extraction_loop')
    ),
    attacker_agent_uuid UUID,
    victim_agent_uuid UUID,
    extracted_value_usdc DECIMAL(20, 6),
    block_number BIGINT NOT NULL,
    tx_index INTEGER NOT NULL,
    evidence_hash VARCHAR(66) NOT NULL,
    slashing_applied BOOLEAN DEFAULT FALSE,
    slashed_amount_usdc DECIMAL(20, 6)
);
```

**Slashing rule**: 2x extracted value

```sql
v_slash_amount := p_extracted_value_usdc * 2;
PERFORM slash_stake_for_violation(p_attacker_agent_uuid, 5);
```

## Monitoring

### Recursion Depth Metrics
```sql
CREATE VIEW v_recursion_depth_metrics AS
SELECT
    hop as depth,
    COUNT(*) as receipt_count,
    COUNT(CASE WHEN hop_limit_violated THEN 1 END) as irrational_count,
    AVG(computational_cost_usdc) as avg_cost_usdc
FROM erc8004_forward_receipts
GROUP BY hop;
```

### MEV Attack Summary
```sql
CREATE VIEW v_mev_attack_summary AS
SELECT
    attack_type,
    COUNT(*) as incident_count,
    SUM(extracted_value_usdc) as total_extracted_usdc,
    SUM(slashed_amount_usdc) as total_slashed_usdc,
    COUNT(DISTINCT attacker_agent_uuid) as unique_attackers
FROM erc8004_mev_incidents
GROUP BY attack_type;
```

### Stake Amplification Detection
```sql
CREATE VIEW v_stake_amplification_metrics AS
SELECT
    agent_uuid,
    COUNT(id) as active_utilizations,
    SUM(stake_amount_usdc) as total_utilized_usdc,
    MAX(utilization_count) as max_reuse_count
FROM erc8004_stake_utilization
WHERE released_at IS NULL
GROUP BY agent_uuid
HAVING COUNT(id) > 1;
```

## Game Theory: Nash Equilibrium Under MEV

**Honest strategy payoff**:
```
U_honest = routing_fee - computational_cost(hop)
```

**MEV extraction payoff**:
```
U_mev = extracted_value - (2 * extracted_value) - reputation_loss
      = -extracted_value - reputation_loss
```

**Result**: Honest routing strictly dominates MEV extraction when:
1. Activation delay > block time (prevents frontrunning)
2. Slashing = 2x extraction (negative expected value)
3. Computational cost grows exponentially (bounds recursion depth)
4. Stake cannot be amplified (enforces capital requirements)

**Nash Equilibrium**: All agents route honestly with bounded recursion depth ≤ 8 hops.

## API Changes

### New Endpoint: Report MEV Incident
```python
POST /api/erc8004/mev/report

{
    "root_tx_hash": "0xaaa...",
    "attack_type": "sandwich",
    "attacker_agent_uuid": "123e4567...",
    "victim_agent_uuid": "223e4567...",
    "extracted_value_usdc": "50.00",
    "block_number": 12345678,
    "tx_index": 10,
    "evidence_hash": "0xbbb..."
}

Response:
{
    "reported": true,
    "incident_id": "323e4567...",
    "slashed_usdc": "100.00",
    "reported_at": "2025-01-16T12:00:00Z"
}
```

### Modified: verify_forward
Now checks for extraction loops:
```python
{
    "safe": false,
    "reason": "extraction_loop_detected",
    "loop_agents": ["223e4567..."],
    "loop_hops": [1, 3],
    "extracted_value_usdc": "0.15"
}
```

### Modified: record_forward
Enforces hop limit and stake availability:
```python
# Raises ValidationException if:
# - hop > 10
# - Stake amplification detected
```

### Modified: publish_manifest
Enforces activation delay:
```python
# Raises ValidationException if:
# - valid_from < enforce_activation_delay()
```

## Testing

See `tests/test_mev_recursion.py`:

- `test_hop_limit_enforced` - Hop 11 rejected
- `test_stake_amplification_detected` - Reused stake caught
- `test_activation_delay_enforced` - Immediate activation blocked
- `test_extraction_loop_detected` - A→B→C→B caught
- `test_mev_incident_reporting` - 2x slashing applied
- `test_computational_cost_increases_with_depth` - Exponential growth

## Migration

```bash
psql $DATABASE_URL < database/migrations/019_mev_recursion_controls.sql
```

Adds:
- `erc8004_stake_utilization` table
- `erc8004_computational_costs` table (with defaults)
- `erc8004_mev_incidents` table
- Hop limit constraints on `erc8004_forward_receipts`
- Activation delay column on `erc8004_endpoint_manifests`
- Functions: `check_stake_amplification`, `calculate_computational_cost`, `detect_extraction_loop`, `enforce_activation_delay`, `record_mev_incident`
- Monitoring views: `v_recursion_depth_metrics`, `v_mev_attack_summary`, `v_stake_amplification_metrics`

## Production Considerations

1. **Base L2 Block Time**: ~2s. Activation delay of 12s = ~6 blocks for finality.
2. **Computational Costs**: Tune multipliers based on observed gas costs.
3. **Slashing Severity**: 2x may be too lenient for repeat offenders. Consider progressive penalties.
4. **Hop Limit**: 10 is conservative. May increase if routing efficiency demands.
5. **Stake Requirements**: 100 USDC/hop minimum. Adjust based on network value.

## References

- **MEV Protection**: Flashbots, Eden Network commit-reveal schemes
- **Bounded Rationality**: Kahneman/Tversky computational limits in decision theory
- **Recursion Control**: Ethereum call depth limits (1024 pre-Tangerine Whistle)
- **Game Theory**: Fudenberg & Tirole, "Game Theory" (1991)

---

Built by KAMIYO.
