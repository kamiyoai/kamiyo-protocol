#!/usr/bin/env python3
"""
Basic Hyperliquid monitoring example.

Demonstrates how to use the monitors programmatically to detect security events.
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from monitors.hlp_vault_monitor import HLPVaultMonitor


async def main():
    """Run basic monitoring example."""
    print("Starting Hyperliquid HLP Vault monitoring...")
    print("-" * 50)

    # Initialize monitor
    monitor = HLPVaultMonitor()

    try:
        # Fetch potential security events
        exploits = await monitor.fetch_exploits()

        if exploits:
            print(f"\n✓ Found {len(exploits)} potential security event(s):\n")

            for i, exploit in enumerate(exploits, 1):
                severity = exploit.get('severity', 'UNKNOWN')
                event_type = exploit.get('type', 'Unknown')
                description = exploit.get('description', 'No description')

                print(f"{i}. [{severity}] {event_type}")
                print(f"   {description}")
                print()
        else:
            print("\n✓ No security events detected")
            print("  All monitored metrics within normal parameters\n")

    except Exception as e:
        print(f"\n✗ Error during monitoring: {e}\n")
        raise
    finally:
        # Cleanup
        await monitor.close()

    print("-" * 50)
    print("Monitoring complete")


if __name__ == "__main__":
    asyncio.run(main())
