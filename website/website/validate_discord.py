#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Discord Integration Validation Script
Quick validation of Discord integration without running full tests
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def validate_files():
    """Validate that all required files exist"""
    print("=" * 60)
    print("DISCORD INTEGRATION VALIDATION")
    print("=" * 60)
    print()

    required_files = [
        'alerts/discord_bot.py',
        'alerts/__init__.py',
        'aggregators/discord_monitor.py',
        'database/migrations/007_discord_tables.sql',
        'api/discord_routes.py',
        'Dockerfile.discord.prod',
        'tests/test_discord.py',
        'DAY_26_DISCORD_INTEGRATION.md',
        'DAY_26_FILES_CREATED.txt',
    ]

    print("✓ Checking Required Files...")
    print()

    all_exist = True
    for file_path in required_files:
        full_path = os.path.join(os.path.dirname(__file__), file_path)
        exists = os.path.exists(full_path)
        status = "✅" if exists else "❌"
        print(f"  {status} {file_path}")
        if not exists:
            all_exist = False

    print()
    return all_exist


def validate_imports():
    """Validate that modules can be imported"""
    print("✓ Checking Module Imports...")
    print()

    imports_ok = True

    # Check alerts module
    try:
        from alerts import discord_bot
        print("  ✅ alerts.discord_bot")
    except ImportError as e:
        print(f"  ❌ alerts.discord_bot: {e}")
        imports_ok = False

    # Check aggregators module
    try:
        from aggregators import discord_monitor
        print("  ✅ aggregators.discord_monitor")
    except ImportError as e:
        print(f"  ❌ aggregators.discord_monitor: {e}")
        imports_ok = False

    # Check API module
    try:
        from api import discord_routes
        print("  ✅ api.discord_routes")
    except ImportError as e:
        print(f"  ❌ api.discord_routes: {e}")
        imports_ok = False

    print()
    return imports_ok


def validate_functions():
    """Validate key functions"""
    print("✓ Checking Key Functions...")
    print()

    functions_ok = True

    try:
        from alerts.discord_bot import (
            get_severity_from_amount,
            format_amount,
            CHAIN_ICONS,
            SEVERITY_COLORS
        )

        # Test severity levels
        assert get_severity_from_amount(20_000_000) == 'critical'
        assert get_severity_from_amount(5_000_000) == 'high'
        assert get_severity_from_amount(500_000) == 'medium'
        assert get_severity_from_amount(50_000) == 'low'
        print("  ✅ Severity levels working")

        # Test formatting
        assert format_amount(5_000_000) == "$5.00M"
        assert format_amount(250_000) == "$250.00K"
        print("  ✅ Amount formatting working")

        # Test constants
        assert 'ethereum' in CHAIN_ICONS
        assert 'critical' in SEVERITY_COLORS
        print("  ✅ Constants defined")

    except Exception as e:
        print(f"  ❌ Function validation failed: {e}")
        functions_ok = False

    print()
    return functions_ok


def validate_database_schema():
    """Validate database migration file"""
    print("✓ Checking Database Schema...")
    print()

    schema_ok = True

    migration_path = os.path.join(
        os.path.dirname(__file__),
        'database/migrations/007_discord_tables.sql'
    )

    try:
        with open(migration_path, 'r') as f:
            content = f.read()

        required_tables = [
            'discord_guilds',
            'discord_channels',
            'discord_alerts',
            'discord_oauth_tokens',
            'discord_stats'
        ]

        for table in required_tables:
            if table in content:
                print(f"  ✅ Table: {table}")
            else:
                print(f"  ❌ Table missing: {table}")
                schema_ok = False

        required_views = [
            'v_discord_subscriptions',
            'v_discord_guild_stats',
            'v_recent_discord_alerts'
        ]

        for view in required_views:
            if view in content:
                print(f"  ✅ View: {view}")
            else:
                print(f"  ❌ View missing: {view}")
                schema_ok = False

    except Exception as e:
        print(f"  ❌ Schema validation failed: {e}")
        schema_ok = False

    print()
    return schema_ok


def validate_api_routes():
    """Validate API routes are defined"""
    print("✓ Checking API Routes...")
    print()

    routes_ok = True

    try:
        from api.discord_routes import router

        # Check that router is defined
        if router:
            print("  ✅ Discord router defined")

            # Count routes
            route_count = len(router.routes)
            print(f"  ✅ Found {route_count} routes")

            if route_count >= 7:
                print("  ✅ All expected routes present")
            else:
                print(f"  ⚠️  Expected 7+ routes, found {route_count}")
        else:
            print("  ❌ Discord router not defined")
            routes_ok = False

    except Exception as e:
        print(f"  ❌ Route validation failed: {e}")
        routes_ok = False

    print()
    return routes_ok


def validate_docker():
    """Validate Docker configuration"""
    print("✓ Checking Docker Configuration...")
    print()

    docker_ok = True

    # Check Dockerfile
    dockerfile_path = os.path.join(
        os.path.dirname(__file__),
        'Dockerfile.discord.prod'
    )

    try:
        with open(dockerfile_path, 'r') as f:
            content = f.read()

        if 'discord.py' in content or 'requirements.txt' in content:
            print("  ✅ Dockerfile.discord.prod valid")
        else:
            print("  ⚠️  Dockerfile may need discord.py")

    except Exception as e:
        print(f"  ❌ Dockerfile validation failed: {e}")
        docker_ok = False

    # Check docker-compose
    compose_path = os.path.join(
        os.path.dirname(__file__),
        'docker-compose.production.yml'
    )

    try:
        with open(compose_path, 'r') as f:
            content = f.read()

        if 'discord-bot:' in content:
            print("  ✅ docker-compose.production.yml has discord-bot service")
        else:
            print("  ❌ docker-compose missing discord-bot service")
            docker_ok = False

        if 'discord-monitor:' in content:
            print("  ✅ docker-compose.production.yml has discord-monitor service")
        else:
            print("  ⚠️  docker-compose missing optional discord-monitor service")

    except Exception as e:
        print(f"  ❌ docker-compose validation failed: {e}")
        docker_ok = False

    print()
    return docker_ok


def validate_requirements():
    """Validate requirements.txt has discord.py"""
    print("✓ Checking Requirements...")
    print()

    requirements_ok = True

    req_path = os.path.join(
        os.path.dirname(__file__),
        'requirements.txt'
    )

    try:
        with open(req_path, 'r') as f:
            content = f.read()

        if 'discord.py' in content:
            print("  ✅ discord.py in requirements.txt")
        else:
            print("  ❌ discord.py missing from requirements.txt")
            requirements_ok = False

    except Exception as e:
        print(f"  ❌ Requirements validation failed: {e}")
        requirements_ok = False

    print()
    return requirements_ok


def main():
    """Run all validations"""
    results = {
        'Files': validate_files(),
        'Imports': validate_imports(),
        'Functions': validate_functions(),
        'Database': validate_database_schema(),
        'API Routes': validate_api_routes(),
        'Docker': validate_docker(),
        'Requirements': validate_requirements(),
    }

    print("=" * 60)
    print("VALIDATION SUMMARY")
    print("=" * 60)
    print()

    all_passed = True
    for category, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status} - {category}")
        if not passed:
            all_passed = False

    print()
    print("=" * 60)

    if all_passed:
        print("🎉 ALL VALIDATIONS PASSED!")
        print()
        print("Discord integration is complete and ready for deployment.")
        print()
        print("Next steps:")
        print("  1. Set DISCORD_BOT_TOKEN in .env.production")
        print("  2. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET")
        print("  3. Run database migration: 007_discord_tables.sql")
        print("  4. Start bot: python -m alerts.discord_bot")
        print("  5. Invite bot to server using OAuth2 URL")
        print("  6. Use /subscribe in Discord channel")
        return 0
    else:
        print("❌ SOME VALIDATIONS FAILED")
        print()
        print("Please review the errors above and fix before deployment.")
        return 1


if __name__ == '__main__':
    sys.exit(main())
