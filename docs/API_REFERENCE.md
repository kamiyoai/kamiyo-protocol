# Kamiyo API Reference

Complete API documentation for the Kamiyo Exploit Intelligence Platform.

**Base URL:** `https://api.kamiyo.io/v1`
**Version:** 1.0
**Last Updated:** October 2025

---

## Authentication

All API requests require authentication using an API key.

### API Key Header

```http
X-API-Key: your_api_key_here
```

### Example Request

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  https://api.kamiyo.io/v1/exploits
```

### Error Responses

**401 Unauthorized**
```json
{
  "error": "Invalid or missing API key",
  "status": 401
}
```

---

## Rate Limiting

Rate limits vary by subscription tier:

| Tier | Requests/Day | Requests/Hour | Requests/Minute |
|------|--------------|---------------|-----------------|
| Free | No API access | - | - |
| Pro | 50,000 | ~2,083 | ~35 |
| Team | 100,000 | ~4,167 | ~70 |
| Enterprise | Unlimited | Unlimited | ~1,000 |

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1696723200
```

### 429 Response

```json
{
  "error": "Rate limit exceeded",
  "limit": 100,
  "remaining": 0,
  "reset": 1696723200,
  "retry_after": 3600
}
```

---

## Endpoints

### Exploits

#### List All Exploits

`GET /exploits`

Retrieve a paginated list of exploits.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number (default: 1) |
| limit | integer | No | Results per page (default: 20, max: 100) |
| chain | string | No | Filter by blockchain |
| severity | string | No | Filter by severity (critical, high, medium, low) |
| protocol | string | No | Filter by protocol name |
| min_amount | float | No | Minimum loss amount (USD) |
| max_amount | float | No | Maximum loss amount (USD) |
| date_from | string | No | Start date (ISO 8601) |
| date_to | string | No | End date (ISO 8601) |
| sort | string | No | Sort field (timestamp, amount) |
| order | string | No | Sort order (asc, desc) |

**Example Request:**

```bash
curl -H "X-API-Key: YOUR_KEY" \
  "https://api.kamiyo.io/v1/exploits?chain=ethereum&severity=critical&limit=50"
```

**Success Response (200 OK):**

```json
{
  "exploits": [
    {
      "id": "exp_1a2b3c4d",
      "protocol": "ExampleDEX",
      "chain": "ethereum",
      "amount_usd": 5000000.00,
      "severity": "critical",
      "description": "Flash loan attack exploiting reentrancy vulnerability in liquidity pool",
      "tx_hash": "0xabc123def456...",
      "block_number": 18500000,
      "timestamp": "2025-10-07T14:30:00Z",
      "sources": [
        {
          "name": "rekt.news",
          "url": "https://rekt.news/example-dex-rekt/"
        },
        {
          "name": "blocksec.com",
          "url": "https://blocksec.com/alerts/123"
        }
      ],
      "tags": ["flash-loan", "reentrancy", "dex"],
      "status": "confirmed",
      "created_at": "2025-10-07T14:35:00Z",
      "updated_at": "2025-10-07T15:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 234,
    "pages": 12,
    "has_next": true,
    "has_prev": false
  },
  "meta": {
    "request_id": "req_xyz789",
    "timestamp": "2025-10-07T16:00:00Z",
    "cache_hit": false
  }
}
```

---

#### Get Exploit by ID

`GET /exploits/{exploit_id}`

Retrieve detailed information about a specific exploit.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| exploit_id | string | Yes | Exploit ID |

**Example Request:**

```bash
curl -H "X-API-Key: YOUR_KEY" \
  https://api.kamiyo.io/v1/exploits/exp_1a2b3c4d
```

**Success Response (200 OK):**

```json
{
  "exploit": {
    "id": "exp_1a2b3c4d",
    "protocol": "ExampleDEX",
    "chain": "ethereum",
    "amount_usd": 5000000.00,
    "severity": "critical",
    "description": "Flash loan attack exploiting reentrancy vulnerability",
    "detailed_description": "The attacker used a flash loan...",
    "tx_hash": "0xabc123def456...",
    "block_number": 18500000,
    "timestamp": "2025-10-07T14:30:00Z",
    "attacker_address": "0x1234567890...",
    "vulnerable_contract": "0x9876543210...",
    "sources": [...],
    "tags": ["flash-loan", "reentrancy", "dex"],
    "related_exploits": ["exp_2b3c4d5e", "exp_3c4d5e6f"],
    "timeline": [
      {
        "timestamp": "2025-10-07T14:30:00Z",
        "event": "Exploit executed",
        "tx_hash": "0xabc123..."
      },
      {
        "timestamp": "2025-10-07T14:35:00Z",
        "event": "First reported",
        "source": "blocksec.com"
      }
    ]
  }
}
```

**Error Response (404 Not Found):**

```json
{
  "error": "Exploit not found",
  "status": 404
}
```

---

#### Search Exploits

`GET /exploits/search`

Full-text search across exploit data.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| q | string | Yes | Search query |
| page | integer | No | Page number |
| limit | integer | No | Results per page |

**Example Request:**

```bash
curl -H "X-API-Key: YOUR_KEY" \
  "https://api.kamiyo.io/v1/exploits/search?q=flash+loan+uniswap"
```

---

### Statistics

#### Get Overall Statistics

`GET /stats`

Retrieve platform-wide statistics.

**Example Request:**

```bash
curl -H "X-API-Key: YOUR_KEY" \
  https://api.kamiyo.io/v1/stats
```

**Success Response (200 OK):**

```json
{
  "stats": {
    "total_exploits": 1234,
    "total_amount_usd": 5678900000.00,
    "exploits_by_chain": {
      "ethereum": 456,
      "bsc": 234,
      "polygon": 123,
      "arbitrum": 89,
      "optimism": 67
    },
    "exploits_by_severity": {
      "critical": 123,
      "high": 456,
      "medium": 543,
      "low": 112
    },
    "recent_trends": {
      "last_24h": 12,
      "last_7d": 89,
      "last_30d": 234
    }
  }
}
```

---

#### Get Chain Statistics

`GET /stats/chains`

Statistics broken down by blockchain.

---

#### Get Protocol Statistics

`GET /stats/protocols`

Statistics for top targeted protocols.

---

### Usage

#### Get API Usage

`GET /usage`

Retrieve your current API usage statistics.

**Example Request:**

```bash
curl -H "X-API-Key: YOUR_KEY" \
  https://api.kamiyo.io/v1/usage
```

**Success Response (200 OK):**

```json
{
  "usage": {
    "period": "daily",
    "limit": 10000,
    "used": 1234,
    "remaining": 8766,
    "reset_at": "2025-10-08T00:00:00Z",
    "percentage_used": 12.34
  },
  "history": [
    {
      "date": "2025-10-07",
      "requests": 1234
    },
    {
      "date": "2025-10-06",
      "requests": 2345
    }
  ]
}
```

---

### Alerts

#### List Alerts

`GET /alerts`

Retrieve your configured alerts.

---

#### Create Alert

`POST /alerts`

Create a new alert configuration.

**Request Body:**

```json
{
  "name": "Critical Ethereum Exploits",
  "filters": {
    "chains": ["ethereum"],
    "severity": ["critical"],
    "min_amount": 1000000
  },
  "delivery": {
    "email": true,
    "discord_webhook": "https://discord.com/api/webhooks/..."
  }
}
```

---

### WebSocket (Pro/Enterprise)

#### Real-Time Exploit Stream

`WSS /stream`

Connect to receive real-time exploit updates.

**Connection:**

```javascript
const ws = new WebSocket('wss://api.kamiyo.io/v1/stream?api_key=YOUR_KEY');

ws.onopen = () => {
  console.log('Connected');

  // Subscribe to specific channels
  ws.send(JSON.stringify({
    action: 'subscribe',
    channels: ['exploits', 'ethereum', 'critical']
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('New exploit:', data);
};
```

**Message Format:**

```json
{
  "type": "exploit.created",
  "data": {
    "id": "exp_1a2b3c4d",
    "protocol": "ExampleDEX",
    "chain": "ethereum",
    "severity": "critical",
    "amount_usd": 5000000.00
  },
  "timestamp": "2025-10-07T14:30:00Z"
}
```

---

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Invalid or missing API key |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Temporary service outage |

---

## Code Examples

### Python

```python
import requests

API_KEY = "your_api_key_here"
BASE_URL = "https://api.kamiyo.io/v1"

headers = {"X-API-Key": API_KEY}

# List exploits
response = requests.get(f"{BASE_URL}/exploits", headers=headers)
exploits = response.json()

for exploit in exploits['exploits']:
    print(f"{exploit['protocol']}: ${exploit['amount_usd']:,.0f}")
```

### JavaScript/Node.js

```javascript
const axios = require('axios');

const API_KEY = 'your_api_key_here';
const BASE_URL = 'https://api.kamiyo.io/v1';

const headers = { 'X-API-Key': API_KEY };

// List exploits
axios.get(`${BASE_URL}/exploits`, { headers })
  .then(response => {
    response.data.exploits.forEach(exploit => {
      console.log(`${exploit.protocol}: $${exploit.amount_usd.toLocaleString()}`);
    });
  })
  .catch(error => console.error(error));
```

### Go

```go
package main

import (
    "encoding/json"
    "fmt"
    "net/http"
)

const (
    APIKey  = "your_api_key_here"
    BaseURL = "https://api.kamiyo.io/v1"
)

func main() {
    client := &http.Client{}

    req, _ := http.NewRequest("GET", BaseURL+"/exploits", nil)
    req.Header.Set("X-API-Key", APIKey)

    resp, _ := client.Do(req)
    defer resp.Body.Close()

    var result map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&result)

    fmt.Println(result)
}
```

---

## SDKs

Official SDKs available:

- **Python:** `pip install kamiyo`
- **JavaScript:** `npm install @kamiyo/sdk`
- **Go:** `go get github.com/kamiyo/kamiyo-go`

---

## Changelog

### v1.0 (October 2025)
- Initial API release
- Core exploit endpoints
- Statistics endpoints
- Real-time WebSocket support

---

**Support:** api-support@kamiyo.io
**Documentation:** https://kamiyo.io/docs
