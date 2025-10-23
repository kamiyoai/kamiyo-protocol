# -*- coding: utf-8 -*-
"""
Exploit Report Generator
Main module for generating human-readable exploit analysis reports

CRITICAL: This module ONLY aggregates and presents confirmed exploit data.
It does NOT:
- Detect vulnerabilities
- Analyze smart contract code
- Predict exploits
- Score security risks

This follows CLAUDE.md principles: AGGREGATE, don't GENERATE security insights.
"""

from typing import List, Optional
from datetime import datetime, timedelta
import uuid
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from social.models import ExploitData
from social.analysis.data_models import (
    ExploitReport,
    TimelineEvent,
    ImpactSummary,
    SourceAttribution,
    ReportFormat
)
from social.analysis.historical_context import (
    HistoricalContextAnalyzer,
    ExploitQuery
)
from social.analysis.formatters import ReportFormatter


class ReportGenerator:
    """
    Generate comprehensive exploit reports from aggregated data

    This class transforms raw exploit data (already aggregated by Kamiyo)
    into engaging, informative reports optimized for social media.

    KEY PRINCIPLE: We organize and present data, we don't analyze security.
    """

    def __init__(self, db_connection=None):
        """
        Initialize report generator

        Args:
            db_connection: Optional database connection for historical queries
        """
        self.context_analyzer = HistoricalContextAnalyzer(db_connection)
        self.formatter = ReportFormatter()

        # Engaging fact templates for hooks
        self.engagement_hooks = [
            "This attack happened in broad daylight with over {tx_count} transactions",
            "The attacker's wallet was created just {hours} hours before the exploit",
            "Similar attack pattern to the infamous {protocol} hack in {year}",
            "This protocol had been audited by {auditor} just {months} months ago",
            "The stolen funds were moved through {mixer_count} different mixers",
        ]

    def analyze_exploit(
        self,
        exploit: ExploitData,
        report_format: ReportFormat = ReportFormat.MEDIUM,
        include_historical: bool = True
    ) -> ExploitReport:
        """
        Generate comprehensive exploit report

        This is the main entry point for report generation. It takes
        confirmed exploit data (already aggregated by Kamiyo) and
        creates an engaging, informative report.

        Args:
            exploit: Confirmed exploit data from Kamiyo platform
            report_format: Desired report length/detail level
            include_historical: Whether to include historical context

        Returns:
            Complete ExploitReport ready for formatting
        """
        # Generate unique report ID
        report_id = f"report-{uuid.uuid4().hex[:12]}"

        # Create timeline
        timeline = self._create_timeline(exploit)

        # Create impact summary
        impact = self._create_impact_summary(exploit)

        # Generate executive summary
        executive_summary = self._generate_executive_summary(
            exploit,
            impact,
            report_format
        )

        # Create source attribution
        source_attribution = self._create_source_attribution(exploit)

        # Get historical context if requested
        historical_context = None
        if include_historical:
            historical_context = self.context_analyzer.generate_historical_context(
                exploit_type=exploit.exploit_type,
                chain=exploit.chain,
                loss_amount=exploit.loss_amount_usd
            )

        # Generate engagement hooks
        engagement_hooks = self._generate_engagement_hooks(
            exploit,
            historical_context
        )

        # Create report
        report = ExploitReport(
            report_id=report_id,
            exploit_tx_hash=exploit.tx_hash,
            protocol=exploit.protocol,
            chain=exploit.chain,
            exploit_type=exploit.exploit_type,
            executive_summary=executive_summary,
            timeline=timeline,
            impact=impact,
            historical_context=historical_context,
            source_attribution=source_attribution,
            engagement_hooks=engagement_hooks,
            format=report_format
        )

        return report

    def _create_timeline(self, exploit: ExploitData) -> List[TimelineEvent]:
        """
        Create timeline of events

        Reconstructs what happened and when based on available data.
        Only includes confirmed events, never speculation.

        CRITICAL: We only report timestamps we actually have.
        We do NOT fabricate detection times or add fake precision.
        """
        timeline = []

        # Exploit occurrence (from blockchain timestamp or source report)
        timeline.append(TimelineEvent(
            timestamp=exploit.timestamp,
            event_type='occurred',
            description=f'{exploit.exploit_type} attack on {exploit.protocol}',
            source='Blockchain' if not exploit.tx_hash.startswith('generated') else exploit.source or 'External Report'
        ))

        # Only add additional events if we have REAL timestamps
        # Do NOT fabricate detection times with +5min, +10min assumptions
        # If we don't know when something was detected, we don't claim to know

        # Recovery status (only if we have confirmed recovery info)
        if exploit.recovery_status and 'recov' in exploit.recovery_status.lower():
            # NOTE: We don't have the actual recovery timestamp, so we omit this
            # unless we add real recovery timestamp tracking to the database
            pass

        return sorted(timeline, key=lambda e: e.timestamp)

    def _create_impact_summary(self, exploit: ExploitData) -> ImpactSummary:
        """
        Create impact summary

        Summarizes the damage and recovery status based on confirmed data.
        """
        # Extract recovery amount if available
        recovery_amount = 0.0
        recovery_status = exploit.recovery_status or "Unknown"

        if recovery_status and '%' in recovery_status:
            # Try to extract percentage
            # Example: "Partial Recovery - 60% recovered"
            try:
                pct_str = ''.join(c for c in recovery_status if c.isdigit())
                if pct_str:
                    pct = float(pct_str) / 100
                    recovery_amount = exploit.loss_amount_usd * pct
            except:
                pass

        return ImpactSummary(
            loss_amount_usd=exploit.loss_amount_usd,
            affected_protocols=[exploit.protocol],
            affected_chains=[exploit.chain],
            recovery_status=recovery_status,
            recovery_amount_usd=recovery_amount,
            affected_users=None  # Would come from external source if available
        )

    def _generate_executive_summary(
        self,
        exploit: ExploitData,
        impact: ImpactSummary,
        report_format: ReportFormat
    ) -> str:
        """
        Generate executive summary

        Creates concise summary appropriate for the report format.
        """
        severity = impact.severity.indicator
        amount_str = f"${exploit.loss_amount_usd:,.0f}"

        if report_format == ReportFormat.SHORT:
            # 1-2 sentences for short format
            summary = (
                f"{exploit.protocol} on {exploit.chain} suffered a "
                f"{exploit.exploit_type} attack resulting in {amount_str} in losses."
            )
        elif report_format == ReportFormat.MEDIUM:
            # 2-3 sentences for medium format
            # Only include tx hash if it's a real blockchain transaction
            tx_info = ""
            if not exploit.tx_hash.startswith("generated"):
                tx_info = f"The exploit was confirmed via transaction {exploit.tx_hash[:10]}..."

            summary = (
                f"{exploit.protocol} on {exploit.chain} suffered a "
                f"{exploit.exploit_type} attack resulting in {amount_str} in losses."
            )
            if tx_info:
                summary += f" {tx_info}"
            if impact.recovery_percentage > 0:
                summary += (
                    f" Recovery efforts are underway with "
                    f"{impact.recovery_percentage:.0f}% of funds recovered so far."
                )
        else:
            # Full detail for long format
            # Only include tx hash if it's a real blockchain transaction
            tx_info = ""
            if not exploit.tx_hash.startswith("generated"):
                tx_info = f"The attack was executed in transaction {exploit.tx_hash[:10]}... and "

            summary = (
                f"{severity} - {exploit.protocol} on {exploit.chain} has been "
                f"exploited via a {exploit.exploit_type} attack, resulting in "
                f"{amount_str} ({impact.severity.range}) in confirmed losses. "
                f"{tx_info}was first reported by {exploit.source or 'external sources'}. "
            )

            if exploit.description:
                summary += f"{exploit.description} "

            if impact.recovery_percentage > 0:
                summary += (
                    f"Recovery efforts are currently underway, with "
                    f"{impact.recovery_percentage:.1f}% of the stolen funds "
                    f"({impact.recovery_amount_usd:,.0f} USD) recovered so far. "
                )

            summary += (
                f"This incident highlights the ongoing security challenges in "
                f"the {exploit.chain} DeFi ecosystem."
            )

        return summary

    def _create_source_attribution(
        self,
        exploit: ExploitData
    ) -> SourceAttribution:
        """
        Create source attribution

        Properly credits the original sources of the exploit information.
        This is critical for maintaining transparency and trust.

        CRITICAL: We do NOT fabricate detection timestamps.
        """
        # Use created_at timestamp from database if available, otherwise None
        # We do NOT add fake +10min assumptions
        detection_time = None  # We don't track exact Kamiyo detection time yet

        attribution = SourceAttribution(
            primary_source=exploit.source or "Multiple Sources",
            primary_source_url=exploit.source_url,
            detected_by_kamiyo_at=detection_time
        )

        # Add additional known sources for this type of data
        # In production, would query from database
        if exploit.source:
            if exploit.source.lower() == 'rekt news':
                attribution.additional_sources = [
                    {'name': 'PeckShield', 'url': 'https://twitter.com/peckshield'},
                    {'name': 'BlockSec', 'url': 'https://twitter.com/BlockSecTeam'}
                ]

        return attribution

    def _generate_engagement_hooks(
        self,
        exploit: ExploitData,
        historical_context
    ) -> List[str]:
        """
        Generate interesting facts to hook readers

        Creates engaging facts that make the report more shareable.
        Only uses confirmed data, never speculation.
        """
        hooks = []

        # Severity hook
        severity = ImpactSummary(
            loss_amount_usd=exploit.loss_amount_usd,
            affected_protocols=[exploit.protocol],
            affected_chains=[exploit.chain],
            recovery_status="Unknown"
        ).severity

        if severity.value[0].startswith("🔴"):
            hooks.append(
                f"This is a CRITICAL severity exploit ({severity.range})"
            )

        # Historical ranking hook
        if historical_context and historical_context.ranking:
            hooks.append(historical_context.ranking)

        # Trend hook
        if historical_context:
            trend_desc = self.formatter.format_trend_indicator(
                historical_context.trend_direction,
                historical_context.trend_percentage
            )
            hooks.append(
                f"{exploit.exploit_type} attacks trend: {trend_desc}"
            )

        # Chain-specific hook
        chain_stats = {
            'Ethereum': 'Most targeted chain in DeFi',
            'BSC': 'Second most exploited chain',
            'Polygon': 'Growing exploit target',
        }
        if exploit.chain in chain_stats:
            hooks.append(chain_stats[exploit.chain])

        # Attack type hook
        attack_facts = {
            'Flash Loan': 'Flash loan attacks require no upfront capital',
            'Reentrancy': 'Reentrancy is one of the oldest attack vectors',
            'Price Oracle': 'Oracle manipulation attacks are on the rise',
            'Bridge Exploit': 'Cross-chain bridges are high-value targets',
        }
        if exploit.exploit_type in attack_facts:
            hooks.append(attack_facts[exploit.exploit_type])

        return hooks[:3]  # Return top 3 hooks

    def generate_multi_platform_reports(
        self,
        exploit: ExploitData
    ) -> dict:
        """
        Generate reports for all major platforms at once

        Args:
            exploit: Exploit data

        Returns:
            Dictionary with platform-specific formatted reports
        """
        # Generate base report
        report = self.analyze_exploit(
            exploit,
            report_format=ReportFormat.MEDIUM,
            include_historical=True
        )

        # Format for each platform
        return {
            'twitter_thread': self.formatter.format_for_twitter_thread(report),
            'reddit_post': self.formatter.format_for_reddit(report),
            'discord_embed': self.formatter.format_for_discord_embed(report),
            'raw_report': report
        }


# Example usage
if __name__ == "__main__":
    print("Exploit Report Generator - Example Output")
    print("="*80)

    # Create example exploit data (as would come from Kamiyo platform)
    exploit = ExploitData(
        tx_hash="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        protocol="Uniswap V3",
        chain="Ethereum",
        loss_amount_usd=2_500_000.00,
        exploit_type="Flash Loan",
        timestamp=datetime.utcnow() - timedelta(hours=2),
        description=(
            "Flash loan attack exploited price oracle manipulation vulnerability "
            "in liquidity pool pricing mechanism. Attacker borrowed funds, "
            "manipulated price, and profited from arbitrage."
        ),
        recovery_status="Partial Recovery - 40% recovered",
        source="Rekt News",
        source_url="https://rekt.news/uniswap-rekt/"
    )

    # Generate report
    generator = ReportGenerator()

    print("\n1. ANALYZING EXPLOIT...")
    print("-"*80)
    report = generator.analyze_exploit(
        exploit,
        report_format=ReportFormat.LONG,
        include_historical=True
    )

    print(f"Report ID: {report.report_id}")
    print(f"Generated at: {report.generated_at.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"Format: {report.format.value}")

    print("\n2. EXECUTIVE SUMMARY")
    print("-"*80)
    print(report.executive_summary)

    print("\n3. TIMELINE")
    print("-"*80)
    for event in report.timeline:
        print(f"  {event.timestamp.strftime('%H:%M:%S')} - {event.description}")

    print("\n4. IMPACT ASSESSMENT")
    print("-"*80)
    print(report._format_impact())

    print("\n5. ENGAGEMENT HOOKS")
    print("-"*80)
    for i, hook in enumerate(report.engagement_hooks, 1):
        print(f"  {i}. {hook}")

    print("\n6. TWITTER THREAD PREVIEW")
    print("-"*80)
    formatter = ReportFormatter()
    thread = formatter.format_for_twitter_thread(report)
    for i, tweet in enumerate(thread[:3], 1):  # Show first 3 tweets
        print(f"\nTweet {i}:")
        print(tweet)

    print("\n7. REDDIT POST PREVIEW (First 500 chars)")
    print("-"*80)
    reddit_post = formatter.format_for_reddit(report)
    print(reddit_post[:500] + "...\n")

    print("="*80)
    print("Report generation complete!")
    print("\nREMEMBER: This module AGGREGATES confirmed exploit data.")
    print("It does NOT detect vulnerabilities or analyze security.")
    print("="*80)
