# -*- coding: utf-8 -*-
"""
Kamiyo Authentication Module

P0 Security Fixes Implemented:
- P0-1: Redis-backed distributed token revocation (token_revocation.py)
- P0-2: Timing-safe token validation with rate limiting (timing_safe.py)
- P0-3: Deterministic idempotency key generation (idempotency.py)

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
]

__version__ = "2.0.0"
__author__ = "Kamiyo Security Team"
