# Stripe Payment Integration - Quick Start Guide

## Setup Instructions

### 1. Install Dependencies

```bash
cd ~/project/Projekter/exploit-intel-platform
pip install -r requirements.txt
```

### 2. Configure Stripe

#### Get Stripe API Keys
1. Sign up at https://stripe.com
2. Navigate to Developers > API Keys
3. Copy your keys:
   - **Test mode**: `sk_test_...` and `pk_test_...`
   - **Live mode**: `sk_live_...` and `pk_live_...`

#### Create Stripe Products & Prices
1. Go to Products in Stripe Dashboard
2. Create three products:
   - **Basic** - $29/month
   - **Pro** - $99/month
   - **Enterprise** - $499/month
3. Copy the Price IDs (e.g., `price_1234567890`)

### 3. Set Environment Variables

Create `.env` file:

```bash
# Test mode (for development)
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_PUBLISHABLE_KEY=pk_test_51...

# Price IDs from Stripe Dashboard
STRIPE_PRICE_BASIC=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...

# Database (from Day 1)
DATABASE_URL=postgresql://user:password@localhost/kamiyo

# Redis (from Day 3)
REDIS_URL=redis://localhost:6379/0
```

### 4. Run Database Migration

```bash
# Apply the payment tables migration
psql $DATABASE_URL -f database/migrations/002_payment_tables.sql
```

### 5. Start the API

```bash
cd ~/project/Projekter/exploit-intel-platform
uvicorn api.main:app --reload --port 8000
```

### 6. Test the Integration

Visit the API docs: http://localhost:8000/docs

## API Usage Examples

### 1. Create a Customer

```bash
curl -X POST http://localhost:8000/api/v1/payments/customers \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "name": "John Doe",
    "metadata": {"user_type": "developer"}
  }'
```

Response:
```json
{
  "id": 1,
  "stripe_customer_id": "cus_...",
  "user_id": 1,
  "email": "customer@example.com",
  "name": "John Doe",
  "metadata": {"user_type": "developer"},
  "created_at": "2024-10-07T19:00:00Z",
  "updated_at": "2024-10-07T19:00:00Z"
}
```

### 2. Create a Subscription

```bash
curl -X POST http://localhost:8000/api/v1/payments/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": 1,
    "price_id": "price_...",
    "tier": "pro",
    "metadata": {"source": "website"}
  }'
```

### 3. Get Pricing Plans

```bash
curl http://localhost:8000/api/v1/payments/plans
```

Response:
```json
{
  "plans": {
    "free": {
      "name": "Free",
      "price": 0,
      "rate_limit": 10,
      "features": ["Basic alerts", "10 API calls/hour", ...]
    },
    "basic": {
      "name": "Basic",
      "price": 29,
      "rate_limit": 100,
      "features": ["Real-time alerts", "100 API calls/hour", ...]
    },
    "pro": {
      "name": "Pro",
      "price": 99,
      "rate_limit": 1000,
      "features": ["Priority alerts", "1000 API calls/hour", ...]
    }
  }
}
```

### 4. Get Customer

```bash
curl http://localhost:8000/api/v1/payments/customers/1
```

### 5. Cancel Subscription

```bash
curl -X DELETE http://localhost:8000/api/v1/payments/subscriptions/1 \
  -H "Content-Type: application/json" \
  -d '{
    "cancel_immediately": false,
    "cancellation_reason": "Too expensive"
  }'
```

### 6. Health Check

```bash
curl http://localhost:8000/api/v1/payments/health
```

Response:
```json
{
  "status": "healthy",
  "stripe_configured": true,
  "test_mode": true,
  "api_version": "2023-10-16",
  "webhook_configured": false
}
```

## Testing with Stripe Test Cards

Use these test cards in Stripe test mode:

| Card Number | Result |
|-------------|--------|
| 4242 4242 4242 4242 | Success |
| 4000 0000 0000 0002 | Card declined |
| 4000 0000 0000 9995 | Insufficient funds |

Expiry: Any future date (e.g., 12/25)
CVC: Any 3 digits (e.g., 123)
ZIP: Any 5 digits (e.g., 12345)

## Database Queries

### View Active Subscriptions
```sql
SELECT * FROM v_active_subscriptions;
```

### View Revenue by Tier
```sql
SELECT * FROM v_revenue_by_tier;
```

### View Customer Lifetime Value
```sql
SELECT * FROM v_customer_lifetime_value ORDER BY total_paid DESC LIMIT 10;
```

### View Churn Rate
```sql
SELECT * FROM v_subscription_churn_30d;
```

## Monitoring

### Prometheus Metrics

Access metrics at: http://localhost:8000/metrics

Key metrics:
- `kamiyo_payments_total` - Payment success/failure counts
- `kamiyo_revenue_total_usd` - Total revenue by tier
- `kamiyo_subscriptions_total` - Subscription events
- `kamiyo_api_requests_total` - API request counts
- `kamiyo_api_request_duration_seconds` - API latency

## Troubleshooting

### Error: "STRIPE_SECRET_KEY not set"
- Ensure environment variables are loaded
- Check `.env` file exists and is properly formatted
- Verify key starts with `sk_test_` or `sk_live_`

### Error: "Failed to connect to database"
- Verify PostgreSQL is running
- Check DATABASE_URL is correct
- Run migration: `psql $DATABASE_URL -f database/migrations/002_payment_tables.sql`

### Error: "Stripe error: No such price"
- Verify STRIPE_PRICE_* variables are set
- Check price IDs exist in Stripe Dashboard
- Ensure you're using the correct mode (test vs live)

### Error: "Customer not found"
- Create a customer first using POST /api/v1/payments/customers
- Verify customer_id exists in database: `SELECT * FROM customers;`

## Production Checklist

Before going live:

- [ ] Switch to live Stripe keys (sk_live_* and pk_live_*)
- [ ] Create live products and prices in Stripe
- [ ] Update STRIPE_PRICE_* environment variables with live price IDs
- [ ] Run migration on production database
- [ ] Set up Stripe webhook (Day 8)
- [ ] Enable SSL/TLS for API
- [ ] Configure rate limiting
- [ ] Set up monitoring alerts
- [ ] Test payment flow end-to-end
- [ ] Review Stripe security best practices
- [ ] Set up automated backups

## Next Steps

### Day 7: Checkout Sessions
- Implement Stripe Checkout integration
- Build customer portal redirect
- Add session management

### Day 8: Webhooks
- Handle subscription.created
- Handle payment_intent.succeeded
- Handle customer.subscription.deleted
- Update user tiers automatically

### Day 9: Frontend
- Build subscription selection UI
- Integrate Stripe.js
- Add payment form
- Display billing history

## Support

For issues or questions:
- Review Day 6 documentation: `DAY_6_STRIPE_INTEGRATION.md`
- Check Stripe API docs: https://stripe.com/docs/api
- Review code comments in `api/payments/`

## Architecture Overview

```
┌─────────────────┐
│   Frontend      │
│  (Day 9-10)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────┐
│  FastAPI Routes │────▶│ Stripe API   │
│  (routes.py)    │     │ (stripe.com) │
└────────┬────────┘     └──────────────┘
         │
         ▼
┌─────────────────┐
│ Stripe Client   │
│(stripe_client.py)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────┐
│   PostgreSQL    │────▶│  Prometheus  │
│   Database      │     │   Metrics    │
└─────────────────┘     └──────────────┘
```

## File Structure

```
exploit-intel-platform/
├── api/
│   └── payments/
│       ├── __init__.py          # Package exports
│       ├── models.py            # Pydantic models (386 lines)
│       ├── stripe_client.py     # Stripe SDK wrapper (772 lines)
│       └── routes.py            # FastAPI endpoints (608 lines)
├── config/
│   └── stripe_config.py         # Configuration (248 lines)
├── database/
│   └── migrations/
│       └── 002_payment_tables.sql  # Schema (305 lines)
└── STRIPE_QUICKSTART.md         # This file
```

Total: 2,319 lines of production-ready payment code
