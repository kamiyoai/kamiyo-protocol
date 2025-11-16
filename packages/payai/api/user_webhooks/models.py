# -*- coding: utf-8 -*-
"""
Pydantic Models for User Webhooks
"""

from pydantic import BaseModel, Field, HttpUrl, validator
from typing import Optional, List
from datetime import datetime


class WebhookCreate(BaseModel):
    """Create webhook request"""
    name: str = Field(..., min_length=1, max_length=100, description="Webhook name")
    url: HttpUrl = Field(..., description="HTTPS endpoint URL")
    min_amount_usd: Optional[float] = Field(None, ge=0, description="Minimum exploit amount to trigger")
    chains: Optional[List[str]] = Field(None, description="Filter by chains (e.g., ['ethereum', 'arbitrum'])")
    protocols: Optional[List[str]] = Field(None, description="Filter by protocols")
    categories: Optional[List[str]] = Field(None, description="Filter by categories")

    @validator('url')
    def url_must_be_https(cls, v):
        """Ensure webhook URL uses HTTPS"""
        if not str(v).startswith('https://'):
            raise ValueError('Webhook URL must use HTTPS')
        return v


class WebhookUpdate(BaseModel):
    """Update webhook request"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    url: Optional[HttpUrl] = None
    is_active: Optional[bool] = None
    min_amount_usd: Optional[float] = Field(None, ge=0)
    chains: Optional[List[str]] = None
    protocols: Optional[List[str]] = None
    categories: Optional[List[str]] = None

    @validator('url')
    def url_must_be_https(cls, v):
        """Ensure webhook URL uses HTTPS"""
        if v and not str(v).startswith('https://'):
            raise ValueError('Webhook URL must use HTTPS')
        return v


class WebhookResponse(BaseModel):
    """Webhook response"""
    id: int
    user_id: int
    name: str
    url: str
    secret: str  # Only shown when creating/retrieving
    is_active: bool
    min_amount_usd: Optional[float]
    chains: Optional[List[str]]
    protocols: Optional[List[str]]
    categories: Optional[List[str]]
    total_sent: int
    total_success: int
    total_failed: int
    last_sent_at: Optional[datetime]
    last_success_at: Optional[datetime]
    last_failure_at: Optional[datetime]
    last_error: Optional[str]
    created_at: datetime
    updated_at: datetime


class WebhookListResponse(BaseModel):
    """List of webhooks"""
    webhooks: List[WebhookResponse]
    total: int


class WebhookDeliveryResponse(BaseModel):
    """Webhook delivery log entry"""
    id: int
    webhook_id: int
    exploit_id: int
    url: str
    payload: str
    status_code: Optional[int]
    response_body: Optional[str]
    error: Optional[str]
    attempt_number: int
    max_attempts: int
    sent_at: datetime
    delivered_at: Optional[datetime]
    failed_at: Optional[datetime]


class WebhookDeliveryListResponse(BaseModel):
    """List of webhook deliveries"""
    deliveries: List[WebhookDeliveryResponse]
    total: int
    page: int
    page_size: int


class WebhookTestResponse(BaseModel):
    """Test webhook response"""
    status: str
    message: str
    status_code: Optional[int]
    response_body: Optional[str]
    error: Optional[str]
    latency_ms: int
