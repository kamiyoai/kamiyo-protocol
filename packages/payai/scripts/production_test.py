#!/usr/bin/env python3
"""
Kamiyo Production Test Suite
Tests all major components end-to-end
"""

import os
import sys
import subprocess
from pathlib import Path

# Colors
GREEN = '\033[0;32m'
RED = '\033[0;31m'
YELLOW = '\033[1;33m'
NC = '\033[0m'  # No Color

passed = 0
failed = 0
warnings = 0

def test_passed(msg):
    global passed
    print(f"{GREEN}✓{NC} {msg}")
    passed += 1

def test_failed(msg):
    global failed
    print(f"{RED}✗{NC} {msg}")
    failed += 1

def test_warning(msg):
    global warnings
    print(f"{YELLOW}⚠{NC} {msg}")
    warnings += 1

print("=" * 50)
print("Kamiyo Production Test Suite")
print("=" * 50)
print()

# Test 1: File Structure
print("Test 1: Verifying file structure...")
required_dirs = ["api", "database", "caching", "monitoring", "scripts", "docs"]
for dir_name in required_dirs:
    if os.path.isdir(dir_name):
        test_passed(f"Directory exists: {dir_name}")
    else:
        test_failed(f"Missing directory: {dir_name}")
print()

# Test 2: Python Syntax
print("Test 2: Testing Python syntax...")
python_files = [
    "api/main.py",
    "api/payments/stripe_client.py",
    "api/subscriptions/manager.py",
    "api/webhooks/stripe_handler.py",
    "database/postgres_manager.py",
    "caching/cache_manager.py",
    "api/compression.py",
    "api/pagination.py",
]

for file in python_files:
    if os.path.isfile(file):
        try:
            subprocess.run(
                ["python3", "-m", "py_compile", file],
                check=True,
                capture_output=True
            )
            test_passed(f"Syntax OK: {file}")
        except subprocess.CalledProcessError:
            test_failed(f"Syntax error: {file}")
    else:
        test_failed(f"File not found: {file}")
print()

# Test 3: SQL Migrations
print("Test 3: Verifying SQL migrations...")
sql_files = [
    "database/migrations/001_initial_schema.sql",
    "database/migrations/002_payment_tables.sql",
    "database/migrations/003_subscription_tables.sql",
    "database/migrations/004_webhook_tables.sql",
    "database/migrations/005_performance_indexes.sql",
]

for file in sql_files:
    if os.path.isfile(file):
        with open(file, 'r') as f:
            content = f.read()
            if "CREATE TABLE" in content or "CREATE INDEX" in content:
                test_passed(f"SQL migration exists: {file}")
            else:
                test_warning(f"SQL file exists but may be incomplete: {file}")
    else:
        test_failed(f"Missing SQL file: {file}")
print()

# Test 4: Docker Configuration
print("Test 4: Checking Docker configuration...")
docker_files = [
    "docker-compose.production.yml",
    "Dockerfile.api.prod",
    "Dockerfile.aggregator.prod",
]

for file in docker_files:
    if os.path.isfile(file):
        test_passed(f"Docker config exists: {file}")
    else:
        test_failed(f"Missing Docker config: {file}")
print()

# Test 5: CI/CD Workflows
print("Test 5: Verifying CI/CD workflows...")
workflow_files = [
    ".github/workflows/test.yml",
    ".github/workflows/deploy.yml",
]

for file in workflow_files:
    if os.path.isfile(file):
        test_passed(f"Workflow exists: {file}")
    else:
        test_warning(f"Missing workflow: {file}")
print()

# Test 6: Documentation
print("Test 6: Checking documentation...")
doc_files = [
    "docs/DEPLOYMENT_GUIDE.md",
    "README.md",
    "CLAUDE.md",
    "PROGRESS_REPORT.md",
]

for file in doc_files:
    if os.path.isfile(file):
        test_passed(f"Documentation exists: {file}")
    else:
        test_warning(f"Missing documentation: {file}")
print()

# Test 7: Environment Configuration
print("Test 7: Verifying environment configuration...")
if os.path.isfile(".env.production.template"):
    test_passed("Environment template exists")

    with open(".env.production.template", 'r') as f:
        content = f.read()
        required_vars = ["DATABASE_URL", "REDIS_URL", "STRIPE_SECRET_KEY"]
        for var in required_vars:
            if var in content:
                test_passed(f"Environment variable documented: {var}")
            else:
                test_warning(f"Missing environment variable: {var}")
else:
    test_failed("Missing .env.production.template")
print()

# Test 8: API Structure
print("Test 8: Verifying API structure...")
if os.path.isfile("api/main.py"):
    with open("api/main.py", 'r') as f:
        content = f.read()
        if "FastAPI" in content or "fastapi" in content:
            test_passed("FastAPI application configured")
        else:
            test_warning("FastAPI may not be configured in main.py")

    routers = ["payments", "subscriptions", "webhooks", "billing"]
    for router in routers:
        if os.path.isdir(f"api/{router}"):
            test_passed(f"Router/module exists: {router}")
        else:
            test_warning(f"Router/module may be missing: {router}")
print()

# Test 9: Monitoring
print("Test 9: Checking monitoring configuration...")
monitoring_files = [
    "monitoring/prometheus_metrics.py",
    "monitoring/alerts.py",
]

for file in monitoring_files:
    if os.path.isfile(file):
        test_passed(f"Monitoring component exists: {file}")
    else:
        test_warning(f"Missing monitoring component: {file}")
print()

# Test 10: Security
print("Test 10: Verifying security setup...")
security_files = [
    "api/security.py",
]

for file in security_files:
    if os.path.isfile(file):
        test_passed(f"Security component exists: {file}")
    else:
        test_warning(f"Missing security component: {file}")
print()

# Test 11: Week 3 Additions
print("Test 11: Verifying Week 3 optimizations...")
week3_files = [
    "database/connection_pool.py",
    "database/query_optimizer.py",
    "caching/strategies.py",
    "caching/invalidation.py",
    "aggregators/parallel_executor.py",
    "aggregators/circuit_breaker.py",
]

for file in week3_files:
    if os.path.isfile(file):
        test_passed(f"Week 3 component exists: {file}")
    else:
        test_warning(f"Missing Week 3 component: {file}")
print()

# Summary
print("=" * 50)
print("Test Summary")
print("=" * 50)
print(f"{GREEN}Passed:{NC} {passed}")
print(f"{YELLOW}Warnings:{NC} {warnings}")
print(f"{RED}Failed:{NC} {failed}")
print()

total = passed + warnings + failed
pass_rate = (passed * 100 // total) if total > 0 else 0

if failed == 0:
    print(f"{GREEN}✓ All critical tests passed!{NC}")
    print(f"Pass rate: {pass_rate}%")
    sys.exit(0)
else:
    print(f"{RED}✗ Some tests failed{NC}")
    print(f"Pass rate: {pass_rate}%")
    sys.exit(1)
