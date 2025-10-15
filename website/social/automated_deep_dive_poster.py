# -*- coding: utf-8 -*-
"""
Automated Deep Dive Exploit Poster
Automatically posts deep dive analysis for high-impact exploits

This module determines exploit significance and automatically generates
and posts detailed analysis for significant incidents.
"""

import os
import sys
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from social.models import ExploitData, Platform
from social.analysis.report_generator import ReportGenerator
from social.analysis.formatters import ReportFormatter
from social.analysis.data_models import ReportFormat
from social.analysis.claude_enhancer import ClaudeEnhancer
from social.poster import SocialMediaPoster
from social.post_generator import PostGenerator
from social.visualization_generator import VisualizationGenerator

logger = logging.getLogger(__name__)


class AutomatedDeepDivePoster:
    """
    Automatically post deep dive analysis for significant exploits

    This class determines which exploits warrant detailed analysis based on:
    - Loss amount ($1M+ = high impact)
    - Protocol prominence
    - Exploit type novelty
    - Community interest

    For significant exploits, it automatically:
    1. Generates comprehensive report with Claude enhancement
    2. Creates branded visualizations (exploit cards, charts, timelines)
    3. Formats for multiple platforms
    4. Posts to social media with graphics
    5. Tracks posted exploits to avoid duplicates
    """

    # Impact thresholds (configurable)
    CRITICAL_THRESHOLD = 10_000_000  # $10M+
    HIGH_THRESHOLD = 1_000_000       # $1M+
    MEDIUM_THRESHOLD = 100_000       # $100K+

    # High-profile protocols (always get deep dive if exploited)
    HIGH_PROFILE_PROTOCOLS = [
        'Uniswap', 'Curve', 'Aave', 'Compound', 'MakerDAO',
        'Balancer', 'Yearn', 'SushiSwap', 'PancakeSwap',
        'dYdX', 'GMX', 'Synthetix', 'Lido', 'Convex'
    ]

    # Novel attack types (always interesting)
    NOVEL_ATTACK_TYPES = [
        'Zero-Day', 'MEV', 'Sandwich Attack', 'Novel Exploit',
        'Cross-Chain', 'Bridge Exploit', 'Governance Attack'
    ]

    def __init__(
        self,
        db_connection=None,
        social_poster: Optional[SocialMediaPoster] = None,
        use_claude: bool = True,
        auto_post: bool = False  # Set to True for fully automatic posting
    ):
        """
        Initialize automated deep dive poster

        Args:
            db_connection: Database connection for historical context
            social_poster: SocialMediaPoster instance for posting
            use_claude: Whether to use Claude AI enhancement
            auto_post: If True, automatically posts. If False, saves drafts only
        """
        self.report_generator = ReportGenerator(db_connection=db_connection)
        self.formatter = ReportFormatter()
        self.social_poster = social_poster  # Optional, only needed if auto_post=True
        self.post_generator = PostGenerator()  # For quick posts
        self.auto_post = auto_post

        # Claude enhancement (optional)
        self.use_claude = use_claude
        self.claude_enhancer = ClaudeEnhancer() if use_claude else None

        # Visualization generator for charts and graphics
        self.viz_generator = VisualizationGenerator()

        # Track posted exploits to avoid duplicates
        self.posted_exploits = set()
        self._load_posted_exploits()

        logger.info(
            f"AutomatedDeepDivePoster initialized. "
            f"Claude: {'enabled' if use_claude else 'disabled'}, "
            f"Visualizations: enabled, "
            f"Auto-post: {'enabled' if auto_post else 'disabled (draft mode)'}"
        )

    def _load_posted_exploits(self):
        """Load previously posted exploit IDs from file"""
        posted_file = os.path.join(
            os.path.dirname(__file__),
            '.posted_exploits.txt'
        )
        if os.path.exists(posted_file):
            with open(posted_file, 'r') as f:
                self.posted_exploits = set(line.strip() for line in f)
            logger.info(f"Loaded {len(self.posted_exploits)} previously posted exploits")

    def _save_posted_exploit(self, exploit_id: str):
        """Save exploit ID to prevent duplicate posting"""
        posted_file = os.path.join(
            os.path.dirname(__file__),
            '.posted_exploits.txt'
        )
        with open(posted_file, 'a') as f:
            f.write(f"{exploit_id}\n")
        self.posted_exploits.add(exploit_id)

    def should_post_deep_dive(self, exploit: ExploitData) -> Tuple[bool, str]:
        """
        Determine if exploit warrants deep dive analysis

        Args:
            exploit: Exploit data

        Returns:
            (should_post: bool, reason: str)
        """
        loss_amount = exploit.loss_amount_usd

        # Check if already posted
        exploit_id = exploit.tx_hash
        if exploit_id in self.posted_exploits:
            return False, "Already posted"

        # CRITICAL severity ($10M+)
        if loss_amount >= self.CRITICAL_THRESHOLD:
            return True, f"CRITICAL severity (${loss_amount/1_000_000:.1f}M)"

        # HIGH severity ($1M+)
        if loss_amount >= self.HIGH_THRESHOLD:
            return True, f"HIGH severity (${loss_amount/1_000_000:.1f}M)"

        # High-profile protocol (any loss amount)
        if any(protocol in exploit.protocol for protocol in self.HIGH_PROFILE_PROTOCOLS):
            return True, f"High-profile protocol ({exploit.protocol})"

        # Novel attack type
        if exploit.exploit_type in self.NOVEL_ATTACK_TYPES:
            return True, f"Novel attack type ({exploit.exploit_type})"

        # MEDIUM severity ($100K+) + interesting chain
        if loss_amount >= self.MEDIUM_THRESHOLD:
            interesting_chains = ['Arbitrum', 'Optimism', 'Base', 'zkSync']
            if exploit.chain in interesting_chains:
                return True, f"Significant loss on {exploit.chain}"

        # Default: use quick post instead
        return False, f"Below threshold (${loss_amount/1000:.0f}K)"

    def process_exploit(self, exploit: ExploitData) -> Dict:
        """
        Process exploit and determine posting strategy

        Args:
            exploit: Exploit data

        Returns:
            Dictionary with posting result
        """
        should_post, reason = self.should_post_deep_dive(exploit)

        result = {
            'exploit_id': exploit.tx_hash,
            'protocol': exploit.protocol,
            'loss_amount': exploit.loss_amount_usd,
            'deep_dive': should_post,
            'reason': reason,
            'posted': False,
            'platforms': []
        }

        if should_post:
            logger.info(
                f"🔥 HIGH IMPACT EXPLOIT: {exploit.protocol} - "
                f"${exploit.loss_amount_usd:,.0f}. Reason: {reason}"
            )
            result.update(self._post_deep_dive(exploit))
        else:
            logger.info(
                f"📝 Standard exploit: {exploit.protocol} - "
                f"${exploit.loss_amount_usd:,.0f}. Reason: {reason}"
            )
            result.update(self._post_quick_alert(exploit))

        return result

    def _post_deep_dive(self, exploit: ExploitData) -> Dict:
        """
        Generate and post deep dive analysis

        Args:
            exploit: Exploit data

        Returns:
            Posting result dictionary
        """
        try:
            # Generate comprehensive report
            logger.info(f"Generating deep dive report for {exploit.protocol}...")
            report = self.report_generator.analyze_exploit(
                exploit,
                report_format=ReportFormat.LONG,
                include_historical=True
            )

            # Generate visualizations
            logger.info("Generating branded visualizations...")
            visualizations = self._generate_visualizations(exploit, report)

            # Enhance with Claude if enabled
            if self.use_claude and self.claude_enhancer and self.claude_enhancer.client:
                logger.info("Enhancing with Claude AI...")

                # Enhance executive summary
                enhanced_summary = self.claude_enhancer.enhance_executive_summary(
                    exploit_data={
                        'protocol': exploit.protocol,
                        'chain': exploit.chain,
                        'loss_amount_usd': exploit.loss_amount_usd,
                        'exploit_type': exploit.exploit_type,
                        'source': exploit.source
                    },
                    base_summary=report.executive_summary,
                    historical_context=report.historical_context.__dict__ if report.historical_context else None
                )
                report.executive_summary = enhanced_summary

                # Generate enhanced Twitter thread
                twitter_thread = self.claude_enhancer.generate_twitter_thread(
                    exploit_data={
                        'protocol': exploit.protocol,
                        'chain': exploit.chain,
                        'loss_amount_usd': exploit.loss_amount_usd,
                        'exploit_type': exploit.exploit_type,
                        'source': exploit.source
                    },
                    timeline=[{
                        'time': event.timestamp.strftime('%H:%M UTC'),
                        'description': event.description
                    } for event in report.timeline],
                    impact={
                        'severity_indicator': report.impact.severity.indicator
                    },
                    historical_context=report.historical_context.__dict__ if report.historical_context else None,
                    engagement_hooks=report.engagement_hooks
                )
            else:
                # Use template-based thread
                twitter_thread = self.formatter.format_for_twitter_thread(report)

            # Format for other platforms
            reddit_post = self.formatter.format_for_reddit(report)
            discord_embed = self.formatter.format_for_discord_embed(report)

            # Save drafts
            self._save_draft(exploit, {
                'twitter_thread': twitter_thread,
                'reddit_post': reddit_post,
                'discord_embed': discord_embed,
                'report': report,
                'visualizations': visualizations
            })

            # Post if auto_post enabled
            posted_to = []
            if self.auto_post:
                logger.info("Auto-posting enabled. Posting to platforms...")

                # Post Twitter thread
                try:
                    for i, tweet in enumerate(twitter_thread, 1):
                        self.social_poster.post_to_twitter(tweet)
                        logger.info(f"Posted tweet {i}/{len(twitter_thread)}")
                    posted_to.append('Twitter')
                except Exception as e:
                    logger.error(f"Failed to post to Twitter: {e}")

                # Mark as posted
                self._save_posted_exploit(exploit.tx_hash)
            else:
                logger.info(
                    "Auto-post disabled. Draft saved to "
                    f"social/drafts/{exploit.protocol.replace(' ', '_')}_deep_dive.md"
                )

            return {
                'posted': self.auto_post,
                'platforms': posted_to,
                'twitter_thread_length': len(twitter_thread),
                'reddit_post_length': len(reddit_post),
                'claude_enhanced': bool(self.use_claude and self.claude_enhancer and self.claude_enhancer.client),
                'visualizations_generated': len(visualizations),
                'visualization_paths': visualizations
            }

        except Exception as e:
            logger.error(f"Deep dive posting failed: {e}")
            return {
                'posted': False,
                'error': str(e)
            }

    def _generate_visualizations(self, exploit: ExploitData, report) -> Dict:
        """
        Generate branded visualizations for exploit

        Args:
            exploit: Exploit data
            report: Generated report with timeline and historical context

        Returns:
            Dictionary with paths to generated visualizations
        """
        visualizations = {}

        try:
            # 1. Generate exploit card (always for high-impact exploits)
            severity = 'critical' if exploit.loss_amount_usd >= self.CRITICAL_THRESHOLD else \
                      'high' if exploit.loss_amount_usd >= self.HIGH_THRESHOLD else \
                      'medium' if exploit.loss_amount_usd >= self.MEDIUM_THRESHOLD else 'low'

            card_path = self.viz_generator.generate_exploit_card(
                protocol=exploit.protocol,
                chain=exploit.chain,
                loss_amount=exploit.loss_amount_usd,
                exploit_type=exploit.exploit_type,
                severity=severity,
                timestamp=exploit.timestamp
            )
            visualizations['exploit_card'] = card_path
            logger.info(f"✅ Generated exploit card: {card_path}")

            # 2. Generate timeline chart (if timeline data exists)
            if hasattr(report, 'timeline') and report.timeline:
                timeline_events = [{
                    'time': event.timestamp.strftime('%H:%M UTC'),
                    'description': event.description[:50]  # Truncate for chart
                } for event in report.timeline[:5]]  # Max 5 events

                timeline_path = self.viz_generator.generate_timeline_chart(
                    events=timeline_events,
                    title=f"{exploit.protocol} Exploit Timeline"
                )
                visualizations['timeline_chart'] = timeline_path
                logger.info(f"✅ Generated timeline chart: {timeline_path}")

            # 3. Generate bar chart for historical context (if available)
            if hasattr(report, 'historical_context') and report.historical_context:
                historical_ctx = report.historical_context

                # Create bar chart data from historical context
                # This is example data - adjust based on actual historical_context structure
                if hasattr(historical_ctx, 'similar_exploits'):
                    similar = historical_ctx.similar_exploits[:5]
                    chart_data = [
                        (e.get('protocol', 'Unknown')[:15], e.get('loss_amount_usd', 0))
                        for e in similar
                    ]

                    if chart_data:
                        chart_path = self.viz_generator.generate_bar_chart(
                            data=chart_data,
                            title=f"Similar {exploit.exploit_type} Attacks",
                            y_label="Loss (USD)"
                        )
                        visualizations['historical_chart'] = chart_path
                        logger.info(f"✅ Generated historical chart: {chart_path}")

            logger.info(f"Generated {len(visualizations)} visualization(s)")

        except Exception as e:
            logger.error(f"Visualization generation failed: {e}")
            # Non-fatal error - continue without visualizations

        return visualizations

    def _post_quick_alert(self, exploit: ExploitData) -> Dict:
        """
        Post quick alert for standard exploits

        Args:
            exploit: Exploit data

        Returns:
            Posting result dictionary
        """
        try:
            # Generate quick post
            post = self.post_generator.generate_post(
                exploit,
                platforms=[Platform.X_TWITTER]
            )

            # Post if auto_post enabled
            if self.auto_post:
                self.social_poster.post_to_twitter(
                    post.content[Platform.X_TWITTER]
                )
                self._save_posted_exploit(exploit.tx_hash)
                logger.info(f"Posted quick alert for {exploit.protocol}")
                return {'posted': True, 'platforms': ['Twitter'], 'type': 'quick_alert'}
            else:
                logger.info(f"Quick alert ready for {exploit.protocol} (draft mode)")
                return {'posted': False, 'platforms': [], 'type': 'quick_alert'}

        except Exception as e:
            logger.error(f"Quick alert posting failed: {e}")
            return {'posted': False, 'error': str(e)}

    def _save_draft(self, exploit: ExploitData, content: Dict):
        """Save draft to file for manual review"""
        drafts_dir = os.path.join(os.path.dirname(__file__), 'drafts')
        os.makedirs(drafts_dir, exist_ok=True)

        filename = f"{exploit.protocol.replace(' ', '_')}_{exploit.chain}_deep_dive.md"
        filepath = os.path.join(drafts_dir, filename)

        with open(filepath, 'w') as f:
            f.write(f"# Deep Dive: {exploit.protocol} Exploit\n\n")
            f.write(f"**Loss:** ${exploit.loss_amount_usd:,.0f}\n")
            f.write(f"**Chain:** {exploit.chain}\n")
            f.write(f"**Type:** {exploit.exploit_type}\n")
            f.write(f"**Generated:** {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n\n")

            # Include visualizations section
            if 'visualizations' in content and content['visualizations']:
                f.write("## Visualizations\n\n")
                for viz_type, viz_path in content['visualizations'].items():
                    f.write(f"- **{viz_type.replace('_', ' ').title()}:** `{viz_path}`\n")
                f.write("\n")

            f.write("## Twitter Thread\n\n")
            for i, tweet in enumerate(content['twitter_thread'], 1):
                f.write(f"### Tweet {i}\n{tweet}\n\n")

            f.write("## Reddit Post\n\n")
            f.write(content['reddit_post'])
            f.write("\n\n")

        logger.info(f"Draft saved: {filepath}")


# Example usage
if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    print("=" * 80)
    print("KAMIYO Automated Deep Dive Poster - Test")
    print("=" * 80)

    # Initialize (draft mode)
    poster = AutomatedDeepDivePoster(
        use_claude=True,
        auto_post=False  # Draft mode for testing
    )

    # Test exploit (high impact)
    from datetime import datetime
    high_impact = ExploitData(
        tx_hash="0xtest123",
        protocol="Curve Finance",
        chain="Ethereum",
        loss_amount_usd=15_000_000,
        exploit_type="Reentrancy",
        timestamp=datetime.utcnow(),
        description="Reentrancy attack on Curve pools",
        source="Rekt News",
        source_url="https://rekt.news/curve-rekt/"
    )

    # Test exploit (standard)
    standard = ExploitData(
        tx_hash="0xtest456",
        protocol="Small DeFi Project",
        chain="BSC",
        loss_amount_usd=50_000,
        exploit_type="Flash Loan",
        timestamp=datetime.utcnow(),
        description="Flash loan attack",
        source="Twitter",
        source_url="https://twitter.com/..."
    )

    print("\n1. Testing HIGH IMPACT exploit:")
    print("-" * 80)
    result1 = poster.process_exploit(high_impact)
    print(f"Deep dive: {result1['deep_dive']}")
    print(f"Reason: {result1['reason']}")
    print(f"Posted: {result1['posted']}")

    print("\n2. Testing STANDARD exploit:")
    print("-" * 80)
    result2 = poster.process_exploit(standard)
    print(f"Deep dive: {result2['deep_dive']}")
    print(f"Reason: {result2['reason']}")
    print(f"Posted: {result2['posted']}")

    print("\n" + "=" * 80)
    print("Test complete! Check social/drafts/ for generated content.")
    print("=" * 80)
