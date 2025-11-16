# ERC-8004 Agent Identity API Reference

## Overview

Production-grade REST API for ERC-8004 agent identity and reputation management.

**Base URL**: `https://kamiyo.ai/api/v1/agents`

**Authentication**: Bearer token (API key)

## Authentication

All requests require an API key in the Authorization header:

```bash
Authorization: Bearer YOUR_API_KEY
```

Get your API key from the dashboard at https://kamiyo.ai/dashboard

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| POST /register | 10/hour |
| POST /feedback | 100/hour |
| POST /link-payment | 200/hour |
| GET /{uuid} | 1000/hour |
| GET / (search) | 500/hour |

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when limit resets

## Error Codes

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| AGENT_NOT_FOUND | 404 | Agent UUID not found | Verify agent UUID |
| INVALID_ADDRESS | 400 | Invalid Ethereum address | Use 0x + 40 hex chars |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests | Wait for retry-after |
| UNAUTHORIZED | 401 | Invalid API key | Check API key |
| FORBIDDEN | 403 | Wallet ownership mismatch | Use your own wallet |
| INVALID_SCORE | 400 | Score out of range | Use 0-100 |
| METADATA_LIMIT_EXCEEDED | 400 | Too many metadata keys | Max 50 keys per agent |

## Endpoints

### POST /register

Register a new agent identity.

**Authentication**: Required
**Rate Limit**: 10/hour

**Request Body**:
```json
{
  "owner_address": "0x742d35cc6634c0532925a3b844b5e3a3a3b7b7b7",
  "chain": "base",
  "registration_file": {
    "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    "name": "My Agent",
    "description": "AI agent for automated trading",
    "image": "https://example.com/agent.png",
    "endpoints": [
      {
        "name": "MCP",
        "endpoint": "https://agent.example.com/mcp",
        "version": "1.0"
      }
    ],
    "supportedTrust": ["reputation", "crypto-economic"]
  },
  "metadata": {
    "category": "trading",
    "version": "1.0.0"
  }
}
```

**Response**: 201 Created
```json
{
  "agent_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "agent_id": 1,
  "chain": "base",
  "registry_address": "0x0000000000000000000000000000000000000000",
  "owner_address": "0x742d35cc6634c0532925a3b844b5e3a3a3b7b7b7",
  "token_uri": "https://kamiyo.ai/api/v1/agents/550e8400-e29b-41d4-a716-446655440000/registration",
  "status": "active",
  "created_at": "2025-01-14T10:00:00Z",
  "registration_file": { ... }
}
```

---

### GET /{agent_uuid}

Get agent details by UUID.

**Authentication**: Required
**Rate Limit**: 1000/hour
**Cache**: 5 minutes

**Response**: 200 OK
```json
{
  "agent_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "agent_id": 1,
  "chain": "base",
  "owner_address": "0x742d35cc6634c0532925a3b844b5e3a3a3b7b7b7",
  "status": "active",
  "created_at": "2025-01-14T10:00:00Z",
  ...
}
```

---

### GET /{agent_uuid}/stats

Get comprehensive agent statistics (reputation + payments).

**Authentication**: Required
**Rate Limit**: 1000/hour
**Cache**: 5 minutes

**Response**: 200 OK
```json
{
  "agent_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "agent_id": 1,
  "chain": "base",
  "reputation_score": 87.5,
  "total_feedback": 42,
  "positive_feedback": 38,
  "negative_feedback": 4,
  "total_payments": 156,
  "total_amount_usdc": "12450.50",
  "payment_success_rate": 98.7,
  "trust_level": "excellent"
}
```

**Trust Levels**:
- `excellent`: Score 90-100, >50 feedback
- `very-good`: Score 80-89, >25 feedback
- `good`: Score 70-79, >10 feedback
- `fair`: Score 60-69
- `poor`: Score <60 or <10 feedback

---

### POST /feedback

Submit reputation feedback for an agent.

**Authentication**: Required
**Rate Limit**: 100/hour

**Request Body**:
```json
{
  "agent_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "client_address": "0x742d35cc6634c0532925a3b844b5e3a3a3b7b7b7",
  "score": 85,
  "tag1": "quality",
  "tag2": "responsive",
  "file_uri": "https://feedback.example.com/1",
  "file_hash": "0xabc123..."
}
```

**Score Scale**:
- 0-20: Very poor
- 21-40: Poor
- 41-60: Average
- 61-80: Good
- 81-100: Excellent

**Response**: 201 Created
```json
{
  "id": "feedback-uuid",
  "agent_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "client_address": "0x742d35cc6634c0532925a3b844b5e3a3a3b7b7b7",
  "score": 85,
  "is_revoked": false,
  "created_at": "2025-01-14T10:00:00Z"
}
```

---

### GET /

Search and filter agents.

**Authentication**: Required
**Rate Limit**: 500/hour
**Cache**: 1 minute

**Query Parameters**:
- `owner_address` (string): Filter by owner
- `chain` (string): Filter by chain (e.g., "base")
- `min_reputation_score` (int): Minimum reputation (0-100)
- `min_success_rate` (float): Minimum payment success rate (0-100)
- `trust_level` (string): Filter by trust level
- `status` (string): Filter by status (default: "active")
- `limit` (int): Results per page (max 100)
- `offset` (int): Pagination offset

**Response**: 200 OK
```json
{
  "agents": [ ... ],
  "total": 1250,
  "limit": 50,
  "offset": 0
}
```

---

### POST /link-payment

Link an x402 payment to an agent.

**Authentication**: Required
**Rate Limit**: 200/hour

**Request Body**:
```json
{
  "agent_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "tx_hash": "0xabc123...",
  "chain": "base"
}
```

**Response**: 200 OK
```json
{
  "success": true,
  "message": "Payment linked to agent"
}
```

---

## Health Check

### GET /health

Check system health status.

**Authentication**: Not required

**Response**: 200 OK (healthy) or 503 (unhealthy)
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "healthy" },
    "redis": { "status": "healthy" },
    "materialized_views": {
      "status": "healthy",
      "age_seconds": 120
    }
  },
  "version": "1.0.0"
}
```

---

## Metrics

### GET /metrics

Prometheus metrics endpoint.

**Authentication**: Not required

**Response**: text/plain

---

## Best Practices

### Caching

- Agent stats are cached for 5 minutes
- Search results are cached for 1 minute
- Cache is automatically invalidated on updates

### Pagination

Always use pagination for list endpoints:
```bash
GET /api/v1/agents/?limit=50&offset=0
```

### Error Handling

Always check `error.code` for programmatic error handling:
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "retry_after": "3600"
  }
}
```

### Webhook Integration

For real-time updates, use webhooks (contact support).

---

## SDKs

### JavaScript/TypeScript
```bash
npm install @kamiyo/erc8004-sdk
```

### Python
```bash
pip install kamiyo-erc8004
```

---

## Support

- Documentation: https://docs.kamiyo.ai
- Discord: https://discord.gg/kamiyo
- Email: dev@kamiyo.ai
