#!/usr/bin/env python3
"""
KAMIYO MCP Client with PayAI Integration

This example demonstrates how to:
1. Connect to KAMIYO MCP server
2. Call tools that require payment
3. Handle 402 Payment Required responses
4. Authorize payment via PayAI
5. Receive exploit intelligence data via MCP

Requirements:
    pip install mcp
"""

import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from decimal import Decimal
import base64
import json


async def authorize_payai_payment(endpoint: str, amount_usdc: Decimal) -> str:
    """
    Authorize payment via PayAI Network

    In production, integrate with PayAI SDK:
    - Connect wallet
    - Sign payment authorization
    - Return payment token
    """
    print(f"💳 Authorizing payment for {endpoint}: ${amount_usdc} USDC")

    # Mock payment authorization
    mock_payment = {
        "x402Version": 1,
        "scheme": "exact",
        "network": "base",
        "payload": {
            "payer": "0xMockAddress",
            "amount": str(int(amount_usdc * Decimal(10**6))),
            "resource": endpoint
        }
    }

    payment_token = base64.b64encode(
        json.dumps(mock_payment).encode('utf-8')
    ).decode('utf-8')

    print("✅ Payment authorized")
    return payment_token


async def call_tool_with_payment(session: ClientSession, tool_name: str, arguments: dict):
    """
    Call MCP tool with automatic payment handling

    Args:
        session: MCP client session
        tool_name: Name of the tool to call
        arguments: Tool arguments

    Returns:
        Tool result or None if payment failed
    """
    try:
        # Attempt to call tool
        print(f"📡 Calling tool: {tool_name}")
        result = await session.call_tool(tool_name, arguments=arguments)
        print(f"✅ Tool executed successfully")
        return result

    except Exception as e:
        error_msg = str(e)

        # Check if 402 Payment Required
        if "402" in error_msg or "payment" in error_msg.lower():
            print("💰 Payment required!")

            # In a real implementation, parse the 402 response to get payment details
            # For this example, we'll use hardcoded values
            endpoint = f"/mcp/{tool_name}"
            amount_usdc = Decimal("0.01")  # Default price

            # Authorize payment
            payment_token = await authorize_payai_payment(endpoint, amount_usdc)

            # Retry with payment
            print("🔄 Retrying with payment...")

            # MCP doesn't natively support custom headers yet
            # In production, you would need to:
            # 1. Use HTTP-based MCP transport
            # 2. Add X-PAYMENT header to request
            # 3. Or implement custom payment middleware

            # For now, we'll show the concept
            print("⚠️  Note: MCP payment integration requires HTTP transport")
            print("   Use FastAPI endpoint directly for payment support")

            return None
        else:
            print(f"❌ Error calling tool: {e}")
            raise


async def main():
    """Main MCP client example"""

    print("="*70)
    print("KAMIYO MCP CLIENT - PAYAI INTEGRATION EXAMPLE")
    print("="*70 + "\n")

    # MCP server configuration
    server_params = StdioServerParameters(
        command="python",
        args=["mcp_server.py"],  # Your MCP server script
        env=None
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # Initialize session
            await session.initialize()
            print("✅ MCP session initialized\n")

            # List available tools
            tools = await session.list_tools()
            print(f"📋 Available tools ({len(tools.tools)}):")
            for tool in tools.tools:
                print(f"   • {tool.name}: {tool.description}")
            print()

            # Example 1: Get exploits
            print("Example 1: Get recent exploits")
            print("-" * 70)
            result = await call_tool_with_payment(
                session,
                "kamiyo.get_exploits",
                arguments={"chain": "ethereum", "limit": 10}
            )

            if result:
                print(f"Received: {len(result.get('exploits', []))} exploits\n")

            # Example 2: Get latest alert
            print("Example 2: Get latest exploit alert")
            print("-" * 70)
            result = await call_tool_with_payment(
                session,
                "kamiyo.get_latest_alert",
                arguments={}
            )

            if result:
                print(f"Latest alert: {result.get('protocol', 'Unknown')}\n")

            # Example 3: Deep dive analysis
            print("Example 3: Request deep dive analysis")
            print("-" * 70)
            result = await call_tool_with_payment(
                session,
                "kamiyo.deep_dive_analysis",
                arguments={"tx_hash": "0xabc..."}
            )

            if result:
                print(f"Analysis complete\n")

    print("="*70)


if __name__ == "__main__":
    asyncio.run(main())
