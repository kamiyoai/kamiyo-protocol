# -*- coding: utf-8 -*-
"""
Report Formatters
Format exploit reports for different social media platforms

NOTE: Formats only - no security analysis or vulnerability detection
"""

from typing import List, Dict
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from social.analysis.data_models import ExploitReport, ReportFormat, SeverityLevel


class ReportFormatter:
    """
    Format exploit reports for various platforms

    Transforms ExploitReport objects into platform-specific formats
    optimized for engagement and readability.
    """

    def __init__(self):
        """Initialize formatter with platform-specific settings"""
        self.twitter_max_length = 280
        self.reddit_max_title_length = 300

    def format_for_twitter_thread(self, report: ExploitReport) -> List[str]:
        """
        Format report as Twitter/X thread

        Args:
            report: Exploit report to format

        Returns:
            List of tweet strings, each <= 280 characters
        """
        thread = []

        # Tweet 1: Alert with severity
        severity = report.impact.severity.indicator
        tweet1 = (
            f"{severity} EXPLOIT ALERT\n\n"
            f"{report.protocol} on {report.chain}\n"
            f"💰 ${report.impact.loss_amount_usd:,.0f} lost\n"
            f"🔥 Attack: {report.exploit_type}\n\n"
            f"🧵 Thread 👇"
        )
        thread.append(self._truncate_tweet(tweet1))

        # Tweet 2: Executive summary
        tweet2 = f"📋 What Happened:\n\n{report.executive_summary}"
        thread.append(self._truncate_tweet(tweet2))

        # Tweet 3: Timeline
        if report.timeline:
            timeline_text = "⏰ Timeline:\n\n"
            for event in report.timeline[:3]:  # Max 3 events
                time_ago = event.format_time_ago()
                timeline_text += f"• {time_ago}: {event.description[:50]}...\n"
            thread.append(self._truncate_tweet(timeline_text))

        # Tweet 4: Impact
        recovery_pct = report.impact.recovery_percentage
        tweet4 = (
            f"📊 Impact:\n\n"
            f"Loss: ${report.impact.loss_amount_usd:,.0f}\n"
        )
        if recovery_pct > 0:
            tweet4 += f"Recovered: {recovery_pct:.1f}%\n"
        tweet4 += f"Status: {report.impact.recovery_status}"
        thread.append(self._truncate_tweet(tweet4))

        # Tweet 5: Historical context (if available)
        if report.historical_context:
            ctx = report.historical_context
            tweet5 = f"📈 Context:\n\n"
            if ctx.ranking:
                tweet5 += f"{ctx.ranking}\n\n"
            tweet5 += (
                f"{report.exploit_type} attacks are {ctx.trend_direction} "
                f"({ctx.trend_percentage:+.1f}% {ctx.time_period})"
            )
            thread.append(self._truncate_tweet(tweet5))

        # Tweet 6: Source attribution
        source = report.source_attribution
        tweet6 = (
            f"ℹ️ Source: {source.primary_source}\n\n"
            f"🔗 TX: {report.exploit_tx_hash[:10]}...{report.exploit_tx_hash[-8:]}\n\n"
            f"🤖 Detected by Kamiyo Intelligence Platform\n"
            f"#DeFiSecurity #{report.chain}"
        )
        thread.append(self._truncate_tweet(tweet6))

        return thread

    def format_for_reddit(self, report: ExploitReport) -> str:
        """
        Format report for Reddit (markdown)

        Args:
            report: Exploit report to format

        Returns:
            Markdown-formatted post suitable for Reddit
        """
        severity = report.impact.severity.indicator
        lines = []

        # Title (would be used separately)
        # Reddit title format: "[SEVERITY] Protocol - $XM Lost - Attack Type"

        # Post body
        lines.append(f"# {severity} {report.protocol} Exploit Report")
        lines.append("")
        lines.append(f"**Chain:** {report.chain}")
        lines.append(f"**Attack Type:** {report.exploit_type}")
        lines.append(f"**Loss Amount:** ${report.impact.loss_amount_usd:,.2f} USD")
        lines.append("")
        lines.append("---")
        lines.append("")

        # Executive Summary
        lines.append("## Executive Summary")
        lines.append("")
        lines.append(report.executive_summary)
        lines.append("")

        # Timeline
        if report.timeline:
            lines.append("## Timeline")
            lines.append("")
            for event in report.timeline:
                time_str = event.timestamp.strftime('%Y-%m-%d %H:%M UTC')
                lines.append(f"* **{time_str}** - {event.description}")
            lines.append("")

        # Impact Assessment
        lines.append("## Impact Assessment")
        lines.append("")
        lines.append(f"* **Severity Level:** {severity}")
        lines.append(f"* **Total Loss:** ${report.impact.loss_amount_usd:,.2f} USD")

        if report.impact.recovery_amount_usd > 0:
            lines.append(
                f"* **Recovered:** ${report.impact.recovery_amount_usd:,.2f} USD "
                f"({report.impact.recovery_percentage:.1f}%)"
            )

        if report.impact.affected_users:
            lines.append(f"* **Affected Users:** {report.impact.affected_users:,}")

        lines.append(f"* **Recovery Status:** {report.impact.recovery_status}")
        lines.append("")

        # Historical Context
        if report.historical_context:
            lines.append("## Historical Context")
            lines.append("")
            ctx = report.historical_context

            if ctx.ranking:
                lines.append(f"**{ctx.ranking}**")
                lines.append("")

            lines.append(
                f"Total losses from similar {report.exploit_type} attacks {ctx.time_period}: "
                f"**${ctx.total_losses_in_category:,.2f} USD**"
            )
            lines.append("")

            lines.append(
                f"📈 **Trend Analysis:** {ctx.trend_direction.title()} "
                f"({ctx.trend_percentage:+.1f}% {ctx.time_period})"
            )
            lines.append("")

            if ctx.similar_exploits:
                lines.append("### Recent Similar Exploits")
                lines.append("")
                for exploit in ctx.similar_exploits[:5]:
                    lines.append(
                        f"* **{exploit.protocol}** ({exploit.chain}) - "
                        f"${exploit.loss_amount_usd:,.0f} - "
                        f"{exploit.timestamp.strftime('%b %d, %Y')} - "
                        f"{exploit.similarity_reason}"
                    )
                lines.append("")

        # Transaction Details
        lines.append("## Transaction Details")
        lines.append("")
        lines.append(f"**Transaction Hash:**")
        lines.append(f"```")
        lines.append(f"{report.exploit_tx_hash}")
        lines.append(f"```")
        lines.append("")

        # Source Attribution
        lines.append("## Sources")
        lines.append("")
        source = report.source_attribution
        lines.append(f"**Primary Source:** {source.primary_source}")

        if source.primary_source_url:
            lines.append(f"**URL:** {source.primary_source_url}")

        if source.additional_sources:
            lines.append("")
            lines.append("**Additional Sources:**")
            for src in source.additional_sources:
                lines.append(f"* {src.get('name', 'Unknown')}")

        lines.append("")
        lines.append("---")
        lines.append("")
        lines.append(
            "*This exploit was aggregated and reported by "
            "[Kamiyo Intelligence Platform](https://kamiyo.ai) - "
            "Real-time cryptocurrency exploit intelligence aggregator.*"
        )

        if source.detection_speed:
            lines.append("")
            lines.append(
                f"*Detected {source.detection_speed} of initial report from external sources.*"
            )

        return "\n".join(lines)

    def format_for_discord_embed(self, report: ExploitReport) -> Dict:
        """
        Format report as Discord embed

        Args:
            report: Exploit report to format

        Returns:
            Dictionary with Discord embed structure
        """
        severity = report.impact.severity
        severity_color = self._get_severity_color(severity)

        embed = {
            "title": f"{severity.indicator} {report.protocol} Exploit",
            "description": report.executive_summary,
            "color": severity_color,
            "fields": [
                {
                    "name": "💰 Loss Amount",
                    "value": f"${report.impact.loss_amount_usd:,.2f} USD",
                    "inline": True
                },
                {
                    "name": "⛓️ Chain",
                    "value": report.chain,
                    "inline": True
                },
                {
                    "name": "🔥 Attack Type",
                    "value": report.exploit_type,
                    "inline": True
                },
                {
                    "name": "♻️ Recovery Status",
                    "value": report.impact.recovery_status,
                    "inline": False
                }
            ],
            "footer": {
                "text": f"Source: {report.source_attribution.primary_source} | Kamiyo Intelligence"
            },
            "timestamp": report.generated_at.isoformat()
        }

        # Add recovery info if available
        if report.impact.recovery_amount_usd > 0:
            embed["fields"].append({
                "name": "💵 Recovered",
                "value": (
                    f"${report.impact.recovery_amount_usd:,.2f} "
                    f"({report.impact.recovery_percentage:.1f}%)"
                ),
                "inline": True
            })

        # Add historical context if available
        if report.historical_context and report.historical_context.ranking:
            embed["fields"].append({
                "name": "📊 Historical Context",
                "value": report.historical_context.ranking,
                "inline": False
            })

        # Add transaction hash
        embed["fields"].append({
            "name": "🔗 Transaction",
            "value": f"```{report.exploit_tx_hash[:16]}...{report.exploit_tx_hash[-16:]}```",
            "inline": False
        })

        return embed

    def format_ascii_chart(
        self,
        values: List[float],
        labels: List[str],
        title: str,
        width: int = 40
    ) -> str:
        """
        Create simple ASCII bar chart for text-based platforms

        Args:
            values: Numeric values to chart
            labels: Labels for each value
            title: Chart title
            width: Maximum width of bars

        Returns:
            ASCII art bar chart as string
        """
        if not values or not labels:
            return ""

        lines = [title, "=" * len(title), ""]

        max_value = max(values)
        max_label_len = max(len(label) for label in labels)

        for label, value in zip(labels, values):
            # Calculate bar length
            if max_value > 0:
                bar_len = int((value / max_value) * width)
            else:
                bar_len = 0

            # Create bar
            bar = "█" * bar_len

            # Format value
            if value >= 1_000_000:
                value_str = f"${value/1_000_000:.1f}M"
            elif value >= 1_000:
                value_str = f"${value/1_000:.0f}K"
            else:
                value_str = f"${value:.0f}"

            # Add line
            lines.append(f"{label:<{max_label_len}} │{bar} {value_str}")

        return "\n".join(lines)

    def format_trend_indicator(
        self,
        trend_direction: str,
        trend_percentage: float
    ) -> str:
        """
        Create visual trend indicator (NO EMOJIS)

        Args:
            trend_direction: 'increasing', 'decreasing', 'stable'
            trend_percentage: Percentage change

        Returns:
            Formatted trend string without emojis
        """
        if trend_direction == 'increasing' or trend_direction == 'UP':
            direction = "UP"
        elif trend_direction == 'decreasing' or trend_direction == 'DOWN':
            direction = "DOWN"
        else:
            direction = "STABLE"

        return f"{direction} {abs(trend_percentage):.1f}%"

    def _truncate_tweet(self, text: str, max_length: int = 280) -> str:
        """Truncate text to fit Twitter length limit"""
        if len(text) <= max_length:
            return text

        # Truncate and add ellipsis
        return text[:max_length - 3] + "..."

    def _get_severity_color(self, severity: SeverityLevel) -> int:
        """Get Discord color code for severity level"""
        color_map = {
            SeverityLevel.LOW: 0x00FF00,      # Green
            SeverityLevel.MEDIUM: 0xFFFF00,   # Yellow
            SeverityLevel.HIGH: 0xFF8C00,     # Orange
            SeverityLevel.CRITICAL: 0xFF0000  # Red
        }
        return color_map.get(severity, 0x808080)  # Gray default


# Example usage
if __name__ == "__main__":
    from datetime import datetime
    from social.analysis.data_models import (
        TimelineEvent, ImpactSummary, SourceAttribution
    )

    # Create example report
    report = ExploitReport(
        report_id="test-001",
        exploit_tx_hash="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        protocol="Example DEX",
        chain="Ethereum",
        exploit_type="Flash Loan",
        executive_summary=(
            "Example DEX suffered a $2.5M flash loan attack exploiting "
            "a price oracle vulnerability. The attack was detected within "
            "5 minutes by Kamiyo's aggregation system."
        ),
        timeline=[
            TimelineEvent(
                timestamp=datetime.utcnow(),
                event_type='detected',
                description='Exploit detected by Kamiyo',
                source='Kamiyo'
            )
        ],
        impact=ImpactSummary(
            loss_amount_usd=2_500_000,
            affected_protocols=['Example DEX'],
            affected_chains=['Ethereum'],
            recovery_status='Partial recovery in progress',
            recovery_amount_usd=1_000_000
        ),
        source_attribution=SourceAttribution(
            primary_source='Rekt News',
            primary_source_url='https://rekt.news/example'
        )
    )

    formatter = ReportFormatter()

    print("="*60)
    print("TWITTER THREAD")
    print("="*60)
    thread = formatter.format_for_twitter_thread(report)
    for i, tweet in enumerate(thread, 1):
        print(f"\nTweet {i}/{len(thread)}:")
        print("-" * 40)
        print(tweet)
        print(f"Length: {len(tweet)} chars")

    print("\n" + "="*60)
    print("DISCORD EMBED")
    print("="*60)
    embed = formatter.format_for_discord_embed(report)
    print(f"Title: {embed['title']}")
    print(f"Description: {embed['description']}")
    print("\nFields:")
    for field in embed['fields']:
        print(f"  {field['name']}: {field['value']}")
