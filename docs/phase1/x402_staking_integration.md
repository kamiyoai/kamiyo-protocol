# $KAMIYO x402 Staking Integration Plan

**Version:** 1.0
**Last Updated:** October 28, 2025
**Status:** Design Phase

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Integration Architecture](#integration-architecture)
3. [Fee Discount Implementation](#fee-discount-implementation)
4. [Platform Fee Allocation](#platform-fee-allocation)
5. [Database Schema Extensions](#database-schema-extensions)
6. [API Enhancements](#api-enhancements)
7. [Automated Revenue Distribution](#automated-revenue-distribution)
8. [Monitoring & Analytics](#monitoring--analytics)
9. [Testing Strategy](#testing-strategy)
10. [Deployment Plan](#deployment-plan)

---

## Executive Summary

This document outlines the technical integration between the KAMIYO staking system and the existing x402 payment infrastructure. The integration enables:

1. **Dynamic Fee Discounts:** Stakers receive 10-30% discounts on x402 API calls based on stake amount
2. **Revenue-Backed Rewards:** 30% of x402 USDC revenue is allocated to staking rewards
3. **Priority Access:** Stakers get enhanced escrow negotiation privileges
4. **Seamless UX:** Discount applied automatically when wallet address provided

### Key Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│                   Integration Overview                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │  x402 Middleware │◄────│ Staking Check │                │
│  │  (FastAPI)   │  Query  │  (Solana RPC)│                 │
│  └──────┬───────┘         └──────────────┘                 │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │ Apply Discount│                                          │
│  │ (10-30%)     │                                           │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │  Process     │────────▶│  Track       │                 │
│  │  Payment     │         │  Revenue     │                 │
│  └──────┬───────┘         └──────┬───────┘                 │
│         │                        │                          │
│         │                        ▼                          │
│         │              ┌──────────────────┐                │
│         │              │  Daily Cron:     │                │
│         │              │  - Calc 30%      │                │
│         │              │  - Buy KAMIYO    │                │
│         │              │  - Fund Pool     │                │
│         │              └──────────────────┘                │
│         │                        │                          │
│         │                        ▼                          │
│         │              ┌──────────────────┐                │
│         └─────────────▶│  Analytics DB    │                │
│                        │  (Revenue, APY)  │                │
│                        └──────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

---

## Integration Architecture

### System Components

#### 1. Staking Query Service (Python)

```python
# api/x402/staking_query.py

from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey
from solders.rpc.responses import GetAccountInfoResp
import struct
import logging
from typing import Optional, Dict
from dataclasses import dataclass
from functools import lru_cache
import aioredis

logger = logging.getLogger(__name__)


@dataclass
class StakeInfo:
    """User stake information"""
    wallet_address: str
    staked_amount: int  # Raw amount with decimals
    staked_amount_ui: float  # Human-readable amount
    discount_tier: str  # 'none', 'silver', 'gold', 'platinum'
    discount_percent: int  # 0, 10, 20, 30
    priority_level: str  # 'standard', 'priority', 'premium'


class StakingQueryService:
    """
    Query Solana blockchain for user staking information
    Implements caching to reduce RPC calls
    """

    def __init__(
        self,
        rpc_url: str,
        program_id: str,
        pool_address: str,
        redis_client: Optional[aioredis.Redis] = None,
        cache_ttl: int = 300  # 5 minutes
    ):
        self.client = AsyncClient(rpc_url)
        self.program_id = Pubkey.from_string(program_id)
        self.pool_address = Pubkey.from_string(pool_address)
        self.redis = redis_client
        self.cache_ttl = cache_ttl

        # Discount tiers (amounts in raw tokens with 9 decimals)
        self.TIERS = [
            {'name': 'platinum', 'min_stake': 1_000_000_000_000_000, 'discount': 30, 'priority': 'premium'},   # 1M KAMIYO
            {'name': 'gold', 'min_stake': 500_000_000_000_000, 'discount': 20, 'priority': 'priority'},        # 500k KAMIYO
            {'name': 'silver', 'min_stake': 100_000_000_000_000, 'discount': 10, 'priority': 'priority'},      # 100k KAMIYO
            {'name': 'none', 'min_stake': 0, 'discount': 0, 'priority': 'standard'},
        ]

    async def get_user_stake_info(self, wallet_address: str) -> Optional[StakeInfo]:
        """
        Get user's stake information with caching

        Args:
            wallet_address: Solana wallet address (base58 string)

        Returns:
            StakeInfo object or None if user has no stake
        """
        # Check cache first
        if self.redis:
            cached = await self._get_from_cache(wallet_address)
            if cached:
                return cached

        try:
            # Derive user stake PDA
            user_pubkey = Pubkey.from_string(wallet_address)
            stake_pda, bump = self._derive_stake_pda(user_pubkey)

            # Query account
            response = await self.client.get_account_info(stake_pda)

            if not response.value:
                # No stake account exists
                stake_info = StakeInfo(
                    wallet_address=wallet_address,
                    staked_amount=0,
                    staked_amount_ui=0.0,
                    discount_tier='none',
                    discount_percent=0,
                    priority_level='standard'
                )
            else:
                # Parse stake account data
                staked_amount = self._parse_stake_amount(response.value.data)

                # Determine tier
                tier = self._calculate_tier(staked_amount)

                stake_info = StakeInfo(
                    wallet_address=wallet_address,
                    staked_amount=staked_amount,
                    staked_amount_ui=staked_amount / 1e9,  # Convert to UI amount
                    discount_tier=tier['name'],
                    discount_percent=tier['discount'],
                    priority_level=tier['priority']
                )

            # Cache result
            if self.redis:
                await self._set_cache(wallet_address, stake_info)

            return stake_info

        except Exception as e:
            logger.error(f"Error querying stake for {wallet_address}: {e}", exc_info=True)
            # Return default (no discount) on error to not block payments
            return StakeInfo(
                wallet_address=wallet_address,
                staked_amount=0,
                staked_amount_ui=0.0,
                discount_tier='none',
                discount_percent=0,
                priority_level='standard'
            )

    def _derive_stake_pda(self, user_pubkey: Pubkey) -> tuple[Pubkey, int]:
        """Derive user stake PDA"""
        seeds = [
            b"user_stake",
            bytes(user_pubkey),
            bytes(self.pool_address)
        ]
        return Pubkey.find_program_address(seeds, self.program_id)

    def _parse_stake_amount(self, data: bytes) -> int:
        """
        Parse staked amount from account data

        Account layout:
        - 8 bytes: discriminator
        - 32 bytes: owner pubkey
        - 32 bytes: pool pubkey
        - 8 bytes: staked_amount (u64, little-endian)
        - ... rest of account
        """
        try:
            # Skip discriminator (8) + owner (32) + pool (32) = 72 bytes
            staked_amount_bytes = data[72:80]
            staked_amount = struct.unpack('<Q', staked_amount_bytes)[0]
            return staked_amount
        except Exception as e:
            logger.error(f"Error parsing stake amount: {e}")
            return 0

    def _calculate_tier(self, staked_amount: int) -> Dict:
        """Calculate discount tier based on staked amount"""
        for tier in self.TIERS:
            if staked_amount >= tier['min_stake']:
                return tier
        return self.TIERS[-1]  # Default to 'none'

    async def _get_from_cache(self, wallet_address: str) -> Optional[StakeInfo]:
        """Get stake info from Redis cache"""
        try:
            cache_key = f"stake_info:{wallet_address}"
            cached_data = await self.redis.get(cache_key)

            if cached_data:
                import json
                data = json.loads(cached_data)
                return StakeInfo(**data)

        except Exception as e:
            logger.warning(f"Cache read error: {e}")

        return None

    async def _set_cache(self, wallet_address: str, stake_info: StakeInfo):
        """Set stake info in Redis cache"""
        try:
            import json
            from dataclasses import asdict

            cache_key = f"stake_info:{wallet_address}"
            data = json.dumps(asdict(stake_info))
            await self.redis.setex(cache_key, self.cache_ttl, data)

        except Exception as e:
            logger.warning(f"Cache write error: {e}")

    async def invalidate_cache(self, wallet_address: str):
        """Invalidate cache for a wallet (call after stake/unstake)"""
        if self.redis:
            cache_key = f"stake_info:{wallet_address}"
            await self.redis.delete(cache_key)

    async def close(self):
        """Close RPC client connection"""
        await self.client.close()
```

---

## Fee Discount Implementation

### Modified x402 Middleware

```python
# api/x402/middleware.py (enhanced version)

import logging
from typing import Optional, Dict, Any
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from .payment_verifier import payment_verifier
from .payment_tracker import PaymentTracker
from .config import get_x402_config
from .staking_query import StakingQueryService, StakeInfo

logger = logging.getLogger(__name__)


class X402Middleware(BaseHTTPMiddleware):
    """
    Enhanced x402 middleware with staking discount support
    """

    def __init__(
        self,
        app,
        payment_tracker: PaymentTracker,
        staking_service: StakingQueryService
    ):
        super().__init__(app)
        self.payment_tracker = payment_tracker
        self.staking_service = staking_service
        self.config = get_x402_config()

        # Convert endpoint prices from config
        self.require_payment_paths = {
            endpoint: {'methods': ['GET'], 'price': price}
            for endpoint, price in self.config.endpoint_prices.items()
        }

        logger.info(f"x402 Middleware initialized with staking integration")

    async def dispatch(self, request: Request, call_next) -> Response:
        """Process request with staking discount support"""
        try:
            # Skip checks if disabled or for certain paths
            if not self.config.enabled or self._should_skip_payment_check(request):
                return await call_next(request)

            # Check if endpoint requires payment
            payment_config = await self._get_payment_config_with_discount(request)

            if not payment_config:
                return await call_next(request)

            # Check for valid payment authorization
            payment_auth = await self._get_payment_authorization(request)

            if payment_auth and payment_auth['is_valid']:
                # Valid payment - record usage and proceed
                await self._record_payment_with_discount(
                    payment_auth,
                    payment_config,
                    request
                )
                return await call_next(request)
            else:
                # No valid payment - return 402
                return self._create_402_response(request, payment_config)

        except Exception as e:
            logger.error(f"Error in x402 middleware: {e}", exc_info=True)
            return await call_next(request)  # Fail open

    async def _get_payment_config_with_discount(
        self,
        request: Request
    ) -> Optional[Dict[str, Any]]:
        """
        Get payment config with staking discount applied

        Checks x-wallet-address header and queries Solana for stake
        """
        # Get base payment config
        path_config = self.require_payment_paths.get(request.url.path)

        if not path_config or request.method not in path_config['methods']:
            return None

        base_price = path_config['price']
        config = {
            'price': base_price,
            'original_price': base_price,
            'endpoint': request.url.path,
            'method': request.method,
            'discount_applied': None
        }

        # Check for staking discount
        wallet_address = request.headers.get('x-wallet-address')

        if wallet_address:
            try:
                # Query stake from Solana
                stake_info = await self.staking_service.get_user_stake_info(wallet_address)

                if stake_info and stake_info.discount_percent > 0:
                    # Apply discount
                    discounted_price = base_price * (100 - stake_info.discount_percent) / 100

                    config['price'] = discounted_price
                    config['discount_applied'] = {
                        'tier': stake_info.discount_tier,
                        'discount_percent': stake_info.discount_percent,
                        'staked_amount': stake_info.staked_amount_ui,
                        'savings_usdc': base_price - discounted_price
                    }

                    logger.info(
                        f"Applied {stake_info.discount_percent}% discount for {wallet_address} "
                        f"(tier: {stake_info.discount_tier})"
                    )

            except Exception as e:
                logger.error(f"Error checking staking discount: {e}")
                # Continue without discount on error

        return config

    async def _record_payment_with_discount(
        self,
        payment_auth: Dict,
        payment_config: Dict,
        request: Request
    ):
        """Record payment usage with discount metadata"""
        try:
            await self.payment_tracker.record_usage(
                payment_id=payment_auth['payment_id'],
                endpoint=payment_config['endpoint'],
                amount_charged=payment_config['price'],
                original_amount=payment_config['original_price'],
                discount_info=payment_config.get('discount_applied'),
                wallet_address=request.headers.get('x-wallet-address')
            )
        except Exception as e:
            logger.error(f"Error recording payment usage: {e}")

    def _create_402_response(
        self,
        request: Request,
        payment_config: Dict[str, Any]
    ) -> JSONResponse:
        """Create 402 response with discount info if applicable"""

        response_data = {
            "payment_required": True,
            "endpoint": payment_config['endpoint'],
            "method": payment_config['method'],
            "amount_usdc": payment_config['price'],
            "description": f"Access to {payment_config['endpoint']} requires payment",
        }

        # Include discount info if applicable
        if payment_config.get('discount_applied'):
            discount = payment_config['discount_applied']
            response_data['discount'] = {
                'tier': discount['tier'],
                'percent': discount['discount_percent'],
                'original_price': payment_config['original_price'],
                'discounted_price': payment_config['price'],
                'savings': discount['savings_usdc']
            }

        # Include staking info hint
        wallet = request.headers.get('x-wallet-address')
        if wallet:
            response_data['staking_hint'] = {
                'message': 'Stake KAMIYO tokens to earn fee discounts',
                'tiers': [
                    {'stake': '100k+ KAMIYO', 'discount': '10%'},
                    {'stake': '500k+ KAMIYO', 'discount': '20%'},
                    {'stake': '1M+ KAMIYO', 'discount': '30%'}
                ],
                'staking_url': 'https://kamiyo.ai/stake'
            }

        return JSONResponse(
            status_code=402,
            content=response_data,
            headers={
                "X-Payment-Required": "true",
                "X-Payment-Amount": str(payment_config['price']),
                "X-Payment-Currency": "USDC"
            }
        )

    # ... rest of middleware methods unchanged ...
```

### Integration with Payment Tracker

```python
# api/x402/payment_tracker.py (additions)

async def record_usage(
    self,
    payment_id: int,
    endpoint: str,
    amount_charged: float,
    original_amount: float,
    discount_info: Optional[Dict] = None,
    wallet_address: Optional[str] = None,
    method: str = 'GET',
    status_code: int = 200,
    response_time_ms: Optional[int] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
):
    """Record API usage with discount tracking"""

    db = self._get_db()

    # Update payment usage counter
    await db.update_payment_usage(payment_id)

    # Record usage with discount metadata
    await db.record_usage(
        payment_id=payment_id,
        endpoint=endpoint,
        method=method,
        status_code=status_code,
        amount_charged=amount_charged,
        original_amount=original_amount,
        discount_tier=discount_info.get('tier') if discount_info else None,
        discount_percent=discount_info.get('discount_percent') if discount_info else 0,
        savings_usdc=discount_info.get('savings_usdc') if discount_info else 0,
        staker_wallet=wallet_address,
        response_time_ms=response_time_ms,
        ip_address=ip_address,
        user_agent=user_agent
    )

    logger.info(f"Recorded usage for payment {payment_id}: {endpoint}")
```

---

## Platform Fee Allocation

### Revenue Tracking System

```python
# api/x402/revenue_tracker.py

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)


class RevenueTracker:
    """
    Track x402 revenue and calculate staking allocations
    """

    def __init__(self, db_session):
        self.db = db_session

    async def get_daily_revenue(self, date: datetime.date = None) -> Dict:
        """Get revenue for a specific day"""
        if not date:
            date = datetime.utcnow().date()

        query = """
            SELECT
                DATE(created_at) as date,
                SUM(amount_charged) as total_revenue,
                SUM(original_amount - amount_charged) as total_discounts_given,
                COUNT(*) as total_requests,
                COUNT(DISTINCT staker_wallet) as unique_stakers,
                SUM(CASE WHEN discount_tier IS NOT NULL THEN 1 ELSE 0 END) as discounted_requests
            FROM x402_usage
            WHERE DATE(created_at) = $1
            GROUP BY DATE(created_at)
        """

        result = await self.db.fetchrow(query, date)

        return {
            'date': date,
            'total_revenue_usdc': float(result['total_revenue'] or 0),
            'total_discounts_given_usdc': float(result['total_discounts_given'] or 0),
            'total_requests': result['total_requests'] or 0,
            'unique_stakers': result['unique_stakers'] or 0,
            'discounted_requests': result['discounted_requests'] or 0
        }

    async def get_monthly_revenue(self, year: int, month: int) -> Dict:
        """Get revenue for entire month"""
        query = """
            SELECT
                DATE_TRUNC('month', created_at) as month,
                SUM(amount_charged) as total_revenue,
                SUM(original_amount - amount_charged) as total_discounts_given,
                COUNT(*) as total_requests,
                COUNT(DISTINCT staker_wallet) as unique_stakers
            FROM x402_usage
            WHERE EXTRACT(YEAR FROM created_at) = $1
              AND EXTRACT(MONTH FROM created_at) = $2
            GROUP BY DATE_TRUNC('month', created_at)
        """

        result = await self.db.fetchrow(query, year, month)

        return {
            'year': year,
            'month': month,
            'total_revenue_usdc': float(result['total_revenue'] or 0),
            'total_discounts_given_usdc': float(result['total_discounts_given'] or 0),
            'total_requests': result['total_requests'] or 0,
            'unique_stakers': result['unique_stakers'] or 0
        }

    async def calculate_staking_allocation(
        self,
        revenue_usdc: float,
        allocation_percent: int = 30
    ) -> Dict:
        """
        Calculate how much should be allocated to staking rewards

        Args:
            revenue_usdc: Total revenue in USDC
            allocation_percent: Percentage to allocate (default 30%)

        Returns:
            Dictionary with allocation details
        """
        allocation_usdc = revenue_usdc * (allocation_percent / 100)

        return {
            'revenue_usdc': revenue_usdc,
            'allocation_percent': allocation_percent,
            'allocation_usdc': allocation_usdc,
            'remaining_usdc': revenue_usdc - allocation_usdc,
            'timestamp': datetime.utcnow()
        }

    async def record_staking_allocation(
        self,
        period_start: datetime,
        period_end: datetime,
        revenue_usdc: float,
        allocation_usdc: float
    ):
        """Record allocation to staking rewards"""
        query = """
            INSERT INTO staking_revenue_allocations
            (period_start, period_end, revenue_usdc, allocation_usdc, created_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            RETURNING id
        """

        allocation_id = await self.db.fetchval(
            query,
            period_start,
            period_end,
            revenue_usdc,
            allocation_usdc
        )

        logger.info(
            f"Recorded staking allocation {allocation_id}: "
            f"{allocation_usdc} USDC from {revenue_usdc} revenue"
        )

        return allocation_id
```

---

## Database Schema Extensions

```sql
-- database/migrations/004_staking_integration.sql

-- Enhanced x402 usage tracking with discount info
ALTER TABLE x402_usage ADD COLUMN IF NOT EXISTS amount_charged DECIMAL(18, 6);
ALTER TABLE x402_usage ADD COLUMN IF NOT EXISTS original_amount DECIMAL(18, 6);
ALTER TABLE x402_usage ADD COLUMN IF NOT EXISTS discount_tier VARCHAR(50);
ALTER TABLE x402_usage ADD COLUMN IF NOT EXISTS discount_percent INTEGER DEFAULT 0;
ALTER TABLE x402_usage ADD COLUMN IF NOT EXISTS savings_usdc DECIMAL(18, 6) DEFAULT 0;
ALTER TABLE x402_usage ADD COLUMN IF NOT EXISTS staker_wallet VARCHAR(44);

-- Staking revenue allocations
CREATE TABLE IF NOT EXISTS staking_revenue_allocations (
    id SERIAL PRIMARY KEY,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    revenue_usdc DECIMAL(18, 6) NOT NULL,
    allocation_usdc DECIMAL(18, 6) NOT NULL,
    allocation_percent INTEGER DEFAULT 30,
    status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
    tx_hash VARCHAR(88),  -- Solana tx for funding pool
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- KAMIYO buyback transactions
CREATE TABLE IF NOT EXISTS kamiyo_buybacks (
    id SERIAL PRIMARY KEY,
    allocation_id INTEGER NOT NULL,
    usdc_amount DECIMAL(18, 6) NOT NULL,
    kamiyo_amount DECIMAL(18, 6) NOT NULL,
    average_price DECIMAL(18, 9) NOT NULL,  -- USDC per KAMIYO
    dex VARCHAR(50) NOT NULL,  -- 'raydium', 'orca', 'jupiter', etc.
    tx_hash VARCHAR(88) NOT NULL,
    slippage_percent DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (allocation_id) REFERENCES staking_revenue_allocations(id)
);

-- Pool funding transactions (KAMIYO → Reward Vault)
CREATE TABLE IF NOT EXISTS staking_pool_fundings (
    id SERIAL PRIMARY KEY,
    allocation_id INTEGER NOT NULL,
    kamiyo_amount DECIMAL(18, 6) NOT NULL,
    tx_hash VARCHAR(88) NOT NULL,
    pool_address VARCHAR(44) NOT NULL,
    vault_address VARCHAR(44) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (allocation_id) REFERENCES staking_revenue_allocations(id)
);

-- Staking APY history
CREATE TABLE IF NOT EXISTS staking_apy_history (
    id SERIAL PRIMARY KEY,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_staked BIGINT NOT NULL,  -- Raw amount with decimals
    total_staked_ui DECIMAL(18, 6) NOT NULL,  -- Human-readable
    reward_rate_per_second BIGINT NOT NULL,
    calculated_apy DECIMAL(8, 4) NOT NULL,  -- e.g., 15.75 for 15.75%
    monthly_revenue_usdc DECIMAL(18, 6),
    pool_balance BIGINT  -- Reward vault balance
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_x402_usage_staker ON x402_usage(staker_wallet);
CREATE INDEX IF NOT EXISTS idx_x402_usage_discount ON x402_usage(discount_tier);
CREATE INDEX IF NOT EXISTS idx_x402_usage_date ON x402_usage(DATE(created_at));

CREATE INDEX IF NOT EXISTS idx_revenue_allocations_period ON staking_revenue_allocations(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_revenue_allocations_status ON staking_revenue_allocations(status);

-- Views
CREATE OR REPLACE VIEW v_staking_discount_stats AS
SELECT
    discount_tier,
    COUNT(*) as request_count,
    COUNT(DISTINCT staker_wallet) as unique_stakers,
    SUM(amount_charged) as revenue_with_discount,
    SUM(savings_usdc) as total_savings_given,
    AVG(discount_percent) as avg_discount_percent
FROM x402_usage
WHERE discount_tier IS NOT NULL
  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY discount_tier;

CREATE OR REPLACE VIEW v_daily_revenue_for_staking AS
SELECT
    DATE(created_at) as date,
    SUM(amount_charged) as daily_revenue_usdc,
    SUM(amount_charged) * 0.30 as daily_allocation_usdc,
    COUNT(*) as total_requests,
    COUNT(DISTINCT payment_id) as unique_payments
FROM x402_usage
GROUP BY DATE(created_at)
ORDER BY DATE(created_at) DESC;
```

---

## API Enhancements

### New Endpoints

```python
# api/x402/routes.py (additions)

from fastapi import APIRouter, Depends, HTTPException
from .staking_query import StakingQueryService, StakeInfo
from .revenue_tracker import RevenueTracker

router = APIRouter(prefix="/x402", tags=["x402"])


@router.get("/staking/info/{wallet_address}")
async def get_staking_info(
    wallet_address: str,
    staking_service: StakingQueryService = Depends(get_staking_service)
) -> StakeInfo:
    """
    Get staking information for a wallet

    Returns discount tier, staked amount, and priority level
    """
    stake_info = await staking_service.get_user_stake_info(wallet_address)

    if not stake_info:
        raise HTTPException(404, "Wallet not found or has no stake")

    return stake_info


@router.get("/revenue/daily")
async def get_daily_revenue(
    date: str = None,  # YYYY-MM-DD format
    revenue_tracker: RevenueTracker = Depends(get_revenue_tracker)
):
    """Get revenue for a specific day"""
    from datetime import datetime

    if date:
        date_obj = datetime.strptime(date, '%Y-%m-%d').date()
    else:
        date_obj = None

    return await revenue_tracker.get_daily_revenue(date_obj)


@router.get("/revenue/monthly")
async def get_monthly_revenue(
    year: int,
    month: int,
    revenue_tracker: RevenueTracker = Depends(get_revenue_tracker)
):
    """Get revenue for entire month"""
    return await revenue_tracker.get_monthly_revenue(year, month)


@router.get("/discount-tiers")
async def get_discount_tiers():
    """Get information about staking discount tiers"""
    return {
        'tiers': [
            {
                'name': 'Silver',
                'min_stake_ui': 100_000,
                'discount_percent': 10,
                'priority_level': 'priority'
            },
            {
                'name': 'Gold',
                'min_stake_ui': 500_000,
                'discount_percent': 20,
                'priority_level': 'priority'
            },
            {
                'name': 'Platinum',
                'min_stake_ui': 1_000_000,
                'discount_percent': 30,
                'priority_level': 'premium'
            }
        ],
        'benefits': {
            'priority': [
                '5 concurrent escrow slots',
                '36 hour negotiation timeout',
                'Priority support'
            ],
            'premium': [
                '10 concurrent escrow slots',
                '48 hour negotiation timeout',
                'Auto-mediation',
                'Dedicated support'
            ]
        }
    }


@router.post("/admin/invalidate-stake-cache/{wallet_address}")
async def invalidate_stake_cache(
    wallet_address: str,
    staking_service: StakingQueryService = Depends(get_staking_service),
    admin_key: str = Header(None, alias='x-admin-key')
):
    """
    Invalidate stake cache for a wallet

    Call this after stake/unstake events
    """
    # Verify admin
    if admin_key != os.getenv('X402_ADMIN_KEY'):
        raise HTTPException(403, "Unauthorized")

    await staking_service.invalidate_cache(wallet_address)

    return {'success': True, 'wallet': wallet_address}
```

---

## Automated Revenue Distribution

### Daily Cron Job

```python
# scripts/distribute_staking_rewards.py

import asyncio
import os
from datetime import datetime, timedelta
from decimal import Decimal
import logging
from solana.rpc.async_api import AsyncClient
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from anchorpy import Program, Provider, Wallet

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class StakingRewardsDistributor:
    """
    Automated distribution of x402 revenue to staking rewards

    Process:
    1. Calculate yesterday's revenue
    2. Allocate 30% to staking
    3. Buy KAMIYO tokens on DEX
    4. Transfer to staking reward vault
    """

    def __init__(
        self,
        db_connection_string: str,
        solana_rpc_url: str,
        wallet_keypair_path: str,
        staking_program_id: str,
        staking_pool_address: str,
        dex_api_endpoint: str  # Jupiter aggregator
    ):
        self.db_conn = db_connection_string
        self.rpc_url = solana_rpc_url
        self.wallet = self._load_wallet(wallet_keypair_path)
        self.program_id = Pubkey.from_string(staking_program_id)
        self.pool_address = Pubkey.from_string(staking_pool_address)
        self.dex_api = dex_api_endpoint

    def _load_wallet(self, keypair_path: str) -> Keypair:
        """Load wallet from keypair file"""
        with open(keypair_path, 'r') as f:
            import json
            secret_key = json.load(f)
            return Keypair.from_bytes(bytes(secret_key))

    async def run_daily_distribution(self):
        """Main distribution process"""
        logger.info("Starting daily staking rewards distribution")

        try:
            # 1. Calculate yesterday's revenue
            yesterday = datetime.utcnow().date() - timedelta(days=1)
            revenue_data = await self._get_daily_revenue(yesterday)

            if revenue_data['total_revenue_usdc'] == 0:
                logger.info("No revenue to distribute")
                return

            # 2. Calculate allocation (30%)
            allocation_usdc = revenue_data['total_revenue_usdc'] * 0.30

            logger.info(
                f"Revenue: ${revenue_data['total_revenue_usdc']:.2f}, "
                f"Allocation: ${allocation_usdc:.2f}"
            )

            # 3. Create allocation record
            allocation_id = await self._create_allocation_record(
                yesterday,
                revenue_data['total_revenue_usdc'],
                allocation_usdc
            )

            # 4. Buy KAMIYO tokens
            buyback_result = await self._execute_buyback(
                allocation_id,
                allocation_usdc
            )

            logger.info(
                f"Bought {buyback_result['kamiyo_amount']} KAMIYO "
                f"at avg price ${buyback_result['avg_price']}"
            )

            # 5. Fund staking pool
            funding_result = await self._fund_staking_pool(
                allocation_id,
                buyback_result['kamiyo_amount']
            )

            logger.info(
                f"Funded staking pool: {funding_result['tx_hash']}"
            )

            # 6. Update allocation status
            await self._mark_allocation_completed(allocation_id, funding_result['tx_hash'])

            logger.info("Daily distribution completed successfully")

        except Exception as e:
            logger.error(f"Error in distribution: {e}", exc_info=True)
            # Send alert
            await self._send_alert(f"Distribution failed: {e}")

    async def _get_daily_revenue(self, date: datetime.date) -> dict:
        """Query database for daily revenue"""
        import asyncpg

        conn = await asyncpg.connect(self.db_conn)

        try:
            query = """
                SELECT
                    SUM(amount_charged) as total_revenue_usdc,
                    COUNT(*) as total_requests
                FROM x402_usage
                WHERE DATE(created_at) = $1
            """

            result = await conn.fetchrow(query, date)

            return {
                'total_revenue_usdc': float(result['total_revenue_usdc'] or 0),
                'total_requests': result['total_requests'] or 0
            }

        finally:
            await conn.close()

    async def _create_allocation_record(
        self,
        date: datetime.date,
        revenue_usdc: float,
        allocation_usdc: float
    ) -> int:
        """Create allocation record in database"""
        import asyncpg

        conn = await asyncpg.connect(self.db_conn)

        try:
            query = """
                INSERT INTO staking_revenue_allocations
                (period_start, period_end, revenue_usdc, allocation_usdc, status)
                VALUES ($1, $2, $3, $4, 'processing')
                RETURNING id
            """

            period_start = datetime.combine(date, datetime.min.time())
            period_end = datetime.combine(date, datetime.max.time())

            allocation_id = await conn.fetchval(
                query,
                period_start,
                period_end,
                revenue_usdc,
                allocation_usdc
            )

            return allocation_id

        finally:
            await conn.close()

    async def _execute_buyback(
        self,
        allocation_id: int,
        usdc_amount: float
    ) -> dict:
        """
        Buy KAMIYO tokens on DEX using Jupiter aggregator

        Returns transaction details
        """
        import aiohttp

        # Get best route from Jupiter
        quote_url = f"{self.dex_api}/quote"
        params = {
            'inputMint': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  # USDC
            'outputMint': 'KAMIYO_MINT_ADDRESS',  # Replace with actual mint
            'amount': int(usdc_amount * 1e6),  # USDC has 6 decimals
            'slippageBps': 50  # 0.5% slippage
        }

        async with aiohttp.ClientSession() as session:
            # Get quote
            async with session.get(quote_url, params=params) as resp:
                quote = await resp.json()

            # Execute swap
            swap_url = f"{self.dex_api}/swap"
            swap_payload = {
                'quoteResponse': quote,
                'userPublicKey': str(self.wallet.pubkey()),
                'wrapUnwrapSOL': True
            }

            async with session.post(swap_url, json=swap_payload) as resp:
                swap_transaction = await resp.json()

            # Sign and send transaction
            # (Simplified - in production use anchorpy/solana.py properly)
            tx_hash = await self._send_transaction(swap_transaction['swapTransaction'])

            kamiyo_amount = int(quote['outAmount']) / 1e9  # KAMIYO has 9 decimals
            avg_price = usdc_amount / kamiyo_amount

            # Record buyback
            await self._record_buyback(
                allocation_id,
                usdc_amount,
                kamiyo_amount,
                avg_price,
                'jupiter',
                tx_hash
            )

            return {
                'kamiyo_amount': kamiyo_amount,
                'avg_price': avg_price,
                'tx_hash': tx_hash
            }

    async def _fund_staking_pool(
        self,
        allocation_id: int,
        kamiyo_amount: float
    ) -> dict:
        """
        Call staking program's fund_pool instruction

        Transfers KAMIYO to reward vault
        """
        client = AsyncClient(self.rpc_url)
        provider = Provider(client, Wallet(self.wallet))

        # Load staking program
        idl_path = "target/idl/kamiyo_staking.json"
        program = await Program.at(self.program_id, provider, idl_path)

        # Call fund_pool instruction
        tx = await program.rpc["fund_pool"](
            int(kamiyo_amount * 1e9),  # Convert to raw amount
            ctx=Context(
                accounts={
                    "admin": self.wallet.pubkey(),
                    "staking_pool": self.pool_address,
                    "admin_token_account": self._get_associated_token_address(
                        self.wallet.pubkey(),
                        KAMIYO_MINT
                    ),
                    "reward_vault": self._get_reward_vault_address(),
                    "token_program": TOKEN_PROGRAM_ID,
                }
            )
        )

        # Record funding
        await self._record_pool_funding(
            allocation_id,
            kamiyo_amount,
            tx,
            str(self.pool_address),
            str(self._get_reward_vault_address())
        )

        await client.close()

        return {'tx_hash': tx}

    async def _send_alert(self, message: str):
        """Send alert via Discord/Slack/Email"""
        # Implement alerting
        logger.critical(f"ALERT: {message}")


# Run as cron job
if __name__ == "__main__":
    distributor = StakingRewardsDistributor(
        db_connection_string=os.getenv('DATABASE_URL'),
        solana_rpc_url=os.getenv('SOLANA_RPC_URL'),
        wallet_keypair_path=os.getenv('ADMIN_WALLET_PATH'),
        staking_program_id=os.getenv('STAKING_PROGRAM_ID'),
        staking_pool_address=os.getenv('STAKING_POOL_ADDRESS'),
        dex_api_endpoint='https://quote-api.jup.ag/v6'
    )

    asyncio.run(distributor.run_daily_distribution())
```

### Cron Configuration

```bash
# Add to crontab
# Run daily at 2 AM UTC
0 2 * * * cd /path/to/kamiyo && /usr/bin/python3 scripts/distribute_staking_rewards.py >> /var/log/staking_distribution.log 2>&1
```

---

## Monitoring & Analytics

### Dashboard Metrics

```python
# api/x402/analytics.py

class StakingAnalytics:
    """Analytics for staking integration"""

    async def get_dashboard_metrics(self) -> dict:
        """Get key metrics for admin dashboard"""

        return {
            'revenue': await self._get_revenue_metrics(),
            'discounts': await self._get_discount_metrics(),
            'staking': await self._get_staking_metrics(),
            'apy': await self._get_apy_metrics()
        }

    async def _get_revenue_metrics(self) -> dict:
        """Revenue breakdown"""
        query = """
            SELECT
                SUM(amount_charged) as total_revenue,
                SUM(original_amount) as revenue_without_discounts,
                SUM(savings_usdc) as total_discounts_given,
                (SUM(amount_charged) * 0.30) as allocated_to_staking
            FROM x402_usage
            WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
        """

        result = await self.db.fetchrow(query)
        return dict(result)

    async def _get_discount_metrics(self) -> dict:
        """Discount usage statistics"""
        query = """
            SELECT
                discount_tier,
                COUNT(*) as usage_count,
                SUM(savings_usdc) as total_savings
            FROM x402_usage
            WHERE discount_tier IS NOT NULL
              AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
            GROUP BY discount_tier
        """

        results = await self.db.fetch(query)
        return [dict(r) for r in results]

    async def _get_staking_metrics(self) -> dict:
        """Current staking stats from Solana"""
        # Query staking pool account
        # Return total staked, num stakers, etc.
        pass

    async def _get_apy_metrics(self) -> dict:
        """Historical APY data"""
        query = """
            SELECT recorded_at, calculated_apy, total_staked_ui
            FROM staking_apy_history
            ORDER BY recorded_at DESC
            LIMIT 30
        """

        results = await self.db.fetch(query)
        return [dict(r) for r in results]
```

---

## Testing Strategy

### Integration Test Suite

```python
# tests/x402/test_staking_integration.py

import pytest
from unittest.mock import Mock, AsyncMock, patch
from api.x402.middleware import X402Middleware
from api.x402.staking_query import StakingQueryService, StakeInfo


@pytest.mark.asyncio
async def test_discount_applied_for_staker():
    """Test that discount is correctly applied for stakers"""

    # Mock staking service
    staking_service = Mock()
    staking_service.get_user_stake_info = AsyncMock(return_value=StakeInfo(
        wallet_address="test_wallet",
        staked_amount=500_000_000_000_000,  # 500k KAMIYO
        staked_amount_ui=500_000,
        discount_tier="gold",
        discount_percent=20,
        priority_level="priority"
    ))

    # Create middleware with mock
    middleware = X402Middleware(app=None, payment_tracker=Mock(), staking_service=staking_service)

    # Create mock request
    request = Mock()
    request.url.path = "/api/premium"
    request.method = "GET"
    request.headers.get = Mock(return_value="test_wallet")

    # Get payment config
    config = await middleware._get_payment_config_with_discount(request)

    # Assert discount applied
    assert config['original_price'] == 0.10  # Base price
    assert config['price'] == 0.08  # 20% discount
    assert config['discount_applied']['tier'] == 'gold'
    assert config['discount_applied']['discount_percent'] == 20


@pytest.mark.asyncio
async def test_no_discount_for_non_staker():
    """Test that no discount applied for non-stakers"""

    # Mock returning no stake
    staking_service = Mock()
    staking_service.get_user_stake_info = AsyncMock(return_value=StakeInfo(
        wallet_address="test_wallet",
        staked_amount=0,
        staked_amount_ui=0,
        discount_tier="none",
        discount_percent=0,
        priority_level="standard"
    ))

    middleware = X402Middleware(app=None, payment_tracker=Mock(), staking_service=staking_service)

    request = Mock()
    request.url.path = "/api/premium"
    request.method = "GET"
    request.headers.get = Mock(return_value="test_wallet")

    config = await middleware._get_payment_config_with_discount(request)

    assert config['price'] == config['original_price']
    assert config['discount_applied'] is None


@pytest.mark.asyncio
async def test_revenue_allocation_calculation():
    """Test revenue allocation calculation"""

    from api.x402.revenue_tracker import RevenueTracker

    tracker = RevenueTracker(Mock())

    allocation = await tracker.calculate_staking_allocation(
        revenue_usdc=10000,
        allocation_percent=30
    )

    assert allocation['allocation_usdc'] == 3000
    assert allocation['remaining_usdc'] == 7000
```

---

## Deployment Plan

### Phase 1: Infrastructure (Week 1)
- [ ] Deploy StakingQueryService
- [ ] Set up Redis caching
- [ ] Add database migrations
- [ ] Configure Solana RPC endpoint

### Phase 2: Middleware Integration (Week 2)
- [ ] Update X402Middleware
- [ ] Add discount logic
- [ ] Test on staging
- [ ] Monitor performance

### Phase 3: Revenue Tracking (Week 3)
- [ ] Deploy RevenueTracker
- [ ] Set up monitoring
- [ ] Create admin dashboard
- [ ] Test allocation calculations

### Phase 4: Automated Distribution (Week 4)
- [ ] Deploy distribution script
- [ ] Test on devnet
- [ ] Set up cron job
- [ ] Configure alerting

### Phase 5: Production Launch (Week 5)
- [ ] Deploy to production
- [ ] Monitor closely for 48 hours
- [ ] Gather user feedback
- [ ] Optimize as needed

---

**End of Integration Plan**
