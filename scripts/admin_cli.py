#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kamiyo Admin CLI
Command-line interface for administrative tasks
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import click
from datetime import datetime, timedelta
from database import get_db

# Colors for CLI output
GREEN = '\033[0;32m'
RED = '\033[0;31m'
YELLOW = '\033[1;33m'
BLUE = '\033[0;34m'
NC = '\033[0m'


@click.group()
def cli():
    """Kamiyo Platform Admin CLI"""
    pass


@cli.command()
def status():
    """Show platform status"""
    click.echo(f"\n{BLUE}{'='*60}{NC}")
    click.echo(f"{BLUE}KAMIYO PLATFORM STATUS{NC}")
    click.echo(f"{BLUE}{'='*60}{NC}\n")

    try:
        db = get_db()

        # Database stats
        total_exploits = db.get_total_exploits()
        chains = db.get_chains()
        sources = db.get_source_health()

        click.echo(f"{GREEN}✓ Database:{NC} Connected")
        click.echo(f"  Total Exploits: {total_exploits}")
        click.echo(f"  Tracked Chains: {len(chains)}")
        click.echo(f"  Active Sources: {len([s for s in sources if s.get('is_active')])}/{len(sources)}")

        # Recent activity
        recent = db.get_recent_exploits(limit=5)
        if recent:
            click.echo(f"\n{BLUE}Recent Exploits (Last 5):{NC}")
            for exploit in recent:
                protocol = exploit['protocol']
                amount = exploit['loss_amount_usd']
                formatted = f"${amount/1_000_000:.2f}M" if amount >= 1_000_000 else f"${amount/1_000:.1f}K"
                click.echo(f"  • {protocol}: {formatted} ({exploit['chain']})")

        # 24h stats
        stats_24h = db.get_stats_24h()
        click.echo(f"\n{BLUE}24 Hour Summary:{NC}")
        click.echo(f"  Exploits: {stats_24h.get('total_exploits', 0)}")
        click.echo(f"  Total Loss: ${stats_24h.get('total_loss_usd', 0):,.2f}")

    except Exception as e:
        click.echo(f"{RED}✗ Error:{NC} {e}")


@cli.command()
@click.argument('days', type=int, default=7)
def stats(days):
    """Show statistics for past N days"""
    click.echo(f"\n{BLUE}Statistics for past {days} days:{NC}\n")

    try:
        db = get_db()
        stats = db.get_stats_custom(days=days)

        click.echo(f"Total Exploits: {stats.get('total_exploits', 0)}")
        click.echo(f"Total Loss: ${stats.get('total_loss_usd', 0):,.2f}")
        click.echo(f"Affected Chains: {stats.get('affected_chains', 0)}")
        click.echo(f"Affected Protocols: {stats.get('affected_protocols', 0)}")
        click.echo(f"Average Loss: ${stats.get('average_loss', 0):,.2f}")

    except Exception as e:
        click.echo(f"{RED}✗ Error:{NC} {e}")


@cli.command()
def sources():
    """List all aggregation sources"""
    click.echo(f"\n{BLUE}Aggregation Sources:{NC}\n")

    try:
        db = get_db()
        sources = db.get_source_health()

        for source in sources:
            name = source['source_name']
            active = source.get('is_active', False)
            count = source.get('exploit_count', 0)
            last_fetch = source.get('last_fetch')

            status = f"{GREEN}●{NC}" if active else f"{RED}●{NC}"
            click.echo(f"{status} {name}: {count} exploits")
            if last_fetch:
                click.echo(f"    Last fetch: {last_fetch}")

    except Exception as e:
        click.echo(f"{RED}✗ Error:{NC} {e}")


@cli.command()
@click.argument('chain', required=False)
def chains(chain):
    """List blockchains (optionally filter by chain name)"""
    click.echo(f"\n{BLUE}Blockchain Statistics:{NC}\n")

    try:
        db = get_db()

        if chain:
            # Show specific chain
            exploits = db.get_exploits_by_chain(chain)
            click.echo(f"Chain: {chain}")
            click.echo(f"Exploits: {len(exploits)}")

            if exploits:
                total_loss = sum(e['loss_amount_usd'] for e in exploits)
                click.echo(f"Total Loss: ${total_loss:,.2f}")

                click.echo(f"\nTop 5 Exploits:")
                for exploit in sorted(exploits, key=lambda x: x['loss_amount_usd'], reverse=True)[:5]:
                    amount = exploit['loss_amount_usd']
                    formatted = f"${amount/1_000_000:.2f}M" if amount >= 1_000_000 else f"${amount/1_000:.1f}K"
                    click.echo(f"  • {exploit['protocol']}: {formatted}")
        else:
            # List all chains
            all_chains = db.get_chains()
            for chain_name in all_chains:
                exploits = db.get_exploits_by_chain(chain_name)
                click.echo(f"• {chain_name}: {len(exploits)} exploits")

    except Exception as e:
        click.echo(f"{RED}✗ Error:{NC} {e}")


@cli.command()
@click.argument('tx_hash')
def exploit(tx_hash):
    """Show details for specific exploit"""
    try:
        db = get_db()
        exploit = db.get_exploit_by_tx_hash(tx_hash)

        if not exploit:
            click.echo(f"{RED}✗ Exploit not found{NC}")
            return

        click.echo(f"\n{BLUE}{'='*60}{NC}")
        click.echo(f"{BLUE}EXPLOIT DETAILS{NC}")
        click.echo(f"{BLUE}{'='*60}{NC}\n")

        click.echo(f"Protocol: {exploit['protocol']}")
        click.echo(f"Chain: {exploit['chain']}")
        click.echo(f"Loss Amount: ${exploit['loss_amount_usd']:,.2f}")
        click.echo(f"Exploit Type: {exploit['exploit_type']}")
        click.echo(f"Timestamp: {exploit['timestamp']}")
        click.echo(f"Transaction: {exploit['tx_hash']}")

        if exploit.get('description'):
            click.echo(f"\nDescription:\n{exploit['description']}")

        if exploit.get('recovery_status'):
            click.echo(f"\nRecovery: {exploit['recovery_status']}")

        if exploit.get('source'):
            click.echo(f"\nSource: {exploit['source']}")

    except Exception as e:
        click.echo(f"{RED}✗ Error:{NC} {e}")


@cli.command()
def health():
    """Run health checks"""
    click.echo(f"\n{BLUE}Running health checks...{NC}\n")

    all_healthy = True

    # Database
    try:
        db = get_db()
        db.get_total_exploits()
        click.echo(f"{GREEN}✓ Database:{NC} Healthy")
    except Exception as e:
        click.echo(f"{RED}✗ Database:{NC} {e}")
        all_healthy = False

    # Check environment variables
    required_vars = ['DATABASE_URL']
    for var in required_vars:
        if os.getenv(var):
            click.echo(f"{GREEN}✓ Environment:{NC} {var} set")
        else:
            click.echo(f"{YELLOW}⚠ Environment:{NC} {var} not set")

    # Overall
    click.echo()
    if all_healthy:
        click.echo(f"{GREEN}✓ All systems healthy{NC}")
    else:
        click.echo(f"{RED}✗ Some systems unhealthy{NC}")


@cli.command()
def backup():
    """Create database backup"""
    click.echo(f"\n{BLUE}Creating database backup...{NC}\n")

    try:
        # Call backup script
        import subprocess
        result = subprocess.run(
            ['./scripts/backup_database.sh'],
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            click.echo(f"{GREEN}✓ Backup completed successfully{NC}")
        else:
            click.echo(f"{RED}✗ Backup failed{NC}")
            if result.stderr:
                click.echo(result.stderr)

    except Exception as e:
        click.echo(f"{RED}✗ Error:{NC} {e}")


@cli.command()
@click.confirmation_option(prompt='Are you sure you want to clear all exploit data?')
def clear():
    """Clear all exploit data (requires confirmation)"""
    try:
        db = get_db()
        # This would need to be implemented in database module
        click.echo(f"{YELLOW}⚠ This feature not yet implemented{NC}")
        click.echo("Use SQL directly to clear data")

    except Exception as e:
        click.echo(f"{RED}✗ Error:{NC} {e}")


@cli.command()
def version():
    """Show platform version"""
    click.echo("\nKamiyo Intelligence Platform")
    click.echo("Version: 1.0.0")
    click.echo("Build: 2025-10-08")
    click.echo()


if __name__ == '__main__':
    cli()
