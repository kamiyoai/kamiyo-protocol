# -*- coding: utf-8 -*-
"""
JWT Secret Rotation Manager
Addresses P1-1: Zero-downtime JWT secret rotation for compromised secret recovery

OWASP Best Practices:
- Graceful migration with multiple valid secrets
- Automatic cleanup of expired secrets
- Audit trail for rotation events
- Zero downtime during rotation
"""

import os
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class SecretMetadata:
    """Metadata for a JWT secret."""
    secret: str
    created_at: datetime
    expires_at: Optional[datetime] = None
    rotation_id: Optional[str] = None


class JWTSecretManager:
    """
    Production-ready JWT secret rotation manager with zero-downtime support.

    Features:
    - Current secret for signing new tokens
    - Previous secrets list for validating old tokens (graceful migration)
    - Automatic secret expiry based on JWT lifetime
    - Rotation audit trail
    - Environment-based configuration

    Rotation Process:
    1. Generate new secret: openssl rand -hex 32
    2. Move current JWT_SECRET to JWT_SECRET_PREVIOUS
    3. Set new JWT_SECRET
    4. Deploy with zero downtime
    5. After JWT_EXPIRY_SECONDS + grace period, remove oldest from JWT_SECRET_PREVIOUS

    Environment Variables:
    - JWT_SECRET: Current secret (required)
    - JWT_SECRET_PREVIOUS: Comma-separated list of previous secrets (optional)
    - JWT_SECRET_ROTATION_DATE: ISO 8601 date of last rotation (optional)
    """

    def __init__(
        self,
        current_secret: Optional[str] = None,
        previous_secrets: Optional[List[str]] = None,
        rotation_date: Optional[str] = None,
        token_expiry_seconds: int = 3600,
        grace_period_seconds: int = 3600  # 1 hour (matches token expiry for distributed deployment)
    ):
        """
        Initialize JWT secret manager.

        Args:
            current_secret: Current JWT secret (defaults to env JWT_SECRET)
            previous_secrets: List of previous secrets (defaults to env JWT_SECRET_PREVIOUS)
            rotation_date: ISO date of last rotation (defaults to env JWT_SECRET_ROTATION_DATE)
            token_expiry_seconds: Token expiry time (for automatic cleanup)
            grace_period_seconds: Grace period after expiry before removing old secrets
        """
        # Load current secret
        self._current_secret = current_secret or os.getenv('JWT_SECRET')
        if not self._current_secret:
            raise ValueError("JWT_SECRET environment variable is required")

        if len(self._current_secret) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters long")

        # Load previous secrets (comma-separated)
        self._previous_secrets: List[str] = []
        if previous_secrets is not None:
            self._previous_secrets = previous_secrets
        else:
            previous_env = os.getenv('JWT_SECRET_PREVIOUS', '')
            if previous_env:
                self._previous_secrets = [
                    s.strip() for s in previous_env.split(',') if s.strip()
                ]

        # Validate all previous secrets
        for secret in self._previous_secrets:
            if len(secret) < 32:
                logger.warning(
                    f"Previous secret too short (< 32 chars), ignoring: {secret[:8]}..."
                )
                self._previous_secrets.remove(secret)

        # Load rotation date
        self._rotation_date: Optional[datetime] = None
        if rotation_date:
            try:
                self._rotation_date = datetime.fromisoformat(rotation_date)
            except ValueError as e:
                logger.error(f"Invalid rotation date format: {e}")
        else:
            rotation_env = os.getenv('JWT_SECRET_ROTATION_DATE')
            if rotation_env:
                try:
                    self._rotation_date = datetime.fromisoformat(rotation_env)
                except ValueError as e:
                    logger.error(f"Invalid JWT_SECRET_ROTATION_DATE format: {e}")

        # Configuration
        self._token_expiry_seconds = token_expiry_seconds
        self._grace_period_seconds = grace_period_seconds

        # Total time before old secrets can be removed
        self._secret_lifetime_seconds = token_expiry_seconds + grace_period_seconds

        logger.info(
            f"JWT Secret Manager initialized: "
            f"current_secret={self._current_secret[:8]}..., "
            f"previous_secrets_count={len(self._previous_secrets)}, "
            f"rotation_date={self._rotation_date.isoformat() if self._rotation_date else 'never'}"
        )

        # Auto-cleanup expired secrets
        self._cleanup_expired_secrets()

    def get_current_secret(self) -> str:
        """
        Get current secret for signing new tokens.

        Returns:
            Current JWT secret
        """
        return self._current_secret

    def get_all_valid_secrets(self) -> List[str]:
        """
        Get all valid secrets (current + previous) for token validation.

        This allows tokens signed with old secrets to remain valid
        during the rotation grace period.

        Returns:
            List of valid secrets (current first, then previous)
        """
        return [self._current_secret] + self._previous_secrets

    def validate_with_rotation(self, token: str, jwt_decode_func) -> Optional[Dict[str, Any]]:
        """
        Validate JWT token trying all valid secrets (current + previous).

        This enables zero-downtime rotation by accepting tokens signed
        with either the current or any previous secret.

        Args:
            token: JWT token string
            jwt_decode_func: Function to decode JWT (e.g., jwt.decode)
                             Must accept (token, secret, algorithms) parameters

        Returns:
            Decoded payload if valid, None otherwise
        """
        all_secrets = self.get_all_valid_secrets()

        for idx, secret in enumerate(all_secrets):
            try:
                # Try to decode with this secret
                payload = jwt_decode_func(token, secret)

                if idx > 0:
                    # Token was signed with previous secret
                    logger.info(
                        f"Token validated with previous secret #{idx}: "
                        f"secret={secret[:8]}..."
                    )

                return payload

            except Exception as e:
                # This secret didn't work, try next
                logger.debug(f"Secret #{idx} failed: {e}")
                continue

        # No secret worked
        logger.warning("Token validation failed with all secrets")
        return None

    def _cleanup_expired_secrets(self) -> int:
        """
        Remove expired secrets from previous_secrets list.

        A secret is expired if:
        - Rotation date + secret_lifetime has passed
        - This ensures all tokens signed with that secret have expired

        Returns:
            Number of secrets removed
        """
        if not self._rotation_date:
            # No rotation date, can't determine expiry
            return 0

        now = datetime.utcnow()
        expiry_threshold = self._rotation_date + timedelta(seconds=self._secret_lifetime_seconds)

        if now < expiry_threshold:
            # Secrets not yet expired
            logger.debug(
                f"Secrets still valid until {expiry_threshold.isoformat()} "
                f"(in {int((expiry_threshold - now).total_seconds())}s)"
            )
            return 0

        # All previous secrets have expired, safe to remove
        removed_count = len(self._previous_secrets)
        if removed_count > 0:
            logger.warning(
                f"Removing {removed_count} expired secrets. "
                f"Rotation date: {self._rotation_date.isoformat()}, "
                f"Expiry threshold: {expiry_threshold.isoformat()}"
            )
            self._previous_secrets = []

        return removed_count

    def get_rotation_status(self) -> Dict[str, Any]:
        """
        Get comprehensive rotation status.

        Returns:
            Dictionary with rotation status information
        """
        now = datetime.utcnow()

        status = {
            "current_secret_preview": f"{self._current_secret[:8]}...",
            "previous_secrets_count": len(self._previous_secrets),
            "rotation_date": self._rotation_date.isoformat() if self._rotation_date else None,
            "token_expiry_seconds": self._token_expiry_seconds,
            "grace_period_seconds": self._grace_period_seconds,
            "secret_lifetime_seconds": self._secret_lifetime_seconds,
        }

        if self._rotation_date:
            expiry_threshold = self._rotation_date + timedelta(seconds=self._secret_lifetime_seconds)
            status["previous_secrets_expire_at"] = expiry_threshold.isoformat()
            status["seconds_until_expiry"] = int((expiry_threshold - now).total_seconds())
            status["can_remove_previous_secrets"] = now >= expiry_threshold

        # List previous secrets (preview only)
        if self._previous_secrets:
            status["previous_secrets_preview"] = [
                f"{s[:8]}..." for s in self._previous_secrets
            ]

        return status

    def get_rotation_instructions(self) -> str:
        """
        Get step-by-step rotation instructions.

        Returns:
            Multi-line string with rotation instructions
        """
        return """
JWT Secret Rotation Instructions (Zero Downtime):

1. Generate new secret:
   openssl rand -hex 32

2. Update environment variables:
   - Move current JWT_SECRET value to JWT_SECRET_PREVIOUS
   - Set new value for JWT_SECRET
   - Set JWT_SECRET_ROTATION_DATE to current date (YYYY-MM-DD)

   Example:
   JWT_SECRET=new_secret_generated_above
   JWT_SECRET_PREVIOUS=old_secret_1,old_secret_2
   JWT_SECRET_ROTATION_DATE=2025-10-13

3. Deploy with zero downtime:
   - Rolling restart (one instance at a time)
   - Health checks ensure each instance accepts traffic before next restart
   - Both old and new tokens work during deployment

4. Monitor rotation:
   - Check /api/auth/security/stats endpoint
   - Verify "previous_secrets_count" increases
   - Verify "rotation_date" is updated

5. Cleanup after expiry:
   - Wait for JWT_EXPIRY_SECONDS + grace period (default: 65 minutes)
   - Remove oldest secret from JWT_SECRET_PREVIOUS
   - Redeploy (optional - cleanup happens automatically)

6. Security audit:
   - Document rotation in security log
   - Update incident response if compromised
   - Review access logs during rotation window
        """.strip()

    def health_check(self) -> Dict[str, Any]:
        """
        Perform health check on secret manager.

        Returns:
            Dictionary with health status
        """
        health = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "current_secret_configured": bool(self._current_secret),
            "current_secret_length": len(self._current_secret) if self._current_secret else 0,
            "previous_secrets_count": len(self._previous_secrets),
        }

        # Check for issues
        issues = []

        if not self._current_secret:
            health["status"] = "unhealthy"
            issues.append("Current secret not configured")

        if len(self._current_secret) < 32:
            health["status"] = "degraded"
            issues.append("Current secret too short (< 32 chars)")

        if len(self._previous_secrets) > 5:
            health["status"] = "degraded"
            issues.append(
                f"Too many previous secrets ({len(self._previous_secrets)}). "
                f"Consider cleanup."
            )

        if issues:
            health["issues"] = issues

        return health


# Singleton instance
_secret_manager: Optional[JWTSecretManager] = None


def get_secret_manager(
    token_expiry_seconds: int = 3600,
    grace_period_seconds: int = 3600
) -> JWTSecretManager:
    """
    Get singleton JWT secret manager instance.

    Args:
        token_expiry_seconds: Token expiry time (for automatic cleanup)
        grace_period_seconds: Grace period after expiry

    Returns:
        JWTSecretManager instance
    """
    global _secret_manager
    if _secret_manager is None:
        _secret_manager = JWTSecretManager(
            token_expiry_seconds=token_expiry_seconds,
            grace_period_seconds=grace_period_seconds
        )
    return _secret_manager


def reset_secret_manager() -> None:
    """
    Reset singleton instance (for testing or reload).
    """
    global _secret_manager
    _secret_manager = None
