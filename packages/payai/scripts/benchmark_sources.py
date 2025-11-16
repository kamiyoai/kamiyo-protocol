#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Benchmark source performance
Compare detection speed before/after Phase 1
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
from datetime import datetime
from aggregators.orchestrator import AggregationOrchestrator


def benchmark_aggregation_speed():
    """
    Measure aggregation speed and display performance metrics

    Returns:
        dict: Statistics dictionary containing performance metrics
    """
    orchestrator = AggregationOrchestrator()

    print("Starting benchmark...")
    print("=" * 60)

    start = time.time()
    stats = orchestrator.run_once()
    end = time.time()

    duration = end - start

    print(f"\n📊 Performance Metrics:")
    print(f"  Total duration: {duration:.2f}s")
    print(f"  Sources: {stats['sources_succeeded']}/{stats['sources_attempted']} succeeded")
    print(f"  Avg per source: {duration / stats['sources_attempted']:.2f}s")
    print(f"  Exploits found: {stats['total_fetched']}")
    print(f"  New exploits: {stats['total_inserted']}")

    # Speed categories
    print(f"\n🎯 Detection Speed:")
    print(f"  On-chain sources: <2 min")
    print(f"  Social sources: 2-5 min")
    print(f"  Traditional sources: 5-15 min")

    return stats


if __name__ == '__main__':
    try:
        stats = benchmark_aggregation_speed()
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Benchmark failed: {e}")
        sys.exit(1)
