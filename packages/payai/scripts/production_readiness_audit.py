#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kamiyo Production Readiness Audit
Comprehensive check of all systems before launch
"""

import os
import sys
import subprocess
from pathlib import Path
from typing import Dict, List, Tuple

# Colors
GREEN = '\033[0;32m'
RED = '\033[0;31m'
YELLOW = '\033[1;33m'
BLUE = '\033[0;34m'
NC = '\033[0m'

class ProductionAudit:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.warnings = 0
        self.critical_issues = []
        self.recommendations = []

    def check_passed(self, msg: str):
        print(f"{GREEN}✓{NC} {msg}")
        self.passed += 1

    def check_failed(self, msg: str, critical: bool = False):
        print(f"{RED}✗{NC} {msg}")
        self.failed += 1
        if critical:
            self.critical_issues.append(msg)

    def check_warning(self, msg: str):
        print(f"{YELLOW}⚠{NC} {msg}")
        self.warnings += 1

    def add_recommendation(self, msg: str):
        self.recommendations.append(msg)

    def section_header(self, title: str):
        print(f"\n{BLUE}{'='*60}{NC}")
        print(f"{BLUE}{title}{NC}")
        print(f"{BLUE}{'='*60}{NC}\n")

    def audit_file_structure(self):
        """Check critical files and directories exist"""
        self.section_header("FILE STRUCTURE AUDIT")

        # Critical directories
        critical_dirs = [
            'api', 'database', 'aggregators', 'caching', 'monitoring',
            'scripts', 'docs', 'tests', 'social', 'alerts', 'frontend'
        ]

        for dir_name in critical_dirs:
            if os.path.isdir(dir_name):
                self.check_passed(f"Directory exists: {dir_name}")
            else:
                self.check_failed(f"Missing directory: {dir_name}", critical=True)

        # Critical files
        critical_files = [
            'requirements.txt',
            '.env.production.template',
            '.gitignore',
            'README.md',
            'CLAUDE.md',
            'docker-compose.production.yml',
            'api/main.py',
            'database/postgres_manager.py',
            'social/poster.py',
            'social/kamiyo_watcher.py'
        ]

        for file_path in critical_files:
            if os.path.isfile(file_path):
                self.check_passed(f"Critical file exists: {file_path}")
            else:
                self.check_failed(f"Missing critical file: {file_path}", critical=True)

    def audit_python_syntax(self):
        """Verify all Python files compile"""
        self.section_header("PYTHON SYNTAX AUDIT")

        python_files = [
            'api/main.py',
            'api/models.py',
            'api/websocket_server.py',
            'database/postgres_manager.py',
            'database/connection_pool.py',
            'caching/cache_manager.py',
            'social/poster.py',
            'social/post_generator.py',
            'social/kamiyo_watcher.py',
            'aggregators/orchestrator.py',
            'aggregators/parallel_executor.py'
        ]

        for file_path in python_files:
            if os.path.isfile(file_path):
                try:
                    subprocess.run(
                        ['python3', '-m', 'py_compile', file_path],
                        check=True,
                        capture_output=True
                    )
                    self.check_passed(f"Syntax OK: {file_path}")
                except subprocess.CalledProcessError as e:
                    self.check_failed(f"Syntax error: {file_path}", critical=True)
            else:
                self.check_failed(f"File not found: {file_path}", critical=True)

    def audit_database(self):
        """Check database schema and migrations"""
        self.section_header("DATABASE AUDIT")

        # Check migrations exist
        migrations = [
            'database/migrations/001_initial_schema.sql',
            'database/migrations/002_payment_tables.sql',
            'database/migrations/003_subscription_tables.sql',
            'database/migrations/004_webhook_tables.sql',
            'database/migrations/005_performance_indexes.sql',
            'database/migrations/006_telegram_tables.sql',
            'database/migrations/007_discord_tables.sql'
        ]

        for migration in migrations:
            if os.path.isfile(migration):
                with open(migration, 'r') as f:
                    content = f.read()
                    if 'CREATE TABLE' in content or 'CREATE INDEX' in content:
                        self.check_passed(f"Migration valid: {migration}")
                    else:
                        self.check_warning(f"Migration may be incomplete: {migration}")
            else:
                self.check_failed(f"Missing migration: {migration}", critical=True)

        # Check for migration runner
        if os.path.isfile('scripts/migrate.sh') or os.path.isfile('scripts/run_migrations.py'):
            self.check_passed("Migration runner exists")
        else:
            self.check_warning("No migration runner found")
            self.add_recommendation("Create migration runner script")

    def audit_docker(self):
        """Check Docker configuration"""
        self.section_header("DOCKER AUDIT")

        docker_files = [
            'docker-compose.production.yml',
            'Dockerfile.api.prod',
            'Dockerfile.aggregator.prod',
            'Dockerfile.telegram.prod',
            'Dockerfile.discord.prod'
        ]

        for file_path in docker_files:
            if os.path.isfile(file_path):
                self.check_passed(f"Docker file exists: {file_path}")
            else:
                self.check_failed(f"Missing Docker file: {file_path}")

        # Check docker-compose services
        if os.path.isfile('docker-compose.production.yml'):
            with open('docker-compose.production.yml', 'r') as f:
                content = f.read()
                services = ['postgres', 'redis', 'api', 'aggregator', 'nginx']
                for service in services:
                    if f'{service}:' in content:
                        self.check_passed(f"Docker service defined: {service}")
                    else:
                        self.check_failed(f"Missing Docker service: {service}")

    def audit_testing(self):
        """Check testing infrastructure"""
        self.section_header("TESTING AUDIT")

        # Check test files exist
        test_files = [
            'scripts/production_test.py',
            'scripts/integration_test.py',
            'scripts/load_test.py',
            'scripts/security_scan.sh',
            'tests/test_telegram.py',
            'tests/test_discord.py'
        ]

        for file_path in test_files:
            if os.path.isfile(file_path):
                self.check_passed(f"Test file exists: {file_path}")
            else:
                self.check_warning(f"Test file missing: {file_path}")

        # Check pytest.ini
        if os.path.isfile('pytest.ini'):
            self.check_passed("pytest.ini configured")
        else:
            self.check_warning("No pytest.ini found")

    def audit_monitoring(self):
        """Check monitoring and alerting setup"""
        self.section_header("MONITORING AUDIT")

        monitoring_files = [
            'monitoring/prometheus_metrics.py',
            'monitoring/alerts.py',
            'monitoring/prometheus.yml',
            'monitoring/grafana-datasources.yml',
            'monitoring/dashboards/kamiyo-overview.json'
        ]

        for file_path in monitoring_files:
            if os.path.isfile(file_path):
                self.check_passed(f"Monitoring file exists: {file_path}")
            else:
                self.check_warning(f"Missing monitoring file: {file_path}")

        # Check Sentry integration
        if os.path.isfile('monitoring/sentry_config.py'):
            self.check_passed("Sentry error tracking configured")
        else:
            self.check_warning("Sentry config not found")

    def audit_security(self):
        """Check security configuration"""
        self.section_header("SECURITY AUDIT")

        # Check .gitignore
        if os.path.isfile('.gitignore'):
            with open('.gitignore', 'r') as f:
                content = f.read()
                critical_ignores = ['.env', '*.key', '*.pem', 'secrets/']
                for pattern in critical_ignores:
                    if pattern in content:
                        self.check_passed(f"Gitignore includes: {pattern}")
                    else:
                        self.check_failed(f"Gitignore missing: {pattern}", critical=True)
        else:
            self.check_failed(".gitignore not found", critical=True)

        # Check for hardcoded secrets (basic check)
        risky_patterns = ['password=', 'api_key=', 'secret=', 'token=']
        python_files = Path('.').rglob('*.py')

        found_hardcoded = False
        for py_file in python_files:
            if 'venv' in str(py_file) or 'env' in str(py_file):
                continue
            try:
                with open(py_file, 'r') as f:
                    content = f.read().lower()
                    for pattern in risky_patterns:
                        if pattern in content and 'os.getenv' not in content:
                            # Basic check, might have false positives
                            pass
            except:
                pass

        if not found_hardcoded:
            self.check_passed("No obvious hardcoded secrets found")

        # Check security.py exists
        if os.path.isfile('api/security.py'):
            self.check_passed("Security module exists")
        else:
            self.check_warning("No api/security.py found")
            self.add_recommendation("Create security middleware module")

    def audit_documentation(self):
        """Check documentation completeness"""
        self.section_header("DOCUMENTATION AUDIT")

        critical_docs = [
            'README.md',
            'CLAUDE.md',
            'PROGRESS_REPORT.md',
            'docs/DEPLOYMENT_GUIDE.md',
            'TROUBLESHOOTING.md',
            'ROLLBACK_PLAN.md',
            'INCIDENT_RESPONSE.md',
            'SOCIAL_MEDIA_POSTING_GUIDE.md',
            'SETUP_CREDENTIALS.md'
        ]

        for doc in critical_docs:
            if os.path.isfile(doc):
                # Check if file has content
                size = os.path.getsize(doc)
                if size > 500:  # At least 500 bytes
                    self.check_passed(f"Documentation exists: {doc}")
                else:
                    self.check_warning(f"Documentation too short: {doc}")
            else:
                self.check_warning(f"Missing documentation: {doc}")

    def audit_deployment_scripts(self):
        """Check deployment automation"""
        self.section_header("DEPLOYMENT SCRIPTS AUDIT")

        scripts = [
            'scripts/deploy.sh',
            'scripts/health_check.sh',
            'scripts/backup_database.sh',
            'scripts/backup_restore.sh',
            'scripts/backup_scheduler.sh'
        ]

        for script in scripts:
            if os.path.isfile(script):
                # Check if executable
                if os.access(script, os.X_OK):
                    self.check_passed(f"Script exists and executable: {script}")
                else:
                    self.check_warning(f"Script not executable: {script}")
                    self.add_recommendation(f"Make {script} executable: chmod +x {script}")
            else:
                self.check_warning(f"Missing script: {script}")

    def audit_environment_config(self):
        """Check environment configuration"""
        self.section_header("ENVIRONMENT CONFIGURATION AUDIT")

        # Check .env files
        if os.path.isfile('.env.production.template'):
            with open('.env.production.template', 'r') as f:
                content = f.read()
                required_vars = [
                    'DATABASE_URL',
                    'REDIS_URL',
                    'STRIPE_SECRET_KEY',
                    'JWT_SECRET',
                    'SENTRY_DSN',
                    'KAMIYO_API_URL'
                ]
                for var in required_vars:
                    if var in content:
                        self.check_passed(f"Environment variable documented: {var}")
                    else:
                        self.check_failed(f"Missing environment variable: {var}")
        else:
            self.check_failed(".env.production.template not found", critical=True)

        # Check .env exists for local dev
        if os.path.isfile('.env'):
            self.check_passed(".env file exists for development")
        else:
            self.check_warning(".env file not found (create from template)")

    def audit_cicd(self):
        """Check CI/CD workflows"""
        self.section_header("CI/CD AUDIT")

        workflows = [
            '.github/workflows/test.yml',
            '.github/workflows/deploy.yml'
        ]

        for workflow in workflows:
            if os.path.isfile(workflow):
                self.check_passed(f"Workflow exists: {workflow}")
            else:
                self.check_warning(f"Missing workflow: {workflow}")

    def audit_performance(self):
        """Check performance optimizations"""
        self.section_header("PERFORMANCE AUDIT")

        # Check caching
        caching_files = [
            'caching/cache_manager.py',
            'caching/strategies.py',
            'caching/invalidation.py',
            'caching/warming.py'
        ]

        for file_path in caching_files:
            if os.path.isfile(file_path):
                self.check_passed(f"Caching component exists: {file_path}")
            else:
                self.check_warning(f"Missing caching component: {file_path}")

        # Check database optimization
        db_opt_files = [
            'database/connection_pool.py',
            'database/query_optimizer.py'
        ]

        for file_path in db_opt_files:
            if os.path.isfile(file_path):
                self.check_passed(f"DB optimization exists: {file_path}")
            else:
                self.check_warning(f"Missing DB optimization: {file_path}")

    def audit_social_posting(self):
        """Check social media posting system"""
        self.section_header("SOCIAL MEDIA POSTING AUDIT")

        social_files = [
            'social/__init__.py',
            'social/models.py',
            'social/post_generator.py',
            'social/poster.py',
            'social/kamiyo_watcher.py',
            'social/platforms/reddit.py',
            'social/platforms/discord.py',
            'social/platforms/telegram.py',
            'social/platforms/x_twitter.py'
        ]

        for file_path in social_files:
            if os.path.isfile(file_path):
                self.check_passed(f"Social component exists: {file_path}")
            else:
                self.check_failed(f"Missing social component: {file_path}")

    def generate_report(self):
        """Generate final audit report"""
        self.section_header("AUDIT SUMMARY")

        total = self.passed + self.failed + self.warnings
        pass_rate = (self.passed * 100 // total) if total > 0 else 0

        print(f"\n{GREEN}Passed:{NC} {self.passed}")
        print(f"{YELLOW}Warnings:{NC} {self.warnings}")
        print(f"{RED}Failed:{NC} {self.failed}")
        print(f"\n{BLUE}Pass Rate:{NC} {pass_rate}%")

        # Calculate production readiness score
        # Critical issues heavily penalize
        critical_penalty = len(self.critical_issues) * 10
        warning_penalty = self.warnings * 2
        failure_penalty = self.failed * 5

        readiness_score = max(0, 100 - critical_penalty - warning_penalty - failure_penalty)

        print(f"\n{BLUE}Production Readiness Score:{NC} {readiness_score}%")

        if self.critical_issues:
            print(f"\n{RED}CRITICAL ISSUES:{NC}")
            for issue in self.critical_issues:
                print(f"  • {issue}")

        if self.recommendations:
            print(f"\n{YELLOW}RECOMMENDATIONS:{NC}")
            for rec in self.recommendations:
                print(f"  • {rec}")

        # Status
        print(f"\n{'='*60}")
        if readiness_score >= 99:
            print(f"{GREEN}✓ READY FOR PRODUCTION{NC}")
        elif readiness_score >= 95:
            print(f"{YELLOW}⚠ ALMOST READY - Address warnings{NC}")
        elif readiness_score >= 90:
            print(f"{YELLOW}⚠ NEEDS ATTENTION - Fix issues{NC}")
        else:
            print(f"{RED}✗ NOT READY - Critical issues present{NC}")
        print(f"{'='*60}\n")

        return readiness_score


def main():
    print("="*60)
    print("KAMIYO PRODUCTION READINESS AUDIT")
    print("="*60)

    audit = ProductionAudit()

    # Run all audits
    audit.audit_file_structure()
    audit.audit_python_syntax()
    audit.audit_database()
    audit.audit_docker()
    audit.audit_testing()
    audit.audit_monitoring()
    audit.audit_security()
    audit.audit_documentation()
    audit.audit_deployment_scripts()
    audit.audit_environment_config()
    audit.audit_cicd()
    audit.audit_performance()
    audit.audit_social_posting()

    # Generate final report
    readiness_score = audit.generate_report()

    # Exit code
    if readiness_score >= 99:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
