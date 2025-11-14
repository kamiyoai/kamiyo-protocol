"""
Contract address configuration for ERC-8004
Per-chain contract addresses with validation
"""

import os
from typing import Optional, Dict
import logging

logger = logging.getLogger(__name__)


class ContractConfig:
    """
    ERC-8004 contract address configuration

    Manages deployed contract addresses per chain with validation.
    """

    # Contract addresses by chain
    CONTRACTS: Dict[str, Dict[str, str]] = {
        "base": {
            "identity_registry": os.getenv("ERC8004_BASE_IDENTITY_REGISTRY", ""),
            "reputation_registry": os.getenv("ERC8004_BASE_REPUTATION_REGISTRY", "")
        },
        "ethereum": {
            "identity_registry": os.getenv("ERC8004_ETH_IDENTITY_REGISTRY", ""),
            "reputation_registry": os.getenv("ERC8004_ETH_REPUTATION_REGISTRY", "")
        },
        "sepolia": {
            "identity_registry": os.getenv("ERC8004_SEPOLIA_IDENTITY_REGISTRY", ""),
            "reputation_registry": os.getenv("ERC8004_SEPOLIA_REPUTATION_REGISTRY", "")
        },
        "baseSepolia": {
            "identity_registry": os.getenv("ERC8004_BASE_SEPOLIA_IDENTITY_REGISTRY", ""),
            "reputation_registry": os.getenv("ERC8004_BASE_SEPOLIA_REPUTATION_REGISTRY", "")
        }
    }

    @classmethod
    def get_identity_registry(cls, chain: str) -> Optional[str]:
        """
        Get identity registry address for chain

        Args:
            chain: Chain name (base, ethereum, sepolia, baseSepolia)

        Returns:
            Contract address or None if not configured
        """
        chain_config = cls.CONTRACTS.get(chain.lower())
        if not chain_config:
            logger.warning(f"Unknown chain: {chain}")
            return None

        address = chain_config.get("identity_registry")
        if not address or not cls.is_valid_address(address):
            logger.warning(f"Invalid or missing identity registry address for {chain}")
            return None

        return address

    @classmethod
    def get_reputation_registry(cls, chain: str) -> Optional[str]:
        """
        Get reputation registry address for chain

        Args:
            chain: Chain name (base, ethereum, sepolia, baseSepolia)

        Returns:
            Contract address or None if not configured
        """
        chain_config = cls.CONTRACTS.get(chain.lower())
        if not chain_config:
            logger.warning(f"Unknown chain: {chain}")
            return None

        address = chain_config.get("reputation_registry")
        if not address or not cls.is_valid_address(address):
            logger.warning(f"Invalid or missing reputation registry address for {chain}")
            return None

        return address

    @classmethod
    def is_valid_address(cls, address: str) -> bool:
        """
        Validate Ethereum address format

        Args:
            address: Ethereum address

        Returns:
            True if valid format, False otherwise
        """
        if not address:
            return False

        # Basic validation: 0x + 40 hex characters
        if not address.startswith("0x"):
            return False

        if len(address) != 42:
            return False

        try:
            int(address[2:], 16)  # Verify hex
            return True
        except ValueError:
            return False

    @classmethod
    def is_configured(cls, chain: str) -> bool:
        """
        Check if chain has contracts configured

        Args:
            chain: Chain name

        Returns:
            True if both contracts configured, False otherwise
        """
        identity = cls.get_identity_registry(chain)
        reputation = cls.get_reputation_registry(chain)
        return identity is not None and reputation is not None

    @classmethod
    def get_supported_chains(cls) -> list:
        """
        Get list of configured chains

        Returns:
            List of chain names with valid contract addresses
        """
        return [
            chain for chain in cls.CONTRACTS.keys()
            if cls.is_configured(chain)
        ]


def validate_contract_config():
    """
    Validate contract configuration on startup

    Logs warnings for missing or invalid configurations.
    """
    logger.info("Validating ERC-8004 contract configuration...")

    for chain in ContractConfig.CONTRACTS.keys():
        if ContractConfig.is_configured(chain):
            identity = ContractConfig.get_identity_registry(chain)
            reputation = ContractConfig.get_reputation_registry(chain)
            logger.info(f"✓ {chain}: Identity={identity}, Reputation={reputation}")
        else:
            logger.warning(f"✗ {chain}: Contracts not configured")

    supported = ContractConfig.get_supported_chains()
    if not supported:
        logger.error("No chains configured! Set ERC8004_*_IDENTITY_REGISTRY and ERC8004_*_REPUTATION_REGISTRY")
    else:
        logger.info(f"Supported chains: {', '.join(supported)}")
