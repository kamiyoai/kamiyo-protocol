# Kamiyo Platform Integration Guide

This document explains how the exploit intelligence platform is integrated into the Kamiyo website.

## Architecture

The Kamiyo website is a Next.js application that serves as the frontend for the exploit intelligence platform. The backend is a FastAPI application that aggregates exploit data from multiple sources.

```
┌─────────────────────────────────────┐
│   Next.js Website (Port 3000)      │
│   - Landing page (exploit dashboard)│
│   - Existing pages (about, services)│
│   - Header/Footer/Layout            │
│   - Payment/Subscription UI         │
└────────────┬────────────────────────┘
             │
             │ API Routes (proxy)
             ├──────────────────────────────┐
             │                              │
┌────────────▼────────────┐    ┌───────────▼──────────┐
│  FastAPI Backend        │    │  Stripe API          │
│  (Port 8000)            │    │  (Payments)          │
│  - Exploit data         │    └──────────────────────┘
│  - Stats/Health         │
│  - WebSocket feeds      │
└─────────────────────────┘
```

## File Structure

### Frontend Components
```
website/
├── pages/
│   ├── index.js                    # NEW: Exploit dashboard (replaces old landing)
│   ├── api/
│   │   ├── exploits.js            # NEW: Proxy to FastAPI /exploits
│   │   ├── stats.js               # NEW: Proxy to FastAPI /stats
│   │   ├── chains.js              # NEW: Proxy to FastAPI /chains
│   │   ├── health.js              # NEW: Proxy to FastAPI /health
│   │   └── exploits/
│   │       └── subscribe.js       # NEW: Subscription endpoint
│   └── [existing pages...]
├── components/
│   ├── dashboard/                 # NEW: Dashboard components
│   │   ├── StatsCard.js
│   │   ├── ExploitsTable.js
│   │   └── DashboardFilters.js
│   └── [existing components...]
```

### Backend (FastAPI)
```
api/
├── main.py                        # FastAPI app with all routes
├── payments/                      # Stripe payment integration
├── subscriptions/                 # Subscription management
└── [other modules...]
```

## Environment Variables

Create `.env.local` in the website directory:

```bash
# FastAPI Backend
FASTAPI_URL=http://localhost:8000

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Subscription Tiers (Stripe Price IDs)
STRIPE_PRICE_FREE=price_...
STRIPE_PRICE_BASIC=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/kamiyo
```

## Subscription Tiers

The platform offers 4 subscription tiers:

### Free Tier
- View recent exploits (last 7 days)
- Basic stats
- No API access

### Basic ($29/month)
- Full exploit history
- Email alerts
- API access (1000 calls/month)
- Discord/Telegram bot integration

### Pro ($99/month)
- Everything in Basic
- WebSocket real-time feeds
- API access (10,000 calls/month)
- Custom filters
- Priority support

### Enterprise ($499/month)
- Everything in Pro
- Unlimited API access
- Dedicated support
- Custom integrations
- SLA guarantees

## Running the Platform

### 1. Start FastAPI Backend
```bash
cd /path/to/exploit-intel-platform
python -m uvicorn api.main:app --reload --port 8000
```

### 2. Start Next.js Website
```bash
cd /path/to/exploit-intel-platform/website
npm install
npm run dev
```

### 3. Start Aggregators (Optional)
```bash
cd /path/to/exploit-intel-platform
python aggregators/orchestrator.py
```

## API Routes (Next.js → FastAPI)

The Next.js application proxies requests to the FastAPI backend:

| Next.js Route | FastAPI Route | Description |
|--------------|---------------|-------------|
| `/api/exploits` | `/exploits` | Get exploits with pagination |
| `/api/stats` | `/stats` | Get statistics |
| `/api/chains` | `/chains` | Get blockchain list |
| `/api/health` | `/health` | Get system health |

## Payment Flow

1. User clicks "Subscribe for Alerts" on landing page
2. Redirected to `/auth/signin` if not logged in
3. After login, redirected to subscription selection
4. Stripe checkout session created
5. On success, webhook updates user subscription
6. User gains access to premium features

## Design System

The integration uses the KamiyoAI design system:

- **Colors**: Black background, magenta/cyan gradients
- **Font**: Atkinson Hyperlegible Mono
- **Buttons**: Skewed borders with dotted lines, gradient effects
- **Cards**: Hover effects with gradient borders
- **Animations**: Gradient moves, scramble text effects

## Development Tips

### Testing API Connection
```bash
# Test FastAPI directly
curl http://localhost:8000/health

# Test through Next.js proxy
curl http://localhost:3000/api/health
```

### Debugging
- FastAPI logs: Check terminal running `uvicorn`
- Next.js logs: Check terminal running `npm run dev`
- Browser console: Check for API errors

### Database
The platform uses SQLite for development:
```bash
ls data/kamiyo.db
sqlite3 data/kamiyo.db "SELECT COUNT(*) FROM exploits;"
```

## Production Deployment

### Next.js (Vercel)
```bash
# Deploy to Vercel
vercel --prod
```

### FastAPI (Railway/Render)
```bash
# Build Docker image
docker build -f Dockerfile.api.prod -t kamiyo-api .

# Deploy to Railway
railway up
```

### Environment Variables (Production)
Update `FASTAPI_URL` to production URL:
```
FASTAPI_URL=https://api.kamiyo.ai
ALLOWED_ORIGINS=https://kamiyo.ai,https://www.kamiyo.ai
```

## Monitoring

- **API Health**: `/health` endpoint
- **WebSocket**: Monitor connections in FastAPI logs
- **Stripe**: Dashboard at stripe.com
- **Database**: Monitor exploit count and update times

## Support

For issues:
1. Check logs in both Next.js and FastAPI
2. Verify environment variables
3. Test API endpoints individually
4. Check Stripe webhook configuration
