"""
API Authentication Module
Optional API key authentication for production deployments
"""

import os
import secrets
import hashlib
import logging
from typing import Optional, List
from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader, APIKeyQuery
from fastapi.security.api_key import APIKey

logger = logging.getLogger(__name__)

# API Key Configuration
API_KEY_ENABLED = os.getenv("API_KEY_ENABLED", "false").lower() == "true"
API_KEYS_ENV = os.getenv("API_KEYS", "")  # Comma-separated list of API keys
API_KEY_HASH_SALT = os.getenv("API_KEY_HASH_SALT", "kamiyo-hyperliquid-salt")

# Parse API keys from environment
VALID_API_KEYS: List[str] = []
if API_KEYS_ENV:
    VALID_API_KEYS = [key.strip() for key in API_KEYS_ENV.split(",") if key.strip()]

# Security schemes
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
api_key_query = APIKeyQuery(name="api_key", auto_error=False)


def hash_api_key(api_key: str) -> str:
    """
    Hash an API key for secure comparison

    Args:
        api_key: The API key to hash

    Returns:
        Hashed API key
    """
    combined = f"{api_key}{API_KEY_HASH_SALT}"
    return hashlib.sha256(combined.encode()).hexdigest()


def generate_api_key() -> str:
    """
    Generate a new secure API key

    Returns:
        A new API key string
    """
    return secrets.token_urlsafe(32)


def validate_api_key(api_key: str) -> bool:
    """
    Validate an API key against the list of valid keys

    Args:
        api_key: The API key to validate

    Returns:
        True if valid, False otherwise
    """
    if not API_KEY_ENABLED:
        return True  # Authentication disabled

    if not VALID_API_KEYS:
        logger.warning("API_KEY_ENABLED is true but no API_KEYS configured - allowing all requests")
        return True  # No keys configured, allow all

    # Check if key is in the valid keys list
    return api_key in VALID_API_KEYS


async def get_api_key(
    api_key_header: str = Security(api_key_header),
    api_key_query: str = Security(api_key_query)
) -> Optional[str]:
    """
    Dependency for validating API keys from header or query parameter

    Checks for API key in:
    1. X-API-Key header
    2. api_key query parameter

    Args:
        api_key_header: API key from header
        api_key_query: API key from query parameter

    Returns:
        The validated API key

    Raises:
        HTTPException: If authentication is enabled and key is invalid
    """
    # If authentication is disabled, allow all requests
    if not API_KEY_ENABLED:
        return None

    # Try header first, then query parameter
    api_key = api_key_header or api_key_query

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Provide via X-API-Key header or api_key query parameter"
        )

    if not validate_api_key(api_key):
        logger.warning(f"Invalid API key attempt: {api_key[:8]}...")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid API key"
        )

    return api_key


def require_api_key(api_key: APIKey = Security(get_api_key)) -> str:
    """
    Dependency that requires a valid API key
    Use this as a dependency on protected endpoints

    Args:
        api_key: The API key (automatically validated by get_api_key)

    Returns:
        The validated API key
    """
    return api_key


class AuthenticationStatus:
    """Helper class for authentication status"""

    @staticmethod
    def is_enabled() -> bool:
        """Check if authentication is enabled"""
        return API_KEY_ENABLED

    @staticmethod
    def has_keys_configured() -> bool:
        """Check if any API keys are configured"""
        return len(VALID_API_KEYS) > 0

    @staticmethod
    def get_status() -> dict:
        """Get authentication status information"""
        return {
            "enabled": API_KEY_ENABLED,
            "keys_configured": len(VALID_API_KEYS),
            "authentication_methods": ["header", "query"] if API_KEY_ENABLED else []
        }


# Log authentication status on module load
if API_KEY_ENABLED:
    if VALID_API_KEYS:
        logger.info(f"API key authentication ENABLED with {len(VALID_API_KEYS)} configured key(s)")
    else:
        logger.warning("API key authentication ENABLED but no keys configured - all requests will be allowed")
else:
    logger.info("API key authentication DISABLED - all endpoints are public")


def generate_new_keys(count: int = 1) -> List[str]:
    """
    Generate new API keys for distribution

    Args:
        count: Number of keys to generate

    Returns:
        List of newly generated API keys
    """
    return [generate_api_key() for _ in range(count)]


if __name__ == "__main__":
    # CLI utility for generating API keys
    print("KAMIYO Hyperliquid API Key Generator")
    print("=" * 50)
    print()
    print("Generated API Keys (add to .env as API_KEYS):")
    print()

    keys = generate_new_keys(3)
    for i, key in enumerate(keys, 1):
        print(f"Key {i}: {key}")

    print()
    print("Example .env configuration:")
    print(f'API_KEY_ENABLED=true')
    print(f'API_KEYS="{",".join(keys)}"')
    print()
    print("Users can authenticate by adding one of:")
    print("  - Header: X-API-Key: <key>")
    print("  - Query: ?api_key=<key>")
