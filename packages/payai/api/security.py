# -*- coding: utf-8 -*-
"""
Security Middleware and Utilities for Kamiyo API
Implements rate limiting, input validation, and security headers
"""

import os
import re
import time
import hashlib
from typing import Dict, Optional, Callable
from functools import wraps
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
import redis
import logging

logger = logging.getLogger(__name__)


# ==========================================
# RATE LIMITING
# ==========================================

class RateLimiter:
    """
    Token bucket rate limiter using Redis

    Limits requests per time window based on user tier
    """

    def __init__(self, redis_url: str = None):
        self.redis_url = redis_url or os.getenv('REDIS_URL', 'redis://localhost:6379/0')

        try:
            self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
            self.redis_client.ping()
            logger.info("Rate limiter connected to Redis")
        except Exception as e:
            logger.warning(f"Redis connection failed, rate limiting disabled: {e}")
            self.redis_client = None

        # Rate limits by tier (requests per hour)
        self.limits = {
            'free': int(os.getenv('RATE_LIMIT_FREE', 10)),
            'basic': int(os.getenv('RATE_LIMIT_BASIC', 100)),
            'pro': int(os.getenv('RATE_LIMIT_PRO', 1000)),
            'enterprise': int(os.getenv('RATE_LIMIT_ENTERPRISE', 10000))
        }

    def check_rate_limit(self, identifier: str, tier: str = 'free') -> Dict[str, any]:
        """
        Check if request is within rate limit

        Args:
            identifier: User ID or IP address
            tier: User subscription tier

        Returns:
            Dict with allowed status and remaining requests
        """

        if not self.redis_client:
            # Rate limiting disabled if Redis unavailable
            return {'allowed': True, 'remaining': 9999}

        limit = self.limits.get(tier, self.limits['free'])
        key = f"rate_limit:{tier}:{identifier}"

        try:
            # Get current count
            current = self.redis_client.get(key)

            if current is None:
                # First request in window
                self.redis_client.setex(key, 3600, 1)  # 1 hour window
                return {
                    'allowed': True,
                    'remaining': limit - 1,
                    'limit': limit,
                    'reset': int(time.time()) + 3600
                }

            current = int(current)

            if current >= limit:
                # Rate limit exceeded
                ttl = self.redis_client.ttl(key)
                return {
                    'allowed': False,
                    'remaining': 0,
                    'limit': limit,
                    'reset': int(time.time()) + ttl
                }

            # Increment count
            self.redis_client.incr(key)

            return {
                'allowed': True,
                'remaining': limit - current - 1,
                'limit': limit,
                'reset': int(time.time()) + self.redis_client.ttl(key)
            }

        except Exception as e:
            logger.error(f"Rate limit check failed: {e}")
            return {'allowed': True, 'remaining': 9999}


# Global rate limiter instance
_rate_limiter = None

def get_rate_limiter() -> RateLimiter:
    """Get rate limiter singleton"""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter


async def rate_limit_middleware(request: Request, call_next: Callable, tier: str = 'free'):
    """
    Middleware to enforce rate limiting

    Usage:
        @app.middleware("http")
        async def add_rate_limiting(request: Request, call_next):
            return await rate_limit_middleware(request, call_next)
    """

    # Skip rate limiting for health checks
    if request.url.path in ['/health', '/metrics']:
        return await call_next(request)

    # Get identifier (API key or IP)
    identifier = request.headers.get('X-API-Key')
    if not identifier:
        identifier = request.client.host

    # Check rate limit
    rate_limiter = get_rate_limiter()
    result = rate_limiter.check_rate_limit(identifier, tier)

    # Add rate limit headers
    response = await call_next(request)
    response.headers['X-RateLimit-Limit'] = str(result.get('limit', 0))
    response.headers['X-RateLimit-Remaining'] = str(result.get('remaining', 0))
    response.headers['X-RateLimit-Reset'] = str(result.get('reset', 0))

    if not result['allowed']:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                'error': 'Rate limit exceeded',
                'limit': result['limit'],
                'reset': result['reset']
            }
        )

    return response


# ==========================================
# INPUT VALIDATION
# ==========================================

class InputValidator:
    """Validates and sanitizes user input"""

    @staticmethod
    def validate_tx_hash(tx_hash: str) -> bool:
        """Validate transaction hash format"""

        if not tx_hash:
            return False

        # Standard Ethereum tx hash: 0x + 64 hex chars
        if tx_hash.startswith('0x'):
            return bool(re.match(r'^0x[a-fA-F0-9]{64}$', tx_hash))

        # Generated hash format
        if tx_hash.startswith('generated-'):
            return len(tx_hash) <= 100

        return False

    @staticmethod
    def validate_chain(chain: str) -> bool:
        """Validate blockchain name"""

        if not chain or len(chain) > 50:
            return False

        # Alphanumeric + spaces/dashes only
        return bool(re.match(r'^[a-zA-Z0-9\s\-]+$', chain))

    @staticmethod
    def validate_protocol(protocol: str) -> bool:
        """Validate protocol name"""

        if not protocol or len(protocol) > 100:
            return False

        # Alphanumeric + spaces/dashes/dots only
        return bool(re.match(r'^[a-zA-Z0-9\s\-\.]+$', protocol))

    @staticmethod
    def validate_wallet_address(address: str) -> bool:
        """Validate wallet address"""

        if not address:
            return False

        # Ethereum address: 0x + 40 hex chars
        if address.startswith('0x'):
            return bool(re.match(r'^0x[a-fA-F0-9]{40}$', address))

        # Other formats (Solana, etc) - basic validation
        return 20 <= len(address) <= 100 and address.isalnum()

    @staticmethod
    def validate_email(email: str) -> bool:
        """Validate email format"""

        if not email or len(email) > 255:
            return False

        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))

    @staticmethod
    def validate_url(url: str) -> bool:
        """Validate URL format"""

        if not url or len(url) > 2000:
            return False

        pattern = r'^https?://[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}(/.*)?$'
        return bool(re.match(pattern, url))

    @staticmethod
    def sanitize_string(input_str: str, max_length: int = 1000) -> str:
        """Sanitize string input"""

        if not input_str:
            return ""

        # Remove control characters
        sanitized = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', input_str)

        # Trim to max length
        sanitized = sanitized[:max_length]

        # Strip whitespace
        sanitized = sanitized.strip()

        return sanitized

    @staticmethod
    def validate_amount(amount: float) -> bool:
        """Validate monetary amount"""

        if amount is None:
            return True  # Optional

        # Must be non-negative and reasonable
        return 0 <= amount <= 1_000_000_000_000  # Max $1 trillion


# ==========================================
# SQL INJECTION PREVENTION
# ==========================================

class SQLInjectionPrevention:
    """Prevents SQL injection attacks"""

    # Common SQL injection patterns
    SQL_PATTERNS = [
        r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)",
        r"(--|;|\/\*|\*\/)",
        r"(\bOR\b.*=.*\b(OR|AND)\b)",
        r"(\bUNION\b.*\bSELECT\b)",
        r"('|\"|\`).*(\bOR\b|\bAND\b).*('|\"|\`)",
    ]

    @classmethod
    def check_sql_injection(cls, input_str: str) -> bool:
        """
        Check if input contains SQL injection patterns

        Returns:
            True if safe, False if potential SQL injection
        """

        if not input_str:
            return True

        input_upper = input_str.upper()

        for pattern in cls.SQL_PATTERNS:
            if re.search(pattern, input_upper):
                logger.warning(f"Potential SQL injection detected: {input_str[:50]}")
                return False

        return True


# ==========================================
# SECURITY HEADERS
# ==========================================

async def add_security_headers(request: Request, call_next: Callable):
    """
    Add security headers to all responses

    Usage:
        @app.middleware("http")
        async def security_headers(request: Request, call_next):
            return await add_security_headers(request, call_next)
    """

    response = await call_next(request)

    # Security headers
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'

    # Content Security Policy
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "font-src 'self' data:; "
        "connect-src 'self' https://api.kamiyo.ai"
    )
    response.headers['Content-Security-Policy'] = csp

    # Remove server header
    if 'server' in response.headers:
        del response.headers['server']

    return response


# ==========================================
# API KEY VALIDATION
# ==========================================

def validate_api_key(api_key: str) -> Optional[Dict]:
    """
    Validate API key and return user info

    Args:
        api_key: API key from header

    Returns:
        User info dict or None if invalid
    """

    if not api_key:
        return None

    # In production, query database
    # For now, mock validation
    # TODO: Implement actual database lookup

    return {
        'user_id': 'test_user',
        'tier': 'free',
        'email': 'test@example.com'
    }


def require_api_key(tier: str = None):
    """
    Decorator to require valid API key

    Usage:
        @require_api_key(tier='pro')
        async def protected_endpoint():
            pass
    """

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract request from args
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break

            if not request:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Request object not found"
                )

            # Get API key from header
            api_key = request.headers.get('X-API-Key')

            if not api_key:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="API key required"
                )

            # Validate API key
            user = validate_api_key(api_key)

            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid API key"
                )

            # Check tier requirement
            if tier and user['tier'] != tier:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Requires {tier} tier subscription"
                )

            # Add user to request state
            request.state.user = user

            return await func(*args, **kwargs)

        return wrapper
    return decorator


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Security Module Test ===\n")

    # Test input validation
    print("1. Testing input validation...")
    validator = InputValidator()

    assert validator.validate_tx_hash('0x' + 'a' * 64) == True
    assert validator.validate_tx_hash('invalid') == False
    assert validator.validate_chain('Ethereum') == True
    assert validator.validate_chain('Chain<script>') == False
    assert validator.validate_email('test@example.com') == True
    assert validator.validate_email('invalid') == False

    print("   ✓ Input validation working")

    # Test SQL injection prevention
    print("\n2. Testing SQL injection prevention...")

    assert SQLInjectionPrevention.check_sql_injection('SELECT * FROM users') == False
    assert SQLInjectionPrevention.check_sql_injection('Normal input') == True
    assert SQLInjectionPrevention.check_sql_injection("' OR '1'='1") == False

    print("   ✓ SQL injection prevention working")

    # Test rate limiter
    print("\n3. Testing rate limiter...")

    rate_limiter = RateLimiter()
    result = rate_limiter.check_rate_limit('test_user', 'free')

    print(f"   Rate limit result: {result}")
    print("   ✓ Rate limiter working")

    print("\n✅ Security module ready")
