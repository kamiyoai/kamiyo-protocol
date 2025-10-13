# P1 Fixes Validation Checklist

**Purpose**: Comprehensive pre-production checklist for all Priority 1 security and reliability fixes

**Quality Standard**: All checkboxes must be ✅ before production deployment

**Last Updated**: October 13, 2025

---

## Pre-Deployment Validation

### Authentication (P1-1 through P1-5)

#### P1-1: JWT Secret Rotation

- [ ] **Test secret rotation in staging**
  - [ ] Rotate secret using secret manager
  - [ ] Verify old tokens work during grace period
  - [ ] Verify new tokens generated with new secret
  - [ ] Confirm grace period timeout (5 minutes default)

- [ ] **Verify zero downtime**
  - [ ] No 401 errors during rotation
  - [ ] No user session interruptions
  - [ ] All instances pick up new secret

- [ ] **Documentation**
  - [ ] Rotation procedure documented
  - [ ] Recovery procedure documented
  - [ ] Monitoring alerts configured

**Files to verify:**
- `~/project/Projekter/kamiyo/website/api/auth/secret_rotation.py`
- `~/project/Projekter/kamiyo/website/api/auth/jwt_manager.py` (lines 73-90)

**Test command:**
```bash
pytest tests/test_p1_fixes.py::test_jwt_secret_rotation -v
```

---

#### P1-2: Refresh Token Rotation

- [ ] **Test refresh token one-time use**
  - [ ] Use refresh token to get new access token
  - [ ] Verify old refresh token is revoked
  - [ ] Verify new refresh token is returned
  - [ ] Attempt to reuse old refresh token (should fail with 401)

- [ ] **Verify revocation persistence**
  - [ ] Revoked tokens stored in Redis
  - [ ] TTL matches token expiry
  - [ ] Revocation survives instance restart

- [ ] **Performance check**
  - [ ] Refresh endpoint <200ms p95 latency
  - [ ] No Redis connection exhaustion

**Files to verify:**
- `~/project/Projekter/kamiyo/website/api/auth/jwt_manager.py` (lines 307-420)
- `~/project/Projekter/kamiyo/website/api/auth/token_revocation.py`

**Test command:**
```bash
pytest tests/test_p1_fixes.py::test_refresh_token_rotation -v
```

---

#### P1-3: Brute Force Protection

- [ ] **Test progressive rate limiting**
  - [ ] 5 failed attempts: request processed (slowed)
  - [ ] 10 failed attempts: rate limit warning
  - [ ] 20 failed attempts: IP temporarily locked out

- [ ] **Verify lockout enforcement**
  - [ ] Locked IP cannot authenticate (even with valid credentials)
  - [ ] Lockout expires after 15 minutes
  - [ ] Different IPs not affected

- [ ] **Alert configuration**
  - [ ] Alert triggered on 10+ failures from single IP
  - [ ] DevOps notified of potential attack
  - [ ] Logs capture IP, timestamp, failure count

**Files to verify:**
- `~/project/Projekter/kamiyo/website/api/auth/timing_safe.py`

**Test command:**
```bash
pytest tests/test_p1_fixes.py::test_brute_force_protection -v
```

---

#### P1-4: Algorithm Enforcement

- [ ] **Test algorithm bypass prevention**
  - [ ] Token with algorithm='none' rejected (401)
  - [ ] Token with algorithm='RS256' rejected (unless explicitly allowed)
  - [ ] Only HS256/HS384/HS512 accepted

- [ ] **Verify required claims**
  - [ ] Token without 'jti' rejected
  - [ ] Token without 'exp' rejected
  - [ ] Token without 'iat' rejected
  - [ ] Token without 'sub', 'email', 'tier' rejected

- [ ] **Security audit**
  - [ ] No algorithm switching vulnerability
  - [ ] Clear error messages (don't leak secrets)

**Files to verify:**
- `~/project/Projekter/kamiyo/website/api/auth/jwt_manager.py` (lines 62-67, 223-233)

**Test command:**
```bash
pytest tests/test_p1_fixes.py::test_algorithm_enforcement -v
```

---

#### P1-5: Cryptographically Random JTI

- [ ] **Test JTI uniqueness**
  - [ ] Generate 1000 tokens
  - [ ] Verify all JTIs unique (100% uniqueness rate)
  - [ ] Verify JTI length ≥32 characters

- [ ] **Verify entropy**
  - [ ] JTIs are UUID v4 format
  - [ ] Chi-square test for randomness (if applicable)
  - [ ] No predictable patterns

- [ ] **Integration check**
  - [ ] JTI stored in revocation list correctly
  - [ ] JTI used for token replay prevention
  - [ ] JTI included in audit logs

**Files to verify:**
- `~/project/Projekter/kamiyo/website/api/auth/jwt_manager.py` (lines 117-119)

**Test command:**
```bash
pytest tests/test_p1_fixes.py::test_uuid_jti_randomness -v
```

---

### Database (P1-6 through P1-10)

#### P1-6: Migration FK Integrity

- [ ] **Test migration preserves relationships**
  - [ ] All foreign key constraints exist after migration
  - [ ] No orphaned records (e.g., exploits without sources)
  - [ ] Referential integrity enforced

- [ ] **Verify data consistency**
  - [ ] Record counts match pre-migration
  - [ ] Sample data integrity check (10 random records)
  - [ ] No data loss or corruption

- [ ] **Rollback capability**
  - [ ] Rollback migration script tested
  - [ ] Data restored correctly after rollback
  - [ ] Rollback time <5 minutes

**Files to verify:**
- `~/project/Projekter/kamiyo/website/database/migrations/`

**Test command:**
```bash
pytest tests/test_p1_fixes.py::test_migration_foreign_keys -v
```

---

#### P1-7: Query Timeout Enforcement

- [ ] **Test timeout kills long queries**
  - [ ] Query with `pg_sleep(35)` killed after 30s
  - [ ] Clear error message returned
  - [ ] Connection released back to pool

- [ ] **Verify timeout configuration**
  - [ ] Default timeout: 30 seconds (env `DB_QUERY_TIMEOUT`)
  - [ ] Per-query timeout override works
  - [ ] Statement timeout reset after query

- [ ] **Production behavior**
  - [ ] Slow queries don't hang application
  - [ ] Alerts triggered for queries >10s
  - [ ] No connection leaks on timeout

**Files to verify:**
- `~/project/Projekter/kamiyo/website/database/postgres_manager.py` (lines 211-248)

**Test command:**
```bash
pytest tests/test_p1_fixes.py::test_query_timeout_enforcement -v
```

---

#### P1-8: Read Replica Selection

- [ ] **Test automatic read replica usage**
  - [ ] `get_exploit_by_tx_hash()` uses read replica
  - [ ] `get_recent_exploits()` uses read replica
  - [ ] `get_stats_24h()` uses read replica
  - [ ] All methods with `@use_read_replica` decorator use replica

- [ ] **Verify write queries use primary**
  - [ ] `insert_exploit()` uses primary database
  - [ ] `update_source_status()` uses primary database
  - [ ] No write queries sent to read replica

- [ ] **Failover behavior**
  - [ ] If read replica unavailable, fallback to primary
  - [ ] No errors if read replica not configured
  - [ ] Connection pool separate for replica

**Files to verify:**
- `~/project/Projekter/kamiyo/website/database/postgres_manager.py` (lines 30-50, 341-428)
- `~/project/Projekter/kamiyo/website/database/read_replica.py`

**Test command:**
```bash
pytest tests/test_p1_fixes.py::test_read_replica_selection -v
```

---

#### P1-9: Migration Validation

- [ ] **Test validation catches corruption**
  - [ ] Validation fails if FK broken
  - [ ] Validation fails if orphaned records exist
  - [ ] Clear error message identifies issue

- [ ] **Verify validation coverage**
  - [ ] All tables validated
  - [ ] All foreign keys checked
  - [ ] Index existence verified

- [ ] **Integration with CI/CD**
  - [ ] Validation runs automatically after migration
  - [ ] Deployment blocked if validation fails
  - [ ] Alert sent to DevOps on validation failure

**Test command:**
```bash
pytest tests/test_p1_fixes.py::test_migration_validation -v
```

---

#### P1-10: Performance Indexes

- [ ] **Test index improves query performance**
  - [ ] Query without index (baseline time)
  - [ ] Create index
  - [ ] Query with index (improved time)
  - [ ] Verify ≥50% speedup

- [ ] **Verify indexes created**
  - [ ] Index on `exploits.tx_hash` (unique)
  - [ ] Index on `exploits.chain`
  - [ ] Index on `exploits.timestamp`
  - [ ] Index on `users.api_key` (hashed)

- [ ] **Production deployment**
  - [ ] Indexes created with `CONCURRENTLY` (no downtime)
  - [ ] Index build time <10 minutes
  - [ ] No production traffic impact

**Files to verify:**
- `~/project/Projekter/kamiyo/website/database/migrations/001_initial_schema.sql`

**Test command:**
```bash
pytest tests/test_p1_fixes.py::test_performance_indexes -v
```

---

### Payments (P1-11 through P1-15)

#### P1-11: Stripe API Version Monitoring

- [ ] **Test version health check**
  - [ ] Set old version (2022-01-01)
  - [ ] Run health check
  - [ ] Verify warning logged
  - [ ] Verify alert sent to DevOps

- [ ] **Verify version pinning**
  - [ ] Stripe API version explicitly set (2023-10-16 or later)
  - [ ] Version stored in config (not hardcoded)
  - [ ] Version check runs on startup

- [ ] **Update procedure documented**
  - [ ] How to check latest Stripe API version
  - [ ] How to update version in code
  - [ ] Testing procedure before production update

**Files to verify:**
- `~/project/Projekter/kamiyo/website/config/stripe_config.py`
- `~/project/Projekter/kamiyo/website/api/payments/stripe_client.py` (line 47)

**Test command:**
```bash
pytest tests/test_p1_fixes.py::test_stripe_version_monitoring -v
```

---

#### P1-12: Idempotency Prevents Double Charge

- [ ] **Test deterministic key generation**
  - [ ] Same user_id + operation = same key
  - [ ] Different user_id = different key
  - [ ] Different date = different key

- [ ] **Verify Stripe deduplication**
  - [ ] Create customer with key1
  - [ ] Retry with same key1
  - [ ] Verify only 1 Stripe API call made (Stripe caches result)
  - [ ] Verify same customer ID returned

- [ ] **Database consistency check**
  - [ ] Only 1 customer record in database
  - [ ] Only 1 subscription record per customer per tier
  - [ ] No duplicate charges in billing

**Files to verify:**
- `~/project/Projekter/kamiyo/website/api/payments/stripe_client.py` (lines 167-228, 330-354)

**Test command:**
```bash
pytest tests/test_p1_fixes.py::test_idempotency_prevents_double_charge -v
```

---

#### P1-13: Stripe Retry Logic

- [ ] **Test transient failure handling**
  - [ ] Mock Stripe to return 500 error twice
  - [ ] Verify 3 attempts made (initial + 2 retries)
  - [ ] Verify exponential backoff (1s, 2s, 4s)
  - [ ] Verify final success

- [ ] **Test non-retryable errors**
  - [ ] Card declined (CardError): NEVER retry
  - [ ] Invalid request (InvalidRequestError): NEVER retry
  - [ ] Auth error (AuthenticationError): NEVER retry

- [ ] **Verify circuit breaker integration**
  - [ ] After 5 failures, circuit opens
  - [ ] Circuit breaker blocks further calls
  - [ ] Circuit closes after timeout (60s)

**Files to verify:**
- `~/project/Projekter/kamiyo/website/api/payments/stripe_client.py` (lines 81-179)
- `~/project/Projekter/kamiyo/website/api/payments/distributed_circuit_breaker.py`

**Test command:**
```bash
pytest tests/test_p1_fixes.py::test_stripe_retry_logic -v
```

---

#### P1-14: Webhook Rate Limiting

- [ ] **Test rate limit blocks spam**
  - [ ] Send 35 webhook requests in 1 minute
  - [ ] Verify first 30 succeed (200 OK)
  - [ ] Verify remaining 5 blocked (429 Too Many Requests)

- [ ] **Verify rate limit configuration**
  - [ ] Limit: 30 requests per minute per endpoint
  - [ ] Window: sliding 60-second window
  - [ ] Rate limit stored in Redis (distributed)

- [ ] **Test legitimate high-volume webhooks**
  - [ ] Stripe webhooks from different events not rate limited
  - [ ] Rate limit per source IP, not global
  - [ ] Alert triggered if limit exceeded

**Files to verify:**
- `~/project/Projekter/kamiyo/website/api/payments/routes.py` (webhook endpoints)

**Test command:**
```bash
pytest tests/test_p1_fixes.py::test_webhook_rate_limiting -v
```

---

#### P1-15: Request ID Sanitization

- [ ] **Test malicious input sanitization**
  - [ ] SQL injection: `'; DROP TABLE users; --` → sanitized
  - [ ] XSS: `<script>alert('xss')</script>` → sanitized
  - [ ] Path traversal: `../../../../etc/passwd` → sanitized

- [ ] **Verify only safe characters allowed**
  - [ ] Regex: `^[a-zA-Z0-9_-]+$`
  - [ ] Max length: 64 characters
  - [ ] If empty after sanitization, use "unknown"

- [ ] **Check all error responses**
  - [ ] Request IDs in error responses sanitized
  - [ ] No sensitive data leaked in errors
  - [ ] Audit logs contain original + sanitized IDs

**Test command:**
```bash
pytest tests/test_p1_fixes.py::test_request_id_sanitization -v
```

---

## Deployment Validation (Run After Production Deploy)

### Smoke Tests

Run these immediately after deploying to production:

```bash
# 1. Health check
curl https://kamiyo.ai/api/health

# 2. Authentication
curl -X POST https://kamiyo.ai/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# 3. Token refresh
curl -X POST https://kamiyo.ai/api/auth/refresh \
  -H "Authorization: Bearer <refresh_token>"

# 4. API call with valid token
curl https://kamiyo.ai/api/exploits \
  -H "Authorization: Bearer <access_token>"

# 5. API call with invalid token (should fail with 401)
curl https://kamiyo.ai/api/exploits \
  -H "Authorization: Bearer invalid_token_123"

# 6. Database query
curl https://kamiyo.ai/api/stats

# 7. Payment creation (test mode)
curl -X POST https://kamiyo.ai/api/subscriptions \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"tier":"pro","payment_method":"pm_card_visa"}'

# 8. Webhook delivery (test webhook)
curl -X POST https://kamiyo.ai/api/webhooks/stripe \
  -H "Stripe-Signature: test_sig" \
  -d '{"type":"customer.created"}'
```

**Expected Results:**
- [ ] All smoke tests pass
- [ ] No 500 errors
- [ ] Response times <1s
- [ ] No errors in logs

---

### Performance Tests

Run these to validate P1 fixes under load:

```bash
# 1. Auth performance (1000 requests, 50 concurrent)
pytest tests/test_p1_load.py::test_auth_performance_under_load -v

# 2. Database connection pool (100 queries, 20 concurrent)
pytest tests/test_p1_load.py::test_database_connection_pool -v

# 3. Stripe API with circuit breaker (100 requests, 10 concurrent)
pytest tests/test_p1_load.py::test_stripe_api_circuit_breaker_under_load -v
```

**Performance Targets:**
- [ ] Auth p95 latency <200ms
- [ ] Database p95 latency <100ms
- [ ] No connection pool exhaustion
- [ ] Failure rate <1%
- [ ] Circuit breaker opens on sustained failures

---

### Security Tests

Run these to validate security fixes:

```bash
# 1. JWT with algorithm='none' rejected
curl https://kamiyo.ai/api/exploits \
  -H "Authorization: Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJhdHRhY2tlciJ9."

# 2. Expired tokens rejected
# (Create token with -1 minute expiry, attempt to use)

# 3. Revoked tokens rejected
# (Login, logout, attempt to use old access token)

# 4. SQL injection in request_id sanitized
curl https://kamiyo.ai/api/exploits \
  -H "X-Request-ID: '; DROP TABLE users; --"
```

**Expected Results:**
- [ ] All malicious requests blocked
- [ ] Clear error messages (401 Unauthorized)
- [ ] No sensitive data leaked
- [ ] All attempts logged for audit

---

## Rollback Validation

**Test rollback procedure in staging:**

- [ ] Rollback deployed successfully
- [ ] Rollback time <5 minutes
- [ ] No data loss during rollback
- [ ] Application functional after rollback
- [ ] Monitoring shows no errors post-rollback

**Rollback triggers:**
- Critical bug discovered in production
- P1 fix causes unexpected side effects
- Performance degradation >50%
- Security vulnerability introduced

---

## Monitoring & Alerts

Verify these alerts are configured:

### Authentication Alerts
- [ ] 10+ failed login attempts from single IP (5 min window)
- [ ] JWT secret rotation initiated
- [ ] Refresh token revocation failures
- [ ] Brute force attack detected

### Database Alerts
- [ ] Query timeout exceeded (>30s)
- [ ] Connection pool utilization >80%
- [ ] Migration validation failed
- [ ] Read replica unavailable

### Payment Alerts
- [ ] Stripe API version outdated (>1 year old)
- [ ] Circuit breaker opened
- [ ] Idempotency key collision (should never happen)
- [ ] Webhook rate limit exceeded

---

## Documentation Checklist

Before deploying to production:

- [ ] P1 fixes documented in CHANGELOG.md
- [ ] Runbook updated with new procedures
- [ ] Monitoring dashboard configured
- [ ] Alert routing configured (PagerDuty/Slack)
- [ ] DevOps team briefed on changes
- [ ] Rollback procedure documented and tested

---

## Sign-Off

**QA Engineer:**
- Name: ______________________
- Date: ______________________
- Signature: ______________________

**Tech Lead:**
- Name: ______________________
- Date: ______________________
- Signature: ______________________

**DevOps:**
- Name: ______________________
- Date: ______________________
- Signature: ______________________

---

## Production Deployment Authorization

✅ **All checkboxes above must be marked before production deployment**

**Deployment authorized by:**
- [ ] QA Lead
- [ ] Engineering Manager
- [ ] CTO/VP Engineering

**Deployment date:** ______________________

**Deployment time:** ______________________

**Deployed by:** ______________________

---

## Post-Deployment Monitoring (First 48 Hours)

**Monitor these metrics closely:**

### Hour 1-4 (Critical)
- [ ] Error rate <0.1%
- [ ] p95 latency <500ms
- [ ] No customer complaints
- [ ] No payment processing failures

### Hour 4-24 (Important)
- [ ] Connection pool stable (no leaks)
- [ ] Token revocation working (logout functions)
- [ ] Stripe API calls successful (>99.9%)
- [ ] Database queries performant

### Hour 24-48 (Validation)
- [ ] All P1 fixes functioning in production
- [ ] No rollback required
- [ ] Customer satisfaction maintained
- [ ] Monitoring baselines established

---

## Success Criteria

P1 deployment is successful when:

✅ All tests pass (unit, integration, load)
✅ All smoke tests pass in production
✅ Performance metrics within targets
✅ No critical bugs discovered in first 48 hours
✅ Monitoring confirms P1 fixes working
✅ Security audit confirms vulnerabilities patched

**Production Readiness:** 95% → **Target: 98%+**

---

**Last Updated:** October 13, 2025
**Next Review:** October 20, 2025
**Owner:** QA Team
