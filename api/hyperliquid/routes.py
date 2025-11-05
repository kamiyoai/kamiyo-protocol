# -*- coding: utf-8 -*-
"""
Hyperliquid Security Intelligence API Routes
Extended monitoring and security endpoints for Hyperliquid
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

from aggregators.hyperliquid_hlp import HyperliquidHLPAggregator
from aggregators.hyperliquid_oracle import HyperliquidOracleAggregator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hyperliquid")

# Initialize monitors (singleton pattern in production would use dependency injection)
hlp_monitor = HyperliquidHLPAggregator()
oracle_monitor = HyperliquidOracleAggregator()


@router.get("/security/dashboard")
async def get_hyperliquid_dashboard():
    """
    Get comprehensive Hyperliquid security dashboard

    Returns overall risk assessment, HLP vault health, and oracle deviations
    """
    try:
        # Fetch HLP vault data
        hlp_vault_data = hlp_monitor._fetch_vault_details()
        hlp_snapshot = None
        if hlp_vault_data:
            hlp_snapshot = hlp_monitor._create_snapshot(hlp_vault_data)

        # Fetch oracle deviations
        hl_prices = oracle_monitor._fetch_hyperliquid_prices()
        binance_prices = oracle_monitor._fetch_binance_prices()
        coinbase_prices = oracle_monitor._fetch_coinbase_prices()

        active_deviations = []
        for asset in oracle_monitor.MONITORED_ASSETS:
            hl_price = hl_prices.get(asset)
            binance_price = binance_prices.get(asset)
            coinbase_price = coinbase_prices.get(asset)

            if hl_price:
                deviation = oracle_monitor._analyze_deviation(
                    asset, hl_price, binance_price, coinbase_price
                )
                if deviation:
                    active_deviations.append(deviation)

        # Calculate overall risk score
        risk_score = 0
        if hlp_snapshot:
            risk_score += hlp_snapshot.get('anomaly_score', 0) * 0.6
        if active_deviations:
            max_oracle_risk = max(d.get('risk_score', 0) for d in active_deviations)
            risk_score += max_oracle_risk * 0.4

        return {
            "timestamp": datetime.now().isoformat(),
            "overall_risk_score": min(100, risk_score),
            "hlp_vault": {
                "account_value": hlp_snapshot.get('account_value', 0) if hlp_snapshot else 0,
                "pnl_24h": hlp_snapshot.get('pnl_24h', 0) if hlp_snapshot else 0,
                "pnl_7d": hlp_snapshot.get('pnl_7d', 0) if hlp_snapshot else 0,
                "max_drawdown": hlp_snapshot.get('max_drawdown') if hlp_snapshot else None,
                "anomaly_score": hlp_snapshot.get('anomaly_score', 0) if hlp_snapshot else 0,
                "is_healthy": hlp_snapshot.get('is_healthy', True) if hlp_snapshot else True
            },
            "oracle_deviations": {
                "active_count": len(active_deviations),
                "critical_count": sum(1 for d in active_deviations if d.get('severity') == 'critical'),
                "deviations": active_deviations
            },
            "status": "healthy" if risk_score < 30 else "warning" if risk_score < 70 else "critical"
        }

    except Exception as e:
        logger.error(f"Error getting Hyperliquid dashboard: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/security/hlp-vault")
async def get_hlp_vault_health():
    """
    Get detailed HLP vault health metrics

    Returns comprehensive vault analytics including PnL, drawdown, and anomaly detection
    """
    try:
        vault_data = hlp_monitor._fetch_vault_details()
        if not vault_data:
            raise HTTPException(status_code=503, detail="Could not fetch vault data from Hyperliquid API")

        snapshot = hlp_monitor._create_snapshot(vault_data)
        hlp_monitor.historical_snapshots.append(snapshot)

        # Detect anomalies
        events = hlp_monitor._detect_anomalies(snapshot)

        return {
            "timestamp": snapshot['timestamp'].isoformat(),
            "vault_address": snapshot['vault_address'],
            "metrics": {
                "account_value": snapshot['account_value'],
                "pnl_24h": snapshot['pnl_24h'],
                "pnl_7d": snapshot['pnl_7d'],
                "max_drawdown_pct": snapshot['max_drawdown']
            },
            "health": {
                "is_healthy": snapshot['is_healthy'],
                "anomaly_score": snapshot['anomaly_score'],
                "risk_level": (
                    "low" if snapshot['anomaly_score'] < 30
                    else "medium" if snapshot['anomaly_score'] < 70
                    else "high"
                )
            },
            "events": [
                {
                    "event_id": e['event_id'],
                    "severity": e['severity'],
                    "title": e['title'],
                    "description": e['description'],
                    "estimated_loss_usd": e.get('estimated_loss_usd', 0)
                }
                for e in events
            ],
            "historical_data_points": len(hlp_monitor.historical_snapshots)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting HLP vault health: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/security/oracle-deviations")
async def get_oracle_deviations(
    active_only: bool = Query(default=True, description="Only return currently active deviations")
):
    """
    Get oracle price deviations

    Returns price comparisons between Hyperliquid and external sources (Binance, Coinbase)
    """
    try:
        # Fetch prices from all sources
        hl_prices = oracle_monitor._fetch_hyperliquid_prices()
        binance_prices = oracle_monitor._fetch_binance_prices()
        coinbase_prices = oracle_monitor._fetch_coinbase_prices()

        deviations = []

        for asset in oracle_monitor.MONITORED_ASSETS:
            hl_price = hl_prices.get(asset)
            if not hl_price:
                continue

            binance_price = binance_prices.get(asset)
            coinbase_price = coinbase_prices.get(asset)

            deviation = oracle_monitor._analyze_deviation(
                asset, hl_price, binance_price, coinbase_price
            )

            if active_only:
                if deviation:
                    deviations.append(deviation)
            else:
                # Include all assets even without deviations
                deviations.append({
                    "asset": asset,
                    "hyperliquid_price": hl_price,
                    "binance_price": binance_price,
                    "coinbase_price": coinbase_price,
                    "deviation": deviation
                })

        return {
            "timestamp": datetime.now().isoformat(),
            "total_monitored": len(oracle_monitor.MONITORED_ASSETS),
            "active_deviations": len(deviations) if active_only else sum(1 for d in deviations if d.get('deviation')),
            "deviations": deviations
        }

    except Exception as e:
        logger.error(f"Error getting oracle deviations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/security/events")
async def get_security_events(
    severity: Optional[str] = Query(default=None, description="Filter by severity: critical, high, medium, low"),
    limit: int = Query(default=50, ge=1, le=500, description="Maximum number of events to return")
):
    """
    Get recent security events for Hyperliquid

    Returns aggregated security events from HLP vault and oracle monitoring
    """
    try:
        all_events = []

        # Get HLP vault events
        vault_data = hlp_monitor._fetch_vault_details()
        if vault_data:
            snapshot = hlp_monitor._create_snapshot(vault_data)
            hlp_events = hlp_monitor._detect_anomalies(snapshot)
            all_events.extend(hlp_events)

        # Get oracle events
        exploits = oracle_monitor.fetch_exploits()
        oracle_events = [
            {
                'event_id': e['tx_hash'],
                'timestamp': e['timestamp'],
                'severity': 'high',  # Oracle deviations that make it to exploits are high severity
                'threat_type': 'oracle_manipulation',
                'title': f"Oracle Deviation: {e.get('protocol', 'Unknown')}",
                'description': e['description'],
                'estimated_loss_usd': e.get('amount_usd', 0)
            }
            for e in exploits
        ]
        all_events.extend(oracle_events)

        # Filter by severity if specified
        if severity:
            all_events = [e for e in all_events if e.get('severity') == severity.lower()]

        # Sort by timestamp (most recent first) and limit
        all_events.sort(key=lambda x: x.get('timestamp', datetime.min), reverse=True)
        all_events = all_events[:limit]

        # Format timestamps for JSON serialization
        for event in all_events:
            if isinstance(event.get('timestamp'), datetime):
                event['timestamp'] = event['timestamp'].isoformat()

        return {
            "total_events": len(all_events),
            "events": all_events
        }

    except Exception as e:
        logger.error(f"Error getting security events: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/info")
async def get_hyperliquid_info():
    """
    Get information about Hyperliquid security monitoring
    """
    return {
        "name": "KAMIYO Hyperliquid Security Intelligence",
        "version": "1.0.0",
        "description": "Independent security monitoring for Hyperliquid protocol",
        "github": "https://github.com/mizuki-tamaki/kamiyo-hyperliquid",
        "capabilities": {
            "hlp_vault_monitoring": {
                "description": "Real-time HLP vault health monitoring with anomaly detection",
                "detection_latency": "<5 minutes",
                "thresholds": {
                    "critical_loss_24h": "$2M",
                    "high_loss_24h": "$1M",
                    "critical_drawdown": "10%",
                    "statistical_sigma": 3.0
                }
            },
            "oracle_monitoring": {
                "description": "Multi-source price comparison for manipulation detection",
                "sources": ["Hyperliquid", "Binance", "Coinbase"],
                "monitored_assets": oracle_monitor.MONITORED_ASSETS,
                "thresholds": {
                    "warning_deviation": "0.5%",
                    "critical_deviation": "1.0%",
                    "duration_threshold": "30 seconds"
                }
            }
        },
        "integration": {
            "kamiyo_platform": "Integrated as aggregator sources #20 and #21",
            "data_format": "KAMIYO exploit standard",
            "update_frequency": "Real-time (on aggregation cycle)"
        }
    }
