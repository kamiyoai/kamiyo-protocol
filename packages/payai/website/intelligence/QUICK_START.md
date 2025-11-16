# Vulnerability Database - Quick Start Guide

## Generate Fresh Database

```bash
python3 /Users/dennisgoslar/Projekter/exploit-intel-platform/tools/generate_vuln_database.py
```

## Query Patterns

### By VM Type
```python
import json

with open('intelligence/vulnerability_database.json') as f:
    db = json.load(f)

# Get all Cosmos vulnerabilities
cosmos = [p for p in db['vulnerability_patterns'] if p['vm_type'] == 'Cosmos/CosmWasm']
print(f"Cosmos patterns: {len(cosmos)}")

# Get all Move vulnerabilities
move = [p for p in db['vulnerability_patterns'] if 'Move' in p['vm_type']]
print(f"Move patterns: {len(move)}")
```

### By Severity
```python
# Get critical vulnerabilities
critical = [p for p in db['vulnerability_patterns'] if p['severity'] == 'CRITICAL']

for vuln in critical:
    print(f"{vuln['id']}: {vuln['name']}")
    print(f"  Affects: {', '.join(vuln['affected_chains'][:3])}")
```

### By Chain
```python
def get_chain_vulns(chain_name):
    return [p for p in db['vulnerability_patterns'] 
            if any(chain_name in c for c in p['affected_chains'])]

osmosis_vulns = get_chain_vulns('Osmosis')
neutron_vulns = get_chain_vulns('Neutron')
```

## Use with Scanners

### Scan Cosmos Contract
```bash
python3 tools/cosmos_scanner.py
# Scans targets/osmosis, targets/neutron, targets/cosmwasm
```

### Scan Move Contract
```bash
python3 tools/move_scanner.py
# Scans targets/aptos, targets/sui
```

### Scan Cairo Contract
```bash
python3 tools/cairo_scanner.py
# Scans targets/starknet, targets/cairo
```

### Scan Substrate Contract
```bash
python3 tools/substrate_scanner.py
# Scans targets/substrate, targets/ink
```

## Database Statistics

```python
stats = db['statistics']
print(f"Total patterns: {stats['total_patterns']}")
print(f"VM types: {list(stats['by_vm_type'].keys())}")
print(f"Severities: {stats['by_severity']}")
print(f"Categories: {list(stats['by_category'].keys())}")
print(f"Chains covered: {len(stats['chains_covered'])}")
print(f"CWE mapped: {stats['cwe_mapped']}/{stats['total_patterns']}")
```

## Add New Pattern

1. Edit `tools/generate_vuln_database.py`
2. Add to appropriate function (cosmos/move/cairo/substrate)
3. Run generator
4. Verify in `intelligence/vulnerability_database.json`

## Files Overview

```
intelligence/
├── vulnerability_database.json          # Main database (25 patterns)
├── README.md                           # Full documentation
├── QUICK_START.md                      # This file
├── database/
│   └── exploit_database.json          # Historical exploits ($3.8B+)
├── patterns/
│   └── code_patterns.json             # Detection patterns
└── scans/
    ├── cosmos/                        # Cosmos scan results
    ├── aave_v3_scan.json             # Sample scans
    └── ...
```

## Key Features

✅ **25 vulnerability patterns** across 4 VM types
✅ **24/25 CWE mapped** (96% coverage)
✅ **16 chains covered** (Cosmos, Move, Cairo, Substrate)
✅ **12 CRITICAL** + **11 HIGH** severity patterns
✅ **Code examples** (vulnerable + secure)
✅ **Detection patterns** for automated scanning
✅ **Real-world exploits** referenced ($3.8B+ tracked)

## Next Steps

1. **Review patterns**: Check `vulnerability_database.json`
2. **Run scanners**: Test against target protocols
3. **Add patterns**: Contribute new vulnerability types
4. **Integrate**: Use database in your security tools

---

For full documentation, see [README.md](README.md)
