"""
MCP JWT Token Handler

Manages JWT tokens for MCP (Model Context Protocol) authentication.
Tokens are long-lived (1 year) and tied to Stripe subscriptions.

Security Features:
- HS256 algorithm for token signing
- Token hash stored in database (not raw token)
- Subscription validation on each verification
- Token expiration checking
- Tier-based access control
"""

import hashlib
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

import jwt
import stripe
from mcp.config import get_mcp_config

logger = logging.getLogger(__name__)

# Token version for migration support
TOKEN_VERSION = "1"


class MCPTokenError(Exception):
    """Base exception for MCP token errors"""
    pass


class TokenExpiredError(MCPTokenError):
    """Token has expired"""
    pass


class TokenInvalidError(MCPTokenError):
    """Token is invalid"""
    pass


class SubscriptionInactiveError(MCPTokenError):
    """Subscription is not active"""
    pass


def _hash_token(token: str) -> str:
    """
    Create SHA-256 hash of token for database storage

    Args:
        token: Raw JWT token

    Returns:
        Hex-encoded hash of token
    """
    return hashlib.sha256(token.encode()).hexdigest()


def create_mcp_token(
    user_id: str,
    tier: str,
    subscription_id: str,
    expires_days: int = 365
) -> str:
    """
    Generate long-lived JWT token for MCP access

    Args:
        user_id: User ID from database
        tier: Subscription tier (personal/team/enterprise)
        subscription_id: Stripe subscription ID
        expires_days: Token expiration in days (default: 365)

    Returns:
        JWT token string

    Example:
        >>> token = create_mcp_token(
        ...     user_id="user_123",
        ...     tier="team",
        ...     subscription_id="sub_abc123",
        ...     expires_days=365
        ... )
    """
    config = get_mcp_config()

    # Calculate expiration
    now = datetime.utcnow()
    expiration = now + timedelta(days=expires_days)

    # Create JWT payload
    payload = {
        "sub": user_id,  # Subject (user ID)
        "tier": tier.lower(),  # Subscription tier
        "subscription_id": subscription_id,  # Stripe subscription ID
        "iat": int(now.timestamp()),  # Issued at
        "exp": int(expiration.timestamp()),  # Expiration
        "version": TOKEN_VERSION,  # Token version
        "type": "mcp_access"  # Token type
    }

    # Sign token
    token = jwt.encode(
        payload,
        config.jwt_secret,
        algorithm=config.jwt_algorithm
    )

    logger.info(
        f"Created MCP token for user {user_id}, tier {tier}, expires {expiration.isoformat()}"
    )

    return token


def verify_mcp_token(token: str, check_subscription: bool = True) -> Optional[Dict[str, Any]]:
    """
    Verify JWT token and return payload

    Args:
        token: JWT token string
        check_subscription: Whether to validate subscription status with Stripe

    Returns:
        Dictionary with user_id, tier, subscription_id, exp if valid
        None if invalid

    Raises:
        TokenExpiredError: If token has expired
        TokenInvalidError: If token is malformed or signature invalid
        SubscriptionInactiveError: If subscription is no longer active

    Example:
        >>> try:
        ...     payload = verify_mcp_token(token)
        ...     user_id = payload["user_id"]
        ...     tier = payload["tier"]
        ... except TokenExpiredError:
        ...     print("Token expired, please renew")
        ... except TokenInvalidError:
        ...     print("Invalid token")
    """
    config = get_mcp_config()

    try:
        # Decode and verify token
        payload = jwt.decode(
            token,
            config.jwt_secret,
            algorithms=[config.jwt_algorithm],
            options={
                "require_exp": True,
                "require_iat": True,
                "require_sub": True
            }
        )

        # Validate token type
        if payload.get("type") != "mcp_access":
            logger.warning(f"Invalid token type: {payload.get('type')}")
            raise TokenInvalidError("Invalid token type")

        # Check if subscription is still active (if requested)
        if check_subscription:
            subscription_id = payload.get("subscription_id")
            if not subscription_id:
                logger.warning("Token missing subscription_id")
                raise TokenInvalidError("Token missing subscription_id")

            # Validate subscription status
            is_active = check_subscription_active(subscription_id)
            if not is_active:
                logger.warning(f"Subscription {subscription_id} is not active")
                raise SubscriptionInactiveError(
                    f"Subscription {subscription_id} is no longer active"
                )

        # Return structured payload
        return {
            "user_id": payload.get("sub"),
            "tier": payload.get("tier"),
            "subscription_id": payload.get("subscription_id"),
            "issued_at": payload.get("iat"),
            "expires_at": payload.get("exp"),
            "version": payload.get("version", "1")
        }

    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        raise TokenExpiredError("Token has expired")

    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        raise TokenInvalidError(f"Invalid token: {str(e)}")

    except Exception as e:
        logger.error(f"Error verifying token: {e}")
        raise TokenInvalidError(f"Error verifying token: {str(e)}")


def check_subscription_active(subscription_id: str) -> bool:
    """
    Check if Stripe subscription is still active

    Args:
        subscription_id: Stripe subscription ID

    Returns:
        True if subscription is active, False otherwise

    Note:
        Active statuses: 'active', 'trialing'
        Inactive statuses: 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'unpaid'
    """
    config = get_mcp_config()

    if not config.stripe_secret_key:
        logger.warning("Stripe not configured, skipping subscription check")
        return True  # Allow in development

    try:
        # Configure Stripe
        stripe.api_key = config.stripe_secret_key

        # Fetch subscription from Stripe
        subscription = stripe.Subscription.retrieve(subscription_id)

        # Check status
        status = subscription.get("status")
        is_active = status in ["active", "trialing"]

        if not is_active:
            logger.info(f"Subscription {subscription_id} status: {status} (inactive)")

        return is_active

    except stripe.error.InvalidRequestError as e:
        logger.error(f"Subscription {subscription_id} not found: {e}")
        return False

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error checking subscription: {e}")
        # On Stripe errors, fail open in development, closed in production
        return not config.is_production

    except Exception as e:
        logger.error(f"Error checking subscription status: {e}")
        return False


def get_token_hash(token: str) -> str:
    """
    Get hash of token for database storage

    Args:
        token: Raw JWT token

    Returns:
        SHA-256 hash of token (hex string)
    """
    return _hash_token(token)


def decode_token_without_verification(token: str) -> Optional[Dict[str, Any]]:
    """
    Decode token without verification (for debugging/inspection only)

    WARNING: Do not use for authentication! This does not verify the signature.

    Args:
        token: JWT token

    Returns:
        Decoded payload or None if invalid
    """
    try:
        payload = jwt.decode(
            token,
            options={"verify_signature": False}
        )
        return payload
    except Exception as e:
        logger.error(f"Error decoding token: {e}")
        return None


# Utility functions for tier checking

TIER_HIERARCHY = {
    "free": 0,
    "personal": 1,
    "team": 2,
    "enterprise": 3
}


def compare_tiers(tier1: str, tier2: str) -> int:
    """
    Compare two tiers

    Args:
        tier1: First tier name
        tier2: Second tier name

    Returns:
        -1 if tier1 < tier2
        0 if tier1 == tier2
        1 if tier1 > tier2
    """
    level1 = TIER_HIERARCHY.get(tier1.lower(), 0)
    level2 = TIER_HIERARCHY.get(tier2.lower(), 0)

    if level1 < level2:
        return -1
    elif level1 > level2:
        return 1
    else:
        return 0


def has_tier_access(user_tier: str, required_tier: str) -> bool:
    """
    Check if user's tier meets the required tier

    Args:
        user_tier: User's subscription tier
        required_tier: Minimum required tier

    Returns:
        True if user has access, False otherwise

    Example:
        >>> has_tier_access("enterprise", "team")  # True
        >>> has_tier_access("personal", "team")  # False
    """
    return compare_tiers(user_tier, required_tier) >= 0


# Test function
if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== MCP JWT Handler Test ===\n")

    # Create test token
    print("1. Creating test token...")
    token = create_mcp_token(
        user_id="test_user_123",
        tier="team",
        subscription_id="sub_test_abc",
        expires_days=365
    )
    print(f"   Token created (length: {len(token)} chars)")
    print(f"   Token hash: {get_token_hash(token)[:32]}...")

    # Decode without verification (for inspection)
    print("\n2. Decoding token (without verification)...")
    decoded = decode_token_without_verification(token)
    if decoded:
        print(f"   User ID: {decoded.get('sub')}")
        print(f"   Tier: {decoded.get('tier')}")
        print(f"   Subscription: {decoded.get('subscription_id')}")
        print(f"   Expires: {datetime.fromtimestamp(decoded.get('exp')).isoformat()}")

    # Verify token (skip subscription check for test)
    print("\n3. Verifying token (skip subscription check)...")
    try:
        payload = verify_mcp_token(token, check_subscription=False)
        print(f"   ✓ Token valid")
        print(f"   User ID: {payload['user_id']}")
        print(f"   Tier: {payload['tier']}")
    except Exception as e:
        print(f"   ✗ Verification failed: {e}")

    # Test tier comparison
    print("\n4. Testing tier hierarchy...")
    print(f"   enterprise >= team: {has_tier_access('enterprise', 'team')}")
    print(f"   personal >= team: {has_tier_access('personal', 'team')}")
    print(f"   team >= team: {has_tier_access('team', 'team')}")

    print("\n✓ JWT Handler ready")
