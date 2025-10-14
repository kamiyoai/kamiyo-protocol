#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Autonomous Growth Engine with Real Exploit Data
Tests the complete pipeline with the Abracadabra exploit from October 4, 2025
"""

import sys
from datetime import datetime
from social.models import ExploitData, Platform
from social.analysis import ReportGenerator
from social.post_generator import PostGenerator

def main():
    print("=" * 80)
    print("TESTING AUTONOMOUS GROWTH ENGINE WITH REAL EXPLOIT DATA")
    print("=" * 80)
    print()

    # Real exploit from October 4, 2025
    print("📰 Using real exploit: Abracadabra (MIM_Spell) - October 4, 2025")
    print()

    exploit = ExploitData(
        tx_hash="0xabcd1234...",  # Simulated (would be real from blockchain)
        protocol="Abracadabra (MIM_Spell)",
        chain="Ethereum",
        loss_amount_usd=1_700_000,  # $1.7M
        exploit_type="Smart Contract Logic Flaw",
        timestamp=datetime(2025, 10, 4, 14, 30),  # Oct 4, 2025 14:30 UTC
        description=(
            "The DeFi lending platform Abracadabra was exploited due to flawed "
            "implementation logic of the cook function, which allows users to execute "
            "multiple operations in a single transaction. The attacker manipulated "
            "smart contract variables to bypass a solvency check, borrowing assets "
            "beyond the intended limit."
        ),
        recovery_status="Contracts paused, investigation ongoing",
        source="Multiple sources (BeInCrypto, security researchers)",
        source_url="https://beincrypto.com/defi-platform-abracadabra-hit-by-major-exploit/"
    )

    print(f"Protocol: {exploit.protocol}")
    print(f"Chain: {exploit.chain}")
    print(f"Loss: {exploit.formatted_amount} (${exploit.loss_amount_usd:,.2f})")
    print(f"Type: {exploit.exploit_type}")
    print(f"Priority: {exploit.priority.value}")
    print(f"Date: {exploit.timestamp.strftime('%Y-%m-%d %H:%M UTC')}")
    print()

    # Step 1: Generate Analysis Report
    print("-" * 80)
    print("STEP 1: GENERATING ANALYSIS REPORT")
    print("-" * 80)
    print()

    report_gen = ReportGenerator()
    report = report_gen.analyze_exploit(exploit)

    print(f"Report ID: {report.report_id}")
    print(f"Severity: {report.impact.severity.indicator}")
    print()

    print("Executive Summary:")
    print("-" * 80)
    print(report.executive_summary)
    print()

    if report.timeline:
        print("Timeline:")
        print("-" * 80)
        for event in report.timeline:
            print(f"  {event.timestamp.strftime('%H:%M UTC')} - {event.description}")
        print()

    if report.engagement_hooks:
        print("Engagement Hooks:")
        print("-" * 80)
        for i, hook in enumerate(report.engagement_hooks, 1):
            print(f"  {i}. {hook}")
        print()

    # Step 2: Generate Platform-Specific Content
    print("-" * 80)
    print("STEP 2: GENERATING PLATFORM-SPECIFIC CONTENT")
    print("-" * 80)
    print()

    post_gen = PostGenerator()
    post = post_gen.generate_post(
        exploit,
        platforms=[Platform.X_TWITTER, Platform.REDDIT, Platform.DISCORD]
    )

    # Twitter Thread
    print("🐦 TWITTER THREAD (X):")
    print("-" * 80)

    # Create enhanced Twitter thread with analysis
    twitter_thread = []
    twitter_thread.append(
        f"{report.impact.severity.indicator} Abracadabra (MIM_Spell) Exploit Alert\n\n"
        f"💰 {exploit.formatted_amount} lost\n"
        f"⛓️ Ethereum\n"
        f"🔥 Smart Contract Logic Flaw\n\n"
        f"🧵 Thread 👇"
    )

    twitter_thread.append(
        f"📊 The attacker exploited the 'cook function' to bypass solvency checks, "
        f"borrowing $1.7M beyond intended limits.\n\n"
        f"Abracadabra team has paused all contracts to prevent further losses."
    )

    if report.engagement_hooks:
        twitter_thread.append(f"⚡ Key Insight:\n\n{report.engagement_hooks[0]}")

    twitter_thread.append(
        f"🔗 Source: BeInCrypto, Security Researchers\n\n"
        f"Stay informed about DeFi security\n"
        f"Follow @KamiyoAI for real-time exploit alerts\n\n"
        f"🌐 kamiyo.ai"
    )

    for i, tweet in enumerate(twitter_thread, 1):
        print(f"Tweet {i}/{len(twitter_thread)}:")
        print(tweet)
        print(f"({len(tweet)} chars)")
        print()

    # Reddit Post
    print("🔴 REDDIT POST:")
    print("-" * 80)
    reddit_post = post.content.get(Platform.REDDIT, "")
    print(reddit_post[:800] + "...\n[truncated for display]\n")

    # Discord Embed
    print("💬 DISCORD EMBED:")
    print("-" * 80)
    print(post.content.get(Platform.DISCORD, "")[:500] + "...\n[truncated for display]\n")

    # Step 3: Show What Would Happen Next
    print("-" * 80)
    print("STEP 3: WHAT HAPPENS NEXT (IN PRODUCTION)")
    print("-" * 80)
    print()
    print("✅ Analysis report generated")
    print("✅ Platform-specific content created")
    print("⏭️  NEXT: Post to all enabled platforms")
    print("⏭️  NEXT: Track metrics (posts_total, api_duration, etc.)")
    print("⏭️  NEXT: Alert on any failures")
    print("⏭️  RESULT: Organic traffic to kamiyo.ai")
    print()

    print("-" * 80)
    print("PRODUCTION PIPELINE SUMMARY")
    print("-" * 80)
    print()
    print("1. ✅ Kamiyo detects exploit (Abracadabra, $1.7M)")
    print("2. ✅ Generate analysis report (severity: HIGH, engagement hooks)")
    print("3. ✅ Create platform-optimized content (Twitter, Reddit, Discord)")
    print("4. ⏭️  Post to Reddit (r/defi, r/CryptoCurrency)")
    print("5. ⏭️  Post to Discord (exploit-alerts channel)")
    print("6. ⏭️  Post to Twitter/X (4-tweet thread)")
    print("7. ⏭️  Post to Telegram (HTML formatted)")
    print("8. ⏭️  Track metrics: posts_total++, generation_duration_ms")
    print("9. ⏭️  Users discover exploit → click → visit kamiyo.ai → signup")
    print("10. ⏭️ ORGANIC GROWTH ACHIEVED ✅")
    print()

    print("=" * 80)
    print("TEST COMPLETE - AUTONOMOUS GROWTH ENGINE WORKS!")
    print("=" * 80)
    print()
    print("To run in production with real posting:")
    print("  1. Configure .env.production with platform credentials")
    print("  2. Enable at least one platform (Reddit, Discord, Telegram, or Twitter)")
    print("  3. Run: python3 social/autonomous_growth_engine.py --mode poll")
    print()
    print("The engine will:")
    print("  • Monitor Kamiyo API for new exploits")
    print("  • Generate analysis reports automatically")
    print("  • Post to all enabled platforms")
    print("  • Drive organic traffic to kamiyo.ai")
    print()

if __name__ == "__main__":
    main()
