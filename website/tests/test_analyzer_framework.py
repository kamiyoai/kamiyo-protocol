#!/usr/bin/env python3
"""
Test analyzer framework functionality
Verifies analyzers can be imported and instantiated
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_imports():
    """Test that all analyzer modules can be imported"""
    print("\n" + "="*60)
    print("ANALYZER FRAMEWORK - IMPORT TESTS")
    print("="*60)

    tests_passed = 0
    tests_failed = 0

    # Test base module
    try:
        from analyzers import base
        print("✓ analyzers.base imported")
        tests_passed += 1
    except Exception as e:
        print(f"✗ analyzers.base import failed: {e}")
        tests_failed += 1

    # Test fork detection modules
    try:
        from analyzers.fork_detection import bytecode_analyzer
        print("✓ analyzers.fork_detection.bytecode_analyzer imported")
        tests_passed += 1
    except Exception as e:
        print(f"✗ analyzers.fork_detection.bytecode_analyzer import failed: {e}")
        tests_failed += 1

    try:
        from analyzers.fork_detection import fork_detector
        print("✓ analyzers.fork_detection.fork_detector imported")
        tests_passed += 1
    except Exception as e:
        print(f"✗ analyzers.fork_detection.fork_detector import failed: {e}")
        tests_failed += 1

    # Test pattern recognition modules
    try:
        from analyzers.pattern_recognition import feature_extractor
        print("✓ analyzers.pattern_recognition.feature_extractor imported")
        tests_passed += 1
    except Exception as e:
        print(f"✗ analyzers.pattern_recognition.feature_extractor import failed: {e}")
        tests_failed += 1

    try:
        from analyzers.pattern_recognition import pattern_clusterer
        print("✓ analyzers.pattern_recognition.pattern_clusterer imported")
        tests_passed += 1
    except Exception as e:
        print(f"✗ analyzers.pattern_recognition.pattern_clusterer import failed: {e}")
        tests_failed += 1

    # Test package-level imports
    try:
        from analyzers import get_fork_detector, get_feature_extractor, get_pattern_clusterer
        print("✓ Package-level factory functions imported")
        tests_passed += 1
    except Exception as e:
        print(f"✗ Package-level factory functions import failed: {e}")
        tests_failed += 1

    return tests_passed, tests_failed


def test_instantiation():
    """Test that analyzers can be instantiated"""
    print("\n" + "="*60)
    print("ANALYZER FRAMEWORK - INSTANTIATION TESTS")
    print("="*60)

    tests_passed = 0
    tests_failed = 0

    try:
        from analyzers import get_fork_detector

        detector = get_fork_detector()
        if detector is not None:
            print(f"✓ ForkDetector instantiated: {type(detector).__name__}")
            tests_passed += 1
        else:
            print("✗ ForkDetector returned None")
            tests_failed += 1
    except Exception as e:
        print(f"✗ ForkDetector instantiation failed: {e}")
        tests_failed += 1

    try:
        from analyzers import get_feature_extractor

        extractor = get_feature_extractor()
        if extractor is not None:
            print(f"✓ FeatureExtractor instantiated: {type(extractor).__name__}")
            tests_passed += 1
        else:
            print("✗ FeatureExtractor returned None")
            tests_failed += 1
    except Exception as e:
        print(f"✗ FeatureExtractor instantiation failed: {e}")
        tests_failed += 1

    try:
        from analyzers import get_pattern_clusterer

        clusterer = get_pattern_clusterer()
        if clusterer is not None:
            print(f"✓ PatternClusterer instantiated: {type(clusterer).__name__}")
            tests_passed += 1
        else:
            print("✗ PatternClusterer returned None")
            tests_failed += 1
    except Exception as e:
        print(f"✗ PatternClusterer instantiation failed: {e}")
        tests_failed += 1

    return tests_passed, tests_failed


def test_basic_functionality():
    """Test basic analyzer functionality"""
    print("\n" + "="*60)
    print("ANALYZER FRAMEWORK - BASIC FUNCTIONALITY TESTS")
    print("="*60)

    tests_passed = 0
    tests_failed = 0

    # Test that analyzers have required methods
    try:
        from analyzers import get_fork_detector

        detector = get_fork_detector()

        # Check for required methods
        required_methods = ['analyze', 'build_fork_graph', 'find_fork_family']
        for method in required_methods:
            if hasattr(detector, method):
                print(f"✓ ForkDetector has method '{method}'")
                tests_passed += 1
            else:
                print(f"✗ ForkDetector missing method '{method}'")
                tests_failed += 1

    except Exception as e:
        print(f"✗ ForkDetector method check failed: {e}")
        tests_failed += 3

    try:
        from analyzers import get_feature_extractor

        extractor = get_feature_extractor()

        # Check for required methods
        required_methods = ['analyze', 'extract_features']
        for method in required_methods:
            if hasattr(extractor, method):
                print(f"✓ FeatureExtractor has method '{method}'")
                tests_passed += 1
            else:
                print(f"✗ FeatureExtractor missing method '{method}'")
                tests_failed += 1

    except Exception as e:
        print(f"✗ FeatureExtractor method check failed: {e}")
        tests_failed += 2

    try:
        from analyzers import get_pattern_clusterer

        clusterer = get_pattern_clusterer()

        # Check for required methods
        required_methods = ['analyze', 'cluster_exploits', 'find_pattern_anomalies']
        for method in required_methods:
            if hasattr(clusterer, method):
                print(f"✓ PatternClusterer has method '{method}'")
                tests_passed += 1
            else:
                print(f"✗ PatternClusterer missing method '{method}'")
                tests_failed += 1

    except Exception as e:
        print(f"✗ PatternClusterer method check failed: {e}")
        tests_failed += 3

    return tests_passed, tests_failed


def test_database_connection():
    """Test that analyzers can connect to database"""
    print("\n" + "="*60)
    print("ANALYZER FRAMEWORK - DATABASE CONNECTION TESTS")
    print("="*60)

    tests_passed = 0
    tests_failed = 0

    try:
        from analyzers.base import BaseAnalyzer
        from database import get_db

        # Get database instance
        db = get_db()

        # Check connection
        if db is not None:
            print("✓ Database instance available")
            tests_passed += 1

            # Test basic query
            try:
                total = db.get_total_exploits()
                print(f"✓ Database query successful: {total} exploits")
                tests_passed += 1
            except Exception as e:
                print(f"✗ Database query failed: {e}")
                tests_failed += 1
        else:
            print("✗ Database instance is None")
            tests_failed += 1

    except Exception as e:
        print(f"✗ Database connection test failed: {e}")
        tests_failed += 2

    return tests_passed, tests_failed


def main():
    """Run all analyzer framework tests"""
    total_passed = 0
    total_failed = 0

    # Run tests
    passed, failed = test_imports()
    total_passed += passed
    total_failed += failed

    passed, failed = test_instantiation()
    total_passed += passed
    total_failed += failed

    passed, failed = test_basic_functionality()
    total_passed += passed
    total_failed += failed

    passed, failed = test_database_connection()
    total_passed += passed
    total_failed += failed

    # Print summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"✓ Passed: {total_passed}")
    print(f"✗ Failed: {total_failed}")
    print(f"Total: {total_passed + total_failed}")

    if total_failed == 0:
        print("\n🎉 ALL TESTS PASSED!")
        return True
    else:
        print(f"\n⚠️  {total_failed} TEST(S) FAILED")
        return False


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
