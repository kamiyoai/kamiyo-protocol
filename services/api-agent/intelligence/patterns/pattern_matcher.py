#!/usr/bin/env python3
"""
Pattern Matcher - Auto-generated
Matches Solidity code against known exploit patterns
"""

import re
import json
from pathlib import Path

class PatternMatcher:
    def __init__(self):
        pattern_file = Path(__file__).parent / 'code_patterns.json'
        with open(pattern_file) as f:
            self.patterns = json.load(f)['patterns']

    def scan_contract(self, source_code):
        """Scan contract for exploit patterns"""
        matches = []

        for pattern in self.patterns:
            # Check for positive patterns
            positive_matches = []
            for regex in pattern['solidity_regex']:
                if re.search(regex, source_code, re.IGNORECASE):
                    positive_matches.append(regex)

            # Check for exclusion patterns
            has_exclusion = False
            for regex in pattern['exclusion_regex']:
                if re.search(regex, source_code, re.IGNORECASE):
                    has_exclusion = True
                    break

            # If positive match and no exclusion, flag it
            if positive_matches and not has_exclusion:
                matches.append({
                    'pattern_type': pattern['pattern_type'],
                    'severity': pattern['severity'],
                    'description': pattern['description'],
                    'matched_patterns': positive_matches,
                    'confidence': pattern['detection_confidence'],
                    'similar_exploits': pattern['historical_exploits']
                })

        return matches

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        with open(sys.argv[1]) as f:
            source = f.read()
        matcher = PatternMatcher()
        results = matcher.scan_contract(source)
        print(json.dumps(results, indent=2))
