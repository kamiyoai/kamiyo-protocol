"""PayAI Network x402 facilitator client."""

import logging
import httpx
from typing import Dict, Optional, List
from decimal import Decimal
from dataclasses import dataclass

logger = logging.getLogger(__name__)

USDC_DECIMALS = Decimal("1000000")


@dataclass
class PaymentRequirement:
    scheme: str
    network: str
    max_amount_required: str
    resource: str
    description: str
    mime_type: Optional[str] = None
    pay_to: Optional[str] = None
    max_timeout_seconds: int = 60
    asset: str = "USDC"
    extra: Optional[Dict] = None


@dataclass
class VerificationResult:
    is_valid: bool
    payer: str
    invalid_reason: Optional[str] = None


@dataclass
class SettlementResult:
    success: bool
    payer: str
    transaction: Optional[str] = None
    network: Optional[str] = None
    error: Optional[str] = None


class PayAIFacilitator:
    """Client for PayAI's x402 payment facilitator."""

    FACILITATOR_URL = "https://facilitator.payai.network"
    SUPPORTED_NETWORKS = [
        "solana",
        "solana-devnet",
        "base",
        "base-sepolia",
        "polygon",
        "polygon-amoy",
        "arbitrum",
        "arbitrum-sepolia",
        "optimism",
        "optimism-sepolia",
    ]

    def __init__(
        self,
        merchant_address: str,
        facilitator_url: Optional[str] = None,
        timeout: int = 30,
    ):
        self.merchant_address = merchant_address
        self.facilitator_url = facilitator_url or self.FACILITATOR_URL
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.facilitator_url, timeout=self.timeout
            )
        return self._client

    def create_payment_requirement(
        self,
        endpoint: str,
        price_usdc: Decimal,
        description: str,
        network: str = "base",
    ) -> PaymentRequirement:
        amount_micro = int(price_usdc * USDC_DECIMALS)
        return PaymentRequirement(
            scheme="exact",
            network=network,
            max_amount_required=str(amount_micro),
            resource=endpoint,
            description=description,
            pay_to=self.merchant_address,
            asset="USDC",
        )

    def _build_requirement_payload(self, req: PaymentRequirement) -> Dict:
        return {
            "scheme": req.scheme,
            "network": req.network,
            "maxAmountRequired": req.max_amount_required,
            "resource": req.resource,
            "description": req.description,
            "payTo": req.pay_to,
            "asset": req.asset,
        }

    async def verify_payment(
        self, payment_header: str, requirements: PaymentRequirement
    ) -> VerificationResult:
        client = await self._get_client()

        try:
            resp = await client.post(
                "/verify",
                json={
                    "x402Version": 1,
                    "paymentHeader": payment_header,
                    "paymentRequirements": self._build_requirement_payload(requirements),
                },
            )

            if resp.status_code == 200:
                data = resp.json()
                return VerificationResult(
                    is_valid=data.get("isValid", False),
                    payer=data.get("payer", ""),
                    invalid_reason=data.get("invalidReason"),
                )

            logger.error(f"PayAI verify failed: {resp.status_code}")
            return VerificationResult(
                is_valid=False,
                payer="",
                invalid_reason=f"Facilitator error: {resp.status_code}",
            )

        except Exception as e:
            logger.error(f"PayAI verification error: {e}")
            return VerificationResult(is_valid=False, payer="", invalid_reason=str(e))

    async def settle_payment(
        self, payment_header: str, requirements: PaymentRequirement
    ) -> SettlementResult:
        client = await self._get_client()

        try:
            resp = await client.post(
                "/settle",
                json={
                    "x402Version": 1,
                    "paymentHeader": payment_header,
                    "paymentRequirements": self._build_requirement_payload(requirements),
                },
            )

            if resp.status_code == 200:
                data = resp.json()
                return SettlementResult(
                    success=data.get("success", False),
                    payer=data.get("payer", ""),
                    transaction=data.get("transaction"),
                    network=data.get("network"),
                )

            logger.error(f"PayAI settle failed: {resp.status_code}")
            return SettlementResult(
                success=False, payer="", error=f"Settlement error: {resp.status_code}"
            )

        except Exception as e:
            logger.error(f"PayAI settlement error: {e}")
            return SettlementResult(success=False, payer="", error=str(e))

    def create_402_response(
        self,
        endpoint: str,
        price_usdc: Decimal,
        description: str,
        networks: Optional[List[str]] = None,
    ) -> Dict:
        networks = networks or ["base", "solana", "polygon"]
        amount_micro = str(int(price_usdc * USDC_DECIMALS))

        accepts = [
            {
                "scheme": "exact",
                "network": net,
                "maxAmountRequired": amount_micro,
                "resource": endpoint,
                "description": description,
                "payTo": self.merchant_address,
                "asset": "USDC",
                "maxTimeoutSeconds": 60,
            }
            for net in networks
        ]

        return {
            "x402Version": 1,
            "accepts": accepts,
            "error": "Payment Required",
            "facilitator": self.facilitator_url,
        }

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None
