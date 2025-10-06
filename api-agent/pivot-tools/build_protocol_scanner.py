#!/usr/bin/env python3
"""
Agent 4: Protocol Scanner
Scan protocols for known exploit patterns and generate risk reports
"""

import json
import sys
from pathlib import Path
from datetime import datetime

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

class ProtocolScanner:
    """Scan protocols for known exploit patterns"""

    def __init__(self):
        self.output_dir = Path('intelligence/scans')
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.pattern_dir = Path('intelligence/patterns')
        self.database_dir = Path('intelligence/database')

    def load_patterns(self):
        """Load pattern definitions"""
        pattern_file = self.pattern_dir / 'code_patterns.json'
        if not pattern_file.exists():
            print("⚠️ Pattern database not found")
            return None

        with open(pattern_file) as f:
            return json.load(f)

    def scan_protocol(self, protocol_path, protocol_name):
        """Scan a protocol for exploit patterns"""
        import re

        patterns = self.load_patterns()
        if not patterns:
            return None

        # Find all Solidity files
        contracts = list(Path(protocol_path).rglob('*.sol'))

        # Filter out test/mock/dependencies
        EXCLUDE_PATTERNS = [
            '**/test/**', '**/tests/**', '**/mocks/**', '**/mock/**',
            '**/dependencies/**', '**/node_modules/**', '**/lib/**'
        ]

        relevant_contracts = []
        for contract in contracts:
            path_str = str(contract)
            if not any(Path(path_str).match(pattern) for pattern in EXCLUDE_PATTERNS):
                relevant_contracts.append(contract)

        print(f"🔍 Scanning {protocol_name}")
        print(f"   Contracts: {len(relevant_contracts)} ({len(contracts) - len(relevant_contracts)} excluded)")

        # Scan each contract
        results = {}
        for contract in relevant_contracts:
            try:
                with open(contract) as f:
                    source = f.read()

                matches = []
                for pattern in patterns['patterns']:
                    # Check for positive patterns
                    positive_matches = []
                    for regex in pattern['solidity_regex']:
                        if re.search(regex, source, re.IGNORECASE):
                            positive_matches.append(regex)

                    # Check for exclusion patterns
                    has_exclusion = False
                    for regex in pattern['exclusion_regex']:
                        if re.search(regex, source, re.IGNORECASE):
                            has_exclusion = True
                            break

                    # If positive match and no exclusion, flag it
                    if positive_matches and not has_exclusion:
                        matches.append({
                            'pattern_type': pattern['pattern_type'],
                            'severity': pattern['severity'],
                            'description': pattern['description'],
                            'matched_patterns': positive_matches[:3],  # Limit output
                            'confidence': pattern['detection_confidence'],
                            'similar_exploits': pattern['historical_exploits'][:3]  # Top 3
                        })

                if matches:
                    results[str(contract.relative_to(protocol_path))] = matches

            except Exception as e:
                continue

        return {
            'protocol': protocol_name,
            'scan_timestamp': datetime.now().isoformat(),
            'total_contracts': len(relevant_contracts),
            'contracts_with_patterns': len(results),
            'findings': results
        }

    def generate_risk_report(self, scan_result):
        """Generate risk assessment report"""

        if not scan_result['findings']:
            return None

        # Aggregate by pattern type
        pattern_summary = {}
        for contract, findings in scan_result['findings'].items():
            for finding in findings:
                pattern_type = finding['pattern_type']
                if pattern_type not in pattern_summary:
                    pattern_summary[pattern_type] = {
                        'count': 0,
                        'contracts': [],
                        'severity': finding['severity'],
                        'similar_exploits': finding['similar_exploits']
                    }
                pattern_summary[pattern_type]['count'] += 1
                if contract not in pattern_summary[pattern_type]['contracts']:
                    pattern_summary[pattern_type]['contracts'].append(contract)

        # Calculate risk score
        severity_weights = {'CRITICAL': 10, 'HIGH': 5, 'MEDIUM': 2, 'LOW': 1}
        risk_score = sum(
            severity_weights.get(p['severity'], 1) * p['count']
            for p in pattern_summary.values()
        )

        report = {
            'protocol': scan_result['protocol'],
            'risk_score': risk_score,
            'risk_level': 'CRITICAL' if risk_score > 50 else 'HIGH' if risk_score > 20 else 'MEDIUM',
            'pattern_summary': pattern_summary,
            'recommendations': self.generate_recommendations(pattern_summary),
            'similar_historical_exploits': self.find_similar_exploits(pattern_summary)
        }

        return report

    def generate_recommendations(self, pattern_summary):
        """Generate specific recommendations"""
        recommendations = []

        for pattern_type, data in pattern_summary.items():
            if pattern_type == 'reentrancy':
                recommendations.append({
                    'pattern': pattern_type,
                    'action': 'Add ReentrancyGuard modifier to affected functions',
                    'priority': 'CRITICAL',
                    'affected_contracts': data['contracts'][:3]
                })
            elif pattern_type == 'oracle_manipulation':
                recommendations.append({
                    'pattern': pattern_type,
                    'action': 'Implement TWAP oracle or multi-source price validation',
                    'priority': 'CRITICAL',
                    'affected_contracts': data['contracts'][:3]
                })
            elif pattern_type == 'access_control':
                recommendations.append({
                    'pattern': pattern_type,
                    'action': 'Add proper access control modifiers (onlyOwner, etc.)',
                    'priority': 'CRITICAL',
                    'affected_contracts': data['contracts'][:3]
                })

        return recommendations

    def find_similar_exploits(self, pattern_summary):
        """Find historical exploits with same patterns"""
        # Load exploit database
        db_file = self.database_dir / 'exploit_database.json'
        if not db_file.exists():
            return []

        with open(db_file) as f:
            database = json.load(f)

        similar = []
        for pattern_type in pattern_summary.keys():
            for exploit in database['exploits']:
                if exploit['pattern'] == pattern_type:
                    similar.append({
                        'exploit': exploit['protocol'],
                        'amount_usd': exploit['amount_usd'],
                        'pattern': pattern_type,
                        'date': exploit['date']
                    })

        return sorted(similar, key=lambda x: x['amount_usd'], reverse=True)[:5]

    def scan_demo_protocols(self):
        """Scan demo protocols from experiment"""
        demo_protocols = [
            ('targets/aave-v3-core', 'Aave V3'),
            ('targets/uniswap-v3-core', 'Uniswap V3'),
            ('targets/compound-v3', 'Compound V3'),
        ]

        all_reports = []

        for protocol_path, protocol_name in demo_protocols:
            if not Path(protocol_path).exists():
                print(f"⚠️ {protocol_name} not found, skipping")
                continue

            scan_result = self.scan_protocol(protocol_path, protocol_name)
            if scan_result:
                report = self.generate_risk_report(scan_result)

                # Save individual scan
                scan_file = self.output_dir / f'{protocol_name.lower().replace(" ", "_")}_scan.json'
                with open(scan_file, 'w') as f:
                    json.dump(scan_result, f, indent=2)

                if report:
                    # Save risk report
                    report_file = self.output_dir / f'{protocol_name.lower().replace(" ", "_")}_risk_report.json'
                    with open(report_file, 'w') as f:
                        json.dump(report, f, indent=2)

                    all_reports.append(report)
                    print(f"✅ {protocol_name}: Risk Score {report['risk_score']} ({report['risk_level']})")
                else:
                    print(f"✅ {protocol_name}: No patterns detected")

        return all_reports

    def run(self):
        """Run protocol scanner"""
        print("="*70)
        print("PROTOCOL SCANNER - AGENT 4")
        print("="*70)

        reports = self.scan_demo_protocols()

        if reports:
            # Generate summary
            summary = {
                'total_protocols_scanned': len(reports),
                'reports': reports
            }

            summary_file = self.output_dir / 'scan_summary.json'
            with open(summary_file, 'w') as f:
                json.dump(summary, f, indent=2)

            print(f"\n✅ Scanner complete:")
            print(f"   Protocols scanned: {len(reports)}")
            print(f"   Summary: {summary_file}")
        else:
            print("\n⚠️ No protocols scanned (files not found)")

if __name__ == '__main__':
    scanner = ProtocolScanner()
    scanner.run()
