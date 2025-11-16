#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fix timezone issues in the codebase
Replaces naive datetime.now() and deprecated datetime.utcnow() with datetime.now(timezone.utc)
"""
import re
from pathlib import Path
import sys

def fix_timezone_in_file(file_path):
    """Replace datetime.now() with datetime.now(timezone.utc)"""
    with open(file_path, 'r') as f:
        content = f.read()

    original = content
    changes = []

    # Replace naive datetime.now() with datetime.now(timezone.utc)
    # But avoid replacing datetime.now(timezone.utc) again
    pattern1 = r'datetime\.now\(\)(?!\s*\.replace)'
    if re.search(pattern1, content):
        content = re.sub(pattern1, 'datetime.now(timezone.utc)', content)
        changes.append("datetime.now() -> datetime.now(timezone.utc)")

    # Replace deprecated datetime.utcnow()
    if 'datetime.utcnow()' in content:
        content = content.replace('datetime.utcnow()', 'datetime.now(timezone.utc)')
        changes.append("datetime.utcnow() -> datetime.now(timezone.utc)")

    # Ensure timezone import exists if we made changes
    if changes and 'from datetime import' in content:
        # Check if timezone is already imported
        match = re.search(r'from datetime import ([^\n]+)', content)
        if match and 'timezone' not in match.group():
            content = re.sub(
                r'from datetime import ([^;\n]+)',
                r'from datetime import \1, timezone',
                content,
                count=1
            )
            changes.append("Added timezone import")

    if content != original:
        with open(file_path, 'w') as f:
            f.write(content)
        return True, changes
    return False, []

if __name__ == '__main__':
    project_root = Path(__file__).parent.parent
    python_files = [
        'monitors/liquidation_analyzer.py',
        'monitors/oracle_monitor.py',
        'monitors/hlp_vault_monitor.py',
        'aggregators/github_historical.py',
        'aggregators/base.py',
        'alerts/alert_manager.py',
    ]

    fixed_files = []
    for rel_path in python_files:
        file_path = project_root / rel_path
        if not file_path.exists():
            print("WARNING: Skipping {} (not found)".format(rel_path))
            continue

        changed, changes = fix_timezone_in_file(file_path)
        if changed:
            fixed_files.append(file_path)
            print("FIXED {}:".format(rel_path))
            for change in changes:
                print("   - {}".format(change))
        else:
            print("OK: {} (already correct)".format(rel_path))

    print("\n" + "="*60)
    print("Fixed {} files".format(len(fixed_files)))
    sys.exit(0)
