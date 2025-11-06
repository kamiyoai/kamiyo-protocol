#!/usr/bin/env python3
"""
Test x402 endpoint route registration
Run this to verify the route is properly registered in the app
"""

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_x402_route():
    """Test that x402 route is registered"""
    print("Testing x402 route registration...")

    # Import after path setup
    from api.main import app

    # Check all routes
    print("\nRegistered routes containing 'x402' or 'well-known':")
    found_x402 = False

    for route in app.routes:
        if hasattr(route, 'path'):
            path = route.path
            if 'x402' in path.lower() or 'well-known' in path.lower():
                methods = getattr(route, 'methods', {'GET'})
                print(f"  ✓ {path} - Methods: {methods}")
                found_x402 = True

                if path == "/.well-known/x402":
                    print(f"    → Correct path found!")

    if not found_x402:
        print("  ✗ No x402 routes found")
        return False

    print("\n✓ x402 route is properly registered")
    return True

if __name__ == "__main__":
    try:
        success = test_x402_route()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
