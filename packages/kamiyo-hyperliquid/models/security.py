"""
Security Event Models
Data models for Hyperliquid security monitoring and exploit detection
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum


class ThreatSeverity(Enum):
    """Severity levels for security threats"""
    CRITICAL = "critical"  # Active exploit, immediate action required
    HIGH = "high"          # High risk, monitor closely
    MEDIUM = "medium"      # Unusual pattern, investigate
    LOW = "low"            # Minor anomaly, informational
    INFO = "info"          # General security information


class ThreatType(Enum):
    """Types of security threats"""
    LIQUIDATION_MANIPULATION = "liquidation_manipulation"
    FLASH_LOAN_ATTACK = "flash_loan_attack"
    ORACLE_MANIPULATION = "oracle_manipulation"
    HLP_EXPLOITATION = "hlp_exploitation"
    FUNDING_RATE_ATTACK = "funding_rate_attack"
    CASCADE_LIQUIDATION = "cascade_liquidation"
    UNUSUAL_VOLUME = "unusual_volume"
    WHALE_MANIPULATION = "whale_manipulation"
    PROTOCOL_VULNERABILITY = "protocol_vulnerability"
    UNKNOWN = "unknown"


@dataclass
class SecurityEvent:
    """Base class for security events"""
    event_id: str
    timestamp: datetime
    severity: ThreatSeverity
    threat_type: ThreatType
    title: str
    description: str
    affected_assets: List[str]
    indicators: Dict[str, Any]  # Technical indicators/evidence
    recommended_action: str
    source: str

    # Financial impact
    estimated_loss_usd: Optional[float] = None
    affected_users: Optional[int] = None

    # Status
    is_active: bool = True
    resolved_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None

    # Related data
    related_liquidations: List[str] = None  # liquidation IDs
    related_transactions: List[str] = None  # tx hashes
    related_addresses: List[str] = None     # wallet addresses

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses"""
        return {
            'event_id': self.event_id,
            'timestamp': self.timestamp.isoformat(),
            'severity': self.severity.value,
            'threat_type': self.threat_type.value,
            'title': self.title,
            'description': self.description,
            'affected_assets': self.affected_assets,
            'indicators': self.indicators,
            'recommended_action': self.recommended_action,
            'source': self.source,
            'estimated_loss_usd': self.estimated_loss_usd,
            'affected_users': self.affected_users,
            'is_active': self.is_active,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
            'resolution_notes': self.resolution_notes,
            'related_liquidations': self.related_liquidations or [],
            'related_transactions': self.related_transactions or [],
            'related_addresses': self.related_addresses or []
        }


@dataclass
class HLPVaultSnapshot:
    """HLP Vault health snapshot"""
    timestamp: datetime
    vault_address: str

    # Vault metrics
    total_value_locked: float  # USD
    account_value: float       # USD
    pnl_24h: float            # USD
    pnl_7d: float             # USD
    pnl_30d: float            # USD

    # Performance
    sharpe_ratio: Optional[float] = None
    max_drawdown: Optional[float] = None
    win_rate: Optional[float] = None

    # Anomaly scores (0-100, higher = more suspicious)
    anomaly_score: float = 0.0
    volatility_score: float = 0.0
    loss_streak_score: float = 0.0

    # Health indicators
    is_healthy: bool = True
    health_issues: List[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'timestamp': self.timestamp.isoformat(),
            'vault_address': self.vault_address,
            'total_value_locked': self.total_value_locked,
            'account_value': self.account_value,
            'pnl_24h': self.pnl_24h,
            'pnl_7d': self.pnl_7d,
            'pnl_30d': self.pnl_30d,
            'sharpe_ratio': self.sharpe_ratio,
            'max_drawdown': self.max_drawdown,
            'win_rate': self.win_rate,
            'anomaly_score': self.anomaly_score,
            'volatility_score': self.volatility_score,
            'loss_streak_score': self.loss_streak_score,
            'is_healthy': self.is_healthy,
            'health_issues': self.health_issues or []
        }


@dataclass
class LiquidationPattern:
    """Detected liquidation pattern"""
    pattern_id: str
    timestamp: datetime
    pattern_type: str  # "flash_loan", "cascade", "manipulation", "coordinated"

    # Liquidations involved
    liquidation_ids: List[str]
    total_liquidated_usd: float
    affected_users: int

    # Pattern characteristics
    duration_seconds: float
    assets_involved: List[str]
    price_impact: Dict[str, float]  # asset -> % price change

    # Suspicion indicators
    suspicion_score: float  # 0-100
    indicators: List[str]   # What makes this suspicious

    # Context
    block_number: Optional[int] = None
    is_cross_block: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'pattern_id': self.pattern_id,
            'timestamp': self.timestamp.isoformat(),
            'pattern_type': self.pattern_type,
            'liquidation_ids': self.liquidation_ids,
            'total_liquidated_usd': self.total_liquidated_usd,
            'affected_users': self.affected_users,
            'duration_seconds': self.duration_seconds,
            'assets_involved': self.assets_involved,
            'price_impact': self.price_impact,
            'suspicion_score': self.suspicion_score,
            'indicators': self.indicators,
            'block_number': self.block_number,
            'is_cross_block': self.is_cross_block
        }


@dataclass
class OracleDeviation:
    """Oracle price deviation event"""
    timestamp: datetime
    asset: str

    # Prices from different sources
    hyperliquid_price: float
    binance_price: Optional[float] = None
    coinbase_price: Optional[float] = None
    pyth_price: Optional[float] = None

    # Deviation metrics
    max_deviation_pct: float = 0.0
    duration_seconds: float = 0.0

    # Risk assessment
    is_dangerous: bool = False  # >0.5% deviation for >30s
    risk_score: float = 0.0     # 0-100

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'timestamp': self.timestamp.isoformat(),
            'asset': self.asset,
            'hyperliquid_price': self.hyperliquid_price,
            'binance_price': self.binance_price,
            'coinbase_price': self.coinbase_price,
            'pyth_price': self.pyth_price,
            'max_deviation_pct': self.max_deviation_pct,
            'duration_seconds': self.duration_seconds,
            'is_dangerous': self.is_dangerous,
            'risk_score': self.risk_score
        }


@dataclass
class SecurityAlert:
    """Real-time security alert"""
    alert_id: str
    timestamp: datetime
    severity: ThreatSeverity
    title: str
    message: str

    # What triggered the alert
    trigger_type: str
    trigger_data: Dict[str, Any]

    # Actions
    recommended_actions: List[str]
    affected_users: Optional[List[str]] = None

    # Related events
    related_event_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'alert_id': self.alert_id,
            'timestamp': self.timestamp.isoformat(),
            'severity': self.severity.value,
            'title': self.title,
            'message': self.message,
            'trigger_type': self.trigger_type,
            'trigger_data': self.trigger_data,
            'recommended_actions': self.recommended_actions,
            'affected_users': self.affected_users or [],
            'related_event_id': self.related_event_id
        }
