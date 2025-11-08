"""
x402 Infrastructure Python SDK - Client

Official Python SDK for x402 payment verification
"""

import httpx
from typing import Optional
from decimal import Decimal
from dataclasses import dataclass
from .exceptions import X402APIError, X402AuthError, X402QuotaExceeded


@dataclass
class VerificationResult:
    """Payment verification result"""
    success: bool
    tx_hash: str
    chain: str
    amount_usdc: Optional[Decimal]
    from_address: Optional[str]
    to_address: Optional[str]
    confirmations: Optional[int]
    risk_score: Optional[float]
    error: Optional[str] = None
    error_code: Optional[str] = None


class X402Client:
    """
    x402 Infrastructure API client

    Official Python SDK for x402 payment verification

    Example:
        >>> client = X402Client(api_key="x402_live_XXXXX")
        >>> result = client.verify_payment(
        ...     tx_hash="5KZ...",
        ...     chain="solana",
        ...     expected_amount=1.00
        ... )
        >>> if result.success:
        ...     print(f"Verified {result.amount_usdc} USDC")
    """

    BASE_URL = "https://kamiyo.ai/api/v1/x402"

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        timeout: int = 30
    ):
        """
        Initialize x402 client

        Args:
            api_key: Your x402 API key (get from dashboard)
            base_url: Custom API URL (for testing)
            timeout: Request timeout in seconds
        """
        if not api_key or not (api_key.startswith('x402_live_') or api_key.startswith('x402_test_')):
            raise ValueError("Invalid API key format. Must start with 'x402_live_' or 'x402_test_'")

        self.api_key = api_key
        self.base_url = base_url or self.BASE_URL
        self.client = httpx.Client(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout
        )

    def verify_payment(
        self,
        tx_hash: str,
        chain: str,
        expected_amount: Optional[float] = None
    ) -> VerificationResult:
        """
        Verify on-chain USDC payment

        Args:
            tx_hash: Transaction hash to verify
            chain: Blockchain network (solana, base, ethereum, etc.)
            expected_amount: Expected payment amount in USDC (optional)

        Returns:
            VerificationResult with payment details

        Raises:
            X402APIError: If API request fails
            X402QuotaExceeded: If monthly quota exceeded
            X402AuthError: If API key is invalid

        Example:
            >>> result = client.verify_payment(
            ...     tx_hash="5KZ...",
            ...     chain="solana",
            ...     expected_amount=1.00
            ... )
            >>> if result.success:
            ...     print(f"Verified {result.amount_usdc} USDC")
        """
        try:
            response = self.client.post("/verify", json={
                "tx_hash": tx_hash,
                "chain": chain,
                "expected_amount": expected_amount
            })

            if response.status_code == 429:
                raise X402QuotaExceeded("Monthly quota exceeded. Upgrade your plan.")

            if response.status_code == 401:
                raise X402AuthError("Invalid API key")

            if response.status_code != 200:
                error_data = response.json() if response.headers.get('content-type') == 'application/json' else {}
                raise X402APIError(
                    f"API error ({response.status_code}): {error_data.get('error', 'Unknown error')}"
                )

            data = response.json()

            return VerificationResult(
                success=data['success'],
                tx_hash=data.get('txHash') or data.get('tx_hash'),
                chain=data['chain'],
                amount_usdc=Decimal(str(data['amountUsdc'])) if data.get('amountUsdc') else None,
                from_address=data.get('fromAddress'),
                to_address=data.get('toAddress'),
                confirmations=data.get('confirmations'),
                risk_score=data.get('riskScore'),
                error=data.get('error'),
                error_code=data.get('errorCode')
            )

        except httpx.HTTPError as e:
            raise X402APIError(f"HTTP error: {str(e)}")

    def get_usage(self) -> dict:
        """
        Get current usage statistics

        Returns:
            {
                'tier': 'pro',
                'verifications_used': 1234,
                'verifications_limit': 500000,
                'verifications_remaining': 498766,
                'quota_reset_date': '2025-12-01T00:00:00Z',
                'enabled_chains': ['solana', 'base', 'ethereum', ...],
                'usage_percent': '0.25'
            }

        Raises:
            X402APIError: If API request fails
            X402AuthError: If API key is invalid
        """
        try:
            response = self.client.get("/usage")

            if response.status_code == 401:
                raise X402AuthError("Invalid API key")

            if response.status_code != 200:
                raise X402APIError(f"API error: {response.status_code}")

            return response.json()

        except httpx.HTTPError as e:
            raise X402APIError(f"HTTP error: {str(e)}")

    def get_supported_chains(self) -> dict:
        """
        Get chains available for your tier

        Returns:
            {
                'tier': 'pro',
                'enabled_chains': ['solana', 'base', 'ethereum', ...],
                'all_chains': ['solana', 'base', 'ethereum', ...],
                'payai_enabled': True
            }

        Raises:
            X402APIError: If API request fails
            X402AuthError: If API key is invalid
        """
        try:
            response = self.client.get("/supported-chains")

            if response.status_code == 401:
                raise X402AuthError("Invalid API key")

            if response.status_code != 200:
                raise X402APIError(f"API error: {response.status_code}")

            return response.json()

        except httpx.HTTPError as e:
            raise X402APIError(f"HTTP error: {str(e)}")

    def close(self):
        """Close HTTP client"""
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
