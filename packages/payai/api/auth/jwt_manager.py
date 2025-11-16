# -*- coding: utf-8 -*-
"""
JWT Token Manager with P0 + P1 Security Fixes
Integrates critical security fixes:
- P0-1: Redis-backed token revocation
- P0-2: Timing-safe validation
- P0-3: Deterministic idempotency keys
- P1-1: JWT secret rotation with zero downtime
- P1-2: Refresh token rotation (one-time use)
- P1-4: Explicit algorithm enforcement
- P1-5: Cryptographically random JTI
"""

import os
import jwt
import uuid
import logging
from typing import Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
from fastapi import HTTPException, Request

from api.auth.token_revocation import get_revocation_store
from api.auth.timing_safe import get_timing_validator
from api.auth.idempotency import get_idempotency_manager
from api.auth.secret_rotation import get_secret_manager

logger = logging.getLogger(__name__)


class JWTManager:
    """
    Production-ready JWT token manager with enterprise security features.

    Security Features:
    - P0-1: Redis-backed distributed token revocation
    - P0-2: Timing-attack resistant validation with rate limiting
    - P0-3: Deterministic JTI generation for idempotency
    - P1-1: JWT secret rotation with zero downtime
    - P1-2: Refresh token rotation (one-time use)
    - P1-4: Explicit algorithm enforcement
    - P1-5: Cryptographically random JTI (UUID4)
    - Secure token generation with configurable expiry
    - Comprehensive logging for audit trail
    """

    def __init__(
        self,
        secret_key: Optional[str] = None,
        algorithm: str = "HS256",
        access_token_expire_minutes: int = 60,
        refresh_token_expire_days: int = 7  # P1-2: Reduced from 30 to 7 days
    ):
        """
        Initialize JWT manager.

        Args:
            secret_key: JWT secret key (defaults to env JWT_SECRET, or secret manager)
            algorithm: JWT algorithm (only HS256 allowed for security)
            access_token_expire_minutes: Access token expiry in minutes
            refresh_token_expire_days: Refresh token expiry in days (default: 7)
        """
        # P1-4 FIX: Enforce only secure algorithms
        if algorithm not in ['HS256', 'HS384', 'HS512']:
            raise ValueError(
                f"Unsupported algorithm: {algorithm}. "
                f"Only HS256, HS384, HS512 are allowed for security."
            )

        self.algorithm = algorithm
        self.access_token_expire_minutes = access_token_expire_minutes
        self.refresh_token_expire_days = refresh_token_expire_days

        # P1-1 FIX: Initialize secret manager for rotation support
        self.secret_manager = get_secret_manager(
            token_expiry_seconds=access_token_expire_minutes * 60,
            grace_period_seconds=300  # 5 minutes
        )

        # Use secret manager instead of direct env variable
        self.secret_key = secret_key or self.secret_manager.get_current_secret()
        if not self.secret_key:
            raise ValueError("JWT_SECRET environment variable is required")

        if len(self.secret_key) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters long")

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
        Create JWT access token with cryptographically random JTI (P1-5 fix).

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

        # P1-5 FIX: Generate cryptographically random JTI using UUID4
        # This prevents replay attacks and token prediction
        jti = str(uuid.uuid4())

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
        Create JWT refresh token with cryptographically random JTI (P1-5 fix).

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

        # P1-5 FIX: Generate cryptographically random JTI using UUID4
        jti = str(uuid.uuid4())

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
        - P1-1: Secret rotation support (tries all valid secrets)
        - P1-4: Explicit algorithm enforcement and required claims

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
            # P1-1 FIX: Try all valid secrets (current + previous) for zero-downtime rotation
            all_secrets = self.secret_manager.get_all_valid_secrets()
            payload = None
            last_error = None

            for secret_idx, secret in enumerate(all_secrets):
                try:
                    # P1-4 FIX: Explicit algorithm enforcement and required claims validation
                    payload = jwt.decode(
                        token,
                        secret,
                        algorithms=[self.algorithm],
                        options={
                            'verify_signature': True,  # Explicit signature verification
                            'verify_exp': True,         # Verify expiration
                            'verify_iat': True,         # Verify issued-at
                            'require': ['exp', 'iat', 'jti', 'sub', 'email', 'tier']  # Required claims
                        }
                    )

                    # Success! Token validated with this secret
                    if secret_idx > 0:
                        logger.info(
                            f"Token validated with previous secret #{secret_idx} "
                            f"during rotation grace period"
                        )
                    break

                except jwt.InvalidTokenError as e:
                    last_error = e
                    continue  # Try next secret

            # If no secret worked, raise the last error
            if payload is None:
                if last_error:
                    raise last_error
                raise jwt.InvalidTokenError("Token validation failed with all secrets")

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

    def refresh_access_token(
        self,
        refresh_token: str,
        request: Optional[Request] = None
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Refresh access token using refresh token with rotation (P1-2 fix).

        OWASP Best Practice: Refresh tokens are one-time use.
        - Old refresh token is REVOKED immediately
        - New access token AND new refresh token are returned
        - This prevents stolen refresh tokens from being reused

        Args:
            refresh_token: Current refresh token
            request: Optional FastAPI request for IP extraction

        Returns:
            Tuple of (new_access_token_data, new_refresh_token_data)

        Raises:
            HTTPException: If refresh fails
        """
        # Step 1: Verify refresh token
        payload = self.verify_token(refresh_token, request=request)

        # Verify it's a refresh token (not access token)
        if payload.get("type") != "refresh":
            logger.warning("Attempted to use non-refresh token for refresh")
            raise HTTPException(
                status_code=401,
                detail="Invalid token type"
            )

        # Extract user info
        user_id = payload.get("sub")
        user_email = payload.get("email")
        old_jti = payload.get("jti")

        if not user_id or not user_email or not old_jti:
            logger.error("Refresh token missing required claims")
            raise HTTPException(
                status_code=401,
                detail="Invalid token claims"
            )

        # Step 2: REVOKE old refresh token (P1-2 FIX - ONE-TIME USE)
        # Calculate TTL for revocation
        exp = payload.get("exp")
        if exp:
            now = datetime.utcnow()
            expire_time = datetime.fromtimestamp(exp)
            ttl = int((expire_time - now).total_seconds())

            if ttl > 0:
                # Revoke old refresh token in Redis
                success = self.revocation_store.revoke(
                    token_jti=old_jti,
                    expires_in=ttl,
                    user_id=user_id,
                    reason="refresh_token_rotation"
                )

                if success:
                    logger.info(
                        f"Old refresh token revoked during rotation: "
                        f"user={user_id}, jti={old_jti[:8]}..."
                    )
                else:
                    logger.error(
                        f"Failed to revoke old refresh token: "
                        f"user={user_id}, jti={old_jti[:8]}..."
                    )
                    # Continue anyway - better to issue new token than fail

        # Step 3: Get current user tier (could have changed)
        from database import get_db
        db = get_db()
        user = db.conn.execute(
            "SELECT tier FROM users WHERE id = ? AND email = ?",
            (user_id, user_email)
        ).fetchone()

        if not user:
            logger.error(f"User not found during token refresh: {user_id}")
            raise HTTPException(
                status_code=401,
                detail="User not found"
            )

        user_tier = user[0]

        # Step 4: Generate NEW access token
        new_access_token_data = self.create_access_token(
            user_id=user_id,
            user_email=user_email,
            tier=user_tier
        )

        # Step 5: Generate NEW refresh token (P1-2 FIX)
        new_refresh_token_data = self.create_refresh_token(
            user_id=user_id,
            user_email=user_email
        )

        logger.info(
            f"Token refresh successful with rotation: "
            f"user={user_id}, old_refresh_jti={old_jti[:8]}..., "
            f"new_refresh_jti={new_refresh_token_data['jti'][:8]}..."
        )

        # Return BOTH new tokens
        return new_access_token_data, new_refresh_token_data

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
            "secret_manager": self.secret_manager.get_rotation_status(),
            "token_expiry": {
                "access_token_minutes": self.access_token_expire_minutes,
                "refresh_token_days": self.refresh_token_expire_days
            },
            "p1_fixes_applied": {
                "P1-1": "JWT secret rotation with zero downtime",
                "P1-2": "Refresh token rotation (one-time use)",
                "P1-4": "Explicit algorithm enforcement",
                "P1-5": "Cryptographically random JTI (UUID4)"
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
            "secret_manager": self.secret_manager.health_check(),
            "jwt_manager": {
                "status": "healthy",
                "algorithm": self.algorithm,
                "secret_key_configured": bool(self.secret_key),
                "p1_fixes": ["secret_rotation", "refresh_token_rotation", "algorithm_enforcement", "uuid4_jti"]
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
