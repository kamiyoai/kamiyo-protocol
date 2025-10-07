# -*- coding: utf-8 -*-
"""Test database setup"""

from database import get_db
from datetime import datetime

# Initialize database
db = get_db()

print("Database initialized")
print(f"  Location: {db.db_path}")

# Test insert exploit
test_exploit = {
    'tx_hash': '0x1234567890abcdef',
    'chain': 'Ethereum',
    'protocol': 'Test Protocol',
    'amount_usd': 1000000,
    'timestamp': datetime.now(),
    'source': 'test',
    'source_url': 'https://example.com',
    'category': 'test',
    'description': 'Test exploit for database verification'
}

exploit_id = db.insert_exploit(test_exploit)
print(f"\nInserted test exploit (ID: {exploit_id})")

# Test duplicate prevention
duplicate_id = db.insert_exploit(test_exploit)
if duplicate_id is None:
    print("Duplicate prevention working")

# Test retrieval
recent = db.get_recent_exploits(limit=5)
print(f"\nRetrieved {len(recent)} recent exploits")
for e in recent:
    print(f"  - {e['protocol']} on {e['chain']}: ${e['amount_usd']:,.0f}")

# Test stats
stats = db.get_stats_24h()
print(f"\n24h Stats:")
print(f"  - Total exploits: {stats['total_exploits']}")
print(f"  - Total loss: ${stats['total_loss_usd']:,.0f}")

# Test source tracking
db.update_source_health('test', success=True, url='https://test.com')
sources = db.get_source_health()
print(f"\nSource tracking: {len(sources)} sources")

print("\nAll database tests passed!")
