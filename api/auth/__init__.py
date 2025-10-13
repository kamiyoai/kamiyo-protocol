# -*- coding: utf-8 -*-
"""
Kamiyo Authentication Module

P0 + P1 Security Fixes Implemented:
- P0-1: Redis-backed distributed token revocation (token_revocation.py)
- P0-2: Timing-safe token validation with rate limiting (timing_safe.py)
- P0-3: Deterministic idempotency key generation (idempotency.py)
- P1-1: JWT secret rotation with zero downtime (secret_rotation.py)
- P1-2: Refresh token rotation (one-time use) (jwt_manager.py)
- P1-3: Brute force protection with progressive lockout (rate_limiter.py)
- P1-4: Explicit algorithm enforcement (jwt_manager.py)
- P1-5: Cryptographically random JTI (jwt_manager.py)

All fixes are production-ready with comprehensive error handling,
logging, and graceful degradation.
"""

from api.auth.jwt_manager import JWTManager, get_jwt_manager
from api.auth.token_revocation import (
    RedisTokenRevocationStore,
    get_revocation_store,
    close_revocation_store
)
from api.auth.timing_safe import (
    TimingSafeValidator,
    get_timing_validator,
    timing_safe_validation
)
from api.auth.idempotency import (
    IdempotencyManager,
    get_idempotency_manager,
    idempotent_operation
)
from api.auth.secret_rotation import (
    JWTSecretManager,
    get_secret_manager,
    reset_secret_manager
)
from api.auth.rate_limiter import (
    AuthenticationRateLimiter,
    RateLimitResult,
    get_rate_limiter,
    reset_rate_limiter
)

__all__ = [
    # JWT Manager
    "JWTManager",
    "get_jwt_manager",

    # Token Revocation (P0-1)
    "RedisTokenRevocationStore",
    "get_revocation_store",
    "close_revocation_store",

    # Timing-Safe Validation (P0-2)
    "TimingSafeValidator",
    "get_timing_validator",
    "timing_safe_validation",

    # Idempotency (P0-3)
    "IdempotencyManager",
    "get_idempotency_manager",
    "idempotent_operation",

    # Secret Rotation (P1-1)
    "JWTSecretManager",
    "get_secret_manager",
    "reset_secret_manager",

    # Rate Limiter (P1-3)
    "AuthenticationRateLimiter",
    "RateLimitResult",
    "get_rate_limiter",
    "reset_rate_limiter",
]

__version__ = "3.0.0"
__author__ = "Kamiyo Security Team"
