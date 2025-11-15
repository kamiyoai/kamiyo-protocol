# -*- coding: utf-8 -*-
"""
KAMIYO Analyzers Module

Historical analysis of CONFIRMED exploits only.

IMPORTANT: These analyzers DO NOT:
- Detect vulnerabilities in arbitrary contracts
- Predict future exploits
- Provide security scores
- Scan code for bugs

They ONLY analyze confirmed historical exploits to find:
- Patterns and relationships
- Fork detection (code reuse)
- Clustering by characteristics
"""

from .base import BaseAnalyzer, ContractAnalyzer, PatternAnalyzer
from .fork_detection import BytecodeAnalyzer, get_fork_detector
from .pattern_recognition import (
    FeatureExtractor,
    get_feature_extractor,
    get_pattern_clusterer
)

__all__ = [
    'BaseAnalyzer',
    'ContractAnalyzer',
    'PatternAnalyzer',
    'BytecodeAnalyzer',
    'FeatureExtractor',
    'get_fork_detector',
    'get_feature_extractor',
    'get_pattern_clusterer',
]
