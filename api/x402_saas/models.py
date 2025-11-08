"""
SQLAlchemy models for x402 SaaS multi-tenancy
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, ForeignKey, DECIMAL
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from api.database import Base


class SaaSTenant(Base):
    """Multi-tenant customer accounts for x402 SaaS"""
    __tablename__ = "x402_saas_tenants"

    id = Column(String(64), primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    company_name = Column(String(255))
    tier = Column(String(50), nullable=False, index=True)  # 'free', 'starter', 'pro', 'enterprise'
    status = Column(String(50), nullable=False, index=True)  # 'active', 'suspended', 'cancelled'

    # Payment addresses (tenant-specific)
    solana_payment_address = Column(String(255), unique=True, index=True)
    base_payment_address = Column(String(255), unique=True, index=True)
    ethereum_payment_address = Column(String(255), unique=True, index=True)

    # Quotas
    monthly_verification_limit = Column(Integer, nullable=False)
    monthly_verifications_used = Column(Integer, default=0)
    quota_reset_date = Column(DateTime(timezone=True))

    # Features
    enabled_chains = Column(JSON)  # List of allowed chains
    payai_enabled = Column(Boolean, default=False)
    custom_branding = Column(Boolean, default=False)
    webhooks_enabled = Column(Boolean, default=False)

    # Billing
    stripe_customer_id = Column(String(255), index=True)
    stripe_subscription_id = Column(String(255))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    api_keys = relationship("SaaSAPIKey", back_populates="tenant", cascade="all, delete-orphan")
    verifications = relationship("SaaSVerification", back_populates="tenant", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<SaaSTenant(id={self.id}, email={self.email}, tier={self.tier})>"

    @property
    def verifications_remaining(self):
        """Calculate remaining verifications for current period"""
        if self.tier == 'enterprise':
            return -1  # Unlimited
        return max(0, self.monthly_verification_limit - self.monthly_verifications_used)

    @property
    def quota_usage_percent(self):
        """Calculate quota usage as percentage"""
        if self.tier == 'enterprise' or self.monthly_verification_limit == 0:
            return 0.0
        return (self.monthly_verifications_used / self.monthly_verification_limit) * 100


class SaaSAPIKey(Base):
    """API keys for tenant authentication"""
    __tablename__ = "x402_saas_api_keys"

    id = Column(String(64), primary_key=True)
    tenant_id = Column(String(64), ForeignKey("x402_saas_tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    key_hash = Column(String(64), unique=True, nullable=False, index=True)  # SHA256 hash
    name = Column(String(255))
    environment = Column(String(10), nullable=False)  # 'live' or 'test'
    scopes = Column(JSON)  # List of permissions

    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True))
    revoked_at = Column(DateTime(timezone=True))

    # Relationships
    tenant = relationship("SaaSTenant", back_populates="api_keys")

    def __repr__(self):
        return f"<SaaSAPIKey(id={self.id}, tenant_id={self.tenant_id}, environment={self.environment})>"


class SaaSVerification(Base):
    """Payment verification records per tenant for analytics and billing"""
    __tablename__ = "x402_saas_verifications"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String(64), ForeignKey("x402_saas_tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    tx_hash = Column(String(255), nullable=False, index=True)
    chain = Column(String(50), nullable=False, index=True)
    success = Column(Boolean, nullable=False)
    amount_usdc = Column(DECIMAL(18, 6))
    error_code = Column(String(50))
    error_message = Column(String(500))

    # Metadata
    api_key_id = Column(String(64), index=True)
    ip_address = Column(String(45))
    response_time_ms = Column(Integer)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    tenant = relationship("SaaSTenant", back_populates="verifications")

    def __repr__(self):
        return f"<SaaSVerification(id={self.id}, tenant_id={self.tenant_id}, chain={self.chain}, success={self.success})>"
