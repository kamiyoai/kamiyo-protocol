"""
Database operations for x402 Payment Facilitator
"""

import logging
from typing import Optional, List, Dict
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from .models import X402Payment, X402Token, X402Usage, X402Analytics

logger = logging.getLogger(__name__)


class X402Database:
    """Database operations for x402 payment system"""

    def __init__(self, db: Session):
        self.db = db

    # Payment operations

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
        expires_at: datetime
    ) -> X402Payment:
        """Create a new payment record"""

        # Check if payment already exists
        existing = self.db.query(X402Payment).filter(
            X402Payment.tx_hash == tx_hash
        ).first()

        if existing:
            logger.warning(f"Payment already exists for tx_hash: {tx_hash}")
            return existing

        payment = X402Payment(
            tx_hash=tx_hash,
            chain=chain,
            amount_usdc=amount_usdc,
            from_address=from_address,
            to_address=to_address,
            block_number=block_number,
            confirmations=confirmations,
            status='verified',
            risk_score=risk_score,
            requests_allocated=requests_allocated,
            requests_used=0,
            verified_at=datetime.utcnow(),
            expires_at=expires_at
        )

        self.db.add(payment)
        self.db.commit()
        self.db.refresh(payment)

        logger.info(f"Created payment record: {payment.id} for {amount_usdc} USDC")
        return payment

    async def get_payment_by_id(self, payment_id: int) -> Optional[X402Payment]:
        """Get payment by ID"""
        return self.db.query(X402Payment).filter(
            X402Payment.id == payment_id
        ).first()

    async def get_payment_by_tx_hash(self, tx_hash: str) -> Optional[X402Payment]:
        """Get payment by transaction hash"""
        return self.db.query(X402Payment).filter(
            X402Payment.tx_hash == tx_hash
        ).first()

    async def update_payment_usage(self, payment_id: int) -> bool:
        """Increment requests_used for a payment"""
        payment = await self.get_payment_by_id(payment_id)

        if not payment:
            return False

        if payment.requests_used >= payment.requests_allocated:
            logger.warning(f"Payment {payment_id} has no remaining requests")
            return False

        payment.requests_used += 1
        payment.updated_at = datetime.utcnow()

        # Mark as 'used' if all requests consumed
        if payment.requests_used >= payment.requests_allocated:
            payment.status = 'used'

        self.db.commit()
        return True

    async def cleanup_expired_payments(self) -> int:
        """Mark expired payments and delete expired tokens"""

        # Update expired verified payments
        expired_count = self.db.query(X402Payment).filter(
            and_(
                X402Payment.status == 'verified',
                X402Payment.expires_at < datetime.utcnow()
            )
        ).update({
            'status': 'expired',
            'updated_at': datetime.utcnow()
        })

        # Delete expired tokens
        self.db.query(X402Token).filter(
            X402Token.expires_at < datetime.utcnow()
        ).delete()

        self.db.commit()

        if expired_count > 0:
            logger.info(f"Cleaned up {expired_count} expired payments")

        return expired_count

    # Token operations

    async def create_token(
        self,
        token_hash: str,
        payment_id: int,
        expires_at: datetime
    ) -> X402Token:
        """Create a new payment token"""

        token = X402Token(
            token_hash=token_hash,
            payment_id=payment_id,
            expires_at=expires_at
        )

        self.db.add(token)
        self.db.commit()
        self.db.refresh(token)

        logger.info(f"Created token for payment {payment_id}")
        return token

    async def get_token_by_hash(self, token_hash: str) -> Optional[X402Token]:
        """Get token by hash"""
        return self.db.query(X402Token).filter(
            X402Token.token_hash == token_hash
        ).first()

    async def get_payment_by_token_hash(self, token_hash: str) -> Optional[X402Payment]:
        """Get payment record by token hash"""
        token = await self.get_token_by_hash(token_hash)

        if not token:
            return None

        # Check if token is expired
        if not token.is_valid:
            return None

        # Update last_used_at
        token.last_used_at = datetime.utcnow()
        self.db.commit()

        return token.payment

    # Usage tracking

    async def record_usage(
        self,
        payment_id: int,
        endpoint: str,
        method: str,
        status_code: int,
        response_time_ms: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> X402Usage:
        """Record API usage"""

        usage = X402Usage(
            payment_id=payment_id,
            endpoint=endpoint,
            method=method,
            status_code=status_code,
            response_time_ms=response_time_ms,
            ip_address=ip_address,
            user_agent=user_agent
        )

        self.db.add(usage)
        self.db.commit()
        self.db.refresh(usage)

        return usage

    # Analytics

    async def get_payment_stats(
        self,
        from_address: Optional[str] = None,
        chain: Optional[str] = None,
        hours: int = 24
    ) -> Dict:
        """Get payment statistics"""

        cutoff = datetime.utcnow() - timedelta(hours=hours)

        query = self.db.query(
            func.count(X402Payment.id).label('total_payments'),
            func.sum(X402Payment.amount_usdc).label('total_amount'),
            func.sum(X402Payment.requests_allocated).label('total_allocated'),
            func.sum(X402Payment.requests_used).label('total_used'),
            func.count(func.distinct(X402Payment.from_address)).label('unique_payers'),
            func.avg(X402Payment.amount_usdc).label('average_payment')
        ).filter(
            X402Payment.created_at >= cutoff,
            X402Payment.status == 'verified'
        )

        if from_address:
            query = query.filter(X402Payment.from_address == from_address)

        if chain:
            query = query.filter(X402Payment.chain == chain)

        result = query.first()

        return {
            'total_payments': result.total_payments or 0,
            'total_amount_usdc': float(result.total_amount or 0),
            'total_requests_allocated': result.total_allocated or 0,
            'total_requests_used': result.total_used or 0,
            'unique_payers': result.unique_payers or 0,
            'average_payment_usdc': float(result.average_payment or 0)
        }

    async def get_active_payments(self, limit: int = 100) -> List[X402Payment]:
        """Get active payments with remaining requests"""

        return self.db.query(X402Payment).filter(
            and_(
                X402Payment.status == 'verified',
                X402Payment.expires_at > datetime.utcnow(),
                X402Payment.requests_allocated > X402Payment.requests_used
            )
        ).order_by(
            X402Payment.created_at.desc()
        ).limit(limit).all()

    async def get_top_payers(self, limit: int = 100) -> List[Dict]:
        """Get top payers by total spending"""

        results = self.db.query(
            X402Payment.from_address,
            func.count(X402Payment.id).label('payment_count'),
            func.sum(X402Payment.amount_usdc).label('total_spent'),
            func.sum(X402Payment.requests_used).label('total_requests'),
            func.max(X402Payment.created_at).label('last_payment')
        ).filter(
            X402Payment.status.in_(['verified', 'used'])
        ).group_by(
            X402Payment.from_address
        ).order_by(
            func.sum(X402Payment.amount_usdc).desc()
        ).limit(limit).all()

        return [
            {
                'from_address': r.from_address,
                'payment_count': r.payment_count,
                'total_spent_usdc': float(r.total_spent),
                'total_requests_used': r.total_requests,
                'last_payment_at': r.last_payment.isoformat() if r.last_payment else None
            }
            for r in results
        ]

    async def get_endpoint_stats(self, hours: int = 24) -> List[Dict]:
        """Get API endpoint usage statistics"""

        cutoff = datetime.utcnow() - timedelta(hours=hours)

        results = self.db.query(
            X402Usage.endpoint,
            func.count(X402Usage.id).label('request_count'),
            func.avg(X402Usage.response_time_ms).label('avg_response_time'),
            func.count(func.distinct(X402Usage.payment_id)).label('unique_payers'),
            func.sum(
                func.case(
                    [(and_(X402Usage.status_code >= 200, X402Usage.status_code < 300), 1)],
                    else_=0
                )
            ).label('success_count'),
            func.sum(
                func.case(
                    [(X402Usage.status_code >= 400, 1)],
                    else_=0
                )
            ).label('error_count')
        ).filter(
            X402Usage.created_at >= cutoff
        ).group_by(
            X402Usage.endpoint
        ).order_by(
            func.count(X402Usage.id).desc()
        ).all()

        return [
            {
                'endpoint': r.endpoint,
                'request_count': r.request_count,
                'avg_response_time_ms': float(r.avg_response_time) if r.avg_response_time else None,
                'unique_payers': r.unique_payers,
                'success_count': r.success_count,
                'error_count': r.error_count
            }
            for r in results
        ]


def get_x402_db(db: Session) -> X402Database:
    """Factory function to create X402Database instance"""
    return X402Database(db)
