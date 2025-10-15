# -*- coding: utf-8 -*-
"""
Social Analysis Module
Exploit report generation and analysis for social media

This module AGGREGATES and PRESENTS confirmed exploit data.
It follows CLAUDE.md principles:
- ✅ AGGREGATE confirmed exploit data
- ✅ ORGANIZE and PRESENT information clearly
- ❌ NO vulnerability detection or code analysis
- ❌ NO security scoring or exploit prediction
"""

from social.analysis.report_generator import ReportGenerator
from social.analysis.data_models import (
    ExploitReport,
    ReportSection,
    ReportFormat,
    SeverityLevel,
    TimelineEvent,
    ImpactSummary,
    RelatedExploit,
    HistoricalContext,
    SourceAttribution
)
from social.analysis.formatters import ReportFormatter
from social.analysis.historical_context import (
    HistoricalContextAnalyzer,
    ExploitQuery
)

__all__ = [
    # Main generator
    'ReportGenerator',

    # Data models
    'ExploitReport',
    'ReportSection',
    'ReportFormat',
    'SeverityLevel',
    'TimelineEvent',
    'ImpactSummary',
    'RelatedExploit',
    'HistoricalContext',
    'SourceAttribution',

    # Formatters
    'ReportFormatter',

    # Historical analysis
    'HistoricalContextAnalyzer',
    'ExploitQuery',
]

__version__ = '1.0.0'
__author__ = 'Kamiyo Intelligence Platform'
__description__ = 'Exploit intelligence aggregation and report generation for social media'
