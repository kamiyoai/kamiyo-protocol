#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KAMIYO x402 Payment Routes
API endpoints for x402 payment management
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel

from .payment_verifier import payment_verifier
from .payment_tracker import payment_tracker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/x402", tags=["x402 Payments"])

class PaymentVerificationRequest(BaseModel):
    tx_hash: str
    chain: str = "base"
    expected_amount: Optional[float] = None

class PaymentVerificationResponse(BaseModel):
    is_valid: bool
    tx_hash: str
    chain: str
    amount_usdc: float
    from_address: str
    to_address: str
    block_number: int
    confirmations: int
    risk_score: float
    error_message: Optional[str] = None
    payment_id: Optional[int] = None

class PaymentTokenResponse(BaseModel):
    payment_token: str
    payment_id: int
    expires_at: str
    requests_remaining: int

class PaymentStatsResponse(BaseModel):
    total_payments: int
    total_amount_usdc: float
    active_payments: int
    average_payment: float
    total_requests_used: float

@router.get("/supported-chains")
async def get_supported_chains():
    """Get list of supported blockchain networks for payments"""
    return {
        "supported_chains": payment_verifier.get_supported_chains(),
        "payment_addresses": {
            chain: payment_verifier.get_payment_address(chain)
            for chain in payment_verifier.get_supported_chains()
        },
        "min_payment_amount": float(payment_verifier.min_payment_amount)
    }

@router.post("/verify-payment", response_model=PaymentVerificationResponse)
async def verify_payment(request: PaymentVerificationRequest):
    """
    Verify on-chain payment and create payment record
    
    This endpoint:
    1. Verifies the payment transaction on the specified chain
    2. Creates a payment record if verification succeeds
    3. Returns payment details including risk score
    """
    try:
        # Verify the payment
        verification = await payment_verifier.verify_payment(
            request.tx_hash,
            request.chain,
            request.expected_amount
        )
        
        # Convert to response model
        response_data = {
            "is_valid": verification.is_valid,
            "tx_hash": verification.tx_hash,
            "chain": verification.chain,
            "amount_usdc": float(verification.amount_usdc),
            "from_address": verification.from_address,
            "to_address": verification.to_address,
            "block_number": verification.block_number,
            "confirmations": verification.confirmations,
            "risk_score": verification.risk_score,
            "error_message": verification.error_message
        }
        
        # If payment is valid, create payment record
        if verification.is_valid:
            payment_record = await payment_tracker.create_payment_record(
                tx_hash=request.tx_hash,
                chain=request.chain,
                amount_usdc=float(verification.amount_usdc),
                from_address=verification.from_address,
                risk_score=verification.risk_score
            )
            response_data["payment_id"] = payment_record["id"]
        
        return PaymentVerificationResponse(**response_data)
        
    except Exception as e:
        logger.error(f"Error verifying payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-token/{payment_id}", response_model=PaymentTokenResponse)
async def generate_payment_token(payment_id: int):
    """
    Generate payment access token for verified payment
    
    This token can be used in the x-payment-token header
    to access paid API endpoints without repeating on-chain verification.
    """
    try:
        # Generate payment token
        payment_token = await payment_tracker.generate_payment_token(payment_id)
        
        # Get payment record for expiry info
        payment_record = await payment_tracker.get_payment_by_token(payment_token)
        
        if not payment_record:
            raise HTTPException(status_code=404, detail="Payment not found")
        
        return PaymentTokenResponse(
            payment_token=payment_token,
            payment_id=payment_id,
            expires_at=payment_record["expires_at"].isoformat(),
            requests_remaining=payment_record["requests_remaining"]
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error generating payment token: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/payment/{payment_id}")
async def get_payment_status(payment_id: int):
    """Get payment status and remaining requests"""
    try:
        # Find payment record
        payment = payment_tracker.payments.get(payment_id)
        
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")
        
        return {
            "payment_id": payment.id,
            "tx_hash": payment.tx_hash,
            "chain": payment.chain,
            "amount_usdc": payment.amount_usdc,
            "from_address": payment.from_address,
            "status": payment.status,
            "risk_score": payment.risk_score,
            "created_at": payment.created_at.isoformat(),
            "expires_at": payment.expires_at.isoformat(),
            "requests_remaining": payment.requests_remaining
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting payment status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stats", response_model=PaymentStatsResponse)
async def get_payment_stats(
    from_address: Optional[str] = Query(None, description="Filter by sender address")
):
    """Get payment statistics"""
    try:
        stats = await payment_tracker.get_payment_stats(from_address)
        return PaymentStatsResponse(**stats)
        
    except Exception as e:
        logger.error(f"Error getting payment stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cleanup")
async def cleanup_expired_payments(
    x_admin_key: Optional[str] = Header(None, description="Admin API key")
):
    """
    Clean up expired payments and tokens
    
    This is an admin endpoint that should be called periodically
    to remove expired payment records and tokens.
    """
    try:
        # Simple admin auth (in production, use proper auth)
        admin_key = "test-admin-key"  # Should be from environment
        if x_admin_key != admin_key:
            raise HTTPException(status_code=403, detail="Invalid admin key")
        
        await payment_tracker.cleanup_expired_payments()
        
        return {
            "status": "success",
            "message": "Expired payments cleaned up"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cleaning up payments: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/pricing")
async def get_pricing_info():
    """Get x402 payment pricing information"""
    return {
        "pricing_tiers": {
            "pay_per_use": {
                "price_per_call": 0.10,  # $0.10
                "min_payment": 1.00,     # $1.00 minimum
                "requests_per_dollar": 1000,  # 1000 requests per $1.00
                "supported_chains": payment_verifier.get_supported_chains()
            },
            "subscription_included": {
                "pro_tier": {
                    "monthly_price": 29.00,
                    "included_calls": 1000,  # 1000 included calls
                    "overage_rate": 0.05     # $0.05 per additional call
                }
            }
        },
        "payment_methods": [
            {
                "type": "onchain",
                "description": "Send USDC payment on supported chains",
                "instructions": "Use /x402/verify-payment after payment"
            },
            {
                "type": "token",
                "description": "Use payment token for multiple requests",
                "instructions": "Use /x402/generate-token after payment verification"
            }
        ]
    }