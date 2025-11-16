#!/usr/bin/env python3
"""
KAMIYO Pre-Launch Verification Script

This script performs comprehensive pre-launch checks to ensure all systems
are ready for production deployment.

Usage:
    python3 scripts/pre_launch_verification.py
    python3 scripts/pre_launch_verification.py --production  # Check production URLs
"""

import os
import sys
import json
import subprocess
from typing import Dict, List, Tuple
from urllib.parse import urlparse

# Color codes for terminal output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
BOLD = '\033[1m'
RESET = '\033[0m'

class PreLaunchVerifier:
    def __init__(self, production_mode: bool = False):
        self.production_mode = production_mode
        self.base_url = "https://api.kamiyo.ai" if production_mode else "http://localhost:8000"
        self.frontend_url = "https://kamiyo.ai" if production_mode else "http://localhost:3000"
        self.checks_passed = 0
        self.checks_failed = 0
        self.checks_warning = 0
        self.results = []

    def print_header(self, text: str):
        """Print a section header."""
        print(f"\n{BOLD}{BLUE}{'='*80}{RESET}")
        print(f"{BOLD}{BLUE}{text:^80}{RESET}")
        print(f"{BOLD}{BLUE}{'='*80}{RESET}\n")

    def print_check(self, name: str, passed: bool, message: str = "", warning: bool = False):
        """Print a check result."""
        if warning:
            icon = f"{YELLOW}⚠{RESET}"
            status = f"{YELLOW}WARNING{RESET}"
            self.checks_warning += 1
        elif passed:
            icon = f"{GREEN}✓{RESET}"
            status = f"{GREEN}PASS{RESET}"
            self.checks_passed += 1
        else:
            icon = f"{RED}✗{RESET}"
            status = f"{RED}FAIL{RESET}"
            self.checks_failed += 1

        print(f"{icon} {name:50} [{status}]")
        if message:
            print(f"  → {message}")

        self.results.append({
            "name": name,
            "passed": passed,
            "warning": warning,
            "message": message
        })

    def check_environment_file(self) -> bool:
        """Check if .env file exists and is not empty."""
        self.print_header("1. ENVIRONMENT CONFIGURATION")

        env_path = ".env"
        if os.path.exists(env_path):
            size = os.path.getsize(env_path)
            self.print_check(
                "Environment file exists",
                True,
                f"Found .env ({size} bytes)"
            )
            return True
        else:
            self.print_check(
                "Environment file exists",
                False,
                "Missing .env file - create from .env.example"
            )
            return False

    def check_production_secrets(self) -> bool:
        """Run the production secrets verification script."""
        print(f"\n{BOLD}Running production secrets verification...{RESET}\n")

        try:
            result = subprocess.run(
                ["python3", "scripts/verify_production_secrets.py"],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                self.print_check(
                    "Production secrets verification",
                    True,
                    "All secrets validated"
                )
                return True
            else:
                self.print_check(
                    "Production secrets verification",
                    False,
                    "Secrets validation failed - see output above"
                )
                print(result.stdout)
                print(result.stderr)
                return False
        except FileNotFoundError:
            self.print_check(
                "Production secrets verification",
                False,
                "Script not found: scripts/verify_production_secrets.py"
            )
            return False
        except Exception as e:
            self.print_check(
                "Production secrets verification",
                False,
                f"Error running verification: {str(e)}"
            )
            return False

    def check_security_audit(self) -> bool:
        """Run the security audit script."""
        self.print_header("2. SECURITY AUDIT")

        print(f"\n{BOLD}Running security audit...{RESET}\n")

        try:
            result = subprocess.run(
                ["python3", "scripts/security_audit.py"],
                capture_output=True,
                text=True,
                timeout=60
            )

            # Security audit passes with score >= 90
            if result.returncode == 0:
                self.print_check(
                    "Security audit",
                    True,
                    "Security score >= 90 (PASS)"
                )
                return True
            else:
                self.print_check(
                    "Security audit",
                    False,
                    "Security score < 90 - see reports/security_audit.html"
                )
                return False
        except FileNotFoundError:
            self.print_check(
                "Security audit",
                False,
                "Script not found: scripts/security_audit.py"
            )
            return False
        except Exception as e:
            self.print_check(
                "Security audit",
                False,
                f"Error running audit: {str(e)}"
            )
            return False

    def check_tests(self) -> bool:
        """Run the test suites."""
        self.print_header("3. TEST SUITES")

        all_passed = True

        # Check if pytest is installed
        try:
            subprocess.run(["pytest", "--version"], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            self.print_check(
                "pytest installed",
                False,
                "Install with: pip install pytest pytest-asyncio"
            )
            return False

        self.print_check("pytest installed", True, "pytest is available")

        # Run x402 tests
        print(f"\n{BOLD}Running x402 payment tests...{RESET}")
        try:
            result = subprocess.run(
                ["pytest", "tests/x402/test_e2e_payment_flow.py", "-v", "--tb=short"],
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode == 0:
                # Count passed tests
                lines = result.stdout.split('\n')
                passed_line = [l for l in lines if 'passed' in l.lower()]
                self.print_check(
                    "x402 payment flow tests",
                    True,
                    passed_line[0].strip() if passed_line else "All tests passed"
                )
            else:
                self.print_check(
                    "x402 payment flow tests",
                    False,
                    "Some tests failed - run: pytest tests/x402/test_e2e_payment_flow.py -v"
                )
                all_passed = False
        except FileNotFoundError:
            self.print_check(
                "x402 payment flow tests",
                False,
                "Test file not found"
            )
            all_passed = False
        except Exception as e:
            self.print_check(
                "x402 payment flow tests",
                False,
                f"Error running tests: {str(e)}"
            )
            all_passed = False

        # Run Stripe tests
        print(f"\n{BOLD}Running Stripe payment tests...{RESET}")
        try:
            result = subprocess.run(
                ["pytest", "tests/test_stripe_e2e.py", "-v", "--tb=short"],
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode == 0:
                lines = result.stdout.split('\n')
                passed_line = [l for l in lines if 'passed' in l.lower()]
                self.print_check(
                    "Stripe subscription tests",
                    True,
                    passed_line[0].strip() if passed_line else "All tests passed"
                )
            else:
                self.print_check(
                    "Stripe subscription tests",
                    False,
                    "Some tests failed - run: pytest tests/test_stripe_e2e.py -v"
                )
                all_passed = False
        except FileNotFoundError:
            self.print_check(
                "Stripe subscription tests",
                False,
                "Test file not found"
            )
            all_passed = False
        except Exception as e:
            self.print_check(
                "Stripe subscription tests",
                False,
                f"Error running tests: {str(e)}"
            )
            all_passed = False

        return all_passed

    def check_legal_pages(self) -> bool:
        """Check if legal pages exist."""
        self.print_header("4. LEGAL DOCUMENTATION")

        all_exist = True

        # Check Privacy Policy
        if os.path.exists("pages/privacy.js"):
            size = os.path.getsize("pages/privacy.js")
            self.print_check(
                "Privacy Policy page",
                True,
                f"Found pages/privacy.js ({size:,} bytes)"
            )
        else:
            self.print_check(
                "Privacy Policy page",
                False,
                "Missing pages/privacy.js"
            )
            all_exist = False

        # Check Terms of Service
        if os.path.exists("pages/terms.js"):
            size = os.path.getsize("pages/terms.js")
            self.print_check(
                "Terms of Service page",
                True,
                f"Found pages/terms.js ({size:,} bytes)"
            )
        else:
            self.print_check(
                "Terms of Service page",
                False,
                "Missing pages/terms.js"
            )
            all_exist = False

        # Check Footer links
        if os.path.exists("components/Footer.js"):
            with open("components/Footer.js", 'r') as f:
                footer_content = f.read()
                has_privacy = '/privacy' in footer_content
                has_terms = '/terms' in footer_content

                if has_privacy and has_terms:
                    self.print_check(
                        "Footer legal links",
                        True,
                        "Privacy and Terms links found in Footer"
                    )
                else:
                    self.print_check(
                        "Footer legal links",
                        False,
                        "Missing legal links in Footer.js"
                    )
                    all_exist = False

        return all_exist

    def check_documentation(self) -> bool:
        """Check if operational documentation exists."""
        self.print_header("5. OPERATIONAL DOCUMENTATION")

        docs = [
            ("Uptime Monitoring Guide", "docs/UPTIME_MONITORING_SETUP.md"),
            ("On-Call Rotation Guide", "docs/ON_CALL_ROTATION.md"),
            ("Custom Domains Guide", "docs/CUSTOM_DOMAINS_SETUP.md"),
            ("Production Checklist", "docs/PRODUCTION_CHECKLIST.md"),
            ("Monitoring Guide", "docs/MONITORING.md"),
            ("MCP Setup Guide", "docs/MCP_SETUP_GUIDE.md"),
        ]

        all_exist = True
        for name, path in docs:
            if os.path.exists(path):
                size = os.path.getsize(path)
                self.print_check(
                    name,
                    True,
                    f"{size:,} bytes"
                )
            else:
                self.print_check(
                    name,
                    False,
                    f"Missing {path}"
                )
                all_exist = False

        return all_exist

    def check_api_health(self) -> bool:
        """Check API health endpoint."""
        self.print_header("6. API HEALTH CHECKS")

        if not self.production_mode:
            self.print_check(
                "API health check",
                True,
                "Skipped in local mode (use --production to test)",
                warning=True
            )
            return True

        try:
            import requests

            # Check /health endpoint
            try:
                response = requests.get(f"{self.base_url}/health", timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    self.print_check(
                        "API /health endpoint",
                        True,
                        f"Status: {data.get('status', 'unknown')}"
                    )
                else:
                    self.print_check(
                        "API /health endpoint",
                        False,
                        f"HTTP {response.status_code}"
                    )
                    return False
            except Exception as e:
                self.print_check(
                    "API /health endpoint",
                    False,
                    f"Error: {str(e)}"
                )
                return False

            # Check /ready endpoint
            try:
                response = requests.get(f"{self.base_url}/ready", timeout=10)
                if response.status_code == 200:
                    self.print_check(
                        "API /ready endpoint",
                        True,
                        "API is ready"
                    )
                else:
                    self.print_check(
                        "API /ready endpoint",
                        False,
                        f"HTTP {response.status_code}"
                    )
                    return False
            except Exception as e:
                self.print_check(
                    "API /ready endpoint",
                    False,
                    f"Error: {str(e)}"
                )
                return False

            return True

        except ImportError:
            self.print_check(
                "API health checks",
                True,
                "Skipped (install requests: pip install requests)",
                warning=True
            )
            return True

    def check_frontend(self) -> bool:
        """Check frontend availability."""
        self.print_header("7. FRONTEND CHECKS")

        if not self.production_mode:
            self.print_check(
                "Frontend health",
                True,
                "Skipped in local mode (use --production to test)",
                warning=True
            )
            return True

        try:
            import requests

            # Check frontend root
            try:
                response = requests.get(self.frontend_url, timeout=10)
                if response.status_code == 200:
                    self.print_check(
                        "Frontend homepage",
                        True,
                        f"HTTP 200 ({len(response.content):,} bytes)"
                    )
                else:
                    self.print_check(
                        "Frontend homepage",
                        False,
                        f"HTTP {response.status_code}"
                    )
                    return False
            except Exception as e:
                self.print_check(
                    "Frontend homepage",
                    False,
                    f"Error: {str(e)}"
                )
                return False

            # Check HTTPS redirect
            if self.frontend_url.startswith("https://"):
                try:
                    response = requests.get(
                        self.frontend_url.replace("https://", "http://"),
                        timeout=10,
                        allow_redirects=False
                    )
                    if response.status_code in [301, 302, 307, 308]:
                        self.print_check(
                            "HTTPS redirect",
                            True,
                            f"HTTP redirects to HTTPS (HTTP {response.status_code})"
                        )
                    else:
                        self.print_check(
                            "HTTPS redirect",
                            False,
                            "No HTTPS redirect configured",
                            warning=True
                        )
                except Exception:
                    pass  # Skip if HTTP is not accessible

            return True

        except ImportError:
            self.print_check(
                "Frontend checks",
                True,
                "Skipped (install requests: pip install requests)",
                warning=True
            )
            return True

    def print_manual_checklist(self):
        """Print manual verification checklist."""
        self.print_header("8. MANUAL VERIFICATION CHECKLIST")

        print(f"{BOLD}The following items require manual verification:{RESET}\n")

        manual_checks = [
            ("Sentry Configuration", [
                "SENTRY_DSN configured in production",
                "Error tracking is active",
                "No critical errors in dashboard",
            ]),
            ("Stripe Configuration", [
                "Using live keys (sk_live_*, pk_live_*)",
                "Webhook endpoint registered",
                "Webhook signature verification working",
                "Test subscription creation",
                "Test payment processing",
            ]),
            ("x402 Configuration", [
                "Production payment addresses configured",
                "Mainnet RPC URLs configured",
                "Test USDC payment on Base",
                "Test USDC payment on Ethereum",
                "Test USDC payment on Solana",
                "Verify token generation",
            ]),
            ("Monitoring Setup", [
                "UptimeRobot monitors configured (4 monitors)",
                "Alert channels configured (Email, Slack, PagerDuty)",
                "Status page created and accessible",
                "Test alert notifications",
            ]),
            ("On-Call Rotation", [
                "PagerDuty/Opsgenie configured",
                "On-call schedule created",
                "Primary and secondary contacts assigned",
                "Escalation policies defined",
                "Test paging system",
            ]),
            ("Custom Domains", [
                "kamiyo.ai → Frontend",
                "www.kamiyo.ai → Frontend",
                "api.kamiyo.ai → API",
                "SSL certificates provisioned",
                "HTTPS enforced",
                "DNS propagated (check with: dig kamiyo.ai)",
            ]),
            ("Database", [
                "PostgreSQL database provisioned",
                "Migrations applied",
                "Backups enabled (daily automatic)",
                "Test database connection",
                "Verify data integrity",
            ]),
            ("Email Addresses", [
                "privacy@kamiyo.ai configured",
                "legal@kamiyo.ai configured",
                "support@kamiyo.ai configured",
                "abuse@kamiyo.ai configured",
            ]),
        ]

        for category, items in manual_checks:
            print(f"\n{BOLD}{YELLOW}□ {category}{RESET}")
            for item in items:
                print(f"  ○ {item}")

    def print_summary(self):
        """Print verification summary."""
        self.print_header("VERIFICATION SUMMARY")

        total = self.checks_passed + self.checks_failed + self.checks_warning
        pass_rate = (self.checks_passed / total * 100) if total > 0 else 0

        print(f"\n{BOLD}Automated Checks:{RESET}")
        print(f"  {GREEN}✓ Passed:{RESET}  {self.checks_passed}")
        print(f"  {RED}✗ Failed:{RESET}  {self.checks_failed}")
        print(f"  {YELLOW}⚠ Warning:{RESET} {self.checks_warning}")
        print(f"  {BOLD}Total:{RESET}    {total}")
        print(f"  {BOLD}Pass Rate:{RESET} {pass_rate:.1f}%")

        print(f"\n{BOLD}Recommendation:{RESET}")
        if self.checks_failed == 0:
            print(f"  {GREEN}✓ ALL CHECKS PASSED{RESET}")
            print(f"  {GREEN}Ready for production launch!{RESET}")
            print(f"\n  Next steps:")
            print(f"  1. Complete manual verification checklist above")
            print(f"  2. Deploy to production (git push)")
            print(f"  3. Monitor for 1 hour post-launch")
            return 0
        elif self.checks_failed <= 2:
            print(f"  {YELLOW}⚠ MINOR ISSUES DETECTED{RESET}")
            print(f"  {YELLOW}Fix {self.checks_failed} failed check(s) before launch{RESET}")
            return 1
        else:
            print(f"  {RED}✗ CRITICAL ISSUES DETECTED{RESET}")
            print(f"  {RED}DO NOT LAUNCH - Fix {self.checks_failed} issues first{RESET}")
            return 1

        print()

def main():
    """Main entry point."""
    production_mode = "--production" in sys.argv

    print(f"\n{BOLD}{BLUE}{'*'*80}{RESET}")
    print(f"{BOLD}{BLUE}{'KAMIYO PRE-LAUNCH VERIFICATION':^80}{RESET}")
    print(f"{BOLD}{BLUE}{'*'*80}{RESET}")

    mode = "PRODUCTION" if production_mode else "LOCAL"
    print(f"\n{BOLD}Mode:{RESET} {mode}")
    print(f"{BOLD}Date:{RESET} {subprocess.getoutput('date')}")

    verifier = PreLaunchVerifier(production_mode=production_mode)

    # Run all checks
    verifier.check_environment_file()
    verifier.check_production_secrets()
    verifier.check_security_audit()
    verifier.check_tests()
    verifier.check_legal_pages()
    verifier.check_documentation()
    verifier.check_api_health()
    verifier.check_frontend()

    # Print manual checklist
    verifier.print_manual_checklist()

    # Print summary and exit with appropriate code
    exit_code = verifier.print_summary()
    sys.exit(exit_code)

if __name__ == "__main__":
    main()
