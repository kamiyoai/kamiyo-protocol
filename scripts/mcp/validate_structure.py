#!/usr/bin/env python3.11
"""
Validate MCP Server Structure
Tests that all required files and modules are present and properly structured
"""

import sys
import os
from pathlib import Path

# Colors for output
RED = '\033[0;31m'
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
BLUE = '\033[0;34m'
NC = '\033[0m'  # No Color


def print_success(msg):
    print(f"{GREEN}✓ {msg}{NC}")


def print_error(msg):
    print(f"{RED}✗ {msg}{NC}")


def print_info(msg):
    print(f"{BLUE}{msg}{NC}")


def check_file_exists(filepath, description):
    """Check if a file exists"""
    if filepath.exists():
        print_success(f"{description}: {filepath.name}")
        return True
    else:
        print_error(f"{description} missing: {filepath}")
        return False


def check_directory_exists(dirpath, description):
    """Check if a directory exists"""
    if dirpath.exists() and dirpath.is_dir():
        print_success(f"{description}: {dirpath.name}/")
        return True
    else:
        print_error(f"{description} missing: {dirpath}")
        return False


def validate_module(project_root, module_name):
    """Try to import a Python module"""
    try:
        # Add project root to path
        if str(project_root) not in sys.path:
            sys.path.insert(0, str(project_root))

        # Try importing
        __import__(module_name.replace('/', '.'))
        print_success(f"Module imports correctly: {module_name}")
        return True
    except Exception as e:
        print_error(f"Module import failed: {module_name} - {e}")
        return False


def main():
    print_info("=" * 50)
    print_info("KAMIYO MCP Server - Structure Validation")
    print_info("=" * 50)
    print()

    # Get project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent
    os.chdir(project_root)

    all_checks_passed = True

    # Check MCP directory structure
    print_info("[1/4] Checking MCP directory structure...")
    mcp_dir = project_root / "mcp"
    all_checks_passed &= check_directory_exists(mcp_dir, "MCP directory")
    all_checks_passed &= check_directory_exists(mcp_dir / "tools", "Tools directory")
    all_checks_passed &= check_directory_exists(mcp_dir / "auth", "Auth directory")
    all_checks_passed &= check_directory_exists(mcp_dir / "utils", "Utils directory")
    print()

    # Check required files
    print_info("[2/4] Checking required files...")
    all_checks_passed &= check_file_exists(mcp_dir / "__init__.py", "MCP __init__.py")
    all_checks_passed &= check_file_exists(mcp_dir / "config.py", "MCP config.py")
    all_checks_passed &= check_file_exists(mcp_dir / "server.py", "MCP server.py")
    all_checks_passed &= check_file_exists(mcp_dir / "tools" / "__init__.py", "Tools __init__.py")
    all_checks_passed &= check_file_exists(mcp_dir / "auth" / "__init__.py", "Auth __init__.py")
    all_checks_passed &= check_file_exists(mcp_dir / "utils" / "__init__.py", "Utils __init__.py")
    all_checks_passed &= check_file_exists(project_root / "requirements-mcp.txt", "MCP requirements")
    all_checks_passed &= check_file_exists(
        project_root / "scripts" / "mcp" / "test_local.sh",
        "Test script"
    )
    print()

    # Check Python module structure
    print_info("[3/4] Validating Python modules...")

    # Check config module (doesn't require external deps)
    config_valid = validate_module(project_root, "mcp.config")
    all_checks_passed &= config_valid

    if config_valid:
        # Try to load config
        try:
            sys.path.insert(0, str(project_root))
            from mcp.config import get_mcp_config
            config = get_mcp_config()
            print_success(f"Config loaded: {config.name} v{config.version}")
        except Exception as e:
            print_error(f"Config loading failed: {e}")
            all_checks_passed = False

    print()

    # Check file permissions
    print_info("[4/4] Checking file permissions...")
    server_py = mcp_dir / "server.py"
    test_sh = project_root / "scripts" / "mcp" / "test_local.sh"

    if server_py.exists() and os.access(server_py, os.X_OK):
        print_success(f"server.py is executable")
    else:
        print_error(f"server.py is not executable")
        all_checks_passed = False

    if test_sh.exists() and os.access(test_sh, os.X_OK):
        print_success(f"test_local.sh is executable")
    else:
        print_error(f"test_local.sh is not executable")
        all_checks_passed = False

    print()
    print_info("=" * 50)

    if all_checks_passed:
        print_success("All structure checks passed!")
        print()
        print_info("Next steps:")
        print("1. Install dependencies: pip3.11 install -r requirements-mcp.txt")
        print("2. Test server startup: python3.11 -m mcp.server --help")
        print("3. Run local test: ./scripts/mcp/test_local.sh")
        print()
        return 0
    else:
        print_error("Some checks failed. Please fix the issues above.")
        print()
        return 1


if __name__ == "__main__":
    sys.exit(main())
