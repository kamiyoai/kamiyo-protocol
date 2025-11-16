"""
SQLAlchemy Database Models
ORM models for KAMIYO Hyperliquid security monitoring
"""

from sqlalchemy import (
    Column, Integer, String, DECIMAL, Boolean, TIMESTAMP,
    Text, ARRAY, JSON, BigInteger, CheckConstraint, UniqueConstraint, ForeignKey
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from datetime import datetime
from typing import Optional, List, Dict, Any
import hashlib
import json

Base = declarative_base()


class HLPVaultSnapshot(Base):
    """HLP Vault health snapshot model"""
    __tablename__ = 'hlp_vault_snapshots'

    id = Column(Integer, primary_key=True)
    timestamp = Column(TIMESTAMP(timezone=True), nullable=False)
    vault_address = Column(String(66), nullable=False)

    # Vault metrics
    total_value_locked = Column(DECIMAL(20, 2), nullable=False)
    account_value = Column(DECIMAL(20, 2), nullable=False)
    pnl_24h = Column(DECIMAL(20, 2))
    pnl_7d = Column(DECIMAL(20, 2))
    pnl_30d = Column(DECIMAL(20, 2))

    # Performance metrics
    sharpe_ratio = Column(DECIMAL(10, 4))
    max_drawdown = Column(DECIMAL(10, 4))
    win_rate = Column(DECIMAL(5, 4))

    # Anomaly detection
    anomaly_score = Column(DECIMAL(5, 2), nullable=False, default=0)
    volatility_score = Column(DECIMAL(5, 2), nullable=False, default=0)
    loss_streak_score = Column(DECIMAL(5, 2), nullable=False, default=0)

    # Health status
    is_healthy = Column(Boolean, nullable=False, default=True)
    health_issues = Column(ARRAY(Text))

    # Metadata
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint('vault_address', 'timestamp', name='unique_vault_snapshot'),
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'vault_address': self.vault_address,
            'total_value_locked': float(self.total_value_locked),
            'account_value': float(self.account_value),
            'pnl_24h': float(self.pnl_24h) if self.pnl_24h else None,
            'pnl_7d': float(self.pnl_7d) if self.pnl_7d else None,
            'pnl_30d': float(self.pnl_30d) if self.pnl_30d else None,
            'sharpe_ratio': float(self.sharpe_ratio) if self.sharpe_ratio else None,
            'max_drawdown': float(self.max_drawdown) if self.max_drawdown else None,
            'win_rate': float(self.win_rate) if self.win_rate else None,
            'anomaly_score': float(self.anomaly_score),
            'volatility_score': float(self.volatility_score),
            'loss_streak_score': float(self.loss_streak_score),
            'is_healthy': self.is_healthy,
            'health_issues': self.health_issues or []
        }


class SecurityEvent(Base):
    """Security event/alert model"""
    __tablename__ = 'security_events'

    event_id = Column(String(64), primary_key=True)
    timestamp = Column(TIMESTAMP(timezone=True), nullable=False)
    severity = Column(String(20), nullable=False)
    threat_type = Column(String(50), nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text)

    # Financial impact
    estimated_loss_usd = Column(DECIMAL(20, 2))
    affected_users = Column(Integer)

    # Technical details
    affected_assets = Column(ARRAY(Text))
    indicators = Column(JSON)

    # Actions and status
    recommended_action = Column(Text)
    is_active = Column(Boolean, nullable=False, default=True)
    resolved_at = Column(TIMESTAMP(timezone=True))
    resolution_notes = Column(Text)

    # Related data
    related_liquidations = Column(ARRAY(Text))
    related_transactions = Column(ARRAY(Text))
    related_addresses = Column(ARRAY(Text))

    # Source tracking
    source = Column(String(100), nullable=False)

    # Metadata
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("severity IN ('critical', 'high', 'medium', 'low', 'info')", name='valid_severity'),
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'event_id': self.event_id,
            'timestamp': self.timestamp.isoformat(),
            'severity': self.severity,
            'threat_type': self.threat_type,
            'title': self.title,
            'description': self.description,
            'estimated_loss_usd': float(self.estimated_loss_usd) if self.estimated_loss_usd else None,
            'affected_users': self.affected_users,
            'affected_assets': self.affected_assets or [],
            'indicators': self.indicators or {},
            'recommended_action': self.recommended_action,
            'is_active': self.is_active,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
            'resolution_notes': self.resolution_notes,
            'related_liquidations': self.related_liquidations or [],
            'related_transactions': self.related_transactions or [],
            'related_addresses': self.related_addresses or [],
            'source': self.source
        }


class OracleDeviation(Base):
    """Oracle price deviation model"""
    __tablename__ = 'oracle_deviations'

    id = Column(Integer, primary_key=True)
    timestamp = Column(TIMESTAMP(timezone=True), nullable=False)
    asset = Column(String(20), nullable=False)

    # Price data
    hyperliquid_price = Column(DECIMAL(20, 8), nullable=False)
    binance_price = Column(DECIMAL(20, 8))
    coinbase_price = Column(DECIMAL(20, 8))
    pyth_price = Column(DECIMAL(20, 8))

    # Deviation metrics
    max_deviation_pct = Column(DECIMAL(10, 4), nullable=False)
    duration_seconds = Column(DECIMAL(10, 2), nullable=False, default=0)

    # Risk assessment
    is_dangerous = Column(Boolean, nullable=False, default=False)
    risk_score = Column(DECIMAL(5, 2), nullable=False, default=0)

    # Metadata
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'asset': self.asset,
            'hyperliquid_price': float(self.hyperliquid_price),
            'binance_price': float(self.binance_price) if self.binance_price else None,
            'coinbase_price': float(self.coinbase_price) if self.coinbase_price else None,
            'pyth_price': float(self.pyth_price) if self.pyth_price else None,
            'max_deviation_pct': float(self.max_deviation_pct),
            'duration_seconds': float(self.duration_seconds),
            'is_dangerous': self.is_dangerous,
            'risk_score': float(self.risk_score)
        }


class LiquidationPattern(Base):
    """Liquidation pattern model"""
    __tablename__ = 'liquidation_patterns'

    pattern_id = Column(String(64), primary_key=True)
    timestamp = Column(TIMESTAMP(timezone=True), nullable=False)
    pattern_type = Column(String(50), nullable=False)

    # Pattern details
    liquidation_ids = Column(ARRAY(Text))
    total_liquidated_usd = Column(DECIMAL(20, 2), nullable=False)
    affected_users = Column(Integer, nullable=False)

    # Pattern characteristics
    duration_seconds = Column(DECIMAL(10, 2), nullable=False)
    assets_involved = Column(ARRAY(Text))
    price_impact = Column(JSON)

    # Suspicion analysis
    suspicion_score = Column(DECIMAL(5, 2), nullable=False)
    indicators = Column(ARRAY(Text))

    # Context
    block_number = Column(BigInteger)
    is_cross_block = Column(Boolean, nullable=False, default=False)

    # Metadata
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("pattern_type IN ('flash_loan', 'cascade', 'manipulation', 'coordinated')", name='valid_pattern_type'),
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'pattern_id': self.pattern_id,
            'timestamp': self.timestamp.isoformat(),
            'pattern_type': self.pattern_type,
            'liquidation_ids': self.liquidation_ids or [],
            'total_liquidated_usd': float(self.total_liquidated_usd),
            'affected_users': self.affected_users,
            'duration_seconds': float(self.duration_seconds),
            'assets_involved': self.assets_involved or [],
            'price_impact': self.price_impact or {},
            'suspicion_score': float(self.suspicion_score),
            'indicators': self.indicators or [],
            'block_number': self.block_number,
            'is_cross_block': self.is_cross_block
        }


class Exploit(Base):
    """Exploit/incident model"""
    __tablename__ = 'exploits'

    id = Column(Integer, primary_key=True)
    exploit_id = Column(String(128), unique=True, nullable=False)
    tx_hash = Column(String(128))

    # Basic information
    chain = Column(String(50), nullable=False)
    protocol = Column(String(100), nullable=False)
    category = Column(String(50))

    # Financial impact
    amount_usd = Column(DECIMAL(20, 2), nullable=False, default=0)

    # Temporal data
    timestamp = Column(TIMESTAMP(timezone=True), nullable=False)
    detected_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    # Details
    description = Column(Text)
    recovery_status = Column(String(50))

    # Source tracking
    source = Column(String(100), nullable=False)
    source_url = Column(Text)

    # Metadata
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'id': self.id,
            'exploit_id': self.exploit_id,
            'tx_hash': self.tx_hash,
            'chain': self.chain,
            'protocol': self.protocol,
            'category': self.category,
            'amount_usd': float(self.amount_usd),
            'timestamp': self.timestamp.isoformat(),
            'detected_at': self.detected_at.isoformat(),
            'description': self.description,
            'recovery_status': self.recovery_status,
            'source': self.source,
            'source_url': self.source_url
        }


class APIRequest(Base):
    """API request tracking model"""
    __tablename__ = 'api_requests'

    id = Column(Integer, primary_key=True)
    timestamp = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    # Request details
    ip_address = Column(String(45), nullable=False)  # IPv6 max length
    endpoint = Column(String(255), nullable=False)
    method = Column(String(10), nullable=False)

    # Response
    status_code = Column(Integer)
    response_time_ms = Column(Integer)

    # User tracking
    api_key = Column(String(64))
    user_id = Column(String(64))

    # Rate limiting
    rate_limit_hit = Column(Boolean, nullable=False, default=False)

    # Metadata
    user_agent = Column(Text)
    query_params = Column(JSON)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'ip_address': self.ip_address,
            'endpoint': self.endpoint,
            'method': self.method,
            'status_code': self.status_code,
            'response_time_ms': self.response_time_ms,
            'api_key': self.api_key,
            'user_id': self.user_id,
            'rate_limit_hit': self.rate_limit_hit,
            'user_agent': self.user_agent,
            'query_params': self.query_params
        }


class AuditLog(Base):
    """Immutable audit log model"""
    __tablename__ = 'audit_log'

    id = Column(Integer, primary_key=True)
    timestamp = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    # Action details
    action = Column(String(100), nullable=False)
    entity_type = Column(String(50))
    entity_id = Column(String(128))

    # Actor
    user_id = Column(String(64))
    ip_address = Column(String(45))

    # Changes
    before_state = Column(JSON)
    after_state = Column(JSON)

    # Metadata
    details = Column(JSON)

    # Tamper detection
    checksum = Column(String(64), nullable=False)

    def calculate_checksum(self) -> str:
        """Calculate checksum for tamper detection"""
        data = f"{self.timestamp}{self.action}{self.entity_id or ''}{self.user_id or ''}{json.dumps(self.details or {})}"
        return hashlib.sha256(data.encode()).hexdigest()

    def verify_checksum(self) -> bool:
        """Verify checksum integrity"""
        return self.checksum == self.calculate_checksum()

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'action': self.action,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'user_id': self.user_id,
            'ip_address': self.ip_address,
            'before_state': self.before_state,
            'after_state': self.after_state,
            'details': self.details,
            'checksum': self.checksum
        }


class AlertSubscription(Base):
    """Alert subscription model"""
    __tablename__ = 'alert_subscriptions'

    id = Column(Integer, primary_key=True)
    user_id = Column(String(64), nullable=False)

    # Subscription details
    channel = Column(String(50), nullable=False)
    channel_config = Column(JSON, nullable=False)

    # Filters
    min_severity = Column(String(20))
    threat_types = Column(ARRAY(Text))
    min_amount_usd = Column(DECIMAL(20, 2))

    # Status
    is_active = Column(Boolean, nullable=False, default=True)

    # Metadata
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("channel IN ('webhook', 'telegram', 'discord', 'email', 'sms')", name='valid_channel'),
        CheckConstraint("min_severity IN ('critical', 'high', 'medium', 'low', 'info')", name='valid_min_severity'),
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'channel': self.channel,
            'channel_config': self.channel_config,
            'min_severity': self.min_severity,
            'threat_types': self.threat_types or [],
            'min_amount_usd': float(self.min_amount_usd) if self.min_amount_usd else None,
            'is_active': self.is_active
        }


class AlertDelivery(Base):
    """Alert delivery log model"""
    __tablename__ = 'alert_deliveries'

    id = Column(Integer, primary_key=True)
    timestamp = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    # Alert details
    event_id = Column(String(64), ForeignKey('security_events.event_id'), nullable=False)
    subscription_id = Column(Integer, ForeignKey('alert_subscriptions.id'), nullable=False)

    # Delivery status
    status = Column(String(50), nullable=False)
    retry_count = Column(Integer, nullable=False, default=0)

    # Response
    response_code = Column(Integer)
    response_message = Column(Text)

    # Metadata
    delivered_at = Column(TIMESTAMP(timezone=True))
    error_details = Column(Text)

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'sent', 'failed', 'retrying')", name='valid_delivery_status'),
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'event_id': self.event_id,
            'subscription_id': self.subscription_id,
            'status': self.status,
            'retry_count': self.retry_count,
            'response_code': self.response_code,
            'response_message': self.response_message,
            'delivered_at': self.delivered_at.isoformat() if self.delivered_at else None,
            'error_details': self.error_details
        }
