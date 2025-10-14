# Kamiyo Production Environment Setup Guide

## Overview

This guide provides comprehensive instructions for configuring all environment variables required for deploying Kamiyo to Render.com production environment.

**Platform:** Render.com
**Services:** 2 Web Services (API + Frontend) + PostgreSQL Database
**Deployment Method:** Infrastructure as Code (render.yaml)

---

## Environment Variables by Category

### 1. Database Configuration

#### `DATABASE_URL` (REQUIRED)

**Description:** PostgreSQL connection string for production database

**Format:**
```
postgresql://[user]:[password]@[host]:[port]/[database]
```

**Render.com Setup:**
- This is automatically configured via render.yaml:
  ```yaml
  envVars:
    - key: DATABASE_URL
      fromDatabase:
        name: kamiyo-postgres
        property: connectionString
  ```
- No manual configuration needed - Render auto-injects this value

**Verification:**
```bash
# Should match pattern: postgresql://kamiyo:***@***-postgres.render.com:5432/kamiyo
echo $DATABASE_URL | grep -E '^postgresql://'
```

**Security:**
- Never commit to git
- Never expose in logs
- Rotate password if compromised

---

### 2. API Configuration

#### `ENVIRONMENT` (REQUIRED)

**Description:** Application environment identifier

**Value:** `production`

**Render.com Setup:**
```yaml
envVars:
  - key: ENVIRONMENT
    value: production
```

**Options:**
- `development` - Local development
- `staging` - Staging environment (if used)
- `production` - Production environment

---

#### `ALLOWED_ORIGINS` (REQUIRED)

**Description:** CORS allowed origins (comma-separated)

**Production Value:**
```
https://kamiyo.ai,https://www.kamiyo.ai,https://api.kamiyo.ai
```

**Render.com Setup:**
1. Navigate to: `kamiyo-api` service → `Environment` tab
2. Add secret group or individual variable:
   - Key: `ALLOWED_ORIGINS`
   - Value: `https://kamiyo.ai,https://www.kamiyo.ai,https://api.kamiyo.ai`

**Important:**
- Must use HTTPS in production (HTTP will be rejected)
- No trailing slashes
- No spaces between URLs
- Add additional domains as needed (e.g., custom domains)

**Testing:**
```bash
# Verify CORS works
curl -I https://api.kamiyo.ai/exploits \
  -H "Origin: https://kamiyo.ai"
# Should include: Access-Control-Allow-Origin: https://kamiyo.ai
```

---

#### `ADMIN_API_KEY` (REQUIRED)

**Description:** Secret key for admin API endpoints

**Generation:**
```bash
# Generate secure random key
openssl rand -hex 32
```

**Render.com Setup:**
1. Navigate to: `kamiyo-api` service → `Environment` tab
2. Add variable:
   - Key: `ADMIN_API_KEY`
   - Value: [Generated key]
   - Click "Add" then "Save Changes"

**Usage:**
```bash
# Admin endpoint access
curl https://api.kamiyo.ai/admin/stats \
  -H "X-API-Key: $ADMIN_API_KEY"
```

**Security:**
- Store securely (1Password, Vault, etc.)
- Rotate every 90 days
- Never share publicly
- Use different key per environment

---

### 3. Authentication & Security

#### `JWT_SECRET` (REQUIRED)

**Description:** Secret for signing JWT tokens

**Generation:**
```bash
# Generate secure random secret (min 32 chars)
openssl rand -base64 48
```

**Render.com Setup:**
1. Navigate to: `kamiyo-api` service → `Environment` tab
2. Add variable:
   - Key: `JWT_SECRET`
   - Value: [Generated secret]
   - Sync: No (keep independent per service)

**Requirements:**
- Minimum 32 characters
- High entropy (random)
- Never reuse across environments

---

#### `NEXTAUTH_SECRET` (REQUIRED)

**Description:** NextAuth.js session encryption key

**Generation:**
```bash
# Generate secure random secret (min 32 chars)
openssl rand -base64 48
```

**Render.com Setup:**
1. Navigate to: `kamiyo-frontend` service → `Environment` tab
2. Add variable:
   - Key: `NEXTAUTH_SECRET`
   - Value: [Generated secret]

**Requirements:**
- Minimum 32 characters
- Must match across all frontend instances
- Rotate cautiously (invalidates all sessions)

**Documentation:** https://next-auth.js.org/configuration/options#secret

---

#### `NEXTAUTH_URL` (REQUIRED)

**Description:** Canonical URL for NextAuth.js

**Production Value:**
```
https://kamiyo.ai
```

**Render.com Setup:**
1. Navigate to: `kamiyo-frontend` service → `Environment` tab
2. Add variable:
   - Key: `NEXTAUTH_URL`
   - Value: `https://kamiyo.ai`

**Important:**
- Must exactly match deployment URL
- No trailing slash
- Use custom domain (not render.com subdomain)
- Must be HTTPS in production

**Troubleshooting:**
- Auth redirects fail → Check NEXTAUTH_URL matches actual URL
- CSRF errors → Verify no trailing slash

---

### 4. Payment Processing (Stripe)

#### `STRIPE_SECRET_KEY` (REQUIRED)

**Description:** Stripe API secret key for backend

**Production Value:** Starts with `sk_live_...`

**Obtaining:**
1. Log in to Stripe Dashboard: https://dashboard.stripe.com
2. Navigate to: `Developers` → `API keys`
3. Copy "Secret key" (reveal if hidden)

**Render.com Setup:**
1. Navigate to: Both `kamiyo-api` AND `kamiyo-frontend` → `Environment`
2. Add variable:
   - Key: `STRIPE_SECRET_KEY`
   - Value: `sk_live_...`

**Security:**
- NEVER commit to git
- NEVER expose in frontend code
- NEVER log this value
- Rotate immediately if exposed

---

#### `STRIPE_PUBLISHABLE_KEY` (REQUIRED)

**Description:** Stripe API publishable key for frontend

**Production Value:** Starts with `pk_live_...`

**Obtaining:**
1. Stripe Dashboard → `Developers` → `API keys`
2. Copy "Publishable key"

**Render.com Setup:**
1. Navigate to: `kamiyo-api` service → `Environment`
2. Add variable:
   - Key: `STRIPE_PUBLISHABLE_KEY`
   - Value: `pk_live_...`

**Note:** This key is safe to expose in frontend code

---

#### `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (REQUIRED)

**Description:** Same as STRIPE_PUBLISHABLE_KEY but for Next.js frontend

**Production Value:** Same as `STRIPE_PUBLISHABLE_KEY`

**Render.com Setup:**
1. Navigate to: `kamiyo-frontend` service → `Environment`
2. Add variable:
   - Key: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - Value: `pk_live_...`

**Important:** `NEXT_PUBLIC_` prefix makes it available in browser

---

#### `STRIPE_WEBHOOK_SECRET` (REQUIRED)

**Description:** Webhook signing secret for signature verification

**Production Value:** Starts with `whsec_...`

**Obtaining:**
1. Stripe Dashboard → `Developers` → `Webhooks`
2. Click on your webhook endpoint (or create new)
3. Click "Reveal" on "Signing secret"
4. Copy the secret

**Webhook Endpoint URL:**
```
https://api.kamiyo.ai/api/v1/webhooks/stripe
```

**Events to Subscribe To:**
```
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
checkout.session.completed
```

**Render.com Setup:**
1. Navigate to: Both `kamiyo-api` AND `kamiyo-frontend` → `Environment`
2. Add variable:
   - Key: `STRIPE_WEBHOOK_SECRET`
   - Value: `whsec_...`

**Testing:**
```bash
# Test webhook endpoint
stripe trigger payment_intent.succeeded --webhook-endpoint https://api.kamiyo.ai/api/v1/webhooks/stripe
```

**Important:**
- Must match the specific endpoint in Stripe Dashboard
- Different secrets for test vs production
- Webhooks will fail if secret is incorrect

---

### 5. Frontend Configuration

#### `NEXT_PUBLIC_API_URL` (REQUIRED)

**Description:** API base URL for frontend requests

**Production Value:**
```
https://api.kamiyo.ai
```

**Render.com Setup (Automatic):**
```yaml
envVars:
  - key: NEXT_PUBLIC_API_URL
    fromService:
      type: web
      name: kamiyo-api
      envVarKey: RENDER_EXTERNAL_URL
```

**Manual Override (if needed):**
1. Navigate to: `kamiyo-frontend` service → `Environment`
2. Update variable:
   - Key: `NEXT_PUBLIC_API_URL`
   - Value: `https://api.kamiyo.ai`

---

#### `NEXT_PUBLIC_API_ENDPOINT` (REQUIRED)

**Description:** Same as NEXT_PUBLIC_API_URL (for backwards compatibility)

**Production Value:** Same as `NEXT_PUBLIC_API_URL`

**Render.com Setup:** Automatically configured via render.yaml

---

#### `NODE_VERSION` (OPTIONAL)

**Description:** Node.js version for frontend build

**Production Value:** `18.20.8`

**Render.com Setup:**
```yaml
envVars:
  - key: NODE_VERSION
    value: 18.20.8
```

**Supported Versions:** Check Render.com documentation

---

#### `PORT` (OPTIONAL)

**Description:** Port for Next.js server

**Default Value:** `3000`

**Render.com Setup:**
```yaml
envVars:
  - key: PORT
    value: 3000
```

**Note:** Render automatically sets $PORT, this is just explicit

---

### 6. Redis Cache (OPTIONAL - Highly Recommended)

#### `REDIS_URL` (OPTIONAL)

**Description:** Redis connection URL for caching and rate limiting

**Format:**
```
redis://:[password]@[host]:[port]
```

**Obtaining:**
1. **Option A - Render.com Redis:**
   - Add Redis service in render.yaml or dashboard
   - Auto-injected via `fromService`

2. **Option B - External Redis (Upstash, Redis Cloud):**
   - Sign up for managed Redis
   - Copy connection URL

**Render.com Setup:**
1. Navigate to: Both services → `Environment`
2. Add variable:
   - Key: `REDIS_URL`
   - Value: `redis://...`

**Benefits:**
- Distributed rate limiting
- API response caching
- Session storage
- WebSocket connection state

**Without Redis:**
- Rate limiting uses in-memory store (single instance only)
- No caching (slower response times)
- Not recommended for production

---

### 7. External API Keys (OPTIONAL)

#### `ETHERSCAN_API_KEY` (OPTIONAL)

**Description:** Etherscan API for on-chain verification

**Obtaining:**
1. Sign up: https://etherscan.io/register
2. Navigate to: `API-KEYs` → `Create API Key`
3. Copy key

**Render.com Setup:**
1. Add to: `kamiyo-api` service → `Environment`
2. Key: `ETHERSCAN_API_KEY`
3. Value: [Your API key]

**Benefits:**
- Verify exploit transactions on Ethereum
- Fetch contract source code
- Get transaction details

---

#### `GITHUB_TOKEN` (OPTIONAL)

**Description:** GitHub personal access token for security advisories

**Obtaining:**
1. GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token (classic)
3. Scopes: `public_repo`, `read:org`
4. Copy token

**Render.com Setup:**
1. Add to: `kamiyo-api` service → `Environment`
2. Key: `GITHUB_TOKEN`
3. Value: `ghp_...`

**Benefits:**
- Aggregate security advisories from GitHub
- Higher API rate limits

---

### 8. Monitoring & Error Tracking (OPTIONAL - Highly Recommended)

#### `SENTRY_DSN` (OPTIONAL)

**Description:** Sentry DSN for backend error tracking

**Obtaining:**
1. Sign up: https://sentry.io
2. Create new project (Python/FastAPI)
3. Copy DSN from project settings

**Render.com Setup:**
1. Add to: `kamiyo-api` service → `Environment`
2. Key: `SENTRY_DSN`
3. Value: `https://***@sentry.io/***`

---

#### `NEXT_PUBLIC_SENTRY_DSN` (OPTIONAL)

**Description:** Sentry DSN for frontend error tracking

**Obtaining:**
1. Create new Sentry project (Next.js)
2. Copy DSN

**Render.com Setup:**
1. Add to: `kamiyo-frontend` service → `Environment`
2. Key: `NEXT_PUBLIC_SENTRY_DSN`
3. Value: `https://***@sentry.io/***`

**Benefits:**
- Real-time error alerting
- Performance monitoring
- User session replay
- Release tracking

---

### 9. Alert Channels (OPTIONAL)

#### `DISCORD_WEBHOOK` (OPTIONAL)

**Description:** Discord webhook URL for exploit alerts

**Obtaining:**
1. Discord Server Settings → Integrations → Webhooks
2. Create webhook
3. Copy URL

**Render.com Setup:**
1. Add to: `kamiyo-api` service → `Environment`
2. Key: `DISCORD_WEBHOOK`
3. Value: `https://discord.com/api/webhooks/...`

---

#### `TELEGRAM_BOT_TOKEN` (OPTIONAL)

**Description:** Telegram bot token for alerts

**Obtaining:**
1. Chat with @BotFather on Telegram
2. Create new bot with `/newbot`
3. Copy token

**Render.com Setup:**
1. Add to: `kamiyo-api` service → `Environment`
2. Key: `TELEGRAM_BOT_TOKEN`
3. Value: `[Bot token]`

---

#### `TELEGRAM_CHAT_ID` (OPTIONAL)

**Description:** Telegram chat ID for sending alerts

**Obtaining:**
1. Add bot to channel/group
2. Send a message
3. Visit: `https://api.telegram.org/bot[TOKEN]/getUpdates`
4. Find `chat.id` in response

**Render.com Setup:**
1. Add to: `kamiyo-api` service → `Environment`
2. Key: `TELEGRAM_CHAT_ID`
3. Value: `[Chat ID]`

---

#### `SLACK_WEBHOOK` (OPTIONAL)

**Description:** Slack webhook URL for alerts

**Obtaining:**
1. Slack App Directory → Incoming Webhooks
2. Add to workspace
3. Copy webhook URL

**Render.com Setup:**
1. Add to: `kamiyo-api` service → `Environment`
2. Key: `SLACK_WEBHOOK`
3. Value: `https://hooks.slack.com/services/...`

---

### 10. Logging Configuration (OPTIONAL)

#### `LOG_LEVEL` (OPTIONAL)

**Description:** Application logging verbosity

**Production Value:** `INFO` or `WARNING`

**Options:**
- `DEBUG` - Very verbose (not for production)
- `INFO` - Standard (recommended)
- `WARNING` - Errors and warnings only
- `ERROR` - Errors only
- `CRITICAL` - Critical errors only

**Render.com Setup:**
```yaml
envVars:
  - key: LOG_LEVEL
    value: INFO
```

---

## Environment Variables Checklist

### Required (MUST be set)

- [ ] `DATABASE_URL` - PostgreSQL connection (auto-configured)
- [ ] `ENVIRONMENT` - Set to `production`
- [ ] `ALLOWED_ORIGINS` - HTTPS origins only
- [ ] `ADMIN_API_KEY` - Admin endpoint auth
- [ ] `JWT_SECRET` - Min 32 chars
- [ ] `NEXTAUTH_SECRET` - Min 32 chars
- [ ] `NEXTAUTH_URL` - Exact deployment URL
- [ ] `STRIPE_SECRET_KEY` - Live key (sk_live_...)
- [ ] `STRIPE_PUBLISHABLE_KEY` - Live key (pk_live_...)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Same as above
- [ ] `STRIPE_WEBHOOK_SECRET` - From Stripe Dashboard
- [ ] `NEXT_PUBLIC_API_URL` - API domain (auto-configured)
- [ ] `NEXT_PUBLIC_API_ENDPOINT` - Same as above

### Highly Recommended

- [ ] `REDIS_URL` - For caching and rate limiting
- [ ] `SENTRY_DSN` - Backend error tracking
- [ ] `NEXT_PUBLIC_SENTRY_DSN` - Frontend error tracking
- [ ] `ETHERSCAN_API_KEY` - On-chain verification

### Optional

- [ ] `GITHUB_TOKEN` - Security advisories
- [ ] `DISCORD_WEBHOOK` - Discord alerts
- [ ] `TELEGRAM_BOT_TOKEN` - Telegram alerts
- [ ] `TELEGRAM_CHAT_ID` - Telegram chat
- [ ] `SLACK_WEBHOOK` - Slack alerts
- [ ] `LOG_LEVEL` - Logging verbosity

---

## Setting Environment Variables in Render.com

### Method 1: Render Dashboard (Recommended)

1. Log in to Render Dashboard
2. Select service (kamiyo-api or kamiyo-frontend)
3. Navigate to `Environment` tab
4. Click `Add Environment Variable`
5. Enter Key and Value
6. Click `Save Changes`
7. Service will automatically redeploy

### Method 2: Secret Groups (For Multiple Services)

1. Navigate to account dashboard
2. Click `Environment` → `Secret Groups`
3. Create new group (e.g., "Kamiyo Production")
4. Add secrets
5. Link to services in render.yaml:
   ```yaml
   envVars:
     - fromGroup: kamiyo-production
   ```

### Method 3: render.yaml (For Non-Secrets)

Add to render.yaml:
```yaml
services:
  - type: web
    name: kamiyo-api
    envVars:
      - key: ENVIRONMENT
        value: production
      - key: LOG_LEVEL
        value: INFO
```

---

## Validation

After setting all environment variables:

### 1. Run Validation Script

```bash
# From project root
./scripts/validate_env.sh production
```

### 2. Check Render Dashboard

1. Navigate to each service
2. Click `Environment` tab
3. Verify all required variables are set
4. Check for any warning icons

### 3. Test Deployment

```bash
# Trigger manual deployment
render deploy --service kamiyo-api
render deploy --service kamiyo-frontend

# Monitor logs
render logs --service kamiyo-api --tail
render logs --service kamiyo-frontend --tail
```

### 4. Verify Live Services

```bash
# API health
curl https://api.kamiyo.ai/health

# Frontend
curl -I https://kamiyo.ai

# Stripe webhook
curl https://api.kamiyo.ai/api/v1/webhooks/stripe -X POST \
  -H "Content-Type: application/json" \
  -d '{}'
# Should return 400 (missing signature) not 500
```

---

## Security Best Practices

### 1. Secret Management

- [ ] Never commit secrets to git
- [ ] Use different secrets per environment
- [ ] Store backups in secure vault (1Password, Vault)
- [ ] Rotate secrets every 90 days
- [ ] Use Render's built-in secret management

### 2. Access Control

- [ ] Limit who can view/edit production env vars
- [ ] Use Render RBAC for team access
- [ ] Enable 2FA on Render account
- [ ] Audit access logs regularly

### 3. Secret Rotation Plan

**JWT_SECRET & NEXTAUTH_SECRET:**
- Rotation invalidates all sessions
- Schedule during low-traffic period
- Notify users in advance
- Have rollback plan

**STRIPE Keys:**
- Stripe supports rolling secret rotation
- Test webhooks after rotation
- Update all services simultaneously

**API Keys (External Services):**
- Rotate if suspicious activity
- Keep old key active during transition
- Verify integration still works

### 4. Incident Response

**If secret is exposed:**

1. **Immediate (< 5 minutes):**
   - Rotate the exposed secret
   - Check access logs for unauthorized use
   - Deploy with new secret

2. **Short-term (< 1 hour):**
   - Review how exposure occurred
   - Update processes to prevent recurrence
   - Document in incident report

3. **Long-term (< 24 hours):**
   - Conduct security audit
   - Update team training
   - Review all other secrets

---

## Troubleshooting

### Issue: "DATABASE_URL not set"

**Solution:**
- Check render.yaml has correct `fromDatabase` configuration
- Verify database service name matches exactly
- Redeploy service

### Issue: "CORS error" in browser

**Solution:**
- Verify ALLOWED_ORIGINS includes frontend domain
- Check no trailing slashes
- Ensure HTTPS in production
- Clear browser cache

### Issue: "Stripe webhook signature verification failed"

**Solution:**
- Verify STRIPE_WEBHOOK_SECRET matches Stripe Dashboard
- Check webhook endpoint URL is correct
- Ensure secret is from correct endpoint (test vs live)
- Redeploy API service

### Issue: "NextAuth CSRF token mismatch"

**Solution:**
- Verify NEXTAUTH_URL exactly matches deployment URL
- Remove trailing slash from NEXTAUTH_URL
- Clear browser cookies
- Regenerate NEXTAUTH_SECRET

---

## Deployment Tiers & Recommendations

### Render.com Service Plans

**Starter Plan (Current):**
- Database: 256 MB RAM, 1 GB storage
- Web Services: 512 MB RAM, 0.5 CPU
- Cost: ~$25/month
- Best for: MVP, early production

**Professional Plan (Recommended for Scale):**
- Database: 4 GB RAM, 16 GB storage
- Web Services: 2 GB RAM, 1 CPU
- Cost: ~$85/month
- Best for: Growing user base

**Upgrade Triggers:**
- Database > 80% capacity
- Response times > 1s consistently
- > 1000 active users
- > 100 req/min sustained

---

## Change Log

| Date       | Change                           | Author    |
|------------|----------------------------------|-----------|
| 2025-10-14 | Initial production setup guide   | Agent ALPHA-DEPLOY |

---

**Last Updated:** 2025-10-14
**Document Owner:** DevOps Team
**Review Cycle:** Monthly or after significant changes
