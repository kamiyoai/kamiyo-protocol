# Kamiyo Security Guidelines

## Overview

This document outlines security best practices, configurations, and guidelines for the Kamiyo platform.

## Environment Variables

### Required Security Variables

```bash
# CORS Configuration
ALLOWED_ORIGINS=https://kamiyo.ai,https://www.kamiyo.ai,https://api.kamiyo.ai

# Trusted Proxies (for rate limiting)
TRUSTED_PROXIES=10.0.0.1,172.16.0.1  # Your load balancer IPs

# API Keys
STRIPE_SECRET_KEY=sk_live_...  # NEVER use test keys in production
STRIPE_WEBHOOK_SECRET=whsec_...

# Database
DATABASE_URL=postgresql://user:password@host:5432/kamiyo_prod
# Use strong passwords (20+ chars, mixed case, numbers, symbols)

# Redis
REDIS_PASSWORD=...  # Strong password required

# SendGrid
SENDGRID_API_KEY=SG....

# Social Media (if using posting feature)
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
DISCORD_WEBHOOK_URL=...
TELEGRAM_BOT_TOKEN=...

# JWT Secret
JWT_SECRET_KEY=...  # Generate with: openssl rand -hex 32
```

## Security Headers

The API includes the following security headers (configured in nginx):

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy: default-src 'self'`

## Rate Limiting

### Anti-Spoofing Protection

The rate limiter validates client IPs to prevent spoofing attacks:

1. **API Key Authentication**: Preferred method, uses hashed API key
2. **Trusted Proxy Detection**: Only accepts X-Forwarded-For from configured proxies
3. **IP Validation**: Validates IP format before use
4. **Fallback**: Uses direct connection IP if no proxy

### Rate Limits by Tier

| Tier | Requests/Minute |
|------|----------------|
| Free | 10 |
| Basic | 100 |
| Pro | 1,000 |
| Enterprise | 10,000 |

### Bypassing Rate Limits

To bypass rate limits for specific IPs (e.g., monitoring tools):

```python
# Add to rate_limiter.py
WHITELISTED_IPS = os.getenv('RATE_LIMIT_WHITELIST', '').split(',')

if client_ip in WHITELISTED_IPS:
    return await call_next(request)
```

## CORS Configuration

### Production Setup

**NEVER** use `allow_origins=["*"]` in production. Configure specific origins:

```bash
# .env.production
ALLOWED_ORIGINS=https://kamiyo.ai,https://www.kamiyo.ai,https://api.kamiyo.ai
```

### Development Setup

Development mode automatically allows localhost:

```bash
# .env
ENVIRONMENT=development
```

## Database Security

### Connection Security

1. **Use SSL/TLS**: Always use SSL for database connections in production
   ```python
   DATABASE_URL=postgresql://user:password@host:5432/kamiyo_prod?sslmode=require
   ```

2. **Firewall Rules**: Restrict database access to application servers only
   ```bash
   # PostgreSQL: Only allow from app server IP
   sudo ufw allow from 10.0.0.5 to any port 5432
   ```

3. **Strong Credentials**:
   - Password: 20+ characters, mixed case, numbers, symbols
   - Rotate credentials every 90 days
   - Use different passwords for dev/staging/prod

### SQL Injection Prevention

All database queries use parameterized queries:

```python
# Good ✅
cursor.execute("SELECT * FROM exploits WHERE tx_hash = %s", (tx_hash,))

# Bad ❌
cursor.execute(f"SELECT * FROM exploits WHERE tx_hash = '{tx_hash}'")
```

### Migration Security

Migration files are executed as-is. Protect the `database/migrations/` directory:

```bash
# Restrict write access
chmod 755 database/migrations/
chmod 644 database/migrations/*.sql

# Only allow deployment user to modify
chown deploy:deploy database/migrations/
```

## API Security

### Authentication

1. **API Keys**: 32+ character random strings
   ```python
   import secrets
   api_key = secrets.token_urlsafe(32)
   ```

2. **JWT Tokens**:
   - Use HS256 algorithm
   - Set expiration (24 hours max)
   - Rotate secret keys regularly

3. **Never log credentials**:
   ```python
   # Good ✅
   logger.info(f"User authenticated: user_id={user_id}")

   # Bad ❌
   logger.info(f"User authenticated: api_key={api_key}")
   ```

### Input Validation

All endpoints validate input:

```python
# Pydantic models for validation
class ExploitQuery(BaseModel):
    chain: Optional[str] = Field(None, max_length=50)
    min_amount: Optional[float] = Field(None, ge=0)
    protocol: Optional[str] = Field(None, max_length=100)
```

### Response Security

Never expose internal errors:

```python
# Good ✅
except Exception as e:
    logger.error(f"Error: {e}")
    raise HTTPException(status_code=500, detail="Internal server error")

# Bad ❌
except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))
```

## Webhook Security

### Stripe Webhooks

Always verify webhook signatures:

```python
import stripe

def verify_webhook(payload, signature):
    try:
        event = stripe.Webhook.construct_event(
            payload, signature, os.getenv('STRIPE_WEBHOOK_SECRET')
        )
        return event
    except ValueError:
        raise HTTPException(400, "Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid signature")
```

### IP Whitelisting

Restrict webhooks to known IPs:

```python
STRIPE_IPS = [
    '3.18.12.0/24',
    '3.130.192.0/25',
    # ... other Stripe IPs
]
```

## Redis Security

### Authentication

Always use Redis password:

```bash
# redis.conf
requirepass your_strong_password_here

# .env
REDIS_PASSWORD=your_strong_password_here
```

### Network Isolation

Bind Redis to localhost or internal network:

```bash
# redis.conf
bind 127.0.0.1 10.0.0.5
```

### Disable Dangerous Commands

```bash
# redis.conf
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG ""
```

## File Upload Security

If implementing file uploads:

1. **Validate file types**:
   ```python
   ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf'}
   if not file.filename.split('.')[-1].lower() in ALLOWED_EXTENSIONS:
       raise HTTPException(400, "Invalid file type")
   ```

2. **Scan for malware**: Use ClamAV or similar

3. **Store outside web root**: Never serve uploads directly

4. **Size limits**: Enforce max upload size (e.g., 10MB)

## Docker Security

### Image Security

1. **Use official base images**:
   ```dockerfile
   FROM python:3.11-slim
   ```

2. **Run as non-root**:
   ```dockerfile
   RUN useradd -m -u 1000 kamiyo
   USER kamiyo
   ```

3. **Scan images**:
   ```bash
   docker scan kamiyo-api:latest
   ```

### Container Security

1. **Resource limits**:
   ```yaml
   # docker-compose.yml
   services:
     api:
       deploy:
         resources:
           limits:
             memory: 1G
             cpus: '0.5'
   ```

2. **Read-only filesystem**:
   ```yaml
   services:
     api:
       read_only: true
       tmpfs:
         - /tmp
   ```

3. **Drop capabilities**:
   ```yaml
   services:
     api:
       cap_drop:
         - ALL
       cap_add:
         - NET_BIND_SERVICE
   ```

## Secrets Management

### DO NOT

- ❌ Commit secrets to git
- ❌ Use `.env` files in production
- ❌ Store secrets in code
- ❌ Log secrets
- ❌ Send secrets via email/Slack

### DO

- ✅ Use environment variables
- ✅ Use secret management tools (AWS Secrets Manager, HashiCorp Vault)
- ✅ Rotate secrets regularly
- ✅ Use different secrets per environment
- ✅ Restrict secret access with IAM

## Monitoring & Alerting

### Security Events to Monitor

1. **Failed authentication attempts** (>5 in 5 minutes)
2. **Rate limit violations** (>100 in 1 hour)
3. **Suspicious IPs** (known bad actors)
4. **Database errors** (potential SQL injection attempts)
5. **Webhook failures** (potential replay attacks)

### Setup Alerts

```python
# Use Sentry for error tracking
import sentry_sdk

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    environment=os.getenv("ENVIRONMENT", "production"),
    traces_sample_rate=0.1,
)
```

## Incident Response

### In Case of Security Breach

1. **Isolate**: Take affected systems offline
2. **Investigate**: Review logs, identify scope
3. **Contain**: Revoke compromised credentials
4. **Remediate**: Patch vulnerabilities
5. **Communicate**: Notify affected users
6. **Document**: Write incident report

### Emergency Contacts

- Security Lead: security@kamiyo.ai
- Infrastructure: devops@kamiyo.ai
- CEO: ceo@kamiyo.ai

## Security Checklist

Before deployment, verify:

- [ ] All secrets in environment variables (not code)
- [ ] CORS configured with specific origins
- [ ] Rate limiting enabled
- [ ] Database uses SSL
- [ ] Redis requires authentication
- [ ] Webhook signatures verified
- [ ] Input validation on all endpoints
- [ ] Error messages don't expose internals
- [ ] Logging doesn't include secrets
- [ ] SSL/TLS certificates valid
- [ ] Security headers configured
- [ ] Dependencies up to date (no known CVEs)
- [ ] Firewall rules restrictive
- [ ] Backups encrypted
- [ ] Monitoring and alerting configured

## Security Audits

### Regular Audits

- **Weekly**: Dependency vulnerability scan (`pip-audit`)
- **Monthly**: Penetration testing
- **Quarterly**: Security code review
- **Annually**: Third-party security audit

### Tools

```bash
# Dependency vulnerabilities
pip install pip-audit
pip-audit

# Static analysis
bandit -r .

# Docker security
docker scan kamiyo-api:latest

# Network security
nmap -sV -sC api.kamiyo.ai
```

## Reporting Vulnerabilities

If you discover a security vulnerability:

1. **DO NOT** open a public GitHub issue
2. Email security@kamiyo.ai with:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We aim to respond within 24 hours and patch critical issues within 48 hours.

---

**Last Updated**: October 8, 2025
**Next Review**: January 8, 2026
