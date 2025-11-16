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
from typing import Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import Tool, TextContent
except ImportError:
    print("Error: mcp not installed. Run: pip install -r requirements-mcp.txt")
    sys.exit(1)

from kamiyo_mcp.config import get_mcp_config
from kamiyo_mcp.tools import check_wallet_interactions, search_exploits, assess_protocol_risk

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load configuration
config = get_mcp_config()

# Initialize MCP server
server = Server(config.name)

# Global state
server_start_time: datetime | None = None


@server.list_tools()
async def list_tools() -> list[Tool]:
    """List available MCP tools"""
    return [
        Tool(
            name="health_check",
            description="Check MCP server health and status. Returns server status, version, uptime, and service availability. This is a free tool that doesn't require authentication.",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="search_crypto_exploits",
            description="Search cryptocurrency exploit database with subscription-tier-based access. Search through KAMIYO's comprehensive exploit intelligence database.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search term (protocol name, token, vulnerability type). Examples: 'Ethereum', 'flash loan', 'Uniswap', 'reentrancy'"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results (default: 10)",
                        "default": 10
                    },
                    "since": {
                        "type": "string",
                        "description": "ISO 8601 date to search from (optional). Example: '2024-01-01T00:00:00Z'"
                    },
                    "chain": {
                        "type": "string",
                        "description": "Filter by blockchain (optional). Examples: 'Ethereum', 'BSC', 'Polygon', 'Solana'"
                    },
                    "subscription_tier": {
                        "type": "string",
                        "description": "User's subscription tier",
                        "default": "free"
                    }
                },
                "required": ["query"]
            }
        ),
        Tool(
            name="assess_defi_protocol_risk",
            description="Assess security risk for a DeFi protocol based on exploit history. Analyzes a protocol's historical exploit data to calculate a comprehensive risk score (0-100) and provide actionable security recommendations.",
            inputSchema={
                "type": "object",
                "properties": {
                    "protocol_name": {
                        "type": "string",
                        "description": "DeFi protocol to assess (e.g., 'Uniswap', 'Curve')"
                    },
                    "chain": {
                        "type": "string",
                        "description": "Optional blockchain filter (e.g., 'Ethereum', 'BSC')"
                    },
                    "time_window_days": {
                        "type": "integer",
                        "description": "Days of history to analyze (1-365, default: 90)",
                        "default": 90
                    },
                    "subscription_tier": {
                        "type": "string",
                        "description": "User's subscription tier",
                        "default": "personal"
                    }
                },
                "required": ["protocol_name"]
            }
        ),
        Tool(
            name="monitor_wallet",
            description="Check if wallet has interacted with exploited protocols (Team+ Premium Feature). Analyzes a wallet's transaction history to identify interactions with protocols that have been exploited.",
            inputSchema={
                "type": "object",
                "properties": {
                    "wallet_address": {
                        "type": "string",
                        "description": "Ethereum/EVM wallet address (0x...) or Solana address"
                    },
                    "chain": {
                        "type": "string",
                        "description": "Blockchain to scan (ethereum, bsc, polygon, arbitrum, base, solana)",
                        "default": "ethereum"
                    },
                    "lookback_days": {
                        "type": "integer",
                        "description": "How far back to check for exploits (1-365 days, default: 90)",
                        "default": 90
                    }
                },
                "required": ["wallet_address"]
            }
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: Any) -> list[TextContent]:
    """Handle tool calls"""

    if name == "health_check":
        result = await health_check()
        return [TextContent(type="text", text=str(result))]

    elif name == "search_crypto_exploits":
        query = arguments.get("query")
        limit = arguments.get("limit", 10)
        since = arguments.get("since")
        chain = arguments.get("chain")
        subscription_tier = arguments.get("subscription_tier", "free")

        user_tier = subscription_tier or "free"
        result = search_exploits(
            query=query,
            limit=limit,
            since=since,
            chain=chain,
            user_tier=user_tier
        )
        return [TextContent(type="text", text=str(result))]

    elif name == "assess_defi_protocol_risk":
        protocol_name = arguments.get("protocol_name")
        chain = arguments.get("chain")
        time_window_days = arguments.get("time_window_days", 90)
        subscription_tier = arguments.get("subscription_tier", "personal")

        user_tier = subscription_tier or "personal"
        result = assess_protocol_risk(
            protocol_name=protocol_name,
            chain=chain,
            time_window_days=time_window_days,
            user_tier=user_tier
        )
        return [TextContent(type="text", text=str(result))]

    elif name == "monitor_wallet":
        wallet_address = arguments.get("wallet_address")
        chain = arguments.get("chain", "ethereum")
        lookback_days = arguments.get("lookback_days", 90)

        result = await check_wallet_interactions(
            wallet_address=wallet_address,
            chain=chain,
            lookback_days=lookback_days,
            user_tier=None
        )
        return [TextContent(type="text", text=str(result))]

    else:
        raise ValueError(f"Unknown tool: {name}")


async def health_check() -> dict:
    """
    Check MCP server health and status

    Returns server status, version, uptime, and service availability.
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

        # Check database
        db_status = "unknown"
        try:
            from database import get_db
            db = get_db()
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


async def startup():
    """Initialize server resources on startup"""
    global server_start_time
    server_start_time = datetime.now()

    logger.info(f"Starting KAMIYO MCP Server v{config.version}")
    logger.info(f"Environment: {config.environment}")
    logger.info(f"KAMIYO API URL: {config.kamiyo_api_url}")

    # Validate production configuration
    if config.is_production:
        logger.info("Running in PRODUCTION mode - validating configuration...")

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


async def shutdown():
    """Clean up resources on shutdown"""
    logger.info("KAMIYO MCP Server shutting down...")
    logger.info("KAMIYO MCP Server stopped")


async def main():
    """Main entry point for the MCP server"""
    try:
        await startup()

        async with stdio_server() as (read_stream, write_stream):
            await server.run(
                read_stream,
                write_stream,
                server.create_initialization_options()
            )

        await shutdown()

    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    except Exception as e:
        logger.error(f"Server error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
