"""x402 payment configuration."""

import os
import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, Optional

logger = logging.getLogger(__name__)


@dataclass
class X402Config:
    # RPC endpoints
    base_rpc_url: str
    ethereum_rpc_url: str
    solana_rpc_url: str

    # Payment addresses
    base_payment_address: str
    ethereum_payment_address: str
    solana_payment_address: str

    # USDC contracts
    base_usdc_contract: str
    ethereum_usdc_contract: str
    solana_usdc_mint: str

    # Pricing
    default_price: Decimal
    endpoint_prices: Dict[str, Decimal]

    # Confirmations
    base_confirmations: int
    ethereum_confirmations: int
    solana_confirmations: int

    # Token settings
    token_expiry_hours: int
    requests_per_dollar: int

    # Admin
    admin_key: str

    def get_endpoint_price(self, endpoint: str) -> Decimal:
        if endpoint in self.endpoint_prices:
            return self.endpoint_prices[endpoint]
        for prefix, price in self.endpoint_prices.items():
            if endpoint.startswith(prefix):
                return price
        return self.default_price

    def get_rpc_url(self, chain: str) -> str:
        return {
            "base": self.base_rpc_url,
            "base-sepolia": self.base_rpc_url,
            "ethereum": self.ethereum_rpc_url,
            "solana": self.solana_rpc_url,
            "solana-devnet": self.solana_rpc_url,
        }.get(chain, self.base_rpc_url)

    def get_payment_address(self, chain: str) -> str:
        return {
            "base": self.base_payment_address,
            "base-sepolia": self.base_payment_address,
            "ethereum": self.ethereum_payment_address,
            "solana": self.solana_payment_address,
            "solana-devnet": self.solana_payment_address,
        }.get(chain, self.base_payment_address)

    def get_usdc_contract(self, chain: str) -> str:
        return {
            "base": self.base_usdc_contract,
            "ethereum": self.ethereum_usdc_contract,
            "solana": self.solana_usdc_mint,
        }.get(chain, self.base_usdc_contract)

    def get_required_confirmations(self, chain: str) -> int:
        return {
            "base": self.base_confirmations,
            "ethereum": self.ethereum_confirmations,
            "solana": self.solana_confirmations,
        }.get(chain, 1)


_config: Optional[X402Config] = None


def get_x402_config() -> X402Config:
    global _config
    if _config is not None:
        return _config

    # Parse endpoint prices: /endpoint1:0.01,/endpoint2:0.05
    endpoint_prices = {}
    prices_str = os.getenv("X402_ENDPOINT_PRICES", "")
    if prices_str:
        for pair in prices_str.split(","):
            if ":" in pair:
                endpoint, price = pair.split(":", 1)
                endpoint_prices[endpoint.strip()] = Decimal(price.strip())

    if not endpoint_prices:
        endpoint_prices = {
            "/exploits": Decimal("0.01"),
            "/api/v1/": Decimal("0.01"),
            "/premium/": Decimal("0.10"),
        }

    _config = X402Config(
        base_rpc_url=os.getenv("BASE_RPC_URL", "https://mainnet.base.org"),
        ethereum_rpc_url=os.getenv("ETHEREUM_RPC_URL", "https://eth.llamarpc.com"),
        solana_rpc_url=os.getenv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com"),
        base_payment_address=os.getenv(
            "X402_BASE_PAYMENT_ADDRESS",
            "0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7",
        ),
        ethereum_payment_address=os.getenv(
            "X402_ETHEREUM_PAYMENT_ADDRESS",
            "0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7",
        ),
        solana_payment_address=os.getenv(
            "X402_SOLANA_PAYMENT_ADDRESS",
            "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        ),
        base_usdc_contract=os.getenv(
            "BASE_USDC_CONTRACT",
            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        ),
        ethereum_usdc_contract=os.getenv(
            "ETHEREUM_USDC_CONTRACT",
            "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        ),
        solana_usdc_mint=os.getenv(
            "SOLANA_USDC_MINT",
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        ),
        default_price=Decimal(os.getenv("X402_DEFAULT_PRICE", "0.01")),
        endpoint_prices=endpoint_prices,
        base_confirmations=int(os.getenv("X402_BASE_CONFIRMATIONS", "1")),
        ethereum_confirmations=int(os.getenv("X402_ETHEREUM_CONFIRMATIONS", "3")),
        solana_confirmations=int(os.getenv("X402_SOLANA_CONFIRMATIONS", "1")),
        token_expiry_hours=int(os.getenv("X402_TOKEN_EXPIRY_HOURS", "24")),
        requests_per_dollar=int(os.getenv("X402_REQUESTS_PER_DOLLAR", "10")),
        admin_key=os.getenv("X402_ADMIN_KEY", "dev_x402_admin_key_change_in_production"),
    )

    logger.info(f"x402 config loaded: default_price={_config.default_price} USDC")
    return _config


def reset_config():
    global _config
    _config = None
