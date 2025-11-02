#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KAMIYO Payment Tracker
Track and manage x402 payment records and usage
Database-backed implementation for production
"""

import logging
import secrets
import hashlib
from typing import Dict, Optional
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session

from .config import get_x402_config
from .database import X402Database

logger = logging.getLogger(__name__)


class PaymentTracker:
    """
    Track x402 payments and manage payment tokens
    Database-backed implementation using PostgreSQL/SQLite
    """

    def __init__(self, db: Optional[Session] = None):
        self.db_session = db
        self.config = get_x402_config()
        self.token_expiry_hours = self.config.token_expiry_hours
        self.requests_per_dollar = int(self.config.requests_per_dollar)
    
    def _get_db(self) -> X402Database:
        """Get database instance"""
        if not self.db_session:
            from api.database import SessionLocal
            self.db_session = SessionLocal()
        return X402Database(self.db_session)

    async def create_payment_record(
        self,
        tx_hash: str,
        chain: str,
        amount_usdc: float,
        from_address: str,
        to_address: str,
        block_number: int,
        confirmations: int,
        risk_score: float = 0.1
    ) -> Dict[str, any]:
        """Create a new payment record from verified transaction"""

        db = self._get_db()

        # Check if payment already exists
        existing = await db.get_payment_by_tx_hash(tx_hash)
        if existing:
            return self._payment_to_dict(existing)

        # Calculate requests based on payment amount
        # $1 = requests_per_dollar (default 10), scaled linearly
        requests_allocated = int(amount_usdc * self.requests_per_dollar)

        # Calculate expiry time
        expires_at = datetime.utcnow() + timedelta(hours=self.token_expiry_hours)

        # Create payment record in database
        payment = await db.create_payment(
            tx_hash=tx_hash,
            chain=chain,
            amount_usdc=Decimal(str(amount_usdc)),
            from_address=from_address,
            to_address=to_address,
            block_number=block_number,
            confirmations=confirmations,
            risk_score=risk_score,
            requests_allocated=requests_allocated,
            expires_at=expires_at
        )

        logger.info(f"Created payment record: {payment.id} for {amount_usdc} USDC")

        return self._payment_to_dict(payment)
    
    async def generate_payment_token(self, payment_id: int) -> str:
        """Generate a payment access token for a verified payment"""

        db = self._get_db()

        # Get payment record
        payment = await db.get_payment_by_id(payment_id)
        if not payment:
            raise ValueError(f"Payment not found: {payment_id}")

        if payment.status != 'verified':
            raise ValueError(f"Payment not verified: {payment_id}")

        # Generate secure random token
        raw_token = secrets.token_urlsafe(32)
        token_hash = self._hash_token(raw_token)

        # Create token record in database
        await db.create_token(
            token_hash=token_hash,
            payment_id=payment_id,
            expires_at=payment.expires_at
        )

        logger.info(f"Generated payment token for payment {payment_id}")

        return raw_token
    
    async def get_payment_by_token(self, token: str) -> Optional[Dict[str, any]]:
        """Get payment record by token"""

        db = self._get_db()

        token_hash = self._hash_token(token)

        # Get payment by token hash (also validates expiry)
        payment = await db.get_payment_by_token_hash(token_hash)

        if not payment:
            return None

        return self._payment_to_dict(payment)
    
    async def record_usage(
        self,
        payment_id: int,
        endpoint: str,
        method: str = 'GET',
        status_code: int = 200,
        response_time_ms: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """Record API usage for a payment"""

        db = self._get_db()

        # Update payment usage counter
        success = await db.update_payment_usage(payment_id)

        if not success:
            raise ValueError(f"Failed to update payment usage for payment {payment_id}")

        # Record usage in analytics table
        await db.record_usage(
            payment_id=payment_id,
            endpoint=endpoint,
            method=method,
            status_code=status_code,
            response_time_ms=response_time_ms,
            ip_address=ip_address,
            user_agent=user_agent
        )

        logger.info(f"Recorded usage for payment {payment_id}: {endpoint}")
    
    async def get_payment_stats(self, from_address: str = None, chain: str = None) -> Dict[str, any]:
        """Get payment statistics"""

        db = self._get_db()

        return await db.get_payment_stats(
            from_address=from_address,
            chain=chain,
            hours=24
        )
    
    async def cleanup_expired_payments(self) -> int:
        """Clean up expired payments and tokens"""

        db = self._get_db()

        expired_count = await db.cleanup_expired_payments()

        if expired_count > 0:
            logger.info(f"Cleaned up {expired_count} expired payments")

        return expired_count
    
    def _hash_token(self, token: str) -> str:
        """Hash token for secure storage"""
        return hashlib.sha256(token.encode()).hexdigest()

    def _payment_to_dict(self, payment) -> Dict[str, any]:
        """Convert payment model to dictionary"""
        return {
            'id': payment.id,
            'tx_hash': payment.tx_hash,
            'chain': payment.chain,
            'amount_usdc': float(payment.amount_usdc),
            'from_address': payment.from_address,
            'to_address': payment.to_address,
            'status': payment.status,
            'risk_score': float(payment.risk_score),
            'created_at': payment.created_at,
            'verified_at': payment.verified_at,
            'expires_at': payment.expires_at,
            'requests_allocated': payment.requests_allocated,
            'requests_used': payment.requests_used,
            'requests_remaining': payment.requests_remaining
        }


# Factory function for dependency injection
def get_payment_tracker(db: Session) -> PaymentTracker:
    """Get PaymentTracker instance with database session"""
    return PaymentTracker(db=db)
