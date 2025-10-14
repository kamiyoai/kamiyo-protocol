#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Example usage of social media monitoring system
Demonstrates metrics, logging, health checks, and alerting
"""

import os
import sys
import time
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from social.monitoring import (
    configure_logging,
    get_logger,
    log_context,
    social_logger,
    metrics,
    track_post,
    track_api_call,
    set_platform_authentication,
    set_rate_limit_remaining,
    check_health,
    AlertManager,
    Alert,
    AlertSeverity
)


def example_1_basic_logging():
    """Example 1: Basic structured logging"""
    print("\n" + "="*60)
    print("EXAMPLE 1: Basic Structured Logging")
    print("="*60 + "\n")

    # Configure logging
    configure_logging(log_level="INFO", json_format=False)

    # Get a logger
    logger = get_logger(__name__, service="social_poster")

    # Log some events
    logger.info("service_started", version="1.0.0", environment="development")
    logger.info("processing_exploit", tx_hash="0x123abc", protocol="Uniswap")
    logger.warning("rate_limit_low", platform="reddit", remaining=3)
    logger.error("post_failed", platform="twitter", error="Connection timeout")


def example_2_context_logging():
    """Example 2: Logging with context"""
    print("\n" + "="*60)
    print("EXAMPLE 2: Logging with Context")
    print("="*60 + "\n")

    configure_logging(log_level="INFO", json_format=False)
    logger = get_logger(__name__)

    # Use context manager to add context to all logs
    with log_context(request_id="req_12345", user_id="user_789"):
        logger.info("received_request", action="create_post")
        logger.info("validating_content", platform="reddit")
        logger.info("posting_content", platform="reddit")
        logger.info("request_completed", success=True, duration_seconds=2.5)


def example_3_specialized_logger():
    """Example 3: Specialized social media logger"""
    print("\n" + "="*60)
    print("EXAMPLE 3: Specialized Social Media Logger")
    print("="*60 + "\n")

    configure_logging(log_level="INFO", json_format=False)

    # Log exploit received
    social_logger.log_exploit_received(
        exploit_tx_hash="0x1234567890abcdef",
        protocol="Uniswap V3",
        chain="Ethereum",
        loss_amount_usd=2500000.0,
        exploit_type="Flash Loan"
    )

    # Log post generation
    social_logger.log_post_generation(
        exploit_tx_hash="0x1234567890abcdef",
        platforms=["reddit", "discord", "twitter"],
        duration_seconds=0.5
    )

    # Log successful post
    social_logger.log_post_success(
        platform="reddit",
        exploit_tx_hash="0x1234567890abcdef",
        post_id="post_abc123",
        post_url="https://reddit.com/r/defi/post_abc123",
        duration_seconds=2.3
    )

    # Log failed post
    social_logger.log_post_failure(
        platform="twitter",
        exploit_tx_hash="0x1234567890abcdef",
        error="Rate limit exceeded",
        error_type="rate_limit",
        retry_count=3
    )


def example_4_metrics_tracking():
    """Example 4: Tracking metrics"""
    print("\n" + "="*60)
    print("EXAMPLE 4: Metrics Tracking")
    print("="*60 + "\n")

    # Track various metrics
    print("Tracking posts...")
    track_post("reddit", "success")
    track_post("reddit", "success")
    track_post("discord", "success")
    track_post("twitter", "failed")

    print("Tracking authentication...")
    set_platform_authentication("reddit", True)
    set_platform_authentication("discord", True)
    set_platform_authentication("twitter", False)

    print("Tracking rate limits...")
    set_rate_limit_remaining("reddit", 8)
    set_rate_limit_remaining("twitter", 2)
    set_rate_limit_remaining("discord", 50)

    print("Tracking API call duration...")
    with track_api_call("reddit"):
        time.sleep(0.1)  # Simulate API call

    print("\nMetrics recorded! View at /metrics endpoint\n")

    # Show metrics
    print("Sample metrics output:")
    print("-" * 60)
    metrics_data = metrics.get_metrics().decode('utf-8')
    # Show just first 20 lines
    for line in metrics_data.split('\n')[:20]:
        if line and not line.startswith('#'):
            print(line)
    print("...")


def example_5_health_checks():
    """Example 5: Health checks"""
    print("\n" + "="*60)
    print("EXAMPLE 5: Health Checks")
    print("="*60 + "\n")

    # Run health checks
    health_result = check_health(
        platforms=None,  # Would pass actual platform posters here
        kamiyo_api_url="https://api.kamiyo.ai"
    )

    print(f"Overall Status: {health_result['status']}")
    print(f"Timestamp: {health_result['timestamp']}\n")

    print("Summary:")
    for key, value in health_result['summary'].items():
        print(f"  {key}: {value}")

    print("\nDetailed Results:")
    for check in health_result['checks']:
        status_icon = {
            'healthy': '✅',
            'degraded': '⚠️',
            'unhealthy': '❌',
            'unknown': '❓'
        }.get(check['status'], '?')

        print(f"  {status_icon} {check['check_name']}: {check['message']}")
        print(f"     Duration: {check['duration_seconds']:.3f}s")


def example_6_alerting():
    """Example 6: Alerting"""
    print("\n" + "="*60)
    print("EXAMPLE 6: Alerting System")
    print("="*60 + "\n")

    # Initialize alert manager (with dummy webhooks for demo)
    alert_manager = AlertManager(
        slack_webhook=os.getenv('SLACK_ALERT_WEBHOOK'),
        discord_webhook=os.getenv('DISCORD_ALERT_WEBHOOK')
    )

    print("Creating sample alerts...\n")

    # Info alert
    info_alert = Alert(
        title="Post Successfully Created",
        message="Successfully posted exploit alert to all platforms",
        severity=AlertSeverity.INFO,
        details={'platforms': ['reddit', 'discord', 'twitter'], 'post_count': 3}
    )
    print(f"📘 INFO: {info_alert.title}")

    # Warning alert
    warning_alert = Alert(
        title="Rate Limit Low",
        message="Reddit rate limit is running low",
        severity=AlertSeverity.WARNING,
        details={'platform': 'reddit', 'remaining': 5}
    )
    print(f"⚠️  WARNING: {warning_alert.title}")

    # Error alert
    error_alert = Alert(
        title="Post Failed",
        message="Failed to post to Twitter after 3 retries",
        severity=AlertSeverity.ERROR,
        details={'platform': 'twitter', 'error': 'Connection timeout', 'retries': 3}
    )
    print(f"🚨 ERROR: {error_alert.title}")

    # Critical alert
    critical_alert = Alert(
        title="Authentication Failed",
        message="Unable to authenticate with Twitter API",
        severity=AlertSeverity.CRITICAL,
        details={'platform': 'twitter', 'error': 'Invalid credentials'}
    )
    print(f"🔥 CRITICAL: {critical_alert.title}")

    print("\nNote: Set SLACK_ALERT_WEBHOOK or DISCORD_ALERT_WEBHOOK to actually send alerts")

    # Demonstrate failure tracking
    print("\n" + "-"*60)
    print("Testing consecutive failure tracking...")
    print("-"*60 + "\n")

    for i in range(7):
        is_alerting = alert_manager.track_failure(
            'example_failure',
            details={'attempt': i+1}
        )
        if is_alerting:
            print(f"✅ Alert triggered on failure #{i+1}")
        else:
            print(f"   Tracking failure #{i+1} (threshold: 5)")


def example_7_complete_workflow():
    """Example 7: Complete workflow with all monitoring"""
    print("\n" + "="*60)
    print("EXAMPLE 7: Complete Workflow")
    print("="*60 + "\n")

    configure_logging(log_level="INFO", json_format=False)

    # Simulate receiving exploit
    exploit_data = {
        'tx_hash': '0xabcdef1234567890',
        'protocol': 'Curve Finance',
        'chain': 'Ethereum',
        'loss_usd': 5000000.0,
        'type': 'Reentrancy'
    }

    print(f"📥 Received exploit: {exploit_data['protocol']} ({exploit_data['chain']})")
    social_logger.log_exploit_received(
        exploit_tx_hash=exploit_data['tx_hash'],
        protocol=exploit_data['protocol'],
        chain=exploit_data['chain'],
        loss_amount_usd=exploit_data['loss_usd'],
        exploit_type=exploit_data['type']
    )

    # Simulate post generation
    print("📝 Generating posts...")
    time.sleep(0.1)
    social_logger.log_post_generation(
        exploit_tx_hash=exploit_data['tx_hash'],
        platforms=['reddit', 'discord', 'twitter'],
        duration_seconds=0.1
    )

    # Simulate posting to platforms
    platforms = ['reddit', 'discord', 'twitter']
    for platform in platforms:
        print(f"📤 Posting to {platform}...")

        # Simulate different outcomes
        if platform == 'reddit':
            # Success
            with track_api_call(platform):
                time.sleep(0.2)
            track_post(platform, 'success')
            set_rate_limit_remaining(platform, 8)
            social_logger.log_post_success(
                platform=platform,
                exploit_tx_hash=exploit_data['tx_hash'],
                post_id=f"{platform}_post_123",
                post_url=f"https://{platform}.com/post_123",
                duration_seconds=0.2
            )
            print(f"   ✅ Success")

        elif platform == 'discord':
            # Success
            with track_api_call(platform):
                time.sleep(0.15)
            track_post(platform, 'success')
            set_rate_limit_remaining(platform, 45)
            social_logger.log_post_success(
                platform=platform,
                exploit_tx_hash=exploit_data['tx_hash'],
                post_id=f"{platform}_post_456",
                duration_seconds=0.15
            )
            print(f"   ✅ Success")

        else:  # twitter
            # Failure
            with track_api_call(platform):
                time.sleep(0.3)
            track_post(platform, 'failed')
            metrics.record_api_error(platform, 'rate_limit')
            set_rate_limit_remaining(platform, 0)
            social_logger.log_post_failure(
                platform=platform,
                exploit_tx_hash=exploit_data['tx_hash'],
                error='Rate limit exceeded',
                error_type='rate_limit',
                retry_count=3
            )
            print(f"   ❌ Failed: Rate limit exceeded")

    print("\n✨ Workflow complete!")
    print("\nMetrics summary:")
    print("  - Posts attempted: 3")
    print("  - Posts successful: 2")
    print("  - Posts failed: 1")
    print("  - Success rate: 66.7%")


def main():
    """Run all examples"""
    print("\n" + "="*60)
    print("SOCIAL MEDIA MONITORING - EXAMPLE USAGE")
    print("="*60)

    examples = [
        example_1_basic_logging,
        example_2_context_logging,
        example_3_specialized_logger,
        example_4_metrics_tracking,
        example_5_health_checks,
        example_6_alerting,
        example_7_complete_workflow
    ]

    for example in examples:
        try:
            example()
            time.sleep(0.5)
        except Exception as e:
            print(f"\n❌ Error in {example.__name__}: {e}")

    print("\n" + "="*60)
    print("All examples completed!")
    print("="*60)
    print("\nNext steps:")
    print("  1. Start your application with monitoring enabled")
    print("  2. Access metrics at http://localhost:8000/metrics")
    print("  3. Access health checks at http://localhost:8000/health")
    print("  4. Configure Prometheus and Grafana")
    print("  5. Set up alert webhooks")
    print("\nSee INTEGRATION_GUIDE.md for detailed instructions")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
