"""
MCP Subscription Middleware

Provides decorator for tier-based access control on MCP tools.
Integrates with JWT authentication to enforce subscription limits.

Usage:
    @subscription_required(min_tier="team")
    async def advanced_tool(context, subscription_tier: str):
        # Tool implementation
        # subscription_tier is automatically injected
        pass
"""

import logging
from functools import wraps
from typing import Callable, Any, Optional

from mcp.auth.jwt_handler import (
    has_tier_access,
    TIER_HIERARCHY,
    TokenExpiredError,
    TokenInvalidError,
    SubscriptionInactiveError
)

logger = logging.getLogger(__name__)


class SubscriptionError(Exception):
    """Base exception for subscription-related errors"""
    pass


class InsufficientTierError(SubscriptionError):
    """User's tier is insufficient for this resource"""
    pass


class SubscriptionRequired:
    """
    Decorator for tools requiring subscription tier validation

    Checks that the authenticated user has a subscription tier
    that meets the minimum required tier.

    Tier Hierarchy (lowest to highest):
    - free (tier 0)
    - personal (tier 1)
    - team (tier 2)
    - enterprise (tier 3)

    Args:
        min_tier: Minimum subscription tier required (default: "personal")

    Raises:
        InsufficientTierError: If user's tier is below minimum
        SubscriptionError: If subscription validation fails

    Example:
        @subscription_required(min_tier="team")
        async def team_only_tool(context, subscription_tier: str):
            # This tool requires team tier or higher
            print(f"User has {subscription_tier} access")
            return {"status": "success"}

        @subscription_required(min_tier="personal")
        async def paid_tier_tool(context, subscription_tier: str):
            # This tool requires any paid tier
            return {"status": "success"}
    """

    def __init__(self, min_tier: str = "personal"):
        """
        Initialize decorator

        Args:
            min_tier: Minimum tier required (personal/team/enterprise)
        """
        self.min_tier = min_tier.lower()

        # Validate tier name
        if self.min_tier not in TIER_HIERARCHY:
            raise ValueError(
                f"Invalid tier '{min_tier}'. "
                f"Must be one of: {', '.join(TIER_HIERARCHY.keys())}"
            )

        logger.debug(f"Subscription decorator initialized with min_tier={self.min_tier}")

    def __call__(self, func: Callable) -> Callable:
        """
        Decorator implementation

        Wraps the function to check subscription tier before execution.
        Injects 'subscription_tier' into function kwargs.

        Args:
            func: Function to decorate

        Returns:
            Wrapped function with subscription checking
        """

        @wraps(func)
        async def wrapper(*args, **kwargs):
            """
            Wrapper function that performs subscription validation

            Expects 'context' to be first argument or in kwargs.
            Context must have 'token_payload' attribute with tier information.
            """

            # Extract context (first arg or from kwargs)
            context = None
            if args:
                context = args[0]
            elif "context" in kwargs:
                context = kwargs["context"]

            if not context:
                logger.error("No context provided to subscription-protected function")
                raise SubscriptionError(
                    "Authentication context required for this operation"
                )

            # Extract subscription info from context
            token_payload = getattr(context, "token_payload", None)
            if not token_payload:
                logger.error("No token payload in context")
                raise SubscriptionError(
                    "Valid authentication token required for this operation"
                )

            # Get user's tier
            user_tier = token_payload.get("tier", "free")

            # Log access attempt
            user_id = token_payload.get("user_id", "unknown")
            logger.info(
                f"Subscription check: user={user_id}, "
                f"user_tier={user_tier}, required_tier={self.min_tier}"
            )

            # Check if user has sufficient tier
            if not has_tier_access(user_tier, self.min_tier):
                logger.warning(
                    f"Insufficient tier: user {user_id} has '{user_tier}', "
                    f"requires '{self.min_tier}'"
                )

                # Build helpful error message
                tier_names = sorted(TIER_HIERARCHY.keys(), key=lambda t: TIER_HIERARCHY[t])
                required_index = TIER_HIERARCHY[self.min_tier]
                available_tiers = [t for t in tier_names if TIER_HIERARCHY[t] >= required_index]

                raise InsufficientTierError(
                    f"This feature requires {self.min_tier} tier or higher. "
                    f"Your current tier: {user_tier}. "
                    f"Available tiers: {', '.join(available_tiers)}. "
                    f"Upgrade at https://kamiyo.io/pricing"
                )

            # Inject subscription_tier into kwargs
            kwargs["subscription_tier"] = user_tier

            # Log successful authorization
            logger.debug(
                f"Subscription authorized: user={user_id}, "
                f"tier={user_tier}, function={func.__name__}"
            )

            # Call the original function
            try:
                result = await func(*args, **kwargs)
                return result

            except Exception as e:
                logger.error(
                    f"Error executing {func.__name__}: {e}",
                    exc_info=True
                )
                raise

        # Preserve function metadata
        wrapper.__subscription_required__ = True
        wrapper.__min_tier__ = self.min_tier

        return wrapper


def subscription_required(min_tier: str = "personal") -> Callable:
    """
    Convenience function for decorator usage

    Args:
        min_tier: Minimum subscription tier required

    Returns:
        SubscriptionRequired decorator instance

    Example:
        @subscription_required(min_tier="team")
        async def my_tool(context, subscription_tier: str):
            pass
    """
    return SubscriptionRequired(min_tier=min_tier)


def get_tier_info(tier: str) -> dict:
    """
    Get information about a subscription tier

    Args:
        tier: Tier name

    Returns:
        Dictionary with tier metadata

    Example:
        >>> info = get_tier_info("team")
        >>> print(info["level"])
        2
    """
    tier_lower = tier.lower()

    if tier_lower not in TIER_HIERARCHY:
        return {
            "name": tier,
            "level": 0,
            "valid": False
        }

    level = TIER_HIERARCHY[tier_lower]

    # Define tier features
    features = {
        "free": {
            "name": "Free",
            "level": 0,
            "description": "Basic access to public exploit data",
            "features": [
                "View recent exploits",
                "Basic search",
                "Public API access"
            ]
        },
        "personal": {
            "name": "Personal",
            "level": 1,
            "description": "Enhanced features for individual users",
            "features": [
                "All Free features",
                "Real-time alerts",
                "Advanced search",
                "Historical data (90 days)",
                "API rate limits: 30 rpm"
            ]
        },
        "team": {
            "name": "Team",
            "level": 2,
            "description": "Collaboration features for teams",
            "features": [
                "All Personal features",
                "Team collaboration",
                "Wallet monitoring",
                "Advanced analytics",
                "Historical data (1 year)",
                "API rate limits: 100 rpm"
            ]
        },
        "enterprise": {
            "name": "Enterprise",
            "level": 3,
            "description": "Full-featured enterprise solution",
            "features": [
                "All Team features",
                "Custom integrations",
                "Dedicated support",
                "SLA guarantees",
                "Unlimited historical data",
                "API rate limits: 500 rpm",
                "White-label options"
            ]
        }
    }

    return {
        **features.get(tier_lower, {}),
        "valid": True
    }


def validate_context(context) -> Optional[dict]:
    """
    Validate that context has required authentication information

    Args:
        context: Tool context object

    Returns:
        Token payload if valid, None otherwise
    """
    if not context:
        return None

    token_payload = getattr(context, "token_payload", None)
    if not token_payload:
        return None

    # Check required fields
    required_fields = ["user_id", "tier", "subscription_id"]
    for field in required_fields:
        if field not in token_payload:
            logger.warning(f"Token payload missing required field: {field}")
            return None

    return token_payload


# Test function
if __name__ == "__main__":
    import asyncio
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== MCP Subscription Middleware Test ===\n")

    # Mock context class
    class MockContext:
        def __init__(self, tier: str):
            self.token_payload = {
                "user_id": "test_user_123",
                "tier": tier,
                "subscription_id": "sub_test_abc"
            }

    # Test function with subscription requirement
    @subscription_required(min_tier="team")
    async def team_tool(context, subscription_tier: str):
        """Test tool requiring team tier"""
        return {
            "status": "success",
            "tier": subscription_tier,
            "message": f"Access granted with {subscription_tier} tier"
        }

    @subscription_required(min_tier="personal")
    async def personal_tool(context, subscription_tier: str):
        """Test tool requiring personal tier"""
        return {
            "status": "success",
            "tier": subscription_tier
        }

    async def run_tests():
        print("1. Testing tier hierarchy...")
        for tier in ["free", "personal", "team", "enterprise"]:
            info = get_tier_info(tier)
            print(f"   {tier}: level {info['level']}, features: {len(info.get('features', []))}")

        print("\n2. Testing team tool with team tier (should succeed)...")
        try:
            context = MockContext("team")
            result = await team_tool(context)
            print(f"   ✓ Success: {result['message']}")
        except Exception as e:
            print(f"   ✗ Failed: {e}")

        print("\n3. Testing team tool with personal tier (should fail)...")
        try:
            context = MockContext("personal")
            result = await team_tool(context)
            print(f"   ✗ Should have failed but got: {result}")
        except InsufficientTierError as e:
            print(f"   ✓ Correctly rejected: {str(e)[:100]}...")

        print("\n4. Testing personal tool with enterprise tier (should succeed)...")
        try:
            context = MockContext("enterprise")
            result = await personal_tool(context)
            print(f"   ✓ Success with tier: {result['tier']}")
        except Exception as e:
            print(f"   ✗ Failed: {e}")

        print("\n5. Testing context validation...")
        valid_context = MockContext("team")
        payload = validate_context(valid_context)
        if payload:
            print(f"   ✓ Valid context: user={payload['user_id']}, tier={payload['tier']}")
        else:
            print(f"   ✗ Context validation failed")

    # Run async tests
    asyncio.run(run_tests())

    print("\n✓ Subscription Middleware ready")
