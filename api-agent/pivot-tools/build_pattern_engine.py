#!/usr/bin/env python3
"""
Agent 3: Pattern Extraction Engine
Extract code patterns from known exploits and match against new protocols
"""

import json
import re
from pathlib import Path
from datetime import datetime

class PatternEngine:
    """Extract and match exploit patterns"""

    def __init__(self):
        self.output_dir = Path('intelligence/patterns')
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.database_path = Path('intelligence/database/exploit_database.json')

    def extract_code_patterns(self):
        """Extract searchable code patterns from exploit database"""

        # Load exploit database
        if not self.database_path.exists():
            print("⚠️ Exploit database not found, using minimal patterns")
            database = {'exploits': []}
        else:
            with open(self.database_path) as f:
                database = json.load(f)

        patterns = []

        # Define code patterns for each attack type
        pattern_definitions = {
            'reentrancy': {
                'solidity_patterns': [
                    r'\.call\{value:',  # External call with value
                    r'\.transfer\(',  # Transfer before state update
                    r'\.send\(',  # Send before state update
                    r'function\s+\w+.*external.*\{[^}]*\.call',  # External function with call
                ],
                'anti_patterns': [
                    r'nonReentrant',  # Has reentrancy guard
                    r'ReentrancyGuard',  # Inherits guard
                ],
                'severity': 'CRITICAL',
                'description': 'Potential reentrancy vulnerability - external call before state update'
            },
            'oracle_manipulation': {
                'solidity_patterns': [
                    r'balanceOf\([^)]+\)\s*/\s*totalSupply',  # Price from reserves
                    r'getReserves\(',  # Uniswap-style reserves
                    r'\.price\(\)',  # Direct price query
                    r'latestAnswer\(',  # Chainlink without staleness check
                ],
                'anti_patterns': [
                    r'TWAP',  # Time-weighted average
                    r'twapPrice',
                    r'require.*timestamp',  # Staleness check
                ],
                'severity': 'CRITICAL',
                'description': 'Potential oracle manipulation - price from manipulatable source'
            },
            'access_control': {
                'solidity_patterns': [
                    r'delegatecall\([^)]*msg\.data',  # Delegatecall with user data
                    r'function\s+\w+.*public.*delegatecall',  # Public delegatecall
                    r'\.call\(msg\.data\)',  # Forward all data
                    r'function\s+initialize.*public',  # Public initialize
                ],
                'anti_patterns': [
                    r'onlyOwner',
                    r'require\(msg\.sender\s*==',  # Explicit access check
                    r'initializer',  # OpenZeppelin initializer modifier
                ],
                'severity': 'CRITICAL',
                'description': 'Potential access control issue - privileged operation without protection'
            },
            'flash_loan_price_manipulation': {
                'solidity_patterns': [
                    r'flashLoan',
                    r'balanceOf.*liquidat',  # Balance check in liquidation
                    r'totalSupply\(\).*shares',  # Share price calculation
                    r'function\s+donate',  # Donation function
                ],
                'anti_patterns': [
                    r'require.*minReturn',  # Minimum return check
                    r'balanceOf.*before',  # Before/after balance check
                ],
                'severity': 'HIGH',
                'description': 'Potential flash loan manipulation - price derived from manipulatable balance'
            },
            'cross_chain_bridge': {
                'solidity_patterns': [
                    r'verifyProof.*merkle',  # Merkle proof verification
                    r'ecrecover',  # Signature verification
                    r'function\s+relay.*Message',  # Message relay
                    r'executeMessage',  # Execute cross-chain message
                ],
                'anti_patterns': [
                    r'require.*threshold',  # Multi-sig threshold
                    r'nonce\[',  # Replay protection
                ],
                'severity': 'CRITICAL',
                'description': 'Potential bridge vulnerability - insufficient message validation'
            }
        }

        # Generate searchable patterns
        for pattern_type, config in pattern_definitions.items():
            pattern_entry = {
                'pattern_type': pattern_type,
                'severity': config['severity'],
                'description': config['description'],
                'solidity_regex': config['solidity_patterns'],
                'exclusion_regex': config['anti_patterns'],
                'historical_exploits': [
                    e['id'] for e in database.get('exploits', [])
                    if e.get('pattern') == pattern_type
                ],
                'detection_confidence': 0.7 if len(config['anti_patterns']) > 0 else 0.5
            }
            patterns.append(pattern_entry)

        # Save patterns
        pattern_db = {
            'version': '1.0',
            'last_updated': datetime.now().isoformat(),
            'total_patterns': len(patterns),
            'patterns': patterns
        }

        pattern_file = self.output_dir / 'code_patterns.json'
        with open(pattern_file, 'w') as f:
            json.dump(pattern_db, f, indent=2)

        print(f"✅ Extracted {len(patterns)} code patterns")
        print(f"   Saved to: {pattern_file}")

        return pattern_db

    def create_pattern_matcher(self):
        """Create pattern matching function"""

        matcher_code = '''#!/usr/bin/env python3
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
'''

        matcher_file = self.output_dir / 'pattern_matcher.py'
        matcher_file.write_text(matcher_code)
        matcher_file.chmod(0o755)

        print(f"✅ Created pattern matcher: {matcher_file}")

    def run(self):
        """Build pattern engine"""
        print("="*70)
        print("PATTERN ENGINE - AGENT 3")
        print("="*70)

        pattern_db = self.extract_code_patterns()
        self.create_pattern_matcher()

        print(f"\n✅ Pattern engine ready:")
        print(f"   Patterns: {pattern_db['total_patterns']}")
        print(f"   Matcher: intelligence/patterns/pattern_matcher.py")

if __name__ == '__main__':
    engine = PatternEngine()
    engine.run()
