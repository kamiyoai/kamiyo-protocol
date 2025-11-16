"""
SQLAlchemy models for x402 Payment Facilitator
"""

from sqlalchemy import Column, Integer, String, DECIMAL, BigInteger, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from api.database import Base


class X402Payment(Base):
    """On-chain USDC payment records for x402 HTTP 402 Payment Required"""
    __tablename__ = "x402_payments"

    id = Column(Integer, primary_key=True, index=True)
    tx_hash = Column(String(255), unique=True, nullable=False, index=True)
    chain = Column(String(50), nullable=False, index=True)  # 'base', 'ethereum', 'solana'
    amount_usdc = Column(DECIMAL(18, 6), nullable=False)
    from_address = Column(String(255), nullable=False, index=True)
    to_address = Column(String(255), nullable=False)
    block_number = Column(BigInteger, nullable=False)
    confirmations = Column(Integer, nullable=False)
    status = Column(String(50), nullable=False, index=True)  # 'pending', 'verified', 'expired', 'used'
    risk_score = Column(DECIMAL(3, 2), default=0.1)
    requests_allocated = Column(Integer, nullable=False)
    requests_used = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    verified_at = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    tokens = relationship("X402Token", back_populates="payment", cascade="all, delete-orphan")
    usage_records = relationship("X402Usage", back_populates="payment", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<X402Payment(id={self.id}, tx_hash={self.tx_hash}, chain={self.chain}, amount={self.amount_usdc})>"

    @property
    def requests_remaining(self):
        """Calculate remaining requests"""
        return self.requests_allocated - self.requests_used

    @property
    def is_active(self):
        """Check if payment is active and has requests remaining"""
        return (
            self.status == 'verified' and
            self.expires_at > datetime.utcnow() and
            self.requests_remaining > 0
        )


class X402Token(Base):
    """Payment access tokens for authenticated API requests"""
    __tablename__ = "x402_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)  # SHA256 hash
    payment_id = Column(Integer, ForeignKey("x402_payments.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    last_used_at = Column(DateTime(timezone=True))

    # Relationships
    payment = relationship("X402Payment", back_populates="tokens")

    def __repr__(self):
        return f"<X402Token(id={self.id}, payment_id={self.payment_id})>"

    @property
    def is_valid(self):
        """Check if token is still valid"""
        return self.expires_at > datetime.utcnow()


class X402Usage(Base):
    """API usage tracking per payment for analytics and billing"""
    __tablename__ = "x402_usage"

    id = Column(Integer, primary_key=True, index=True)
    payment_id = Column(Integer, ForeignKey("x402_payments.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(String(255), nullable=False, index=True)
    method = Column(String(10), nullable=False)
    status_code = Column(Integer, nullable=False)
    response_time_ms = Column(Integer)
    ip_address = Column(String(45))
    user_agent = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    payment = relationship("X402Payment", back_populates="usage_records")

    def __repr__(self):
        return f"<X402Usage(id={self.id}, payment_id={self.payment_id}, endpoint={self.endpoint})>"


class X402Analytics(Base):
    """Aggregated payment analytics by hour for reporting and monitoring"""
    __tablename__ = "x402_analytics"

    id = Column(Integer, primary_key=True, index=True)
    hour_bucket = Column(DateTime(timezone=True), nullable=False, index=True)
    chain = Column(String(50), nullable=False, index=True)
    total_payments = Column(Integer, default=0)
    total_amount_usdc = Column(DECIMAL(18, 6), default=0)
    total_requests = Column(Integer, default=0)
    unique_payers = Column(Integer, default=0)
    average_payment_usdc = Column(DECIMAL(18, 6), default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<X402Analytics(hour={self.hour_bucket}, chain={self.chain}, payments={self.total_payments})>"
