"""
x402 Payment Facilitator Configuration

Loads configuration from environment variables for the x402 payment system.
"""

import os
from typing import Dict, Optional
from dataclasses import dataclass


@dataclass
class X402Config:
    """x402 Payment System Configuration"""

    # Admin
    admin_key: str

    # RPC Endpoints
    base_rpc_url: str
    ethereum_rpc_url: str
    solana_rpc_url: str

    # Payment Addresses
    base_payment_address: str
    ethereum_payment_address: str
    solana_payment_address: str

    # Pricing
    price_per_call: float
    requests_per_dollar: float
    min_payment_usd: float
    token_expiry_hours: int

    # Endpoint-specific pricing
    endpoint_prices: Dict[str, float]

    # Blockchain confirmations
    base_confirmations: int
    ethereum_confirmations: int
    solana_confirmations: int

    # Feature flags
    enabled: bool
    cache_enabled: bool
    cache_ttl: int


def parse_endpoint_prices(prices_str: str) -> Dict[str, float]:
    """
    Parse endpoint prices from comma-separated string.
    Format: /api/premium:0.10,/api/analytics:0.05
    """
    prices = {}
    if not prices_str:
        return prices

    for item in prices_str.split(','):
        try:
            endpoint, price = item.split(':')
            prices[endpoint.strip()] = float(price.strip())
        except ValueError:
            print(f"Warning: Invalid endpoint price format: {item}")
            continue

    return prices


def load_x402_config() -> X402Config:
    """Load x402 configuration from environment variables"""

    # Parse endpoint-specific prices
    endpoint_prices_str = os.getenv('X402_ENDPOINT_PRICES', '')
    endpoint_prices = parse_endpoint_prices(endpoint_prices_str)

    # Default pricing if not configured
    # Security intelligence endpoints use premium pricing
    if not endpoint_prices:
        endpoint_prices = {
            '/exploits': 0.01,          # Real-time exploit data
            '/exploits/latest-alert': 0.01,  # Latest exploit alert
            '/protocols/risk-score': 0.02,   # Protocol risk assessment (future)
            '/wallets/risk-check': 0.005,    # Wallet screening (future)
        }

    return X402Config(
        # Admin
        admin_key=os.getenv('X402_ADMIN_KEY', 'dev_x402_admin_key_change_in_production'),

        # RPC Endpoints
        base_rpc_url=os.getenv('X402_BASE_RPC_URL', 'https://mainnet.base.org'),
        ethereum_rpc_url=os.getenv('X402_ETHEREUM_RPC_URL', 'https://eth.llamarpc.com'),
        solana_rpc_url=os.getenv('X402_SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),

        # Payment Addresses (defaults to testnet addresses - CHANGE IN PRODUCTION!)
        base_payment_address=os.getenv('X402_BASE_PAYMENT_ADDRESS', '0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7'),
        ethereum_payment_address=os.getenv('X402_ETHEREUM_PAYMENT_ADDRESS', '0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7'),
        solana_payment_address=os.getenv('X402_SOLANA_PAYMENT_ADDRESS', '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'),

        # Pricing (aligned with x402 market standards)
        # Generic x402 test: $0.001/call (market standard)
        # Security intelligence endpoints: $0.01/query (premium)
        price_per_call=float(os.getenv('X402_PRICE_PER_CALL', '0.001')),
        requests_per_dollar=float(os.getenv('X402_REQUESTS_PER_DOLLAR', '1000.0')),
        min_payment_usd=float(os.getenv('X402_MIN_PAYMENT_USD', '0.10')),  # $0.10 minimum to reduce tx spam
        token_expiry_hours=int(os.getenv('X402_TOKEN_EXPIRY_HOURS', '24')),

        # Endpoint-specific pricing
        endpoint_prices=endpoint_prices,

        # Blockchain confirmations
        base_confirmations=int(os.getenv('X402_BASE_CONFIRMATIONS', '6')),
        ethereum_confirmations=int(os.getenv('X402_ETHEREUM_CONFIRMATIONS', '12')),
        solana_confirmations=int(os.getenv('X402_SOLANA_CONFIRMATIONS', '32')),

        # Feature flags
        enabled=os.getenv('X402_ENABLED', 'true').lower() == 'true',
        cache_enabled=os.getenv('X402_CACHE_ENABLED', 'true').lower() == 'true',
        cache_ttl=int(os.getenv('X402_CACHE_TTL', '300')),
    )


# Global config instance
x402_config: Optional[X402Config] = None


def get_x402_config() -> X402Config:
    """Get the global x402 configuration instance"""
    global x402_config
    if x402_config is None:
        x402_config = load_x402_config()
    return x402_config


def reload_x402_config() -> X402Config:
    """Reload configuration from environment (useful for testing)"""
    global x402_config
    x402_config = load_x402_config()
    return x402_config
