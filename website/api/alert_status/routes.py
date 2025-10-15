# -*- coding: utf-8 -*-
"""
Alert Status API Routes
Endpoints for users to check their alert limits and history
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import logging

from api.auth_helpers import get_current_user
from api.alert_limits import get_alert_limit_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/alerts", tags=["Alerts"])


class AlertStatsResponse(BaseModel):
    """Alert statistics response"""
    tier: str
    monthly_limit: Optional[int]
    sent_this_month: int
    remaining_this_month: Optional[int]
    total_alerts_received: int
    reset_at: Optional[str]
    unlimited: bool


class AlertHistoryItem(BaseModel):
    """Single alert history item"""
    id: int
    exploit_id: int
    channel: str
    sent_at: str
    protocol: str
    amount_usd: Optional[float]


class AlertHistoryResponse(BaseModel):
    """Alert history response"""
    total: int
    alerts: List[AlertHistoryItem]


@router.get("/status", response_model=AlertStatsResponse)
async def get_alert_status(user=Depends(get_current_user)):
    """
    Get current user's alert limits and usage

    Returns monthly limit, usage, and remaining alerts for the current month.
    Free tier: 10 alerts/month
    Pro/Team/Enterprise: Unlimited
    """
    manager = get_alert_limit_manager()
    stats = manager.get_user_alert_stats(user['id'])

    if not stats:
        raise HTTPException(status_code=404, detail="User stats not found")

    return AlertStatsResponse(**stats)


@router.get("/history", response_model=AlertHistoryResponse)
async def get_alert_history(
    limit: int = 100,
    user=Depends(get_current_user)
):
    """
    Get recent alerts sent to current user

    - **limit**: Maximum number of alerts to return (default: 100, max: 1000)
    """
    if limit > 1000:
        limit = 1000

    manager = get_alert_limit_manager()
    alerts = manager.get_alerts_by_user(user['id'], limit)

    return AlertHistoryResponse(
        total=len(alerts),
        alerts=[AlertHistoryItem(**alert) for alert in alerts]
    )


@router.post("/test")
async def test_alert_limit(user=Depends(get_current_user)):
    """
    Test if user can receive an alert (does not actually send)

    Returns whether user has remaining alerts in their monthly quota.
    """
    manager = get_alert_limit_manager()
    can_send, status = manager.can_send_alert(user['id'])

    return {
        "can_send_alert": can_send,
        "status": status
    }
