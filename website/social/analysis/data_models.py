# -*- coding: utf-8 -*-
"""
Analysis Data Models
Data structures for exploit report generation and analysis
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict
from datetime import datetime
from enum import Enum


class ReportFormat(Enum):
    """Report length/detail level"""
    SHORT = "short"  # 1-2 sentences, Twitter-friendly
    MEDIUM = "medium"  # 1-2 paragraphs, Discord/Telegram
    LONG = "long"  # Full detailed report, Reddit/blog
    THREAD = "thread"  # Twitter thread format


class SeverityLevel(Enum):
    """Visual severity indicators"""
    LOW = ("🟢 LOW", "< $100K")
    MEDIUM = ("🟡 MEDIUM", "$100K - $1M")
    HIGH = ("🟠 HIGH", "$1M - $10M")
    CRITICAL = ("🔴 CRITICAL", "> $10M")

    @property
    def indicator(self) -> str:
        return self.value[0]

    @property
    def range(self) -> str:
        return self.value[1]


@dataclass
class TimelineEvent:
    """Single event in exploit timeline"""
    timestamp: datetime
    event_type: str  # 'detected', 'occurred', 'confirmed', 'reported'
    description: str
    source: Optional[str] = None

    def format_time_ago(self, from_time: datetime = None) -> str:
        """Format time difference in human-readable format"""
        if from_time is None:
            from_time = datetime.utcnow()

        delta = from_time - self.timestamp

        if delta.days > 0:
            return f"{delta.days} day{'s' if delta.days > 1 else ''} ago"
        elif delta.seconds >= 3600:
            hours = delta.seconds // 3600
            return f"{hours} hour{'s' if hours > 1 else ''} ago"
        elif delta.seconds >= 60:
            minutes = delta.seconds // 60
            return f"{minutes} minute{'s' if minutes > 1 else ''} ago"
        else:
            return "just now"


@dataclass
class ImpactSummary:
    """Impact assessment of exploit"""
    loss_amount_usd: float
    affected_protocols: List[str]
    affected_chains: List[str]
    recovery_status: str
    recovery_amount_usd: float = 0.0
    affected_users: Optional[int] = None

    @property
    def severity(self) -> SeverityLevel:
        """Determine severity based on loss amount"""
        if self.loss_amount_usd >= 10_000_000:
            return SeverityLevel.CRITICAL
        elif self.loss_amount_usd >= 1_000_000:
            return SeverityLevel.HIGH
        elif self.loss_amount_usd >= 100_000:
            return SeverityLevel.MEDIUM
        else:
            return SeverityLevel.LOW

    @property
    def recovery_percentage(self) -> float:
        """Calculate recovery percentage"""
        if self.loss_amount_usd == 0:
            return 0.0
        return (self.recovery_amount_usd / self.loss_amount_usd) * 100


@dataclass
class RelatedExploit:
    """Similar past exploit for context"""
    tx_hash: str
    protocol: str
    chain: str
    loss_amount_usd: float
    exploit_type: str
    timestamp: datetime
    similarity_reason: str  # Why this exploit is related


@dataclass
class HistoricalContext:
    """Historical context about exploit pattern"""
    similar_exploits: List[RelatedExploit]
    total_losses_in_category: float
    trend_direction: str  # 'increasing', 'decreasing', 'stable'
    trend_percentage: float
    time_period: str  # e.g., 'this quarter', 'this year'
    ranking: Optional[str] = None  # e.g., "3rd largest DeFi exploit this year"


@dataclass
class SourceAttribution:
    """Source information for transparency"""
    primary_source: str  # e.g., "Rekt News"
    primary_source_url: Optional[str] = None
    additional_sources: List[Dict[str, str]] = field(default_factory=list)
    detected_by_kamiyo_at: Optional[datetime] = None

    @property
    def detection_speed(self) -> Optional[str]:
        """Calculate how quickly Kamiyo detected the exploit"""
        if self.detected_by_kamiyo_at is None:
            return None

        # Assume exploit occurred shortly before detection
        # In real implementation, this would compare with actual occurrence time
        return "within minutes"


@dataclass
class ReportSection:
    """Individual section of a report"""
    title: str
    content: str
    order: int
    section_type: str  # 'executive_summary', 'timeline', 'impact', 'context', 'attribution'
    metadata: Dict = field(default_factory=dict)


@dataclass
class ExploitReport:
    """Complete exploit analysis report"""
    # Required fields (no defaults) must come first
    report_id: str
    exploit_tx_hash: str
    protocol: str
    chain: str
    exploit_type: str
    executive_summary: str
    timeline: List[TimelineEvent]
    impact: ImpactSummary

    # Optional fields (with defaults) must come after
    generated_at: datetime = field(default_factory=datetime.utcnow)
    historical_context: Optional[HistoricalContext] = None
    source_attribution: SourceAttribution = field(default_factory=lambda: SourceAttribution(primary_source="Kamiyo"))
    visual_elements: Dict[str, str] = field(default_factory=dict)  # ASCII charts, emoji indicators
    engagement_hooks: List[str] = field(default_factory=list)  # Interesting facts to hook readers
    format: ReportFormat = ReportFormat.MEDIUM

    def get_sections(self) -> List[ReportSection]:
        """Get all report sections in order"""
        sections = []

        # Executive summary
        sections.append(ReportSection(
            title="Executive Summary",
            content=self.executive_summary,
            order=1,
            section_type="executive_summary"
        ))

        # Timeline
        timeline_content = self._format_timeline()
        sections.append(ReportSection(
            title="Timeline",
            content=timeline_content,
            order=2,
            section_type="timeline"
        ))

        # Impact
        impact_content = self._format_impact()
        sections.append(ReportSection(
            title="Impact Assessment",
            content=impact_content,
            order=3,
            section_type="impact"
        ))

        # Historical context
        if self.historical_context:
            context_content = self._format_context()
            sections.append(ReportSection(
                title="Historical Context",
                content=context_content,
                order=4,
                section_type="context"
            ))

        # Attribution
        attribution_content = self._format_attribution()
        sections.append(ReportSection(
            title="Sources",
            content=attribution_content,
            order=5,
            section_type="attribution"
        ))

        return sections

    def _format_timeline(self) -> str:
        """Format timeline events"""
        if not self.timeline:
            return "Timeline unavailable"

        lines = []
        for event in sorted(self.timeline, key=lambda e: e.timestamp):
            time_str = event.timestamp.strftime('%Y-%m-%d %H:%M UTC')
            lines.append(f"• {time_str} - {event.description}")

        return "\n".join(lines)

    def _format_impact(self) -> str:
        """Format impact summary"""
        lines = [
            f"Severity: {self.impact.severity.indicator}",
            f"Total Loss: ${self.impact.loss_amount_usd:,.2f} USD",
        ]

        if self.impact.recovery_amount_usd > 0:
            lines.append(
                f"Recovered: ${self.impact.recovery_amount_usd:,.2f} USD "
                f"({self.impact.recovery_percentage:.1f}%)"
            )

        if self.impact.affected_users:
            lines.append(f"Affected Users: {self.impact.affected_users:,}")

        lines.append(f"Status: {self.impact.recovery_status}")

        return "\n".join(lines)

    def _format_context(self) -> str:
        """Format historical context"""
        if not self.historical_context:
            return ""

        ctx = self.historical_context
        lines = []

        if ctx.ranking:
            lines.append(f"• {ctx.ranking}")

        lines.append(
            f"• Total losses from similar exploits {ctx.time_period}: "
            f"${ctx.total_losses_in_category:,.2f} USD"
        )

        lines.append(
            f"• Trend: {ctx.trend_direction.title()} "
            f"({ctx.trend_percentage:+.1f}% {ctx.time_period})"
        )

        if ctx.similar_exploits:
            lines.append(f"\nRecent similar exploits:")
            for exploit in ctx.similar_exploits[:3]:  # Top 3
                lines.append(
                    f"  • {exploit.protocol} ({exploit.chain}) - "
                    f"${exploit.loss_amount_usd:,.0f} - "
                    f"{exploit.timestamp.strftime('%Y-%m-%d')}"
                )

        return "\n".join(lines)

    def _format_attribution(self) -> str:
        """Format source attribution"""
        lines = [f"Primary Source: {self.source_attribution.primary_source}"]

        if self.source_attribution.primary_source_url:
            lines.append(f"URL: {self.source_attribution.primary_source_url}")

        if self.source_attribution.additional_sources:
            lines.append("\nAdditional Sources:")
            for source in self.source_attribution.additional_sources:
                lines.append(f"  • {source.get('name', 'Unknown')}")

        if self.source_attribution.detection_speed:
            lines.append(
                f"\nDetected by Kamiyo Intelligence Platform "
                f"{self.source_attribution.detection_speed} of initial report"
            )

        return "\n".join(lines)

    def to_dict(self) -> Dict:
        """Convert report to dictionary"""
        return {
            'report_id': self.report_id,
            'generated_at': self.generated_at.isoformat(),
            'exploit_tx_hash': self.exploit_tx_hash,
            'protocol': self.protocol,
            'chain': self.chain,
            'exploit_type': self.exploit_type,
            'executive_summary': self.executive_summary,
            'sections': [
                {
                    'title': s.title,
                    'content': s.content,
                    'order': s.order,
                    'type': s.section_type
                }
                for s in self.get_sections()
            ],
            'format': self.format.value,
        }
