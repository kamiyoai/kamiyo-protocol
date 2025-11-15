"""
Risk Assessment Tool for KAMIYO MCP Server

Provides protocol risk assessment functionality with tier-based detail levels.
Analyzes exploit history to calculate risk scores and provide recommendations.
"""

import sys
import os
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import logging

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from database import get_db

logger = logging.getLogger(__name__)


def assess_protocol_risk(
    protocol_name: str,
    chain: Optional[str] = None,
    time_window_days: int = 90,
    user_tier: str = "personal"
) -> Dict[str, Any]:
    """
    Assess risk level for a DeFi protocol based on historical exploit data.

    This tool analyzes a protocol's security track record by examining:
    - Historical exploit frequency and severity
    - Total value lost in exploits
    - Recency of last exploit
    - Pattern of exploit types

    The risk score (0-100) is calculated based on multiple factors:
    - Number of past exploits (40% weight)
    - Severity/value of exploits (30% weight)
    - Recency of last exploit (20% weight)
    - Protocol maturity/age (10% weight)

    Risk Levels:
    - low: 0-29 (minimal risk, good security track record)
    - medium: 30-59 (moderate risk, some concerns)
    - high: 60-84 (significant risk, multiple issues)
    - critical: 85-100 (severe risk, immediate attention needed)

    Args:
        protocol_name: Name of the DeFi protocol to assess (e.g., "Uniswap", "Aave")
        chain: Optional blockchain filter (e.g., "Ethereum", "BSC")
        time_window_days: Number of days to analyze (default: 90, max: 365)
        user_tier: Subscription tier for feature gating
                   - "personal": Basic risk score and level
                   - "team": + Recent exploit summary
                   - "enterprise": + Detailed analysis and recommendations

    Returns:
        Dictionary containing risk assessment with the following structure:
        {
            "protocol": str,              # Protocol name
            "chain": str or None,         # Blockchain filter (if specified)
            "risk_score": int,            # Risk score 0-100
            "risk_level": str,            # low/medium/high/critical
            "analysis_period_days": int,  # Time window analyzed
            "assessed_at": str,           # ISO timestamp

            # Team and Enterprise tiers only:
            "exploit_count": int,         # Total exploits found
            "total_loss_usd": float,      # Total value lost
            "last_exploit_date": str or None,  # Date of most recent exploit
            "recent_exploits": List[Dict],     # Summary of recent exploits

            # Enterprise tier only:
            "risk_factors": Dict,         # Breakdown of risk factors
            "recommendations": List[str], # Actionable security recommendations
            "audit_status": str,          # Security audit assessment
            "comparison_to_peers": Dict   # How this protocol compares to similar ones
        }

    Raises:
        ValueError: If parameters are invalid
        RuntimeError: If database query fails

    Examples:
        # Personal tier: Basic risk assessment
        >>> assess_protocol_risk("Uniswap", user_tier="personal")
        {
            "protocol": "Uniswap",
            "risk_score": 15,
            "risk_level": "low",
            "analysis_period_days": 90,
            "assessed_at": "2025-01-15T10:30:00Z"
        }

        # Team tier: With exploit summary
        >>> assess_protocol_risk("Curve", chain="Ethereum", user_tier="team")
        {
            "protocol": "Curve",
            "chain": "Ethereum",
            "risk_score": 45,
            "risk_level": "medium",
            "exploit_count": 3,
            "total_loss_usd": 2500000.0,
            "last_exploit_date": "2024-12-20",
            "recent_exploits": [...]
        }

        # Enterprise tier: Full analysis with recommendations
        >>> assess_protocol_risk("BNB Bridge", time_window_days=180, user_tier="enterprise")
        {
            "protocol": "BNB Bridge",
            "risk_score": 92,
            "risk_level": "critical",
            "exploit_count": 5,
            "total_loss_usd": 586000000.0,
            "risk_factors": {
                "exploit_frequency_score": 40,
                "severity_score": 30,
                "recency_score": 18,
                "maturity_score": 4
            },
            "recommendations": [
                "Immediate security audit recommended",
                "Consider pausing protocol until vulnerabilities are addressed",
                ...
            ],
            "audit_status": "high_priority",
            "comparison_to_peers": {...}
        }
    """
    # Validate parameters
    if not protocol_name or not isinstance(protocol_name, str):
        raise ValueError("protocol_name must be a non-empty string")

    if time_window_days < 1 or time_window_days > 365:
        raise ValueError("time_window_days must be between 1 and 365")

    if user_tier not in ["personal", "team", "enterprise"]:
        raise ValueError("user_tier must be one of: personal, team, enterprise")

    # Normalize protocol name for case-insensitive matching
    protocol_name_lower = protocol_name.lower()

    try:
        # Get database instance
        db = get_db()

        # Calculate time window
        since = datetime.now() - timedelta(days=time_window_days)

        # Build query to fetch exploits for this protocol
        query = """
            SELECT
                id, tx_hash, chain, protocol, amount_usd, timestamp,
                source, source_url, category, description, recovery_status
            FROM exploits
            WHERE LOWER(protocol) LIKE ?
            AND timestamp >= ?
            AND LOWER(protocol) NOT LIKE '%test%'
            AND LOWER(COALESCE(category, '')) NOT LIKE '%test%'
        """
        params = [f"%{protocol_name_lower}%", since]

        # Add chain filter if specified
        if chain:
            query += " AND chain = ?"
            params.append(chain)

        query += " ORDER BY timestamp DESC"

        # Execute query
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            exploits = [dict(row) for row in rows]

        # Calculate risk score
        risk_score, risk_factors = _calculate_risk_score(
            exploits=exploits,
            time_window_days=time_window_days
        )

        # Determine risk level
        risk_level = _get_risk_level(risk_score)

        # Build base response (available to all tiers)
        result = {
            "protocol": protocol_name,
            "chain": chain,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "analysis_period_days": time_window_days,
            "assessed_at": datetime.now().isoformat() + "Z"
        }

        # Add team tier features
        if user_tier in ["team", "enterprise"]:
            total_loss = sum(e.get("amount_usd", 0) for e in exploits)
            last_exploit_date = exploits[0]["timestamp"] if exploits else None

            # Format last exploit date
            if last_exploit_date:
                if isinstance(last_exploit_date, str):
                    last_exploit_date = datetime.fromisoformat(last_exploit_date.replace('Z', '+00:00')).date().isoformat()
                else:
                    last_exploit_date = last_exploit_date.date().isoformat()

            result.update({
                "exploit_count": len(exploits),
                "total_loss_usd": round(total_loss, 2),
                "last_exploit_date": last_exploit_date,
                "recent_exploits": _format_recent_exploits(exploits[:5])  # Top 5 recent
            })

        # Add enterprise tier features
        if user_tier == "enterprise":
            result.update({
                "risk_factors": risk_factors,
                "recommendations": _generate_recommendations(
                    risk_score=risk_score,
                    risk_level=risk_level,
                    exploits=exploits,
                    protocol_name=protocol_name
                ),
                "audit_status": _assess_audit_status(risk_score, exploits),
                "comparison_to_peers": _compare_to_peers(
                    db=db,
                    protocol_name=protocol_name,
                    chain=chain,
                    time_window_days=time_window_days,
                    current_risk_score=risk_score
                )
            })

        logger.info(
            f"Risk assessment completed for {protocol_name} "
            f"(tier: {user_tier}, score: {risk_score}, level: {risk_level})"
        )

        return result

    except Exception as e:
        logger.error(f"Risk assessment failed for {protocol_name}: {e}")
        raise RuntimeError(f"Failed to assess protocol risk: {str(e)}")


def _calculate_risk_score(
    exploits: List[Dict[str, Any]],
    time_window_days: int
) -> tuple[int, Dict[str, int]]:
    """
    Calculate risk score (0-100) based on exploit history.

    Returns tuple of (total_score, factor_breakdown)
    """
    # Initialize scores
    exploit_frequency_score = 0
    severity_score = 0
    recency_score = 0
    maturity_score = 0

    # 1. Exploit Frequency Score (0-40 points)
    # More exploits = higher risk
    exploit_count = len(exploits)
    if exploit_count == 0:
        exploit_frequency_score = 0
    elif exploit_count == 1:
        exploit_frequency_score = 10
    elif exploit_count == 2:
        exploit_frequency_score = 20
    elif exploit_count <= 4:
        exploit_frequency_score = 30
    else:  # 5+ exploits
        exploit_frequency_score = 40

    # 2. Severity Score (0-30 points)
    # Based on total value lost
    if exploits:
        total_loss = sum(e.get("amount_usd", 0) for e in exploits)
        avg_loss = total_loss / len(exploits) if exploits else 0

        if avg_loss >= 50_000_000:  # $50M+ average
            severity_score = 30
        elif avg_loss >= 10_000_000:  # $10M-50M average
            severity_score = 25
        elif avg_loss >= 1_000_000:  # $1M-10M average
            severity_score = 20
        elif avg_loss >= 100_000:  # $100K-1M average
            severity_score = 15
        elif avg_loss >= 10_000:  # $10K-100K average
            severity_score = 10
        else:  # < $10K average
            severity_score = 5

    # 3. Recency Score (0-20 points)
    # More recent exploits = higher risk
    if exploits:
        latest_exploit = exploits[0]  # Already sorted by timestamp DESC
        latest_timestamp = latest_exploit.get("timestamp")

        if latest_timestamp:
            # Parse timestamp
            if isinstance(latest_timestamp, str):
                latest_date = datetime.fromisoformat(latest_timestamp.replace('Z', '+00:00'))
            else:
                latest_date = latest_timestamp

            days_since_last = (datetime.now() - latest_date.replace(tzinfo=None)).days

            if days_since_last <= 7:  # Last week
                recency_score = 20
            elif days_since_last <= 30:  # Last month
                recency_score = 15
            elif days_since_last <= 90:  # Last 3 months
                recency_score = 10
            elif days_since_last <= 180:  # Last 6 months
                recency_score = 5
            else:  # Older than 6 months
                recency_score = 2

    # 4. Maturity Score (0-10 points)
    # Protocols with exploits spread over time are higher risk
    # (indicates systemic issues rather than one-off incidents)
    if len(exploits) >= 2:
        # Calculate time span of exploits
        timestamps = []
        for e in exploits:
            ts = e.get("timestamp")
            if ts:
                if isinstance(ts, str):
                    timestamps.append(datetime.fromisoformat(ts.replace('Z', '+00:00')))
                else:
                    timestamps.append(ts)

        if len(timestamps) >= 2:
            time_span_days = (max(timestamps) - min(timestamps)).days

            if time_span_days >= 180:  # 6+ months of recurring issues
                maturity_score = 10
            elif time_span_days >= 90:  # 3-6 months
                maturity_score = 7
            elif time_span_days >= 30:  # 1-3 months
                maturity_score = 5
            else:  # < 1 month (cluster of exploits)
                maturity_score = 3

    # Calculate total score
    total_score = min(
        exploit_frequency_score + severity_score + recency_score + maturity_score,
        100
    )

    # Return score and breakdown
    factor_breakdown = {
        "exploit_frequency_score": exploit_frequency_score,
        "severity_score": severity_score,
        "recency_score": recency_score,
        "maturity_score": maturity_score
    }

    return total_score, factor_breakdown


def _get_risk_level(risk_score: int) -> str:
    """Determine risk level from score."""
    if risk_score < 30:
        return "low"
    elif risk_score < 60:
        return "medium"
    elif risk_score < 85:
        return "high"
    else:
        return "critical"


def _format_recent_exploits(exploits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Format exploit data for team tier response."""
    formatted = []
    for exploit in exploits:
        timestamp = exploit.get("timestamp")
        if timestamp:
            if isinstance(timestamp, str):
                timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00')).isoformat() + "Z"
            else:
                timestamp = timestamp.isoformat() + "Z"

        formatted.append({
            "date": timestamp,
            "chain": exploit.get("chain", "Unknown"),
            "amount_usd": round(exploit.get("amount_usd", 0), 2),
            "category": exploit.get("category", "Unknown"),
            "description": exploit.get("description", "")[:200],  # Truncate long descriptions
            "source_url": exploit.get("source_url")
        })

    return formatted


def _generate_recommendations(
    risk_score: int,
    risk_level: str,
    exploits: List[Dict[str, Any]],
    protocol_name: str
) -> List[str]:
    """Generate actionable security recommendations based on risk assessment."""
    recommendations = []

    if risk_level == "critical":
        recommendations.extend([
            f"URGENT: Immediate security audit required for {protocol_name}",
            "Consider pausing protocol interactions until vulnerabilities are addressed",
            "Review all smart contract permissions and admin keys",
            "Implement circuit breakers and emergency pause mechanisms if not present",
            "Conduct comprehensive code review with focus on identified vulnerability patterns"
        ])

    elif risk_level == "high":
        recommendations.extend([
            f"High priority: Schedule comprehensive security audit for {protocol_name}",
            "Review and strengthen access controls and multi-sig requirements",
            "Implement monitoring and alerting for suspicious activity",
            "Consider purchasing additional exploit insurance coverage",
            "Establish incident response plan and test it regularly"
        ])

    elif risk_level == "medium":
        recommendations.extend([
            f"Moderate risk: Plan routine security assessment for {protocol_name}",
            "Monitor protocol closely for unusual activity",
            "Review recent exploit patterns to identify common vulnerabilities",
            "Ensure security best practices are followed in all deployments",
            "Stay informed about similar exploits in the ecosystem"
        ])

    else:  # low
        recommendations.extend([
            f"Low risk: Maintain current security practices for {protocol_name}",
            "Continue regular security monitoring and updates",
            "Participate in bug bounty programs to identify issues proactively",
            "Keep dependencies and libraries up to date"
        ])

    # Add specific recommendations based on exploit patterns
    if exploits:
        categories = [e.get("category", "").lower() for e in exploits]

        if any("flash loan" in cat for cat in categories):
            recommendations.append(
                "⚠️ Flash loan attacks detected: Implement flash loan protection mechanisms"
            )

        if any("reentrancy" in cat for cat in categories):
            recommendations.append(
                "⚠️ Reentrancy vulnerabilities found: Review and fix reentrancy guards"
            )

        if any("oracle" in cat for cat in categories):
            recommendations.append(
                "⚠️ Oracle manipulation detected: Use multiple oracle sources and price sanity checks"
            )

        if any("access control" in cat or "admin" in cat for cat in categories):
            recommendations.append(
                "⚠️ Access control issues: Implement robust multi-sig and timelock mechanisms"
            )

    return recommendations


def _assess_audit_status(risk_score: int, exploits: List[Dict[str, Any]]) -> str:
    """Determine audit status/priority based on risk."""
    if risk_score >= 85:
        return "critical_priority"
    elif risk_score >= 60:
        return "high_priority"
    elif risk_score >= 30:
        return "medium_priority"
    else:
        return "low_priority"


def _compare_to_peers(
    db,
    protocol_name: str,
    chain: Optional[str],
    time_window_days: int,
    current_risk_score: int
) -> Dict[str, Any]:
    """
    Compare protocol's risk to similar protocols in the ecosystem.
    Enterprise tier feature.
    """
    try:
        # Get statistics for all protocols in the time window
        since = datetime.now() - timedelta(days=time_window_days)

        query = """
            SELECT
                protocol,
                COUNT(*) as exploit_count,
                SUM(amount_usd) as total_loss,
                AVG(amount_usd) as avg_loss
            FROM exploits
            WHERE timestamp >= ?
            AND LOWER(protocol) NOT LIKE '%test%'
        """
        params = [since]

        if chain:
            query += " AND chain = ?"
            params.append(chain)

        query += " GROUP BY protocol ORDER BY exploit_count DESC LIMIT 20"

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            peer_data = [dict(row) for row in rows]

        if not peer_data:
            return {
                "comparison": "insufficient_data",
                "message": "Not enough peer data for comparison"
            }

        # Calculate percentile ranking
        total_peers = len(peer_data)
        current_exploits = next(
            (p["exploit_count"] for p in peer_data if p["protocol"].lower() == protocol_name.lower()),
            0
        )

        worse_than_count = sum(1 for p in peer_data if p["exploit_count"] > current_exploits)
        percentile = int((worse_than_count / total_peers) * 100) if total_peers > 0 else 50

        # Determine comparison status
        if percentile >= 75:
            comparison = "better_than_most"
            message = f"{protocol_name} has fewer exploits than 75% of similar protocols"
        elif percentile >= 50:
            comparison = "average"
            message = f"{protocol_name} has average exploit frequency compared to peers"
        elif percentile >= 25:
            comparison = "worse_than_average"
            message = f"{protocol_name} has more exploits than most similar protocols"
        else:
            comparison = "significantly_worse"
            message = f"{protocol_name} has significantly more exploits than peers"

        # Get top 3 safest protocols for reference
        safest_protocols = sorted(peer_data, key=lambda x: x["exploit_count"])[:3]

        return {
            "comparison": comparison,
            "percentile": percentile,
            "message": message,
            "total_protocols_analyzed": total_peers,
            "safest_alternatives": [
                {
                    "protocol": p["protocol"],
                    "exploit_count": p["exploit_count"],
                    "total_loss_usd": round(p["total_loss"], 2)
                }
                for p in safest_protocols
            ]
        }

    except Exception as e:
        logger.error(f"Failed to compare to peers: {e}")
        return {
            "comparison": "error",
            "message": f"Could not complete peer comparison: {str(e)}"
        }


# Export for MCP server
__all__ = ["assess_protocol_risk"]
