# Authentication Guide

## Overview

KAMIYO Hyperliquid Security Monitoring supports optional API key authentication for production deployments. By default, authentication is **disabled**, making all endpoints publicly accessible.

## When to Enable Authentication

Enable authentication if you:
- Are deploying to production
- Want to control access to your API
- Need usage tracking per API key
- Want to prevent abuse

## Quick Start

### 1. Generate API Keys

Run the key generator:

```bash
python api/auth.py
```

Output:
```
KAMIYO Hyperliquid API Key Generator
==================================================

Generated API Keys (add to .env as API_KEYS):

Key 1: 6zhozAbMoYYWy7aELLj4pL7TmHdEYl_opKnT_41FTUM
Key 2: 72aDUuQAczIelTluj2_8DLE2SGt8Y67_4FxFqzwnRgQ
Key 3: h809pdVPoidUTZIryMXSXAM_AkQ8MO-vsg7zLkD3mQQ

Example .env configuration:
API_KEY_ENABLED=true
API_KEYS="key1,key2,key3"
```

### 2. Configure Environment

Add to your `.env` file:

```bash
# Enable API key authentication
API_KEY_ENABLED=true

# Add your generated keys (comma-separated)
API_KEYS="6zhozAbMoYYWy7aELLj4pL7TmHdEYl_opKnT_41FTUM,72aDUuQAczIelTluj2_8DLE2SGt8Y67_4FxFqzwnRgQ,h809pdVPoidUTZIryMXSXAM_AkQ8MO-vsg7zLkD3mQQ"

# Optional: Custom salt for extra security
API_KEY_HASH_SALT=your-custom-salt-here
```

### 3. Restart the API Server

```bash
docker-compose restart api
```

### 4. Test Authentication

Without API key (should fail):
```bash
curl http://localhost:8000/security/dashboard
# Response: {"detail":"Missing API key..."}
```

With API key (header):
```bash
curl -H "X-API-Key: 6zhozAbMoYYWy7aELLj4pL7TmHdEYl_opKnT_41FTUM" \
  http://localhost:8000/security/dashboard
# Response: {"success": true, ...}
```

With API key (query parameter):
```bash
curl "http://localhost:8000/security/dashboard?api_key=6zhozAbMoYYWy7aELLj4pL7TmHdEYl_opKnT_41FTUM"
# Response: {"success": true, ...}
```

## Authentication Methods

### Method 1: HTTP Header (Recommended)

Add the `X-API-Key` header to your requests:

```bash
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:8000/security/dashboard
```

**Python example:**
```python
import requests

headers = {
    "X-API-Key": "6zhozAbMoYYWy7aELLj4pL7TmHdEYl_opKnT_41FTUM"
}

response = requests.get(
    "http://localhost:8000/security/dashboard",
    headers=headers
)

print(response.json())
```

**JavaScript example:**
```javascript
fetch('http://localhost:8000/security/dashboard', {
  headers: {
    'X-API-Key': '6zhozAbMoYYWy7aELLj4pL7TmHdEYl_opKnT_41FTUM'
  }
})
.then(response => response.json())
.then(data => console.log(data));
```

### Method 2: Query Parameter

Add `api_key` to the URL query string:

```bash
curl "http://localhost:8000/security/dashboard?api_key=YOUR_API_KEY"
```

**Python example:**
```python
import requests

params = {
    "api_key": "6zhozAbMoYYWy7aELLj4pL7TmHdEYl_opKnT_41FTUM"
}

response = requests.get(
    "http://localhost:8000/security/dashboard",
    params=params
)
```

**Note:** Header authentication is recommended for better security (not logged in URLs).

## Managing API Keys

### Generate Additional Keys

```bash
python api/auth.py
```

### Add Keys to Existing Configuration

Edit `.env` and add new keys to the comma-separated list:

```bash
API_KEYS="old_key_1,old_key_2,new_key_3"
```

### Revoke Keys

Remove the key from the `API_KEYS` list in `.env` and restart:

```bash
# Before:
API_KEYS="key1,key2,key3"

# After (key2 revoked):
API_KEYS="key1,key3"
```

```bash
docker-compose restart api
```

### Rotate Keys

1. Generate new keys
2. Add new keys to `.env` alongside old keys
3. Update clients to use new keys
4. After all clients are updated, remove old keys
5. Restart API server

```bash
# During rotation (both old and new keys work):
API_KEYS="old_key_1,old_key_2,new_key_1,new_key_2"

# After rotation complete:
API_KEYS="new_key_1,new_key_2"
```

## Protected Endpoints

When authentication is enabled, the following endpoints require an API key:

### Security Monitoring Endpoints
- `GET /security/dashboard` - Comprehensive security overview
- `GET /security/hlp-vault` - HLP vault health
- `GET /security/hlp-vault/history` - Historical vault snapshots
- `GET /security/oracle-deviations` - Oracle price deviations
- `GET /security/oracle-deviations/history` - Historical deviations
- `GET /security/liquidation-patterns` - Liquidation patterns
- `GET /security/events` - Security events
- `GET /security/events/database` - Events from database

### Public Endpoints (No Key Required)

These endpoints are always public:
- `GET /` - API information
- `GET /health` - Health check
- `GET /exploits` - Public exploit data
- `GET /stats` - Statistics
- `GET /meta` - Hyperliquid metadata

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_KEY_ENABLED` | `false` | Enable/disable authentication |
| `API_KEYS` | `""` | Comma-separated list of valid API keys |
| `API_KEY_HASH_SALT` | `kamiyo-hyperliquid-salt` | Salt for key hashing (optional) |

### Checking Authentication Status

Query the root endpoint to see if authentication is enabled:

```bash
curl http://localhost:8000/
```

Response includes:
```json
{
  "authentication": {
    "enabled": true,
    "keys_configured": 3,
    "authentication_methods": ["header", "query"]
  }
}
```

## Security Best Practices

### 1. Use HTTPS in Production

Always use HTTPS when authentication is enabled:

```bash
# ❌ Insecure (key visible in plaintext)
curl -H "X-API-Key: YOUR_KEY" http://api.example.com/security/dashboard

# ✅ Secure (encrypted connection)
curl -H "X-API-Key: YOUR_KEY" https://api.example.com/security/dashboard
```

### 2. Store Keys Securely

**❌ Don't:**
- Commit keys to version control
- Share keys in Slack/email
- Hard-code keys in applications
- Use same key across environments

**✅ Do:**
- Store keys in environment variables
- Use secret management (AWS Secrets Manager, HashiCorp Vault)
- Generate unique keys per environment
- Rotate keys regularly

### 3. Limit Key Distribution

- Generate separate keys for each client/service
- Revoke keys immediately when no longer needed
- Monitor key usage via logs
- Set up alerts for suspicious activity

### 4. Use Header Authentication

Prefer headers over query parameters:

```bash
# ✅ Better (not logged in URLs)
curl -H "X-API-Key: YOUR_KEY" https://api.example.com/endpoint

# ⚠️ Acceptable but less secure (visible in logs)
curl "https://api.example.com/endpoint?api_key=YOUR_KEY"
```

### 5. Implement Rate Limiting

Rate limiting is enabled by default. Configure in `.env`:

```bash
RATE_LIMIT=60/minute  # 60 requests per minute per IP
```

### 6. Monitor Failed Authentication

Check logs for failed authentication attempts:

```bash
docker-compose logs api | grep "Invalid API key"
```

## Troubleshooting

### Error: "Missing API key"

**Cause:** No API key provided when authentication is enabled.

**Solution:** Add API key to request:
```bash
curl -H "X-API-Key: YOUR_KEY" http://localhost:8000/endpoint
```

### Error: "Invalid API key"

**Causes:**
1. Key is incorrect/typo
2. Key not in `API_KEYS` list
3. Key was revoked

**Solutions:**
1. Verify key matches exactly (no spaces)
2. Check `.env` file has the key
3. Restart API server after config changes

### Authentication Not Working

**Checklist:**
1. ✅ `API_KEY_ENABLED=true` in `.env`
2. ✅ `API_KEYS` is not empty
3. ✅ API server restarted after config change
4. ✅ Using correct endpoint URL
5. ✅ Key format is correct (no quotes in header)

### Disable Authentication

To disable authentication entirely:

```bash
# .env
API_KEY_ENABLED=false
```

Restart server:
```bash
docker-compose restart api
```

## Advanced Usage

### Custom Salt

For additional security, use a custom salt:

```bash
# Generate random salt
openssl rand -base64 32

# Add to .env
API_KEY_HASH_SALT=your_random_salt_here_change_me
```

**Warning:** Changing the salt invalidates all existing keys!

### Programmatic Key Generation

```python
from api.auth import generate_api_key

# Generate single key
key = generate_api_key()
print(f"New key: {key}")

# Generate multiple keys
from api.auth import generate_new_keys

keys = generate_new_keys(count=5)
for i, key in enumerate(keys, 1):
    print(f"Key {i}: {key}")
```

### Integration with CI/CD

```yaml
# .github/workflows/deploy.yml
- name: Configure API Keys
  run: |
    echo "API_KEY_ENABLED=true" >> .env
    echo "API_KEYS=${{ secrets.PRODUCTION_API_KEYS }}" >> .env

- name: Deploy
  run: docker-compose up -d
```

Store `PRODUCTION_API_KEYS` in GitHub Secrets.

## Support

For issues or questions:
- GitHub Issues: https://github.com/kamiyo/kamiyo-hyperliquid/issues
- Documentation: https://github.com/kamiyo/kamiyo-hyperliquid

## License

AGPL-3.0 with commercial restrictions. See LICENSE file for details.
