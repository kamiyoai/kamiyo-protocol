"""
MCP Authentication
Authentication and subscription management for MCP server
"""

from mcp.auth.jwt_handler import (
    create_mcp_token,
    verify_mcp_token,
    check_subscription_active,
    get_token_hash,
    has_tier_access,
    compare_tiers,
    TokenExpiredError,
    TokenInvalidError,
    SubscriptionInactiveError,
    MCPTokenError
)

from mcp.auth.subscription import (
    subscription_required,
    SubscriptionRequired,
    get_tier_info,
    validate_context,
    InsufficientTierError,
    SubscriptionError
)

__all__ = [
    # JWT Handler
    "create_mcp_token",
    "verify_mcp_token",
    "check_subscription_active",
    "get_token_hash",
    "has_tier_access",
    "compare_tiers",
    "TokenExpiredError",
    "TokenInvalidError",
    "SubscriptionInactiveError",
    "MCPTokenError",
    # Subscription Middleware
    "subscription_required",
    "SubscriptionRequired",
    "get_tier_info",
    "validate_context",
    "InsufficientTierError",
    "SubscriptionError"
]
