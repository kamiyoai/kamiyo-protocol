"""Payment tracking and token management."""

import logging
import secrets
import hashlib
from typing import Dict, Optional, Any
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session

from .config import get_x402_config
from .database import X402Database

logger = logging.getLogger(__name__)


class PaymentTracker:
    """Database-backed payment tracker."""

    def __init__(self, db: Optional[Session] = None):
        self.db_session = db
        self.config = get_x402_config()
        self.token_expiry_hours = self.config.token_expiry_hours
        self.requests_per_dollar = self.config.requests_per_dollar

    def _get_db(self) -> X402Database:
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
        risk_score: float = 0.1,
    ) -> Dict[str, Any]:
        db = self._get_db()

        existing = await db.get_payment_by_tx_hash(tx_hash)
        if existing:
            return self._to_dict(existing)

        requests_allocated = int(amount_usdc * self.requests_per_dollar)
        expires_at = datetime.utcnow() + timedelta(hours=self.token_expiry_hours)

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
            expires_at=expires_at,
        )

        logger.info(f"Payment recorded: {payment.id} for {amount_usdc} USDC")
        return self._to_dict(payment)

    async def generate_payment_token(self, payment_id: int) -> str:
        db = self._get_db()

        payment = await db.get_payment_by_id(payment_id)
        if not payment:
            raise ValueError(f"Payment not found: {payment_id}")

        if payment.status != "verified":
            raise ValueError(f"Payment not verified: {payment_id}")

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

        await db.create_token(
            token_hash=token_hash,
            payment_id=payment_id,
            expires_at=payment.expires_at,
        )

        logger.info(f"Token generated for payment {payment_id}")
        return raw_token

    async def get_payment_by_token(self, token: str) -> Optional[Dict[str, Any]]:
        db = self._get_db()
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        payment = await db.get_payment_by_token_hash(token_hash)

        if not payment:
            return None

        return self._to_dict(payment)

    async def record_usage(
        self,
        payment_id: int,
        endpoint: str,
        method: str = "GET",
        status_code: int = 200,
        response_time_ms: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ):
        db = self._get_db()

        if not await db.update_payment_usage(payment_id):
            raise ValueError(f"Failed to update usage for payment {payment_id}")

        await db.record_usage(
            payment_id=payment_id,
            endpoint=endpoint,
            method=method,
            status_code=status_code,
            response_time_ms=response_time_ms,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    async def get_payment_stats(
        self, from_address: Optional[str] = None, chain: Optional[str] = None
    ) -> Dict[str, Any]:
        db = self._get_db()
        return await db.get_payment_stats(from_address=from_address, chain=chain, hours=24)

    async def cleanup_expired_payments(self) -> int:
        db = self._get_db()
        count = await db.cleanup_expired_payments()
        if count > 0:
            logger.info(f"Cleaned up {count} expired payments")
        return count

    def _to_dict(self, payment) -> Dict[str, Any]:
        return {
            "id": payment.id,
            "tx_hash": payment.tx_hash,
            "chain": payment.chain,
            "amount_usdc": float(payment.amount_usdc),
            "from_address": payment.from_address,
            "to_address": payment.to_address,
            "status": payment.status,
            "risk_score": float(payment.risk_score),
            "created_at": payment.created_at,
            "verified_at": payment.verified_at,
            "expires_at": payment.expires_at,
            "requests_allocated": payment.requests_allocated,
            "requests_used": payment.requests_used,
            "requests_remaining": payment.requests_remaining,
        }


def get_payment_tracker(db: Session) -> PaymentTracker:
    return PaymentTracker(db=db)
