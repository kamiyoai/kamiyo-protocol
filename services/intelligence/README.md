# Vulnerability Intelligence Database

## Overview

This directory contains a comprehensive blockchain vulnerability intelligence system covering multiple virtual machines and ecosystems:

- **Cosmos/CosmWasm** - IBC security, storage safety, access control
- **Move (Aptos/Sui)** - Resource safety, capability patterns, type constraints
- **Cairo/StarkNet** - Felt arithmetic, hints, account abstraction, L1↔L2 messaging
- **Substrate/Polkadot** - Ink! contracts, XCM, runtime upgrades, pallets

## Database Structure

### Main Files

- **`vulnerability_database.json`** - Primary vulnerability pattern database
- **`database/exploit_database.json`** - Historical exploit data with CVE references
- **`patterns/code_patterns.json`** - Code pattern matching rules

### Vulnerability Database Schema

```json
{
  "version": "3.0",
  "generated_at": "ISO-8601 timestamp",
  "description": "Database description",
  "statistics": {
    "total_patterns": 25,
    "by_vm_type": {...},
    "by_severity": {...},
    "by_category": {...},
    "chains_covered": [...],
    "cwe_mapped": 24
  },
  "vulnerability_patterns": [
    {
      "id": "COSMOS-001",
      "name": "IBC Message Replay Attack",
      "vm_type": "Cosmos/CosmWasm",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW | INFO",
      "category": "Cross-Chain Security | Access Control | ...",
      "description": "High-level vulnerability description",
      "technical_details": "Deep technical explanation",
      "vulnerable_code_example": "Code showing the vulnerability",
      "secure_code_example": "Code showing the fix",
      "detection_patterns": ["regex patterns for detection"],
      "remediation": "How to fix",
      "cwe_id": "CWE-XXX",
      "cve_references": ["CVE-YYYY-XXXX"],
      "real_world_exploits": [
        {
          "protocol": "Protocol Name",
          "date": "YYYY-MM-DD",
          "impact": "Description",
          "amount_usd": 0
        }
      ],
      "affected_chains": ["Chain1", "Chain2"],
      "confidence_score": 0.75
    }
  ],
  "real_world_exploits": [...]
}
```

## Coverage Statistics

### VM Type Distribution
- **Cosmos/CosmWasm**: 8 patterns
- **Move (Aptos/Sui)**: 6 patterns
- **Cairo/StarkNet**: 5 patterns
- **Substrate/Polkadot**: 6 patterns

### Severity Distribution
- **CRITICAL**: 12 patterns (48%)
- **HIGH**: 11 patterns (44%)
- **MEDIUM**: 2 patterns (8%)

### Category Coverage
- Cross-Chain Security: 3 patterns
- Access Control: 4 patterns
- Arithmetic Safety: 4 patterns
- Reentrancy: 3 patterns
- DEX/AMM: 1 pattern
- Logic Vulnerability: 1 pattern
- Denial of Service: 2 patterns
- Resource Safety: 1 pattern
- Type Safety: 1 pattern
- Prover Security: 1 pattern
- Account Security: 1 pattern
- Cross-Layer Security: 1 pattern
- Governance: 1 pattern
- Randomness: 1 pattern

### Blockchain Coverage
16 chains/ecosystems covered:
- All CosmWasm chains, All Cosmos chains, All IBC-enabled chains
- All Ink! platforms, All Substrate chains, All Substrate/Ink! chains, All XCM-enabled parachains
- Aptos, Sui
- Injective, Neutron, Osmosis
- Kusama, Polkadot
- StarkNet, StarkNet (Cairo 0)

## How to Add New Vulnerabilities

### Option 1: Using the Generator (Recommended)

1. **Edit the generator**: `/Users/dennisgoslar/Projekter/exploit-intel-platform/tools/generate_vuln_database.py`

2. **Add pattern to appropriate VM type function**:

```python
def generate_cosmos_patterns(self) -> List[VulnerabilityPattern]:
    patterns = []

    patterns.append(VulnerabilityPattern(
        id="COSMOS-009",  # Increment ID
        name="Vulnerability Name",
        vm_type=VMType.COSMOS.value,
        severity="CRITICAL",
        category="Category Name",
        description="Brief description",
        technical_details="Detailed technical explanation",
        vulnerable_code_example='''
        // Vulnerable code here
        ''',
        secure_code_example='''
        // Secure code here
        ''',
        detection_patterns=[
            "pattern1",
            "pattern2"
        ],
        remediation="How to fix this vulnerability",
        cwe_id="CWE-XXX",  # Optional
        cve_references=["CVE-YYYY-XXXX"],  # Optional
        real_world_exploits=[{  # Optional
            "protocol": "Protocol Name",
            "date": "YYYY-MM-DD",
            "impact": "Description",
            "amount_usd": 0
        }],
        affected_chains=["Chain1", "Chain2"],
        confidence_score=0.75
    ))

    return patterns
```

3. **Run the generator**:
```bash
python3 /Users/dennisgoslar/Projekter/exploit-intel-platform/tools/generate_vuln_database.py
```

### Option 2: Manual Database Edit

1. **Edit** `vulnerability_database.json` directly
2. **Update statistics** section manually
3. **Increment version** number
4. **Update** `generated_at` timestamp

## How Scanners Use This Data

### 1. Pattern Matching

Scanners use the `detection_patterns` array to identify potential vulnerabilities:

```python
from cosmos_scanner import CosmWasmScanner

scanner = CosmWasmScanner()
vulnerabilities = scanner.scan_file("contract.rs")

for vuln in vulnerabilities:
    print(f"{vuln.severity}: {vuln.description}")
    print(f"Line {vuln.line_number}: {vuln.code_snippet}")
    print(f"Fix: {vuln.recommendation}")
```

### 2. Confidence Scoring

Each pattern has a `confidence_score` (0.0 to 1.0):
- **0.80-1.0**: High confidence - Likely a real vulnerability
- **0.65-0.79**: Medium confidence - Requires manual review
- **0.50-0.64**: Low confidence - May be false positive

### 3. Cross-Reference with Exploits

Scanners link patterns to `real_world_exploits` to show:
- Similar historical attacks
- Actual financial impact
- CVE references for deeper research

### 4. Chain-Specific Detection

Patterns include `affected_chains` to enable:
- Chain-specific scanning modes
- Ecosystem-focused audits
- Cross-chain vulnerability tracking

## Scanner Integration

### Cosmos/CosmWasm Scanner
- **File**: `/Users/dennisgoslar/Projekter/exploit-intel-platform/tools/cosmos_scanner.py`
- **Detects**: IBC replay, storage manipulation, access control, integer overflow, reentrancy
- **Chains**: Osmosis, Neutron, Injective, generic CosmWasm

### Move Scanner
- **File**: `/Users/dennisgoslar/Projekter/exploit-intel-platform/tools/move_scanner.py`
- **Detects**: Resource leaks, capability forgery, type confusion, signer auth, coin overflow
- **Chains**: Aptos, Sui

### Cairo Scanner
- **File**: `/Users/dennisgoslar/Projekter/exploit-intel-platform/tools/cairo_scanner.py`
- **Detects**: Felt overflow, hint manipulation, account abstraction, L1↔L2 messaging
- **Chains**: StarkNet (Cairo 0 and 1)

### Substrate Scanner
- **File**: `/Users/dennisgoslar/Projekter/exploit-intel-platform/tools/substrate_scanner.py`
- **Detects**: Ink! reentrancy, delegate calls, XCM exploits, runtime upgrades, unsafe math
- **Chains**: Polkadot, Kusama, all Substrate parachains

## CWE Mapping

24 out of 25 patterns are mapped to Common Weakness Enumeration (CWE):

| CWE ID | Category | Count |
|--------|----------|-------|
| CWE-190 | Integer Overflow/Wraparound | 4 |
| CWE-841 | Improper Enforcement of Behavioral Workflow | 3 |
| CWE-862 | Missing Authorization | 5 |
| CWE-287 | Improper Authentication | 1 |
| CWE-294 | Authentication Bypass by Capture-replay | 1 |
| CWE-345 | Insufficient Verification of Data Authenticity | 2 |
| CWE-367 | Time-of-check Time-of-use (TOCTOU) Race Condition | 1 |
| CWE-400 | Uncontrolled Resource Consumption | 1 |
| CWE-404 | Improper Resource Shutdown or Release | 1 |
| CWE-754 | Improper Check for Unusual or Exceptional Conditions | 1 |
| CWE-843 | Type Confusion | 1 |
| CWE-330 | Use of Insufficiently Random Values | 1 |
| CWE-20  | Improper Input Validation | 1 |

## Real-World Exploit References

The database includes 30 documented real-world exploits totaling $3.8B+ in losses:

**Major Exploits**:
- Ronin Bridge (2022): $625M - Compromised validator keys
- Poly Network (2021): $611M - Access control bypass
- Wormhole (2022): $326M - Signature verification bypass
- Euler Finance (2023): $197M - Donation attack
- Nomad Bridge (2022): $190M - Merkle proof validation

**By Pattern Type**:
- Cross-chain bridges: 8 exploits ($2.1B+)
- Oracle manipulation: 5 exploits ($350M+)
- Reentrancy: 3 exploits ($150M+)
- Access control: 6 exploits ($800M+)
- Flash loan attacks: 8 exploits ($490M+)

## Updating the Database

### Automated Updates

The database is regenerated from scanner patterns:

```bash
# Full regeneration
python3 /Users/dennisgoslar/Projekter/exploit-intel-platform/tools/generate_vuln_database.py

# Output will show:
# - Patterns generated per VM type
# - Total coverage statistics
# - CWE mapping coverage
# - Chains covered
```

### Adding Real-World Exploits

Edit `/Users/dennisgoslar/Projekter/exploit-intel-platform/intelligence/database/exploit_database.json`:

```json
{
  "exploits": [
    {
      "id": "UNIQUE_ID_YYYY",
      "protocol": "Protocol Name",
      "date": "YYYY-MM-DD",
      "amount_usd": 1000000,
      "chain": "Ethereum/Cosmos/etc",
      "attack_type": "Reentrancy/Oracle/etc",
      "pattern": "reentrancy/oracle_manipulation/etc",
      "description": "What happened",
      "vulnerable_code_pattern": "Code pattern that was vulnerable",
      "root_cause": "Why it happened",
      "exploit_technique": "How the attack worked",
      "references": ["https://..."],
      "similar_protocols": ["Protocol1", "Protocol2"]
    }
  ]
}
```

## Testing & Validation

### Scanner Test Suite

```bash
# Test Cosmos scanner
python3 /Users/dennisgoslar/Projekter/exploit-intel-platform/tests/test_cosmos_scanner.py

# Test all scanners
python3 -m pytest tests/
```

### Validation Checklist

When adding new patterns, ensure:

- [ ] **ID is unique** and follows format: `{VM}-{NUMBER}`
- [ ] **Severity** is one of: CRITICAL, HIGH, MEDIUM, LOW, INFO
- [ ] **Code examples** compile and demonstrate the issue clearly
- [ ] **Detection patterns** are accurate regex/search patterns
- [ ] **CWE mapping** is correct and documented
- [ ] **Affected chains** list is complete
- [ ] **Confidence score** reflects detection accuracy
- [ ] **Remediation** is actionable and clear

## API Integration

### Query Vulnerabilities by VM Type

```python
import json

with open('intelligence/vulnerability_database.json') as f:
    db = json.load(f)

cosmos_vulns = [
    p for p in db['vulnerability_patterns']
    if p['vm_type'] == 'Cosmos/CosmWasm'
]

print(f"Found {len(cosmos_vulns)} Cosmos vulnerabilities")
```

### Filter by Severity

```python
critical_vulns = [
    p for p in db['vulnerability_patterns']
    if p['severity'] == 'CRITICAL'
]

for vuln in critical_vulns:
    print(f"{vuln['id']}: {vuln['name']}")
    print(f"  Chains: {', '.join(vuln['affected_chains'])}")
    print(f"  CWE: {vuln['cwe_id']}")
```

### Search by Chain

```python
def get_chain_vulnerabilities(chain_name):
    return [
        p for p in db['vulnerability_patterns']
        if chain_name in p['affected_chains'] or
           any(chain_name in c for c in p['affected_chains'])
    ]

osmosis_vulns = get_chain_vulnerabilities('Osmosis')
print(f"Osmosis-specific vulnerabilities: {len(osmosis_vulns)}")
```

## Contributing

To contribute new vulnerability patterns:

1. **Research** the vulnerability thoroughly
2. **Document** with code examples (vulnerable + secure)
3. **Test** detection patterns against real code
4. **Map** to CWE if applicable
5. **Add** real-world examples if available
6. **Verify** with scanner test suite
7. **Update** this README if adding new categories

## Future Enhancements

### Planned Features

- [ ] **Solana/Rust-native** scanner integration
- [ ] **EVM/Solidity** pattern cross-referencing
- [ ] **Automated CVE matching** via NVD API
- [ ] **Machine learning** confidence scoring
- [ ] **Multi-language** code examples
- [ ] **Interactive remediation** guides
- [ ] **Chain-specific** severity adjustments

### Research Areas

- **MEV vulnerabilities** across VMs
- **Cross-VM attack vectors** (e.g., Cosmos → EVM)
- **Zero-day pattern** discovery
- **Formal verification** integration
- **Runtime protection** mechanisms

## Resources

### Documentation
- [CosmWasm Security Best Practices](https://github.com/CosmWasm/cosmwasm/blob/main/SECURITY.md)
- [Move Language Book](https://move-language.github.io/move/)
- [Cairo Documentation](https://cairo-lang.org/docs/)
- [Substrate/Ink! Docs](https://use.ink/)

### Security Tools
- [Oak Security CosmWasm Audits](https://github.com/oak-security/cosmwasm-security)
- [Move Prover](https://github.com/move-language/move/tree/main/language/move-prover)
- [Cairo Security Tools](https://github.com/crytic/amarna)
- [Substrate Runtime Checks](https://github.com/paritytech/polkadot/tree/master/runtime)

### Vulnerability Databases
- [NIST National Vulnerability Database](https://nvd.nist.gov/)
- [Rekt News](https://rekt.news/) - Crypto exploit archive
- [DeFi Hacks Analysis](https://github.com/SunWeb3Sec/DeFiHackLabs)
- [Blockchain CVEs](https://cve.mitre.org/)

## License

This vulnerability database is part of the Varden Exploit Intelligence Platform.

## Contact

For questions, contributions, or security disclosures:
- Platform: Varden Intelligence
- Database Version: 3.0
- Last Updated: 2025-10-06

---

**Note**: This database is for educational and security research purposes. Always conduct responsible security research and follow coordinated disclosure practices.
