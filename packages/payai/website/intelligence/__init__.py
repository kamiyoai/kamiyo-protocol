"""
Intelligence Layer - Framework v13.0

Real-time market intelligence and competitive analysis

Modules:
- ExploitMonitor: Real-time exploit monitoring and pattern learning
- CompetitiveTracker: Competitive intelligence and opportunity identification
"""

from .exploit_monitor import ExploitMonitor, ExploitEvent, AnalysisResult
from .competitive_tracker import CompetitiveTracker, MarketIntelligence, ProtocolCompetition

__all__ = [
    'ExploitMonitor',
    'ExploitEvent',
    'AnalysisResult',
    'CompetitiveTracker',
    'MarketIntelligence',
    'ProtocolCompetition',
]
