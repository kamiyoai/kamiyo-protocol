# Kamiyo Platform - Quick Start Guide

This guide will help you get the integrated Kamiyo platform running locally in under 5 minutes.

## Prerequisites

- Node.js 18+ and npm
- Python 3.9+
- SQLite (comes with Python)

## Step 1: Set Up Environment Variables

Create `.env.local` in the `website/` directory:

```bash
cd website
cp .env.local.example .env.local
```

Edit `.env.local` with minimum required values:

```env
# FastAPI Backend
FASTAPI_URL=http://localhost:8000

# NextAuth (generate a random secret)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-super-secret-key-here

# Stripe (optional for testing, use test keys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## Step 2: Install Dependencies

### Backend (FastAPI)
```bash
cd /path/to/exploit-intel-platform
pip install -r requirements.txt
```

### Frontend (Next.js)
```bash
cd website
npm install
```

## Step 3: Set Up Database

The platform uses SQLite for development. Initialize it:

```bash
cd /path/to/exploit-intel-platform
python -c "from database import get_db; db = get_db(); print(f'Database initialized with {db.get_total_exploits()} exploits')"
```

If you don't have exploit data yet, you can run an aggregator to fetch some:

```bash
# Run a single aggregator for testing (e.g., Rekt News)
python aggregators/rekt_news.py
```

## Step 4: Start the Backend

In terminal 1:

```bash
cd /path/to/exploit-intel-platform
python -m uvicorn api.main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

Test it:
```bash
curl http://localhost:8000/health
```

## Step 5: Start the Frontend

In terminal 2:

```bash
cd /path/to/exploit-intel-platform/website
npm run dev
```

You should see:
```
ready - started server on 0.0.0.0:3000, url: http://localhost:3000
```

## Step 6: Open the Application

Open your browser to: **http://localhost:3000**

You should see:
- ✅ **Hero section** with "Kamiyo" gradient text
- ✅ **Stats cards** showing exploit statistics
- ✅ **Subscribe button** with scramble effect
- ✅ **Filters section** (chain, amount, protocol)
- ✅ **Exploits table** with recent exploits
- ✅ **Features section** at bottom

## Troubleshooting

### Issue: "Failed to fetch exploits"

**Cause**: FastAPI backend not running or database empty

**Solution**:
```bash
# Terminal 1: Check if backend is running
curl http://localhost:8000/health

# If database is empty, run an aggregator
python aggregators/rekt_news.py
```

### Issue: "Module not found" errors

**Cause**: Missing dependencies

**Solution**:
```bash
# Backend
pip install -r requirements.txt

# Frontend
cd website && npm install
```

### Issue: Styles not loading correctly

**Cause**: Tailwind CSS not compiling

**Solution**:
```bash
cd website
rm -rf .next
npm run dev
```

### Issue: API routes return 500 errors

**Cause**: FASTAPI_URL not set correctly

**Solution**: Check `.env.local`:
```env
FASTAPI_URL=http://localhost:8000
```

## Testing Checklist

Once running, verify these features work:

### Landing Page
- [ ] Page loads without errors
- [ ] Stats cards show real numbers (not "-")
- [ ] Subscribe button has scramble text effect on hover
- [ ] Filters section displays correctly
- [ ] Exploits table shows data
- [ ] Pagination works (if >20 exploits)

### Navigation
- [ ] Header menu slides out when clicked
- [ ] Navigation links work (About, Services, etc.)
- [ ] Footer displays correctly
- [ ] All existing pages still work

### API Endpoints
Test these in your browser or with curl:
```bash
# Health check
curl http://localhost:3000/api/health

# Statistics
curl http://localhost:3000/api/stats?days=7

# Chains
curl http://localhost:3000/api/chains

# Exploits
curl http://localhost:3000/api/exploits?page=1&page_size=20
```

## Next Steps

### Add More Data
Run the orchestrator to fetch from all sources:
```bash
python aggregators/orchestrator.py
```

### Set Up Stripe (for subscriptions)
1. Create Stripe account at https://stripe.com
2. Get test API keys from dashboard
3. Add to `.env.local`
4. Create products/prices in Stripe
5. Add price IDs to `.env.local`

### Deploy to Production
See `INTEGRATION_README.md` for deployment instructions.

## Quick Commands Reference

```bash
# Start backend
python -m uvicorn api.main:app --reload --port 8000

# Start frontend
cd website && npm run dev

# Run aggregators
python aggregators/orchestrator.py

# Check database
sqlite3 data/kamiyo.db "SELECT COUNT(*) FROM exploits;"

# Check backend logs
# (Look at terminal running uvicorn)

# Check frontend logs
# (Look at terminal running npm run dev)

# Build for production
cd website && npm run build
```

## Support

If you encounter issues:
1. Check both terminal outputs for errors
2. Verify environment variables in `.env.local`
3. Ensure ports 3000 and 8000 are not in use
4. Clear browser cache and try again
5. Check `INTEGRATION_README.md` for detailed troubleshooting

## What's Next?

- Customize subscription tiers in `/pages/pricing`
- Add custom aggregators in `/aggregators`
- Configure alerts in `/alerts`
- Set up Discord/Telegram bots
- Deploy to production

Happy hacking! 🚀
