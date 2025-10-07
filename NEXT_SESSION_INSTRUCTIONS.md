# Next Session Instructions - Week 2 Payment Integration

**Date Created**: 2025-10-07
**Current Progress**: Week 1 Complete (Days 1-5), Week 2 Agents Setup Initiated

---

## Quick Start for Next Session

### Immediate Action Required

**Resume Week 2 (Payment Integration) by launching 5 agents in parallel:**

```bash
# Context: Week 1 (Infrastructure) is 100% complete
# Week 2 focuses on Stripe payment integration across 5 days (Days 6-10)
# Use multiple agents to work in parallel for faster completion
```

---

## Agent Launch Commands

### Agent 1: Day 6 - Stripe API Integration

**Objective**: Create core Stripe SDK integration for payment processing

**Key Deliverables**:
1. `api/payments/stripe_client.py` - Stripe SDK wrapper
2. `api/payments/models.py` - Payment database models
3. `api/payments/routes.py` - FastAPI payment endpoints
4. `config/stripe_config.py` - Stripe configuration
5. Update `requirements.txt` - Add stripe>=7.0.0
6. Database migration `002_payment_tables.sql`

**Dependencies**: None (can start immediately)

---

### Agent 2: Day 7 - Subscription Management

**Objective**: Build subscription tier enforcement and usage tracking

**Key Deliverables**:
1. `api/subscriptions/manager.py` - Subscription manager
2. `api/subscriptions/tiers.py` - Tier configuration (Free/Basic/Pro/Enterprise)
3. `api/subscriptions/middleware.py` - FastAPI tier enforcement middleware
4. `api/subscriptions/usage_tracker.py` - Redis-based usage tracking
5. `api/subscriptions/routes.py` - Subscription API endpoints
6. Database migration `003_subscription_tables.sql`

**Dependencies**: Requires Day 6 Stripe client (can work on models/tiers independently)

---

### Agent 3: Day 8 - Stripe Webhook Handlers

**Objective**: Process Stripe webhook events (subscription changes, payments)

**Key Deliverables**:
1. `api/webhooks/stripe_handler.py` - Webhook event handlers
2. `api/webhooks/routes.py` - Webhook endpoint (POST /api/v1/webhooks/stripe)
3. `api/webhooks/event_store.py` - Webhook event persistence
4. `api/webhooks/processors.py` - Individual event processors
5. `api/webhooks/notifications.py` - User notifications for events
6. Database migration `004_webhook_tables.sql`
7. `scripts/test_webhooks.sh` - Stripe CLI testing script

**Dependencies**: Requires Day 6 Stripe models, Day 7 subscription manager

---

### Agent 4: Day 9 - Billing Dashboard

**Objective**: Create user-facing billing dashboard (React frontend + FastAPI backend)

**Key Deliverables**:

**Frontend**:
1. `frontend/src/components/billing/BillingDashboard.tsx`
2. `frontend/src/components/billing/SubscriptionPlans.tsx`
3. `frontend/src/components/billing/UsageChart.tsx`
4. `frontend/src/components/billing/InvoiceHistory.tsx`
5. `frontend/src/components/billing/PaymentMethodCard.tsx`
6. `frontend/src/hooks/useBilling.ts`
7. `frontend/src/api/billing.ts`
8. `frontend/src/pages/BillingPage.tsx`
9. `frontend/src/styles/billing.css`

**Backend**:
1. `api/billing/portal.py` - Stripe Customer Portal integration
2. `api/billing/routes.py` - Billing API endpoints

**Documentation**:
1. `docs/BILLING_GUIDE.md` - User guide

**Dependencies**: Requires Days 6-8 for backend APIs

---

### Agent 5: Day 10 - Payment Testing Suite

**Objective**: Comprehensive testing for entire payment system

**Key Deliverables**:
1. `tests/payments/test_stripe_client.py` - Stripe client tests
2. `tests/payments/test_subscription_manager.py` - Subscription tests
3. `tests/payments/test_webhooks.py` - Webhook tests
4. `tests/payments/test_usage_tracker.py` - Usage tracking tests
5. `tests/payments/test_billing_routes.py` - API integration tests
6. `tests/payments/fixtures.py` - Pytest fixtures
7. `tests/integration/test_payment_flow.py` - E2E payment tests
8. `tests/load/test_payment_performance.py` - Load tests
9. `scripts/test_payment_scenarios.sh` - Manual test script
10. `scripts/stripe_test_data.py` - Test data generator
11. `docs/PAYMENT_TESTING.md` - Testing guide
12. `.github/workflows/test-payments.yml` - CI workflow

**Dependencies**: Requires Days 6-9 (all payment code must exist to test)

---

## Parallel Execution Strategy

### Phase 1 (Start Immediately):
- ✅ **Agent 1 (Day 6)**: Stripe integration - START NOW (no dependencies)
- ✅ **Agent 2 (Day 7)**: Subscription tiers/models - START NOW (tier config is independent)

### Phase 2 (After Agent 1 completes):
- ⏳ **Agent 3 (Day 8)**: Webhooks - Needs Agent 1's Stripe client
- ⏳ **Agent 4 (Day 9)**: Billing dashboard - Needs Agent 1's API routes

### Phase 3 (After all agents complete):
- ⏳ **Agent 5 (Day 10)**: Testing - Needs all payment code

**Estimated Timeline**:
- Phase 1: Can complete in parallel
- Phase 2: Can complete in parallel after Phase 1
- Phase 3: Sequential after Phases 1-2
- **Total**: ~2-3 hours with parallel agents vs. ~8-10 hours sequential

---

## Agent Prompt Template

Use this template when launching each agent:

```markdown
You are working on Day [X] of the Kamiyo 30-day deployment plan.

**Context**:
- Week 1 (Days 1-5) is complete: PostgreSQL, Docker, Monitoring, Security, CI/CD
- Week 2 (Days 6-10) focuses on Stripe payment integration
- Review ~/project/Projekter/exploit-intel-platform/CLAUDE.md for project guidelines
- Review ~/project/Projekter/exploit-intel-platform/PROGRESS_REPORT.md for current status

**Your Task**: [Copy specific deliverables from agent sections above]

**Requirements**:
- Follow existing code patterns from Week 1
- Use async/await where appropriate
- Include comprehensive error handling
- Add Prometheus metrics where applicable
- Follow PEP 8 style
- Use type hints throughout
- Write comprehensive docstrings
- Include inline comments for complex logic
- Use environment variables for configuration
- Never hardcode secrets or API keys

**Integration Points**:
- Database: Use postgres_manager.py from Day 1
- Redis: Use existing Redis from Day 2
- Monitoring: Add metrics using prometheus_metrics.py from Day 3
- Security: Use security.py patterns from Day 4
- Alerts: Use alerts.py from Day 3 for notifications

**Return**: Detailed summary of all files created, line counts, and key features implemented.
```

---

## Validation Checklist

After agents complete, validate:

### Day 6 (Stripe Integration):
- [ ] Stripe SDK installed and configured
- [ ] Customer CRUD operations working
- [ ] Subscription CRUD operations working
- [ ] Payment method handling implemented
- [ ] Database models created
- [ ] API routes functional
- [ ] Error handling comprehensive
- [ ] Environment variables documented

### Day 7 (Subscription Management):
- [ ] Tier configuration defined (Free/Basic/Pro/Enterprise)
- [ ] Usage tracking with Redis operational
- [ ] Tier enforcement middleware working
- [ ] Subscription manager integrates with Stripe
- [ ] Rate limiting updated for tier-based limits
- [ ] API routes functional
- [ ] Database migrations run successfully

### Day 8 (Webhooks):
- [ ] Webhook endpoint receiving events
- [ ] Signature verification working
- [ ] All event types handled (subscription, payment, customer)
- [ ] Idempotent processing implemented
- [ ] Event storage in database
- [ ] Retry logic for failed events
- [ ] Notifications sent on events
- [ ] Stripe CLI testing successful

### Day 9 (Billing Dashboard):
- [ ] React components render correctly
- [ ] Usage charts display data
- [ ] Invoice history loads
- [ ] Payment method displays
- [ ] Stripe Customer Portal integration works
- [ ] API endpoints return correct data
- [ ] Mobile responsive design
- [ ] Error states handled gracefully

### Day 10 (Testing):
- [ ] Unit tests passing (>90% coverage)
- [ ] Integration tests passing
- [ ] E2E payment flow tests passing
- [ ] Webhook tests passing
- [ ] Load tests baseline established
- [ ] CI workflow configured
- [ ] Test documentation complete
- [ ] All edge cases covered

---

## Environment Setup

Before starting agents, ensure:

```bash
# 1. Verify Week 1 infrastructure is ready
cd ~/project/Projekter/exploit-intel-platform

# 2. Check Docker services are running
docker-compose -f docker-compose.production.yml ps

# 3. Verify PostgreSQL connection
# (Should connect successfully with postgres_manager.py)

# 4. Verify Redis connection
# redis-cli ping should return PONG

# 5. Create Stripe test account (if not exists)
# https://dashboard.stripe.com/register

# 6. Set Stripe environment variables (use test keys)
# Add to .env.production:
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_PUBLISHABLE_KEY=pk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Success Criteria for Week 2

### Functional:
- ✅ Users can sign up for subscriptions
- ✅ Stripe checkout flow works end-to-end
- ✅ Webhooks process subscription events
- ✅ Tier-based rate limiting enforced
- ✅ Usage tracking accurate
- ✅ Billing dashboard displays correct data
- ✅ Customer portal integration working
- ✅ Invoice generation and download working

### Technical:
- ✅ >90% test coverage on payment code
- ✅ All webhook events handled
- ✅ Idempotent event processing
- ✅ Comprehensive error handling
- ✅ Prometheus metrics for payment events
- ✅ Security best practices followed
- ✅ Documentation complete

### Quality:
- ✅ Code follows Week 1 patterns
- ✅ No hardcoded secrets
- ✅ Type hints throughout
- ✅ Comprehensive docstrings
- ✅ Error messages user-friendly
- ✅ Logs structured and searchable

---

## Known Considerations

### Stripe Integration:
- Use **test mode** exclusively during Week 2
- Test card: `4242 4242 4242 4242`
- Use Stripe CLI for webhook testing: `stripe listen --forward-to localhost:8000/api/v1/webhooks/stripe`
- Stripe API version: Latest (v7+)

### Database:
- Payment tables require ACID compliance (use PostgreSQL transactions)
- Index on stripe_customer_id for performance
- Partition usage_history table by month for scalability

### Redis:
- Usage tracking uses sliding window algorithm
- TTL set to 24 hours for daily limits
- Cache subscription tier for 5 minutes to reduce DB load

### Security:
- Always verify webhook signatures (critical!)
- Never log full credit card numbers
- PCI compliance: Let Stripe handle card data (never store)
- Rate limit webhook endpoint (10 req/s)

---

## Debugging Tips

### If Agents Fail:

1. **Check Error Messages**: Agents return detailed error context
2. **Review Dependencies**: Ensure prerequisite days completed
3. **Validate Environment**: Check .env variables set correctly
4. **Check File Paths**: All paths must be absolute
5. **Review Existing Code**: Ensure agents use existing patterns

### Common Issues:

**Import Errors**:
- Solution: Check requirements.txt updated
- Solution: Verify virtual environment activated

**Database Connection Errors**:
- Solution: Verify PostgreSQL running (docker ps)
- Solution: Check DATABASE_URL in .env

**Redis Connection Errors**:
- Solution: Verify Redis running (docker ps)
- Solution: Check REDIS_URL in .env

**Stripe API Errors**:
- Solution: Verify STRIPE_SECRET_KEY set (test key)
- Solution: Check Stripe API version compatibility

---

## Post-Week 2 Next Steps

After completing Days 6-10, move to:

### Week 3: Performance Optimization (Days 11-15)
1. Database query optimization
2. Redis caching strategy
3. CDN integration (CloudFlare)
4. API response compression
5. Load balancing setup

### Week 4: Frontend Polish (Days 16-21)
1. React dashboard improvements
2. Mobile responsiveness
3. E2E testing (Playwright)
4. Accessibility audit (WCAG 2.1)
5. Performance optimization (Lighthouse)
6. User onboarding flow

### Week 5: Launch Prep (Days 22-30)
1. Additional aggregators (10 sources)
2. Production smoke tests
3. Marketing site
4. Documentation finalization
5. Go-live checklist
6. Launch! 🚀

---

## Files to Reference

**Week 1 Code Patterns**:
- `database/postgres_manager.py` - Database connection pattern
- `monitoring/prometheus_metrics.py` - Metrics pattern
- `api/security.py` - Security middleware pattern
- `monitoring/alerts.py` - Notification pattern

**Configuration**:
- `.env.production.template` - Environment variables
- `docker-compose.production.yml` - Service orchestration
- `requirements.txt` - Python dependencies

**Documentation**:
- `PROGRESS_REPORT.md` - Current status
- `docs/DEPLOYMENT_GUIDE.md` - Infrastructure guide
- `CLAUDE.md` - Project guidelines

---

## Communication

**Report Progress**:
- Update `PROGRESS_REPORT.md` after each day completes
- Document any blockers or issues
- Note any deviations from plan

**Ask for Help**:
- If agents get stuck, provide error context
- Reference specific files and line numbers
- Include relevant error messages

---

## Final Checklist Before Starting

- [ ] Read this document completely
- [ ] Review `PROGRESS_REPORT.md`
- [ ] Review `CLAUDE.md` for project guidelines
- [ ] Verify Docker services running
- [ ] Set Stripe test API keys in .env
- [ ] Create Stripe test account (if needed)
- [ ] Install Stripe CLI for webhook testing
- [ ] Launch Agent 1 (Day 6) - Stripe Integration
- [ ] Launch Agent 2 (Day 7) - Subscription Management
- [ ] Monitor agent progress
- [ ] Validate deliverables as agents complete
- [ ] Launch remaining agents in phases
- [ ] Update progress report when Week 2 completes

---

**Ready to Resume**: Launch agents for Days 6-10 in parallel!

**Estimated Completion**: 2-3 hours with parallel agents

**Next Milestone**: Week 2 complete, payment system fully functional

---

**Document Created**: 2025-10-07
**Status**: Ready for execution
**Next Update**: After Week 2 completion
