#!/usr/bin/env python3
"""
FastAPI wrapper for x402 payment verifier
Provides HTTP API for the SaaS layer to call

Run with:
    uvicorn api.x402.verifier_api:app --host 0.0.0.0 --port 8001

Or add to existing FastAPI app:
    from api.x402.verifier_api import router as x402_router
    app.include_router(x402_router, prefix="/x402")
"""

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from decimal import Decimal
import os
import logging

from .payment_verifier import payment_verifier

logger = logging.getLogger(__name__)

app = FastAPI(
    title="x402 Payment Verifier API",
    description="Multi-chain USDC payment verification",
    version="1.0.0"
)


class VerifyPaymentRequest(BaseModel):
    """Payment verification request"""
    tx_hash: str
    chain: str
    expected_amount: Optional[float] = None


class VerifyPaymentResponse(BaseModel):
    """Payment verification response"""
    is_valid: bool
    tx_hash: str
    chain: str
    amount_usdc: str
    from_address: str
    to_address: str
    confirmations: int
    risk_score: float
    error_message: Optional[str] = None


@app.post("/verify", response_model=VerifyPaymentResponse)
async def verify_payment(
    request: VerifyPaymentRequest,
    x_internal_key: Optional[str] = Header(None)
):
    """
    Verify on-chain USDC payment

    Authenticates via X-Internal-Key header for internal use only.
    This endpoint should not be exposed publicly.
    """
    # Internal authentication
    expected_key = os.getenv('PYTHON_VERIFIER_KEY', '')
    if expected_key and x_internal_key != expected_key:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        # Convert expected_amount to Decimal if provided
        expected_amount = None
        if request.expected_amount is not None:
            expected_amount = Decimal(str(request.expected_amount))

        # Call payment verifier
        result = await payment_verifier.verify_payment(
            tx_hash=request.tx_hash,
            chain=request.chain,
            expected_amount=expected_amount
        )

        # Return response
        return VerifyPaymentResponse(
            is_valid=result.is_valid,
            tx_hash=result.tx_hash,
            chain=result.chain,
            amount_usdc=str(result.amount_usdc),
            from_address=result.from_address,
            to_address=result.to_address,
            confirmations=result.confirmations,
            risk_score=result.risk_score,
            error_message=result.error_message
        )

    except Exception as e:
        logger.error(f"Verification error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Verification failed: {str(e)}"
        )


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "x402-verifier",
        "supported_chains": payment_verifier.get_supported_chains()
    }


@app.get("/chains")
async def get_supported_chains():
    """Get list of supported blockchain networks"""
    return {
        "chains": payment_verifier.get_supported_chains()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api.x402.verifier_api:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )
