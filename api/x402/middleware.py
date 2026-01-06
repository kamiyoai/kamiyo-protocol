"""HTTP 402 Payment Required middleware."""

import logging
from typing import Callable, Dict
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import get_x402_config
from .payment_verifier import payment_verifier

logger = logging.getLogger(__name__)

PAID_ENDPOINTS = [
    "/exploits",
    "/api/v1/exploits",
    "/api/v1/intelligence",
    "/premium/",
]

EXEMPT_ENDPOINTS = [
    "/health",
    "/ready",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/x402/",
    "/api/csrf-token",
    "/api/v1/webhooks",
    "/",
]


class X402Middleware(BaseHTTPMiddleware):
    """Middleware for x402 payment verification."""

    def __init__(self, app, payment_tracker=None):
        super().__init__(app)
        self.payment_tracker = payment_tracker
        self.config = get_x402_config()

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path

        if self._is_exempt(path) or not self._requires_payment(path):
            return await call_next(request)

        result = await self._validate_payment(request)

        if result["is_valid"]:
            if self.payment_tracker and "payment_id" in result:
                try:
                    await self.payment_tracker.record_usage(
                        payment_id=result["payment_id"],
                        endpoint=path,
                        method=request.method,
                        ip_address=request.client.host if request.client else None,
                        user_agent=request.headers.get("user-agent"),
                    )
                except Exception as e:
                    logger.error(f"Usage recording failed: {e}")

            return await call_next(request)

        return self._create_402_response(request, path)

    def _is_exempt(self, path: str) -> bool:
        return any(path.startswith(e) or path == e for e in EXEMPT_ENDPOINTS)

    def _requires_payment(self, path: str) -> bool:
        return any(path.startswith(p) for p in PAID_ENDPOINTS)

    async def _validate_payment(self, request: Request) -> Dict:
        # Token check first (faster)
        token = request.headers.get("x-payment-token")
        if token:
            return await self._validate_payment_token(token)

        # On-chain verification
        tx_hash = request.headers.get("x-payment-tx")
        chain = request.headers.get("x-payment-chain", "base")
        if tx_hash:
            return await self._validate_onchain_payment(tx_hash, chain)

        return {"is_valid": False, "reason": "No payment provided"}

    async def _validate_payment_token(self, token: str) -> Dict:
        if not self.payment_tracker:
            return {"is_valid": False, "reason": "Payment tracker not configured"}

        try:
            payment = await self.payment_tracker.get_payment_by_token(token)
            if not payment:
                return {"is_valid": False, "reason": "Invalid token"}
            if payment["requests_remaining"] <= 0:
                return {"is_valid": False, "reason": "No requests remaining"}

            return {
                "is_valid": True,
                "payment_id": payment["id"],
                "payment_type": "token",
                "requests_remaining": payment["requests_remaining"] - 1,
            }
        except Exception as e:
            logger.error(f"Token validation error: {e}")
            return {"is_valid": False, "reason": str(e)}

    async def _validate_onchain_payment(self, tx_hash: str, chain: str) -> Dict:
        try:
            result = await payment_verifier.verify_payment(tx_hash, chain)

            if not result.is_valid:
                return {
                    "is_valid": False,
                    "reason": result.error_message or "Verification failed",
                }

            if self.payment_tracker:
                record = await self.payment_tracker.create_payment_record(
                    tx_hash=result.tx_hash,
                    chain=result.chain,
                    amount_usdc=float(result.amount_usdc),
                    from_address=result.from_address,
                    to_address=result.to_address,
                    block_number=result.block_number,
                    confirmations=result.confirmations,
                    risk_score=result.risk_score,
                )
                return {
                    "is_valid": True,
                    "payment_id": record["id"],
                    "payment_type": "onchain",
                    "amount_usdc": float(result.amount_usdc),
                    "from_address": result.from_address,
                }

            return {
                "is_valid": True,
                "payment_type": "onchain",
                "amount_usdc": float(result.amount_usdc),
                "from_address": result.from_address,
            }

        except Exception as e:
            logger.error(f"On-chain validation error: {e}")
            return {"is_valid": False, "reason": str(e)}

    def _create_402_response(self, request: Request, path: str) -> JSONResponse:
        cfg = self.config
        price = cfg.get_endpoint_price(path)

        body = {
            "error": "Payment Required",
            "status": 402,
            "endpoint": path,
            "price": {"amount": str(price), "currency": "USDC", "decimals": 6},
            "payment_methods": {
                "onchain": {
                    "supported_chains": {
                        "base": {
                            "address": cfg.base_payment_address,
                            "usdc_contract": cfg.base_usdc_contract,
                            "confirmations": cfg.base_confirmations,
                        },
                        "ethereum": {
                            "address": cfg.ethereum_payment_address,
                            "usdc_contract": cfg.ethereum_usdc_contract,
                            "confirmations": cfg.ethereum_confirmations,
                        },
                        "solana": {
                            "address": cfg.solana_payment_address,
                            "usdc_mint": cfg.solana_usdc_mint,
                            "confirmations": cfg.solana_confirmations,
                        },
                    },
                    "headers": ["X-Payment-Tx", "X-Payment-Chain"],
                },
                "token": {"header": "X-Payment-Token"},
            },
            "pricing": {
                "requests_per_dollar": cfg.requests_per_dollar,
                "token_expiry_hours": cfg.token_expiry_hours,
            },
        }

        return JSONResponse(
            status_code=402,
            content=body,
            headers={
                "X-Payment-Required": "true",
                "X-Payment-Amount": str(price),
                "X-Payment-Currency": "USDC",
            },
        )
