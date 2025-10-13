# -*- coding: utf-8 -*-
"""
JWT Token Manager with P0 Security Fixes
Integrates all three critical security fixes:
- P0-1: Redis-backed token revocation
- P0-2: Timing-safe validation
- P0-3: Deterministic idempotency keys
"""

import os
import jwt
import logging
from typing import Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
from fastapi import HTTPException, Request

from api.auth.token_revocation import get_revocation_store
from api.auth.timing_safe import get_timing_validator
from api.auth.idempotency import get_idempotency_manager

logger = logging.getLogger(__name__)


class JWTManager:
    """
    Production-ready JWT token manager with enterprise security features.

    Security Features:
    - P0-1: Redis-backed distributed token revocation
    - P0-2: Timing-attack resistant validation with rate limiting
    - P0-3: Deterministic JTI generation for idempotency
    - Secure token generation with configurable expiry
    - Comprehensive logging for audit trail
    """

    def __init__(
        self,
        secret_key: Optional[str] = None,
        algorithm: str = "HS256",
        access_token_expire_minutes: int = 60,
        refresh_token_expire_days: int = 30
    ):
        """
        Initialize JWT manager.

        Args:
            secret_key: JWT secret key (defaults to env JWT_SECRET)
            algorithm: JWT algorithm
            access_token_expire_minutes: Access token expiry in minutes
            refresh_token_expire_days: Refresh token expiry in days
        """
        self.secret_key = secret_key or os.getenv('JWT_SECRET')
        if not self.secret_key:
            raise ValueError("JWT_SECRET environment variable is required")

        if len(self.secret_key) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters long")

        self.algorithm = algorithm
        self.access_token_expire_minutes = access_token_expire_minutes
        self.refresh_token_expire_days = refresh_token_expire_days

        # Get singleton instances of security components
        self.revocation_store = get_revocation_store()
        self.timing_validator = get_timing_validator()
        self.idempotency_manager = get_idempotency_manager()

    def create_access_token(
        self,
        user_id: str,
        user_email: str,
        tier: str,
        additional_claims: Optional[Dict[str, Any]] = None,
        expires_delta: Optional[timedelta] = None
    ) -> Dict[str, Any]:
        """
        Create JWT access token with deterministic JTI (P0-3 fix).

        Args:
            user_id: User identifier
            user_email: User email
            tier: User subscription tier
            additional_claims: Optional additional claims
            expires_delta: Optional custom expiry delta

        Returns:
            Dictionary with token, jti, and expiry information
        """
        now = datetime.utcnow()
        expires_delta = expires_delta or timedelta(minutes=self.access_token_expire_minutes)
        expire = now + expires_delta

        # Generate deterministic JTI for idempotency (P0-3 FIX)
        jti = self.idempotency_manager.generate_deterministic_jti(
            user_id=user_id,
            operation="access_token",
            timestamp=now,
            additional_context={
                "email": user_email,
                "tier": tier
            }
        )

        # Build token payload
        payload = {
            "sub": user_id,  # Subject (user ID)
            "email": user_email,
            "tier": tier,
            "jti": jti,  # JWT ID (for revocation)
            "iat": now,  # Issued at
            "exp": expire,  # Expiry
            "type": "access"
        }

        # Add additional claims if provided
        if additional_claims:
            payload.update(additional_claims)

        # Generate token
        token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

        logger.info(
            f"Created access token: user={user_id}, email={user_email}, "
            f"tier={tier}, jti={jti[:8]}..., expires={expire.isoformat()}"
        )

        return {
            "access_token": token,
            "token_type": "bearer",
            "expires_in": int(expires_delta.total_seconds()),
            "expires_at": expire.isoformat(),
            "jti": jti
        }

    def create_refresh_token(
        self,
        user_id: str,
        user_email: str,
        expires_delta: Optional[timedelta] = None
    ) -> Dict[str, Any]:
        """
        Create JWT refresh token with deterministic JTI.

        Args:
            user_id: User identifier
            user_email: User email
            expires_delta: Optional custom expiry delta

        Returns:
            Dictionary with token, jti, and expiry information
        """
        now = datetime.utcnow()
        expires_delta = expires_delta or timedelta(days=self.refresh_token_expire_days)
        expire = now + expires_delta

        # Generate deterministic JTI (P0-3 FIX)
        jti = self.idempotency_manager.generate_deterministic_jti(
            user_id=user_id,
            operation="refresh_token",
            timestamp=now,
            additional_context={"email": user_email}
        )

        # Build token payload
        payload = {
            "sub": user_id,
            "email": user_email,
            "jti": jti,
            "iat": now,
            "exp": expire,
            "type": "refresh"
        }

        # Generate token
        token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

        logger.info(
            f"Created refresh token: user={user_id}, jti={jti[:8]}..., expires={expire.isoformat()}"
        )

        return {
            "refresh_token": token,
            "expires_in": int(expires_delta.total_seconds()),
            "expires_at": expire.isoformat(),
            "jti": jti
        }

    def verify_token(
        self,
        token: str,
        request: Optional[Request] = None
    ) -> Dict[str, Any]:
        """
        Verify JWT token with timing-safe validation and revocation check.

        Implements:
        - P0-2: Timing-safe validation with rate limiting
        - P0-1: Distributed revocation check

        Args:
            token: JWT token string
            request: Optional FastAPI request for IP extraction

        Returns:
            Token payload if valid

        Raises:
            HTTPException: If token is invalid, expired, or revoked
        """
        # Extract client IP for rate limiting (P0-2)
        client_ip = "unknown"
        if request:
            client_ip = request.client.host if request.client else "unknown"

        try:
            # Decode token (this validates signature and expiry)
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm]
            )

            jti = payload.get("jti")
            if not jti:
                logger.warning(f"Token missing JTI claim from IP {client_ip}")
                raise HTTPException(status_code=401, detail="Invalid token format")

            # Check revocation with timing-safe validation (P0-1 + P0-2 FIX)
            is_valid, error_message = self.timing_validator.validate_token_timing_safe(
                token_jti=jti,
                expected_jti=jti,  # In this case, we're just checking if it's revoked
                client_ip=client_ip
            )

            if not is_valid:
                logger.warning(f"Timing validation failed: {error_message}")
                raise HTTPException(status_code=429, detail=error_message)

            # Check if token is revoked (P0-1 FIX)
            if self.revocation_store.is_revoked(jti):
                logger.warning(f"Revoked token attempted: jti={jti[:8]}..., ip={client_ip}")
                raise HTTPException(status_code=401, detail="Token has been revoked")

            logger.debug(f"Token verified successfully: jti={jti[:8]}..., user={payload.get('sub')}")
            return payload

        except jwt.ExpiredSignatureError:
            logger.warning(f"Expired token from IP {client_ip}")
            raise HTTPException(status_code=401, detail="Token has expired")

        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token from IP {client_ip}: {e}")
            raise HTTPException(status_code=401, detail="Invalid token")

        except HTTPException:
            raise

        except Exception as e:
            logger.error(f"Token verification error from IP {client_ip}: {e}")
            raise HTTPException(status_code=500, detail="Token verification failed")

    def revoke_token(
        self,
        token: str,
        reason: str = "user_logout"
    ) -> bool:
        """
        Revoke a JWT token using Redis-backed store (P0-1 fix).

        Args:
            token: JWT token string to revoke
            reason: Reason for revocation

        Returns:
            True if successfully revoked

        Raises:
            HTTPException: If token is invalid
        """
        try:
            # Decode token to get JTI and expiry (no verification needed)
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
                options={"verify_signature": False}  # We just need JTI
            )

            jti = payload.get("jti")
            exp = payload.get("exp")
            user_id = payload.get("sub")

            if not jti or not exp:
                raise HTTPException(status_code=400, detail="Invalid token format")

            # Calculate TTL (time until token expires)
            now = datetime.utcnow()
            expire_time = datetime.fromtimestamp(exp)
            ttl = int((expire_time - now).total_seconds())

            if ttl <= 0:
                # Token already expired, no need to revoke
                logger.info(f"Token already expired, skipping revocation: jti={jti[:8]}...")
                return True

            # Revoke using Redis-backed store (P0-1 FIX)
            success = self.revocation_store.revoke(
                token_jti=jti,
                expires_in=ttl,
                user_id=user_id,
                reason=reason
            )

            if success:
                logger.info(
                    f"Token revoked: jti={jti[:8]}..., user={user_id}, reason={reason}, ttl={ttl}s"
                )

            return success

        except jwt.InvalidTokenError as e:
            logger.error(f"Failed to revoke invalid token: {e}")
            raise HTTPException(status_code=400, detail="Invalid token")

        except Exception as e:
            logger.error(f"Token revocation error: {e}")
            raise HTTPException(status_code=500, detail="Token revocation failed")

    def revoke_all_user_tokens(
        self,
        user_id: str,
        reason: str = "admin_action"
    ) -> int:
        """
        Revoke all tokens for a user.

        Note: This requires tracking all user tokens, which is not implemented yet.
        For now, this is a placeholder for future implementation.

        Args:
            user_id: User identifier
            reason: Reason for revocation

        Returns:
            Number of tokens revoked
        """
        logger.warning(
            f"revoke_all_user_tokens called for user={user_id}, but not fully implemented. "
            f"Consider implementing user token tracking."
        )
        # TODO: Implement user token tracking in Redis
        return 0

    def get_security_stats(self) -> Dict[str, Any]:
        """
        Get comprehensive security statistics from all components.

        Returns:
            Dictionary with statistics from all security components
        """
        return {
            "revocation_store": self.revocation_store.get_stats(),
            "timing_validator": self.timing_validator.get_stats(),
            "idempotency_manager": self.idempotency_manager.get_stats(),
            "token_expiry": {
                "access_token_minutes": self.access_token_expire_minutes,
                "refresh_token_days": self.refresh_token_expire_days
            }
        }

    def health_check(self) -> Dict[str, Any]:
        """
        Perform health check on all security components.

        Returns:
            Dictionary with health status
        """
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "revocation_store": self.revocation_store.health_check(),
            "jwt_manager": {
                "status": "healthy",
                "algorithm": self.algorithm,
                "secret_key_configured": bool(self.secret_key)
            }
        }


# Singleton instance
_jwt_manager: Optional[JWTManager] = None


def get_jwt_manager() -> JWTManager:
    """
    Get singleton JWT manager instance.

    Returns:
        JWTManager instance
    """
    global _jwt_manager
    if _jwt_manager is None:
        _jwt_manager = JWTManager()
    return _jwt_manager
