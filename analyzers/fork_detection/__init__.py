# -*- coding: utf-8 -*-
"""
Fork Detection Module

Analyzes CONFIRMED exploited contracts to identify forks and code reuse.
"""

from .bytecode_analyzer import BytecodeAnalyzer, BytecodeFeatures
from .fork_detector import ForkDetector, ForkRelationship, get_fork_detector

__all__ = ['BytecodeAnalyzer', 'BytecodeFeatures', 'ForkDetector', 'ForkRelationship', 'get_fork_detector']
