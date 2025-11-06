#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KAMIYO x402 Payment Middleware
FastAPI middleware for HTTP 402 Payment Required responses
"""

import logging
from typing import Optional, Dict, Any
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from .payment_verifier import payment_verifier, PaymentVerification
from .payment_tracker import PaymentTracker
from .config import get_x402_config
from .payment_gateway import UnifiedPaymentGateway

logger = logging.getLogger(__name__)

class X402Middleware(BaseHTTPMiddleware):
    """
    Middleware for handling HTTP 402 Payment Required

    This middleware:
    1. Checks if endpoint requires payment
    2. Validates payment headers/tokens
    3. Returns 402 with payment details if no valid payment
    4. Tracks payment usage for rate limiting
    """

    def __init__(
        self,
        app,
        payment_tracker: PaymentTracker,
        use_unified_gateway: bool = True
    ):
        super().__init__(app)
        self.payment_tracker = payment_tracker
        self.config = get_x402_config()

        # Convert endpoint prices from config to middleware format
        # Support GET and HEAD for x402scan discovery
        self.require_payment_paths = {
            endpoint: {'methods': ['GET', 'HEAD'], 'price': price}
            for endpoint, price in self.config.endpoint_prices.items()
        }

        # Initialize unified payment gateway (supports PayAI + native)
        self.use_unified_gateway = use_unified_gateway
        if use_unified_gateway:
            self.payment_gateway = UnifiedPaymentGateway(
                payment_tracker=payment_tracker,
                middleware=self
            )
            logger.info("x402 Middleware initialized with UnifiedPaymentGateway (PayAI + native)")
        else:
            self.payment_gateway = None
            logger.info("x402 Middleware initialized with native-only verification")

        logger.info(f"Paid endpoints: {list(self.require_payment_paths.keys())}")

    async def dispatch(self, request: Request, call_next) -> Response:
        """Process request and handle x402 payments with comprehensive error handling"""

        try:
            # Skip payment check if x402 is disabled
            if not self.config.enabled:
                return await call_next(request)

            # Skip payment check for certain paths
            if self._should_skip_payment_check(request):
                return await call_next(request)

            # Check if this endpoint requires payment
            payment_config = self._get_payment_config(request)
            if not payment_config:
                return await call_next(request)

            # Check for valid payment authorization
            try:
                # Use unified gateway if enabled, otherwise fall back to legacy
                if self.payment_gateway:
                    payment_auth = await self.payment_gateway.verify_payment(request)
                else:
                    payment_auth = await self._get_payment_authorization(request)
            except Exception as e:
                logger.error(f"Error during payment authorization: {e}")
                # On authorization error, return 402 (fail closed for security)
                return self._create_402_response(request, payment_config)

            if payment_auth and payment_auth['is_valid']:
                # Valid payment - track usage and proceed
                try:
                    await self.payment_tracker.record_usage(
                        payment_auth['payment_id'],
                        request.url.path,
                        payment_config['price']
                    )
                except Exception as e:
                    logger.error(f"Error recording payment usage: {e}")
                    # Continue anyway - don't block user for tracking failure

                return await call_next(request)
            else:
                # No valid payment - return 402 with payment details
                return self._create_402_response(request, payment_config)

        except Exception as e:
            # Catch-all error handler - log and fail open (allow request through)
            logger.error(f"Unexpected error in x402 middleware: {e}", exc_info=True)
            # Fail open - don't block legitimate requests due to middleware bugs
            return await call_next(request)

    def _should_skip_payment_check(self, request: Request) -> bool:
        """Check if payment check should be skipped"""
        # Skip for OPTIONS requests (CORS preflight)
        if request.method == 'OPTIONS':
            return True

        # Skip for HEAD requests (x402scan discovery) but still return 402
        # HEAD requests should receive 402 to indicate payment required
        # This is handled by _get_payment_config which checks methods

        # Skip for health/readiness endpoints
        if request.url.path in ['/ready', '/health']:
            return True

        # Skip for docs and redoc
        if request.url.path in ['/docs', '/redoc', '/openapi.json']:
            return True

        # Skip for subscription-based users (handled by existing auth)
        # This allows hybrid model: subscriptions OR x402 payments
        auth_header = request.headers.get('authorization')
        if auth_header and auth_header.startswith('Bearer '):
            # Subscription user - skip x402 payment
            return True

        return False

    def _get_payment_config(self, request: Request) -> Optional[Dict[str, Any]]:
        """Get payment configuration for current endpoint"""
        path_config = self.require_payment_paths.get(request.url.path)

        if path_config and request.method in path_config['methods']:
            return {
                'price': path_config['price'],
                'endpoint': request.url.path,
                'method': request.method
            }

        return None

    async def _get_payment_authorization(self, request: Request) -> Optional[Dict[str, Any]]:
        """Extract and validate payment authorization"""

        # Check for payment token header
        payment_token = request.headers.get('x-payment-token')
        if payment_token:
            return await self._validate_payment_token(payment_token)

        # Check for on-chain payment header
        payment_tx = request.headers.get('x-payment-tx')
        payment_chain = request.headers.get('x-payment-chain', 'base')

        if payment_tx:
            return await self._validate_onchain_payment(payment_tx, payment_chain)

        return None

    async def _validate_payment_token(self, token: str) -> Dict[str, Any]:
        """Validate payment access token"""
        try:
            payment_record = await self.payment_tracker.get_payment_by_token(token)

            if not payment_record:
                return {'is_valid': False, 'error': 'Invalid payment token'}

            if payment_record['expires_at'] < self.payment_tracker.get_current_time():
                return {'is_valid': False, 'error': 'Payment token expired'}

            if payment_record['requests_remaining'] <= 0:
                return {'is_valid': False, 'error': 'No requests remaining'}

            return {
                'is_valid': True,
                'payment_id': payment_record['id'],
                'payment_type': 'token'
            }

        except Exception as e:
            logger.error(f"Error validating payment token: {e}")
            return {'is_valid': False, 'error': str(e)}

    async def _validate_onchain_payment(
        self,
        tx_hash: str,
        chain: str
    ) -> Dict[str, Any]:
        """Validate on-chain payment transaction"""
        try:
            # Verify the payment on chain
            verification = await payment_verifier.verify_payment(tx_hash, chain)

            if not verification.is_valid:
                return {
                    'is_valid': False,
                    'error': verification.error_message or 'Payment verification failed'
                }

            # Check if payment meets minimum amount
            if verification.amount_usdc < payment_verifier.min_payment_amount:
                return {
                    'is_valid': False,
                    'error': f'Payment amount too small: {verification.amount_usdc} USDC'
                }

            # Create or update payment record
            payment_record = await self.payment_tracker.create_payment_record(
                tx_hash=tx_hash,
                chain=chain,
                amount_usdc=float(verification.amount_usdc),
                from_address=verification.from_address,
                risk_score=verification.risk_score
            )

            return {
                'is_valid': True,
                'payment_id': payment_record['id'],
                'payment_type': 'onchain',
                'risk_score': verification.risk_score
            }

        except Exception as e:
            logger.error(f"Error validating on-chain payment: {e}")
            return {'is_valid': False, 'error': str(e)}

    def _create_402_response(self, request: Request, payment_config: Dict[str, Any]) -> JSONResponse:
        """Create HTTP 402 Payment Required response"""

        # Use unified gateway for multi-facilitator 402 response
        if self.payment_gateway:
            from decimal import Decimal
            payment_details = self.payment_gateway.create_402_response(
                request=request,
                endpoint=payment_config['endpoint'],
                price_usdc=Decimal(str(payment_config['price']))
            )
        else:
            # Legacy native-only 402 response
            payment_details = {
                "payment_required": True,
                "endpoint": payment_config['endpoint'],
                "method": payment_config['method'],
                "amount_usdc": payment_config['price'],
                "description": f"Access to {payment_config['endpoint']} requires payment",
                "payment_methods": [
                    {
                        "type": "onchain",
                        "description": "Send USDC payment on supported chains",
                        "supported_chains": payment_verifier.get_supported_chains(),
                        "payment_addresses": {
                            chain: payment_verifier.get_payment_address(chain)
                            for chain in payment_verifier.get_supported_chains()
                        },
                        "instructions": "Include x-payment-tx and x-payment-chain headers after payment"
                    },
                    {
                        "type": "token",
                        "description": "Use existing payment token",
                        "instructions": "Include x-payment-token header with valid token"
                    }
                ],
                "api_documentation": "https://kamiyo.ai/docs/x402-payments",
                "support": "support@kamiyo.ai"
            }

        return JSONResponse(
            status_code=402,
            content=payment_details,
            headers={
                "X-Payment-Required": "true",
                "X-Payment-Amount": str(payment_config['price']),
                "X-Payment-Currency": "USDC"
            }
        )
