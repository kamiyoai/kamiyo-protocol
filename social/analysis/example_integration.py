#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Example Integration: Analysis Module with Post Generator

Demonstrates how to use the analysis module alongside existing post_generator.py
to create comprehensive, engaging social media content.
"""

import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from social.models import ExploitData, Platform
from social.post_generator import PostGenerator
from social.analysis import (
    ReportGenerator,
    ReportFormat,
    ReportFormatter
)


def example_1_basic_report():
    """Example 1: Generate basic exploit report"""
    print("="*80)
    print("EXAMPLE 1: Basic Exploit Report Generation")
    print("="*80)

    # Exploit data from Kamiyo platform (already aggregated from external sources)
    exploit = ExploitData(
        tx_hash="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        protocol="Curve Finance",
        chain="Ethereum",
        loss_amount_usd=15000000.00,
        exploit_type="Reentrancy",
        timestamp=datetime.utcnow() - timedelta(hours=3),
        description=(
            "Reentrancy attack exploited vulnerable callback function in Curve "
            "liquidity pool contract. Attacker drained multiple pools before "
            "protocol was paused."
        ),
        recovery_status="No recovery - funds laundered",
        source="Rekt News",
        source_url="https://rekt.news/curve-finance-rekt/"
    )

    # Generate comprehensive report
    generator = ReportGenerator()
    report = generator.analyze_exploit(
        exploit,
        report_format=ReportFormat.LONG,
        include_historical=True
    )

    print(f"\nReport ID: {report.report_id}")
    print(f"Severity: {report.impact.severity.indicator}")
    print(f"\nExecutive Summary:")
    print("-" * 80)
    print(report.executive_summary)

    print(f"\nTimeline ({len(report.timeline)} events):")
    print("-" * 80)
    for event in report.timeline:
        print(f"  {event.timestamp.strftime('%H:%M:%S UTC')} - {event.description}")

    print(f"\nEngagement Hooks:")
    print("-" * 80)
    for i, hook in enumerate(report.engagement_hooks, 1):
        print(f"  {i}. {hook}")

    return report


def example_2_multi_platform():
    """Example 2: Generate reports for multiple platforms"""
    print("\n\n" + "="*80)
    print("EXAMPLE 2: Multi-Platform Report Generation")
    print("="*80)

    exploit = ExploitData(
        tx_hash="0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        protocol="Aave V3",
        chain="Polygon",
        loss_amount_usd=3500000.00,
        exploit_type="Flash Loan",
        timestamp=datetime.utcnow() - timedelta(hours=1),
        description=(
            "Sophisticated flash loan attack manipulated oracle price feeds "
            "to artificially inflate collateral value and drain lending pools."
        ),
        recovery_status="Partial Recovery - 35% recovered via MEV",
        source="PeckShield",
        source_url="https://twitter.com/peckshield/status/123456789"
    )

    generator = ReportGenerator()
    formatter = ReportFormatter()

    # Generate base report
    report = generator.analyze_exploit(
        exploit,
        report_format=ReportFormat.MEDIUM
    )

    # Format for Twitter
    print("\n--- TWITTER THREAD (first 3 tweets) ---")
    print("-" * 80)
    twitter_thread = formatter.format_for_twitter_thread(report)
    for i, tweet in enumerate(twitter_thread[:3], 1):
        print(f"\nTweet {i}/{len(twitter_thread)}:")
        print(tweet)
        print(f"Length: {len(tweet)} chars")

    # Format for Discord
    print("\n--- DISCORD EMBED ---")
    print("-" * 80)
    discord_embed = formatter.format_for_discord_embed(report)
    print(f"Title: {discord_embed['title']}")
    print(f"Description: {discord_embed['description'][:100]}...")
    print(f"Fields: {len(discord_embed['fields'])}")

    # Format for Reddit (preview)
    print("\n--- REDDIT POST (first 500 chars) ---")
    print("-" * 80)
    reddit_post = formatter.format_for_reddit(report)
    print(reddit_post[:500] + "...")

    return report


def example_3_with_existing_post_generator():
    """Example 3: Combine analysis module with existing post_generator.py"""
    print("\n\n" + "="*80)
    print("EXAMPLE 3: Integration with Existing PostGenerator")
    print("="*80)

    exploit = ExploitData(
        tx_hash="0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
        protocol="SushiSwap",
        chain="Arbitrum",
        loss_amount_usd=1200000.00,
        exploit_type="Price Oracle",
        timestamp=datetime.utcnow() - timedelta(minutes=30),
        description=(
            "Price oracle manipulation attack on SushiSwap Arbitrum deployment. "
            "Attacker exploited low liquidity to manipulate TWAP oracle."
        ),
        recovery_status="Under Investigation",
        source="BlockSec",
        source_url="https://twitter.com/BlockSecTeam/status/123456789"
    )

    # Use EXISTING post generator for quick social posts
    print("\n1. Using EXISTING PostGenerator (quick posts):")
    print("-" * 80)
    post_generator = PostGenerator()
    social_post = post_generator.generate_post(
        exploit,
        platforms=[Platform.X_TWITTER, Platform.DISCORD]
    )

    print("Twitter content:")
    print(social_post.content.get(Platform.X_TWITTER, "N/A")[:200])

    # Use NEW analysis module for detailed reports
    print("\n2. Using NEW ReportGenerator (detailed analysis):")
    print("-" * 80)
    report_generator = ReportGenerator()
    report = report_generator.analyze_exploit(
        exploit,
        report_format=ReportFormat.LONG,
        include_historical=True
    )

    print("Executive Summary:")
    print(report.executive_summary[:200] + "...")

    # Combine both approaches
    print("\n3. COMBINED APPROACH:")
    print("-" * 80)
    print("Quick posts: Use PostGenerator templates")
    print("Detailed reports: Use ReportGenerator analysis")
    print("Thread posts: Use ReportGenerator + formatters")
    print("\nThis gives you the best of both worlds!")

    return social_post, report


def example_4_engagement_elements():
    """Example 4: Using engagement elements (severity, trends, hooks)"""
    print("\n\n" + "="*80)
    print("EXAMPLE 4: Engagement Elements for Viral Content")
    print("="*80)

    exploit = ExploitData(
        tx_hash="0x9999999999999999999999999999999999999999999999999999999999999999",
        protocol="Balancer V2",
        chain="Ethereum",
        loss_amount_usd=7800000.00,
        exploit_type="Flash Loan",
        timestamp=datetime.utcnow() - timedelta(hours=5),
        description=(
            "Complex multi-step flash loan attack combining oracle manipulation "
            "and reentrancy to drain Balancer V2 pools."
        ),
        recovery_status="Recovery in progress - 50% recovered",
        source="Rekt News",
        source_url="https://rekt.news/balancer-rekt-again/"
    )

    generator = ReportGenerator()
    formatter = ReportFormatter()

    report = generator.analyze_exploit(exploit, include_historical=True)

    # Show engaging elements
    print("\n1. SEVERITY INDICATOR:")
    print("-" * 80)
    print(f"   {report.impact.severity.indicator}")
    print(f"   Range: {report.impact.severity.range}")

    print("\n2. ENGAGEMENT HOOKS:")
    print("-" * 80)
    for hook in report.engagement_hooks:
        print(f"   • {hook}")

    print("\n3. TREND ANALYSIS:")
    print("-" * 80)
    if report.historical_context:
        ctx = report.historical_context
        trend = formatter.format_trend_indicator(
            ctx.trend_direction,
            ctx.trend_percentage
        )
        print(f"   {trend}")
        if ctx.ranking:
            print(f"   {ctx.ranking}")

    print("\n4. VISUAL ELEMENTS (ASCII Chart):")
    print("-" * 80)
    chart = formatter.format_ascii_chart(
        values=[15000000, 7800000, 3500000, 1200000],
        labels=['Curve', 'Balancer', 'Aave', 'Sushi'],
        title='Recent Major Exploits (USD)',
        width=40
    )
    print(chart)

    print("\n5. RECOVERY VISUALIZATION:")
    print("-" * 80)
    recovery_pct = report.impact.recovery_percentage
    bar_filled = int(recovery_pct / 5)
    bar_empty = 20 - bar_filled
    bar = "█" * bar_filled + "░" * bar_empty
    print(f"   Recovery: [{bar}] {recovery_pct:.1f}%")
    print(f"   Recovered: ${report.impact.recovery_amount_usd:,.0f}")
    print(f"   Still Lost: ${report.impact.loss_amount_usd - report.impact.recovery_amount_usd:,.0f}")

    return report


def main():
    """Run all examples"""
    print("\n" + "="*80)
    print("KAMIYO EXPLOIT ANALYSIS MODULE - INTEGRATION EXAMPLES")
    print("="*80)
    print("\nThese examples demonstrate how to:")
    print("  1. Generate comprehensive exploit reports")
    print("  2. Format reports for multiple platforms")
    print("  3. Integrate with existing PostGenerator")
    print("  4. Add engaging elements for viral content")
    print("\nREMEMBER: This module AGGREGATES confirmed exploit data.")
    print("It does NOT detect vulnerabilities or analyze security.")
    print("="*80)

    # Run examples
    report1 = example_1_basic_report()
    report2 = example_2_multi_platform()
    post, report3 = example_3_with_existing_post_generator()
    report4 = example_4_engagement_elements()

    # Summary
    print("\n\n" + "="*80)
    print("SUMMARY: Module Capabilities")
    print("="*80)
    print("\n✅ WHAT THIS MODULE DOES:")
    print("   • Aggregates confirmed exploit data from Kamiyo platform")
    print("   • Organizes data into engaging, informative reports")
    print("   • Formats reports for Twitter, Reddit, Discord, Telegram")
    print("   • Adds historical context (similar past exploits, trends)")
    print("   • Provides engagement hooks (rankings, trends, facts)")
    print("   • Creates visual elements (severity indicators, charts)")
    print("   • Properly attributes sources (Rekt News, PeckShield, etc.)")

    print("\n❌ WHAT THIS MODULE DOES NOT DO:")
    print("   • Detect vulnerabilities in smart contracts")
    print("   • Analyze or scan code for security issues")
    print("   • Score protocol security or safety")
    print("   • Predict future exploits")
    print("   • Provide security consulting advice")

    print("\n📊 INTEGRATION OPTIONS:")
    print("   1. Use standalone for detailed analysis reports")
    print("   2. Combine with PostGenerator for quick + detailed content")
    print("   3. Use formatters for platform-specific optimization")
    print("   4. Query historical context for trend analysis")

    print("\n" + "="*80)
    print("Examples complete! Module ready for integration.")
    print("="*80 + "\n")


if __name__ == "__main__":
    main()
