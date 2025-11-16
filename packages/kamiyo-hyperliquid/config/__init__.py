"""
Configuration module for Hyperliquid monitoring system
"""

from .hyperliquid import (
    HyperliquidConfig,
    HLP_VAULT_ADDRESS,
    HYPERLIQUID_API,
    HYPERLIQUID_WS
)

__all__ = [
    'HyperliquidConfig',
    'HLP_VAULT_ADDRESS',
    'HYPERLIQUID_API',
    'HYPERLIQUID_WS'
]
