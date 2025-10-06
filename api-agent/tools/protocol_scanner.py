#!/usr/bin/env python3
"""
Protocol Scanner - Exploit Intelligence Platform
Scans protocols against historical exploit patterns
"""

import json
import os
import sys
from pathlib import Path
from typing import Dict, List

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

class ProtocolScanner:
    def __init__(self, exploit_db_path: str, patterns_path: str):
        with open(exploit_db_path) as f:
            data = json.load(f)
            self.exploits = data if isinstance(data, list) else data.get('exploits', [])

        with open(patterns_path) as f:
            data = json.load(f)
            # Handle both formats: direct dict or nested under 'patterns'
            if isinstance(data, dict) and 'patterns' in data:
                self.patterns = {p['pattern_type']: p for p in data['patterns']}
            else:
                self.patterns = data

    def scan_protocol(self, protocol_path: str, protocol_name: str) -> Dict:
        """Scan protocol against exploit patterns"""
        results = {
            'protocol': protocol_name,
            'scanned_files': 0,
            'patterns_found': {},
            'risk_score': 0,
            'risk_level': 'LOW',
            'similar_exploits': [],
            'recommendations': []
        }

        # Scan all Solidity files
        for root, dirs, files in os.walk(protocol_path):
            # Skip test/mock directories
            if any(skip in root for skip in ['test', 'mock', 'node_modules', 'lib']):
                continue

            for file in files:
                if file.endswith('.sol'):
                    file_path = os.path.join(root, file)
                    self._scan_file(file_path, results)

        # Calculate risk score and level
        total_matches = sum(results['patterns_found'].values())
        results['risk_score'] = total_matches * 10

        if results['risk_score'] >= 100:
            results['risk_level'] = 'CRITICAL'
        elif results['risk_score'] >= 50:
            results['risk_level'] = 'HIGH'
        elif results['risk_score'] >= 20:
            results['risk_level'] = 'MEDIUM'

        # Find similar exploits
        self._find_similar_exploits(results)

        # Generate recommendations
        self._generate_recommendations(results)

        return results

    def _scan_file(self, file_path: str, results: Dict):
        """Scan a single file for patterns"""
        try:
            with open(file_path) as f:
                content = f.read()

            results['scanned_files'] += 1

            # Check each pattern category
            for pattern_name, pattern_data in self.patterns.items():
                matches = 0

                # Check positive patterns (handle both key names)
                pattern_list = pattern_data.get('solidity_patterns') or pattern_data.get('solidity_regex', [])
                for pattern in pattern_list:
                    if pattern in content:
                        matches += 1

                # Check for protections (anti-patterns)
                has_protection = False
                exclusion_list = pattern_data.get('anti_patterns') or pattern_data.get('exclusion_regex', [])
                for anti_pattern in exclusion_list:
                    if anti_pattern in content:
                        has_protection = True
                        break

                # Only count if no protection found
                if matches > 0 and not has_protection:
                    results['patterns_found'][pattern_name] = \
                        results['patterns_found'].get(pattern_name, 0) + matches

        except Exception as e:
            print(f"Error scanning {file_path}: {e}")

    def _find_similar_exploits(self, results: Dict):
        """Find historical exploits with similar patterns"""
        for pattern_name in results['patterns_found'].keys():
            for exploit in self.exploits:
                if exploit.get('pattern') == pattern_name:
                    results['similar_exploits'].append({
                        'name': exploit['id'],
                        'amount': f"${exploit['amount_usd']:,}",
                        'attack_type': exploit['attack_type']
                    })

    def _generate_recommendations(self, results: Dict):
        """Generate security recommendations"""
        if 'reentrancy' in results['patterns_found']:
            results['recommendations'].append(
                "Add ReentrancyGuard to functions with external calls"
            )

        if 'oracle_manipulation' in results['patterns_found']:
            results['recommendations'].append(
                "Implement TWAP oracle or use multiple price sources"
            )

        if 'flash_loan' in results['patterns_found']:
            results['recommendations'].append(
                "Add flash loan detection and protection mechanisms"
            )

        if 'access_control' in results['patterns_found']:
            results['recommendations'].append(
                "Review and strengthen access control modifiers"
            )

        if 'cross_chain_bridge' in results['patterns_found']:
            results['recommendations'].append(
                "Implement signature replay protection and proper nonce handling"
            )


def main():
    base_dir = Path(__file__).parent.parent

    # Paths
    exploit_db = base_dir / 'intelligence/database/exploit_database.json'
    patterns = base_dir / 'intelligence/patterns/code_patterns.json'

    scanner = ProtocolScanner(str(exploit_db), str(patterns))

    # Protocols to scan
    protocols = [
        ('targets/aave-v3-core', 'Aave V3'),
        ('targets/uniswap-v2-core', 'Uniswap V2'),
    ]

    all_results = []

    print("\n" + "="*70)
    print("EXPLOIT INTELLIGENCE PLATFORM - PROTOCOL SCANNER")
    print("="*70 + "\n")

    for path, name in protocols:
        full_path = base_dir / path
        if not full_path.exists():
            print(f"⚠️  {name} not found at {path}")
            continue

        print(f"Scanning {name}...")
        results = scanner.scan_protocol(str(full_path), name)
        all_results.append(results)

        print(f"  Files scanned: {results['scanned_files']}")
        print(f"  Risk score: {results['risk_score']} ({results['risk_level']})")
        print(f"  Patterns found: {len(results['patterns_found'])}")
        print(f"  Similar exploits: {len(results['similar_exploits'])}")
        print()

    # Save detailed results
    output_dir = base_dir / 'intelligence/scans'
    output_dir.mkdir(parents=True, exist_ok=True)

    for result in all_results:
        output_file = output_dir / f"{result['protocol'].lower().replace(' ', '_')}_scan.json"
        with open(output_file, 'w') as f:
            json.dump(result, f, indent=2)
        print(f"📄 Saved: {output_file}")

    # Save summary
    summary_file = output_dir / 'scan_summary.json'
    with open(summary_file, 'w') as f:
        json.dump(all_results, f, indent=2)

    print(f"\n✅ Summary saved: {summary_file}")
    print("\nView results:")
    print(f"  cat {summary_file}")


if __name__ == '__main__':
    main()
