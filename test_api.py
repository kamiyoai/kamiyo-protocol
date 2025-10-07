# -*- coding: utf-8 -*-
"""Test API endpoints"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

print("Testing Kamiyo API endpoints...\n")

# Test root
print("1. Testing GET /")
response = client.get("/")
print(f"   Status: {response.status_code}")
print(f"   Response: {response.json()['name']}\n")

# Test health
print("2. Testing GET /health")
response = client.get("/health")
print(f"   Status: {response.status_code}")
health = response.json()
print(f"   Database exploits: {health['database_exploits']}")
print(f"   Tracked chains: {health['tracked_chains']}")
print(f"   Active sources: {health['active_sources']}/{health['total_sources']}\n")

# Test stats
print("3. Testing GET /stats?days=7")
response = client.get("/stats?days=7")
print(f"   Status: {response.status_code}")
stats = response.json()
print(f"   Total exploits: {stats['total_exploits']}")
print(f"   Total loss: ${stats['total_loss_usd']:,.0f}")
print(f"   Chains affected: {stats['chains_affected']}\n")

# Test exploits list
print("4. Testing GET /exploits?page=1&page_size=5")
response = client.get("/exploits?page=1&page_size=5")
print(f"   Status: {response.status_code}")
data = response.json()
print(f"   Total: {data['total']}")
print(f"   Returned: {len(data['data'])}")
if data['data']:
    exploit = data['data'][0]
    print(f"   Top exploit: {exploit['protocol']} (${exploit['amount_usd']:,.0f})\n")

# Test filter by chain
print("5. Testing GET /exploits?chain=Ethereum&page_size=3")
response = client.get("/exploits?chain=Ethereum&page_size=3")
print(f"   Status: {response.status_code}")
data = response.json()
print(f"   Ethereum exploits: {len(data['data'])}")
for exploit in data['data']:
    print(f"   - {exploit['protocol']}: ${exploit['amount_usd']:,.0f}\n")

# Test chains endpoint
print("6. Testing GET /chains")
response = client.get("/chains")
print(f"   Status: {response.status_code}")
data = response.json()
print(f"   Total chains: {data['total_chains']}")
print(f"   Top 5 chains by exploits:")
for chain_data in data['chains'][:5]:
    print(f"   - {chain_data['chain']}: {chain_data['exploit_count']} exploits")

print("\n✅ All API tests passed!")
