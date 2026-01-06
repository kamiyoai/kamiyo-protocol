"""Unified payment gateway supporting PayAI and native verification."""

import logging
import time
from typing import Dict, Any, Optional
from decimal import Decimal
from fastapi import Request

from .payai_facilitator import PayAIFacilitator
from .payment_analytics import get_payment_analytics
from .config import get_x402_config

logger = logging.getLogger(__name__)


class UnifiedPaymentGateway:
    """
    Multi-facilitator payment gateway.

    Priority:
    1. PayAI Network (x402 facilitator)
    2. Native on-chain verification (fallback)
    """

    def __init__(
        self,
        payment_tracker,
        middleware,
        payai_merchant_address: Optional[str] = None,
    ):
        self.payment_tracker = payment_tracker
        self.middleware = middleware
        self.analytics = get_payment_analytics()

        config = get_x402_config()
        merchant = payai_merchant_address or config.base_payment_address
        self.payai = PayAIFacilitator(merchant_address=merchant)

        logger.info(f"Payment gateway initialized: {merchant}")

    async def verify_payment(self, request: Request) -> Dict[str, Any]:
        """Verify payment from request headers."""
        start = time.time()
        endpoint = request.url.path

        # PayAI header
        payment_header = request.headers.get("x-payment")
        if payment_header:
            result = await self._verify_payai(request, payment_header)
            if result["is_valid"]:
                await self._record_analytics(
                    endpoint, "payai", True, start, result
                )
                return result

        # Native on-chain
        tx_hash = request.headers.get("x-payment-tx")
        chain = request.headers.get("x-payment-chain", "base")
        if tx_hash:
            result = await self._verify_native(tx_hash, chain)
            if result["is_valid"]:
                await self._record_analytics(
                    endpoint, "kamiyo_native", True, start, result
                )
                return result

        # Payment token
        payment_token = request.headers.get("x-payment-token")
        if payment_token:
            result = await self.middleware._validate_payment_token(payment_token)
            if result["is_valid"]:
                return result

        return {
            "is_valid": False,
            "error": "No valid payment. Include X-PAYMENT or X-Payment-Tx header.",
        }

    async def _record_analytics(
        self, endpoint: str, facilitator: str, success: bool, start: float, result: Dict
    ):
        latency_ms = int((time.time() - start) * 1000)
        await self.analytics.record_payment_attempt(
            endpoint=endpoint,
            facilitator=facilitator,
            success=success,
            latency_ms=latency_ms,
            amount_usdc=result.get("amount_usdc"),
            user_address=result.get("payer") or result.get("from_address"),
        )

    async def _verify_payai(
        self, request: Request, payment_header: str
    ) -> Dict[str, Any]:
        try:
            config = get_x402_config()
            endpoint = request.url.path
            price = config.get_endpoint_price(endpoint)

            requirement = self.payai.create_payment_requirement(
                endpoint=endpoint,
                price_usdc=price,
                description=f"API access: {endpoint}",
            )

            verification = await self.payai.verify_payment(payment_header, requirement)
            if not verification.is_valid:
                return {
                    "is_valid": False,
                    "error": f"Verification failed: {verification.invalid_reason}",
                }

            settlement = await self.payai.settle_payment(payment_header, requirement)
            if not settlement.success:
                return {
                    "is_valid": False,
                    "error": f"Settlement failed: {settlement.error}",
                }

            payment_record = await self.payment_tracker.create_payment_record(
                tx_hash=settlement.transaction or f"payai_{int(time.time())}",
                chain=settlement.network or "base",
                amount_usdc=float(price),
                from_address=settlement.payer,
                to_address=config.base_payment_address,
                block_number=0,
                confirmations=1,
                risk_score=0.1,
            )

            return {
                "is_valid": True,
                "payment_type": "payai_facilitator",
                "payment_id": payment_record["id"],
                "payer": settlement.payer,
                "transaction": settlement.transaction,
                "network": settlement.network,
                "amount_usdc": float(price),
            }

        except Exception as e:
            logger.error(f"PayAI error: {e}")
            return {"is_valid": False, "error": str(e)}

    async def _verify_native(self, tx_hash: str, chain: str) -> Dict[str, Any]:
        return await self.middleware._validate_onchain_payment(tx_hash, chain)

    def create_402_response(
        self, request: Request, endpoint: str, price_usdc: Decimal
    ) -> Dict:
        config = get_x402_config()

        payai_response = self.payai.create_402_response(
            endpoint=endpoint,
            price_usdc=price_usdc,
            description=f"API access: {endpoint}",
            networks=["base", "solana", "polygon"],
        )

        native_addresses = {
            "base": config.base_payment_address,
            "ethereum": config.ethereum_payment_address,
            "solana": config.solana_payment_address,
        }

        return {
            "error": "Payment Required",
            "price_usdc": str(price_usdc),
            "endpoint": endpoint,
            "payment_options": [
                {
                    "provider": "PayAI Network",
                    "priority": 1,
                    "recommended": True,
                    "supported_chains": ["solana", "base", "polygon", "arbitrum"],
                    "header": "X-PAYMENT",
                    "x402": payai_response,
                },
                {
                    "provider": "KAMIYO Native",
                    "priority": 2,
                    "recommended": False,
                    "supported_chains": list(native_addresses.keys()),
                    "headers": {
                        "X-Payment-Tx": "<transaction_hash>",
                        "X-Payment-Chain": "<chain_name>",
                    },
                    "payment_addresses": native_addresses,
                },
            ],
        }

    async def close(self):
        await self.payai.close()
