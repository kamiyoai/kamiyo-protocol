"""
MCP Wallet Monitoring Tool
Check if wallet has interacted with exploited protocols - Team+ tier feature

This tool allows users to check if a wallet address has interactions with
protocols that have been exploited, providing risk assessment.
"""

import sys
import os
import re
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from decimal import Decimal

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from database import get_db

logger = logging.getLogger(__name__)

# Supported chains
SUPPORTED_CHAINS = ["ethereum", "bsc", "polygon", "arbitrum", "base", "solana"]

# Risk levels
RISK_LEVELS = {
    "safe": {"threshold": 0, "description": "No interactions with exploited protocols detected"},
    "low": {"threshold": 1, "description": "Minor interactions detected, monitor closely"},
    "medium": {"threshold": 3, "description": "Multiple interactions detected, consider reviewing positions"},
    "high": {"threshold": 5, "description": "Significant exposure detected, immediate review recommended"},
    "critical": {"threshold": 10, "description": "Critical exposure detected, urgent action required"}
}


def validate_wallet_address(address: str, chain: str = "ethereum") -> Dict[str, Any]:
    """
    Validate wallet address format for specified chain

    Args:
        address: Wallet address to validate
        chain: Blockchain to validate for

    Returns:
        Dictionary with is_valid (bool) and error (str) if invalid
    """
    if not address:
        return {"is_valid": False, "error": "Wallet address is required"}

    # Remove whitespace
    address = address.strip()

    # EVM chains (Ethereum, BSC, Polygon, Arbitrum, Base)
    if chain in ["ethereum", "bsc", "polygon", "arbitrum", "base"]:
        # Check for 0x prefix and 40 hex characters
        if not re.match(r'^0x[a-fA-F0-9]{40}$', address):
            return {
                "is_valid": False,
                "error": f"Invalid EVM address format. Expected 0x followed by 40 hex characters."
            }
        return {"is_valid": True}

    # Solana addresses (base58, 32-44 characters)
    elif chain == "solana":
        # Basic Solana address validation (base58, typically 32-44 chars)
        if not re.match(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$', address):
            return {
                "is_valid": False,
                "error": "Invalid Solana address format. Expected base58 encoded address (32-44 characters)."
            }
        return {"is_valid": True}

    else:
        return {"is_valid": False, "error": f"Unsupported chain: {chain}"}


def calculate_risk_score(interactions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate overall risk score based on wallet interactions

    Args:
        interactions: List of interaction records

    Returns:
        Dictionary with risk_level, score, and recommendations
    """
    if not interactions:
        return {
            "risk_level": "safe",
            "score": 0,
            "description": RISK_LEVELS["safe"]["description"],
            "recommendations": ["No risky interactions detected. Continue monitoring for new exploits."]
        }

    # Calculate score based on:
    # - Number of interactions (1 point each)
    # - Amount at risk (0.5 points per $10k)
    # - Recent interactions (2x multiplier if within 30 days)

    score = 0
    total_at_risk = Decimal(0)
    recent_count = 0
    thirty_days_ago = datetime.now() - timedelta(days=30)

    for interaction in interactions:
        # Base score for interaction
        score += 1

        # Add score for amount
        amount = interaction.get("amount_usd", 0)
        if amount:
            total_at_risk += Decimal(str(amount))
            score += float(amount) / 10000 * 0.5  # 0.5 points per $10k

        # Check if recent
        if interaction.get("last_interaction"):
            try:
                last_interaction = datetime.fromisoformat(interaction["last_interaction"])
                if last_interaction > thirty_days_ago:
                    recent_count += 1
                    score *= 1.2  # 20% multiplier for recent interactions
            except (ValueError, TypeError):
                pass

    # Determine risk level
    risk_level = "safe"
    for level in ["low", "medium", "high", "critical"]:
        if score >= RISK_LEVELS[level]["threshold"]:
            risk_level = level

    # Generate recommendations
    recommendations = []

    if risk_level == "safe":
        recommendations.append("No risky interactions detected. Continue monitoring for new exploits.")
    elif risk_level == "low":
        recommendations.append("Monitor your positions with the identified protocols.")
        recommendations.append("Consider setting up alerts for these protocols.")
    elif risk_level == "medium":
        recommendations.append("Review all active positions with exploited protocols.")
        recommendations.append("Consider reducing exposure to affected protocols.")
        recommendations.append("Enable real-time alerts for wallet activity.")
    elif risk_level == "high":
        recommendations.append("URGENT: Review all positions immediately.")
        recommendations.append("Consider withdrawing funds from affected protocols.")
        recommendations.append("Check for approval transactions that may be exploitable.")
        recommendations.append("Monitor wallet for unauthorized transactions.")
    else:  # critical
        recommendations.append("CRITICAL: Immediate action required!")
        recommendations.append("Withdraw all funds from affected protocols immediately.")
        recommendations.append("Revoke all token approvals for exploited protocols.")
        recommendations.append("Consider moving funds to a new wallet address.")
        recommendations.append("Enable multi-signature protection for large holdings.")

    if recent_count > 0:
        recommendations.append(f"Note: {recent_count} interaction(s) occurred within the last 30 days.")

    return {
        "risk_level": risk_level,
        "score": round(score, 2),
        "total_at_risk_usd": float(total_at_risk),
        "description": RISK_LEVELS[risk_level]["description"],
        "recommendations": recommendations
    }


def get_exploited_protocols(lookback_days: int = 90) -> List[Dict[str, Any]]:
    """
    Get list of exploited protocols from database

    Args:
        lookback_days: How far back to check for exploits

    Returns:
        List of exploited protocol records
    """
    try:
        db = get_db()

        # Calculate cutoff date
        cutoff_date = datetime.now() - timedelta(days=lookback_days)

        # Query exploits from database
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT
                    protocol,
                    chain,
                    amount_usd,
                    timestamp,
                    tx_hash,
                    category,
                    description
                FROM exploits
                WHERE timestamp >= ?
                AND LOWER(protocol) NOT LIKE '%test%'
                AND LOWER(COALESCE(category, '')) NOT LIKE '%test%'
                ORDER BY timestamp DESC
            """, (cutoff_date,))

            rows = cursor.fetchall()

            # Convert to list of dicts
            exploits = []
            for row in rows:
                exploits.append({
                    "protocol": row["protocol"],
                    "chain": row["chain"],
                    "amount_usd": row["amount_usd"],
                    "timestamp": row["timestamp"],
                    "tx_hash": row["tx_hash"],
                    "category": row["category"],
                    "description": row["description"]
                })

            logger.info(f"Found {len(exploits)} exploits in last {lookback_days} days")
            return exploits

    except Exception as e:
        logger.error(f"Error fetching exploited protocols: {e}")
        return []


def simulate_wallet_interactions(
    wallet_address: str,
    chain: str,
    exploited_protocols: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Simulate checking wallet interactions with exploited protocols

    NOTE: This is a placeholder implementation. In production, this would:
    1. Query blockchain data providers (Etherscan, Alchemy, QuickNode)
    2. Check transaction history for wallet
    3. Match transactions against exploited protocol addresses
    4. Calculate amounts at risk

    For now, returns simulated data for demonstration.

    Args:
        wallet_address: Wallet address to check
        chain: Blockchain to scan
        exploited_protocols: List of exploited protocols

    Returns:
        List of interaction records
    """
    interactions = []

    # Simulate finding interactions (in production, would query blockchain)
    # For demo purposes, randomly match some protocols based on wallet hash
    wallet_hash = int(wallet_address[-8:], 16) if chain != "solana" else sum(ord(c) for c in wallet_address[-8:])

    for i, protocol in enumerate(exploited_protocols[:5]):  # Check up to 5 protocols
        # Simulate: 30% chance of interaction based on wallet hash
        if (wallet_hash + i) % 10 < 3:
            # Simulate interaction data
            interaction = {
                "protocol": protocol["protocol"],
                "chain": protocol["chain"],
                "exploit_date": protocol["timestamp"],
                "exploit_amount_usd": protocol["amount_usd"],
                "wallet_interaction_count": (wallet_hash + i) % 5 + 1,
                "last_interaction": (datetime.now() - timedelta(days=(wallet_hash + i) % 90)).isoformat(),
                "amount_usd": float(protocol["amount_usd"] or 0) * 0.001 if protocol["amount_usd"] else None,  # Simulate 0.1% exposure
                "interaction_type": "token_transfer",
                "status": "at_risk" if i < 2 else "monitoring",
                "details": f"Found {(wallet_hash + i) % 5 + 1} transaction(s) with {protocol['protocol']}"
            }
            interactions.append(interaction)

    return interactions


async def check_wallet_interactions(
    wallet_address: str,
    chain: str = "ethereum",
    lookback_days: int = 90,
    user_tier: Optional[str] = None
) -> Dict[str, Any]:
    """
    Check if wallet has interacted with exploited protocols

    **Team+ Premium Feature**

    This tool analyzes a wallet's transaction history to identify interactions
    with protocols that have been exploited. It provides risk assessment and
    recommendations for protecting funds.

    Args:
        wallet_address: Ethereum/EVM wallet address or Solana address
        chain: Blockchain to scan (ethereum, bsc, polygon, arbitrum, base, solana)
        lookback_days: How far back to check for exploits (1-365 days)
        user_tier: User's subscription tier (for access control)

    Returns:
        Dictionary with:
        - wallet_address: Validated wallet address
        - chain: Blockchain scanned
        - scan_date: Timestamp of scan
        - exploits_checked: Number of exploits checked against
        - interactions_found: List of risky interactions
        - risk_assessment: Overall risk score and recommendations
        - upgrade_required: True if user needs to upgrade (Personal tier)
    """

    # ========== ACCESS CONTROL: TEAM+ ONLY ==========
    if not user_tier or user_tier.lower() not in ["team", "enterprise"]:
        return {
            "error": "premium_feature_required",
            "message": "Wallet monitoring is a Team+ premium feature",
            "required_tier": "team",
            "current_tier": user_tier or "personal",
            "upgrade_url": "https://kamiyo.io/pricing",
            "feature_benefits": [
                "Monitor wallet interactions with exploited protocols",
                "Get risk scores and recommendations",
                "Track exposure across multiple chains",
                "Receive alerts for risky interactions"
            ],
            "upgrade_required": True
        }

    # ========== INPUT VALIDATION ==========

    # Validate chain
    chain = chain.lower()
    if chain not in SUPPORTED_CHAINS:
        return {
            "error": "invalid_chain",
            "message": f"Unsupported chain: {chain}",
            "supported_chains": SUPPORTED_CHAINS
        }

    # Validate wallet address
    validation = validate_wallet_address(wallet_address, chain)
    if not validation["is_valid"]:
        return {
            "error": "invalid_address",
            "message": validation["error"],
            "wallet_address": wallet_address,
            "chain": chain
        }

    # Validate lookback_days
    if not (1 <= lookback_days <= 365):
        return {
            "error": "invalid_lookback",
            "message": "Lookback days must be between 1 and 365",
            "provided": lookback_days
        }

    # ========== FETCH EXPLOITED PROTOCOLS ==========

    logger.info(f"Checking wallet {wallet_address} on {chain} (lookback: {lookback_days} days)")

    exploited_protocols = get_exploited_protocols(lookback_days)

    if not exploited_protocols:
        return {
            "wallet_address": wallet_address,
            "chain": chain,
            "scan_date": datetime.now().isoformat(),
            "lookback_days": lookback_days,
            "exploits_checked": 0,
            "interactions_found": [],
            "risk_assessment": {
                "risk_level": "safe",
                "score": 0,
                "description": "No exploits found in specified time period",
                "recommendations": ["No action required. Continue monitoring."]
            },
            "upgrade_required": False
        }

    # ========== CHECK WALLET INTERACTIONS ==========

    # In production, this would query blockchain data providers
    # For now, use simulated data
    interactions = simulate_wallet_interactions(wallet_address, chain, exploited_protocols)

    # ========== CALCULATE RISK SCORE ==========

    risk_assessment = calculate_risk_score(interactions)

    # ========== PREPARE RESPONSE ==========

    return {
        "wallet_address": wallet_address,
        "chain": chain,
        "scan_date": datetime.now().isoformat(),
        "lookback_days": lookback_days,
        "exploits_checked": len(exploited_protocols),
        "interactions_found": interactions,
        "interaction_count": len(interactions),
        "risk_assessment": risk_assessment,
        "upgrade_required": False,
        "metadata": {
            "scan_type": "simulated",  # Will be "blockchain" in production
            "data_sources": ["kamiyo_database"],
            "note": "This is simulated data. Production will query actual blockchain transactions."
        }
    }


# For testing
if __name__ == "__main__":
    import asyncio

    # Test with Team tier user
    async def test():
        result = await check_wallet_interactions(
            wallet_address="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            chain="ethereum",
            lookback_days=90,
            user_tier="team"
        )

        import json
        print(json.dumps(result, indent=2))

    asyncio.run(test())
