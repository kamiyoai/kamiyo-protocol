"""
KAMIYO MCP Server
Model Context Protocol server for crypto exploit intelligence

Enables AI agents (especially Claude Desktop) to access real-time
crypto exploit intelligence through subscriptions.
"""

__version__ = "1.0.0"

# Import config (no external dependencies)
from .config import MCPConfig, get_mcp_config

# Try to import server (requires fastmcp)
try:
    from .server import mcp
    __all__ = ["mcp", "MCPConfig", "get_mcp_config"]
except ImportError:
    # fastmcp not installed - only expose config
    __all__ = ["MCPConfig", "get_mcp_config"]
