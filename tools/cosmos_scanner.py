#!/usr/bin/env python3
"""
Cosmos/CosmWasm Security Scanner
Detects IBC vulnerabilities, storage issues, and message replay attacks
"""

import json
import os
import re
from pathlib import Path
from typing import Dict, List, Tuple
from dataclasses import dataclass, asdict
from enum import Enum

class Severity(Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"

class VulnerabilityType(Enum):
    IBC_REPLAY = "IBC Message Replay"
    STORAGE_MANIPULATION = "Storage Manipulation"
    MISSING_VALIDATION = "Missing Input Validation"
    REENTRANCY = "Cross-Contract Reentrancy"
    ACCESS_CONTROL = "Access Control Issue"
    INTEGER_OVERFLOW = "Integer Overflow/Underflow"
    UNCHECKED_ERRORS = "Unchecked Error Returns"

@dataclass
class CosmosVulnerability:
    vuln_type: VulnerabilityType
    severity: Severity
    file_path: str
    line_number: int
    code_snippet: str
    description: str
    recommendation: str
    confidence: float
    similar_exploits: List[str]

class CosmWasmScanner:
    def __init__(self, exploit_db_path: str = None):
        self.vulnerabilities = []
        self.exploit_db = []

        if exploit_db_path and os.path.exists(exploit_db_path):
            with open(exploit_db_path) as f:
                data = json.load(f)
                self.exploit_db = data if isinstance(data, list) else data.get('exploits', [])

        # Vulnerability patterns for CosmWasm/Rust
        self.patterns = {
            'ibc_replay': {
                'positive': [
                    r'IbcReceiveMsg',
                    r'ibc_packet_receive',
                    r'on_packet_receive',
                    r'packet\s*:\s*IbcPacket'
                ],
                'missing_protection': [
                    r'nonce',
                    r'msg_id',
                    r'packet_sequence',
                    r'timeout_timestamp'
                ],
                'severity': Severity.CRITICAL,
                'confidence': 0.75
            },
            'storage_manipulation': {
                'positive': [
                    r'deps\.storage\.save',
                    r'STORAGE\.save',
                    r'\.update\(',
                    r'\.load\(\)\.unwrap\(\)'
                ],
                'dangerous': [
                    r'\.unwrap\(\)',
                    r'unsafe\s+',
                    r'transmute',
                    r'from_raw'
                ],
                'severity': Severity.HIGH,
                'confidence': 0.70
            },
            'missing_validation': {
                'positive': [
                    r'ExecuteMsg',
                    r'InstantiateMsg',
                    r'pub\s+fn\s+execute',
                    r'pub\s+fn\s+instantiate'
                ],
                'missing': [
                    r'require!',
                    r'if\s+.*\s*\{',
                    r'match\s+',
                    r'\.is_empty\(\)',
                    r'\.is_none\(\)'
                ],
                'severity': Severity.MEDIUM,
                'confidence': 0.60
            },
            'access_control': {
                'positive': [
                    r'pub\s+fn\s+execute',
                    r'deps\.api\.addr_validate',
                    r'info\.sender'
                ],
                'missing_checks': [
                    r'ADMIN',
                    r'owner',
                    r'authorized',
                    r'require\(.*==.*sender'
                ],
                'severity': Severity.CRITICAL,
                'confidence': 0.80
            },
            'integer_overflow': {
                'positive': [
                    r'Uint128',
                    r'Uint256',
                    r'\+\s*',
                    r'\*\s*',
                    r'\-\s*'
                ],
                'protection': [
                    r'checked_add',
                    r'checked_sub',
                    r'checked_mul',
                    r'saturating_'
                ],
                'severity': Severity.HIGH,
                'confidence': 0.65
            },
            'reentrancy': {
                'positive': [
                    r'deps\.querier\.query',
                    r'WasmMsg::Execute',
                    r'BankMsg::Send',
                    r'CosmosMsg::'
                ],
                'state_update': [
                    r'\.save\(',
                    r'\.update\(',
                    r'STORAGE\.'
                ],
                'severity': Severity.HIGH,
                'confidence': 0.70
            }
        }

    def scan_file(self, file_path: str) -> List[CosmosVulnerability]:
        """Scan a single Rust/CosmWasm file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                lines = content.split('\n')

            # Skip test files
            if 'test' in file_path.lower() or 'mock' in file_path.lower():
                return []

            file_vulns = []

            # Check IBC replay vulnerabilities
            file_vulns.extend(self._check_ibc_replay(file_path, content, lines))

            # Check storage manipulation
            file_vulns.extend(self._check_storage_manipulation(file_path, content, lines))

            # Check missing validation
            file_vulns.extend(self._check_missing_validation(file_path, content, lines))

            # Check access control
            file_vulns.extend(self._check_access_control(file_path, content, lines))

            # Check integer overflow
            file_vulns.extend(self._check_integer_overflow(file_path, content, lines))

            # Check reentrancy
            file_vulns.extend(self._check_reentrancy(file_path, content, lines))

            return file_vulns

        except Exception as e:
            print(f"Error scanning {file_path}: {e}")
            return []

    def _check_ibc_replay(self, file_path: str, content: str, lines: List[str]) -> List[CosmosVulnerability]:
        """Check for IBC message replay vulnerabilities"""
        vulns = []
        pattern = self.patterns['ibc_replay']

        # Check if file handles IBC messages
        has_ibc = any(re.search(p, content) for p in pattern['positive'])
        if not has_ibc:
            return []

        # Check for replay protection
        has_protection = any(re.search(p, content) for p in pattern['missing_protection'])

        if not has_protection:
            # Find the IBC handler function
            for i, line in enumerate(lines):
                if any(re.search(p, line) for p in pattern['positive']):
                    vulns.append(CosmosVulnerability(
                        vuln_type=VulnerabilityType.IBC_REPLAY,
                        severity=pattern['severity'],
                        file_path=file_path,
                        line_number=i + 1,
                        code_snippet=line.strip(),
                        description="IBC message handler lacks nonce/sequence validation. " +
                                  "Attacker could replay messages across chains or timeout periods.",
                        recommendation="Implement packet sequence validation and nonce tracking. " +
                                     "Store processed packet hashes. Check timeout_timestamp.",
                        confidence=pattern['confidence'],
                        similar_exploits=self._find_similar_exploits('cross_chain_bridge')
                    ))
                    break

        return vulns

    def _check_storage_manipulation(self, file_path: str, content: str, lines: List[str]) -> List[CosmosVulnerability]:
        """Check for storage manipulation vulnerabilities"""
        vulns = []
        pattern = self.patterns['storage_manipulation']

        for i, line in enumerate(lines):
            # Check for storage operations
            if any(re.search(p, line) for p in pattern['positive']):
                # Check for dangerous operations
                if any(re.search(d, line) for d in pattern['dangerous']):
                    vulns.append(CosmosVulnerability(
                        vuln_type=VulnerabilityType.STORAGE_MANIPULATION,
                        severity=pattern['severity'],
                        file_path=file_path,
                        line_number=i + 1,
                        code_snippet=line.strip(),
                        description="Storage operation uses unsafe patterns (unwrap, unsafe, transmute). " +
                                  "Could lead to state corruption or panic.",
                        recommendation="Use proper error handling with Result types. " +
                                     "Avoid unwrap() in production. Validate data before storage.",
                        confidence=pattern['confidence'],
                        similar_exploits=[]
                    ))

        return vulns

    def _check_missing_validation(self, file_path: str, content: str, lines: List[str]) -> List[CosmosVulnerability]:
        """Check for missing input validation"""
        vulns = []
        pattern = self.patterns['missing_validation']

        # Find execute/instantiate functions
        for i, line in enumerate(lines):
            if any(re.search(p, line) for p in pattern['positive']):
                # Check next 10 lines for validation
                check_range = lines[i:min(i+10, len(lines))]
                has_validation = any(
                    any(re.search(v, check_line) for v in pattern['missing'])
                    for check_line in check_range
                )

                if not has_validation:
                    vulns.append(CosmosVulnerability(
                        vuln_type=VulnerabilityType.MISSING_VALIDATION,
                        severity=pattern['severity'],
                        file_path=file_path,
                        line_number=i + 1,
                        code_snippet=line.strip(),
                        description="Entry point function lacks input validation. " +
                                  "No checks for empty values, bounds, or malicious input.",
                        recommendation="Add validation: require!() checks, is_empty(), bounds checking. " +
                                     "Validate addresses with addr_validate(). Check amounts > 0.",
                        confidence=pattern['confidence'],
                        similar_exploits=self._find_similar_exploits('access_control')
                    ))

        return vulns

    def _check_access_control(self, file_path: str, content: str, lines: List[str]) -> List[CosmosVulnerability]:
        """Check for access control issues"""
        vulns = []
        pattern = self.patterns['access_control']

        for i, line in enumerate(lines):
            if any(re.search(p, line) for p in pattern['positive']):
                # Check for admin/owner checks
                check_range = lines[max(0, i-2):min(i+8, len(lines))]
                has_auth_check = any(
                    any(re.search(c, check_line) for c in pattern['missing_checks'])
                    for check_line in check_range
                )

                # If it's a privileged operation without checks
                if 'admin' in line.lower() or 'owner' in line.lower():
                    if not has_auth_check:
                        vulns.append(CosmosVulnerability(
                            vuln_type=VulnerabilityType.ACCESS_CONTROL,
                            severity=pattern['severity'],
                            file_path=file_path,
                            line_number=i + 1,
                            code_snippet=line.strip(),
                            description="Privileged function lacks sender validation. " +
                                      "Anyone could call admin/owner functions.",
                            recommendation="Add require!(info.sender == ADMIN) or load and check owner from storage. " +
                                         "Use proper access control patterns.",
                            confidence=pattern['confidence'],
                            similar_exploits=self._find_similar_exploits('access_control')
                        ))

        return vulns

    def _check_integer_overflow(self, file_path: str, content: str, lines: List[str]) -> List[CosmosVulnerability]:
        """Check for integer overflow vulnerabilities"""
        vulns = []
        pattern = self.patterns['integer_overflow']

        for i, line in enumerate(lines):
            # Check for arithmetic operations on Uint types
            if any(re.search(p, line) for p in pattern['positive'][:2]):  # Uint types
                if any(re.search(p, line) for p in pattern['positive'][2:]):  # Arithmetic
                    # Check for checked operations
                    if not any(re.search(p, line) for p in pattern['protection']):
                        # Avoid flagging simple assignments
                        if '=' in line and ('+' in line or '*' in line or '-' in line):
                            vulns.append(CosmosVulnerability(
                                vuln_type=VulnerabilityType.INTEGER_OVERFLOW,
                                severity=pattern['severity'],
                                file_path=file_path,
                                line_number=i + 1,
                                code_snippet=line.strip(),
                                description="Arithmetic operation on Uint types without overflow protection. " +
                                          "Could wrap around or panic.",
                                recommendation="Use checked_add(), checked_sub(), checked_mul() instead of +, -, *. " +
                                             "Or use saturating_* variants.",
                                confidence=pattern['confidence'],
                                similar_exploits=[]
                            ))

        return vulns

    def _check_reentrancy(self, file_path: str, content: str, lines: List[str]) -> List[CosmosVulnerability]:
        """Check for cross-contract reentrancy"""
        vulns = []
        pattern = self.patterns['reentrancy']

        # Find external calls
        for i, line in enumerate(lines):
            if any(re.search(p, line) for p in pattern['positive']):
                # Check if state was updated BEFORE the call
                prev_lines = lines[max(0, i-10):i]
                state_updated_before = any(
                    any(re.search(s, prev_line) for s in pattern['state_update'])
                    for prev_line in prev_lines
                )

                if not state_updated_before:
                    vulns.append(CosmosVulnerability(
                        vuln_type=VulnerabilityType.REENTRANCY,
                        severity=pattern['severity'],
                        file_path=file_path,
                        line_number=i + 1,
                        code_snippet=line.strip(),
                        description="External call before state update. " +
                                  "Vulnerable to cross-contract reentrancy attacks.",
                        recommendation="Follow checks-effects-interactions pattern. " +
                                     "Update all state BEFORE external calls/messages.",
                        confidence=pattern['confidence'],
                        similar_exploits=self._find_similar_exploits('reentrancy')
                    ))

        return vulns

    def _find_similar_exploits(self, pattern_type: str) -> List[str]:
        """Find similar historical exploits"""
        similar = []
        for exploit in self.exploit_db:
            if exploit.get('pattern') == pattern_type:
                similar.append(f"{exploit['id']} (${exploit['amount_usd']:,})")
        return similar[:3]  # Top 3

    def scan_protocol(self, protocol_path: str, protocol_name: str) -> Dict:
        """Scan entire Cosmos protocol"""
        results = {
            'protocol': protocol_name,
            'ecosystem': 'Cosmos/CosmWasm',
            'scanned_files': 0,
            'vulnerabilities': [],
            'risk_score': 0,
            'risk_level': 'LOW',
            'summary': {}
        }

        # Find all Rust files
        for root, dirs, files in os.walk(protocol_path):
            # Skip directories (but not 'tests' if it's a test file, we skip those in scan_file)
            if any(skip in root for skip in ['/target/', '/.git/', '/node_modules/', '/examples/']):
                continue

            for file in files:
                if file.endswith('.rs'):
                    file_path = os.path.join(root, file)
                    results['scanned_files'] += 1
                    vulns = self.scan_file(file_path)
                    results['vulnerabilities'].extend(vulns)

        # Calculate risk score
        severity_weights = {
            Severity.CRITICAL: 25,
            Severity.HIGH: 15,
            Severity.MEDIUM: 8,
            Severity.LOW: 3,
            Severity.INFO: 1
        }

        results['risk_score'] = sum(
            severity_weights[v.severity] for v in results['vulnerabilities']
        )

        # Risk level
        if results['risk_score'] >= 100:
            results['risk_level'] = 'CRITICAL'
        elif results['risk_score'] >= 50:
            results['risk_level'] = 'HIGH'
        elif results['risk_score'] >= 20:
            results['risk_level'] = 'MEDIUM'
        else:
            results['risk_level'] = 'LOW'

        # Summary by type
        for vuln in results['vulnerabilities']:
            vuln_type = vuln.vuln_type.value
            if vuln_type not in results['summary']:
                results['summary'][vuln_type] = {
                    'count': 0,
                    'severity': vuln.severity.value,
                    'avg_confidence': 0
                }
            results['summary'][vuln_type]['count'] += 1
            results['summary'][vuln_type]['avg_confidence'] += vuln.confidence

        # Average confidence
        for vuln_type in results['summary']:
            count = results['summary'][vuln_type]['count']
            if count > 0:
                results['summary'][vuln_type]['avg_confidence'] /= count
                results['summary'][vuln_type]['avg_confidence'] = round(
                    results['summary'][vuln_type]['avg_confidence'], 2
                )

        # Convert vulnerabilities to dict for JSON
        results['vulnerabilities'] = [
            {
                **asdict(v),
                'vuln_type': v.vuln_type.value,
                'severity': v.severity.value
            }
            for v in results['vulnerabilities']
        ]

        return results


def main():
    # Get absolute path and go up to project root
    base_dir = Path(__file__).resolve().parent.parent
    exploit_db = base_dir / 'intelligence/database/exploit_database.json'

    scanner = CosmWasmScanner(str(exploit_db) if exploit_db.exists() else None)

    # Protocols to scan
    protocols = [
        ('targets/sample-cosmwasm', 'Sample CosmWasm Contract'),
        ('targets/osmosis', 'Osmosis DEX'),
        ('targets/neutron', 'Neutron'),
        ('targets/cosmwasm', 'CosmWasm Core'),
    ]

    print("\n" + "="*70)
    print("COSMOS/COSMWASM SECURITY SCANNER")
    print("="*70 + "\n")

    all_results = []

    for path, name in protocols:
        full_path = base_dir / path
        if not full_path.exists():
            print(f"⚠️  {name} not found at {path}")
            continue

        print(f"Scanning {name}...")
        results = scanner.scan_protocol(str(full_path), name)
        all_results.append(results)

        print(f"  Files scanned: {results['scanned_files']}")
        print(f"  Vulnerabilities: {len(results['vulnerabilities'])}")
        print(f"  Risk score: {results['risk_score']} ({results['risk_level']})")
        print()

    # Save results
    output_dir = base_dir / 'intelligence/scans/cosmos'
    output_dir.mkdir(parents=True, exist_ok=True)

    for result in all_results:
        output_file = output_dir / f"{result['protocol'].lower().replace(' ', '_')}_cosmos_scan.json"
        with open(output_file, 'w') as f:
            json.dump(result, f, indent=2)
        print(f"📄 Saved: {output_file}")

    # Summary
    summary_file = output_dir / 'cosmos_scan_summary.json'
    with open(summary_file, 'w') as f:
        json.dump(all_results, f, indent=2)

    print(f"\n✅ Cosmos scan complete: {summary_file}")


if __name__ == '__main__':
    main()
