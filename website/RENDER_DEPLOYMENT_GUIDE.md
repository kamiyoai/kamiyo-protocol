# Kamiyo Render.com Deployment Guide

## Prerequisites
- GitHub repository with latest code pushed
- Render.com account
- Stripe account (for payment processing)

## Step 1: Push Latest Changes to GitHub

```bash
cd ~/project/Projekter/kamiyo
git add .
git commit -m "feat: Production deployment setup for Render.com"
git push origin master
```

## Step 2: Create PostgreSQL Database

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"PostgreSQL"**
3. Configure database:
   - **Name**: `kamiyo-db`
   - **Database**: `kamiyo`
   - **User**: `kamiyo`
   - **Region**: Choose closest to your users
   - **Plan**: Free (or paid for production)
4. Click **"Create Database"**
5. Wait for database to be provisioned

## Step 3: Initialize Database Schema

Once database is ready:

1. In Render dashboard, go to your database
2. Click **"Connect"** → Copy the **"External Database URL"**
3. Use a PostgreSQL client (or Render's shell) to run:

```bash
psql <your-external-database-url> < database/init_postgres.sql
```

Or use Render's shell:
1. Go to database → **"Shell"** tab
2. Paste contents of `database/init_postgres.sql`
3. Execute

## Step 4: Deploy Using render.yaml

### Option A: Automatic Deployment (Recommended)

1. Go to Render Dashboard
2. Click **"New +"** → **"Blueprint"**
3. Connect your GitHub repository
4. Select your repository
5. Render will detect `render.yaml` automatically
6. Click **"Apply"**

Render will create:
- `kamiyo-api` (FastAPI backend)
- `kamiyo-frontend` (Next.js frontend)
- `kamiyo-db` (PostgreSQL database)

### Option B: Manual Service Creation

If automatic deployment doesn't work:

#### Create Backend Service:
1. **"New +"** → **"Web Service"**
2. Connect GitHub repository
3. Configure:
   - **Name**: `kamiyo-api`
   - **Environment**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Free or paid
4. Add environment variables (see Step 5)

#### Create Frontend Service:
1. **"New +"** → **"Web Service"**
2. Connect GitHub repository
3. Configure:
   - **Name**: `kamiyo-frontend`
   - **Environment**: Node
   - **Build Command**: `cd website && npm install && npm run build`
   - **Start Command**: `cd website && npm start`
   - **Plan**: Free or paid
4. Add environment variables (see Step 5)

## Step 5: Configure Environment Variables

### Backend (kamiyo-api) Environment Variables:

```bash
# Auto-configured by Render (from render.yaml)
DATABASE_URL=<automatically linked from kamiyo-db>

# Required - Add these manually:
CORS_ORIGINS=https://your-frontend-url.onrender.com
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Frontend (kamiyo-frontend) Environment Variables:

```bash
# Auto-configured by Render (from render.yaml)
FASTAPI_URL=<automatically linked from kamiyo-api>
DATABASE_URL=<automatically linked from kamiyo-db>
PORT=3001

# Required - Add these manually:
NEXTAUTH_URL=https://your-frontend-url.onrender.com
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

## Step 6: Get Stripe Credentials

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. **API Keys**:
   - Copy **"Publishable key"** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - Copy **"Secret key"** → `STRIPE_SECRET_KEY`
3. **Webhook Secret**:
   - Go to **Developers** → **Webhooks**
   - Click **"Add endpoint"**
   - URL: `https://your-backend-url.onrender.com/api/v1/webhooks/stripe`
   - Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`
   - Copy **"Signing secret"** → `STRIPE_WEBHOOK_SECRET`

## Step 7: Configure NextAuth

Generate a secure secret:

```bash
openssl rand -base64 32
```

Add to both services as `NEXTAUTH_SECRET`.

## Step 8: Verify Deployment

### Test Health Endpoints:

**Backend:**
```bash
curl https://kamiyo-api.onrender.com/health
```

Expected response:
```json
{
  "database_exploits": 0,
  "tracked_chains": 7,
  "active_sources": 5,
  "total_sources": 5,
  "sources": [...]
}
```

**Frontend:**
```bash
curl https://kamiyo-frontend.onrender.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "frontend",
  "backend": "connected",
  "timestamp": "2025-10-09T..."
}
```

## Step 9: Test the Application

1. Visit your frontend URL: `https://kamiyo-frontend.onrender.com`
2. Test the dashboard loads correctly
3. Check API proxy routes work
4. Test authentication (sign in/sign up)
5. Verify payment flow (if needed)

## Step 10: Configure Custom Domain (Optional)

1. Go to frontend service settings
2. **"Custom Domains"** → **"Add Custom Domain"**
3. Enter your domain (e.g., `kamiyo.ai`)
4. Add CNAME record to your DNS:
   - **Type**: CNAME
   - **Name**: @ or www
   - **Value**: Your Render URL

## Troubleshooting

### Build Failures

**Frontend fails with "Module not found":**
- Ensure all dependencies are in `website/package.json`
- Check build command includes `cd website && npm install`

**Backend fails with "No module named...":**
- Ensure all dependencies are in `requirements.txt`
- Check Python version is 3.11

### Database Connection Issues

**"Connection refused" errors:**
- Verify `DATABASE_URL` is set correctly
- Check database is in same region as services
- Ensure `database.py` handles postgres:// → postgresql:// conversion

### Health Check Failures

**Service keeps restarting:**
- Check logs for errors
- Verify health check paths are correct:
  - Backend: `/health`
  - Frontend: `/api/health`
- Ensure timeout is reasonable (5 seconds)

### CORS Errors

**Frontend can't reach backend:**
- Add frontend URL to backend `CORS_ORIGINS`
- Format: `https://kamiyo-frontend.onrender.com` (no trailing slash)
- Include both `www` and non-`www` if using custom domain

## Monitoring

### View Logs:
1. Go to service in Render dashboard
2. Click **"Logs"** tab
3. Filter by level (Info, Warning, Error)

### Monitor Health:
- Backend: `https://kamiyo-api.onrender.com/health`
- Frontend: `https://kamiyo-frontend.onrender.com/api/health`

### Set Up Alerts:
1. Service settings → **"Alerts"**
2. Configure email/Slack notifications
3. Set thresholds for CPU, memory, errors

## Cost Optimization

### Free Tier Limits:
- **Database**: 1GB storage, 100 connections
- **Web Services**: 750 hours/month (per service)
- **Bandwidth**: 100GB/month

### Upgrade When Needed:
- Database hits 1GB → Upgrade to Starter ($7/month)
- Services need more hours → Upgrade to Starter ($7/month each)
- Need better performance → Professional plans available

## Next Steps

1. ✅ Deploy to Render
2. ✅ Configure environment variables
3. ✅ Set up custom domain
4. ⬜ Configure monitoring/alerts
5. ⬜ Set up CI/CD for auto-deployment
6. ⬜ Add staging environment
7. ⬜ Configure CDN for static assets

## Support

- **Render Docs**: https://render.com/docs
- **Kamiyo Issues**: Create issue in GitHub repo
- **Render Community**: https://community.render.com/

---

**Deployment prepared**: 2025-10-09
**Files created**: render.yaml, database.py, init_postgres.sql, health.js, healthz.js
