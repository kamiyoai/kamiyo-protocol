"""Database operations for x402 payments."""

import logging
from typing import Optional, List, Dict
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from .models import X402Payment, X402Token, X402Usage

logger = logging.getLogger(__name__)


class X402Database:
    def __init__(self, db: Session):
        self.db = db

    async def create_payment(
        self,
        tx_hash: str,
        chain: str,
        amount_usdc: Decimal,
        from_address: str,
        to_address: str,
        block_number: int,
        confirmations: int,
        risk_score: float,
        requests_allocated: int,
        expires_at: datetime,
    ) -> X402Payment:
        existing = self.db.query(X402Payment).filter(X402Payment.tx_hash == tx_hash).first()
        if existing:
            return existing

        payment = X402Payment(
            tx_hash=tx_hash,
            chain=chain,
            amount_usdc=amount_usdc,
            from_address=from_address,
            to_address=to_address,
            block_number=block_number,
            confirmations=confirmations,
            status="verified",
            risk_score=risk_score,
            requests_allocated=requests_allocated,
            requests_used=0,
            verified_at=datetime.utcnow(),
            expires_at=expires_at,
        )

        self.db.add(payment)
        self.db.commit()
        self.db.refresh(payment)
        return payment

    async def get_payment_by_id(self, payment_id: int) -> Optional[X402Payment]:
        return self.db.query(X402Payment).filter(X402Payment.id == payment_id).first()

    async def get_payment_by_tx_hash(self, tx_hash: str) -> Optional[X402Payment]:
        return self.db.query(X402Payment).filter(X402Payment.tx_hash == tx_hash).first()

    async def update_payment_usage(self, payment_id: int) -> bool:
        payment = await self.get_payment_by_id(payment_id)
        if not payment or payment.requests_used >= payment.requests_allocated:
            return False

        payment.requests_used += 1
        payment.updated_at = datetime.utcnow()

        if payment.requests_used >= payment.requests_allocated:
            payment.status = "used"

        self.db.commit()
        return True

    async def cleanup_expired_payments(self) -> int:
        expired_count = (
            self.db.query(X402Payment)
            .filter(
                and_(X402Payment.status == "verified", X402Payment.expires_at < datetime.utcnow())
            )
            .update({"status": "expired", "updated_at": datetime.utcnow()})
        )

        self.db.query(X402Token).filter(X402Token.expires_at < datetime.utcnow()).delete()
        self.db.commit()
        return expired_count

    async def create_token(
        self, token_hash: str, payment_id: int, expires_at: datetime
    ) -> X402Token:
        token = X402Token(token_hash=token_hash, payment_id=payment_id, expires_at=expires_at)
        self.db.add(token)
        self.db.commit()
        self.db.refresh(token)
        return token

    async def get_token_by_hash(self, token_hash: str) -> Optional[X402Token]:
        return self.db.query(X402Token).filter(X402Token.token_hash == token_hash).first()

    async def get_payment_by_token_hash(self, token_hash: str) -> Optional[X402Payment]:
        token = await self.get_token_by_hash(token_hash)
        if not token or not token.is_valid:
            return None

        token.last_used_at = datetime.utcnow()
        self.db.commit()
        return token.payment

    async def record_usage(
        self,
        payment_id: int,
        endpoint: str,
        method: str,
        status_code: int,
        response_time_ms: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> X402Usage:
        usage = X402Usage(
            payment_id=payment_id,
            endpoint=endpoint,
            method=method,
            status_code=status_code,
            response_time_ms=response_time_ms,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.db.add(usage)
        self.db.commit()
        self.db.refresh(usage)
        return usage

    async def get_payment_stats(
        self,
        from_address: Optional[str] = None,
        chain: Optional[str] = None,
        hours: int = 24,
    ) -> Dict:
        cutoff = datetime.utcnow() - timedelta(hours=hours)

        query = self.db.query(
            func.count(X402Payment.id).label("total_payments"),
            func.sum(X402Payment.amount_usdc).label("total_amount"),
            func.sum(X402Payment.requests_allocated).label("total_allocated"),
            func.sum(X402Payment.requests_used).label("total_used"),
            func.count(func.distinct(X402Payment.from_address)).label("unique_payers"),
            func.avg(X402Payment.amount_usdc).label("average_payment"),
        ).filter(X402Payment.created_at >= cutoff, X402Payment.status == "verified")

        if from_address:
            query = query.filter(X402Payment.from_address == from_address)
        if chain:
            query = query.filter(X402Payment.chain == chain)

        result = query.first()

        return {
            "total_payments": result.total_payments or 0,
            "total_amount_usdc": float(result.total_amount or 0),
            "total_requests_allocated": result.total_allocated or 0,
            "total_requests_used": result.total_used or 0,
            "unique_payers": result.unique_payers or 0,
            "average_payment_usdc": float(result.average_payment or 0),
        }

    async def get_active_payments(self, limit: int = 100) -> List[X402Payment]:
        return (
            self.db.query(X402Payment)
            .filter(
                and_(
                    X402Payment.status == "verified",
                    X402Payment.expires_at > datetime.utcnow(),
                    X402Payment.requests_allocated > X402Payment.requests_used,
                )
            )
            .order_by(X402Payment.created_at.desc())
            .limit(limit)
            .all()
        )
