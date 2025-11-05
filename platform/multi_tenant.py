# -*- coding: utf-8 -*-
"""
Multi-tenant database layer for kamiyo.ai Platform
Extends database models with tenant_id for data isolation
"""

from sqlalchemy import Column, String, Index
from sqlalchemy.ext.declarative import declared_attr
from typing import Optional
import contextvars

# Thread-local tenant context
current_tenant = contextvars.ContextVar('current_tenant', default=None)


class TenantMixin:
    """
    Mixin to add tenant_id to any model

    Usage:
        class YourModel(Base, TenantMixin):
            pass
    """

    @declared_attr
    def tenant_id(cls):
        """Tenant identifier for data isolation"""
        return Column(String(64), nullable=False, index=True)

    @declared_attr
    def __table_args__(cls):
        """Add composite index with tenant_id"""
        return (
            Index(f'idx_{cls.__tablename__}_tenant', 'tenant_id'),
        )


def set_current_tenant(tenant_id: str):
    """
    Set current tenant for this request context

    Args:
        tenant_id: Tenant identifier
    """
    current_tenant.set(tenant_id)


def get_current_tenant() -> Optional[str]:
    """
    Get current tenant from request context

    Returns:
        Tenant ID or None if not set
    """
    return current_tenant.get()


def get_tenant_from_api_key(api_key: str) -> Optional[str]:
    """
    Extract tenant ID from API key

    Args:
        api_key: API key from request

    Returns:
        Tenant ID or None
    """
    # API key format: tenant_id.key_hash
    if '.' in api_key:
        tenant_id, _ = api_key.split('.', 1)
        return tenant_id
    return None


class TenantQueryMixin:
    """
    Mixin to automatically filter queries by tenant

    Usage:
        class YourModel(Base, TenantMixin, TenantQueryMixin):
            pass
    """

    @classmethod
    def query_for_tenant(cls, session, tenant_id: Optional[str] = None):
        """
        Get query filtered by tenant

        Args:
            session: SQLAlchemy session
            tenant_id: Explicit tenant ID (uses current if None)

        Returns:
            Filtered query
        """
        tenant = tenant_id or get_current_tenant()
        if tenant is None:
            raise ValueError("No tenant context set")

        return session.query(cls).filter(cls.tenant_id == tenant)


def add_tenant_column_migration():
    """
    SQL migration to add tenant_id to existing tables

    Run this to migrate from single-tenant to multi-tenant
    """
    return """
    -- Add tenant_id column to all tables
    ALTER TABLE exploits ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
    ALTER TABLE api_requests ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
    ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
    ALTER TABLE alert_subscriptions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
    ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
    ALTER TABLE security_events ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);

    -- Set default tenant for existing data
    UPDATE exploits SET tenant_id = 'default' WHERE tenant_id IS NULL;
    UPDATE api_requests SET tenant_id = 'default' WHERE tenant_id IS NULL;
    UPDATE audit_log SET tenant_id = 'default' WHERE tenant_id IS NULL;
    UPDATE alert_subscriptions SET tenant_id = 'default' WHERE tenant_id IS NULL;
    UPDATE alert_deliveries SET tenant_id = 'default' WHERE tenant_id IS NULL;
    UPDATE security_events SET tenant_id = 'default' WHERE tenant_id IS NULL;

    -- Make tenant_id NOT NULL
    ALTER TABLE exploits ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE api_requests ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE audit_log ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE alert_subscriptions ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE alert_deliveries ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE security_events ALTER COLUMN tenant_id SET NOT NULL;

    -- Add indexes
    CREATE INDEX IF NOT EXISTS idx_exploits_tenant ON exploits(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_api_requests_tenant ON api_requests(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_alert_subscriptions_tenant ON alert_subscriptions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_alert_deliveries_tenant ON alert_deliveries(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_security_events_tenant ON security_events(tenant_id);
    """
