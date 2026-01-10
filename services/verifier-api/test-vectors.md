# KAMIYO Verifier API - Test Vectors

Base URL: `https://kamiyo-protocol.onrender.com`

## Health Check

```bash
curl https://kamiyo-protocol.onrender.com/health
```

Response:
```json
{"status":"ok"}
```

## POST /verify/reputation

### Valid Request (should return verified: true)

```bash
curl -X POST https://kamiyo-protocol.onrender.com/verify/reputation \
  -H "Content-Type: application/json" \
  -d '{
    "agent_pk": "11111111111111111111111111111112",
    "commitment": "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
    "threshold": 85,
    "proof_bytes": "dGVzdC1wcm9vZi1ieXRlcw=="
  }'
```

Note: This will return `verified: false` until we deploy the on-chain verifier program. For now, test that you get a valid response structure.

Expected response structure:
```json
{
  "verified": false,
  "error": "Proof verification failed"
}
```

Or when verified:
```json
{
  "verified": true,
  "tier": "premium",
  "limit": 2000
}
```

### Invalid Request - Missing Fields

```bash
curl -X POST https://kamiyo-protocol.onrender.com/verify/reputation \
  -H "Content-Type: application/json" \
  -d '{
    "agent_pk": "11111111111111111111111111111112"
  }'
```

Expected:
```json
{
  "verified": false,
  "error": "Missing required fields: agent_pk, commitment, threshold, proof_bytes"
}
```

### Invalid Request - Bad Public Key

```bash
curl -X POST https://kamiyo-protocol.onrender.com/verify/reputation \
  -H "Content-Type: application/json" \
  -d '{
    "agent_pk": "not-a-valid-pubkey",
    "commitment": "abc123",
    "threshold": 85,
    "proof_bytes": "dGVzdA=="
  }'
```

Expected:
```json
{
  "verified": false,
  "error": "Invalid agent_pk: must be valid base58 public key"
}
```

## POST /verify/exclusion

### Valid Request Structure

```bash
curl -X POST https://kamiyo-protocol.onrender.com/verify/exclusion \
  -H "Content-Type: application/json" \
  -d '{
    "agent_pk": "11111111111111111111111111111112",
    "root": "abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234",
    "siblings": []
  }'
```

Note: `siblings` must be exactly 256 hex strings for a valid proof. This test will fail validation.

Expected:
```json
{
  "not_blacklisted": false,
  "error": "Invalid siblings: must be array of 256 hex strings"
}
```

### Invalid Request - Missing Fields

```bash
curl -X POST https://kamiyo-protocol.onrender.com/verify/exclusion \
  -H "Content-Type: application/json" \
  -d '{
    "agent_pk": "11111111111111111111111111111112"
  }'
```

Expected:
```json
{
  "not_blacklisted": false,
  "error": "Missing required fields: agent_pk, root, siblings"
}
```

## GET /blacklist/root

```bash
curl https://kamiyo-protocol.onrender.com/blacklist/root
```

Expected (until BlacklistRegistry is deployed):
```json
{
  "error": "Blacklist registry not configured"
}
```

## Integration Flow

Once your side is ready, the flow is:

1. Agent creates payment with `requires_reputation_check: true`
2. Before Reloadly, call our `/verify/reputation`
3. If verified, call `/verify/exclusion`
4. If not blacklisted, proceed with card issuance

## Tier Mapping

| Threshold | Tier | Limit |
|-----------|------|-------|
| 0-69 | basic | $100 |
| 70-84 | standard | $500 |
| 85-94 | premium | $2,000 |
| 95-100 | elite | $10,000 |

## Questions?

dev@kamiyo.ai
