# Stripe End-to-End Test Suite

Comprehensive end-to-end tests for the KAMIYO Stripe payment system covering the complete subscription flow from checkout to webhooks.

## Overview

This test suite validates:
- ✅ Checkout session creation for all tiers
- ✅ Webhook signature verification
- ✅ Event processing and idempotency
- ✅ Subscription lifecycle management
- ✅ Database operations and data integrity
- ✅ Customer Portal functionality
- ✅ API endpoint security
- ✅ PCI DSS compliance
- ✅ Error handling and edge cases

## Test Coverage

### Total: 35+ Test Cases

#### Section 1: Checkout Session Creation (7 tests)
- `test_create_checkout_personal_tier` - Personal tier ($19/mo)
- `test_create_checkout_team_tier` - Team tier ($99/mo)
- `test_create_checkout_enterprise_tier` - Enterprise tier ($299/mo)
- `test_checkout_redirect_urls_validation` - URL validation
- `test_checkout_without_user_email` - Optional email handling
- `test_checkout_invalid_tier` - Invalid tier validation
- `test_checkout_stripe_error_handling` - Stripe API error handling

#### Section 2: Webhook Processing (8 tests)
- `test_checkout_session_completed_webhook` - Checkout completion
- `test_subscription_created_webhook` - Subscription creation
- `test_subscription_updated_webhook` - Subscription updates
- `test_subscription_deleted_webhook` - Subscription cancellation
- `test_invoice_payment_succeeded_webhook` - Successful payment
- `test_invoice_payment_failed_webhook` - Failed payment
- `test_webhook_signature_validation_failure` - Security validation
- `test_webhook_idempotency_duplicate_event` - Duplicate prevention

#### Section 3: Subscription Management (5 tests)
- `test_subscription_activation_in_database` - Database activation
- `test_user_tier_upgrade` - Tier upgrades
- `test_user_tier_downgrade` - Tier downgrades
- `test_subscription_cancellation` - Cancellation flow
- `test_subscription_renewal` - Automatic renewal

#### Section 4: Customer Portal (2 tests)
- `test_create_portal_session` - Portal session creation
- `test_portal_session_without_customer` - Missing customer handling

#### Section 5: API Integration (4 tests)
- `test_create_checkout_session_endpoint` - Checkout endpoint
- `test_create_portal_session_requires_authentication` - Auth requirements
- `test_stripe_webhook_endpoint` - Webhook endpoint
- `test_api_error_handling_missing_stripe_key` - Missing config handling

#### Section 6: Database Verification (4 tests)
- `test_subscription_record_creation` - Record creation
- `test_user_tier_updates_in_database` - Tier updates
- `test_subscription_status_sync` - Status synchronization
- `test_failed_payment_handling_in_database` - Failed payment handling

#### Section 7: PCI Compliance (2 tests)
- `test_no_card_data_in_logs` - Log sanitization
- `test_no_payment_method_details_in_response` - Response sanitization

#### Section 8: Edge Cases (3 tests)
- `test_concurrent_webhook_processing` - Race condition handling
- `test_subscription_expired_handling` - Expired subscription handling
- `test_checkout_session_timeout` - Session expiration
- `test_invalid_webhook_payload` - Malformed payload handling

## Prerequisites

### Required Dependencies

```bash
pip install -r requirements.txt
```

Required packages:
- `pytest>=7.0.0` - Test framework
- `pytest-asyncio>=0.21.0` - Async test support
- `pytest-mock>=3.10.0` - Mocking utilities
- `stripe>=5.0.0` - Stripe SDK
- `fastapi[all]>=0.100.0` - API framework
- `httpx>=0.24.0` - HTTP client for TestClient

### Environment Setup

Create a `.env.test` file:

```bash
# Stripe Test Configuration
STRIPE_SECRET_KEY=sk_test_mock_key_12345
STRIPE_WEBHOOK_SECRET=whsec_test_secret
STRIPE_PRICE_MCP_PERSONAL=price_personal_123
STRIPE_PRICE_MCP_TEAM=price_team_456
STRIPE_PRICE_MCP_ENTERPRISE=price_enterprise_789

# Database Configuration (use test database)
DATABASE_URL=postgresql://test_user:test_pass@localhost:5432/kamiyo_test

# Redis Configuration (optional for tests)
REDIS_URL=redis://localhost:6379/1

# Environment
ENVIRONMENT=test
```

## Running the Tests

### Run All Tests

```bash
pytest tests/test_stripe_e2e.py -v
```

### Run Specific Test Section

```bash
# Checkout tests only
pytest tests/test_stripe_e2e.py::TestCheckoutSessionCreation -v

# Webhook tests only
pytest tests/test_stripe_e2e.py::TestWebhookProcessing -v

# Subscription management tests only
pytest tests/test_stripe_e2e.py::TestSubscriptionManagement -v

# Database tests only
pytest tests/test_stripe_e2e.py::TestDatabaseVerification -v

# PCI compliance tests only
pytest tests/test_stripe_e2e.py::TestPCICompliance -v
```

### Run Single Test

```bash
pytest tests/test_stripe_e2e.py::TestCheckoutSessionCreation::test_create_checkout_personal_tier -v
```

### Run with Coverage

```bash
pytest tests/test_stripe_e2e.py --cov=api.billing --cov=api.webhooks --cov=api.subscriptions --cov-report=html
```

### Run with Detailed Output

```bash
pytest tests/test_stripe_e2e.py -v -s --tb=long
```

### Run Async Tests Only

```bash
pytest tests/test_stripe_e2e.py -v -m asyncio
```

## Test Architecture

### Mocking Strategy

The tests use comprehensive mocking to avoid:
- ❌ Real Stripe API calls (no charges incurred)
- ❌ Real database modifications (isolated test data)
- ❌ External service dependencies

### Fixtures

Key fixtures used across tests:
- `client` - FastAPI TestClient
- `mock_stripe_key` - Mocked Stripe configuration
- `mock_database` - Mocked database operations
- `sample_customer` - Test customer data
- `sample_subscription` - Test subscription data
- `webhook_signature_generator` - HMAC signature generator

### Test Data

All test data uses safe values:
- Customer ID: `cus_test123`
- Subscription ID: `sub_test123`
- Email: `test@example.com`
- Prices: Test mode price IDs

## Expected Results

### Success Criteria

All tests should pass with output similar to:

```
tests/test_stripe_e2e.py::TestCheckoutSessionCreation::test_create_checkout_personal_tier PASSED
tests/test_stripe_e2e.py::TestCheckoutSessionCreation::test_create_checkout_team_tier PASSED
tests/test_stripe_e2e.py::TestCheckoutSessionCreation::test_create_checkout_enterprise_tier PASSED
...
============================== 35 passed in 2.45s ==============================
```

### Coverage Targets

- API endpoints: 90%+ coverage
- Webhook handlers: 95%+ coverage
- Subscription manager: 90%+ coverage
- Database operations: 85%+ coverage

## Troubleshooting

### Common Issues

#### Import Errors

```bash
# Fix: Add project root to PYTHONPATH
export PYTHONPATH="${PYTHONPATH}:/path/to/kamiyo"
pytest tests/test_stripe_e2e.py -v
```

#### Database Connection Errors

```bash
# Tests use mocked database - ensure mock_database fixture is used
# If you see real DB errors, check that patches are applied correctly
```

#### Async Test Failures

```bash
# Ensure pytest-asyncio is installed
pip install pytest-asyncio

# Check that async tests have @pytest.mark.asyncio decorator
```

#### Stripe Import Errors

```bash
# Install Stripe SDK
pip install stripe>=5.0.0
```

### Debug Mode

Run with debug output:

```bash
pytest tests/test_stripe_e2e.py -v -s --log-cli-level=DEBUG
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Stripe E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pytest pytest-asyncio pytest-cov

      - name: Run Stripe E2E tests
        run: |
          pytest tests/test_stripe_e2e.py -v --cov --cov-report=xml
        env:
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_TEST_KEY }}
          STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_WEBHOOK_SECRET }}

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage.xml
```

## Security Notes

### PCI DSS Compliance

These tests verify PCI compliance:
1. **No card data in logs** - Verified by `test_no_card_data_in_logs`
2. **No sensitive data in responses** - Verified by `test_no_payment_method_details_in_response`
3. **Webhook signature verification** - Verified by `test_webhook_signature_validation_failure`

### Test Data Security

- Uses only test mode Stripe keys (sk_test_*)
- No real customer data
- All sensitive values mocked
- Webhook secrets are test values

## Maintenance

### Adding New Tests

1. Add test to appropriate test class
2. Use existing fixtures for consistency
3. Mock external dependencies
4. Follow naming convention: `test_<feature>_<scenario>`
5. Add docstring explaining test purpose

### Updating Test Data

When Stripe API changes:
1. Update mock responses in fixtures
2. Update assertion expectations
3. Run full test suite to verify
4. Update this README with changes

## Performance

Expected test execution times:
- Full suite: ~2-3 seconds
- Single test class: ~0.5 seconds
- Single test: ~0.1 seconds

Fast execution due to:
- Comprehensive mocking
- No network calls
- No real database operations
- Parallel test execution (with pytest-xdist)

## Related Documentation

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [pytest Documentation](https://docs.pytest.org/)

## Support

For issues with tests:
1. Check environment configuration
2. Verify all dependencies installed
3. Review test output for specific errors
4. Check that mocks are properly configured

For Stripe integration issues:
1. Verify Stripe test keys in `.env.test`
2. Check Stripe API version compatibility
3. Review Stripe webhook configuration
4. Test with Stripe CLI for webhook debugging

## License

These tests are part of the KAMIYO project and follow the same license.
