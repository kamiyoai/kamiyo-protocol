# Varden Exploit Intelligence API

Production-ready FastAPI REST API for the Varden Exploit Intelligence Platform. Provides real-time blockchain exploit data with tiered subscription access, rate limiting, and webhook notifications.

## Features

- **FastAPI async architecture** for high performance
- **Tiered subscription system** (FREE, BASIC, PRO)
- **API key authentication** with rate limiting
- **Data delay enforcement** by subscription tier
- **Webhook notifications** for real-time alerts
- **Comprehensive filtering** and search capabilities
- **Production-ready** error handling and logging
- **Auto-generated API documentation** with Swagger UI

## Quick Start

### Installation

```bash
cd /Users/dennisgoslar/Projekter/exploit-intel-platform/api-agent/api

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Run the API Server

```bash
# Development mode (with auto-reload)
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production mode
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

The API will be available at:
- API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API Documentation

### Authentication

Most endpoints require an API key. Include it in the request header:

```bash
curl -H "X-API-Key: your_api_key_here" http://localhost:8000/exploits
```

### Demo API Keys

For testing, use these demo API keys:

```
FREE Tier:  varden_demo_free_key
BASIC Tier: varden_demo_basic_key
PRO Tier:   varden_demo_pro_key
```

## Subscription Tiers

### FREE Tier ($0/month)
- 24-hour delayed data
- 10 requests/hour
- No API key required for public endpoints
- No webhook support

### BASIC Tier ($49/month)
- 1-hour delayed data
- 100 requests/hour
- Full API access
- 1 webhook endpoint
- Basic email alerts

### PRO Tier ($199/month)
- Real-time data (no delay)
- 1000 requests/hour
- Full API access
- Up to 10 webhook endpoints
- Custom alert configurations
- Priority support

## API Endpoints

### Exploits

#### GET /exploits
Get paginated list of exploits with filtering.

**Query Parameters:**
- `page` (int): Page number (default: 1)
- `page_size` (int): Items per page (default: 20, max: 100)
- `chain` (string): Filter by blockchain
- `protocol` (string): Filter by protocol
- `severity` (string): Filter by severity (critical/high/medium/low)
- `min_amount` (float): Minimum amount stolen (USD)

**Example:**
```bash
curl "http://localhost:8000/exploits?chain=Cosmos%20Hub&severity=critical&page=1&page_size=20"
```

**Response:**
```json
{
  "exploits": [...],
  "total": 150,
  "page": 1,
  "page_size": 20,
  "total_pages": 8,
  "has_next": true,
  "has_previous": false
}
```

#### GET /exploits/{tx_hash}
Get single exploit by transaction hash.

**Example:**
```bash
curl "http://localhost:8000/exploits/0x1234...abcd"
```

### Alerts

#### GET /alerts/recent
Get recent high-severity exploits (requires authentication).

**Query Parameters:**
- `hours` (int): Time window in hours (default: 24, max: 168)
- `limit` (int): Maximum alerts (default: 50, max: 100)

**Example:**
```bash
curl -H "X-API-Key: varden_demo_pro_key" \
  "http://localhost:8000/alerts/recent?hours=24&limit=50"
```

### Search

#### GET /search
Search exploits by term.

**Query Parameters:**
- `q` (string, required): Search query (min 2 characters)
- `limit` (int): Maximum results (default: 20, max: 100)

**Example:**
```bash
curl "http://localhost:8000/search?q=uniswap&limit=20"
```

### Statistics

#### GET /stats/overview
Get comprehensive statistics and analytics.

**Example:**
```bash
curl "http://localhost:8000/stats/overview"
```

**Response:**
```json
{
  "total_exploits": 234,
  "total_amount_stolen_usd": 45678900.50,
  "exploits_last_24h": 12,
  "by_severity": {
    "critical": 45,
    "high": 89,
    "medium": 67,
    "low": 33
  },
  "by_chain": {
    "Cosmos Hub": 120,
    "Osmosis": 67,
    "Juno": 47
  },
  "last_updated": "2025-10-06T14:00:00"
}
```

### Webhooks

#### POST /webhooks/configure
Configure a webhook endpoint (requires authentication).

**Request Body:**
```json
{
  "webhook_url": "https://example.com/webhook",
  "event_types": ["new_exploit", "critical_alert"],
  "filters": {
    "severity": ["critical", "high"],
    "min_amount": 100000
  }
}
```

**Example:**
```bash
curl -X POST "http://localhost:8000/webhooks/configure" \
  -H "X-API-Key: varden_demo_pro_key" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://example.com/webhook",
    "event_types": ["new_exploit", "critical_alert"]
  }'
```

#### GET /webhooks
List all configured webhooks (requires authentication).

**Example:**
```bash
curl -H "X-API-Key: varden_demo_pro_key" \
  "http://localhost:8000/webhooks"
```

#### DELETE /webhooks/{webhook_id}
Delete a webhook configuration (requires authentication).

**Example:**
```bash
curl -X DELETE "http://localhost:8000/webhooks/1" \
  -H "X-API-Key: varden_demo_pro_key"
```

### Subscriptions

#### GET /subscriptions/tiers
Get all subscription tier information (no auth required).

**Example:**
```bash
curl "http://localhost:8000/subscriptions/tiers"
```

#### GET /subscriptions/me
Get current subscription information (requires authentication).

**Example:**
```bash
curl -H "X-API-Key: varden_demo_pro_key" \
  "http://localhost:8000/subscriptions/me"
```

### Health

#### GET /health
Check API health and database connectivity.

**Example:**
```bash
curl "http://localhost:8000/health"
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "database": "connected",
  "timestamp": "2025-10-06T14:00:00",
  "uptime_seconds": 86400.5
}
```

## Rate Limiting

Rate limits are enforced per API key on a sliding 1-hour window:

- **FREE**: 10 requests/hour
- **BASIC**: 100 requests/hour
- **PRO**: 1000 requests/hour

When rate limit is exceeded, you'll receive a `429 Too Many Requests` response:

```json
{
  "error": "Rate Limit Exceeded",
  "detail": "You have exceeded your rate limit of 100 requests per hour",
  "retry_after_seconds": 3600,
  "current_tier": "BASIC",
  "requests_remaining": 0
}
```

## Data Delay

Data access is delayed based on subscription tier to ensure fair usage:

- **FREE**: 24-hour delay
- **BASIC**: 1-hour delay
- **PRO**: Real-time (no delay)

This means FREE tier users see data from 24 hours ago, BASIC tier users see data from 1 hour ago, and PRO tier users see real-time data.

## Error Handling

The API uses standard HTTP status codes:

- `200 OK`: Request successful
- `400 Bad Request`: Invalid parameters
- `401 Unauthorized`: Missing or invalid API key
- `403 Forbidden`: Insufficient permissions (tier limitation)
- `404 Not Found`: Resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

Error responses follow this format:

```json
{
  "error": "Error Name",
  "detail": "Detailed error message",
  "status_code": 400
}
```

## Webhook Events

Configure webhooks to receive real-time notifications. Available event types:

- `new_exploit`: New exploit detected
- `critical_alert`: Critical severity exploit
- `high_value`: High-value exploit (>$100k)
- `protocol_specific`: Specific protocol exploited

Webhook payload example:

```json
{
  "event_type": "critical_alert",
  "timestamp": "2025-10-06T14:30:00",
  "data": {
    "tx_hash": "0x1234...abcd",
    "chain": "Cosmos Hub",
    "protocol": "DeFi Protocol",
    "severity": "critical",
    "amount_stolen": 1500000.0,
    "token": "ATOM"
  }
}
```

## Database

The API connects to the SQLite database at:
```
/Users/dennisgoslar/Projekter/exploit-intel-platform/processing-agent/data/exploits.db
```

Make sure the processing agent has created and populated this database before starting the API.

## Production Deployment

### Environment Variables

Create a `.env` file:

```bash
# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
API_WORKERS=4

# Database
DATABASE_PATH=/path/to/exploits.db

# Stripe (for payment processing)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# CORS
ALLOWED_ORIGINS=https://varden.io,https://app.varden.io

# Logging
LOG_LEVEL=INFO
```

### Docker Deployment

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

Build and run:

```bash
docker build -t varden-api .
docker run -p 8000:8000 -v /path/to/exploits.db:/data/exploits.db varden-api
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name api.varden.io;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Monitoring

### Health Checks

Use the `/health` endpoint for monitoring:

```bash
# Check if API is running
curl http://localhost:8000/health

# Monitor with uptime tools
watch -n 10 'curl -s http://localhost:8000/health | jq'
```

### Logging

The API logs to stdout with structured logging:

```
2025-10-06 14:00:00 - main - INFO - Starting Varden API server...
2025-10-06 14:00:01 - main - INFO - Database connected successfully. Total exploits: 234
2025-10-06 14:01:00 - auth - DEBUG - API request from varden_demo_pro_key... (tier: PRO, usage: 45/1000)
```

## Testing

### Run Tests

```bash
# Install test dependencies
pip install pytest pytest-asyncio httpx

# Run tests
pytest tests/

# Run with coverage
pytest --cov=api tests/
```

### Manual Testing

Use the interactive Swagger UI at http://localhost:8000/docs to test all endpoints.

## Stripe Integration

The API includes placeholders for Stripe payment integration. To implement:

1. Add Stripe secret key to environment
2. Implement `get_stripe_checkout_url()` in `subscriptions.py`
3. Implement `handle_stripe_webhook()` for subscription events
4. Update API key creation flow in `auth.py`

## Security Best Practices

1. **HTTPS Only**: Always use HTTPS in production
2. **API Key Storage**: Store API keys securely (use database with encryption)
3. **Rate Limiting**: Use Redis for distributed rate limiting
4. **CORS**: Restrict allowed origins in production
5. **Input Validation**: All inputs are validated with Pydantic
6. **SQL Injection**: Protected by parameterized queries
7. **Webhook Verification**: Implement webhook signature verification

## Support

- Documentation: https://docs.varden.io
- Email: support@varden.io
- Discord: https://discord.gg/varden
- GitHub: https://github.com/varden/exploit-intel-platform

## License

Proprietary - Varden Exploit Intelligence Platform

---

Built with FastAPI and Claude Code
