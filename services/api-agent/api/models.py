"""
Pydantic models for API request/response validation.
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ========== Enums ==========

class SeverityLevel(str, Enum):
    """Exploit severity levels."""
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"


class SubscriptionTier(str, Enum):
    """Subscription tier levels."""
    FREE = "FREE"
    BASIC = "BASIC"
    PRO = "PRO"


class EventType(str, Enum):
    """Webhook event types."""
    new_exploit = "new_exploit"
    critical_alert = "critical_alert"
    high_value = "high_value"
    protocol_specific = "protocol_specific"


# ========== Response Models ==========

class ExploitResponse(BaseModel):
    """Single exploit data response."""
    tx_hash: str
    chain: str
    block_number: int
    timestamp: str
    protocol: str
    exploit_type: str
    amount_stolen: float
    token: str
    attacker_address: str
    victim_address: str
    severity: str
    confidence_score: float
    attack_pattern: Optional[str] = None
    created_at: str

    class Config:
        json_schema_extra = {
            "example": {
                "tx_hash": "0x1234...abcd",
                "chain": "Cosmos Hub",
                "block_number": 12345678,
                "timestamp": "2025-10-06T12:00:00",
                "protocol": "DeFi Protocol",
                "exploit_type": "reentrancy",
                "amount_stolen": 1500000.0,
                "token": "ATOM",
                "attacker_address": "cosmos1abc...xyz",
                "victim_address": "cosmos1def...uvw",
                "severity": "critical",
                "confidence_score": 0.95,
                "attack_pattern": "flashloan_reentrancy",
                "created_at": "2025-10-06T12:05:00"
            }
        }


class ExploitsListResponse(BaseModel):
    """Paginated list of exploits."""
    exploits: List[ExploitResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_previous: bool

    class Config:
        json_schema_extra = {
            "example": {
                "exploits": [],
                "total": 150,
                "page": 1,
                "page_size": 20,
                "total_pages": 8,
                "has_next": True,
                "has_previous": False
            }
        }


class AlertResponse(BaseModel):
    """Alert/notification response."""
    tx_hash: str
    chain: str
    timestamp: str
    protocol: str
    exploit_type: str
    amount_stolen: float
    token: str
    severity: str
    confidence_score: float

    class Config:
        json_schema_extra = {
            "example": {
                "tx_hash": "0x5678...efgh",
                "chain": "Osmosis",
                "timestamp": "2025-10-06T13:30:00",
                "protocol": "AMM DEX",
                "exploit_type": "price_manipulation",
                "amount_stolen": 500000.0,
                "token": "OSMO",
                "severity": "high",
                "confidence_score": 0.88
            }
        }


class RecentAlertsResponse(BaseModel):
    """List of recent alerts."""
    alerts: List[AlertResponse]
    count: int
    time_window_hours: int

    class Config:
        json_schema_extra = {
            "example": {
                "alerts": [],
                "count": 5,
                "time_window_hours": 24
            }
        }


class StatsOverviewResponse(BaseModel):
    """Overview statistics response."""
    total_exploits: int
    total_amount_stolen_usd: float
    exploits_last_24h: int
    by_severity: Dict[str, int]
    by_chain: Dict[str, int]
    last_updated: str

    class Config:
        json_schema_extra = {
            "example": {
                "total_exploits": 234,
                "total_amount_stolen_usd": 45678900.50,
                "exploits_last_24h": 12,
                "by_severity": {
                    "critical": 45,
                    "high": 89,
                    "medium": 67,
                    "low": 33
                },
                "by_chain": {
                    "Cosmos Hub": 120,
                    "Osmosis": 67,
                    "Juno": 47
                },
                "last_updated": "2025-10-06T14:00:00"
            }
        }


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str
    database: str
    timestamp: str
    uptime_seconds: Optional[float] = None

    class Config:
        json_schema_extra = {
            "example": {
                "status": "healthy",
                "version": "1.0.0",
                "database": "connected",
                "timestamp": "2025-10-06T14:00:00",
                "uptime_seconds": 86400.5
            }
        }


# ========== Request Models ==========

class WebhookConfigRequest(BaseModel):
    """Webhook configuration request."""
    webhook_url: str = Field(..., description="HTTPS URL to receive webhook events")
    event_types: List[EventType] = Field(
        default=[EventType.new_exploit],
        description="Types of events to receive"
    )
    filters: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional filters (chain, severity, min_amount)"
    )

    @validator('webhook_url')
    def validate_webhook_url(cls, v):
        """Ensure webhook URL is HTTPS."""
        if not v.startswith('https://'):
            raise ValueError('Webhook URL must use HTTPS')
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "webhook_url": "https://example.com/webhook",
                "event_types": ["new_exploit", "critical_alert"],
                "filters": {
                    "severity": ["critical", "high"],
                    "min_amount": 100000
                }
            }
        }


class WebhookConfigResponse(BaseModel):
    """Webhook configuration response."""
    id: int
    webhook_url: str
    event_types: List[str]
    filters: Optional[Dict[str, Any]]
    created_at: str
    updated_at: str

    class Config:
        json_schema_extra = {
            "example": {
                "id": 1,
                "webhook_url": "https://example.com/webhook",
                "event_types": ["new_exploit", "critical_alert"],
                "filters": {"severity": ["critical", "high"]},
                "created_at": "2025-10-06T10:00:00",
                "updated_at": "2025-10-06T14:00:00"
            }
        }


class WebhookListResponse(BaseModel):
    """List of webhook configurations."""
    webhooks: List[WebhookConfigResponse]
    count: int
    max_allowed: int

    class Config:
        json_schema_extra = {
            "example": {
                "webhooks": [],
                "count": 2,
                "max_allowed": 10
            }
        }


# ========== Error Models ==========

class ErrorResponse(BaseModel):
    """Standard error response."""
    error: str
    detail: Optional[str] = None
    status_code: int

    class Config:
        json_schema_extra = {
            "example": {
                "error": "Not Found",
                "detail": "Exploit with hash 0x123... not found",
                "status_code": 404
            }
        }


class RateLimitError(BaseModel):
    """Rate limit error response."""
    error: str = "Rate Limit Exceeded"
    detail: str
    retry_after_seconds: int
    current_tier: str
    requests_remaining: int

    class Config:
        json_schema_extra = {
            "example": {
                "error": "Rate Limit Exceeded",
                "detail": "You have exceeded your rate limit of 100 requests per hour",
                "retry_after_seconds": 3600,
                "current_tier": "BASIC",
                "requests_remaining": 0
            }
        }


# ========== Subscription Models ==========

class SubscriptionInfo(BaseModel):
    """Subscription tier information."""
    tier: SubscriptionTier
    data_delay_hours: int
    rate_limit_per_hour: int
    webhook_limit: int
    api_access: bool
    features: List[str]

    class Config:
        json_schema_extra = {
            "example": {
                "tier": "PRO",
                "data_delay_hours": 0,
                "rate_limit_per_hour": 1000,
                "webhook_limit": 10,
                "api_access": True,
                "features": [
                    "Real-time data",
                    "Custom alerts",
                    "Priority support",
                    "Advanced analytics"
                ]
            }
        }


class APIKeyResponse(BaseModel):
    """API key information response."""
    api_key: str
    subscription: SubscriptionInfo
    created_at: str
    requests_used_hour: int
    requests_remaining: int

    class Config:
        json_schema_extra = {
            "example": {
                "api_key": "varden_live_abc123...",
                "subscription": {},
                "created_at": "2025-10-01T00:00:00",
                "requests_used_hour": 45,
                "requests_remaining": 955
            }
        }


# ========== Search Models ==========

class SearchRequest(BaseModel):
    """Search request parameters."""
    query: str = Field(..., min_length=2, description="Search term")
    limit: int = Field(default=20, ge=1, le=100, description="Maximum results")

    class Config:
        json_schema_extra = {
            "example": {
                "query": "uniswap",
                "limit": 20
            }
        }


class SearchResponse(BaseModel):
    """Search results response."""
    results: List[ExploitResponse]
    query: str
    count: int

    class Config:
        json_schema_extra = {
            "example": {
                "results": [],
                "query": "uniswap",
                "count": 15
            }
        }
