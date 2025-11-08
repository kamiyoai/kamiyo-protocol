# x402 Infrastructure SaaS - Production Implementation Plan

**Target Agent:** Claude Sonnet 4.5
**Objective:** Transform KAMIYO's x402 payment infrastructure into a production-ready SaaS platform
**Business Model:** 4-tier pricing (Free + 3 paid tiers) + $KAMIYO token utility layer
**Execution Mode:** Production-ready, A+ grade implementation

**NOTE:** This plan includes $KAMIYO token integration. See `KAMIYO_TOKEN_PLAN.md` for separate token development details.

---

## Executive Summary

### What We Have (Asset Inventory)

**Production-Grade x402 Infrastructure (3,963 LOC, 138 classes/functions):**

✅ **Payment Verification Engine**
- Multi-chain USDC verification (Solana, Base, Ethereum)
- PayAI facilitator integration (12 chains total)
- On-chain transaction parsing and validation
- Risk scoring system
- Confidential Transfer support ready

✅ **Payment Gateway**
- Unified payment gateway (PayAI + native)
- HTTP 402 middleware
- Multi-facilitator priority routing
- Payment analytics and tracking

✅ **Database Layer**
- PostgreSQL/SQLite models
- Payment tracking with expiry
- Token-based authentication
- Usage analytics

✅ **Test Coverage**
- 12 test files with E2E coverage
- EVM and Solana integration tests
- Production readiness tests

**What's Missing for SaaS:**

❌ Multi-tenant architecture
❌ API key management
❌ Dashboard/admin panel
❌ Billing integration (Stripe for subscriptions)
❌ SDK/developer tools
❌ Documentation/developer portal
❌ Monitoring & observability
❌ Onboarding flow

### Business Pivot Strategy

**From:** Exploit intelligence API (failed validation - no paying customers)
**To:** x402 payment infrastructure as a service

**Target Customers:**
- AI agent developers (ERC-8004 ecosystem)
- API developers adding paywalls
- Data providers (price feeds, weather, sports)
- Micropayment services (pay-per-use APIs)

**Why This Works:**
- x402 is growing but complex to implement
- Your infrastructure is production-ready
- Picks and shovels strategy (sell tools, not end product)
- Multiple revenue streams (hosting + platform fees)

---

## Phase 1: Multi-Tenant SaaS Foundation (Days 1-5)

### Task 1.1: Multi-Tenant Architecture

**File:** `api/x402_saas/tenant_manager.py` (NEW)

**Implementation:**
```python
"""
Multi-tenant management for x402 Infrastructure SaaS

Each tenant gets:
- Isolated payment wallet addresses
- Separate API keys
- Usage quotas based on tier
- Analytics dashboard
"""

from typing import Dict, Optional, List
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
import secrets

@dataclass
class Tenant:
    """SaaS tenant (customer) record"""
    id: str
    email: str
    company_name: str
    tier: str  # 'free', 'starter', 'pro', 'enterprise'
    status: str  # 'active', 'suspended', 'cancelled'
    created_at: datetime

    # Payment addresses (generated per tenant)
    solana_payment_address: str
    base_payment_address: str
    ethereum_payment_address: str

    # Quotas
    monthly_verification_limit: int
    monthly_verifications_used: int

    # Features enabled
    enabled_chains: List[str]
    payai_enabled: bool
    custom_branding: bool
    webhooks_enabled: bool


class TenantManager:
    """
    Manage SaaS tenants and their payment configurations

    Responsibilities:
    - Create tenant accounts
    - Generate isolated payment addresses per tenant
    - Track usage against quotas
    - Enforce tier limits
    """

    def __init__(self, db_session):
        self.db = db_session

    async def create_tenant(
        self,
        email: str,
        company_name: str,
        tier: str = 'free'
    ) -> Tenant:
        """
        Create new tenant account with isolated payment infrastructure

        Steps:
        1. Generate tenant ID
        2. Generate payment wallet addresses (Solana, Base, Ethereum)
        3. Set quotas based on tier
        4. Create API keys
        5. Initialize analytics
        """
        tenant_id = self._generate_tenant_id()

        # Generate tenant-specific payment addresses
        # Each tenant gets their own addresses for payment isolation
        payment_addresses = await self._generate_payment_addresses(tenant_id)

        # Get tier configuration
        tier_config = self._get_tier_config(tier)

        tenant = Tenant(
            id=tenant_id,
            email=email,
            company_name=company_name,
            tier=tier,
            status='active',
            created_at=datetime.utcnow(),
            solana_payment_address=payment_addresses['solana'],
            base_payment_address=payment_addresses['base'],
            ethereum_payment_address=payment_addresses['ethereum'],
            monthly_verification_limit=tier_config['monthly_verifications'],
            monthly_verifications_used=0,
            enabled_chains=tier_config['chains'],
            payai_enabled=tier_config['payai_enabled'],
            custom_branding=tier_config['custom_branding'],
            webhooks_enabled=tier_config['webhooks_enabled']
        )

        # Persist to database
        await self._save_tenant(tenant)

        # Create API keys
        api_key = await self._create_api_key(tenant_id, tier)

        return tenant, api_key

    def _get_tier_config(self, tier: str) -> Dict:
        """Get configuration for pricing tier"""
        tiers = {
            'free': {
                'monthly_verifications': 1_000,
                'chains': ['solana', 'base'],
                'payai_enabled': False,
                'custom_branding': False,
                'webhooks_enabled': False,
                'price_monthly': 0
            },
            'starter': {
                'monthly_verifications': 50_000,
                'chains': ['solana', 'base', 'ethereum'],
                'payai_enabled': True,
                'custom_branding': False,
                'webhooks_enabled': True,
                'price_monthly': 99
            },
            'pro': {
                'monthly_verifications': 500_000,
                'chains': ['solana', 'base', 'ethereum', 'polygon', 'avalanche', 'sei'],
                'payai_enabled': True,
                'custom_branding': True,
                'webhooks_enabled': True,
                'price_monthly': 299
            },
            'enterprise': {
                'monthly_verifications': -1,  # Unlimited
                'chains': ['all'],
                'payai_enabled': True,
                'custom_branding': True,
                'webhooks_enabled': True,
                'price_monthly': 999
            }
        }
        return tiers.get(tier, tiers['free'])

    async def _generate_payment_addresses(self, tenant_id: str) -> Dict[str, str]:
        """
        Generate isolated payment addresses for tenant

        Options:
        1. Derive from master HD wallet (recommended for production)
        2. Create new wallets per tenant (simpler but more management)
        3. Use payment splitting contracts (advanced)
        """
        # TODO: Implement HD wallet derivation for production
        # For now, use placeholder addresses

        from solders.keypair import Keypair
        from web3 import Web3

        # Generate Solana address
        solana_keypair = Keypair()
        solana_address = str(solana_keypair.pubkey())

        # Generate EVM address (Base, Ethereum)
        account = Web3().eth.account.create()
        evm_address = account.address

        return {
            'solana': solana_address,
            'base': evm_address,
            'ethereum': evm_address  # Same address for all EVM chains
        }

    def _generate_tenant_id(self) -> str:
        """Generate unique tenant ID"""
        return f"tenant_{secrets.token_urlsafe(16)}"

    async def check_quota(self, tenant_id: str) -> bool:
        """Check if tenant has remaining quota"""
        tenant = await self._get_tenant(tenant_id)

        if tenant.tier == 'enterprise':
            return True  # Unlimited

        return tenant.monthly_verifications_used < tenant.monthly_verification_limit

    async def record_verification(self, tenant_id: str):
        """Record a verification against tenant quota"""
        tenant = await self._get_tenant(tenant_id)
        tenant.monthly_verifications_used += 1
        await self._save_tenant(tenant)
```

**Database Schema:**
```sql
-- api/x402_saas/models.py
class SaaSTenant(Base):
    __tablename__ = "x402_saas_tenants"

    id = Column(String(64), primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    company_name = Column(String(255))
    tier = Column(String(50), nullable=False, index=True)
    status = Column(String(50), nullable=False, index=True)

    # Payment addresses (tenant-specific)
    solana_payment_address = Column(String(255), unique=True, index=True)
    base_payment_address = Column(String(255), unique=True, index=True)
    ethereum_payment_address = Column(String(255), unique=True, index=True)

    # Quotas
    monthly_verification_limit = Column(Integer, nullable=False)
    monthly_verifications_used = Column(Integer, default=0)
    quota_reset_date = Column(DateTime(timezone=True))

    # Features
    enabled_chains = Column(JSON)  # List of allowed chains
    payai_enabled = Column(Boolean, default=False)
    custom_branding = Column(Boolean, default=False)
    webhooks_enabled = Column(Boolean, default=False)

    # Billing
    stripe_customer_id = Column(String(255), index=True)
    stripe_subscription_id = Column(String(255))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    api_keys = relationship("SaaSAPIKey", back_populates="tenant")
    verifications = relationship("SaaSVerification", back_populates="tenant")
```

**Acceptance Criteria:**
- [ ] Tenant creation with unique payment addresses
- [ ] Tier-based quota enforcement
- [ ] Database schema migration
- [ ] Quota reset monthly (cron job)
- [ ] Unit tests for tenant manager
- [ ] Isolation tests (tenant A can't access tenant B data)

### Task 1.2: API Key Management

**File:** `api/x402_saas/api_key_manager.py` (NEW)

**Implementation:**
```python
"""
API Key management for x402 SaaS

API keys format: x402_live_XXXXX (production) or x402_test_XXXXX (sandbox)
"""

import secrets
import hashlib
from typing import Optional, Dict
from datetime import datetime, timedelta

class APIKeyManager:
    """
    Manage tenant API keys for x402 infrastructure access

    Features:
    - Key generation (live and test keys)
    - Key rotation
    - Rate limiting per key
    - Key revocation
    - Scope-based permissions
    """

    KEY_PREFIX_LIVE = "x402_live_"
    KEY_PREFIX_TEST = "x402_test_"

    def __init__(self, db_session):
        self.db = db_session

    async def create_api_key(
        self,
        tenant_id: str,
        name: str,
        environment: str = 'live',  # 'live' or 'test'
        scopes: List[str] = None
    ) -> Dict:
        """
        Create new API key for tenant

        Args:
            tenant_id: Tenant ID
            name: Key name (e.g., "Production API", "Development")
            environment: 'live' or 'test'
            scopes: List of permissions (e.g., ['verify', 'settle'])

        Returns:
            {
                'api_key': 'x402_live_XXXXX',
                'key_id': 'key_123',
                'created_at': datetime
            }
        """
        # Generate secure random key
        prefix = self.KEY_PREFIX_LIVE if environment == 'live' else self.KEY_PREFIX_TEST
        random_suffix = secrets.token_urlsafe(32)
        api_key = f"{prefix}{random_suffix}"

        # Hash for storage (never store plaintext)
        key_hash = self._hash_key(api_key)

        # Default scopes
        if scopes is None:
            scopes = ['verify', 'settle', 'analytics']

        # Create key record
        key_record = SaaSAPIKey(
            tenant_id=tenant_id,
            key_hash=key_hash,
            name=name,
            environment=environment,
            scopes=scopes,
            created_at=datetime.utcnow(),
            last_used_at=None,
            is_active=True
        )

        await self._save_key(key_record)

        return {
            'api_key': api_key,  # Only returned once!
            'key_id': key_record.id,
            'created_at': key_record.created_at,
            'environment': environment,
            'scopes': scopes
        }

    async def validate_api_key(self, api_key: str) -> Optional[Dict]:
        """
        Validate API key and return tenant info

        Returns:
            {
                'tenant_id': 'tenant_xxx',
                'tier': 'pro',
                'scopes': ['verify', 'settle'],
                'environment': 'live'
            }
        """
        key_hash = self._hash_key(api_key)

        key_record = await self._get_key_by_hash(key_hash)

        if not key_record or not key_record.is_active:
            return None

        # Update last_used_at
        key_record.last_used_at = datetime.utcnow()
        await self._save_key(key_record)

        # Get tenant info
        tenant = await self._get_tenant(key_record.tenant_id)

        return {
            'tenant_id': tenant.id,
            'tier': tenant.tier,
            'scopes': key_record.scopes,
            'environment': key_record.environment,
            'tenant_status': tenant.status
        }

    def _hash_key(self, api_key: str) -> str:
        """Hash API key for secure storage"""
        return hashlib.sha256(api_key.encode()).hexdigest()
```

**Database Schema:**
```python
class SaaSAPIKey(Base):
    __tablename__ = "x402_saas_api_keys"

    id = Column(String(64), primary_key=True)
    tenant_id = Column(String(64), ForeignKey("x402_saas_tenants.id"), nullable=False, index=True)

    key_hash = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(255))
    environment = Column(String(10), nullable=False)  # 'live' or 'test'
    scopes = Column(JSON)  # List of permissions

    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True))
    revoked_at = Column(DateTime(timezone=True))

    # Relationships
    tenant = relationship("SaaSTenant", back_populates="api_keys")
```

**Acceptance Criteria:**
- [ ] API key generation (live and test)
- [ ] Secure key storage (hashed, never plaintext)
- [ ] Key validation middleware
- [ ] Key rotation support
- [ ] Scope-based permissions
- [ ] Usage tracking (last_used_at)
- [ ] Unit tests with key validation

### Task 1.3: SaaS Payment Verification Wrapper

**File:** `api/x402_saas/verification_service.py` (NEW)

**Implementation:**
```python
"""
SaaS wrapper for x402 payment verification

Adds multi-tenancy, quota enforcement, and billing on top of core verification
"""

from decimal import Decimal
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)

class SaaSVerificationService:
    """
    Multi-tenant payment verification service

    Wraps core payment_verifier.py with:
    - Tenant isolation
    - Quota enforcement
    - Usage tracking
    - Billing integration
    """

    def __init__(self, tenant_manager, api_key_manager):
        from api.x402.payment_verifier import payment_verifier

        self.core_verifier = payment_verifier
        self.tenant_manager = tenant_manager
        self.api_key_manager = api_key_manager

    async def verify_payment(
        self,
        api_key: str,
        tx_hash: str,
        chain: str,
        expected_amount: Optional[Decimal] = None
    ) -> Dict:
        """
        Verify payment with tenant context

        Flow:
        1. Validate API key
        2. Check tenant quota
        3. Call core verification
        4. Record usage
        5. Return result
        """

        # 1. Validate API key
        key_info = await self.api_key_manager.validate_api_key(api_key)

        if not key_info:
            return {
                'success': False,
                'error': 'Invalid API key',
                'error_code': 'INVALID_API_KEY'
            }

        tenant_id = key_info['tenant_id']

        # Check if tenant is active
        if key_info['tenant_status'] != 'active':
            return {
                'success': False,
                'error': 'Tenant account suspended',
                'error_code': 'TENANT_SUSPENDED'
            }

        # 2. Check quota
        has_quota = await self.tenant_manager.check_quota(tenant_id)

        if not has_quota:
            return {
                'success': False,
                'error': 'Monthly quota exceeded. Upgrade your plan.',
                'error_code': 'QUOTA_EXCEEDED',
                'upgrade_url': 'https://x402.dev/upgrade'
            }

        # Check if chain is enabled for this tier
        tenant = await self.tenant_manager._get_tenant(tenant_id)
        if chain not in tenant.enabled_chains and 'all' not in tenant.enabled_chains:
            return {
                'success': False,
                'error': f'Chain {chain} not enabled for your tier',
                'error_code': 'CHAIN_NOT_ENABLED',
                'upgrade_url': 'https://x402.dev/upgrade'
            }

        # 3. Call core verification
        verification = await self.core_verifier.verify_payment(
            tx_hash=tx_hash,
            chain=chain,
            expected_amount=expected_amount
        )

        # 4. Record usage (only if verification attempted, not if quota exceeded)
        await self.tenant_manager.record_verification(tenant_id)

        # 5. Store verification for analytics
        await self._store_verification_record(
            tenant_id=tenant_id,
            tx_hash=tx_hash,
            chain=chain,
            success=verification.is_valid,
            amount_usdc=verification.amount_usdc if verification.is_valid else None
        )

        # 6. Return result
        return {
            'success': verification.is_valid,
            'tx_hash': verification.tx_hash,
            'chain': verification.chain,
            'amount_usdc': float(verification.amount_usdc),
            'from_address': verification.from_address,
            'to_address': verification.to_address,
            'confirmations': verification.confirmations,
            'risk_score': verification.risk_score,
            'error': verification.error_message if not verification.is_valid else None,
            'error_code': self._map_error_code(verification.error_message) if not verification.is_valid else None
        }
```

**Acceptance Criteria:**
- [ ] API key validation integration
- [ ] Quota enforcement before verification
- [ ] Usage tracking per tenant
- [ ] Error code mapping
- [ ] Chain permission enforcement
- [ ] Integration tests with multiple tenants

---

## Phase 2: Developer Portal & Dashboard (Days 6-10)

### Task 2.1: RESTful SaaS API

**File:** `api/x402_saas/routes.py` (NEW)

**Implementation:**
```python
"""
x402 Infrastructure SaaS API Routes

Public API for customers to integrate x402 payments
"""

from fastapi import APIRouter, Header, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from decimal import Decimal

router = APIRouter(prefix="/v1", tags=["x402 SaaS"])

# Request/Response models

class VerifyPaymentRequest(BaseModel):
    tx_hash: str
    chain: str
    expected_amount: Optional[float] = None

class VerifyPaymentResponse(BaseModel):
    success: bool
    tx_hash: str
    chain: str
    amount_usdc: float
    from_address: str
    to_address: str
    confirmations: int
    risk_score: float
    error: Optional[str] = None
    error_code: Optional[str] = None

@router.post("/verify", response_model=VerifyPaymentResponse)
async def verify_payment(
    request: VerifyPaymentRequest,
    authorization: str = Header(..., description="Bearer x402_live_XXXXX")
):
    """
    Verify on-chain USDC payment

    **Authentication:** Bearer token with API key

    **Rate Limit:** Based on your plan
    - Free: 1,000/month
    - Starter: 50,000/month
    - Pro: 500,000/month
    - Enterprise: Unlimited

    **Supported Chains:**
    - Free: Solana, Base
    - Starter: Solana, Base, Ethereum
    - Pro: Solana, Base, Ethereum, Polygon, Avalanche, Sei
    - Enterprise: All chains
    """

    # Extract API key from Bearer token
    api_key = authorization.replace("Bearer ", "")

    # Call verification service
    from api.x402_saas.verification_service import verification_service

    result = await verification_service.verify_payment(
        api_key=api_key,
        tx_hash=request.tx_hash,
        chain=request.chain,
        expected_amount=Decimal(str(request.expected_amount)) if request.expected_amount else None
    )

    if not result['success'] and result.get('error_code') in ['INVALID_API_KEY', 'TENANT_SUSPENDED']:
        raise HTTPException(status_code=401, detail=result['error'])

    if not result['success'] and result.get('error_code') == 'QUOTA_EXCEEDED':
        raise HTTPException(status_code=429, detail=result['error'])

    return VerifyPaymentResponse(**result)


@router.get("/usage")
async def get_usage_stats(
    authorization: str = Header(...)
):
    """
    Get current usage statistics

    Returns:
    - Verifications used this month
    - Remaining quota
    - Tier information
    """
    api_key = authorization.replace("Bearer ", "")

    # Validate key and get tenant
    key_info = await api_key_manager.validate_api_key(api_key)

    if not key_info:
        raise HTTPException(status_code=401, detail="Invalid API key")

    tenant = await tenant_manager._get_tenant(key_info['tenant_id'])

    return {
        'tier': tenant.tier,
        'verifications_used': tenant.monthly_verifications_used,
        'verifications_limit': tenant.monthly_verification_limit,
        'verifications_remaining': tenant.monthly_verification_limit - tenant.monthly_verifications_used if tenant.monthly_verification_limit > 0 else -1,
        'quota_reset_date': tenant.quota_reset_date.isoformat(),
        'enabled_chains': tenant.enabled_chains
    }


@router.get("/supported-chains")
async def get_supported_chains(
    authorization: str = Header(...)
):
    """Get chains available for your tier"""
    api_key = authorization.replace("Bearer ", "")

    key_info = await api_key_manager.validate_api_key(api_key)

    if not key_info:
        raise HTTPException(status_code=401, detail="Invalid API key")

    tenant = await tenant_manager._get_tenant(key_info['tenant_id'])

    return {
        'tier': tenant.tier,
        'enabled_chains': tenant.enabled_chains,
        'all_chains': ['solana', 'base', 'ethereum', 'polygon', 'avalanche', 'sei', 'iotex', 'peaq']
    }
```

**Acceptance Criteria:**
- [ ] RESTful API with OpenAPI docs
- [ ] Bearer token authentication
- [ ] Rate limiting per tier
- [ ] Error handling with proper HTTP codes
- [ ] API documentation (auto-generated from OpenAPI)
- [ ] Integration tests for all endpoints

### Task 2.2: Admin Dashboard (React/Next.js)

**File:** `dashboard/` (NEW directory)

**Implementation:** Single-page React app for tenant management

**Features:**
```
Dashboard Overview:
- Current usage (verifications this month)
- Remaining quota
- Recent transactions
- Quick stats (success rate, avg latency)

API Keys:
- List all keys (masked, e.g., x402_live_XXX...XXX)
- Create new key
- Revoke key
- View key usage

Billing:
- Current plan
- Upgrade/downgrade
- Payment methods (Stripe integration)
- Invoices

Analytics:
- Verifications over time (chart)
- Success rate by chain
- Geographic distribution
- Error breakdown

Documentation:
- Getting started guide
- API reference (OpenAPI)
- Code examples (Python, JavaScript, cURL)
- Integration tutorials
```

**Tech Stack:**
- Next.js 14 (App Router)
- Tailwind CSS
- shadcn/ui components
- Recharts for analytics
- React Query for data fetching

**Sample Dashboard Component:**
```typescript
// dashboard/app/dashboard/page.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

export default function DashboardPage() {
  const { data: usage } = useQuery({
    queryKey: ['usage'],
    queryFn: async () => {
      const res = await fetch('/api/v1/usage', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('api_key')}`
        }
      })
      return res.json()
    }
  })

  const usagePercent = (usage?.verifications_used / usage?.verifications_limit) * 100

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle>Verifications This Month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            {usage?.verifications_used.toLocaleString()}
          </div>
          <Progress value={usagePercent} className="mt-2" />
          <p className="text-sm text-muted-foreground mt-2">
            {usage?.verifications_remaining.toLocaleString()} remaining
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold capitalize">
            {usage?.tier}
          </div>
          <Button className="mt-4" variant="outline">
            Upgrade Plan
          </Button>
        </CardContent>
      </Card>

      {/* More cards... */}
    </div>
  )
}
```

**Acceptance Criteria:**
- [ ] Responsive dashboard UI
- [ ] Real-time usage display
- [ ] API key management interface
- [ ] Billing integration (Stripe)
- [ ] Analytics charts
- [ ] Mobile-friendly
- [ ] Loading states and error handling

### Task 2.3: Developer Documentation

**File:** `docs/` (NEW directory using Docusaurus or Mintlify)

**Structure:**
```
docs/
├── introduction.md
├── quick-start.md
├── api-reference/
│   ├── verify-payment.md
│   ├── get-usage.md
│   └── supported-chains.md
├── guides/
│   ├── python-integration.md
│   ├── javascript-integration.md
│   ├── solana-payments.md
│   └── evm-payments.md
├── examples/
│   ├── python-flask.md
│   ├── python-fastapi.md
│   ├── nodejs-express.md
│   └── nextjs-app.md
└── advanced/
    ├── webhooks.md
    ├── error-handling.md
    └── rate-limiting.md
```

**Quick Start Example:**
```markdown
# Quick Start

Get started with x402 Infrastructure in 5 minutes.

## 1. Sign Up

Create account at [x402.dev](https://x402.dev) and get your API key.

## 2. Install SDK

\`\`\`bash
pip install x402-python
\`\`\`

## 3. Verify Your First Payment

\`\`\`python
from x402 import X402Client

client = X402Client(api_key="x402_live_XXXXX")

# Verify Solana payment
result = client.verify_payment(
    tx_hash="5KZ...",
    chain="solana",
    expected_amount=1.00
)

if result.success:
    print(f"Payment verified: {result.amount_usdc} USDC")
else:
    print(f"Verification failed: {result.error}")
\`\`\`

## 4. Integrate with Your API

\`\`\`python
from fastapi import FastAPI, Header, HTTPException
from x402 import X402Client

app = FastAPI()
x402 = X402Client(api_key="x402_live_XXXXX")

@app.get("/premium-data")
async def get_premium_data(x_payment_tx: str = Header(...)):
    # Verify payment before returning data
    result = x402.verify_payment(
        tx_hash=x_payment_tx,
        chain="solana",
        expected_amount=0.10
    )

    if not result.success:
        raise HTTPException(402, "Payment Required")

    return {"data": "Premium content here"}
\`\`\`

Done! You've integrated x402 payment verification.
```

**Acceptance Criteria:**
- [ ] Complete API reference
- [ ] Quick start guide (<5 min to first verification)
- [ ] Code examples in Python, JavaScript, cURL
- [ ] Integration tutorials for popular frameworks
- [ ] Searchable documentation
- [ ] Syntax highlighting
- [ ] Copy-paste code snippets

---

## Phase 3: SDK Development (Days 11-14)

### Task 3.1: Python SDK

**File:** `sdks/python/x402/` (NEW monorepo)

**Implementation:**
```python
# sdks/python/x402/client.py
"""
Official x402 Infrastructure Python SDK

Install:
    pip install x402-python

Usage:
    from x402 import X402Client

    client = X402Client(api_key="x402_live_XXXXX")
    result = client.verify_payment(tx_hash="...", chain="solana")
"""

import httpx
from typing import Optional
from decimal import Decimal
from dataclasses import dataclass

@dataclass
class VerificationResult:
    """Payment verification result"""
    success: bool
    tx_hash: str
    chain: str
    amount_usdc: Decimal
    from_address: str
    to_address: str
    confirmations: int
    risk_score: float
    error: Optional[str] = None
    error_code: Optional[str] = None


class X402Client:
    """
    x402 Infrastructure API client

    Official Python SDK for x402 payment verification
    """

    BASE_URL = "https://api.x402.dev"

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        timeout: int = 30
    ):
        """
        Initialize x402 client

        Args:
            api_key: Your x402 API key (get from dashboard)
            base_url: Custom API URL (for testing)
            timeout: Request timeout in seconds
        """
        self.api_key = api_key
        self.base_url = base_url or self.BASE_URL
        self.client = httpx.Client(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout
        )

    def verify_payment(
        self,
        tx_hash: str,
        chain: str,
        expected_amount: Optional[float] = None
    ) -> VerificationResult:
        """
        Verify on-chain USDC payment

        Args:
            tx_hash: Transaction hash to verify
            chain: Blockchain network (solana, base, ethereum, etc.)
            expected_amount: Expected payment amount in USDC (optional)

        Returns:
            VerificationResult with payment details

        Raises:
            X402APIError: If API request fails
            X402QuotaExceeded: If monthly quota exceeded

        Example:
            result = client.verify_payment(
                tx_hash="5KZ...",
                chain="solana",
                expected_amount=1.00
            )

            if result.success:
                print(f"Verified {result.amount_usdc} USDC")
        """
        response = self.client.post("/v1/verify", json={
            "tx_hash": tx_hash,
            "chain": chain,
            "expected_amount": expected_amount
        })

        if response.status_code == 429:
            raise X402QuotaExceeded("Monthly quota exceeded. Upgrade your plan.")

        if response.status_code == 401:
            raise X402AuthError("Invalid API key")

        if response.status_code != 200:
            raise X402APIError(f"API error: {response.status_code}")

        data = response.json()

        return VerificationResult(
            success=data['success'],
            tx_hash=data['tx_hash'],
            chain=data['chain'],
            amount_usdc=Decimal(str(data['amount_usdc'])),
            from_address=data['from_address'],
            to_address=data['to_address'],
            confirmations=data['confirmations'],
            risk_score=data['risk_score'],
            error=data.get('error'),
            error_code=data.get('error_code')
        )

    def get_usage(self) -> dict:
        """
        Get current usage statistics

        Returns:
            {
                'tier': 'pro',
                'verifications_used': 1234,
                'verifications_limit': 500000,
                'verifications_remaining': 498766,
                'quota_reset_date': '2025-12-01T00:00:00Z'
            }
        """
        response = self.client.get("/v1/usage")
        response.raise_for_status()
        return response.json()

    def get_supported_chains(self) -> dict:
        """Get chains available for your tier"""
        response = self.client.get("/v1/supported-chains")
        response.raise_for_status()
        return response.json()

    def close(self):
        """Close HTTP client"""
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


# Exception classes
class X402Error(Exception):
    """Base exception for x402 SDK"""
    pass

class X402APIError(X402Error):
    """API request failed"""
    pass

class X402AuthError(X402Error):
    """Authentication failed"""
    pass

class X402QuotaExceeded(X402Error):
    """Monthly quota exceeded"""
    pass
```

**Package Setup:**
```python
# sdks/python/setup.py
from setuptools import setup, find_packages

setup(
    name="x402-python",
    version="1.0.0",
    description="Official x402 Infrastructure Python SDK",
    author="x402 Team",
    author_email="support@x402.dev",
    url="https://github.com/x402/x402-python",
    packages=find_packages(),
    install_requires=[
        "httpx>=0.25.0",
    ],
    python_requires=">=3.8",
    classifiers=[
        "Development Status :: 5 - Production/Stable",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
)
```

**Acceptance Criteria:**
- [ ] Full API coverage (verify, usage, chains)
- [ ] Type hints and docstrings
- [ ] Comprehensive error handling
- [ ] Context manager support
- [ ] Unit tests (90%+ coverage)
- [ ] Published to PyPI
- [ ] README with examples

### Task 3.2: JavaScript/TypeScript SDK

**File:** `sdks/javascript/src/client.ts` (NEW)

**Implementation:**
```typescript
// sdks/javascript/src/client.ts
/**
 * Official x402 Infrastructure JavaScript/TypeScript SDK
 *
 * Install:
 *   npm install @x402/sdk
 *
 * Usage:
 *   import { X402Client } from '@x402/sdk'
 *
 *   const client = new X402Client({ apiKey: 'x402_live_XXXXX' })
 *   const result = await client.verifyPayment({ txHash: '...', chain: 'solana' })
 */

export interface X402Config {
  apiKey: string
  baseUrl?: string
  timeout?: number
}

export interface VerifyPaymentParams {
  txHash: string
  chain: string
  expectedAmount?: number
}

export interface VerificationResult {
  success: boolean
  txHash: string
  chain: string
  amountUsdc: number
  fromAddress: string
  toAddress: string
  confirmations: number
  riskScore: number
  error?: string
  errorCode?: string
}

export interface UsageStats {
  tier: string
  verificationsUsed: number
  verificationsLimit: number
  verificationsRemaining: number
  quotaResetDate: string
}

export class X402Client {
  private apiKey: string
  private baseUrl: string
  private timeout: number

  constructor(config: X402Config) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl || 'https://api.x402.dev'
    this.timeout = config.timeout || 30000
  }

  /**
   * Verify on-chain USDC payment
   *
   * @param params - Payment verification parameters
   * @returns Verification result
   *
   * @example
   * const result = await client.verifyPayment({
   *   txHash: '5KZ...',
   *   chain: 'solana',
   *   expectedAmount: 1.00
   * })
   *
   * if (result.success) {
   *   console.log(`Verified ${result.amountUsdc} USDC`)
   * }
   */
  async verifyPayment(params: VerifyPaymentParams): Promise<VerificationResult> {
    const response = await fetch(`${this.baseUrl}/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        tx_hash: params.txHash,
        chain: params.chain,
        expected_amount: params.expectedAmount
      }),
      signal: AbortSignal.timeout(this.timeout)
    })

    if (response.status === 429) {
      throw new X402QuotaExceeded('Monthly quota exceeded. Upgrade your plan.')
    }

    if (response.status === 401) {
      throw new X402AuthError('Invalid API key')
    }

    if (!response.ok) {
      throw new X402APIError(`API error: ${response.status}`)
    }

    const data = await response.json()

    return {
      success: data.success,
      txHash: data.tx_hash,
      chain: data.chain,
      amountUsdc: data.amount_usdc,
      fromAddress: data.from_address,
      toAddress: data.to_address,
      confirmations: data.confirmations,
      riskScore: data.risk_score,
      error: data.error,
      errorCode: data.error_code
    }
  }

  /**
   * Get current usage statistics
   */
  async getUsage(): Promise<UsageStats> {
    const response = await fetch(`${this.baseUrl}/v1/usage`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    })

    if (!response.ok) {
      throw new X402APIError(`Failed to get usage: ${response.status}`)
    }

    const data = await response.json()

    return {
      tier: data.tier,
      verificationsUsed: data.verifications_used,
      verificationsLimit: data.verifications_limit,
      verificationsRemaining: data.verifications_remaining,
      quotaResetDate: data.quota_reset_date
    }
  }

  /**
   * Get chains available for your tier
   */
  async getSupportedChains(): Promise<{ tier: string, enabledChains: string[] }> {
    const response = await fetch(`${this.baseUrl}/v1/supported-chains`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    })

    if (!response.ok) {
      throw new X402APIError(`Failed to get chains: ${response.status}`)
    }

    const data = await response.json()

    return {
      tier: data.tier,
      enabledChains: data.enabled_chains
    }
  }
}

// Exception classes
export class X402Error extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'X402Error'
  }
}

export class X402APIError extends X402Error {
  constructor(message: string) {
    super(message)
    this.name = 'X402APIError'
  }
}

export class X402AuthError extends X402Error {
  constructor(message: string) {
    super(message)
    this.name = 'X402AuthError'
  }
}

export class X402QuotaExceeded extends X402Error {
  constructor(message: string) {
    super(message)
    this.name = 'X402QuotaExceeded'
  }
}
```

**Package Configuration:**
```json
// sdks/javascript/package.json
{
  "name": "@x402/sdk",
  "version": "1.0.0",
  "description": "Official x402 Infrastructure JavaScript/TypeScript SDK",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["x402", "payments", "crypto", "micropayments", "blockchain"],
  "author": "x402 Team",
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "jest": "^29.0.0"
  }
}
```

**Acceptance Criteria:**
- [ ] Full TypeScript support
- [ ] Tree-shakeable ESM build
- [ ] Node.js and browser compatible
- [ ] Comprehensive JSDoc comments
- [ ] Unit tests with Jest
- [ ] Published to npm
- [ ] README with examples

---

## Phase 4: Billing & Subscriptions (Days 15-18)

### Task 4.1: Stripe Integration

**File:** `api/x402_saas/billing.py` (NEW)

**Implementation:**
```python
"""
Stripe billing integration for x402 SaaS

Handles:
- Subscription creation/updates
- Usage-based billing
- Webhook processing
- Invoice generation
"""

import stripe
import logging
from typing import Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

class BillingManager:
    """
    Stripe integration for x402 SaaS billing

    Pricing Model:
    - Free: $0/month (1K verifications)
    - Starter: $99/month (50K verifications)
    - Pro: $299/month (500K verifications)
    - Enterprise: $999/month (unlimited)
    """

    # Stripe price IDs (create these in Stripe Dashboard)
    PRICE_IDS = {
        'starter_monthly': 'price_starter_monthly_xxxxx',
        'pro_monthly': 'price_pro_monthly_xxxxx',
        'enterprise_monthly': 'price_enterprise_monthly_xxxxx'
    }

    def __init__(self, stripe_api_key: str):
        stripe.api_key = stripe_api_key
        self.stripe = stripe

    async def create_customer(
        self,
        tenant_id: str,
        email: str,
        company_name: str
    ) -> str:
        """
        Create Stripe customer for tenant

        Returns:
            Stripe customer ID
        """
        customer = self.stripe.Customer.create(
            email=email,
            name=company_name,
            metadata={
                'tenant_id': tenant_id
            }
        )

        logger.info(f"Created Stripe customer {customer.id} for tenant {tenant_id}")

        return customer.id

    async def create_subscription(
        self,
        stripe_customer_id: str,
        tier: str  # 'starter', 'pro', 'enterprise'
    ) -> Dict:
        """
        Create subscription for customer

        Returns:
            {
                'subscription_id': 'sub_xxxxx',
                'status': 'active',
                'current_period_end': datetime
            }
        """
        price_id = self.PRICE_IDS.get(f'{tier}_monthly')

        if not price_id:
            raise ValueError(f"Invalid tier: {tier}")

        subscription = self.stripe.Subscription.create(
            customer=stripe_customer_id,
            items=[{'price': price_id}],
            payment_behavior='default_incomplete',
            payment_settings={'save_default_payment_method': 'on_subscription'},
            expand=['latest_invoice.payment_intent']
        )

        return {
            'subscription_id': subscription.id,
            'status': subscription.status,
            'current_period_end': datetime.fromtimestamp(subscription.current_period_end),
            'client_secret': subscription.latest_invoice.payment_intent.client_secret
        }

    async def update_subscription(
        self,
        subscription_id: str,
        new_tier: str
    ):
        """
        Update subscription (upgrade/downgrade)

        Proration handled automatically by Stripe
        """
        subscription = self.stripe.Subscription.retrieve(subscription_id)

        new_price_id = self.PRICE_IDS.get(f'{new_tier}_monthly')

        self.stripe.Subscription.modify(
            subscription_id,
            items=[{
                'id': subscription['items']['data'][0].id,
                'price': new_price_id
            }],
            proration_behavior='create_prorations'
        )

        logger.info(f"Updated subscription {subscription_id} to {new_tier}")

    async def cancel_subscription(
        self,
        subscription_id: str,
        immediately: bool = False
    ):
        """
        Cancel subscription

        Args:
            immediately: If True, cancel now. If False, cancel at period end.
        """
        if immediately:
            self.stripe.Subscription.delete(subscription_id)
        else:
            self.stripe.Subscription.modify(
                subscription_id,
                cancel_at_period_end=True
            )

        logger.info(f"Cancelled subscription {subscription_id}")

    async def process_webhook(
        self,
        payload: bytes,
        signature: str,
        webhook_secret: str
    ) -> Dict:
        """
        Process Stripe webhook events

        Events handled:
        - customer.subscription.created
        - customer.subscription.updated
        - customer.subscription.deleted
        - invoice.payment_succeeded
        - invoice.payment_failed
        """
        try:
            event = self.stripe.Webhook.construct_event(
                payload, signature, webhook_secret
            )
        except ValueError:
            raise ValueError("Invalid payload")
        except stripe.error.SignatureVerificationError:
            raise ValueError("Invalid signature")

        event_type = event['type']
        data = event['data']['object']

        # Route to appropriate handler
        if event_type == 'customer.subscription.created':
            return await self._handle_subscription_created(data)
        elif event_type == 'customer.subscription.updated':
            return await self._handle_subscription_updated(data)
        elif event_type == 'customer.subscription.deleted':
            return await self._handle_subscription_deleted(data)
        elif event_type == 'invoice.payment_succeeded':
            return await self._handle_payment_succeeded(data)
        elif event_type == 'invoice.payment_failed':
            return await self._handle_payment_failed(data)

        return {'processed': False, 'reason': f'Unhandled event type: {event_type}'}

    async def _handle_subscription_created(self, subscription):
        """Handle new subscription"""
        customer_id = subscription['customer']

        # Get tenant from Stripe customer metadata
        customer = self.stripe.Customer.retrieve(customer_id)
        tenant_id = customer.metadata.get('tenant_id')

        # Update tenant record
        await self._update_tenant_subscription(
            tenant_id=tenant_id,
            subscription_id=subscription.id,
            status='active'
        )

        return {'processed': True}

    async def _handle_payment_succeeded(self, invoice):
        """Handle successful payment"""
        # Reset monthly quota on successful payment
        customer_id = invoice['customer']
        customer = self.stripe.Customer.retrieve(customer_id)
        tenant_id = customer.metadata.get('tenant_id')

        await self._reset_tenant_quota(tenant_id)

        return {'processed': True}
```

**Webhook Endpoint:**
```python
# api/x402_saas/routes.py (add to existing)

@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(..., alias='stripe-signature')
):
    """
    Stripe webhook endpoint

    Configure in Stripe Dashboard:
    - URL: https://api.x402.dev/webhooks/stripe
    - Events: subscription.*, invoice.*
    """
    payload = await request.body()

    from api.x402_saas.billing import billing_manager

    result = await billing_manager.process_webhook(
        payload=payload,
        signature=stripe_signature,
        webhook_secret=os.getenv('STRIPE_WEBHOOK_SECRET')
    )

    return result
```

**Acceptance Criteria:**
- [ ] Stripe customer creation
- [ ] Subscription management (create, update, cancel)
- [ ] Webhook processing
- [ ] Proration handling
- [ ] Failed payment handling
- [ ] Invoice generation
- [ ] Integration tests with Stripe test mode

### Task 4.2: Pricing Page & Checkout

**File:** `dashboard/app/pricing/page.tsx` (NEW)

**Implementation:**
```typescript
// Pricing page with Stripe Checkout integration
'use client'

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const tiers = [
  {
    name: 'Free',
    price: 0,
    description: 'Perfect for testing and small projects',
    features: [
      '1,000 verifications/month',
      '2 chains (Solana, Base)',
      'Community support',
      'Basic analytics'
    ],
    cta: 'Get Started',
    highlighted: false
  },
  {
    name: 'Starter',
    price: 99,
    description: 'For growing applications',
    features: [
      '50,000 verifications/month',
      '3 chains (+ Ethereum)',
      'Email support',
      'Advanced analytics',
      'PayAI integration',
      'Webhooks'
    ],
    cta: 'Start Free Trial',
    highlighted: false
  },
  {
    name: 'Pro',
    price: 299,
    description: 'For production applications',
    features: [
      '500,000 verifications/month',
      '6 chains (+ Polygon, Avalanche, Sei)',
      'Priority support',
      'Custom branding',
      'SLA: 99.9% uptime',
      'Advanced webhooks'
    ],
    cta: 'Start Free Trial',
    highlighted: true
  },
  {
    name: 'Enterprise',
    price: 999,
    description: 'For large-scale deployments',
    features: [
      'Unlimited verifications',
      'All chains',
      'Phone support',
      'Dedicated instance',
      'SLA: 99.95% uptime',
      'Custom integrations',
      'Revenue share options'
    ],
    cta: 'Contact Sales',
    highlighted: false
  }
]

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null)

  const handleSubscribe = async (tierName: string) => {
    if (tierName === 'Free') {
      // Redirect to signup
      window.location.href = '/signup'
      return
    }

    if (tierName === 'Enterprise') {
      // Redirect to sales
      window.location.href = 'mailto:sales@x402.dev'
      return
    }

    setLoading(tierName)

    try {
      // Create checkout session
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: tierName.toLowerCase() })
      })

      const { sessionId } = await response.json()

      // Redirect to Stripe Checkout
      const stripe = await stripePromise
      await stripe?.redirectToCheckout({ sessionId })
    } catch (error) {
      console.error('Checkout error:', error)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">
          Simple, Transparent Pricing
        </h1>
        <p className="text-xl text-muted-foreground">
          Start free, scale as you grow
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
        {tiers.map((tier) => (
          <Card
            key={tier.name}
            className={tier.highlighted ? 'border-primary shadow-lg' : ''}
          >
            <CardHeader>
              <CardTitle>{tier.name}</CardTitle>
              <CardDescription>{tier.description}</CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">${tier.price}</span>
                <span className="text-muted-foreground">/month</span>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full mb-4"
                variant={tier.highlighted ? 'default' : 'outline'}
                onClick={() => handleSubscribe(tier.name)}
                disabled={loading === tier.name}
              >
                {loading === tier.name ? 'Loading...' : tier.cta}
              </Button>

              <ul className="space-y-2">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start">
                    <Check className="h-5 w-5 text-primary mr-2 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

**Acceptance Criteria:**
- [ ] Responsive pricing page
- [ ] Stripe Checkout integration
- [ ] Free tier signup flow
- [ ] Trial period (7 days) for paid tiers
- [ ] Upgrade/downgrade flow
- [ ] Success/cancel redirect handling

---

## Phase 5: Production Readiness (Days 19-22)

### Task 5.1: Monitoring & Observability

**File:** `api/x402_saas/monitoring.py` (NEW)

**Implementation:**
```python
"""
Monitoring and observability for x402 SaaS

Integrations:
- Prometheus metrics
- Sentry error tracking
- Custom analytics
"""

from prometheus_client import Counter, Histogram, Gauge
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
import logging

logger = logging.getLogger(__name__)

# Prometheus metrics

verifications_total = Counter(
    'x402_verifications_total',
    'Total verification attempts',
    ['tenant_id', 'chain', 'status']
)

verification_duration = Histogram(
    'x402_verification_duration_seconds',
    'Verification request duration',
    ['chain']
)

active_tenants = Gauge(
    'x402_active_tenants',
    'Number of active tenants',
    ['tier']
)

quota_usage = Gauge(
    'x402_quota_usage_percent',
    'Tenant quota usage percentage',
    ['tenant_id', 'tier']
)

# Initialize Sentry
def init_monitoring(dsn: str, environment: str):
    """Initialize monitoring services"""
    sentry_sdk.init(
        dsn=dsn,
        integrations=[FastApiIntegration()],
        environment=environment,
        traces_sample_rate=0.1,  # 10% of transactions
        profiles_sample_rate=0.1
    )

    logger.info(f"Monitoring initialized for {environment}")

# Instrumentation helpers

def track_verification(tenant_id: str, chain: str, status: str):
    """Track verification attempt"""
    verifications_total.labels(
        tenant_id=tenant_id,
        chain=chain,
        status=status
    ).inc()

def track_quota_usage(tenant_id: str, tier: str, usage_percent: float):
    """Track quota usage"""
    quota_usage.labels(
        tenant_id=tenant_id,
        tier=tier
    ).set(usage_percent)

# Alert thresholds
def check_quota_alert(tenant_id: str, usage_percent: float):
    """Alert if tenant approaching quota"""
    if usage_percent > 80:
        logger.warning(f"Tenant {tenant_id} at {usage_percent}% quota")
        # Send email/Slack notification
        # await send_quota_warning_email(tenant_id, usage_percent)
```

**Metrics Endpoint:**
```python
# api/x402_saas/routes.py (add)

from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

@router.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )
```

**Acceptance Criteria:**
- [ ] Prometheus metrics exported
- [ ] Sentry error tracking
- [ ] Custom business metrics
- [ ] Grafana dashboard templates
- [ ] Alert rules for quota warnings
- [ ] Performance monitoring

### Task 5.2: Rate Limiting & Security

**File:** `api/x402_saas/security.py` (NEW)

**Implementation:**
```python
"""
Security and rate limiting for x402 SaaS
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request, HTTPException
import redis
from typing import Optional

limiter = Limiter(key_func=get_remote_address)

class TenantRateLimiter:
    """
    Per-tenant rate limiting

    Limits based on tier:
    - Free: 10 req/min
    - Starter: 100 req/min
    - Pro: 500 req/min
    - Enterprise: 2000 req/min
    """

    TIER_LIMITS = {
        'free': '10/minute',
        'starter': '100/minute',
        'pro': '500/minute',
        'enterprise': '2000/minute'
    }

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    async def check_rate_limit(
        self,
        tenant_id: str,
        tier: str
    ) -> bool:
        """
        Check if tenant has exceeded rate limit

        Returns:
            True if within limit, False if exceeded
        """
        limit = self.TIER_LIMITS.get(tier, '10/minute')
        limit_count, limit_window = self._parse_limit(limit)

        key = f"rate_limit:{tenant_id}:{limit_window}"

        current = self.redis.incr(key)

        if current == 1:
            self.redis.expire(key, self._window_seconds(limit_window))

        return current <= limit_count

    def _parse_limit(self, limit: str) -> tuple:
        """Parse limit string (e.g., '100/minute')"""
        count, window = limit.split('/')
        return int(count), window

    def _window_seconds(self, window: str) -> int:
        """Convert window to seconds"""
        if window == 'minute':
            return 60
        elif window == 'hour':
            return 3600
        elif window == 'day':
            return 86400
        return 60

# Security headers middleware
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses"""
    response = await call_next(request)

    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'

    return response
```

**Acceptance Criteria:**
- [ ] Per-tenant rate limiting
- [ ] Redis-backed rate limit storage
- [ ] Security headers on all responses
- [ ] CORS configuration
- [ ] API key validation on all protected routes
- [ ] DDoS protection (Cloudflare integration)

### Task 5.3: Testing & Quality Assurance

**File:** `tests/x402_saas/` (NEW directory)

**Test Coverage:**
```python
# tests/x402_saas/test_tenant_manager.py
import pytest
from api.x402_saas.tenant_manager import TenantManager

@pytest.mark.asyncio
async def test_create_tenant_free_tier(db_session):
    """Test creating free tier tenant"""
    manager = TenantManager(db_session)

    tenant, api_key = await manager.create_tenant(
        email="test@example.com",
        company_name="Test Co",
        tier="free"
    )

    assert tenant.tier == "free"
    assert tenant.monthly_verification_limit == 1000
    assert len(tenant.enabled_chains) == 2
    assert 'solana' in tenant.enabled_chains
    assert 'base' in tenant.enabled_chains
    assert api_key.startswith('x402_live_')

@pytest.mark.asyncio
async def test_quota_enforcement(db_session):
    """Test quota is enforced"""
    manager = TenantManager(db_session)

    tenant, _ = await manager.create_tenant(
        email="quota@example.com",
        company_name="Quota Test",
        tier="free"
    )

    # Use up quota
    for _ in range(1000):
        await manager.record_verification(tenant.id)

    # Should fail quota check
    has_quota = await manager.check_quota(tenant.id)
    assert has_quota == False

# tests/x402_saas/test_verification_service.py
@pytest.mark.asyncio
async def test_verification_with_valid_api_key(
    db_session,
    mock_solana_tx
):
    """Test verification succeeds with valid key"""
    from api.x402_saas.verification_service import verification_service

    # Create tenant and get API key
    tenant, api_key = await create_test_tenant(db_session)

    result = await verification_service.verify_payment(
        api_key=api_key,
        tx_hash=mock_solana_tx,
        chain="solana",
        expected_amount=1.00
    )

    assert result['success'] == True
    assert result['chain'] == 'solana'

@pytest.mark.asyncio
async def test_verification_quota_exceeded(db_session):
    """Test verification fails when quota exceeded"""
    tenant, api_key = await create_test_tenant(db_session, tier='free')

    # Exhaust quota
    await exhaust_tenant_quota(tenant.id)

    result = await verification_service.verify_payment(
        api_key=api_key,
        tx_hash="test_tx",
        chain="solana"
    )

    assert result['success'] == False
    assert result['error_code'] == 'QUOTA_EXCEEDED'
```

**Test Coverage Goals:**
- Unit tests: 90%+ coverage
- Integration tests: All API endpoints
- E2E tests: Critical user flows (signup → verify → upgrade)
- Load tests: 1000 req/s sustained
- Security tests: API key validation, SQL injection, XSS

**Acceptance Criteria:**
- [ ] Comprehensive test suite
- [ ] CI/CD integration (GitHub Actions)
- [ ] Automated testing on PR
- [ ] Performance benchmarks
- [ ] Security scanning (Snyk, dependabot)

---

## Phase 6: Go-to-Market (Days 23-25)

### Task 6.1: Landing Page

**File:** `marketing/index.html` (NEW)

**Content:**
```html
<!-- Marketing landing page -->
<!DOCTYPE html>
<html>
<head>
    <title>x402 Infrastructure - Crypto Payment Verification for Developers</title>
    <meta name="description" content="Add crypto micropayments to any API in 10 minutes. Multi-chain USDC verification with production-ready infrastructure.">
</head>
<body>
    <!-- Hero Section -->
    <section class="hero">
        <h1>Crypto Payments for Your API</h1>
        <p>Add multi-chain USDC verification in 10 minutes. No blockchain expertise required.</p>

        <div class="cta">
            <a href="/signup" class="btn-primary">Start Free</a>
            <a href="/docs" class="btn-secondary">View Docs</a>
        </div>

        <!-- Code Example -->
        <div class="code-example">
            <pre><code class="python">
from x402 import X402Client

client = X402Client(api_key="x402_live_...")

result = client.verify_payment(
    tx_hash="5KZ...",
    chain="solana",
    expected_amount=1.00
)

if result.success:
    return premium_data
            </code></pre>
        </div>
    </section>

    <!-- Features -->
    <section class="features">
        <div class="feature">
            <h3>Multi-Chain Support</h3>
            <p>Solana, Base, Ethereum, Polygon, Avalanche, and more</p>
        </div>

        <div class="feature">
            <h3>Production Ready</h3>
            <p>99.9% uptime SLA, battle-tested infrastructure</p>
        </div>

        <div class="feature">
            <h3>Simple Integration</h3>
            <p>5 lines of code, Python & JavaScript SDKs</p>
        </div>
    </section>

    <!-- Social Proof -->
    <section class="testimonials">
        <h2>Trusted by Developers</h2>
        <!-- Add logos and testimonials as they come -->
    </section>

    <!-- Pricing Preview -->
    <section class="pricing-preview">
        <h2>Simple, Transparent Pricing</h2>
        <p>Start free, scale as you grow</p>
        <a href="/pricing" class="btn-primary">View Pricing</a>
    </section>
</body>
</html>
```

**SEO & Performance:**
- Optimized for "crypto payment API", "blockchain payment verification", "x402 infrastructure"
- Core Web Vitals: LCP < 2.5s, FID < 100ms, CLS < 0.1
- Schema.org markup for SaaS product

### Task 6.2: Launch Strategy

**Week 1: Soft Launch**
1. Private beta (10 invited users)
2. Collect feedback
3. Fix critical bugs
4. Refine onboarding

**Week 2: Public Launch**
1. Post on:
   - Hacker News (Show HN: x402 Infrastructure)
   - r/cryptocurrency
   - r/SaaS
   - X/Twitter announcement
   - Product Hunt
2. Outreach to:
   - AI agent developers (ERC-8004 ecosystem)
   - x402 standard community
   - Solana developer groups
3. Content marketing:
   - "Building x402 Payment Infrastructure" blog post
   - Integration tutorials
   - Video walkthrough

**Week 3-4: Growth**
1. Partnerships:
   - PayAI Network (already integrated)
   - Hush wallet (privacy angle)
   - Solana Foundation
2. Community:
   - Discord server
   - Office hours
   - Developer advocacy
3. Sales:
   - Reach out to 50 API providers
   - Offer migration assistance
   - Custom integration support

**Acceptance Criteria:**
- [ ] Landing page live with SEO
- [ ] Public beta available
- [ ] Launch announcements posted
- [ ] 10+ beta users signed up
- [ ] First paying customer within 30 days

---

## Success Metrics & Timeline

### Technical Milestones

**Day 5:** Multi-tenant foundation complete
- [ ] Tenant management working
- [ ] API key system functional
- [ ] Database migrations applied

**Day 10:** Developer portal live
- [ ] Dashboard deployed
- [ ] API documentation published
- [ ] Admin panel functional

**Day 14:** SDKs released
- [ ] Python SDK on PyPI
- [ ] JavaScript SDK on npm
- [ ] README and examples complete

**Day 18:** Billing operational
- [ ] Stripe integration working
- [ ] Subscription management
- [ ] Webhooks processing

**Day 22:** Production ready
- [ ] All tests passing
- [ ] Monitoring deployed
- [ ] Security hardened
- [ ] Load tested

**Day 25:** Public launch
- [ ] Landing page live
- [ ] Soft launch complete
- [ ] Public announcement

### Business Milestones

**Month 1:**
- [ ] 50 free tier signups
- [ ] 5 starter tier conversions ($495 MRR)
- [ ] 1 pro tier customer ($299 MRR)
- **Total: $794 MRR**

**Month 3:**
- [ ] 200 free tier users
- [ ] 20 starter customers ($1,980 MRR)
- [ ] 5 pro customers ($1,495 MRR)
- [ ] 1 enterprise customer ($999 MRR)
- **Total: $4,474 MRR**

**Month 6:**
- [ ] 500 free tier users
- [ ] 40 starter customers ($3,960 MRR)
- [ ] 10 pro customers ($2,990 MRR)
- [ ] 3 enterprise customers ($2,997 MRR)
- **Total: $9,947 MRR** ✅ Approaching $10K target

### Quality Metrics

**Code Quality:**
- [ ] 90%+ test coverage
- [ ] Zero critical vulnerabilities (Snyk)
- [ ] A grade on security headers
- [ ] Lighthouse score 90+

**Performance:**
- [ ] API latency p95 < 500ms
- [ ] Verification latency p95 < 2s
- [ ] Dashboard load time < 2s
- [ ] 99.9% uptime

**Customer Satisfaction:**
- [ ] NPS > 40
- [ ] Support response time < 4 hours
- [ ] Documentation clarity score > 4.5/5
- [ ] Setup time < 10 minutes (reported by users)

---

## File Structure After Implementation

```
kamiyo/
├── api/
│   ├── x402/                           # Existing (keep as core engine)
│   │   ├── payment_verifier.py         # Core verification (production-ready)
│   │   ├── payment_gateway.py          # PayAI + native gateway
│   │   ├── middleware.py               # HTTP 402 middleware
│   │   └── ...
│   ├── x402_saas/                      # NEW: SaaS layer
│   │   ├── tenant_manager.py           # Multi-tenancy
│   │   ├── api_key_manager.py          # API key management
│   │   ├── verification_service.py     # SaaS verification wrapper
│   │   ├── billing.py                  # Stripe integration
│   │   ├── routes.py                   # SaaS API endpoints
│   │   ├── monitoring.py               # Observability
│   │   ├── security.py                 # Rate limiting & security
│   │   └── models.py                   # SaaS database models
├── dashboard/                          # NEW: Admin dashboard
│   ├── app/
│   │   ├── dashboard/
│   │   ├── pricing/
│   │   ├── api-keys/
│   │   └── analytics/
│   ├── components/
│   └── package.json
├── docs/                               # NEW: Developer docs
│   ├── introduction.md
│   ├── quick-start.md
│   ├── api-reference/
│   ├── guides/
│   └── examples/
├── sdks/                               # NEW: Client SDKs
│   ├── python/
│   │   ├── x402/
│   │   │   ├── client.py
│   │   │   └── __init__.py
│   │   └── setup.py
│   └── javascript/
│       ├── src/
│       │   └── client.ts
│       └── package.json
├── marketing/                          # NEW: Landing page
│   ├── index.html
│   ├── pricing.html
│   └── assets/
├── tests/
│   ├── x402/                           # Existing tests (keep)
│   └── x402_saas/                      # NEW: SaaS tests
│       ├── test_tenant_manager.py
│       ├── test_api_keys.py
│       ├── test_verification_service.py
│       └── test_billing.py
├── X402_SAAS_PIVOT_PLAN.md             # This file
└── README.md                           # Update to reflect SaaS positioning
```

---

## Deployment Architecture

### Infrastructure

**Application Servers:**
- 2x API servers (load balanced)
- 1x Dashboard server (Next.js)
- 1x Docs server (static)

**Databases:**
- PostgreSQL (RDS) - Primary
- Redis (ElastiCache) - Rate limiting & caching

**Services:**
- Stripe (billing)
- Sentry (error tracking)
- Cloudflare (CDN, DDoS protection)
- Prometheus + Grafana (monitoring)

**Estimated Monthly Costs:**
- AWS (2 EC2 + RDS + Redis): ~$200
- Stripe (transaction fees): ~2.9% + $0.30
- Sentry: $26 (Team plan)
- Cloudflare: Free (Pro $20 if needed)
- **Total: ~$250/month** (before revenue)

**Break-even: ~3 Starter customers**

---

## Risk Mitigation

### Technical Risks

1. **Multi-tenant data isolation bug**
   - Mitigation: Comprehensive isolation tests, tenant ID in all queries
   - Test: Automated tests attempting cross-tenant access

2. **Payment verification downtime**
   - Mitigation: Fallback RPC providers, retry logic
   - Monitor: Uptime tracking, alerts on failures

3. **Scaling issues**
   - Mitigation: Load testing before launch, autoscaling configured
   - Target: Handle 1000 req/s sustained

### Business Risks

1. **Low conversion rate (free → paid)**
   - Mitigation: Generous free tier to prove value, clear upgrade path
   - Target: 10% conversion within 3 months

2. **High churn rate**
   - Mitigation: Excellent documentation, responsive support
   - Target: <5% monthly churn

3. **Competition (ChainLink, others)**
   - Mitigation: Focus on x402 standard, developer UX, pricing
   - Differentiation: x402-native, simple pricing, fast integration

### Market Risks

1. **x402 standard doesn't gain traction**
   - Mitigation: Broader positioning as "crypto payment verification API"
   - Pivot: Support other payment standards if needed

2. **Regulatory issues (crypto payments)**
   - Mitigation: Compliance-first approach, legal review
   - Monitor: Regulatory developments

---

## Execution Instructions for Sonnet 4.5

### Pre-Execution Checklist

1. **Read entire plan** (this document)
2. **Understand business model** (4 tiers, SaaS, not exploit API)
3. **Review existing x402 code** (api/x402/ - already production-ready)
4. **Set up environment:**
   ```bash
   cp .env.example .env.saas
   # Add: STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET, REDIS_URL
   ```

### Phase-by-Phase Execution

**Execute sequentially, one phase at a time:**

1. **Phase 1 (Days 1-5): Multi-Tenant Foundation**
   - Create `api/x402_saas/` directory
   - Implement Task 1.1 (TenantManager)
   - Implement Task 1.2 (APIKeyManager)
   - Implement Task 1.3 (VerificationService)
   - Run migrations: `alembic revision -m "Add SaaS multi-tenancy"`
   - Test: All isolation tests passing

2. **Phase 2 (Days 6-10): Developer Portal**
   - Implement SaaS API routes
   - Build dashboard with Next.js
   - Create documentation site
   - Deploy to staging

3. **Phase 3 (Days 11-14): SDKs**
   - Build Python SDK
   - Build JavaScript SDK
   - Publish to PyPI and npm (test versions first)
   - Write README and examples

4. **Phase 4 (Days 15-18): Billing**
   - Stripe integration
   - Subscription management
   - Webhook processing
   - Test with Stripe test mode

5. **Phase 5 (Days 19-22): Production Readiness**
   - Monitoring setup
   - Security hardening
   - Load testing
   - Final QA

6. **Phase 6 (Days 23-25): Launch**
   - Deploy to production
   - Soft launch (10 users)
   - Public launch
   - Marketing push

### Code Quality Standards

**Follow existing KAMIYO standards (CLAUDE.md):**
- No emojis
- Technical, concise code
- Type hints on all functions
- Comprehensive docstrings
- All commits by KAMIYO dev@kamiyo.ai

**Additional SaaS Standards:**
- Multi-tenant isolation in ALL queries
- API key validation on ALL protected routes
- Rate limiting per tier
- Error codes for API responses
- Logging without PII

### Testing Strategy

**Test-Driven Development (TDD):**
1. Write test first
2. Implement feature
3. Verify test passes
4. Refactor if needed

**Coverage Requirements:**
- Unit tests: 90%+
- Integration tests: All API endpoints
- E2E tests: Critical flows
- Load tests: 1000 req/s

**Run tests after each phase:**
```bash
pytest tests/x402_saas/ -v --cov=api/x402_saas --cov-report=html
```

### Deployment Strategy

**Staging First:**
1. Deploy to staging after Phase 2
2. Internal testing with team
3. Fix bugs
4. Performance optimization

**Production:**
1. Blue-green deployment
2. Gradual rollout (10% → 50% → 100%)
3. Monitor metrics closely
4. Rollback plan ready

### Git Strategy

**Branching:**
- `main` - production
- `develop` - staging
- `feature/saas-tenant-manager` - feature branches

**Commits:**
```bash
git commit -m "Add multi-tenant manager for x402 SaaS

Implements Task 1.1 from pivot plan:
- Tenant creation with isolated payment addresses
- Tier-based quota management
- API key generation

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Monitoring During Execution

**Track Progress:**
- Use TodoWrite tool for each task
- Mark completed only when tests pass
- Update this plan with blockers

**Metrics to Watch:**
- Test coverage (target: 90%+)
- Build time (keep under 5 min)
- Database migration success
- API response times

---

## Post-Launch Roadmap (Month 2-6)

### Month 2: Iterate & Improve

- [ ] User feedback implementation
- [ ] Performance optimization
- [ ] Additional payment methods (ETH, native tokens)
- [ ] Webhook retry logic
- [ ] Advanced analytics

### Month 3: Feature Expansion

- [ ] Solana Confidential Transfer support (privacy pivot integration)
- [ ] ERC-8004 agent identity registry
- [ ] Custom branding for Enterprise
- [ ] White-label options
- [ ] Revenue share program

### Month 4: Scale & Partnerships

- [ ] PayAI Network official partnership
- [ ] Solana Foundation grant application
- [ ] Integration with popular frameworks (Next.js template, etc.)
- [ ] Referral program (10% commission)

### Month 5: International Expansion

- [ ] Multi-currency pricing
- [ ] EU/APAC server regions
- [ ] Localized documentation
- [ ] Compliance: GDPR, SOC2

### Month 6: Enterprise Features

- [ ] Dedicated instances
- [ ] Custom SLAs
- [ ] SSO/SAML
- [ ] Advanced security (IP whitelisting, mTLS)
- [ ] Professional services

---

## Final Checklist Before Launch

### Technical

- [ ] All tests passing (90%+ coverage)
- [ ] Security audit complete
- [ ] Performance benchmarks met
- [ ] Database migrations tested
- [ ] Backup/restore tested
- [ ] Monitoring dashboards configured
- [ ] Error tracking operational
- [ ] Rate limiting tested
- [ ] API documentation complete
- [ ] SDKs published (PyPI, npm)

### Business

- [ ] Stripe account verified
- [ ] Payment flows tested (test mode)
- [ ] Pricing page finalized
- [ ] Terms of Service & Privacy Policy
- [ ] Support email configured
- [ ] Billing notifications working
- [ ] Invoice generation tested

### Marketing

- [ ] Landing page live
- [ ] SEO optimization complete
- [ ] Social media accounts created
- [ ] Launch announcement drafted
- [ ] Press kit prepared
- [ ] Demo video recorded
- [ ] Case studies (from beta)

### Operations

- [ ] Support process documented
- [ ] Runbook for common issues
- [ ] Incident response plan
- [ ] On-call rotation (if team)
- [ ] Customer onboarding flow
- [ ] Analytics tracking configured

---

## Conclusion: The Path Forward

### Current Reality

You built excellent x402 infrastructure (3,963 LOC, production-ready) for the wrong product (exploit intelligence with no paying customers).

### The Pivot

Transform that infrastructure into a SaaS platform that developers will actually pay for.

### Why This Will Work

1. **Proven demand**: x402 is growing, developers need tools
2. **Strong foundation**: Your payment infrastructure is A+ grade
3. **Clear value prop**: "Add crypto payments in 10 minutes"
4. **Picks and shovels**: Sell tools, not end product
5. **Realistic pricing**: $99-999/month tiers are achievable

### Expected Outcome

**Month 6: $5-10K MRR** (conservative)
**Month 12: $15-25K MRR** (realistic)
**Year 2: $50-100K MRR** (optimistic but possible)

### The Alternative

Keep building exploit intelligence → No revenue → Project dies

### The Choice

Execute this plan or pivot to something else.

**My recommendation: Execute this plan.** You have the infrastructure, the technical skills, and a clear path to revenue. 25 days of focused work to production-ready SaaS.

**Let's build this. 🚀**

---

**End of Plan**

*Generated for Sonnet 4.5 execution*
*Target: Production-ready x402 Infrastructure SaaS in 25 days*
*Business Model: 4 tiers, $0-999/month, picks and shovels strategy*
