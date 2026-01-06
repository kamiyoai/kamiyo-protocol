"""x402 payment API routes."""

import logging
from typing import Optional
from decimal import Decimal
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from .config import get_x402_config
from .payment_verifier import payment_verifier
from .payment_tracker import PaymentTracker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/x402", tags=["x402"])

payment_tracker: Optional[PaymentTracker] = None


class VerifyPaymentRequest(BaseModel):
    tx_hash: str
    chain: str = "base"
    expected_amount: Optional[float] = None


class VerifyPaymentResponse(BaseModel):
    is_valid: bool
    tx_hash: str
    chain: str
    amount_usdc: str
    from_address: str
    to_address: str
    confirmations: int
    risk_score: float
    payment_id: Optional[int] = None
    error_message: Optional[str] = None


class GenerateTokenRequest(BaseModel):
    payment_id: int


class GenerateTokenResponse(BaseModel):
    token: str
    payment_id: int
    expires_at: str
    requests_remaining: int


class TokenStatusResponse(BaseModel):
    is_valid: bool
    payment_id: Optional[int] = None
    requests_remaining: Optional[int] = None
    expires_at: Optional[str] = None
    error: Optional[str] = None


@router.get("/pricing")
async def get_pricing():
    config = get_x402_config()
    return {
        "default_price_usdc": str(config.default_price),
        "requests_per_dollar": config.requests_per_dollar,
        "token_expiry_hours": config.token_expiry_hours,
        "endpoint_prices": {k: str(v) for k, v in config.endpoint_prices.items()},
        "payment_methods": ["onchain_usdc", "payment_token"],
        "supported_chains": payment_verifier.get_supported_chains(),
    }


@router.get("/chains")
async def get_supported_chains():
    config = get_x402_config()
    return {
        "chains": [
            {
                "name": "base",
                "payment_address": config.base_payment_address,
                "usdc_contract": config.base_usdc_contract,
                "confirmations": config.base_confirmations,
                "recommended": True,
            },
            {
                "name": "ethereum",
                "payment_address": config.ethereum_payment_address,
                "usdc_contract": config.ethereum_usdc_contract,
                "confirmations": config.ethereum_confirmations,
                "recommended": False,
            },
            {
                "name": "solana",
                "payment_address": config.solana_payment_address,
                "usdc_mint": config.solana_usdc_mint,
                "confirmations": config.solana_confirmations,
                "recommended": True,
            },
        ]
    }


@router.post("/verify", response_model=VerifyPaymentResponse)
async def verify_payment(request: VerifyPaymentRequest):
    try:
        expected = Decimal(str(request.expected_amount)) if request.expected_amount else None

        result = await payment_verifier.verify_payment(
            tx_hash=request.tx_hash,
            chain=request.chain,
            expected_amount=expected,
        )

        response = VerifyPaymentResponse(
            is_valid=result.is_valid,
            tx_hash=result.tx_hash,
            chain=result.chain,
            amount_usdc=str(result.amount_usdc),
            from_address=result.from_address,
            to_address=result.to_address,
            confirmations=result.confirmations,
            risk_score=result.risk_score,
            error_message=result.error_message,
        )

        if result.is_valid and payment_tracker:
            try:
                record = await payment_tracker.create_payment_record(
                    tx_hash=result.tx_hash,
                    chain=result.chain,
                    amount_usdc=float(result.amount_usdc),
                    from_address=result.from_address,
                    to_address=result.to_address,
                    block_number=result.block_number,
                    confirmations=result.confirmations,
                    risk_score=result.risk_score,
                )
                response.payment_id = record["id"]
            except Exception as e:
                logger.error(f"Failed to record payment: {e}")

        return response

    except Exception as e:
        logger.error(f"Verification error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-token", response_model=GenerateTokenResponse)
async def generate_payment_token(request: GenerateTokenRequest):
    if not payment_tracker:
        raise HTTPException(status_code=503, detail="Payment tracker unavailable")

    try:
        token = await payment_tracker.generate_payment_token(request.payment_id)
        payment = await payment_tracker.get_payment_by_token(token)

        if not payment:
            raise HTTPException(status_code=500, detail="Failed to retrieve payment")

        return GenerateTokenResponse(
            token=token,
            payment_id=payment["id"],
            expires_at=payment["expires_at"].isoformat() if payment["expires_at"] else "",
            requests_remaining=payment["requests_remaining"],
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Token generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/token/status", response_model=TokenStatusResponse)
async def get_token_status(x_payment_token: Optional[str] = Header(None)):
    if not x_payment_token:
        raise HTTPException(status_code=400, detail="X-Payment-Token header required")

    if not payment_tracker:
        raise HTTPException(status_code=503, detail="Payment tracker unavailable")

    try:
        payment = await payment_tracker.get_payment_by_token(x_payment_token)

        if not payment:
            return TokenStatusResponse(is_valid=False, error="Invalid or expired token")

        return TokenStatusResponse(
            is_valid=True,
            payment_id=payment["id"],
            requests_remaining=payment["requests_remaining"],
            expires_at=payment["expires_at"].isoformat() if payment["expires_at"] else None,
        )

    except Exception as e:
        logger.error(f"Token status error: {e}")
        return TokenStatusResponse(is_valid=False, error=str(e))


@router.get("/stats")
async def get_payment_stats(x_admin_key: Optional[str] = Header(None)):
    config = get_x402_config()

    if x_admin_key != config.admin_key:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not payment_tracker:
        raise HTTPException(status_code=503, detail="Payment tracker unavailable")

    try:
        return await payment_tracker.get_payment_stats()
    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cleanup")
async def cleanup_expired(x_admin_key: Optional[str] = Header(None)):
    config = get_x402_config()

    if x_admin_key != config.admin_key:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not payment_tracker:
        raise HTTPException(status_code=503, detail="Payment tracker unavailable")

    try:
        count = await payment_tracker.cleanup_expired_payments()
        return {"cleaned_up": count}
    except Exception as e:
        logger.error(f"Cleanup error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
