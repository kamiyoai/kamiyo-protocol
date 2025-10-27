# -*- coding: utf-8 -*-
"""
Autonomous Organic Growth Engine
Automatically analyzes exploits, generates reports, and posts to social media
for organic traffic generation and platform awareness.

This is the main orchestrator that connects:
- Kamiyo exploit detection (aggregated data)
- Exploit analysis and report generation
- Multi-platform social media posting
- Monitoring and observability
"""

import os
import sys
import logging
from typing import Dict, List, Optional
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from social.models import ExploitData, Platform, PostStatus
from social.analysis import ReportGenerator
from social.analysis.claude_enhancer import ClaudeEnhancer
from social.post_generator import PostGenerator
from social.poster import SocialMediaPoster
from social.kamiyo_watcher import KamiyoWatcher
from social.monitoring.metrics import (
    track_post, track_api_error, track_retry,
    record_generation_duration, record_api_duration
)
from social.monitoring.structured_logging import get_logger, log_context
from social.monitoring.alerting import AlertManager, Alert, AlertSeverity

logger = get_logger(__name__)


class AutonomousGrowthEngine:
    """
    Main orchestrator for autonomous organic growth via social media.

    Pipeline:
    1. Kamiyo detects new exploit (aggregated from external sources)
    2. Generate detailed analysis report
    3. Create platform-optimized content
    4. Post to all enabled social media platforms
    5. Track metrics and performance
    6. Alert on failures

    Result: Organic traffic and awareness without manual intervention
    """

    def __init__(
        self,
        social_config: Dict,
        kamiyo_api_url: str,
        kamiyo_api_key: Optional[str] = None,
        enable_monitoring: bool = True,
        enable_alerting: bool = True
    ):
        """
        Initialize the autonomous growth engine

        Args:
            social_config: Configuration for all social platforms
            kamiyo_api_url: Kamiyo API base URL
            kamiyo_api_key: Optional API key for authentication
            enable_monitoring: Enable Prometheus metrics
            enable_alerting: Enable alerting on failures
        """
        logger.info("Initializing Autonomous Growth Engine")

        # Core components
        self.report_generator = ReportGenerator()
        self.post_generator = PostGenerator()
        self.social_poster = SocialMediaPoster(social_config)

        # Claude AI enhancer for deep dive analysis
        self.claude_enhancer = ClaudeEnhancer()
        if self.claude_enhancer.client:
            logger.info("Claude AI enhancer initialized successfully")
        else:
            logger.warning("Claude AI enhancer not available - will use template-based threads")

        # Monitoring and alerting
        self.enable_monitoring = enable_monitoring
        self.enable_alerting = enable_alerting
        if enable_alerting:
            self.alert_manager = AlertManager()

        # Initialize watcher with callback to this engine's process_exploit
        self.watcher = KamiyoWatcher(
            api_base_url=kamiyo_api_url,
            social_poster=self.social_poster,  # Pass the actual social poster
            api_key=kamiyo_api_key,
            websocket_url=os.getenv('KAMIYO_WEBSOCKET_URL'),
            process_callback=self.process_exploit  # Use autonomous engine's enhanced processing
        )

        # Statistics
        self.stats = {
            'exploits_processed': 0,
            'reports_generated': 0,
            'posts_published': 0,
            'posts_failed': 0,
            'total_reach': 0  # Estimate based on platform followers
        }

        logger.info(
            "Autonomous Growth Engine initialized",
            extra={
                'platforms': len(self.social_poster.platforms),
                'monitoring_enabled': enable_monitoring,
                'alerting_enabled': enable_alerting
            }
        )

    def process_exploit(
        self,
        exploit: ExploitData,
        platforms: Optional[List[Platform]] = None,
        review_callback=None,
        auto_post: bool = True  # Default to autonomous mode
    ) -> Dict:
        """
        Process new exploit: analyze, generate report, and post to social media

        This is the main pipeline that creates organic growth:
        1. Generate detailed analysis report
        2. Create platform-specific content with engaging elements
        3. Post to all enabled platforms
        4. Track metrics and alert on issues

        Args:
            exploit: Confirmed exploit data from Kamiyo
            platforms: Platforms to post to (None = all enabled)
            review_callback: Optional manual review (None = autonomous)
            auto_post: Skip review and auto-post (autonomous mode)

        Returns:
            dict: Complete processing result with metrics
        """
        request_id = f"exploit-{exploit.tx_hash[:8]}"

        with log_context(
            request_id=request_id,
            exploit_tx_hash=exploit.tx_hash,
            protocol=exploit.protocol,
            chain=exploit.chain
        ):
            logger.info(
                "Processing exploit for autonomous growth",
                extra={
                    'protocol': exploit.protocol,
                    'loss_amount': exploit.loss_amount_usd,
                    'chain': exploit.chain,
                    'exploit_type': exploit.exploit_type
                }
            )

            try:
                # Step 1: Generate detailed analysis report
                logger.info("Generating exploit analysis report")
                start_time = datetime.utcnow()

                report = self.report_generator.analyze_exploit(exploit)

                if self.enable_monitoring:
                    duration = (datetime.utcnow() - start_time).total_seconds()
                    record_generation_duration('report_analysis', duration)

                self.stats['reports_generated'] += 1

                logger.info(
                    "Analysis report generated",
                    extra={
                        'report_id': report.report_id,
                        'engagement_hooks': len(report.engagement_hooks)
                    }
                )

                # Step 2: Create enhanced social media content
                logger.info("Generating platform-specific content")

                # Use analysis report to enhance basic post
                post = self._create_enhanced_post(exploit, report, platforms)

                self.stats['exploits_processed'] += 1

                # Step 3: Review (optional) or auto-post
                if auto_post:
                    post.mark_reviewed(approved=True)
                    approved = True
                    logger.info("Auto-posting enabled - skipping manual review")
                else:
                    approved = self._review_post(post, review_callback)

                if not approved:
                    logger.warning("Post rejected during review")
                    return {
                        'success': False,
                        'reason': 'Post rejected during review',
                        'report': report,
                        'post': post
                    }

                # Step 4: Post to all platforms
                logger.info("Publishing to social media platforms")
                posting_result = self._post_with_monitoring(post)

                # Step 5: Track success metrics
                if posting_result['success']:
                    self.stats['posts_published'] += 1
                    logger.info(
                        "Successfully published exploit across all platforms",
                        extra={
                            'platforms': len(post.platforms),
                            'report_id': report.report_id
                        }
                    )
                elif posting_result.get('partial'):
                    self.stats['posts_published'] += 1
                    logger.warning(
                        "Partial success - some platforms failed",
                        extra={
                            'successful_platforms': sum(
                                1 for r in posting_result['results'].values()
                                if r.get('success')
                            ),
                            'total_platforms': len(post.platforms)
                        }
                    )
                else:
                    self.stats['posts_failed'] += 1
                    logger.error(
                        "Failed to publish to any platform",
                        extra={'error': posting_result.get('error')}
                    )

                    # Alert on total failure
                    if self.enable_alerting:
                        alert = Alert(
                            title=f"Social Posting Failed: {exploit.protocol}",
                            message=f"Failed to post {exploit.protocol} exploit to any platform",
                            severity=AlertSeverity.ERROR,
                            details={
                                'exploit_tx': exploit.tx_hash,
                                'protocol': exploit.protocol,
                                'platforms_attempted': [p.value for p in post.platforms]
                            }
                        )
                        self.alert_manager.send_alert(alert)

                return {
                    'success': posting_result['success'],
                    'partial': posting_result.get('partial', False),
                    'report': report,
                    'post': post,
                    'posting_results': posting_result,
                    'stats': self.stats.copy()
                }

            except Exception as e:
                logger.error(
                    "Error processing exploit",
                    extra={'error': str(e)},
                    exc_info=True
                )

                if self.enable_monitoring:
                    track_api_error('processing_pipeline', str(type(e).__name__))

                if self.enable_alerting:
                    alert = Alert(
                        title="Exploit Processing Error",
                        message=f"Error processing {exploit.protocol}: {str(e)}",
                        severity=AlertSeverity.ERROR,
                        details={'exploit_tx': exploit.tx_hash, 'error': str(e)}
                    )
                    self.alert_manager.send_alert(alert)

                return {
                    'success': False,
                    'error': str(e),
                    'stats': self.stats.copy()
                }

    def _create_enhanced_post(
        self,
        exploit: ExploitData,
        report,
        platforms: Optional[List[Platform]]
    ):
        """Create enhanced social media post using analysis report"""

        # Generate base content
        post = self.post_generator.generate_post(exploit, platforms or list(self.social_poster.platforms.keys()))

        # Determine if exploit qualifies for deep dive thread (>$1M)
        deep_dive_threshold = float(os.getenv('DEEP_DIVE_THRESHOLD_USD', 1_000_000))
        is_major_exploit = exploit.loss_amount_usd >= deep_dive_threshold

        if is_major_exploit:
            logger.info(
                f"Major exploit detected (${exploit.loss_amount_usd:,.0f}) - generating deep dive thread",
                extra={'protocol': exploit.protocol, 'threshold': deep_dive_threshold}
            )
        else:
            logger.info(
                f"Medium exploit detected (${exploit.loss_amount_usd:,.0f}) - using quick alert",
                extra={'protocol': exploit.protocol, 'threshold': deep_dive_threshold}
            )

        # Enhance with analysis insights
        for platform in post.platforms:
            if platform == Platform.X_TWITTER and is_major_exploit:
                # Use Claude AI to generate engaging thread if available
                if self.claude_enhancer and self.claude_enhancer.client:
                    logger.info(f"Using Claude AI to generate deep dive thread for {exploit.protocol}")

                    # Prepare exploit data for Claude
                    exploit_data = {
                        'protocol': exploit.protocol,
                        'chain': exploit.chain,
                        'loss_amount_usd': exploit.loss_amount_usd,
                        'formatted_amount': exploit.formatted_amount,
                        'exploit_type': exploit.exploit_type,
                        'description': exploit.description,
                        'tx_hash': exploit.tx_hash,
                        'source': exploit.source,
                        'source_url': exploit.source_url,
                        'timestamp': exploit.timestamp.isoformat(),
                        'recovery_status': exploit.recovery_status
                    }

                    # Prepare data for Claude thread generation (no emojis)
                    impact_data = {
                        'severity_indicator': ''  # No emojis
                    }

                    historical_context_data = None
                    if hasattr(report, 'historical_context') and report.historical_context:
                        historical_context_data = {
                            'ranking': getattr(report.historical_context, 'ranking', None),
                            'trend_direction': getattr(report.historical_context, 'trend_direction', 'stable'),
                            'trend_percentage': getattr(report.historical_context, 'trend_percentage', 0.0)
                        }

                    # Generate Claude-enhanced thread
                    thread = self.claude_enhancer.generate_twitter_thread(
                        exploit_data,
                        report.executive_summary,
                        impact_data,
                        historical_context_data,
                        report.engagement_hooks
                    )
                    post.content[platform] = thread
                else:
                    # Fallback to template-based thread
                    logger.warning(f"Claude AI not available - using template thread for {exploit.protocol}")
                    thread = self._generate_template_thread(exploit, report)
                    post.content[platform] = thread

            elif platform == Platform.DISCORD and is_major_exploit:
                # Use Claude AI to enhance Discord content if available
                if self.claude_enhancer and self.claude_enhancer.client:
                    logger.info(f"Using Claude AI to generate Discord deep dive for {exploit.protocol}")

                    # Use executive summary as enhanced description
                    enhanced = self.claude_enhancer.enhance_executive_summary(
                        {
                            'protocol': exploit.protocol,
                            'chain': exploit.chain,
                            'loss_amount_usd': exploit.loss_amount_usd,
                            'exploit_type': exploit.exploit_type,
                            'source': exploit.source
                        },
                        f"{exploit.protocol} on {exploit.chain} suffered a {exploit.exploit_type} attack resulting in ${exploit.loss_amount_usd:,.0f} in losses.",
                        historical_context={
                            'ranking': getattr(report.historical_context, 'ranking', None) if hasattr(report, 'historical_context') and report.historical_context else None,
                            'trend_direction': getattr(report.historical_context, 'trend_direction', 'stable') if hasattr(report, 'historical_context') and report.historical_context else 'stable'
                        }
                    )

                    # Handle dict or string response
                    if isinstance(enhanced, dict):
                        analysis = enhanced.get('analysis', '')
                        root_cause = enhanced.get('root_cause', '')
                    else:
                        analysis = enhanced
                        root_cause = ''

                    # Create Discord embed with Claude-enhanced content
                    discord_content = f"**EXPLOIT ALERT: {exploit.protocol}**\n\n"
                    discord_content += f"**Loss:** {exploit.formatted_amount}\n"
                    discord_content += f"**Chain:** {exploit.chain}\n"
                    discord_content += f"**Type:** {exploit.exploit_type}\n\n"
                    discord_content += f"**Analysis:**\n{analysis}\n\n"

                    # Add Root Cause if available
                    if root_cause:
                        discord_content += f"**Root Cause:**\n{root_cause}\n\n"

                    if exploit.source:
                        discord_content += f"**Source:** {exploit.source}"

                    post.content[platform] = discord_content
                else:
                    # Fallback to template
                    logger.warning(f"Claude AI not available - using template for Discord")
                    discord_content = f"**EXPLOIT ALERT: {exploit.protocol}**\n\n"
                    discord_content += f"**Loss:** {exploit.formatted_amount}\n"
                    discord_content += f"**Chain:** {exploit.chain}\n"
                    discord_content += f"**Type:** {exploit.exploit_type}\n\n"
                    discord_content += f"**Analysis:**\n{report.executive_summary}\n\n"
                    if exploit.source:
                        discord_content += f"**Source:** {exploit.source}"
                    post.content[platform] = discord_content

            elif platform == Platform.REDDIT:
                # Enhanced Reddit post with full analysis
                enhanced = post.content[platform]

                # Add engagement hook after title
                if report.engagement_hooks:
                    enhanced = enhanced.replace(
                        "**Chain:**",
                        f"\n> {report.engagement_hooks[0]}\n\n**Chain:**"
                    )

                post.content[platform] = enhanced

        return post

    def _generate_template_thread(self, exploit: ExploitData, report) -> List[str]:
        """Generate template-based thread when Claude is not available"""
        thread = []

        # Tweet 1: Alert with key details
        thread.append(
            f"EXPLOIT ALERT: {exploit.protocol}\n\n"
            f"Loss: {exploit.formatted_amount}\n"
            f"Chain: {exploit.chain}\n"
            f"Type: {exploit.exploit_type}\n\n"
            f"Analysis thread below"
        )

        # Tweet 2: Executive summary
        thread.append(report.executive_summary[:280])

        # Tweet 3: Key fact from engagement hooks
        if report.engagement_hooks:
            # Remove any emojis from engagement hooks
            hook = report.engagement_hooks[0]
            # Remove common emoji patterns
            hook = hook.replace('➡️', '').replace('🟢', '').replace('🟡', '').replace('🟠', '').replace('🔴', '').strip()
            thread.append(f"Key Insight:\n\n{hook}")

        # Tweet 4: Timeline
        if report.timeline:
            detection_speed_str = report.detection_speed() if callable(getattr(report, 'detection_speed', None)) else "minutes"
            thread.append(
                f"Timeline:\n\n"
                f"Occurred: {report.timeline[0].timestamp.strftime('%H:%M UTC')}\n"
                f"Detected: {report.timeline[-1].timestamp.strftime('%H:%M UTC')}\n"
                f"Detection speed: {detection_speed_str}"
            )

        # Tweet 5: Context
        if hasattr(report, 'historical_context') and report.historical_context:
            ctx = report.historical_context
            if hasattr(ctx, 'total_losses_in_category') and ctx.total_losses_in_category > 0:
                thread.append(
                    f"Historical Context:\n\n"
                    f"Total losses in {exploit.exploit_type}: ${ctx.total_losses_in_category / 1_000_000:.1f}M this quarter"
                )

        # Tweet 6: Source
        thread.append(
            f"Source: {exploit.source or 'Kamiyo'}\n\n"
            f"kamiyo.ai"
        )

        return thread

    def _review_post(self, post, review_callback):
        """Review post with callback or auto-approve"""
        if review_callback:
            return review_callback(post)
        else:
            # Auto-approve in autonomous mode
            return True

    def _post_with_monitoring(self, post):
        """Post to platforms with monitoring"""
        result = self.social_poster.post_to_platforms(post)

        # Track metrics for each platform
        if self.enable_monitoring:
            for platform_name, platform_result in result.get('results', {}).items():
                status = 'success' if platform_result.get('success') else 'failure'
                track_post(platform_name, status)

        return result

    def start_autonomous_mode(
        self,
        mode: str = 'websocket',
        poll_interval: int = 60
    ):
        """
        Start autonomous growth engine in continuous mode

        This runs continuously, monitoring Kamiyo for new exploits and
        automatically posting analysis reports to social media for organic growth.

        Args:
            mode: 'websocket' for real-time or 'poll' for periodic checks
            poll_interval: Polling interval in seconds (if mode=poll)
        """
        logger.info(
            "Starting Autonomous Growth Engine",
            extra={'mode': mode, 'poll_interval': poll_interval}
        )

        if mode == 'websocket':
            import asyncio
            asyncio.run(self.watcher.watch_websocket())
        else:
            self.watcher.poll_and_post(interval=poll_interval)

    def get_stats(self) -> Dict:
        """Get current statistics"""
        return {
            **self.stats,
            'platform_status': self.social_poster.get_platform_status()
        }


# CLI for running the autonomous growth engine
if __name__ == "__main__":
    from dotenv import load_dotenv
    import argparse

    load_dotenv()

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # Parse arguments
    parser = argparse.ArgumentParser(
        description='Kamiyo Autonomous Growth Engine - Automatic exploit analysis and social posting'
    )
    parser.add_argument(
        '--mode',
        choices=['websocket', 'poll'],
        default=os.getenv('WATCHER_MODE', 'poll'),
        help='Operating mode (websocket=real-time, poll=periodic)'
    )
    parser.add_argument(
        '--interval',
        type=int,
        default=int(os.getenv('POLL_INTERVAL_SECONDS', 60)),
        help='Polling interval in seconds (only for poll mode)'
    )
    parser.add_argument(
        '--no-monitoring',
        action='store_true',
        help='Disable Prometheus monitoring'
    )
    parser.add_argument(
        '--no-alerting',
        action='store_true',
        help='Disable alerting'
    )

    args = parser.parse_args()

    # Social media configuration
    social_config = {
        'reddit': {
            'enabled': os.getenv('REDDIT_ENABLED', 'false').lower() == 'true',
            'client_id': os.getenv('REDDIT_CLIENT_ID'),
            'client_secret': os.getenv('REDDIT_CLIENT_SECRET'),
            'username': os.getenv('REDDIT_USERNAME'),
            'password': os.getenv('REDDIT_PASSWORD'),
            'subreddits': os.getenv('REDDIT_SUBREDDITS', 'defi').split(',')
        },
        'discord': {
            'enabled': os.getenv('DISCORD_ENABLED', 'false').lower() == 'true',
            'webhooks': {
                name: url
                for name, url in (
                    item.split('=')
                    for item in os.getenv('DISCORD_SOCIAL_WEBHOOKS', '').split(',')
                    if '=' in item
                )
            }
        },
        'telegram': {
            'enabled': os.getenv('TELEGRAM_SOCIAL_ENABLED', 'false').lower() == 'true',
            'bot_token': os.getenv('TELEGRAM_SOCIAL_BOT_TOKEN'),
            'chat_ids': {
                name: chat_id
                for name, chat_id in (
                    item.split('=')
                    for item in os.getenv('TELEGRAM_SOCIAL_CHATS', '').split(',')
                    if '=' in item
                )
            }
        },
        'x_twitter': {
            'enabled': os.getenv('X_TWITTER_ENABLED', 'false').lower() == 'true',
            'api_key': os.getenv('X_API_KEY'),
            'api_secret': os.getenv('X_API_SECRET'),
            'access_token': os.getenv('X_ACCESS_TOKEN'),
            'access_secret': os.getenv('X_ACCESS_SECRET'),
            'bearer_token': os.getenv('X_BEARER_TOKEN')
        }
    }

    # Check at least one platform enabled
    enabled_platforms = sum(1 for cfg in social_config.values() if cfg.get('enabled'))
    if enabled_platforms == 0:
        logger.error("No social media platforms enabled! Enable at least one platform in .env")
        sys.exit(1)

    logger.info(f"Starting with {enabled_platforms} platform(s) enabled")

    # Initialize engine
    engine = AutonomousGrowthEngine(
        social_config=social_config,
        kamiyo_api_url=os.getenv('KAMIYO_API_URL', 'https://api.kamiyo.ai'),
        kamiyo_api_key=os.getenv('KAMIYO_API_KEY'),
        enable_monitoring=not args.no_monitoring,
        enable_alerting=not args.no_alerting
    )

    # Start autonomous mode
    try:
        logger.info(
            f"🚀 Autonomous Growth Engine ACTIVE in {args.mode} mode"
        )
        logger.info(
            f"📊 Monitoring new exploits for automatic analysis and posting..."
        )

        engine.start_autonomous_mode(
            mode=args.mode,
            poll_interval=args.interval
        )
    except KeyboardInterrupt:
        logger.info("Autonomous Growth Engine stopped by user")
        logger.info(f"Final stats: {engine.get_stats()}")
