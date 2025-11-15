"""
Authentication and authorization for ERC-8004 API
API key-based authentication with tier management
"""

from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from config.database_pool import get_db
import logging
import hashlib

logger = logging.getLogger(__name__)

security = HTTPBearer()


def hash_api_key(api_key: str) -> str:
    """
    Hash API key using SHA256

    Args:
        api_key: Plain text API key

    Returns:
        Hex-encoded SHA256 hash
    """
    return hashlib.sha256(api_key.encode()).hexdigest()


class AuthenticatedUser:
    """
    Authenticated user context

    Contains user metadata and permissions for API access.
    """

    def __init__(self, user_id: str, tier: str, api_key: str, wallet_address: Optional[str] = None):
        self.user_id = user_id
        self.tier = tier
        self.api_key = api_key
        self.wallet_address = wallet_address
        self.is_authenticated = True

    def has_tier(self, required_tier: str) -> bool:
        """
        Check if user has required tier

        Tier hierarchy: free < pro < enterprise
        """
        tier_hierarchy = ["free", "pro", "enterprise"]
        try:
            user_tier_index = tier_hierarchy.index(self.tier.lower())
            required_tier_index = tier_hierarchy.index(required_tier.lower())
            return user_tier_index >= required_tier_index
        except ValueError:
            return False


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> AuthenticatedUser:
    """
    Verify API key and return authenticated user

    Args:
        credentials: HTTP Bearer token (API key)

    Returns:
        AuthenticatedUser with user context

    Raises:
        HTTPException: 401 if API key is invalid or inactive
    """
    api_key = credentials.credentials

    db = await get_db()

    try:
        key_hash = hash_api_key(api_key)
        async with db.acquire() as conn:
            user = await conn.fetchrow("""
                SELECT u.id, u.tier, k.key_hash, u.wallet_address
                FROM api_keys k
                JOIN users u ON k.user_id::uuid = u.id
                WHERE k.key_hash = $1 AND k.is_active = TRUE
            """, key_hash)

        if not user:
            logger.warning(f"Invalid API key attempt: {api_key[:8]}...")
            raise HTTPException(
                status_code=401,
                detail="Invalid or inactive API key",
                headers={"WWW-Authenticate": "Bearer"}
            )

        logger.info(f"User authenticated: {user['id']}")

        return AuthenticatedUser(
            user_id=str(user['id']),
            tier=user['tier'],
            api_key=user['key_hash'],
            wallet_address=user.get('wallet_address')
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Authentication service error"
        )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = None
) -> Optional[AuthenticatedUser]:
    """
    Optional authentication

    Returns authenticated user if credentials provided, None otherwise.
    Useful for endpoints that work both authenticated and unauthenticated.

    Args:
        credentials: Optional HTTP Bearer token

    Returns:
        AuthenticatedUser if credentials provided and valid, None otherwise
    """
    if not credentials:
        return None

    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


def require_tier(required_tier: str):
    """
    Dependency for requiring specific tier

    Usage:
        @router.post("/premium-feature")
        async def premium_feature(
            user: AuthenticatedUser = Depends(require_tier("pro"))
        ):
            ...
    """
    async def tier_checker(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        if not user.has_tier(required_tier):
            raise HTTPException(
                status_code=403,
                detail=f"This endpoint requires {required_tier} tier or higher"
            )
        return user
    return tier_checker


async def verify_wallet_ownership(
    user: AuthenticatedUser,
    wallet_address: str
) -> bool:
    """
    Verify user owns a wallet address

    Args:
        user: Authenticated user
        wallet_address: Wallet address to verify

    Returns:
        True if user owns wallet, False otherwise
    """
    if not user.wallet_address:
        return False

    return user.wallet_address.lower() == wallet_address.lower()
