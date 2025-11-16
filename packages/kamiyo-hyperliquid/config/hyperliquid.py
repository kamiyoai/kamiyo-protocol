"""
Hyperliquid Protocol Configuration

Official addresses and configuration for Hyperliquid monitoring.
"""

import os
from typing import List


class HyperliquidConfig:
    """
    Official Hyperliquid protocol addresses and configuration

    Note: These addresses should be verified against official Hyperliquid
    documentation at: https://hyperliquid.gitbook.io/hyperliquid-docs
    """

    # Main HLP (Hyperliquidity Provider) vault address
    # This is the primary protocol vault that does market making and liquidations
    # Reference: https://app.hyperliquid.xyz/vaults
    HLP_MAIN_VAULT = os.getenv(
        'HLP_VAULT_ADDRESS',
        '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303'
    )

    # HLP sub-vaults (community-reported addresses)
    HLP_STRATEGY_A = '0x010461c14e146ac35fe42271bdc1134ee31c703a'
    HLP_STRATEGY_B = '0x31ca8395cf837de08b24da3f660e77761dfb974b'
    HLP_LIQUIDATOR = '0x2e3d94f0562703b25c83308a05046ddaf9a8dd14'

    # API endpoints
    API_URL = "https://api.hyperliquid.xyz/info"
    WEBSOCKET_URL = "wss://api.hyperliquid.xyz/ws"
    APP_URL = "https://app.hyperliquid.xyz"

    @classmethod
    def get_monitored_addresses(cls) -> List[str]:
        """
        Get list of all addresses to monitor

        Returns:
            List of Ethereum addresses to monitor for security events
        """
        addresses = [cls.HLP_MAIN_VAULT]

        # Add additional addresses from environment variable
        env_addresses = os.getenv('MONITORED_ADDRESSES', '')
        if env_addresses:
            additional = [addr.strip() for addr in env_addresses.split(',') if addr.strip()]
            addresses.extend(additional)

        return addresses

    @classmethod
    def get_vault_url(cls, vault_address: str = None) -> str:
        """
        Get Hyperliquid app URL for a vault

        Args:
            vault_address: Vault address (defaults to main HLP vault)

        Returns:
            Full URL to vault on Hyperliquid app
        """
        address = vault_address or cls.HLP_MAIN_VAULT
        return f"{cls.APP_URL}/vaults/{address}"

    @classmethod
    def validate_address(cls, address: str) -> bool:
        """
        Validate Ethereum address format

        Args:
            address: Address to validate

        Returns:
            True if valid Ethereum address format
        """
        if not address:
            return False

        # Basic validation: starts with 0x, 42 chars total
        if not address.startswith('0x'):
            return False

        if len(address) != 42:
            return False

        # Check hex characters
        try:
            int(address[2:], 16)
            return True
        except ValueError:
            return False


# Convenience exports
HLP_VAULT_ADDRESS = HyperliquidConfig.HLP_MAIN_VAULT
HYPERLIQUID_API = HyperliquidConfig.API_URL
HYPERLIQUID_WS = HyperliquidConfig.WEBSOCKET_URL
