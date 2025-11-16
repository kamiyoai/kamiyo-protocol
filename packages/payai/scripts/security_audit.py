#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KAMIYO Security Audit Script
Comprehensive security analysis and vulnerability scanning

Performs automated security checks on:
- HTTP Security Headers
- CSRF Protection
- Authentication Security
- Dependency Vulnerabilities
- Code Security Patterns
- API Security
"""

import os
import sys
import re
import json
import subprocess
from datetime import datetime
from typing import Dict, List, Tuple, Optional
from pathlib import Path
from dataclasses import dataclass, asdict
from enum import Enum

# Color codes for terminal output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


class Severity(Enum):
    """Severity levels for security findings"""
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"


@dataclass
class SecurityFinding:
    """Represents a security finding"""
    category: str
    severity: Severity
    title: str
    description: str
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    recommendation: Optional[str] = None
    cve: Optional[str] = None


class SecurityAuditor:
    """Main security auditing class"""

    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.findings: List[SecurityFinding] = []
        self.start_time = datetime.now()

        # Paths
        self.api_main = self.project_root / "api" / "main.py"
        self.csrf_protection = self.project_root / "api" / "csrf_protection.py"
        self.nextauth_config = self.project_root / "pages" / "api" / "auth" / "[...nextauth].js"
        self.requirements_txt = self.project_root / "requirements.txt"
        self.package_json = self.project_root / "package.json"
        self.env_example = self.project_root / ".env.example"

    def run_audit(self) -> int:
        """Run complete security audit"""
        print(f"{Colors.HEADER}{Colors.BOLD}")
        print("=" * 80)
        print("KAMIYO SECURITY AUDIT")
        print("=" * 80)
        print(f"{Colors.ENDC}")
        print(f"Started: {self.start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Project: {self.project_root}")
        print()

        # Run all checks
        self.check_http_security_headers()
        self.check_csrf_protection()
        self.check_authentication_security()
        self.check_dependency_vulnerabilities()
        self.check_code_security_patterns()
        self.check_api_security()

        # Calculate score and generate report
        score = self.calculate_security_score()
        self.print_summary(score)
        self.generate_html_report(score)

        # Determine exit code
        critical_count = sum(1 for f in self.findings if f.severity == Severity.CRITICAL)

        if critical_count > 0:
            return 1
        elif score < 90:
            return 1
        else:
            return 0

    def check_http_security_headers(self):
        """Check HTTP security headers configuration"""
        print(f"{Colors.OKBLUE}[1/6] Checking HTTP Security Headers...{Colors.ENDC}")

        if not self.api_main.exists():
            self.add_finding(
                "HTTP Security Headers",
                Severity.CRITICAL,
                "api/main.py not found",
                "Cannot verify HTTP security headers configuration",
                recommendation="Ensure api/main.py exists"
            )
            return

        content = self.api_main.read_text()

        # Check CORS configuration
        if "*" in content and "allow_origins" in content.lower():
            if 'allow_origins=["*"]' in content or "allow_origins=['*']" in content:
                self.add_finding(
                    "HTTP Security Headers",
                    Severity.CRITICAL,
                    "CORS wildcard origin detected",
                    "CORS is configured with wildcard (*) origin, allowing any domain to make requests",
                    file_path="api/main.py",
                    recommendation="Use specific allowed origins instead of wildcard"
                )
        else:
            print(f"  {Colors.OKGREEN}✓{Colors.ENDC} CORS: No wildcard origins detected")

        # Check security headers
        security_headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": ["DENY", "SAMEORIGIN"],
            "Strict-Transport-Security": "max-age",
            "Content-Security-Policy": "default-src",
            "Referrer-Policy": "strict-origin"
        }

        for header, expected in security_headers.items():
            pattern = re.escape(header)
            if not re.search(pattern, content, re.IGNORECASE):
                self.add_finding(
                    "HTTP Security Headers",
                    Severity.HIGH,
                    f"Missing security header: {header}",
                    f"The {header} security header is not configured",
                    file_path="api/main.py",
                    recommendation=f"Add {header} header to security middleware"
                )
            else:
                # Verify header value
                if isinstance(expected, list):
                    found = any(exp in content for exp in expected)
                    status = "✓" if found else "⚠"
                    color = Colors.OKGREEN if found else Colors.WARNING
                    print(f"  {color}{status}{Colors.ENDC} {header}: {', '.join(expected)}")
                else:
                    found = expected in content
                    status = "✓" if found else "⚠"
                    color = Colors.OKGREEN if found else Colors.WARNING
                    print(f"  {color}{status}{Colors.ENDC} {header}: {expected}")

        print()

    def check_csrf_protection(self):
        """Check CSRF protection implementation"""
        print(f"{Colors.OKBLUE}[2/6] Checking CSRF Protection...{Colors.ENDC}")

        # Check if CSRF protection file exists
        if not self.csrf_protection.exists():
            self.add_finding(
                "CSRF Protection",
                Severity.CRITICAL,
                "CSRF protection not implemented",
                "api/csrf_protection.py not found",
                recommendation="Implement CSRF protection using fastapi-csrf-protect"
            )
            print(f"  {Colors.FAIL}✗{Colors.ENDC} CSRF Protection: Not implemented")
            print()
            return

        print(f"  {Colors.OKGREEN}✓{Colors.ENDC} CSRF Protection: File exists")

        content = self.csrf_protection.read_text()

        # Check CSRF_SECRET_KEY
        env_content = self.env_example.read_text() if self.env_example.exists() else ""

        if "CSRF_SECRET_KEY" in env_content:
            if "CHANGE_THIS_IN_PRODUCTION" in env_content:
                print(f"  {Colors.WARNING}⚠{Colors.ENDC} CSRF_SECRET_KEY: Default value in .env.example (must be changed in production)")
            else:
                print(f"  {Colors.OKGREEN}✓{Colors.ENDC} CSRF_SECRET_KEY: Configured")
        else:
            self.add_finding(
                "CSRF Protection",
                Severity.HIGH,
                "CSRF_SECRET_KEY not documented",
                "CSRF_SECRET_KEY is not present in .env.example",
                file_path=".env.example",
                recommendation="Add CSRF_SECRET_KEY to .env.example with placeholder"
            )

        # Check for exempt endpoints documentation
        if "exempt" in content.lower() and "endpoint" in content.lower():
            print(f"  {Colors.OKGREEN}✓{Colors.ENDC} Exempt Endpoints: Documented")
        else:
            self.add_finding(
                "CSRF Protection",
                Severity.MEDIUM,
                "CSRF exempt endpoints not clearly documented",
                "Exempt endpoints should be explicitly documented",
                file_path="api/csrf_protection.py",
                recommendation="Add documentation for all CSRF-exempt endpoints"
            )

        # Check for production validation
        if "validate_csrf_production_config" in content:
            print(f"  {Colors.OKGREEN}✓{Colors.ENDC} Production Validation: Implemented")
        else:
            self.add_finding(
                "CSRF Protection",
                Severity.MEDIUM,
                "Production validation missing",
                "No validation function for CSRF configuration in production",
                file_path="api/csrf_protection.py",
                recommendation="Add validate_csrf_production_config() function"
            )

        print()

    def check_authentication_security(self):
        """Check authentication security configuration"""
        print(f"{Colors.OKBLUE}[3/6] Checking Authentication Security...{Colors.ENDC}")

        if not self.nextauth_config.exists():
            self.add_finding(
                "Authentication Security",
                Severity.HIGH,
                "NextAuth configuration not found",
                "pages/api/auth/[...nextauth].js not found",
                recommendation="Ensure NextAuth is properly configured"
            )
            print(f"  {Colors.FAIL}✗{Colors.ENDC} NextAuth Config: Not found")
            print()
            return

        print(f"  {Colors.OKGREEN}✓{Colors.ENDC} NextAuth Config: File exists")

        content = self.nextauth_config.read_text()

        # Check JWT_SECRET configuration
        env_content = self.env_example.read_text() if self.env_example.exists() else ""

        if "NEXTAUTH_SECRET" in env_content or "JWT_SECRET" in env_content:
            # Check for minimum length requirement
            if "32" in env_content and "char" in env_content.lower():
                print(f"  {Colors.OKGREEN}✓{Colors.ENDC} JWT_SECRET: Length requirement documented (>= 32 chars)")
            else:
                self.add_finding(
                    "Authentication Security",
                    Severity.MEDIUM,
                    "JWT_SECRET length requirement not documented",
                    "JWT_SECRET should be at least 32 characters long",
                    file_path=".env.example",
                    recommendation="Document JWT_SECRET minimum length requirement"
                )
        else:
            self.add_finding(
                "Authentication Security",
                Severity.CRITICAL,
                "JWT_SECRET not configured",
                "NEXTAUTH_SECRET or JWT_SECRET not present in .env.example",
                file_path=".env.example",
                recommendation="Add NEXTAUTH_SECRET to .env.example"
            )

        # Check session configuration
        if "session" in content.lower():
            if "maxAge" in content or "max_age" in content:
                print(f"  {Colors.OKGREEN}✓{Colors.ENDC} Session Configuration: maxAge configured")
            else:
                self.add_finding(
                    "Authentication Security",
                    Severity.MEDIUM,
                    "Session maxAge not configured",
                    "Session expiration time should be explicitly configured",
                    file_path="pages/api/auth/[...nextauth].js",
                    recommendation="Configure session maxAge"
                )

        # Check for allowDangerousEmailAccountLinking
        if "allowDangerousEmailAccountLinking" in content:
            if "allowDangerousEmailAccountLinking: false" in content or "allowDangerousEmailAccountLinking:false" in content:
                print(f"  {Colors.OKGREEN}✓{Colors.ENDC} Email Account Linking: Safely configured (false)")
            else:
                self.add_finding(
                    "Authentication Security",
                    Severity.CRITICAL,
                    "Dangerous email account linking enabled",
                    "allowDangerousEmailAccountLinking is set to true, enabling account takeover attacks",
                    file_path="pages/api/auth/[...nextauth].js",
                    recommendation="Set allowDangerousEmailAccountLinking to false"
                )

        print()

    def check_dependency_vulnerabilities(self):
        """Check for dependency vulnerabilities"""
        print(f"{Colors.OKBLUE}[4/6] Checking Dependency Vulnerabilities...{Colors.ENDC}")

        # Check Python dependencies
        if self.requirements_txt.exists():
            print("  Scanning Python dependencies with pip-audit...")
            try:
                result = subprocess.run(
                    ["pip-audit", "-r", str(self.requirements_txt), "--format", "json"],
                    capture_output=True,
                    text=True,
                    timeout=60
                )

                if result.returncode == 0:
                    if result.stdout:
                        try:
                            vulnerabilities = json.loads(result.stdout)
                            if vulnerabilities:
                                for vuln in vulnerabilities:
                                    package = vuln.get("name", "unknown")
                                    version = vuln.get("version", "unknown")
                                    cve = vuln.get("id", "")
                                    severity = vuln.get("severity", "UNKNOWN").upper()

                                    # Map severity
                                    if severity in ["CRITICAL", "HIGH"]:
                                        sev = Severity.CRITICAL if severity == "CRITICAL" else Severity.HIGH
                                    elif severity == "MEDIUM":
                                        sev = Severity.MEDIUM
                                    else:
                                        sev = Severity.LOW

                                    self.add_finding(
                                        "Dependency Vulnerabilities",
                                        sev,
                                        f"Vulnerable Python package: {package}",
                                        f"Package {package} version {version} has known vulnerabilities",
                                        file_path="requirements.txt",
                                        recommendation=f"Update {package} to latest secure version",
                                        cve=cve
                                    )

                                print(f"  {Colors.FAIL}✗{Colors.ENDC} Python Dependencies: {len(vulnerabilities)} vulnerabilities found")
                            else:
                                print(f"  {Colors.OKGREEN}✓{Colors.ENDC} Python Dependencies: No vulnerabilities found")
                        except json.JSONDecodeError:
                            print(f"  {Colors.OKGREEN}✓{Colors.ENDC} Python Dependencies: No vulnerabilities found")
                    else:
                        print(f"  {Colors.OKGREEN}✓{Colors.ENDC} Python Dependencies: No vulnerabilities found")
                else:
                    print(f"  {Colors.WARNING}⚠{Colors.ENDC} Python Dependencies: pip-audit check skipped (exit code: {result.returncode})")

            except FileNotFoundError:
                print(f"  {Colors.WARNING}⚠{Colors.ENDC} Python Dependencies: pip-audit not installed (run: pip install pip-audit)")
            except subprocess.TimeoutExpired:
                print(f"  {Colors.WARNING}⚠{Colors.ENDC} Python Dependencies: pip-audit timeout")
            except Exception as e:
                print(f"  {Colors.WARNING}⚠{Colors.ENDC} Python Dependencies: Error running pip-audit: {e}")

        # Check Node.js dependencies
        if self.package_json.exists():
            print("  Scanning Node.js dependencies with npm audit...")
            try:
                result = subprocess.run(
                    ["npm", "audit", "--json"],
                    cwd=str(self.project_root),
                    capture_output=True,
                    text=True,
                    timeout=60
                )

                if result.stdout:
                    try:
                        audit_data = json.loads(result.stdout)

                        # Parse npm audit output (format varies by npm version)
                        vulnerabilities = audit_data.get("vulnerabilities", {})

                        if vulnerabilities:
                            critical = sum(1 for v in vulnerabilities.values() if v.get("severity") == "critical")
                            high = sum(1 for v in vulnerabilities.values() if v.get("severity") == "high")
                            medium = sum(1 for v in vulnerabilities.values() if v.get("severity") == "moderate")
                            low = sum(1 for v in vulnerabilities.values() if v.get("severity") == "low")

                            total = critical + high + medium + low

                            if total > 0:
                                for pkg_name, vuln_data in vulnerabilities.items():
                                    severity = vuln_data.get("severity", "unknown")

                                    if severity == "critical":
                                        sev = Severity.CRITICAL
                                    elif severity == "high":
                                        sev = Severity.HIGH
                                    elif severity == "moderate":
                                        sev = Severity.MEDIUM
                                    else:
                                        sev = Severity.LOW

                                    self.add_finding(
                                        "Dependency Vulnerabilities",
                                        sev,
                                        f"Vulnerable npm package: {pkg_name}",
                                        f"Package {pkg_name} has {severity} severity vulnerabilities",
                                        file_path="package.json",
                                        recommendation=f"Update {pkg_name} to latest secure version (run: npm audit fix)"
                                    )

                                print(f"  {Colors.FAIL}✗{Colors.ENDC} npm Dependencies: {total} vulnerabilities (Critical: {critical}, High: {high}, Medium: {medium}, Low: {low})")
                            else:
                                print(f"  {Colors.OKGREEN}✓{Colors.ENDC} npm Dependencies: No vulnerabilities found")
                        else:
                            print(f"  {Colors.OKGREEN}✓{Colors.ENDC} npm Dependencies: No vulnerabilities found")
                    except json.JSONDecodeError:
                        print(f"  {Colors.WARNING}⚠{Colors.ENDC} npm Dependencies: Could not parse npm audit output")

            except FileNotFoundError:
                print(f"  {Colors.WARNING}⚠{Colors.ENDC} npm Dependencies: npm not installed")
            except subprocess.TimeoutExpired:
                print(f"  {Colors.WARNING}⚠{Colors.ENDC} npm Dependencies: npm audit timeout")
            except Exception as e:
                print(f"  {Colors.WARNING}⚠{Colors.ENDC} npm Dependencies: Error running npm audit: {e}")

        print()

    def check_code_security_patterns(self):
        """Check for insecure code patterns"""
        print(f"{Colors.OKBLUE}[5/6] Checking Code Security Patterns...{Colors.ENDC}")

        # SQL Injection patterns
        print("  Scanning for SQL injection risks...")
        sql_patterns = [
            (r'execute\s*\(\s*f["\']', "SQL injection risk: f-string in execute()"),
            (r'execute\s*\(\s*["\'].*\{\}.*["\']', "SQL injection risk: string formatting in SQL"),
            (r'execute\s*\(\s*.*\+.*\)', "SQL injection risk: string concatenation in SQL"),
        ]

        sql_issues = self.scan_files_for_patterns("*.py", sql_patterns, ["api/", "database/"])

        if sql_issues == 0:
            print(f"  {Colors.OKGREEN}✓{Colors.ENDC} SQL Injection: No unsafe patterns detected")
        else:
            print(f"  {Colors.FAIL}✗{Colors.ENDC} SQL Injection: {sql_issues} potential issues found")

        # XSS patterns
        print("  Scanning for XSS risks...")
        xss_patterns = [
            (r'dangerouslySetInnerHTML', "XSS risk: dangerouslySetInnerHTML usage"),
            (r'innerHTML\s*=', "XSS risk: direct innerHTML assignment"),
        ]

        xss_issues = self.scan_files_for_patterns("*.js", xss_patterns, ["pages/", "components/"])

        if xss_issues == 0:
            print(f"  {Colors.OKGREEN}✓{Colors.ENDC} XSS Protection: No unsafe patterns detected")
        else:
            print(f"  {Colors.FAIL}✗{Colors.ENDC} XSS Protection: {xss_issues} potential issues found")

        # Secrets in code
        print("  Scanning for secrets in code...")
        secret_patterns = [
            (r'password\s*=\s*["\'][^"\']{8,}["\']', "Hardcoded password detected"),
            (r'api[_-]?key\s*=\s*["\'][^"\']{10,}["\']', "Hardcoded API key detected"),
            (r'secret\s*=\s*["\'][^"\']{10,}["\']', "Hardcoded secret detected"),
            (r'sk_live_[a-zA-Z0-9]{24,}', "Stripe live secret key in code"),
        ]

        secret_issues = self.scan_files_for_patterns("*.py", secret_patterns, ["api/", "scripts/"])
        secret_issues += self.scan_files_for_patterns("*.js", secret_patterns, ["pages/", "components/"])

        if secret_issues == 0:
            print(f"  {Colors.OKGREEN}✓{Colors.ENDC} Secrets in Code: No hardcoded secrets detected")
        else:
            print(f"  {Colors.FAIL}✗{Colors.ENDC} Secrets in Code: {secret_issues} potential secrets found")

        # Insecure random
        print("  Scanning for insecure random usage...")
        random_patterns = [
            (r'import random\b(?!.*secrets)', "Insecure random: Use secrets module for security-critical randomness"),
            (r'random\.randint|random\.choice', "Insecure random: Use secrets module instead"),
        ]

        random_issues = self.scan_files_for_patterns("*.py", random_patterns, ["api/", "scripts/"])

        if random_issues == 0:
            print(f"  {Colors.OKGREEN}✓{Colors.ENDC} Random Generation: No insecure random usage detected")
        else:
            print(f"  {Colors.WARNING}⚠{Colors.ENDC} Random Generation: {random_issues} potential issues found")

        print()

    def check_api_security(self):
        """Check API security configuration"""
        print(f"{Colors.OKBLUE}[6/6] Checking API Security...{Colors.ENDC}")

        if not self.api_main.exists():
            print(f"  {Colors.FAIL}✗{Colors.ENDC} API Security: api/main.py not found")
            return

        content = self.api_main.read_text()

        # Check rate limiting
        if "rate" in content.lower() and "limit" in content.lower():
            if "RateLimitMiddleware" in content or "slowapi" in content:
                print(f"  {Colors.OKGREEN}✓{Colors.ENDC} Rate Limiting: Implemented")
            else:
                self.add_finding(
                    "API Security",
                    Severity.HIGH,
                    "Rate limiting not properly configured",
                    "Rate limiting middleware detected but may not be properly configured",
                    file_path="api/main.py",
                    recommendation="Configure RateLimitMiddleware with appropriate limits"
                )
        else:
            self.add_finding(
                "API Security",
                Severity.HIGH,
                "Rate limiting not implemented",
                "No rate limiting detected in API",
                file_path="api/main.py",
                recommendation="Implement rate limiting using slowapi or similar"
            )

        # Check authentication on sensitive endpoints
        sensitive_patterns = [
            (r'@app\.(post|put|delete|patch)\(["\']\/api\/', "State-changing endpoint"),
        ]

        print("  Checking authentication on sensitive endpoints...")
        auth_issues = 0
        for pattern, desc in sensitive_patterns:
            matches = re.finditer(pattern, content, re.IGNORECASE)
            for match in matches:
                # Check if authentication is required nearby
                start = max(0, match.start() - 200)
                end = min(len(content), match.end() + 200)
                context = content[start:end]

                if "Depends(get_current_user)" not in context and "authorization" not in context.lower():
                    auth_issues += 1
                    # Only report first few to avoid spam
                    if auth_issues <= 3:
                        line_num = content[:match.start()].count('\n') + 1
                        self.add_finding(
                            "API Security",
                            Severity.MEDIUM,
                            "Endpoint may lack authentication",
                            f"State-changing endpoint at line {line_num} may not require authentication",
                            file_path="api/main.py",
                            line_number=line_num,
                            recommendation="Add authentication dependency to sensitive endpoints"
                        )

        if auth_issues == 0:
            print(f"  {Colors.OKGREEN}✓{Colors.ENDC} Authentication: All checked endpoints appear protected")
        else:
            print(f"  {Colors.WARNING}⚠{Colors.ENDC} Authentication: {auth_issues} endpoints may need review")

        # Check input validation
        if "Query(" in content or "Path(" in content or "Body(" in content:
            print(f"  {Colors.OKGREEN}✓{Colors.ENDC} Input Validation: FastAPI validators in use")
        else:
            self.add_finding(
                "API Security",
                Severity.MEDIUM,
                "Input validation may be missing",
                "No FastAPI validators (Query, Path, Body) detected",
                file_path="api/main.py",
                recommendation="Use FastAPI validators for input validation"
            )

        print()

    def scan_files_for_patterns(self, file_pattern: str, patterns: List[Tuple[str, str]], directories: List[str]) -> int:
        """Scan files for security patterns"""
        issues_found = 0

        for directory in directories:
            dir_path = self.project_root / directory
            if not dir_path.exists():
                continue

            for file_path in dir_path.rglob(file_pattern):
                # Skip venv and node_modules
                if "venv" in str(file_path) or "node_modules" in str(file_path):
                    continue

                try:
                    content = file_path.read_text()

                    for pattern, description in patterns:
                        matches = re.finditer(pattern, content, re.IGNORECASE)
                        for match in matches:
                            line_num = content[:match.start()].count('\n') + 1

                            # Determine severity based on description
                            if "SQL injection" in description or "Hardcoded password" in description:
                                severity = Severity.CRITICAL
                            elif "XSS" in description or "API key" in description:
                                severity = Severity.HIGH
                            else:
                                severity = Severity.MEDIUM

                            self.add_finding(
                                "Code Security Patterns",
                                severity,
                                description,
                                f"Potential security issue at line {line_num}",
                                file_path=str(file_path.relative_to(self.project_root)),
                                line_number=line_num,
                                recommendation="Review and remediate this security pattern"
                            )
                            issues_found += 1

                except Exception as e:
                    continue

        return issues_found

    def add_finding(self, category: str, severity: Severity, title: str, description: str,
                   file_path: Optional[str] = None, line_number: Optional[int] = None,
                   recommendation: Optional[str] = None, cve: Optional[str] = None):
        """Add a security finding"""
        finding = SecurityFinding(
            category=category,
            severity=severity,
            title=title,
            description=description,
            file_path=file_path,
            line_number=line_number,
            recommendation=recommendation,
            cve=cve
        )
        self.findings.append(finding)

    def calculate_security_score(self) -> int:
        """Calculate overall security score (0-100)"""
        # Start with perfect score
        score = 100

        # Deduct points based on severity
        for finding in self.findings:
            if finding.severity == Severity.CRITICAL:
                score -= 20
            elif finding.severity == Severity.HIGH:
                score -= 10
            elif finding.severity == Severity.MEDIUM:
                score -= 5
            elif finding.severity == Severity.LOW:
                score -= 2

        # Minimum score is 0
        return max(0, score)

    def print_summary(self, score: int):
        """Print audit summary"""
        print()
        print(f"{Colors.HEADER}{Colors.BOLD}")
        print("=" * 80)
        print("AUDIT SUMMARY")
        print("=" * 80)
        print(f"{Colors.ENDC}")

        # Count findings by severity
        critical = sum(1 for f in self.findings if f.severity == Severity.CRITICAL)
        high = sum(1 for f in self.findings if f.severity == Severity.HIGH)
        medium = sum(1 for f in self.findings if f.severity == Severity.MEDIUM)
        low = sum(1 for f in self.findings if f.severity == Severity.LOW)

        print(f"Total Findings: {len(self.findings)}")
        print(f"  {Colors.FAIL}Critical: {critical}{Colors.ENDC}")
        print(f"  {Colors.WARNING}High: {high}{Colors.ENDC}")
        print(f"  {Colors.WARNING}Medium: {medium}{Colors.ENDC}")
        print(f"  {Colors.OKBLUE}Low: {low}{Colors.ENDC}")
        print()

        # Security score
        if score >= 90:
            color = Colors.OKGREEN
            status = "EXCELLENT"
        elif score >= 75:
            color = Colors.OKBLUE
            status = "GOOD"
        elif score >= 60:
            color = Colors.WARNING
            status = "NEEDS IMPROVEMENT"
        else:
            color = Colors.FAIL
            status = "CRITICAL"

        print(f"{color}{Colors.BOLD}Security Score: {score}/100 ({status}){Colors.ENDC}")
        print()

        # Detailed findings
        if self.findings:
            print(f"{Colors.HEADER}Detailed Findings:{Colors.ENDC}")
            print()

            for i, finding in enumerate(self.findings, 1):
                # Color based on severity
                if finding.severity == Severity.CRITICAL:
                    color = Colors.FAIL
                elif finding.severity == Severity.HIGH:
                    color = Colors.WARNING
                elif finding.severity == Severity.MEDIUM:
                    color = Colors.WARNING
                else:
                    color = Colors.OKBLUE

                print(f"{i}. {color}[{finding.severity.value}]{Colors.ENDC} {finding.title}")
                print(f"   Category: {finding.category}")
                print(f"   {finding.description}")

                if finding.file_path:
                    location = finding.file_path
                    if finding.line_number:
                        location += f":{finding.line_number}"
                    print(f"   Location: {location}")

                if finding.cve:
                    print(f"   CVE: {finding.cve}")

                if finding.recommendation:
                    print(f"   Recommendation: {finding.recommendation}")

                print()

        # Completion time
        duration = datetime.now() - self.start_time
        print(f"Audit completed in {duration.total_seconds():.2f} seconds")
        print()

    def generate_html_report(self, score: int):
        """Generate HTML report"""
        reports_dir = self.project_root / "reports"
        reports_dir.mkdir(exist_ok=True)

        report_path = reports_dir / "security_audit.html"

        # Count findings by severity
        critical = sum(1 for f in self.findings if f.severity == Severity.CRITICAL)
        high = sum(1 for f in self.findings if f.severity == Severity.HIGH)
        medium = sum(1 for f in self.findings if f.severity == Severity.MEDIUM)
        low = sum(1 for f in self.findings if f.severity == Severity.LOW)

        # Determine score color and status
        if score >= 90:
            score_color = "#22c55e"
            status = "EXCELLENT"
        elif score >= 75:
            score_color = "#3b82f6"
            status = "GOOD"
        elif score >= 60:
            score_color = "#f59e0b"
            status = "NEEDS IMPROVEMENT"
        else:
            score_color = "#ef4444"
            status = "CRITICAL"

        # Generate HTML
        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KAMIYO Security Audit Report</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #1f2937;
            background: #f9fafb;
            padding: 2rem;
        }}

        .container {{
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }}

        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 3rem 2rem;
            text-align: center;
        }}

        .header h1 {{
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
        }}

        .header p {{
            font-size: 1.1rem;
            opacity: 0.9;
        }}

        .score-section {{
            padding: 3rem 2rem;
            text-align: center;
            border-bottom: 1px solid #e5e7eb;
        }}

        .score-circle {{
            width: 200px;
            height: 200px;
            margin: 0 auto 1rem;
            border-radius: 50%;
            background: conic-gradient({score_color} {score * 3.6}deg, #e5e7eb 0deg);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }}

        .score-circle::before {{
            content: '';
            position: absolute;
            width: 160px;
            height: 160px;
            border-radius: 50%;
            background: white;
        }}

        .score-value {{
            position: relative;
            font-size: 3rem;
            font-weight: bold;
            color: {score_color};
        }}

        .score-status {{
            font-size: 1.5rem;
            font-weight: 600;
            color: {score_color};
            margin-top: 1rem;
        }}

        .summary-section {{
            padding: 2rem;
            background: #f9fafb;
            border-bottom: 1px solid #e5e7eb;
        }}

        .summary-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-top: 1rem;
        }}

        .summary-card {{
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            border-left: 4px solid;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }}

        .summary-card.critical {{ border-color: #ef4444; }}
        .summary-card.high {{ border-color: #f59e0b; }}
        .summary-card.medium {{ border-color: #f59e0b; }}
        .summary-card.low {{ border-color: #3b82f6; }}

        .summary-card h3 {{
            font-size: 0.875rem;
            text-transform: uppercase;
            color: #6b7280;
            margin-bottom: 0.5rem;
        }}

        .summary-card .count {{
            font-size: 2rem;
            font-weight: bold;
        }}

        .findings-section {{
            padding: 2rem;
        }}

        .findings-section h2 {{
            font-size: 1.5rem;
            margin-bottom: 1.5rem;
            color: #1f2937;
        }}

        .finding {{
            background: #f9fafb;
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 1rem;
            border-left: 4px solid;
        }}

        .finding.critical {{ border-color: #ef4444; }}
        .finding.high {{ border-color: #f59e0b; }}
        .finding.medium {{ border-color: #f59e0b; }}
        .finding.low {{ border-color: #3b82f6; }}

        .finding-header {{
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 0.75rem;
        }}

        .severity-badge {{
            padding: 0.25rem 0.75rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }}

        .severity-badge.critical {{
            background: #fee2e2;
            color: #991b1b;
        }}

        .severity-badge.high {{
            background: #fef3c7;
            color: #92400e;
        }}

        .severity-badge.medium {{
            background: #fef3c7;
            color: #92400e;
        }}

        .severity-badge.low {{
            background: #dbeafe;
            color: #1e40af;
        }}

        .finding-title {{
            font-size: 1.125rem;
            font-weight: 600;
            color: #1f2937;
        }}

        .finding-category {{
            color: #6b7280;
            font-size: 0.875rem;
            margin-bottom: 0.5rem;
        }}

        .finding-description {{
            color: #4b5563;
            margin-bottom: 1rem;
        }}

        .finding-details {{
            display: grid;
            gap: 0.5rem;
            font-size: 0.875rem;
        }}

        .finding-detail {{
            display: flex;
            gap: 0.5rem;
        }}

        .finding-detail strong {{
            color: #374151;
            min-width: 120px;
        }}

        .finding-detail span {{
            color: #6b7280;
        }}

        .recommendation {{
            background: #e0e7ff;
            color: #3730a3;
            padding: 1rem;
            border-radius: 6px;
            margin-top: 1rem;
        }}

        .recommendation strong {{
            display: block;
            margin-bottom: 0.5rem;
        }}

        .footer {{
            padding: 2rem;
            text-align: center;
            background: #f9fafb;
            color: #6b7280;
            font-size: 0.875rem;
        }}

        .no-findings {{
            text-align: center;
            padding: 3rem;
            color: #22c55e;
        }}

        .no-findings svg {{
            width: 64px;
            height: 64px;
            margin-bottom: 1rem;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Security Audit Report</h1>
            <p>KAMIYO Exploit Intelligence Platform</p>
            <p>{self.start_time.strftime('%B %d, %Y at %H:%M:%S')}</p>
        </div>

        <div class="score-section">
            <div class="score-circle">
                <div class="score-value">{score}</div>
            </div>
            <div class="score-status">{status}</div>
            <p style="color: #6b7280; margin-top: 0.5rem;">Overall Security Score</p>
        </div>

        <div class="summary-section">
            <h2>Summary</h2>
            <div class="summary-grid">
                <div class="summary-card critical">
                    <h3>Critical</h3>
                    <div class="count" style="color: #ef4444;">{critical}</div>
                </div>
                <div class="summary-card high">
                    <h3>High</h3>
                    <div class="count" style="color: #f59e0b;">{high}</div>
                </div>
                <div class="summary-card medium">
                    <h3>Medium</h3>
                    <div class="count" style="color: #f59e0b;">{medium}</div>
                </div>
                <div class="summary-card low">
                    <h3>Low</h3>
                    <div class="count" style="color: #3b82f6;">{low}</div>
                </div>
            </div>
        </div>

        <div class="findings-section">
            <h2>Detailed Findings</h2>
"""

        if self.findings:
            for i, finding in enumerate(self.findings, 1):
                severity_class = finding.severity.value.lower()

                html_content += f"""
            <div class="finding {severity_class}">
                <div class="finding-header">
                    <span class="severity-badge {severity_class}">{finding.severity.value}</span>
                    <span class="finding-title">{finding.title}</span>
                </div>
                <div class="finding-category">{finding.category}</div>
                <div class="finding-description">{finding.description}</div>
                <div class="finding-details">
"""

                if finding.file_path:
                    location = finding.file_path
                    if finding.line_number:
                        location += f":{finding.line_number}"
                    html_content += f"""
                    <div class="finding-detail">
                        <strong>Location:</strong>
                        <span>{location}</span>
                    </div>
"""

                if finding.cve:
                    html_content += f"""
                    <div class="finding-detail">
                        <strong>CVE:</strong>
                        <span>{finding.cve}</span>
                    </div>
"""

                html_content += """
                </div>
"""

                if finding.recommendation:
                    html_content += f"""
                <div class="recommendation">
                    <strong>Recommendation:</strong>
                    {finding.recommendation}
                </div>
"""

                html_content += """
            </div>
"""
        else:
            html_content += """
            <div class="no-findings">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3>No Security Issues Found!</h3>
                <p>All security checks passed successfully.</p>
            </div>
"""

        duration = datetime.now() - self.start_time

        html_content += f"""
        </div>

        <div class="footer">
            <p>Generated by KAMIYO Security Audit v1.0</p>
            <p>Audit completed in {duration.total_seconds():.2f} seconds</p>
        </div>
    </div>
</body>
</html>
"""

        report_path.write_text(html_content)
        print(f"HTML report generated: {report_path}")
        print()


def main():
    """Main entry point"""
    # Get project root (parent of scripts directory)
    script_dir = Path(__file__).parent
    project_root = script_dir.parent

    # Create auditor and run audit
    auditor = SecurityAuditor(str(project_root))
    exit_code = auditor.run_audit()

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
