# -*- coding: utf-8 -*-
"""
Pydantic Models for Kamiyo API
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ExploitResponse(BaseModel):
    """Single exploit response"""
    id: int
    tx_hash: str
    chain: str
    protocol: str
    amount_usd: float
    timestamp: datetime
    source: str
    source_url: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    recovery_status: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ExploitsListResponse(BaseModel):
    """List of exploits with pagination"""
    data: List[ExploitResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class StatsResponse(BaseModel):
    """Statistics response"""
    total_exploits: int
    total_loss_usd: float
    chains_affected: int
    protocols_affected: int
    avg_loss_usd: Optional[float] = None
    max_loss_usd: Optional[float] = None
    period_days: Optional[int] = None


class SourceHealth(BaseModel):
    """Source health status"""
    name: str
    last_fetch: Optional[datetime]
    fetch_count: int
    error_count: int
    success_rate: Optional[float]
    is_active: bool


class HealthResponse(BaseModel):
    """Overall health response"""
    status: str
    database_exploits: int
    tracked_chains: int
    active_sources: int
    total_sources: int
    sources: List[SourceHealth]
    timestamp: str


class ErrorResponse(BaseModel):
    """Error response"""
    error: str
    detail: Optional[str] = None
