# User Webhooks System

Webhooks allow Team and Enterprise users to receive real-time exploit alerts at their own HTTPS endpoints.

## Features

- ✅ **CRUD API** for managing webhook endpoints
- ✅ **HMAC signatures** for verifying authenticity
- ✅ **Automatic retry** with exponential backoff (1min, 5min, 15min)
- ✅ **Flexible filtering** by amount, chain, protocol, category
- ✅ **Delivery logging** for debugging
- ✅ **Health monitoring** with success rates
- ✅ **Test endpoint** to verify connectivity

## API Endpoints

### Create Webhook
```bash
POST /api/v1/user-webhooks
Authorization: Bearer YOUR_API_KEY

{
  "name": "Production Alert System",
  "url": "https://your-domain.com/webhooks/kamiyo",
  "min_amount_usd": 100000,
  "chains": ["ethereum", "arbitrum"],
  "protocols": ["uniswap", "aave"]
}

Response:
{
  "id": 1,
  "secret": "VXJd8B9pQ_S...",  ⚠️ SAVE THIS - shown only once
  "is_active": true,
  ...
}
```

### List Webhooks
```bash
GET /api/v1/user-webhooks
Authorization: Bearer YOUR_API_KEY

Response:
{
  "webhooks": [...],
  "total": 3
}
```

### Update Webhook
```bash
PATCH /api/v1/user-webhooks/{id}
Authorization: Bearer YOUR_API_KEY

{
  "is_active": false,
  "min_amount_usd": 500000
}
```

### Delete Webhook
```bash
DELETE /api/v1/user-webhooks/{id}
Authorization: Bearer YOUR_API_KEY
```

### Test Webhook
```bash
POST /api/v1/user-webhooks/{id}/test
Authorization: Bearer YOUR_API_KEY

Response:
{
  "status": "success",
  "status_code": 200,
  "latency_ms": 245
}
```

### Get Delivery Logs
```bash
GET /api/v1/user-webhooks/{id}/deliveries?page=1&page_size=50
Authorization: Bearer YOUR_API_KEY

Response:
{
  "deliveries": [
    {
      "id": 123,
      "exploit_id": 456,
      "status_code": 200,
      "sent_at": "2025-10-10T12:34:56",
      "delivered_at": "2025-10-10T12:34:57"
    }
  ],
  "total": 150,
  "page": 1,
  "page_size": 50
}
```

### Regenerate Secret
```bash
POST /api/v1/user-webhooks/{id}/regenerate-secret
Authorization: Bearer YOUR_API_KEY

Response:
{
  "secret": "NEW_SECRET_HERE"  ⚠️ Old secret stops working immediately
}
```

## Webhook Payload Format

When an exploit is detected, Kamiyo sends:

```json
{
  "event": "exploit.detected",
  "timestamp": 1728564890,
  "exploit": {
    "id": 789,
    "tx_hash": "0xabc123...",
    "chain": "Ethereum",
    "protocol": "Uniswap",
    "amount_usd": 250000.0,
    "timestamp": "2025-10-10T12:30:00",
    "source": "PeckShield",
    "source_url": "https://...",
    "category": "flash_loan",
    "description": "Flash loan attack on..."
  }
}
```

## Verifying Signatures

Every webhook includes an `X-Kamiyo-Signature` header. **Always verify this** before processing.

### Python Example
```python
import hmac
import hashlib
import json

def verify_webhook(request, secret):
    # Get signature from header
    signature = request.headers.get('X-Kamiyo-Signature')

    # Get raw body
    payload = request.get_data(as_text=True)

    # Calculate expected signature
    expected = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()

    # Compare (constant-time comparison)
    return hmac.compare_digest(signature, expected)

# Usage
if verify_webhook(request, 'YOUR_SECRET_HERE'):
    data = request.get_json()
    # Process webhook...
else:
    return "Invalid signature", 401
```

### Node.js Example
```javascript
const crypto = require('crypto');

function verifyWebhook(req, secret) {
  const signature = req.headers['x-kamiyo-signature'];
  const payload = JSON.stringify(req.body);

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// Express middleware
app.post('/webhooks/kamiyo', (req, res) => {
  if (!verifyWebhook(req, process.env.KAMIYO_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  const { event, exploit } = req.body;
  // Process webhook...

  res.status(200).send('OK');
});
```

## Filtering

Webhooks support multiple filter types. If **any filter** is set, only exploits matching **all filters** are sent.

### Amount Filter
```json
{
  "min_amount_usd": 100000  // Only exploits >= $100k
}
```

### Chain Filter
```json
{
  "chains": ["ethereum", "arbitrum"]  // Only these chains
}
```

### Protocol Filter
```json
{
  "protocols": ["uniswap", "aave", "compound"]
}
```

### Category Filter
```json
{
  "categories": ["flash_loan", "reentrancy", "oracle_manipulation"]
}
```

### Combined Filters
```json
{
  "min_amount_usd": 50000,
  "chains": ["ethereum"],
  "categories": ["flash_loan"]
}
// Only Ethereum flash loans >= $50k
```

## Retry Logic

Failed webhooks are automatically retried:

1. **Attempt 1**: Immediate (on exploit detection)
2. **Attempt 2**: After 1 minute
3. **Attempt 3**: After 5 minutes (total: 6 min)
4. **Attempt 4**: After 15 minutes (total: 21 min)

After 3 failed attempts, webhook is marked as failed. Check delivery logs for debugging.

## Webhook Limits by Tier

| Tier | Max Webhooks |
|------|--------------|
| Free | 0 |
| Pro  | 0 |
| Team | 5 |
| Enterprise | 50 |

## Best Practices

### 1. Return 200 Quickly
```python
# ✅ Good - return immediately
@app.route('/webhook', methods=['POST'])
def webhook():
    if verify_signature(request):
        # Queue for async processing
        redis.lpush('webhook_queue', request.data)
        return 'OK', 200
    return 'Invalid', 401

# ❌ Bad - slow processing blocks retries
@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.get_json()
    process_exploit(data)  # Takes 5 seconds
    send_notifications(data)  # Takes 10 seconds
    return 'OK', 200  # Timeout!
```

### 2. Use HTTPS Only
Webhooks require HTTPS to prevent man-in-the-middle attacks.

### 3. Keep Secrets Safe
- Store in environment variables
- Never commit to git
- Rotate regularly using regenerate endpoint
- Use different secrets for dev/staging/prod

### 4. Handle Duplicates
Kamiyo prevents duplicate exploits, but network issues may cause duplicate webhook deliveries. Use `exploit.id` for idempotency:

```python
seen_exploits = set()

def process_webhook(data):
    exploit_id = data['exploit']['id']

    if exploit_id in seen_exploits:
        return  # Already processed

    seen_exploits.add(exploit_id)
    # Process...
```

### 5. Monitor Delivery Logs
Check `/api/v1/user-webhooks/{id}/deliveries` regularly for:
- Failed deliveries
- High latency
- Error patterns

## Troubleshooting

### Webhook Not Receiving Events

1. **Check webhook is active**
```bash
GET /api/v1/user-webhooks
# is_active should be true
```

2. **Test connectivity**
```bash
POST /api/v1/user-webhooks/{id}/test
# Should return 200 status_code
```

3. **Check filters**
```bash
# If min_amount_usd = 1000000, you won't get exploits < $1M
# Try removing filters temporarily
PATCH /api/v1/user-webhooks/{id}
{
  "min_amount_usd": null,
  "chains": null
}
```

4. **Check delivery logs**
```bash
GET /api/v1/user-webhooks/{id}/deliveries
# Look for errors
```

### Signature Verification Failing

1. **Use raw body** - Don't parse JSON before verifying
2. **Check character encoding** - Use UTF-8
3. **Verify secret** - Use the secret from creation (not masked version)
4. **Compare as hex strings** - Not base64

### High Failure Rate

Check delivery logs for common errors:
- **Timeout**: Your endpoint takes >10s to respond (return 200 immediately)
- **SSL errors**: Invalid HTTPS certificate
- **5xx errors**: Your server is down/overloaded
- **Connection refused**: Firewall blocking Kamiyo IPs

## Example Implementations

### Minimal Flask Server
```python
from flask import Flask, request
import hmac
import hashlib

app = Flask(__name__)
SECRET = 'your-webhook-secret-here'

@app.route('/webhooks/kamiyo', methods=['POST'])
def kamiyo_webhook():
    # Verify signature
    signature = request.headers.get('X-Kamiyo-Signature', '')
    payload = request.get_data(as_text=True)

    expected = hmac.new(
        SECRET.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(signature, expected):
        return 'Invalid signature', 401

    # Process webhook
    data = request.get_json()
    exploit = data['exploit']

    print(f"🚨 Exploit detected: {exploit['protocol']} on {exploit['chain']}")
    print(f"   Amount: ${exploit['amount_usd']:,.0f}")
    print(f"   TX: {exploit['tx_hash']}")

    return 'OK', 200

if __name__ == '__main__':
    app.run(port=5000)
```

### Discord Bot Integration
```python
import discord
import requests

DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/...'

def send_to_discord(exploit):
    embed = {
        "title": f"🚨 {exploit['protocol']} Exploited",
        "color": 0xff0000,
        "fields": [
            {"name": "Chain", "value": exploit['chain'], "inline": True},
            {"name": "Amount", "value": f"${exploit['amount_usd']:,.0f}", "inline": True},
            {"name": "TX Hash", "value": exploit['tx_hash']},
            {"name": "Source", "value": f"[{exploit['source']}]({exploit['source_url']})"}
        ]
    }

    requests.post(DISCORD_WEBHOOK, json={"embeds": [embed]})

@app.route('/webhooks/kamiyo', methods=['POST'])
def kamiyo_webhook():
    if verify_signature(request):
        exploit = request.get_json()['exploit']
        send_to_discord(exploit)
        return 'OK', 200
    return 'Invalid', 401
```

## Support

Questions? Check:
- API docs: `/api/v1/user-webhooks/docs`
- Delivery logs: `/api/v1/user-webhooks/{id}/deliveries`
- Test endpoint: `POST /api/v1/user-webhooks/{id}/test`

For urgent issues, contact support@kamiyo.ai
