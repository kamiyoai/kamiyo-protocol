"""
KAMIYO Hyperliquid API
FastAPI server for Hyperliquid exploit intelligence
"""

from fastapi import FastAPI, Query, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, timezone
import logging
import os
import hashlib
import json
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from aggregators import HyperliquidAPIAggregator, GitHubHistoricalAggregator
from monitors import HLPVaultMonitor, LiquidationAnalyzer, OracleMonitor
from database.integration import get_db_integration
from api.auth import get_api_key, AuthenticationStatus
from api.observability import (
    health_checker, get_metrics_summary,
    api_requests_total, api_request_duration,
    exploits_detected_total, StructuredLogger
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import ML models (after logger initialization)
try:
    from ml_models import get_model_manager, FeatureEngineer
    ML_AVAILABLE = True
except ImportError:
    logger.warning("ML models not available. Install ML dependencies: pip install scikit-learn statsmodels pandas")
    ML_AVAILABLE = False

limiter = Limiter(key_func=get_remote_address, default_limits=[os.getenv("RATE_LIMIT", "60/minute")])

# Initialize FastAPI app
app = FastAPI(
    title="KAMIYO Hyperliquid Security Intelligence",
    description="Real-time security monitoring and exploit detection for Hyperliquid ecosystem",
    version="2.0.0"
)

# Add rate limit handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

hyperliquid_agg = HyperliquidAPIAggregator()
github_agg = GitHubHistoricalAggregator()

hlp_monitor = HLPVaultMonitor()
liquidation_analyzer = LiquidationAnalyzer()
oracle_monitor = OracleMonitor()

try:
    db_integration = get_db_integration()
    logger.info("Database integration enabled for API")
except Exception as e:
    logger.warning(f"Database integration disabled: {e}")
    db_integration = None

ml_model_manager = None
ml_feature_engineer = None

if ML_AVAILABLE:
    try:
        ml_model_manager = get_model_manager()
        ml_feature_engineer = FeatureEngineer()
        ml_model_manager.load_all_models()
        logger.info("ML models loaded successfully")
    except Exception as e:
        logger.warning(f"ML models not loaded: {e}")
        logger.info("Train models with: python scripts/train_ml_models.py")

exploit_cache = {
    'exploits': [],
    'last_updated': None
}

security_cache = {
    'events': [],
    'last_scan': None
}

app_start_time = datetime.now(timezone.utc)


def _generate_exploit_id(exploit: Dict[str, Any]) -> str:
    """
    Generate a unique ID for an exploit event

    For exploits with tx_hash, use that as the ID.
    For non-transaction events (monitor alerts), generate a hash based on key attributes.

    Args:
        exploit: Exploit data dictionary

    Returns:
        Unique identifier string
    """
    # If tx_hash exists, use it
    tx_hash = exploit.get('tx_hash')
    if tx_hash:
        return tx_hash

    # For non-transaction events, generate composite key
    # Use source, timestamp, amount, and description to create unique hash
    composite_data = {
        'source': exploit.get('source', ''),
        'timestamp': str(exploit.get('timestamp', '')),
        'amount_usd': exploit.get('amount_usd', 0),
        'description': exploit.get('description', '')[:100],  # First 100 chars
        'category': exploit.get('category', ''),
        'protocol': exploit.get('protocol', '')
    }

    # Create hash from composite data
    data_str = json.dumps(composite_data, sort_keys=True, default=str)
    return hashlib.sha256(data_str.encode()).hexdigest()[:16]


@app.get("/")
@limiter.limit("100/minute")
async def root(request: Request):
    """Root endpoint"""
    auth_status = AuthenticationStatus.get_status()

    return {
        "name": "KAMIYO Hyperliquid Security Intelligence",
        "version": "2.0.0",
        "description": "Real-time security monitoring and exploit detection for Hyperliquid ecosystem",
        "authentication": auth_status,
        "features": [
            "HLP Vault Health Monitoring",
            "Liquidation Pattern Analysis",
            "Oracle Deviation Detection",
            "Multi-source Exploit Aggregation",
            "Real-time Security Alerts",
            "Database Persistence",
            "WebSocket Real-time Monitoring",
            "Multi-channel Alert System",
            "ML-Powered Anomaly Detection",
            "Predictive Risk Forecasting"
        ],
        "endpoints": {
            "core": {
                "/exploits": "Get detected exploits",
                "/stats": "Get statistics",
                "/health": "Health check",
                "/meta": "Get Hyperliquid metadata"
            },
            "security": {
                "/security/dashboard": "Security overview and risk scores",
                "/security/hlp-vault": "HLP vault health status",
                "/security/hlp-vault/history": "Historical HLP vault snapshots",
                "/security/oracle-deviations": "Active oracle price deviations",
                "/security/oracle-deviations/history": "Historical oracle deviations",
                "/security/liquidation-patterns": "Detected liquidation patterns",
                "/security/events": "Security events and alerts",
                "/security/events/database": "Security events from database"
            },
            "ml": {
                "/ml/status": "ML model availability and status",
                "/ml/anomalies": "Detect anomalies using ML (requires trained models)",
                "/ml/forecast": "24-hour risk prediction using ARIMA",
                "/ml/features": "View extracted ML features from monitoring data"
            }
        },
        "documentation": "https://github.com/kamiyo/kamiyo-hyperliquid"
    }


@app.get("/exploits")
@limiter.limit("30/minute")  # Stricter limit for expensive endpoint
async def get_exploits(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    chain: Optional[str] = Query(default=None),
    min_amount: Optional[float] = Query(default=None),
    days: int = Query(default=7, ge=1, le=365)
):
    """
    Get Hyperliquid exploits

    Args:
        limit: Maximum number of exploits to return (1-500)
        chain: Filter by blockchain (default: all chains)
        min_amount: Minimum USD amount
        days: Number of days to look back

    Returns:
        List of exploits
    """
    import time
    start_time = time.time()

    try:
        # Track API request
        api_requests_total.labels(endpoint="/exploits", method="GET", status="200").inc()

        # Check cache
        if exploit_cache['last_updated']:
            cache_age = (datetime.now(timezone.utc) - exploit_cache['last_updated']).total_seconds()
            if cache_age < 300:  # 5 minutes
                exploits = exploit_cache['exploits']
                logger.info(f"Returning {len(exploits)} exploits from cache")
            else:
                exploits = await _fetch_all_exploits()
        else:
            exploits = await _fetch_all_exploits()

        # Filter by chain
        if chain:
            exploits = [e for e in exploits if e.get('chain', '').lower() == chain.lower()]

        # Filter by minimum amount
        if min_amount:
            exploits = [e for e in exploits if e.get('amount_usd', 0) >= min_amount]

        # Filter by date
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
        exploits = [
            e for e in exploits
            if isinstance(e.get('timestamp'), datetime) and e['timestamp'] >= cutoff_date
        ]

        # Sort by timestamp (newest first)
        exploits.sort(key=lambda x: x.get('timestamp', datetime.min), reverse=True)

        # Apply limit
        exploits = exploits[:limit]

        # Track exploits returned (as proxy for detected)
        exploits_detected_total.labels(
            monitor="aggregate",
            severity="mixed",
            category="all"
        ).inc(len(exploits))

        # Track request duration
        duration = time.time() - start_time
        api_request_duration.labels(endpoint="/exploits", method="GET").observe(duration)

        return {
            "success": True,
            "count": len(exploits),
            "exploits": exploits
        }

    except Exception as e:
        # Track error
        api_requests_total.labels(endpoint="/exploits", method="GET", status="500").inc()
        logger.error(f"Error fetching exploits: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while fetching exploits")


@app.get("/stats")
@limiter.limit("60/minute")
async def get_stats(request: Request):
    """
    Get Hyperliquid exploit statistics

    Returns:
        Statistics about exploits
    """
    import time
    start_time = time.time()

    try:
        # Track API request
        api_requests_total.labels(endpoint="/stats", method="GET", status="200").inc()

        # Fetch exploits
        exploits = exploit_cache.get('exploits', [])

        if not exploits:
            exploits = await _fetch_all_exploits()

        # Calculate stats
        total_count = len(exploits)
        total_loss = sum(e.get('amount_usd', 0) for e in exploits)

        # Group by chain
        by_chain = {}
        for exploit in exploits:
            chain = exploit.get('chain', 'Unknown')
            if chain not in by_chain:
                by_chain[chain] = {'count': 0, 'total_usd': 0}

            by_chain[chain]['count'] += 1
            by_chain[chain]['total_usd'] += exploit.get('amount_usd', 0)

        # Group by source
        by_source = {}
        for exploit in exploits:
            source = exploit.get('source', 'Unknown')
            if source not in by_source:
                by_source[source] = {'count': 0, 'total_usd': 0}

            by_source[source]['count'] += 1
            by_source[source]['total_usd'] += exploit.get('amount_usd', 0)

        # Calculate uptime
        uptime_seconds = (datetime.now(timezone.utc) - app_start_time).total_seconds()

        # Get monitored assets from oracle monitor
        monitored_assets = ['BTC', 'ETH', 'SOL', 'MATIC', 'ARB', 'OP', 'AVAX']

        # Get alert channels configuration
        from alerts import get_alert_manager
        alert_manager = get_alert_manager()
        alert_channels_configured = sum(1 for enabled in alert_manager.enabled_channels.values() if enabled)

        # Track request duration
        duration = time.time() - start_time
        api_request_duration.labels(endpoint="/stats", method="GET").observe(duration)

        return {
            "success": True,
            "total_exploits": total_count,
            "total_loss_usd": total_loss,
            "by_chain": by_chain,
            "by_source": by_source,
            "last_updated": exploit_cache.get('last_updated'),
            "monitored_assets": monitored_assets,
            "alert_channels_configured": alert_channels_configured,
            "uptime_seconds": uptime_seconds
        }

    except Exception as e:
        # Track error
        api_requests_total.labels(endpoint="/stats", method="GET", status="500").inc()
        logger.error(f"Error calculating stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while calculating statistics")


@app.get("/health")
@limiter.limit("100/minute")
async def health_check(request: Request):
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "aggregators": {
            "hyperliquid_api": "active",
            "github_historical": "active"
        }
    }


@app.get("/meta")
@limiter.limit("60/minute")
async def get_metadata(request: Request):
    """
    Get Hyperliquid metadata (available assets, etc.)

    Returns:
        Metadata from Hyperliquid API
    """
    try:
        meta = await hyperliquid_agg.get_meta()
        mids = await hyperliquid_agg.get_all_mids()

        return {
            "success": True,
            "meta": meta,
            "prices": mids
        }

    except Exception as e:
        logger.error(f"Error fetching metadata: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while fetching metadata")


async def _fetch_all_exploits() -> List[Dict[str, Any]]:
    """
    Fetch exploits from all aggregators and update cache

    Returns:
        Combined list of exploits from all sources
    """
    all_exploits = []

    # Fetch from Hyperliquid API
    try:
        hyperliquid_exploits = await hyperliquid_agg.fetch_exploits()
        all_exploits.extend(hyperliquid_exploits)
        logger.info(f"Fetched {len(hyperliquid_exploits)} exploits from Hyperliquid API")
    except Exception as e:
        logger.error(f"Error fetching from Hyperliquid API: {e}")

    # Fetch from GitHub historical data
    try:
        github_exploits = await github_agg.fetch_exploits()
        all_exploits.extend(github_exploits)
        logger.info(f"Fetched {len(github_exploits)} exploits from GitHub historical data")
    except Exception as e:
        logger.error(f"Error fetching from GitHub: {e}")

    # Fetch from security monitors
    try:
        hlp_exploits = await hlp_monitor.fetch_exploits()
        all_exploits.extend(hlp_exploits)
        logger.info(f"Fetched {len(hlp_exploits)} exploits from HLP monitor")
    except Exception as e:
        logger.error(f"Error fetching from HLP monitor: {e}")

    try:
        liquidation_exploits = await liquidation_analyzer.fetch_exploits()
        all_exploits.extend(liquidation_exploits)
        logger.info(f"Fetched {len(liquidation_exploits)} exploits from liquidation analyzer")
    except Exception as e:
        logger.error(f"Error fetching from liquidation analyzer: {e}")

    try:
        oracle_exploits = await oracle_monitor.fetch_exploits()
        all_exploits.extend(oracle_exploits)
        logger.info(f"Fetched {len(oracle_exploits)} exploits from oracle monitor")
    except Exception as e:
        logger.error(f"Error fetching from oracle monitor: {e}")

    # Deduplicate by unique ID (tx_hash for transactions, generated hash for monitor events)
    seen = set()
    unique_exploits = []
    for exploit in all_exploits:
        exploit_id = _generate_exploit_id(exploit)
        if exploit_id not in seen:
            seen.add(exploit_id)
            unique_exploits.append(exploit)

    # Update cache
    exploit_cache['exploits'] = unique_exploits
    exploit_cache['last_updated'] = datetime.now(timezone.utc)

    logger.info(f"Total unique exploits: {len(unique_exploits)}")

    return unique_exploits


# ============================================================================
# SECURITY MONITORING ENDPOINTS
# ============================================================================

@app.get("/security/dashboard")
@limiter.limit("30/minute")  # Stricter limit for expensive security endpoint
async def get_security_dashboard(
    request: Request,
    api_key: Optional[str] = Depends(get_api_key)
):
    """
    Get comprehensive security overview

    Returns:
        Security dashboard with risk scores, active threats, and health metrics
    """
    try:
        # Get HLP vault health
        hlp_health = hlp_monitor.get_current_health()

        # Get active oracle deviations
        oracle_deviations = oracle_monitor.get_current_deviations()

        # Get recent exploits
        recent_exploits = exploit_cache.get('exploits', [])[:10]

        # Calculate overall risk score
        risk_score = _calculate_overall_risk_score(hlp_health, oracle_deviations, recent_exploits)

        # Determine risk level
        risk_level = "LOW"
        if risk_score >= 70:
            risk_level = "CRITICAL"
        elif risk_score >= 50:
            risk_level = "HIGH"
        elif risk_score >= 30:
            risk_level = "MEDIUM"

        # Get database statistics if available
        db_stats = {}
        if db_integration:
            try:
                hlp_stats = db_integration.get_hlp_statistics(days=30)
                recent_events = db_integration.get_security_events(hours=24, limit=10)

                db_stats = {
                    "hlp_statistics_30d": hlp_stats,
                    "security_events_24h": len(recent_events),
                    "database_enabled": True
                }
            except Exception as e:
                logger.warning(f"Could not fetch database statistics: {e}")
                db_stats = {"database_enabled": False}
        else:
            db_stats = {"database_enabled": False}

        return {
            "success": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "overall_risk": {
                "score": risk_score,
                "level": risk_level
            },
            "hlp_vault": {
                "is_healthy": hlp_health.is_healthy if hlp_health else True,
                "anomaly_score": hlp_health.anomaly_score if hlp_health else 0,
                "account_value": hlp_health.account_value if hlp_health else 0,
                "pnl_24h": hlp_health.pnl_24h if hlp_health else 0
            },
            "oracle_monitoring": {
                "active_deviations": len(oracle_deviations),
                "deviations": [d.to_dict() for d in oracle_deviations[:5]]
            },
            "recent_exploits": {
                "count_24h": len([e for e in recent_exploits if (datetime.now(timezone.utc) - e.get('timestamp', datetime.min)).total_seconds() < 86400]),
                "total_loss_24h": sum(e.get('amount_usd', 0) for e in recent_exploits if (datetime.now(timezone.utc) - e.get('timestamp', datetime.min)).total_seconds() < 86400),
                "recent": recent_exploits[:5]
            },
            "monitoring_status": {
                "hlp_monitor": "active",
                "oracle_monitor": "active",
                "liquidation_analyzer": "active"
            },
            "database": db_stats
        }

    except Exception as e:
        logger.error(f"Error generating security dashboard: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while generating security dashboard")


@app.get("/security/hlp-vault")
@limiter.limit("60/minute")
async def get_hlp_vault_health(request: Request):
    """
    Get HLP vault health and anomaly detection

    Returns:
        Current HLP vault health metrics and risk assessment
    """
    try:
        health = hlp_monitor.get_current_health()

        if not health:
            return {
                "success": False,
                "error": "Could not fetch HLP vault data"
            }

        return {
            "success": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "vault_address": health.vault_address,
            "health_status": {
                "is_healthy": health.is_healthy,
                "anomaly_score": health.anomaly_score,
                "health_issues": health.health_issues or []
            },
            "metrics": {
                "total_value_locked": health.total_value_locked,
                "account_value": health.account_value,
                "pnl_24h": health.pnl_24h,
                "pnl_7d": health.pnl_7d,
                "pnl_30d": health.pnl_30d
            },
            "performance": {
                "sharpe_ratio": health.sharpe_ratio,
                "max_drawdown": health.max_drawdown,
                "win_rate": health.win_rate
            },
            "risk_indicators": {
                "volatility_score": health.volatility_score,
                "loss_streak_score": health.loss_streak_score
            }
        }

    except Exception as e:
        logger.error(f"Error fetching HLP vault health: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while fetching HLP vault health")


@app.get("/security/oracle-deviations")
@limiter.limit("60/minute")
async def get_oracle_deviations(
    request: Request,
    active_only: bool = Query(default=True)
):
    """
    Get oracle price deviations

    Args:
        active_only: Only return currently active deviations

    Returns:
        List of oracle price deviations
    """
    try:
        if active_only:
            deviations = oracle_monitor.get_current_deviations()
        else:
            # Get all recent deviations from all assets
            deviations = []
            for asset in ['BTC', 'ETH', 'SOL', 'MATIC', 'ARB', 'OP', 'AVAX']:
                history = oracle_monitor.get_deviation_history(asset, limit=10)
                deviations.extend(history)

        return {
            "success": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "count": len(deviations),
            "deviations": [d.to_dict() for d in deviations]
        }

    except Exception as e:
        logger.error(f"Error fetching oracle deviations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while fetching oracle deviations")


@app.get("/security/events")
@limiter.limit("60/minute")
async def get_security_events(
    request: Request,
    severity: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200)
):
    """
    Get security events and alerts

    Args:
        severity: Filter by severity (critical, high, medium, low, info)
        limit: Maximum number of events to return

    Returns:
        List of security events
    """
    try:
        # For now, convert recent exploits to events format
        # In production, would store actual SecurityEvent objects
        exploits = exploit_cache.get('exploits', [])[:limit]

        events = []
        for exploit in exploits:
            category = exploit.get('category', '')
            exploit_severity = "medium"

            # Determine severity based on amount and category
            amount = exploit.get('amount_usd', 0)
            if amount > 5_000_000 or 'critical' in category:
                exploit_severity = "critical"
            elif amount > 1_000_000 or 'high' in category:
                exploit_severity = "high"
            elif 'manipulation' in category or 'oracle' in category:
                exploit_severity = "high"

            # Filter by severity if specified
            if severity and exploit_severity != severity.lower():
                continue

            event = {
                "event_id": exploit.get('tx_hash'),
                "timestamp": exploit.get('timestamp').isoformat() if isinstance(exploit.get('timestamp'), datetime) else exploit.get('timestamp'),
                "severity": exploit_severity,
                "threat_type": exploit.get('category', 'unknown'),
                "title": f"{exploit.get('protocol', 'Hyperliquid')} - ${exploit.get('amount_usd', 0):,.0f} detected",
                "description": exploit.get('description', ''),
                "source": exploit.get('source', 'unknown')
            }

            events.append(event)

        return {
            "success": True,
            "count": len(events),
            "events": events
        }

    except Exception as e:
        logger.error(f"Error fetching security events: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while fetching security events")


# ============================================================================
# DATABASE-BACKED ENDPOINTS
# ============================================================================

@app.get("/security/hlp-vault/history")
@limiter.limit("30/minute")
async def get_hlp_vault_history(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500)
):
    """
    Get historical HLP vault snapshots from database

    Args:
        limit: Maximum number of snapshots to return (1-500)

    Returns:
        Historical HLP vault snapshots
    """
    try:
        if not db_integration:
            raise HTTPException(
                status_code=503,
                detail="Database integration not available"
            )

        snapshots = db_integration.get_recent_hlp_snapshots(limit=limit)

        # Convert to dict format
        snapshot_data = []
        for snapshot in snapshots:
            snapshot_data.append({
                "timestamp": snapshot.timestamp.isoformat(),
                "vault_address": snapshot.vault_address,
                "account_value": float(snapshot.account_value),
                "pnl_24h": float(snapshot.pnl_24h) if snapshot.pnl_24h else None,
                "all_time_pnl": float(snapshot.all_time_pnl) if snapshot.all_time_pnl else None,
                "sharpe_ratio": float(snapshot.sharpe_ratio) if snapshot.sharpe_ratio else None,
                "max_drawdown": float(snapshot.max_drawdown),
                "anomaly_score": float(snapshot.anomaly_score),
                "is_healthy": snapshot.is_healthy,
                "health_issues": snapshot.health_issues
            })

        return {
            "success": True,
            "count": len(snapshot_data),
            "snapshots": snapshot_data
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching HLP vault history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while fetching HLP vault history")


@app.get("/security/oracle-deviations/history")
@limiter.limit("30/minute")
async def get_oracle_deviation_history(
    request: Request,
    asset: Optional[str] = Query(default=None),
    hours: int = Query(default=24, ge=1, le=168),
    limit: int = Query(default=100, ge=1, le=500)
):
    """
    Get historical oracle deviations from database

    Args:
        asset: Filter by asset (e.g., BTC, ETH)
        hours: Hours of history to retrieve (1-168)
        limit: Maximum number of deviations to return (1-500)

    Returns:
        Historical oracle deviations
    """
    try:
        if not db_integration:
            raise HTTPException(
                status_code=503,
                detail="Database integration not available"
            )

        if asset:
            deviations = db_integration.get_oracle_deviations_by_asset(asset, hours=hours)
        else:
            # Get all recent deviations across all assets
            from database.models import OracleDeviation as DBOracleDeviation
            from datetime import timedelta

            session = db_integration.db.get_session()
            try:
                cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
                deviations = session.query(DBOracleDeviation)\
                    .filter(DBOracleDeviation.timestamp >= cutoff)\
                    .order_by(DBOracleDeviation.timestamp.desc())\
                    .limit(limit)\
                    .all()
            finally:
                session.close()

        # Convert to dict format
        deviation_data = []
        for deviation in deviations[:limit]:
            deviation_data.append({
                "timestamp": deviation.timestamp.isoformat(),
                "asset": deviation.asset,
                "hyperliquid_price": float(deviation.hyperliquid_price),
                "binance_price": float(deviation.binance_price) if deviation.binance_price else None,
                "coinbase_price": float(deviation.coinbase_price) if deviation.coinbase_price else None,
                "max_deviation_pct": float(deviation.max_deviation_pct),
                "max_deviation_source": deviation.max_deviation_source,
                "risk_score": float(deviation.risk_score),
                "severity": deviation.severity,
                "duration_seconds": float(deviation.duration_seconds)
            })

        return {
            "success": True,
            "count": len(deviation_data),
            "deviations": deviation_data
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching oracle deviation history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while fetching oracle deviation history")


@app.get("/security/liquidation-patterns")
@limiter.limit("30/minute")
async def get_liquidation_patterns(
    request: Request,
    pattern_type: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200)
):
    """
    Get detected liquidation patterns from database

    Args:
        pattern_type: Filter by pattern type (flash_loan, cascade, etc.)
        limit: Maximum number of patterns to return (1-200)

    Returns:
        Detected liquidation patterns
    """
    try:
        if not db_integration:
            raise HTTPException(
                status_code=503,
                detail="Database integration not available"
            )

        patterns = db_integration.get_recent_liquidation_patterns(
            pattern_type=pattern_type,
            limit=limit
        )

        # Convert to dict format
        pattern_data = []
        for pattern in patterns:
            pattern_data.append({
                "id": pattern.id,
                "pattern_type": pattern.pattern_type,
                "start_time": pattern.start_time.isoformat(),
                "end_time": pattern.end_time.isoformat(),
                "duration_seconds": float(pattern.duration_seconds),
                "total_liquidated_usd": float(pattern.total_liquidated_usd),
                "affected_users": pattern.affected_users,
                "assets_involved": pattern.assets_involved,
                "suspicion_score": float(pattern.suspicion_score),
                "liquidation_count": len(pattern.liquidation_ids) if pattern.liquidation_ids else 0,
                "price_impact": pattern.price_impact
            })

        return {
            "success": True,
            "count": len(pattern_data),
            "patterns": pattern_data
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching liquidation patterns: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while fetching liquidation patterns")


@app.get("/security/events/database")
@limiter.limit("30/minute")
async def get_database_security_events(
    request: Request,
    severity: Optional[str] = Query(default=None),
    threat_type: Optional[str] = Query(default=None),
    hours: int = Query(default=24, ge=1, le=168),
    limit: int = Query(default=100, ge=1, le=500)
):
    """
    Get security events from database

    Args:
        severity: Filter by severity (critical, high, medium, low, info)
        threat_type: Filter by threat type
        hours: Hours of history to retrieve (1-168)
        limit: Maximum number of events to return (1-500)

    Returns:
        Security events from database
    """
    try:
        if not db_integration:
            raise HTTPException(
                status_code=503,
                detail="Database integration not available"
            )

        events = db_integration.get_security_events(
            severity=severity,
            threat_type=threat_type,
            hours=hours,
            limit=limit
        )

        # Convert to dict format
        event_data = []
        for event in events:
            event_data.append({
                "id": event.event_id,
                "timestamp": event.timestamp.isoformat(),
                "threat_type": event.threat_type,
                "severity": event.severity,
                "title": event.title,
                "description": event.description,
                "indicators": event.indicators or {},
                "affected_addresses": event.related_addresses or [],
                "is_active": event.is_active,
                "resolved_at": event.resolved_at.isoformat() if event.resolved_at else None
            })

        return {
            "success": True,
            "count": len(event_data),
            "events": event_data
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching database security events: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while fetching database security events")


# ============================================================================
# MACHINE LEARNING ENDPOINTS
# ============================================================================

@app.get("/ml/status")
@limiter.limit("60/minute")
async def get_ml_status(request: Request):
    """
    Get ML model status

    Returns:
        Status of ML models (loaded, trained, etc.)
    """
    if not ML_AVAILABLE:
        return {
            "success": False,
            "ml_available": False,
            "message": "ML dependencies not installed"
        }

    try:
        status = {
            "success": True,
            "ml_available": ML_AVAILABLE,
            "models": {}
        }

        if ml_model_manager:
            active_models = ml_model_manager.get_active_models()
            status["models"] = active_models

        return status

    except Exception as e:
        logger.error(f"Error getting ML status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while getting ML status")


@app.get("/ml/anomalies")
@limiter.limit("30/minute")
async def get_ml_anomalies(
    request: Request,
    limit: int = Query(default=10, ge=1, le=100),
    api_key: Optional[str] = Depends(get_api_key)
):
    """
    Get recent anomalies detected by ML model

    Args:
        limit: Maximum number of anomalies to return

    Returns:
        List of detected anomalies with scores and contributing features
    """
    if not ML_AVAILABLE or not ml_model_manager or not ml_model_manager.anomaly_detector:
        raise HTTPException(
            status_code=503,
            detail="ML anomaly detector not available. Train model first: python scripts/train_ml_models.py"
        )

    try:
        # Get recent HLP snapshots
        hlp_snapshots = hlp_monitor.get_historical_snapshots(limit=limit * 2)

        if not hlp_snapshots:
            return {
                "success": True,
                "anomalies": [],
                "message": "No recent data available for anomaly detection"
            }

        # Convert snapshots to dict format for feature extraction
        snapshot_data = [
            {
                'timestamp': s.timestamp,
                'account_value': s.account_value,
                'pnl_24h': s.pnl_24h,
                'all_time_pnl': s.all_time_pnl,
                'sharpe_ratio': s.sharpe_ratio,
                'max_drawdown': s.max_drawdown,
                'anomaly_score': s.anomaly_score
            }
            for s in hlp_snapshots
        ]

        # Extract features
        features = ml_feature_engineer.extract_hlp_features(snapshot_data)

        if features.empty:
            return {
                "success": True,
                "anomalies": [],
                "message": "Insufficient data for anomaly detection"
            }

        # Detect anomalies
        anomalies_df = ml_model_manager.anomaly_detector.predict(features)

        # Filter for actual anomalies and apply limit
        detected_anomalies = anomalies_df[anomalies_df['is_anomaly'] == True].head(limit).to_dict('records')

        return {
            "success": True,
            "count": len(detected_anomalies),
            "anomalies": detected_anomalies,
            "model_info": {
                "model_type": "Isolation Forest",
                "features_used": len(ml_model_manager.anomaly_detector.feature_names)
            }
        }

    except Exception as e:
        logger.error(f"Error detecting anomalies: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while detecting anomalies")


@app.get("/ml/forecast")
@limiter.limit("30/minute")
async def get_ml_forecast(
    request: Request,
    hours: int = Query(default=24, ge=1, le=168),
    api_key: Optional[str] = Depends(get_api_key)
):
    """
    Get risk forecast for next N hours

    Args:
        hours: Number of hours to forecast (default 24, max 168/7 days)

    Returns:
        Forecasted risk scores with confidence intervals
    """
    if not ML_AVAILABLE or not ml_model_manager or not ml_model_manager.risk_predictor:
        raise HTTPException(
            status_code=503,
            detail="ML risk predictor not available. Train model first: python scripts/train_ml_models.py"
        )

    try:
        # Generate forecast
        forecast = ml_model_manager.risk_predictor.predict(steps=hours)

        if not forecast:
            raise HTTPException(
                status_code=500,
                detail="Failed to generate forecast"
            )

        return {
            "success": True,
            "forecast": forecast,
            "model_info": {
                "model_type": "ARIMA",
                "order": ml_model_manager.risk_predictor.order,
                "horizon_hours": hours
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating forecast: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while generating forecast")


@app.get("/ml/features")
@limiter.limit("60/minute")
async def get_ml_features(
    request: Request,
    limit: int = Query(default=10, ge=1, le=100),
    api_key: Optional[str] = Depends(get_api_key)
):
    """
    Get extracted ML features for recent monitoring data

    Args:
        limit: Number of recent samples to extract features from

    Returns:
        Extracted features for recent monitoring data
    """
    if not ML_AVAILABLE or not ml_feature_engineer:
        raise HTTPException(
            status_code=503,
            detail="ML feature engineer not available"
        )

    try:
        # Get current snapshot to demonstrate feature extraction
        current_snapshot = hlp_monitor.get_current_health()

        if not current_snapshot:
            return {
                "success": True,
                "features": [],
                "message": "No current data available to extract features from"
            }

        # Convert to dict format for feature extraction
        snapshot_data = [{
            'timestamp': current_snapshot.timestamp,
            'account_value': current_snapshot.account_value,
            'pnl_24h': current_snapshot.pnl_24h,
            'pnl_7d': current_snapshot.pnl_7d,
            'pnl_30d': current_snapshot.pnl_30d,
            'sharpe_ratio': current_snapshot.sharpe_ratio,
            'max_drawdown': current_snapshot.max_drawdown,
            'anomaly_score': current_snapshot.anomaly_score,
            'is_healthy': current_snapshot.is_healthy
        }]

        # Extract features
        features_df = ml_feature_engineer.extract_hlp_features(snapshot_data)

        if features_df.empty:
            return {
                "success": False,
                "features": [],
                "message": "Could not extract features from current snapshot (requires more historical data)"
            }

        # Convert to list of dicts
        features_list = features_df.to_dict('records')

        return {
            "success": True,
            "count": len(features_list),
            "features": features_list,
            "feature_names": list(features_df.columns),
            "note": "Showing features from current snapshot. For historical features, train models with historical data first."
        }

    except Exception as e:
        logger.error(f"Error extracting features: {e}", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail="Feature extraction not available. Requires historical data collection."
        )


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _calculate_overall_risk_score(hlp_health, oracle_deviations, recent_exploits) -> float:
    """
    Calculate overall risk score for the Hyperliquid ecosystem

    Args:
        hlp_health: HLP vault health snapshot
        oracle_deviations: List of active oracle deviations
        recent_exploits: List of recent exploits

    Returns:
        Risk score 0-100
    """
    score = 0.0

    # HLP health component (0-40 points)
    if hlp_health:
        score += (hlp_health.anomaly_score / 100) * 40

    # Oracle deviation component (0-30 points)
    if oracle_deviations:
        max_oracle_risk = max([d.risk_score for d in oracle_deviations], default=0)
        score += (max_oracle_risk / 100) * 30

    # Recent exploits component (0-30 points)
    recent_24h = [e for e in recent_exploits if (datetime.now(timezone.utc) - e.get('timestamp', datetime.min)).total_seconds() < 86400]
    if recent_24h:
        # More recent exploits = higher risk
        score += min(30, len(recent_24h) * 10)

    return min(100, score)


# ===== Observability Endpoints =====

@app.get("/health", tags=["Observability"])
async def health_check():
    """
    System health check endpoint

    Returns health status of all components:
    - API server
    - Database connection
    - Monitor health
    - ML models (if available)
    """
    health_status = health_checker.check_health()

    # Add additional checks
    health_status['components']['api'] = {
        'healthy': True,
        'uptime_seconds': int((datetime.now(timezone.utc) - app.state.start_time).total_seconds())
            if hasattr(app.state, 'start_time') else 0
    }

    # Database check
    try:
        db = get_db_integration()
        health_status['components']['database'] = {
            'healthy': True,
            'type': 'sqlite' if 'sqlite' in str(db) else 'unknown'
        }
    except Exception as e:
        health_status['components']['database'] = {
            'healthy': False,
            'error': str(e)
        }

    # ML models check
    if ML_AVAILABLE:
        try:
            model_manager = get_model_manager()
            health_status['components']['ml_models'] = {
                'healthy': True,
                'anomaly_detector': model_manager.has_trained_model('anomaly_detector'),
                'risk_predictor': model_manager.has_trained_model('risk_predictor')
            }
        except Exception as e:
            health_status['components']['ml_models'] = {
                'healthy': False,
                'error': str(e)
            }
    else:
        health_status['components']['ml_models'] = {
            'healthy': True,
            'available': False,
            'note': 'ML dependencies not installed'
        }

    status_code = 200 if health_status['healthy'] else 503
    return health_status


@app.get("/metrics", tags=["Observability"])
async def metrics():
    """
    Prometheus-compatible metrics endpoint

    Returns metrics in Prometheus text format if prometheus_client is installed,
    otherwise returns JSON summary.
    """
    try:
        from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
        from fastapi.responses import Response

        # Return Prometheus format
        return Response(
            content=generate_latest(),
            media_type=CONTENT_TYPE_LATEST
        )
    except ImportError:
        # Fallback to JSON summary
        return {
            'note': 'Install prometheus_client for Prometheus format metrics',
            'metrics_summary': get_metrics_summary()
        }


@app.get("/metrics/summary", tags=["Observability"])
async def metrics_summary():
    """
    Human-readable metrics summary

    Returns:
        JSON summary of key metrics
    """
    return get_metrics_summary()


# ===== Startup Event =====

@app.on_event("startup")
async def startup_event():
    """Initialize observability on startup"""
    app.state.start_time = datetime.now(timezone.utc)

    # Register health checks
    health_checker.register_component('startup', lambda: {
        'healthy': True,
        'started_at': app.state.start_time.isoformat()
    })

    logger.info("KAMIYO API started with observability enabled")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
