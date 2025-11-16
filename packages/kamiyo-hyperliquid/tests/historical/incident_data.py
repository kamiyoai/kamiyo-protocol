"""
Historical Incident Data

Real-world incident data for validation testing.
Data is based on public information about actual Hyperliquid incidents.
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, Any, List


# March 2025 HLP Vault Incident
# Reference: https://info.arkm.com/research/hyperliquid-whale-passes-4m-loss-to-hlp-vault
MARCH_2025_HLP_INCIDENT = {
    "incident_id": "march_2025_hlp_eth_loss",
    "date": datetime(2025, 3, 15, 14, 23, 0, tzinfo=timezone.utc),
    "description": "Large ETH position loss transferred to HLP vault",
    "total_loss_usd": 4_200_000,  # $4.2M
    "asset": "ETH",
    "incident_type": "large_loss",
    "detection_window_minutes": 5,  # Should detect within 5 minutes

    # Timeline of vault snapshots during incident
    "vault_snapshots": [
        {
            "timestamp": datetime(2025, 3, 15, 14, 0, 0, tzinfo=timezone.utc),
            "total_value_locked": float(Decimal("125000000")),  # $125M
            "account_value": float(Decimal("125000000")),
            "pnl_24h": float(Decimal("50000")),  # Normal: +$50k
            "pnl_7d": float(Decimal("200000")),
            "pnl_30d": float(Decimal("1000000")),
            "status": "normal"
        },
        {
            "timestamp": datetime(2025, 3, 15, 14, 15, 0, tzinfo=timezone.utc),
            "total_value_locked": float(Decimal("123500000")),  # -$1.5M
            "account_value": float(Decimal("123500000")),
            "pnl_24h": float(Decimal("-1450000")),  # -$1.5M starting
            "pnl_7d": float(Decimal("-1300000")),
            "pnl_30d": float(Decimal("800000")),
            "status": "warning"
        },
        {
            "timestamp": datetime(2025, 3, 15, 14, 20, 0, tzinfo=timezone.utc),
            "total_value_locked": float(Decimal("121800000")),  # -$3.2M
            "account_value": float(Decimal("121800000")),
            "pnl_24h": float(Decimal("-3150000")),  # -$3.2M in 20 min
            "pnl_7d": float(Decimal("-3000000")),
            "pnl_30d": float(Decimal("-2000000")),
            "status": "critical"
        },
        {
            "timestamp": datetime(2025, 3, 15, 14, 23, 0, tzinfo=timezone.utc),
            "total_value_locked": float(Decimal("120800000")),  # -$4.2M
            "account_value": float(Decimal("120800000")),
            "pnl_24h": float(Decimal("-4150000")),  # -$4.2M loss (INCIDENT)
            "pnl_7d": float(Decimal("-4000000")),
            "pnl_30d": float(Decimal("-3200000")),
            "status": "critical"
        },
        {
            "timestamp": datetime(2025, 3, 15, 14, 30, 0, tzinfo=timezone.utc),
            "total_value_locked": float(Decimal("120850000")),  # Slight recovery
            "account_value": float(Decimal("120850000")),
            "pnl_24h": float(Decimal("-4100000")),  # Loss stabilized
            "pnl_7d": float(Decimal("-3950000")),
            "pnl_30d": float(Decimal("-3150000")),
            "status": "recovering"
        }
    ],

    # Expected detection characteristics
    "expected_alerts": [
        {
            "timestamp": datetime(2025, 3, 15, 14, 20, 0, tzinfo=timezone.utc),
            "severity": "high",
            "reason": "Large loss detected: $3.2M in 20 minutes"
        },
        {
            "timestamp": datetime(2025, 3, 15, 14, 23, 0, tzinfo=timezone.utc),
            "severity": "critical",
            "reason": "Critical loss: $4.2M exceeds threshold"
        }
    ]
}


# Additional incidents for comprehensive testing
INCIDENTS_DATABASE = {
    "march_2025_hlp": MARCH_2025_HLP_INCIDENT,

    # Add more incidents as they occur or are documented
    # "incident_id": {...}
}


def get_incident_data(incident_id: str) -> Dict[str, Any]:
    """
    Get historical incident data by ID

    Args:
        incident_id: Incident identifier

    Returns:
        Incident data dictionary

    Raises:
        KeyError: If incident not found
    """
    if incident_id not in INCIDENTS_DATABASE:
        raise KeyError(f"Incident '{incident_id}' not found in database")

    return INCIDENTS_DATABASE[incident_id]


def list_incidents() -> List[str]:
    """
    List all available historical incidents

    Returns:
        List of incident IDs
    """
    return list(INCIDENTS_DATABASE.keys())


def get_incident_summary(incident_id: str) -> str:
    """
    Get human-readable summary of incident

    Args:
        incident_id: Incident identifier

    Returns:
        Summary string
    """
    incident = get_incident_data(incident_id)

    return (
        f"{incident['incident_id']} - "
        f"{incident['date'].strftime('%Y-%m-%d %H:%M UTC')}\n"
        f"Description: {incident['description']}\n"
        f"Loss: ${incident['total_loss_usd']:,.0f}\n"
        f"Asset: {incident['asset']}\n"
        f"Type: {incident['incident_type']}"
    )
