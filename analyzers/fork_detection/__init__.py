# -*- coding: utf-8 -*-
"""
Fork Detection Module

Analyzes CONFIRMED exploited contracts to identify forks and code reuse.
"""

from .bytecode_analyzer import BytecodeAnalyzer, BytecodeFeatures

__all__ = ['BytecodeAnalyzer', 'BytecodeFeatures']
