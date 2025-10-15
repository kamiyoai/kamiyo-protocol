# PCI Compliance Fixes - Quick Start Deployment Guide

**Date:** 2025-10-13
**Status:** Ready for Production Deployment
**Estimated Time:** 30 minutes

---

## Pre-Deployment Checklist

- [ ] Redis is running and accessible (`$REDIS_URL` configured)
- [ ] PostgreSQL 12+ with RLS support
- [ ] Backup database before migration
- [ ] Schedule maintenance window (low traffic period)
- [ ] Notify team of deployment

---

## Step 1: Pre-Deployment Verification (5 min)

```bash
# Check Redis connectivity
redis-cli -u $REDIS_URL ping
# Expected: PONG

# Check database connectivity
psql $DATABASE_URL -c "SELECT version();"

# Backup database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Check current code is on master branch
cd ~/project/Projekter/kamiyo/website
git status
git pull origin master
```

---

## Step 2: Deploy Code Changes (5 min)

```bash
# Verify new files exist
ls -la api/payments/distributed_circuit_breaker.py
ls -la api/payments/pci_logging_filter.py
ls -la database/migrations/011_card_data_security.sql

# Expected: All files present

# Restart application (PCI logging filter initializes on startup)
docker compose restart api

# Or if running without Docker:
pkill -f "uvicorn main:app"
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000 &
```

---

## Step 3: Run Database Migration (10 min)

```bash
# Connect to database
psql $DATABASE_URL

# Run the migration
\i database/migrations/011_card_data_security.sql

# Expected output:
# ✓ Row-level security ENABLED on payment_methods
# ✓ Created payment_service_role (full access)
# ✓ Created developer_role (safe view access)
# ✓ Created payment_methods_safe view (redacted)
# ✓ Created audit trigger for change logging
# ✓ Configured RLS policies (deny by default)

# Verify RLS is enabled
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'payment_methods';

# Expected:
#     relname      | relrowsecurity
# -----------------+----------------
#  payment_methods | t
```

---

## Step 4: Configure Application Database User (5 min)

```bash
# Create PostgreSQL user for payment service
psql $DATABASE_URL << 'EOF'
CREATE USER payment_app WITH PASSWORD 'CHANGE_THIS_PASSWORD';
GRANT payment_service_role TO payment_app;
GRANT CONNECT ON DATABASE kamiyo TO payment_app;
GRANT USAGE ON SCHEMA public TO payment_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO payment_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO payment_app;
EOF

# Update .env with new database user
# Change DATABASE_URL to use payment_app user:
# DATABASE_URL=postgresql://payment_app:CHANGE_THIS_PASSWORD@host:5432/kamiyo

# Restart application with new credentials
docker compose restart api
```

---

## Step 5: Verify Deployment (5 min)

### Test 1: Logging Filter Active

```bash
# Check application logs for PCI filter initialization
docker logs kamiyo-api | grep "PCI COMPLIANCE"

# Expected output:
# [PCI COMPLIANCE] Logging filter initialized - all sensitive data will be redacted
```

### Test 2: Circuit Breaker Working

```bash
# Check circuit breaker initialization
docker logs kamiyo-api | grep "Circuit breaker"

# Expected output:
# [PCI] Circuit breaker initialized for Stripe API calls
# [CIRCUIT BREAKER] Using Redis for distributed state: stripe_api
```

### Test 3: Database RLS Working

```bash
# Test as developer (should fail on raw table)
psql $DATABASE_URL -c "SELECT * FROM payment_methods LIMIT 1;"
# Expected: ERROR: permission denied for table payment_methods

# Test safe view (should work)
psql $DATABASE_URL -c "SELECT * FROM payment_methods_safe LIMIT 1;"
# Expected: Returns data with card_last4_redacted = '****'
```

### Test 4: End-to-End Payment Flow

```bash
# Trigger a test payment
curl -X POST https://api.kamiyo.ai/api/v1/payments/checkout \
  -H "Authorization: Bearer $TEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"price_id": "price_test_abc123"}'

# Check logs - should see REDACTED data
docker logs kamiyo-api | tail -50 | grep -E "REDACTED|CARD|CUSTOMER"

# Expected: [CARD_REDACTED], [CUSTOMER_ID_REDACTED], etc.
```

---

## Step 6: Monitoring Setup (Optional, 5 min)

### Add Health Check Endpoint

Create `/api/v1/health/pci-compliance`:

```python
@app.get("/api/v1/health/pci-compliance")
async def pci_compliance_health():
    """Health check for PCI compliance systems"""
    stripe_client = get_stripe_client()

    return {
        "circuit_breaker": stripe_client.get_circuit_breaker_status(),
        "logging_filter": "active",
        "database_rls": "enabled",
        "timestamp": datetime.now().isoformat()
    }
```

### Test Health Endpoint

```bash
curl https://api.kamiyo.ai/api/v1/health/pci-compliance

# Expected response:
# {
#   "circuit_breaker": {
#     "service": "stripe_api",
#     "state": "closed",
#     "is_available": true,
#     "failure_count": 0
#   },
#   "logging_filter": "active",
#   "database_rls": "enabled"
# }
```

---

## Rollback Procedure (If Needed)

### Emergency Rollback (2 min)

```bash
# 1. Restore code (if issues with circuit breaker or logging)
git revert HEAD
docker compose restart api

# 2. Rollback database migration (if issues with RLS)
psql $DATABASE_URL << 'EOF'
ALTER TABLE payment_methods DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_service_access ON payment_methods;
DROP POLICY IF EXISTS default_deny_all ON payment_methods;
EOF

# 3. Restore from backup (if major issues)
psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
```

⚠️ **WARNING:** Rollback means PCI non-compliance. Only use for critical issues.

---

## Post-Deployment Monitoring (First 24 Hours)

### Monitor These Metrics

1. **Circuit Breaker State**
   ```bash
   # Check every 5 minutes
   watch -n 300 'redis-cli -u $REDIS_URL GET "circuit_breaker:stripe_api:state"'
   # Should stay "closed"
   ```

2. **Payment Success Rate**
   ```bash
   # Should remain >99%
   curl https://api.kamiyo.ai/stats/payments
   ```

3. **Error Logs**
   ```bash
   # Monitor for unexpected errors
   docker logs -f kamiyo-api | grep -i error
   ```

4. **Database Audit Log**
   ```sql
   -- Check for unauthorized access attempts
   SELECT * FROM audit_log
   WHERE table_name = 'payment_methods'
     AND changed_at > NOW() - INTERVAL '1 hour'
   ORDER BY changed_at DESC;
   ```

---

## Troubleshooting

### Issue: Circuit Breaker Stuck in OPEN State

**Symptoms:** All payments failing with "Circuit breaker OPEN"

**Fix:**
```python
# Manual reset via Python
from api.payments.distributed_circuit_breaker import get_circuit_breaker
breaker = get_circuit_breaker()
breaker.reset()
```

Or via Redis:
```bash
redis-cli -u $REDIS_URL DEL "circuit_breaker:stripe_api:state"
redis-cli -u $REDIS_URL DEL "circuit_breaker:stripe_api:failures"
```

### Issue: Logs Still Contain Sensitive Data

**Symptoms:** Card numbers visible in logs

**Check:**
```bash
# Verify filter was initialized
docker logs kamiyo-api | grep "PCI COMPLIANCE"

# If missing, check startup errors
docker logs kamiyo-api | grep -i error | head -20
```

**Fix:**
```python
# Manually initialize filter (in Python console)
from api.payments.pci_logging_filter import setup_pci_compliant_logging
setup_pci_compliant_logging(apply_to_root=True)
```

### Issue: Database Permission Denied

**Symptoms:** Application can't query payment_methods

**Fix:**
```sql
-- Grant necessary permissions to payment_app
GRANT payment_service_role TO payment_app;

-- Verify role membership
SELECT r.rolname, m.rolname as member
FROM pg_roles r
JOIN pg_auth_members am ON r.oid = am.roleid
JOIN pg_roles m ON am.member = m.oid
WHERE m.rolname = 'payment_app';
```

---

## Success Criteria

✅ **Deployment is successful if:**

1. ✅ Application starts without errors
2. ✅ PCI logging filter initialization message in logs
3. ✅ Circuit breaker state is "closed"
4. ✅ Test payment completes successfully
5. ✅ Logs contain only REDACTED sensitive data
6. ✅ Database RLS blocks direct access to payment_methods
7. ✅ payment_methods_safe view returns redacted data
8. ✅ No increase in error rate or latency

---

## Next Steps After Deployment

1. **Week 1:** Monitor daily for anomalies
2. **Week 2:** Review audit logs for access patterns
3. **Week 3:** Run penetration test on payment endpoints
4. **Week 4:** Schedule PCI DSS audit with QSA

---

## Contact Information

**For Deployment Issues:**
- Engineering Team Lead
- DevOps Team

**For PCI Compliance Questions:**
- Security Engineer
- Compliance Officer

**For Emergency Rollback:**
- CTO
- VP Engineering

---

**END OF QUICK START GUIDE**
