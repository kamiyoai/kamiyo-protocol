"""Standalone x402 payment verifier API."""

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from decimal import Decimal
import os
import logging

from .payment_verifier import payment_verifier

logger = logging.getLogger(__name__)

app = FastAPI(title="x402 Payment Verifier", version="1.0.0")


class VerifyRequest(BaseModel):
    tx_hash: str
    chain: str
    expected_amount: Optional[float] = None


class VerifyResponse(BaseModel):
    is_valid: bool
    tx_hash: str
    chain: str
    amount_usdc: str
    from_address: str
    to_address: str
    confirmations: int
    risk_score: float
    error_message: Optional[str] = None


@app.post("/verify", response_model=VerifyResponse)
async def verify_payment(request: VerifyRequest, x_internal_key: Optional[str] = Header(None)):
    expected_key = os.getenv("PYTHON_VERIFIER_KEY", "")
    if expected_key and x_internal_key != expected_key:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        expected = Decimal(str(request.expected_amount)) if request.expected_amount else None

        result = await payment_verifier.verify_payment(
            tx_hash=request.tx_hash,
            chain=request.chain,
            expected_amount=expected,
        )

        return VerifyResponse(
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

    except Exception as e:
        logger.error(f"Verification error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "x402-verifier",
        "supported_chains": payment_verifier.get_supported_chains(),
    }


@app.get("/chains")
async def get_chains():
    return {"chains": payment_verifier.get_supported_chains()}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api.x402.verifier_api:app", host="0.0.0.0", port=8001, reload=True)
