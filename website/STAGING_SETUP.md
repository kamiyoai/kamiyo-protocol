# Kamiyo Staging Environment Setup - Render.com

## Quick Start

### 1. Environment Files

**Main .env file location:** `/Users/dennisgoslar/Projekter/kamiyo/website/.env`

**For staging, copy and customize:**
```bash
cp /Users/dennisgoslar/Projekter/kamiyo/website/.env.production.template .env.staging
```

### 2. Required Environment Variables

Create a `.env.staging` file with these **REQUIRED** variables:

```bash
# ================================
# CRITICAL: Core Configuration
# ================================

# Environment
NODE_ENV=staging
ENVIRONMENT=staging

# Database (Render PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/kamiyo_staging

# NextAuth Configuration
NEXTAUTH_URL=https://kamiyo-staging.onrender.com
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>

# API URLs
FASTAPI_URL=https://kamiyo-api-staging.onrender.com
NEXT_PUBLIC_API_URL=https://kamiyo-api-staging.onrender.com
NEXT_PUBLIC_API_ENDPOINT=https://kamiyo-api-staging.onrender.com

# ================================
# Stripe Configuration (REQUIRED)
# ================================
STRIPE_SECRET_KEY=sk_test_your_test_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key_here

# Stripe Price IDs for staging/test mode
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_test_xxx_pro
NEXT_PUBLIC_STRIPE_PRICE_TEAM=price_test_xxx_team
NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE=price_test_xxx_enterprise

# ================================
# Google OAuth (for signin)
# ================================
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# ================================
# Admin API Key
# ================================
ADMIN_API_KEY=<generate secure random string>

# ================================
# Optional: Social Media (Disable for staging)
# ================================
X_TWITTER_ENABLED=false
DISCORD_SOCIAL_ENABLED=false
REDDIT_ENABLED=false
TELEGRAM_SOCIAL_ENABLED=false

# ================================
# Optional: Claude AI (for deep dive analysis)
# ================================
ANTHROPIC_API_KEY=sk-ant-your-key-here

# ================================
# Allowed Origins (CORS)
# ================================
ALLOWED_ORIGINS=https://kamiyo-staging.onrender.com

# ================================
# Monitoring (Optional)
# ================================
SENTRY_DSN=  # Leave empty for staging
LOG_LEVEL=DEBUG
```

---

## 3. Render.com Setup Steps

### Step 1: Create a New Web Service (Frontend)

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name:** `kamiyo-staging-frontend`
   - **Branch:** `main` (or create a `staging` branch)
   - **Root Directory:** `website`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npx prisma generate && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** `Starter` ($7/month) or `Free`

### Step 2: Create PostgreSQL Database

1. Click **"New +"** → **"PostgreSQL"**
2. Configure:
   - **Name:** `kamiyo-staging-postgres`
   - **Database:** `kamiyo_staging`
   - **User:** `kamiyo`
   - **Region:** Same as your web service
   - **Plan:** `Starter` ($7/month) or `Free`

3. **Copy the Internal Connection String** - you'll need this for `DATABASE_URL`

### Step 3: Create API Service (Backend)

1. Click **"New +"** → **"Web Service"**
2. Configure:
   - **Name:** `kamiyo-staging-api`
   - **Branch:** `main`
   - **Root Directory:** `website`
   - **Runtime:** `Python`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** `Starter` ($7/month) or `Free`

### Step 4: Set Environment Variables in Render

For **Frontend Service** (`kamiyo-staging-frontend`):

Go to **Environment** tab and add all variables from `.env.staging`:

**Essential variables:**
- `NODE_ENV` = `staging`
- `DATABASE_URL` = (from PostgreSQL internal connection string)
- `NEXTAUTH_URL` = `https://kamiyo-staging.onrender.com`
- `NEXTAUTH_SECRET` = (generate: `openssl rand -base64 32`)
- `NEXT_PUBLIC_API_URL` = `https://kamiyo-api-staging.onrender.com`
- `STRIPE_SECRET_KEY` = (your test key)
- `STRIPE_WEBHOOK_SECRET` = (your webhook secret)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = (your test publishable key)
- `GOOGLE_CLIENT_ID` = (your OAuth client ID)
- `GOOGLE_CLIENT_SECRET` = (your OAuth client secret)

For **API Service** (`kamiyo-staging-api`):

- `PYTHON_VERSION` = `3.11`
- `ENVIRONMENT` = `staging`
- `DATABASE_URL` = (from PostgreSQL internal connection string)
- `ALLOWED_ORIGINS` = `https://kamiyo-staging.onrender.com`
- `STRIPE_SECRET_KEY` = (your test key)
- `ADMIN_API_KEY` = (generate secure random string)

---

## 4. Database Setup

After deployment, initialize the database:

### Option A: Using Prisma (Recommended)
```bash
# SSH into your frontend service (Render Shell)
npx prisma migrate deploy
npx prisma db push
```

### Option B: Using PostgreSQL Scripts
```bash
# Connect to PostgreSQL database via Render Shell
psql $DATABASE_URL -f database/init_postgres.sql
```

---

## 5. Configure Stripe Webhooks

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/test/webhooks)
2. Click **"Add endpoint"**
3. Set endpoint URL: `https://kamiyo-staging.onrender.com/api/webhooks/stripe`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Signing secret** → Add to `STRIPE_WEBHOOK_SECRET` env var

---

## 6. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URIs:
   - `https://kamiyo-staging.onrender.com/api/auth/callback/google`
4. Copy **Client ID** and **Client Secret** to env vars

---

## 7. Post-Deployment Verification

### Test Checklist:

```bash
# 1. Health Check
curl https://kamiyo-api-staging.onrender.com/health

# 2. Database connection
curl https://kamiyo-api-staging.onrender.com/api/stats

# 3. Frontend loads
open https://kamiyo-staging.onrender.com

# 4. Sign in works
# Go to: https://kamiyo-staging.onrender.com/auth/signin

# 5. API endpoints work
curl https://kamiyo-api-staging.onrender.com/api/exploits?page=1&page_size=5
```

---

## 8. Optional: Deploy with render.yaml

You can also use the Blueprint YAML for automated deployment:

1. Copy `render.yaml` to `render.staging.yaml`
2. Update service names (add `-staging` suffix)
3. Update branch to `staging` (if using separate branch)
4. In Render Dashboard: **"New +"** → **"Blueprint"**
5. Select your repo and `render.staging.yaml`

---

## 9. Differences from Production

| Component | Production | Staging |
|-----------|-----------|---------|
| Database | Full backups, larger instance | Smaller instance, daily backups |
| Stripe | Live keys | Test keys |
| Social posting | Enabled | Disabled |
| Log level | INFO | DEBUG |
| Rate limits | Strict | Relaxed |
| Monitoring | Full Sentry/alerts | Basic logging |

---

## 10. Troubleshooting

### Build fails:
- Check `package.json` has all dependencies
- Verify Node version is 18.20.8+
- Check build logs in Render dashboard

### Database connection fails:
- Verify `DATABASE_URL` is the **Internal Connection String**
- Check database is in the same region as web service
- Run migrations: `npx prisma migrate deploy`

### Authentication fails:
- Check `NEXTAUTH_URL` matches your frontend URL
- Verify `NEXTAUTH_SECRET` is set
- Check Google OAuth redirect URIs

### Stripe webhooks fail:
- Verify webhook endpoint URL is correct
- Check `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
- Test with Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

---

## 11. Costs Estimate (Render.com)

| Service | Plan | Cost |
|---------|------|------|
| Frontend (Web Service) | Starter | $7/mo |
| API (Web Service) | Starter | $7/mo |
| PostgreSQL | Starter | $7/mo |
| **Total** | | **$21/mo** |

Or use **Free tier** for all services (limited resources, sleeps after inactivity).

---

## 12. Quick Commands

```bash
# Generate secrets
openssl rand -base64 32

# Check environment
echo $DATABASE_URL

# Test database connection
psql $DATABASE_URL

# View logs (from Render dashboard)
# Go to service → Logs tab

# Deploy from CLI
git push origin main  # Triggers auto-deploy if connected
```

---

## Need Help?

- **Render Docs:** https://render.com/docs
- **Stripe Test Mode:** https://stripe.com/docs/testing
- **NextAuth Docs:** https://next-auth.js.org/configuration/options
- **Troubleshooting Guide:** `/Users/dennisgoslar/Projekter/kamiyo/website/docs/TROUBLESHOOTING.md`

---

**Last Updated:** 2025-10-18
