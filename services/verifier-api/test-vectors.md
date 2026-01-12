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

Response:
```json
{"verified": true, "tier": "premium", "limit": 2000}
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

Response (invalid - needs 256 siblings):
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

Response:
```json
{
  "root": "HEX_STRING_64_CHARS"
}
```

## GET /blacklist/proof/:agent_pk

```bash
curl https://kamiyo-protocol.onrender.com/blacklist/proof/11111111111111111111111111111112
```

Response (agent not blacklisted):
```json
{
  "root": "HEX_STRING_64_CHARS",
  "siblings": ["HEX_STRING", "HEX_STRING", ...],
  "blacklisted": false
}
```

Response (agent is blacklisted):
```json
{
  "error": "Agent is blacklisted",
  "blacklisted": true
}
```

### Invalid agent_pk

```bash
curl https://kamiyo-protocol.onrender.com/blacklist/proof/not-a-valid-pubkey
```

Expected:
```json
{
  "error": "Invalid agent_pk: must be valid base58 public key"
}
```

## Integration Flow

1. Agent creates payment with `requires_reputation_check: true`
2. Call `/verify/reputation`
3. Call `/blacklist/proof/{agent_pk}`
4. If both pass, issue card

## Tier Mapping

| Threshold | Tier | Limit |
|-----------|------|-------|
| 0-69 | basic | $100 |
| 70-84 | standard | $500 |
| 85-94 | premium | $2,000 |
| 95-100 | elite | $10,000 |

## Questions?

dev@kamiyo.ai
