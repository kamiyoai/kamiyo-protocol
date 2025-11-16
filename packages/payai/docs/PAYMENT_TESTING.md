# Payment System Testing Guide

## Overview

This document describes the comprehensive testing strategy for the Kamiyo payment system, covering Stripe integration, subscriptions, webhooks, and billing.

## Test Suite Structure

```
tests/
├── __init__.py
├── payments/
│   ├── __init__.py
│   ├── fixtures.py                    # Reusable test fixtures
│   ├── test_stripe_client.py          # Stripe API wrapper tests (350+ lines)
│   ├── test_subscription_manager.py   # Subscription management tests (500+ lines)
│   ├── test_usage_tracker.py          # Rate limiting tests (400+ lines)
│   ├── test_webhooks.py               # Webhook processing tests (250+ lines)
│   └── test_billing_routes.py         # API endpoint tests (250+ lines)
├── integration/
│   └── test_payment_flow.py           # End-to-end flow tests
└── load/
    └── test_payment_performance.py    # Performance tests
```

## Quick Start

### Install Test Dependencies

```bash
# Install pytest and related tools
pip install pytest pytest-asyncio pytest-mock pytest-cov

# Install mocking libraries
pip install fakeredis responses

# Install Stripe test mode
pip install stripe --upgrade
```

### Run All Tests

```bash
# Run all payment tests
pytest tests/payments/ -v

# Run with coverage
pytest tests/payments/ --cov=api/payments --cov=api/subscriptions --cov=api/webhooks --cov=api/billing

# Run specific test file
pytest tests/payments/test_stripe_client.py -v

# Run specific test class
pytest tests/payments/test_stripe_client.py::TestCustomerOperations -v

# Run specific test
pytest tests/payments/test_stripe_client.py::TestCustomerOperations::test_create_customer_success -v
```

### Run Integration Tests

```bash
# Requires test database and Redis
export DATABASE_URL=postgresql://localhost/kamiyo_test
export REDIS_URL=redis://localhost:6379/1
export STRIPE_SECRET_KEY=sk_test_...
export TESTING=true

pytest tests/integration/ -v
```

### Run Load Tests

```bash
# Performance benchmarks
pytest tests/load/ -v --benchmark-only
```

## Test Categories

### 1. Unit Tests

**Purpose**: Test individual components in isolation

**Coverage Targets**:
- Stripe client: >90%
- Subscription manager: >90%
- Usage tracker: >95%
- Webhooks: >90%
- Billing routes: >85%

**Key Files**:
- `test_stripe_client.py`: Tests for customer, subscription, and payment method operations
- `test_subscription_manager.py`: Tests for tier management and feature access
- `test_usage_tracker.py`: Tests for rate limiting and usage tracking
- `test_webhooks.py`: Tests for webhook signature verification and event processing
- `test_billing_routes.py`: Tests for billing API endpoints

### 2. Integration Tests

**Purpose**: Test multiple components working together

**Key Scenarios**:
- Complete signup flow (user → customer → subscription)
- Upgrade/downgrade flows
- Payment success/failure flows
- Webhook end-to-end processing
- Cancellation flows

### 3. Load Tests

**Purpose**: Verify performance under load

**Metrics**:
- Rate limiting throughput (1000+ req/s)
- Webhook processing latency
- Database query performance
- Redis cache performance

## Testing Best Practices

### AAA Pattern

Always follow Arrange-Act-Assert pattern:

```python
@pytest.mark.asyncio
async def test_create_customer_success(self, stripe_client):
    # Arrange
    user_id = 1
    email = "test@kamiyo.ai"
    
    # Act
    result = await stripe_client.create_customer(user_id, email)
    
    # Assert
    assert result is not None
    assert result['email'] == email
```

### Use Fixtures

Reuse common test data:

```python
@pytest.fixture
def test_customer():
    return {
        'id': 1,
        'stripe_customer_id': 'cus_test123',
        'email': 'test@kamiyo.ai'
    }

def test_something(test_customer):
    assert test_customer['id'] == 1
```

### Mock External Services

Always mock Stripe API calls:

```python
@patch('stripe.Customer.create')
async def test_create_customer(mock_stripe_create):
    mock_stripe_create.return_value = Mock(id='cus_123')
    # Test code here
```

### Test Both Success and Failure

```python
async def test_success_case(self):
    # Test happy path
    pass

async def test_failure_case(self):
    # Test error handling
    with pytest.raises(Exception):
        # Code that should fail
        pass
```

## Testing Stripe Webhooks

### Local Webhook Testing

Use Stripe CLI to forward webhooks:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to http://localhost:8000/api/v1/webhooks/stripe

# Trigger test events
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
stripe trigger invoice.payment_failed
```

### Mock Webhook Events

```python
@pytest.fixture
def webhook_payment_succeeded():
    return {
        'id': 'evt_test123',
        'type': 'invoice.payment_succeeded',
        'data': {
            'object': {
                'id': 'in_test123',
                'amount_paid': 1900,
                'customer': 'cus_test123'
            }
        }
    }

async def test_webhook(webhook_payment_succeeded):
    await handle_webhook_event(webhook_payment_succeeded)
```

## Testing Rate Limiting

### Test Sliding Window Algorithm

```python
def test_rate_limit_minute():
    tracker = UsageTracker()
    user_id = "test_user"
    
    # Make 10 calls (FREE tier limit)
    for _ in range(10):
        tracker.track_api_call(user_id)
    
    # Check rate limit
    result = tracker.check_rate_limit(user_id, TierName.FREE)
    assert result['remaining_minute'] == 0
    assert result['allowed'] is False
```

### Test Across Time Windows

```python
def test_rate_limit_multiple_windows():
    tracker = UsageTracker()
    
    # Test minute limit
    assert tracker.check_rate_limit(user, tier)['allowed']
    
    # Test hour limit
    # Test day limit
```

## Testing Subscription Tiers

### Test Feature Access

```python
@pytest.mark.asyncio
async def test_free_tier_features():
    manager = SubscriptionManager()
    
    # FREE tier should have email alerts
    assert await manager.check_feature_access(user, 'email_alerts')
    
    # But not Discord alerts
    assert not await manager.check_feature_access(user, 'discord_alerts')
```

### Test Tier Changes

```python
@pytest.mark.asyncio
async def test_upgrade_flow():
    manager = SubscriptionManager()
    
    # Upgrade from FREE to BASIC
    result = await manager.upgrade_subscription(user_id, TierName.BASIC)
    assert result.tier == TierName.BASIC
    
    # Usage should be reset
    assert tracker.get_usage_count(user_id, 'day') == 0
```

## Coverage Reports

### Generate HTML Coverage Report

```bash
# Run tests with coverage
pytest tests/payments/ --cov=api/payments --cov=api/subscriptions --cov=api/webhooks --cov=api/billing --cov-report=html

# Open report
open htmlcov/index.html
```

### Generate Terminal Report

```bash
pytest tests/payments/ --cov=api/payments --cov-report=term-missing
```

### Coverage Thresholds

```bash
# Fail if coverage below 85%
pytest tests/payments/ --cov=api/payments --cov-fail-under=85
```

## CI/CD Integration

### GitHub Actions

Tests run automatically on:
- Pull requests to main
- Commits to main
- Daily schedule

See `.github/workflows/test-payments.yml` for configuration.

### Pre-commit Hooks

```bash
# Install pre-commit
pip install pre-commit

# Setup hooks
pre-commit install

# Run manually
pre-commit run --all-files
```

## Troubleshooting

### Redis Connection Issues

```bash
# Check Redis is running
redis-cli ping

# Use fake Redis for tests
# (Already configured in fixtures.py)
```

### Database Issues

```bash
# Create test database
createdb kamiyo_test

# Run migrations
psql kamiyo_test < database/schema.sql
```

### Stripe API Issues

```bash
# Check API key is set
echo $STRIPE_SECRET_KEY

# Use test mode key
export STRIPE_SECRET_KEY=sk_test_...

# Check Stripe CLI
stripe --version
```

### Test Failures

```bash
# Run with verbose output
pytest tests/payments/ -vv

# Run with print statements
pytest tests/payments/ -s

# Run single failing test
pytest tests/payments/test_file.py::test_name -vv

# Debug with pdb
pytest tests/payments/ --pdb
```

## Test Data Management

### Creating Test Data

Use the test data generator:

```bash
python scripts/stripe_test_data.py --customers 10 --subscriptions 5
```

### Cleaning Test Data

```bash
# Clean Stripe test data
python scripts/stripe_test_data.py --clean

# Clean test database
psql kamiyo_test -c "TRUNCATE customers, subscriptions, invoices CASCADE;"
```

## Performance Benchmarks

### Expected Performance

- Stripe API calls: <500ms
- Database queries: <50ms
- Redis operations: <10ms
- Webhook processing: <200ms
- Rate limit checks: <5ms

### Running Benchmarks

```bash
# Run with benchmark plugin
pytest tests/load/ --benchmark-only

# Compare benchmarks
pytest tests/load/ --benchmark-compare
```

## Security Testing

### Test Signature Verification

```python
def test_invalid_signature():
    with pytest.raises(SignatureVerificationError):
        verify_webhook_signature(payload, invalid_signature)
```

### Test Authentication

```python
def test_unauthorized_access():
    with pytest.raises(HTTPException) as exc:
        await get_invoice(invoice_id, wrong_user)
    assert exc.value.status_code == 403
```

## Next Steps for Week 3

Week 3 will focus on:
1. Frontend payment integration
2. Email notification system
3. Advanced analytics
4. Multi-tenancy support

Ensure all Week 2 tests pass before proceeding.

## Resources

- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [pytest Documentation](https://docs.pytest.org/)
- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [Redis Testing](https://github.com/jamesls/fakeredis)

## Support

For testing issues:
1. Check this documentation
2. Review test examples in `tests/payments/`
3. Consult Kamiyo development team
4. Check Stripe API status
