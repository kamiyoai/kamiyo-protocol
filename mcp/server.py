#!/usr/bin/env python3
"""
KAMIYO MCP Server
Main MCP server implementation for crypto exploit intelligence

This server wraps the existing KAMIYO API to provide AI agents
(especially Claude Desktop) with real-time exploit intelligence.
"""

import sys
import os
import asyncio
import logging
from datetime import datetime
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from fastmcp import FastMCP
except ImportError:
    print("Error: fastmcp not installed. Run: pip install -r requirements-mcp.txt")
    sys.exit(1)

from mcp.config import get_mcp_config
from mcp.tools import check_wallet_interactions, search_exploits, assess_protocol_risk

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load configuration
config = get_mcp_config()

# Initialize MCP server
mcp = FastMCP(
    name=config.name,
    version=config.version,
    description=config.description,
)

# Global state
server_start_time: Optional[datetime] = None


@mcp.tool()
async def health_check() -> dict:
    """
    Check MCP server health and status

    Returns server status, version, uptime, and service availability.
    This is a free tool that doesn't require authentication.

    Returns:
        dict: Server health information including:
            - status: Server status (healthy/degraded/unhealthy)
            - version: MCP server version
            - uptime_seconds: How long the server has been running
            - subscription_service: Status of subscription verification
            - api_connection: Status of KAMIYO API connection
            - database: Database connection status
    """
    try:
        # Calculate uptime
        uptime = None
        if server_start_time:
            uptime = (datetime.now() - server_start_time).total_seconds()

        # Check API connection
        api_status = "unknown"
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{config.kamiyo_api_url}/health")
                api_status = "connected" if response.status_code == 200 else "degraded"
        except Exception as e:
            logger.warning(f"API health check failed: {e}")
            api_status = "disconnected"

        # Check database (basic check)
        db_status = "unknown"
        try:
            # Import database module
            from database import get_db
            db = get_db()
            # Simple query to check connection
            db.execute_with_retry("SELECT 1", readonly=True)
            db_status = "connected"
        except Exception as e:
            logger.warning(f"Database health check failed: {e}")
            db_status = "disconnected"

        # Determine overall status
        if api_status == "connected" and db_status == "connected":
            overall_status = "healthy"
        elif api_status == "disconnected" or db_status == "disconnected":
            overall_status = "degraded"
        else:
            overall_status = "healthy"

        return {
            "status": overall_status,
            "version": config.version,
            "uptime_seconds": uptime,
            "server_name": config.name,
            "environment": config.environment,
            "subscription_service": "operational",
            "api_connection": api_status,
            "database": db_status,
            "timestamp": datetime.now().isoformat(),
        }

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "version": config.version,
            "error": str(e),
            "timestamp": datetime.now().isoformat(),
        }


@mcp.tool()
async def search_crypto_exploits(
    query: str,
    limit: int = 10,
    since: str | None = None,
    chain: str | None = None,
    subscription_tier: str = "free"
) -> dict:
    """
    Search cryptocurrency exploit database with subscription-tier-based access.

    Search through KAMIYO's comprehensive exploit intelligence database. Results
    are filtered based on your subscription tier, with free users getting delayed
    data and paid tiers getting real-time intelligence.

    **Subscription Tier Access:**
    - Free: Max 10 results, 24h delayed data
    - Personal: Max 50 results, real-time data
    - Team: Max 200 results, real-time data
    - Enterprise: Max 1000 results, real-time data + advanced filters

    Args:
        query: Search term (protocol name, token, vulnerability type)
               Examples: "Ethereum", "flash loan", "Uniswap", "reentrancy"
        limit: Maximum number of results (capped by tier)
        since: ISO 8601 date to search from (optional)
               Example: "2024-01-01T00:00:00Z"
        chain: Filter by blockchain (optional)
               Examples: "Ethereum", "BSC", "Polygon", "Solana"
        subscription_tier: User's subscription tier (internal use)

    Returns:
        dict: Search results including:
            - exploits: List of matching exploits with full details
            - metadata: Search stats (total_returned, total_matching, search_time_ms)
            - tier_info: Subscription tier limits and effective limit applied
            - sources: List of data sources used

    Examples:
        # Search for Uniswap exploits
        search_crypto_exploits("Uniswap", limit=20)

        # Search with date filter
        search_crypto_exploits("flash loan", since="2024-01-01T00:00:00Z")

        # Filter by chain
        search_crypto_exploits("DeFi", chain="Ethereum", limit=50)
    """
    # TODO: Get user tier from MCP authentication context
    user_tier = subscription_tier or "free"

    # Call the implementation
    result = search_exploits(
        query=query,
        limit=limit,
        since=since,
        chain=chain,
        user_tier=user_tier
    )

    return result


@mcp.tool()
async def assess_defi_protocol_risk(
    protocol_name: str,
    chain: str | None = None,
    time_window_days: int = 90,
    subscription_tier: str = "personal"
) -> dict:
    """
    Assess security risk for a DeFi protocol based on exploit history.

    Analyzes a protocol's historical exploit data to calculate a comprehensive
    risk score (0-100) and provide actionable security recommendations. Higher
    subscription tiers unlock detailed analysis and peer comparisons.

    **Risk Levels:**
    - low (0-29): Minimal risk, good security track record
    - medium (30-59): Moderate risk, some security concerns
    - high (60-84): Significant risk, multiple exploit incidents
    - critical (85-100): Severe risk, urgent action required

    **Subscription Tier Features:**
    - Personal: Risk score and level only
    - Team: + Recent exploit summary (last 5 exploits)
    - Enterprise: + Detailed risk breakdown, recommendations, peer comparison

    Args:
        protocol_name: DeFi protocol to assess (e.g., "Uniswap", "Curve")
        chain: Optional blockchain filter (e.g., "Ethereum", "BSC")
        time_window_days: Days of history to analyze (1-365, default: 90)
        subscription_tier: User's subscription tier (internal use)

    Returns:
        dict: Risk assessment including:
            - protocol: Protocol name analyzed
            - risk_score: Score from 0-100
            - risk_level: low/medium/high/critical
            - analysis_period_days: Time window analyzed

            Team+ tiers also get:
            - exploit_count: Number of exploits found
            - total_loss_usd: Total value lost
            - recent_exploits: Summary of recent incidents

            Enterprise tier also gets:
            - risk_factors: Detailed risk score breakdown
            - recommendations: Actionable security advice
            - comparison_to_peers: How protocol compares to similar ones

    Examples:
        # Basic risk assessment
        assess_defi_protocol_risk("Uniswap")

        # Assess specific chain with longer history
        assess_defi_protocol_risk("Curve", chain="Ethereum", time_window_days=180)

        # Enterprise analysis with full recommendations
        assess_defi_protocol_risk("Aave", subscription_tier="enterprise")
    """
    # TODO: Get user tier from MCP authentication context
    user_tier = subscription_tier or "personal"

    # Call the implementation
    result = assess_protocol_risk(
        protocol_name=protocol_name,
        chain=chain,
        time_window_days=time_window_days,
        user_tier=user_tier
    )

    return result


@mcp.tool()
async def monitor_wallet(
    wallet_address: str,
    chain: str = "ethereum",
    lookback_days: int = 90
) -> dict:
    """
    Check if wallet has interacted with exploited protocols (Team+ Premium Feature)

    Analyzes a wallet's transaction history to identify interactions with protocols
    that have been exploited. Provides risk assessment and recommendations.

    **Access Level**: Team+ subscription required

    Args:
        wallet_address: Ethereum/EVM wallet address (0x...) or Solana address
        chain: Blockchain to scan (ethereum, bsc, polygon, arbitrum, base, solana)
        lookback_days: How far back to check for exploits (1-365 days, default: 90)

    Returns:
        dict: Wallet interaction analysis including:
            - wallet_address: Validated wallet address
            - chain: Blockchain scanned
            - interactions_found: List of risky interactions with exploited protocols
            - risk_assessment: Risk score, level, and recommendations
            - upgrade_required: True if user needs Team+ subscription

    Examples:
        # Check Ethereum wallet
        monitor_wallet("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0")

        # Check on different chain with custom lookback
        monitor_wallet("0xABC...", chain="polygon", lookback_days=180)
    """
    # TODO: Get user tier from MCP authentication context
    # For now, we'll pass None which will require upgrade
    user_tier = None  # Will be set from auth context

    # Call the implementation
    result = await check_wallet_interactions(
        wallet_address=wallet_address,
        chain=chain,
        lookback_days=lookback_days,
        user_tier=user_tier
    )

    return result


@mcp.on_startup()
async def startup():
    """
    Initialize server resources on startup

    This function is called when the MCP server starts up.
    It performs initialization tasks like:
    - Recording startup time
    - Validating configuration
    - Testing database connection
    - Testing API connection
    """
    global server_start_time
    server_start_time = datetime.now()

    logger.info(f"Starting KAMIYO MCP Server v{config.version}")
    logger.info(f"Environment: {config.environment}")
    logger.info(f"KAMIYO API URL: {config.kamiyo_api_url}")

    # Validate production configuration
    if config.is_production:
        logger.info("Running in PRODUCTION mode - validating configuration...")

        # Check critical configuration
        if config.jwt_secret == "dev_jwt_secret_change_in_production":
            raise ValueError("Production deployment requires secure MCP_JWT_SECRET")

        if config.stripe_secret_key and config.stripe_secret_key.startswith("sk_test_"):
            raise ValueError("Production deployment cannot use Stripe test keys")

    # Test database connection
    try:
        from database import get_db
        db = get_db()
        db.execute_with_retry("SELECT 1", readonly=True)
        logger.info("Database connection: OK")
    except Exception as e:
        logger.warning(f"Database connection failed: {e}")
        if config.is_production:
            raise

    # Test API connection
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{config.kamiyo_api_url}/health")
            if response.status_code == 200:
                logger.info("KAMIYO API connection: OK")
            else:
                logger.warning(f"KAMIYO API returned status {response.status_code}")
    except Exception as e:
        logger.warning(f"KAMIYO API connection failed: {e}")
        if config.is_production:
            raise

    logger.info("KAMIYO MCP Server started successfully")
    logger.info("Available tools: health_check, search_crypto_exploits, assess_defi_protocol_risk, monitor_wallet")


@mcp.on_shutdown()
async def shutdown():
    """
    Clean up resources on shutdown

    This function is called when the MCP server is shutting down.
    It performs cleanup tasks like closing connections.
    """
    logger.info("KAMIYO MCP Server shutting down...")

    # Add any cleanup tasks here (database connections, etc.)

    logger.info("KAMIYO MCP Server stopped")


def main():
    """Main entry point for the MCP server"""
    import argparse

    parser = argparse.ArgumentParser(description="KAMIYO MCP Server")
    parser.add_argument(
        "--token",
        type=str,
        help="MCP authentication token (for testing)",
    )
    parser.add_argument(
        "--transport",
        type=str,
        choices=["stdio", "sse"],
        default="stdio",
        help="MCP transport protocol (default: stdio for Claude Desktop)",
    )
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Host to bind to (for SSE transport)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8002,
        help="Port to bind to (for SSE transport)",
    )

    args = parser.parse_args()

    try:
        if args.transport == "stdio":
            # stdio transport for Claude Desktop
            logger.info("Starting MCP server with stdio transport (Claude Desktop mode)")
            mcp.run()
        else:
            # SSE transport for web-based agents
            logger.info(f"Starting MCP server with SSE transport on {args.host}:{args.port}")
            mcp.run(transport="sse", host=args.host, port=args.port)

    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    except Exception as e:
        logger.error(f"Server error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()
