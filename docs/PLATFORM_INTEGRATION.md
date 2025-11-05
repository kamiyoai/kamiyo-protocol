# KAMIYO Platform Integration

## Overview

KAMIYO operates as a dual-use system:

1. **kamiyo-hyperliquid** - Open source Hyperliquid security monitor
2. **kamiyo.ai Platform** - Commercial multi-protocol monitoring platform

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              KAMIYO.AI ECOSYSTEM                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Open Source: kamiyo-hyperliquid                 │   │
│  │ • Self-hostable                                 │   │
│  │ • AGPL-3.0 License                             │   │
│  │ • Full Hyperliquid monitoring                   │   │
│  │ • Community-driven                              │   │
│  │ • Free for <$1M revenue                        │   │
│  └─────────────────────────────────────────────────┘   │
│                         ⬆                                │
│                         │ imports as module              │
│                         │                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Commercial: kamiyo.ai Platform (Proprietary)    │   │
│  │ • Managed cloud hosting                         │   │
│  │ • Multi-protocol support (20+ aggregators)      │   │
│  │ • Advanced ML models                            │   │
│  │ • Enterprise features (SSO, RBAC, SLA)         │   │
│  │ • Multi-tenant architecture                     │   │
│  │ • Professional support                          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Deployment Modes

Set via `DEPLOYMENT_MODE` environment variable:

### `open_source`
- Single protocol (Hyperliquid)
- Basic ML (Isolation Forest, ARIMA)
- Community support
- Self-hosted only
- No commercial features

### `cloud_basic` ($99/mo)
- Up to 5 protocols
- Basic ML models
- Email support
- Managed hosting
- API rate limits: 10k/day

### `cloud_pro` ($299/mo)
- Up to 20 protocols
- Advanced ML (Ensemble, Cross-Protocol Correlation)
- Priority support
- Custom branding
- API rate limits: 100k/day

### `cloud_enterprise` ($2,499/mo)
- Unlimited protocols
- All ML features
- Dedicated support
- White-label
- SLA guarantees
- Unlimited API calls

## New Platform Components

### 1. Platform Configuration (`platform/config.py`)
- Feature flags per deployment tier
- Resource limits
- Support tier definitions

### 2. Multi-Tenant Database Layer (`platform/multi_tenant.py`)
- Tenant isolation via `tenant_id`
- Automatic tenant context
- Query filtering mixins

### 3. Aggregator Registry (`platform/aggregator_registry.py`)
- Dynamic protocol loading
- Tier-based access control
- 20+ protocol support

### 4. Advanced ML Models (`ml_models_advanced/`)
- **Ensemble Anomaly Detector** - Combines Isolation Forest, SVM, Random Forest
- **Cross-Protocol Correlator** - Detects multi-protocol attack patterns

## Integration with Existing System

The platform layer extends existing KAMIYO functionality:

- **Aggregators**: All existing aggregators work with registry system
- **API**: Billing/subscriptions already integrated
- **Database**: Tenant isolation via migrations
- **Hyperliquid**: kamiyo-hyperliquid remains standalone

## Configuration

Add to `.env`:

```bash
# Platform Configuration
DEPLOYMENT_MODE=open_source  # or cloud_basic, cloud_pro, cloud_enterprise
```

## Feature Availability Matrix

| Feature | Open Source | Basic | Pro | Enterprise |
|---------|-------------|-------|-----|------------|
| Hyperliquid Monitor | ✓ | ✓ | ✓ | ✓ |
| Multi-Protocol | - | 5 | 20 | Unlimited |
| Basic ML | ✓ | ✓ | ✓ | ✓ |
| Advanced ML | - | - | ✓ | ✓ |
| Cross-Protocol Correlation | - | - | ✓ | ✓ |
| Social Sentiment | - | - | ✓ | ✓ |
| Custom Branding | - | - | ✓ | ✓ |
| White Label | - | - | - | ✓ |
| API Calls/Day | 100k | 10k | 100k | Unlimited |
| Support | Community | Email | Priority | Dedicated |
| SLA | - | - | - | 99.9% |

## Usage

### Check Available Features

```python
from platform.config import is_feature_enabled, get_limit

# Check if advanced ML is available
if is_feature_enabled('ml_advanced'):
    from ml_models_advanced import EnsembleAnomalyDetector
    detector = EnsembleAnomalyDetector()

# Get API rate limit
limit = get_limit('api_calls_per_day')
```

### Load Protocols via Registry

```python
from platform.aggregator_registry import get_registry

registry = get_registry()

# Get available protocols for current tier
protocols = registry.get_available_protocols(tier='cloud_pro')

# Load specific aggregator
hyperliquid = registry.load_aggregator('hyperliquid_hlp')
exploits = hyperliquid.fetch_exploits()
```

### Multi-Tenant Queries

```python
from platform.multi_tenant import set_current_tenant

# Set tenant context
set_current_tenant('customer_abc123')

# All queries automatically filtered by tenant_id
exploits = session.query(Exploit).all()  # Only returns customer's data
```

## Billing Integration

Stripe integration already exists in `api/billing` and `api/subscriptions`.

Subscription tiers map to deployment modes:
- Basic tier → `cloud_basic`
- Pro tier → `cloud_pro`
- Enterprise tier → `cloud_enterprise`

## Migration

To enable multi-tenant support:

```python
from platform.multi_tenant import add_tenant_column_migration

# Run migration SQL
migration_sql = add_tenant_column_migration()
# Execute against your database
```

## Next Steps

1. Configure Kubernetes deployments (`deploy/kubernetes/`)
2. Set up monitoring (`prometheus-client` already in requirements)
3. Configure Stripe product tiers
4. Deploy to cloud infrastructure
5. Launch kamiyo.ai marketing site

## Support

- Open Source: GitHub Issues
- Commercial: support@kamiyo.ai
- Enterprise: Dedicated Slack channel
