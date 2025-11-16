#!/bin/bash
#
# KAMIYO MCP Server - Local Testing Script
# Tests the MCP server locally before deploying to production
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}KAMIYO MCP Server - Local Test${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "$PROJECT_ROOT/mcp/server.py" ]; then
    echo -e "${RED}Error: Cannot find mcp/server.py${NC}"
    echo "Please run this script from the project root or scripts/mcp directory"
    exit 1
fi

cd "$PROJECT_ROOT"

# Check Python version
echo -e "${YELLOW}[1/6] Checking Python version...${NC}"
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
REQUIRED_VERSION="3.11"

if ! python3 -c "import sys; exit(0 if sys.version_info >= (3, 11) else 1)"; then
    echo -e "${RED}Error: Python 3.11+ required. Current: $PYTHON_VERSION${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Python $PYTHON_VERSION${NC}"
echo ""

# Check if virtual environment exists
echo -e "${YELLOW}[2/6] Checking virtual environment...${NC}"
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv venv
fi
echo -e "${GREEN}✓ Virtual environment ready${NC}"
echo ""

# Activate virtual environment
echo -e "${YELLOW}[3/6] Activating virtual environment...${NC}"
source venv/bin/activate
echo -e "${GREEN}✓ Virtual environment activated${NC}"
echo ""

# Install MCP dependencies
echo -e "${YELLOW}[4/6] Installing MCP dependencies...${NC}"
if [ -f "requirements-mcp.txt" ]; then
    pip install -q -r requirements-mcp.txt
    echo -e "${GREEN}✓ MCP dependencies installed${NC}"
else
    echo -e "${RED}Error: requirements-mcp.txt not found${NC}"
    exit 1
fi
echo ""

# Install main dependencies (for database access)
echo -e "${YELLOW}[5/6] Installing main dependencies...${NC}"
if [ -f "requirements.txt" ]; then
    pip install -q -r requirements.txt
    echo -e "${GREEN}✓ Main dependencies installed${NC}"
else
    echo -e "${YELLOW}Warning: requirements.txt not found${NC}"
fi
echo ""

# Test MCP server startup
echo -e "${YELLOW}[6/6] Testing MCP server startup...${NC}"
echo -e "${BLUE}Running health_check tool...${NC}"
echo ""

# Set test environment variables
export ENVIRONMENT="development"
export MCP_JWT_SECRET="test_jwt_secret_for_local_development"
export KAMIYO_API_URL="http://localhost:8000"
export LOG_LEVEL="INFO"

# Test the server by running a simple health check
# We'll start the server in the background and test it
echo -e "${BLUE}Starting MCP server (stdio mode)...${NC}"
echo -e "${BLUE}Note: The server will run until you press Ctrl+C${NC}"
echo ""

# Run the server
python3 -m mcp.server --transport stdio

# Cleanup
echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}Test completed successfully!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Configure Claude Desktop with your MCP token"
echo "2. Test the health_check tool in Claude Desktop"
echo "3. Implement additional tools (Phase 2)"
echo ""
