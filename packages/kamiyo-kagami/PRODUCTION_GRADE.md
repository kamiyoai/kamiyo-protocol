# Production-Grade A+ Implementation

Kagami has been hardened for production deployment with enterprise-grade security, cryptographic verification, and comprehensive error handling.

## Security Hardening

### Cryptographic Verification

**EIP-191 Personal Sign**
- All manifests and receipts use Ethereum's `personal_sign` standard
- Web3-compatible signature verification
- Automatic address recovery and validation

**Deterministic Hashing**
- SHA-256 for all hash computations
- Consistent ordering prevents hash collisions
- Verifiable manifest and receipt integrity

### Attack Prevention

**Nonce-Based Replay Protection**
```python
# Each manifest has unique nonce
manifest_hash = compute_manifest_hash(
    agent_uuid, endpoint_uri, pubkey,
    nonce=12345,  # Prevents signature reuse
    valid_from, valid_until
)
```

**Endpoint Tampering Detection**
```python
# Signature binds all parameters
signature = sign(agent_uuid + endpoint + pubkey + nonce + timestamps)

# Any parameter change invalidates signature
verify_signature(params, signature, expected_signer)
```

**Time-Window Enforcement**
```sql
-- Manifests must be within valid time window
valid_from <= CURRENT_TIMESTAMP AND valid_until >= CURRENT_TIMESTAMP
```

## Error Handling

### Typed Exceptions

All errors use strongly-typed exception hierarchy:

```python
try:
    result = await verify_forward(...)
except CircularDependencyException as e:
    # Cycle detected - slash stakes
    handle_cycle(e.cycle_agents, e.cycle_depth)
except ValidationException as e:
    # Invalid input - return 400
    return {"error": e.field, "message": e.message}
except DatabaseException as e:
    # DB error - retry or alert
    sentry.capture_exception(e)
except AgentNotFoundException as e:
    # Agent not found - return 404
    return {"error": "not_found"}
```

### Database Error Recovery

**PostgreSQL-Specific Handling**
```python
try:
    async with conn.transaction():
        await conn.execute(query, params)
except asyncpg.PostgresError as e:
    logger.error("db_error", error=str(e))
    raise DatabaseException(operation, str(e))
```

**Transaction Rollback**
- All multi-step operations use transactions
- Automatic rollback on any error
- No partial state corruption

## Testing

### Unit Tests

**Security Properties**
```python
def test_nonce_prevents_replay():
    """Signature with nonce N cannot be used with nonce N+1"""
    sig = sign(manifest, nonce=1)
    assert not verify(manifest, sig, nonce=2)

def test_endpoint_tampering():
    """Changing endpoint invalidates signature"""
    sig = sign(endpoint="https://a.com")
    assert not verify(endpoint="https://b.com", sig)
```

**Cryptographic Correctness**
```python
def test_deterministic_hashing():
    """Same inputs always produce same hash"""
    hash1 = compute_hash(params)
    hash2 = compute_hash(params)
    assert hash1 == hash2
```

### Integration Tests

Run full workflow tests:
```bash
pytest tests/test_manifest_verification.py -v
pytest tests/test_production_readiness.py -v
```

## Performance

### Database Optimization

**Indexed Queries**
```sql
CREATE INDEX idx_manifests_agent ON erc8004_endpoint_manifests(agent_uuid);
CREATE INDEX idx_manifests_status ON erc8004_endpoint_manifests(status, valid_until DESC);
CREATE INDEX idx_manifests_hash ON erc8004_endpoint_manifests(manifest_hash);
```

**Materialized Views**
```sql
-- Precomputed flip metrics
CREATE MATERIALIZED VIEW v_agent_manifest_flip_metrics AS ...
REFRESH MATERIALIZED VIEW CONCURRENTLY v_agent_manifest_flip_metrics;
```

### Connection Pooling

**asyncpg Pool**
```python
pool = await asyncpg.create_pool(
    min_size=10,
    max_size=50,
    command_timeout=60
)
```

## Monitoring

### Structured Logging

```python
logger.info(
    "manifest_published",
    agent_uuid=agent_uuid,
    manifest_hash=manifest_hash,
    nonce=nonce
)

logger.error(
    "signature_verification_failed",
    expected=expected_signer,
    recovered=recovered_address
)
```

### Prometheus Metrics

**Exposed Metrics**
- `forward_path_churn_total{agent_uuid}` - Manifest flip rate
- `forward_path_suspicious_flips_total{agent_uuid}` - High suspicion flips
- `cycle_reports_total{reporter}` - Cycle detection reports
- `manifest_verification_duration_seconds` - Latency histogram

**Alerting Rules**
```yaml
- alert: HighManifestChurn
  expr: rate(forward_path_churn_total[5m]) > 10
  annotations:
    summary: "Agent {{ $labels.agent_uuid }} flipping manifests rapidly"

- alert: SuspiciousFlips
  expr: forward_path_suspicious_flips_total > 5
  annotations:
    summary: "Agent {{ $labels.agent_uuid }} has suspicious routing changes"
```

## Deployment

### Environment Variables

```bash
# Database
POSTGRES_HOST=db.example.com
POSTGRES_PORT=5432
POSTGRES_DB=kagami
POSTGRES_USER=kagami_prod
POSTGRES_PASSWORD=<secret>

# Redis
REDIS_URL=redis://cache.example.com:6379

# Monitoring
SENTRY_DSN=https://...@sentry.io/...
LOG_LEVEL=INFO

# Security
API_KEY_SALT=<random-32-bytes>
MANIFEST_MAX_VALIDITY_HOURS=24
```

### Database Migration

```bash
# Run migrations
psql $DATABASE_URL < database/migrations/001_schema.sql
psql $DATABASE_URL < database/migrations/018_endpoint_manifests.sql

# Verify schema
psql $DATABASE_URL -c "\dt erc8004_*"
psql $DATABASE_URL -c "\df detect_*"
```

### Health Checks

**Liveness**
```bash
curl http://localhost:8000/health
# {"status": "healthy", "db": "connected", "redis": "connected"}
```

**Readiness**
```bash
curl http://localhost:8000/ready
# {"ready": true, "db_pool_size": 45, "redis_ping": "PONG"}
```

## Production Checklist

- [x] Cryptographic signature verification (EIP-191)
- [x] Deterministic hash computation (SHA-256)
- [x] Nonce-based replay protection
- [x] Time-window enforcement
- [x] Typed exception hierarchy
- [x] PostgreSQL error handling
- [x] Transaction rollback on errors
- [x] Comprehensive unit tests
- [x] Security property tests
- [x] Database indexes
- [x] Connection pooling
- [x] Structured logging
- [x] Prometheus metrics
- [x] Health check endpoints
- [x] Environment configuration
- [x] Migration scripts
- [x] Documentation

## Compliance

**Standards**
- ERC-8004: Agent identity registry
- EIP-191: Signed data standard
- OWASP Top 10: Secure coding practices

**Audit Trail**
- All manifests and receipts cryptographically signed
- Complete change history in `erc8004_manifest_flips`
- Immutable receipt chain in `erc8004_forward_receipts`
- On-chain commitments for high-value flows

## Support

**Issues**: https://github.com/kamiyo-ai/kagami/issues
**Security**: security@kamiyo.ai
**Enterprise**: enterprise@kamiyo.ai

---

Production-ready. Built by KAMIYO.
