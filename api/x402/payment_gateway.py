#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KAMIYO Unified Payment Gateway
Multi-facilitator payment verification supporting both PayAI and native x402
"""

import logging
from typing import Dict, Optional, List, Any, Literal, TYPE_CHECKING
from decimal import Decimal
from fastapi import Request

if TYPE_CHECKING:
    from .middleware import X402Middleware

from .payai_facilitator import PayAIFacilitator, VerificationResult
from .payment_tracker import PaymentTracker
from .config import get_x402_config
from .payment_analytics import get_payment_analytics
import time

logger = logging.getLogger(__name__)


FacilitatorType = Literal['payai', 'kamiyo_native']


class UnifiedPaymentGateway:
    """
    Multi-facilitator payment gateway

    Supports:
    - PayAI Network facilitator (best UX, ecosystem access)
    - KAMIYO native on-chain verification (full control, security integration)
    - Future facilitators (Corbits, etc.)

    Priority order: PayAI → KAMIYO native
    """

    def __init__(
        self,
        payment_tracker: PaymentTracker,
        middleware: Optional[Any] = None,  # X402Middleware type hint causes circular import
        payai_merchant_address: Optional[str] = None
    ):
        """
        Initialize unified payment gateway

        Args:
            payment_tracker: Payment tracker instance
            middleware: Existing X402Middleware instance (for KAMIYO native)
            payai_merchant_address: Merchant address for PayAI (defaults to config)
        """
        self.payment_tracker = payment_tracker
        self.config = get_x402_config()

        # KAMIYO native facilitator (existing implementation)
        self.middleware = middleware

        # PayAI facilitator (new integration)
        merchant_address = payai_merchant_address or self.config.base_payment_address
        self.payai = PayAIFacilitator(merchant_address=merchant_address)

        # Facilitator priority (fastest/best UX first)
        self.facilitator_priority: List[FacilitatorType] = ['payai', 'kamiyo_native']

        # Analytics tracker
        self.analytics = get_payment_analytics()

        logger.info("Unified payment gateway initialized with PayAI + KAMIYO native")

    async def verify_payment(self, request: Request) -> Dict[str, Any]:
        """
        Try all facilitators in priority order

        Args:
            request: FastAPI request object

        Returns:
            Verification result dict
        """

        # 1. Check for PayAI X-PAYMENT header (x402 standard)
        payment_header = request.headers.get('x-payment')
        if payment_header:
            start_time = time.time()
            result = await self._verify_payai_payment(request, payment_header)
            latency_ms = int((time.time() - start_time) * 1000)

            # Record analytics
            await self.analytics.record_payment_attempt(
                endpoint=str(request.url.path),
                facilitator='payai',
                success=result['is_valid'],
                latency_ms=latency_ms,
                amount_usdc=result.get('amount_usdc'),
                user_address=result.get('payer'),
                error_reason=result.get('error')
            )

            if result['is_valid']:
                logger.info(f"✅ PayAI payment verified: {result.get('payer')}")
                return result

        # 2. Check for KAMIYO native on-chain payment
        payment_tx = request.headers.get('x-payment-tx')
        payment_chain = request.headers.get('x-payment-chain')
        if payment_tx and payment_chain:
            start_time = time.time()
            result = await self._verify_native_onchain_payment(payment_tx, payment_chain)
            latency_ms = int((time.time() - start_time) * 1000)

            # Record analytics
            await self.analytics.record_payment_attempt(
                endpoint=str(request.url.path),
                facilitator='kamiyo_native',
                success=result['is_valid'],
                latency_ms=latency_ms,
                user_address=result.get('from_address'),
                error_reason=result.get('error')
            )

            if result['is_valid']:
                logger.info(f"✅ KAMIYO native payment verified: {result.get('from_address')}")
                return result

        # 3. Check for legacy KAMIYO token
        payment_token = request.headers.get('x-payment-token')
        if payment_token:
            result = await self._verify_native_token(payment_token)
            if result['is_valid']:
                logger.info(f"✅ KAMIYO token verified: {result.get('payment_id')}")
                return result

        # No valid payment found
        return {'is_valid': False, 'error': 'No valid payment authorization found'}

    async def _verify_payai_payment(
        self,
        request: Request,
        payment_header: str
    ) -> Dict[str, Any]:
        """
        Verify payment via PayAI facilitator

        Args:
            request: FastAPI request
            payment_header: X-PAYMENT header value

        Returns:
            Verification result
        """
        try:
            # Extract endpoint and price from request path
            endpoint = str(request.url.path)
            price_float = self._get_endpoint_price(endpoint)

            if price_float is None:
                return {'is_valid': False, 'error': 'Endpoint not configured for payments'}

            # Convert to Decimal for PayAI
            price_usdc = Decimal(str(price_float))

            # Create payment requirement for this endpoint
            payment_requirement = self.payai.create_payment_requirement(
                endpoint=endpoint,
                price_usdc=price_usdc,
                description=f"Access to {endpoint}",
                network='base'  # TODO: Detect network from payment header
            )

            # Verify via PayAI facilitator
            verification = await self.payai.verify_payment(
                payment_header=payment_header,
                payment_requirements=payment_requirement
            )

            if not verification.is_valid:
                return {
                    'is_valid': False,
                    'error': verification.invalid_reason or 'PayAI verification failed'
                }

            # Settle payment on blockchain via PayAI
            settlement = await self.payai.settle_payment(
                payment_header=payment_header,
                payment_requirements=payment_requirement
            )

            if not settlement.success:
                return {
                    'is_valid': False,
                    'error': settlement.error_reason or 'PayAI settlement failed'
                }

            # Create payment record in our database
            payment_record = await self.payment_tracker.create_payment_record(
                tx_hash=settlement.transaction,
                chain=settlement.network,
                amount_usdc=float(price_usdc),
                from_address=settlement.payer,
                to_address=self.payai.merchant_address,
                block_number=0,  # Not available from PayAI
                confirmations=1,  # PayAI handles confirmations
                risk_score=0.1  # Low risk for PayAI-verified payments
            )

            return {
                'is_valid': True,
                'payment_id': payment_record['id'],
                'payment_type': 'payai_facilitator',
                'payer': settlement.payer,
                'transaction': settlement.transaction,
                'network': settlement.network,
                'amount_usdc': float(price_usdc)
            }

        except Exception as e:
            logger.error(f"PayAI verification error: {e}")
            return {'is_valid': False, 'error': f"PayAI error: {str(e)}"}

    async def _verify_native_onchain_payment(
        self,
        tx_hash: str,
        chain: str
    ) -> Dict[str, Any]:
        """
        Verify payment via KAMIYO native on-chain verification

        Args:
            tx_hash: Transaction hash
            chain: Blockchain network

        Returns:
            Verification result
        """
        if not self.middleware:
            return {'is_valid': False, 'error': 'KAMIYO native middleware not configured'}

        return await self.middleware._validate_onchain_payment(tx_hash, chain)

    async def _verify_native_token(self, token: str) -> Dict[str, Any]:
        """
        Verify payment via KAMIYO native token

        Args:
            token: Payment token

        Returns:
            Verification result
        """
        if not self.middleware:
            return {'is_valid': False, 'error': 'KAMIYO native middleware not configured'}

        return await self.middleware._validate_payment_token(token)

    def create_402_response(
        self,
        request: Request,
        endpoint: str,
        price_usdc: Decimal
    ) -> Dict[str, Any]:
        """
        Create 402 response with MULTIPLE payment options

        Args:
            request: FastAPI request
            endpoint: Protected endpoint path
            price_usdc: Price in USDC

        Returns:
            402 response body with all payment options
        """

        # Get KAMIYO native payment addresses
        native_addresses = {}
        if self.middleware:
            from .payment_verifier import payment_verifier
            for chain in payment_verifier.get_supported_chains():
                native_addresses[chain] = payment_verifier.get_payment_address(chain)

        # Build multi-option 402 response
        response = {
            "payment_required": True,
            "endpoint": endpoint,
            "amount_usdc": float(price_usdc),
            "payment_options": []
        }

        # Option 1: PayAI Network (recommended - best UX)
        payai_402 = self.payai.create_402_response(
            endpoint=endpoint,
            price_usdc=price_usdc,
            description=f"KAMIYO Security Intelligence - {endpoint}",
            networks=['base', 'solana', 'polygon']
        )

        response["payment_options"].append({
            "provider": "PayAI Network",
            "type": "facilitator",
            "priority": 1,
            "recommended": True,
            "supported_chains": ["solana", "base", "polygon", "avalanche", "sei", "iotex"],
            "wallet_support": ["Phantom", "Backpack", "MetaMask", "Coinbase Wallet"],
            "x402_standard": payai_402,
            "instructions": "Send X-PAYMENT header with signed authorization (see x402_standard for details)"
        })

        # Option 2: KAMIYO Native (advanced - more control)
        if native_addresses:
            response["payment_options"].append({
                "provider": "KAMIYO Native",
                "type": "direct_transfer",
                "priority": 2,
                "recommended": False,
                "supported_chains": list(native_addresses.keys()),
                "payment_addresses": native_addresses,
                "instructions": "Send USDC to payment address, retry with x-payment-tx and x-payment-chain headers"
            })

        response["api_documentation"] = "https://kamiyo.ai/docs/x402-payments"
        response["support"] = "support@kamiyo.ai"

        return response

    def _get_endpoint_price(self, endpoint: str) -> Optional[Decimal]:
        """Get configured price for endpoint"""
        return self.config.endpoint_prices.get(endpoint)

    async def close(self):
        """Close facilitator connections"""
        await self.payai.close()


# Factory function for dependency injection
def get_payment_gateway(
    payment_tracker: PaymentTracker,
    middleware: Optional[Any] = None,  # X402Middleware
    payai_merchant_address: Optional[str] = None
) -> UnifiedPaymentGateway:
    """
    Get UnifiedPaymentGateway instance

    Args:
        payment_tracker: Payment tracker instance
        middleware: X402Middleware instance
        payai_merchant_address: PayAI merchant address

    Returns:
        UnifiedPaymentGateway instance
    """
    return UnifiedPaymentGateway(
        payment_tracker=payment_tracker,
        middleware=middleware,
        payai_merchant_address=payai_merchant_address
    )
