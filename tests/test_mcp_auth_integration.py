#!/usr/bin/env python3
"""
MCP Authentication Integration Tests

Tests the complete MCP authentication flow:
1. JWT token generation
2. Token verification
3. Subscription checking
4. Tier-based access control
5. Database operations

Run with: python -m pytest tests/test_mcp_auth_integration.py -v
"""

import os
import sys
import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mcp.auth.jwt_handler import (
    create_mcp_token,
    verify_mcp_token,
    get_token_hash,
    has_tier_access,
    compare_tiers,
    TokenExpiredError,
    TokenInvalidError,
    SubscriptionInactiveError
)

from mcp.auth.subscription import (
    subscription_required,
    get_tier_info,
    validate_context,
    InsufficientTierError
)


# ==========================================
# FIXTURES
# ==========================================

@pytest.fixture
def mock_config():
    """Mock MCP configuration"""
    with patch('mcp.auth.jwt_handler.get_mcp_config') as mock:
        mock_cfg = Mock()
        mock_cfg.jwt_secret = "test_secret_key_for_testing_only_32chars"
        mock_cfg.jwt_algorithm = "HS256"
        mock_cfg.stripe_secret_key = None  # Skip Stripe validation in tests
        mock_cfg.is_production = False
        mock.return_value = mock_cfg
        yield mock_cfg


@pytest.fixture
def test_user():
    """Test user data"""
    return {
        "user_id": "test_user_123",
        "tier": "team",
        "subscription_id": "sub_test_abc123"
    }


@pytest.fixture
def test_token(mock_config, test_user):
    """Generate a test token"""
    return create_mcp_token(
        user_id=test_user["user_id"],
        tier=test_user["tier"],
        subscription_id=test_user["subscription_id"],
        expires_days=365
    )


# ==========================================
# JWT TOKEN TESTS
# ==========================================

class TestJWTTokenGeneration:
    """Test JWT token creation"""

    def test_create_token_success(self, mock_config, test_user):
        """Test successful token creation"""
        token = create_mcp_token(
            user_id=test_user["user_id"],
            tier=test_user["tier"],
            subscription_id=test_user["subscription_id"]
        )

        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 100  # JWT tokens are typically long

    def test_token_contains_required_fields(self, mock_config, test_token):
        """Test that token contains all required fields"""
        # Verify without subscription check
        with patch('mcp.auth.jwt_handler.check_subscription_active', return_value=True):
            payload = verify_mcp_token(test_token, check_subscription=False)

        assert payload is not None
        assert "user_id" in payload
        assert "tier" in payload
        assert "subscription_id" in payload
        assert "issued_at" in payload
        assert "expires_at" in payload

    def test_token_hash_generation(self, test_token):
        """Test token hash for database storage"""
        token_hash = get_token_hash(test_token)

        assert token_hash is not None
        assert len(token_hash) == 64  # SHA-256 hex digest
        assert token_hash.isalnum()

    def test_different_tokens_different_hashes(self, mock_config, test_user):
        """Test that different tokens produce different hashes"""
        token1 = create_mcp_token(
            user_id=test_user["user_id"],
            tier="personal",
            subscription_id="sub_1"
        )
        token2 = create_mcp_token(
            user_id=test_user["user_id"],
            tier="team",
            subscription_id="sub_2"
        )

        hash1 = get_token_hash(token1)
        hash2 = get_token_hash(token2)

        assert hash1 != hash2


class TestJWTTokenVerification:
    """Test JWT token verification"""

    def test_verify_valid_token(self, mock_config, test_token, test_user):
        """Test verification of valid token"""
        with patch('mcp.auth.jwt_handler.check_subscription_active', return_value=True):
            payload = verify_mcp_token(test_token, check_subscription=False)

        assert payload["user_id"] == test_user["user_id"]
        assert payload["tier"] == test_user["tier"]
        assert payload["subscription_id"] == test_user["subscription_id"]

    def test_verify_invalid_token(self, mock_config):
        """Test verification fails for invalid token"""
        invalid_token = "invalid.token.here"

        with pytest.raises(TokenInvalidError):
            verify_mcp_token(invalid_token, check_subscription=False)

    def test_verify_expired_token(self, mock_config, test_user):
        """Test verification fails for expired token"""
        # Create token with -1 day expiration (already expired)
        token = create_mcp_token(
            user_id=test_user["user_id"],
            tier=test_user["tier"],
            subscription_id=test_user["subscription_id"],
            expires_days=-1
        )

        with pytest.raises(TokenExpiredError):
            verify_mcp_token(token, check_subscription=False)

    def test_verify_with_subscription_check(self, mock_config, test_token):
        """Test verification with subscription status check"""
        # Mock active subscription
        with patch('mcp.auth.jwt_handler.check_subscription_active', return_value=True):
            payload = verify_mcp_token(test_token, check_subscription=True)
            assert payload is not None

        # Mock inactive subscription
        with patch('mcp.auth.jwt_handler.check_subscription_active', return_value=False):
            with pytest.raises(SubscriptionInactiveError):
                verify_mcp_token(test_token, check_subscription=True)


# ==========================================
# TIER HIERARCHY TESTS
# ==========================================

class TestTierHierarchy:
    """Test tier comparison and access control"""

    def test_compare_tiers(self):
        """Test tier comparison function"""
        assert compare_tiers("enterprise", "team") > 0
        assert compare_tiers("team", "enterprise") < 0
        assert compare_tiers("personal", "personal") == 0
        assert compare_tiers("free", "enterprise") < 0

    def test_has_tier_access(self):
        """Test tier access checking"""
        # Enterprise has access to everything
        assert has_tier_access("enterprise", "free") is True
        assert has_tier_access("enterprise", "personal") is True
        assert has_tier_access("enterprise", "team") is True

        # Team has access to personal and below
        assert has_tier_access("team", "personal") is True
        assert has_tier_access("team", "team") is True
        assert has_tier_access("team", "enterprise") is False

        # Personal doesn't have access to team
        assert has_tier_access("personal", "team") is False
        assert has_tier_access("personal", "personal") is True

    def test_get_tier_info(self):
        """Test tier information retrieval"""
        info = get_tier_info("team")

        assert info["valid"] is True
        assert info["level"] == 2
        assert "features" in info
        assert len(info["features"]) > 0

    def test_get_invalid_tier_info(self):
        """Test tier info for invalid tier"""
        info = get_tier_info("invalid_tier")

        assert info["valid"] is False


# ==========================================
# SUBSCRIPTION MIDDLEWARE TESTS
# ==========================================

class TestSubscriptionMiddleware:
    """Test subscription decorator"""

    @pytest.mark.asyncio
    async def test_subscription_required_success(self):
        """Test decorator allows access with sufficient tier"""
        # Create mock context
        context = Mock()
        context.token_payload = {
            "user_id": "test_user",
            "tier": "team",
            "subscription_id": "sub_123"
        }

        # Decorate test function
        @subscription_required(min_tier="personal")
        async def test_function(ctx, subscription_tier: str):
            return {"tier": subscription_tier}

        # Should succeed - team >= personal
        result = await test_function(context)
        assert result["tier"] == "team"

    @pytest.mark.asyncio
    async def test_subscription_required_insufficient_tier(self):
        """Test decorator rejects access with insufficient tier"""
        context = Mock()
        context.token_payload = {
            "user_id": "test_user",
            "tier": "personal",
            "subscription_id": "sub_123"
        }

        @subscription_required(min_tier="enterprise")
        async def test_function(ctx, subscription_tier: str):
            return {"tier": subscription_tier}

        # Should fail - personal < enterprise
        with pytest.raises(InsufficientTierError) as exc_info:
            await test_function(context)

        assert "enterprise" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_subscription_required_no_context(self):
        """Test decorator fails without context"""
        @subscription_required(min_tier="personal")
        async def test_function(ctx, subscription_tier: str):
            return {"tier": subscription_tier}

        # Should fail - no context provided
        with pytest.raises(Exception):
            await test_function()

    def test_validate_context_valid(self):
        """Test context validation with valid context"""
        context = Mock()
        context.token_payload = {
            "user_id": "test_user",
            "tier": "team",
            "subscription_id": "sub_123"
        }

        payload = validate_context(context)
        assert payload is not None
        assert payload["user_id"] == "test_user"

    def test_validate_context_invalid(self):
        """Test context validation with invalid context"""
        # No token payload
        context = Mock()
        context.token_payload = None

        payload = validate_context(context)
        assert payload is None

        # Missing required fields
        context.token_payload = {
            "user_id": "test_user"
            # Missing tier and subscription_id
        }

        payload = validate_context(context)
        assert payload is None


# ==========================================
# INTEGRATION TESTS
# ==========================================

class TestMCPAuthIntegration:
    """End-to-end integration tests"""

    @pytest.mark.asyncio
    async def test_full_auth_flow(self, mock_config):
        """Test complete authentication flow"""
        # Step 1: Create token
        token = create_mcp_token(
            user_id="integration_test_user",
            tier="team",
            subscription_id="sub_integration_test",
            expires_days=365
        )
        assert token is not None

        # Step 2: Get token hash (for database storage)
        token_hash = get_token_hash(token)
        assert len(token_hash) == 64

        # Step 3: Verify token
        with patch('mcp.auth.jwt_handler.check_subscription_active', return_value=True):
            payload = verify_mcp_token(token, check_subscription=False)

        assert payload["user_id"] == "integration_test_user"
        assert payload["tier"] == "team"

        # Step 4: Use token in protected function
        context = Mock()
        context.token_payload = payload

        @subscription_required(min_tier="personal")
        async def protected_function(ctx, subscription_tier: str):
            return {"success": True, "tier": subscription_tier}

        result = await protected_function(context)
        assert result["success"] is True
        assert result["tier"] == "team"

    def test_token_lifecycle(self, mock_config):
        """Test token from creation to expiration"""
        # Create token
        token = create_mcp_token(
            user_id="lifecycle_test",
            tier="personal",
            subscription_id="sub_lifecycle",
            expires_days=1  # 1 day expiration
        )

        # Verify valid token
        with patch('mcp.auth.jwt_handler.check_subscription_active', return_value=True):
            payload = verify_mcp_token(token, check_subscription=False)
            assert payload is not None

            # Check expiration is approximately 1 day from now
            expires_at = datetime.fromtimestamp(payload["expires_at"])
            expected_expiry = datetime.utcnow() + timedelta(days=1)
            time_diff = abs((expires_at - expected_expiry).total_seconds())
            assert time_diff < 60  # Within 1 minute


# ==========================================
# RUN TESTS
# ==========================================

if __name__ == "__main__":
    print("\n" + "="*70)
    print("MCP AUTHENTICATION INTEGRATION TESTS")
    print("="*70 + "\n")

    # Run pytest
    pytest.main([
        __file__,
        "-v",
        "--tb=short",
        "-s"
    ])
