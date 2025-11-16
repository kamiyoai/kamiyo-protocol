#!/usr/bin/env python3
"""
KAMIYO Production Secrets Verification Script

Validates all production environment variables before deployment.
Ensures no insecure defaults, proper formats, and production-ready configuration.

Usage:
    python scripts/verify_production_secrets.py

Exit Codes:
    0 - All checks passed
    1 - One or more checks failed
"""

import os
import sys
import re
from typing import List, Tuple, Optional
from dotenv import load_dotenv

# ANSI color codes for terminal output
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    MAGENTA = '\033[0;35m'
    CYAN = '\033[0;36m'
    BOLD = '\033[1m'
    NC = '\033[0m'  # No Color


class ValidationError:
    """Represents a validation error"""
    def __init__(self, category: str, field: str, message: str, severity: str = "error"):
        self.category = category
        self.field = field
        self.message = message
        self.severity = severity  # "error" or "warning"

    def __str__(self):
        icon = "❌" if self.severity == "error" else "⚠️"
        color = Colors.RED if self.severity == "error" else Colors.YELLOW
        return f"{color}{icon} {self.category} - {self.field}: {self.message}{Colors.NC}"


class SecretValidator:
    """Validates production secrets and environment configuration"""

    def __init__(self):
        self.errors: List[ValidationError] = []
        self.warnings: List[ValidationError] = []

    def add_error(self, category: str, field: str, message: str):
        """Add a validation error"""
        self.errors.append(ValidationError(category, field, message, "error"))

    def add_warning(self, category: str, field: str, message: str):
        """Add a validation warning"""
        self.warnings.append(ValidationError(category, field, message, "warning"))

    def check_required_secret(self, category: str, var_name: str, min_length: int = 32) -> Optional[str]:
        """
        Check if a required secret exists and meets minimum length.
        Returns the value if valid, None if invalid.
        """
        value = os.getenv(var_name, '').strip()

        if not value:
            self.add_error(category, var_name, "Not set (required)")
            return None

        if len(value) < min_length:
            self.add_error(
                category,
                var_name,
                f"Too short ({len(value)} chars, must be ≥{min_length})"
            )
            return None

        return value

    def check_no_default_value(self, category: str, var_name: str, forbidden_values: List[str]) -> bool:
        """Check that a variable is not using a default/insecure value"""
        value = os.getenv(var_name, '').strip()

        if not value:
            return True  # Already handled by check_required_secret

        for forbidden in forbidden_values:
            if value == forbidden:
                self.add_error(
                    category,
                    var_name,
                    f"Using insecure default value (must be changed for production)"
                )
                return False

        return True

    def check_stripe_keys(self) -> bool:
        """Validate Stripe API keys for production"""
        all_valid = True

        # Check secret key
        secret_key = os.getenv('STRIPE_SECRET_KEY', '').strip()
        if not secret_key:
            self.add_error("Stripe", "STRIPE_SECRET_KEY", "Not set (required)")
            all_valid = False
        elif not secret_key.startswith('sk_live_'):
            self.add_error(
                "Stripe",
                "STRIPE_SECRET_KEY",
                f"Must start with 'sk_live_' for production (found: {secret_key[:10]}...)"
            )
            all_valid = False

        # Check publishable key
        pub_key = os.getenv('STRIPE_PUBLISHABLE_KEY', '').strip()
        if not pub_key:
            self.add_error("Stripe", "STRIPE_PUBLISHABLE_KEY", "Not set (required)")
            all_valid = False
        elif not pub_key.startswith('pk_live_'):
            self.add_error(
                "Stripe",
                "STRIPE_PUBLISHABLE_KEY",
                f"Must start with 'pk_live_' for production (found: {pub_key[:10]}...)"
            )
            all_valid = False

        # Check webhook secret
        webhook_secret = os.getenv('STRIPE_WEBHOOK_SECRET', '').strip()
        if not webhook_secret:
            self.add_error("Stripe", "STRIPE_WEBHOOK_SECRET", "Not set (required)")
            all_valid = False
        elif not webhook_secret.startswith('whsec_'):
            self.add_warning(
                "Stripe",
                "STRIPE_WEBHOOK_SECRET",
                f"Should start with 'whsec_' (found: {webhook_secret[:10]}...)"
            )

        return all_valid

    def check_core_secrets(self) -> bool:
        """Validate core authentication secrets"""
        all_valid = True

        # NEXTAUTH_SECRET
        if self.check_required_secret("Core Secrets", "NEXTAUTH_SECRET", 32) is None:
            all_valid = False

        # CSRF_SECRET_KEY
        csrf_secret = self.check_required_secret("Core Secrets", "CSRF_SECRET_KEY", 32)
        if csrf_secret is None:
            all_valid = False
        else:
            # Check for default value
            if not self.check_no_default_value(
                "Core Secrets",
                "CSRF_SECRET_KEY",
                ["CHANGE_THIS_IN_PRODUCTION_USE_32_CHARS_MINIMUM"]
            ):
                all_valid = False

        # JWT_SECRET
        jwt_secret = self.check_required_secret("Core Secrets", "JWT_SECRET", 32)
        if jwt_secret is None:
            all_valid = False
        else:
            # Check for common default values
            if not self.check_no_default_value(
                "Core Secrets",
                "JWT_SECRET",
                [
                    "dev_jwt_secret_change_in_production",
                    "your_mcp_jwt_secret_here_32_chars_minimum"
                ]
            ):
                all_valid = False

        # MCP_JWT_SECRET (if different from JWT_SECRET)
        mcp_jwt = os.getenv('MCP_JWT_SECRET', '').strip()
        if mcp_jwt:
            if len(mcp_jwt) < 32:
                self.add_error(
                    "Core Secrets",
                    "MCP_JWT_SECRET",
                    f"Too short ({len(mcp_jwt)} chars, must be ≥32)"
                )
                all_valid = False
            elif mcp_jwt in ["dev_jwt_secret_change_in_production", "your_mcp_jwt_secret_here_32_chars_minimum"]:
                self.add_error(
                    "Core Secrets",
                    "MCP_JWT_SECRET",
                    "Using insecure default value"
                )
                all_valid = False

        return all_valid

    def check_x402_secrets(self) -> bool:
        """Validate x402 payment system configuration"""
        all_valid = True

        # X402_ADMIN_KEY
        admin_key = self.check_required_secret("x402 Payment", "X402_ADMIN_KEY", 32)
        if admin_key is None:
            all_valid = False
        else:
            # Check for known default values
            forbidden_defaults = [
                "dev_x402_admin_key_change_in_production",
                "your_secure_admin_key_here",
                "IfvCvAe4z3_qujafiuR_ZCMuDr1XvbrxMCCu7Bab3Dw5IZPV16OUVvMDWEsxFunw"  # development value
            ]
            if not self.check_no_default_value("x402 Payment", "X402_ADMIN_KEY", forbidden_defaults):
                all_valid = False

        # ADMIN_API_KEY (legacy)
        admin_api_key = os.getenv('ADMIN_API_KEY', '').strip()
        if admin_api_key:
            if admin_api_key == "dev_admin_key_change_in_production":
                self.add_error(
                    "x402 Payment",
                    "ADMIN_API_KEY",
                    "Using insecure default value"
                )
                all_valid = False
            elif len(admin_api_key) < 32:
                self.add_warning(
                    "x402 Payment",
                    "ADMIN_API_KEY",
                    f"Weak key ({len(admin_api_key)} chars, recommend ≥32)"
                )

        return all_valid

    def validate_ethereum_address(self, address: str) -> bool:
        """Validate Ethereum address format"""
        if not address:
            return False

        # Must start with 0x and be 42 characters total
        if not re.match(r'^0x[a-fA-F0-9]{40}$', address):
            return False

        return True

    def validate_solana_address(self, address: str) -> bool:
        """Validate Solana address format (Base58, 32-44 chars)"""
        if not address:
            return False

        # Solana addresses are Base58 encoded, typically 32-44 characters
        # No 0, O, I, l characters in Base58
        if not re.match(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$', address):
            return False

        return True

    def validate_url(self, url: str) -> bool:
        """Validate URL format"""
        if not url:
            return False

        # Basic URL validation
        url_pattern = re.compile(
            r'^https?://'  # http:// or https://
            r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain
            r'localhost|'  # localhost
            r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # or IP
            r'(?::\d+)?'  # optional port
            r'(?:/?|[/?]\S+)$', re.IGNORECASE
        )

        return bool(url_pattern.match(url))

    def check_payment_addresses(self) -> bool:
        """Validate x402 payment wallet addresses"""
        all_valid = True

        # Known development addresses to reject
        dev_eth_addresses = [
            '0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7',
            '0xYourBaseAddressHere',
            '0xYourEthAddressHere'
        ]
        dev_sol_addresses = [
            '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            'YourSolanaAddressHere'
        ]

        # Check Base payment address
        base_addr = os.getenv('X402_BASE_PAYMENT_ADDRESS', '').strip()
        if not base_addr:
            self.add_error("Payment Addresses", "X402_BASE_PAYMENT_ADDRESS", "Not set (required)")
            all_valid = False
        elif base_addr in dev_eth_addresses:
            self.add_error(
                "Payment Addresses",
                "X402_BASE_PAYMENT_ADDRESS",
                "Using development address (must use production wallet)"
            )
            all_valid = False
        elif not self.validate_ethereum_address(base_addr):
            self.add_error(
                "Payment Addresses",
                "X402_BASE_PAYMENT_ADDRESS",
                f"Invalid Ethereum address format: {base_addr}"
            )
            all_valid = False

        # Check Ethereum payment address
        eth_addr = os.getenv('X402_ETHEREUM_PAYMENT_ADDRESS', '').strip()
        if not eth_addr:
            self.add_error("Payment Addresses", "X402_ETHEREUM_PAYMENT_ADDRESS", "Not set (required)")
            all_valid = False
        elif eth_addr in dev_eth_addresses:
            self.add_error(
                "Payment Addresses",
                "X402_ETHEREUM_PAYMENT_ADDRESS",
                "Using development address (must use production wallet)"
            )
            all_valid = False
        elif not self.validate_ethereum_address(eth_addr):
            self.add_error(
                "Payment Addresses",
                "X402_ETHEREUM_PAYMENT_ADDRESS",
                f"Invalid Ethereum address format: {eth_addr}"
            )
            all_valid = False

        # Check Solana payment address
        sol_addr = os.getenv('X402_SOLANA_PAYMENT_ADDRESS', '').strip()
        if not sol_addr:
            self.add_error("Payment Addresses", "X402_SOLANA_PAYMENT_ADDRESS", "Not set (required)")
            all_valid = False
        elif sol_addr in dev_sol_addresses:
            self.add_error(
                "Payment Addresses",
                "X402_SOLANA_PAYMENT_ADDRESS",
                "Using development address (must use production wallet)"
            )
            all_valid = False
        elif not self.validate_solana_address(sol_addr):
            self.add_error(
                "Payment Addresses",
                "X402_SOLANA_PAYMENT_ADDRESS",
                f"Invalid Solana address format: {sol_addr}"
            )
            all_valid = False

        return all_valid

    def check_rpc_endpoints(self) -> bool:
        """Validate RPC endpoint URLs point to mainnet"""
        all_valid = True

        # Check Base RPC URL
        base_rpc = os.getenv('X402_BASE_RPC_URL', '').strip()
        if not base_rpc:
            self.add_error("RPC Endpoints", "X402_BASE_RPC_URL", "Not set (required)")
            all_valid = False
        elif 'YOUR-API-KEY' in base_rpc or 'YOUR_ALCHEMY_KEY' in base_rpc:
            self.add_error(
                "RPC Endpoints",
                "X402_BASE_RPC_URL",
                "Contains placeholder API key"
            )
            all_valid = False
        elif any(keyword in base_rpc.lower() for keyword in ['testnet', 'goerli', 'sepolia', '-test.', '/test/', 'test-']):
            self.add_error(
                "RPC Endpoints",
                "X402_BASE_RPC_URL",
                "Appears to be testnet URL (must use mainnet for production)"
            )
            all_valid = False
        elif not self.validate_url(base_rpc):
            self.add_error(
                "RPC Endpoints",
                "X402_BASE_RPC_URL",
                f"Invalid URL format: {base_rpc}"
            )
            all_valid = False

        # Check Ethereum RPC URL
        eth_rpc = os.getenv('X402_ETHEREUM_RPC_URL', '').strip()
        if not eth_rpc:
            self.add_error("RPC Endpoints", "X402_ETHEREUM_RPC_URL", "Not set (required)")
            all_valid = False
        elif 'YOUR-API-KEY' in eth_rpc or 'YOUR_ALCHEMY_KEY' in eth_rpc:
            self.add_error(
                "RPC Endpoints",
                "X402_ETHEREUM_RPC_URL",
                "Contains placeholder API key"
            )
            all_valid = False
        elif any(keyword in eth_rpc.lower() for keyword in ['testnet', 'goerli', 'sepolia', 'ropsten', 'rinkeby', '-test.', '/test/', 'test-']):
            self.add_error(
                "RPC Endpoints",
                "X402_ETHEREUM_RPC_URL",
                "Appears to be testnet URL (must use mainnet for production)"
            )
            all_valid = False
        elif not self.validate_url(eth_rpc):
            self.add_error(
                "RPC Endpoints",
                "X402_ETHEREUM_RPC_URL",
                f"Invalid URL format: {eth_rpc}"
            )
            all_valid = False

        # Check Solana RPC URL
        sol_rpc = os.getenv('X402_SOLANA_RPC_URL', '').strip()
        if not sol_rpc:
            self.add_error("RPC Endpoints", "X402_SOLANA_RPC_URL", "Not set (required)")
            all_valid = False
        elif 'YOUR-API-KEY' in sol_rpc or 'YOUR_ALCHEMY_KEY' in sol_rpc:
            self.add_error(
                "RPC Endpoints",
                "X402_SOLANA_RPC_URL",
                "Contains placeholder API key"
            )
            all_valid = False
        elif 'devnet' in sol_rpc.lower() or 'testnet' in sol_rpc.lower():
            self.add_error(
                "RPC Endpoints",
                "X402_SOLANA_RPC_URL",
                "Appears to be devnet/testnet URL (must use mainnet for production)"
            )
            all_valid = False
        elif not self.validate_url(sol_rpc):
            self.add_error(
                "RPC Endpoints",
                "X402_SOLANA_RPC_URL",
                f"Invalid URL format: {sol_rpc}"
            )
            all_valid = False

        return all_valid

    def check_environment_config(self) -> bool:
        """Validate production environment configuration"""
        all_valid = True

        # Check ENVIRONMENT variable
        env = os.getenv('ENVIRONMENT', 'development').strip()
        if env != 'production':
            self.add_error(
                "Configuration",
                "ENVIRONMENT",
                f"Must be 'production' (found: '{env}')"
            )
            all_valid = False

        return all_valid

    def check_database_urls(self) -> bool:
        """Validate database and Redis URLs"""
        all_valid = True

        # Check DATABASE_URL
        db_url = os.getenv('DATABASE_URL', '').strip()
        if db_url:
            if not self.validate_url(db_url) and not db_url.startswith('sqlite:'):
                self.add_warning(
                    "Database",
                    "DATABASE_URL",
                    "URL format may be invalid"
                )

            if 'sqlite' in db_url.lower():
                self.add_warning(
                    "Database",
                    "DATABASE_URL",
                    "Using SQLite (PostgreSQL recommended for production)"
                )

        # Check REDIS_URL
        redis_url = os.getenv('REDIS_URL', '').strip()
        if redis_url:
            if not self.validate_url(redis_url) and not redis_url.startswith('redis://'):
                self.add_warning(
                    "Database",
                    "REDIS_URL",
                    "URL format may be invalid (should start with redis://)"
                )

        return all_valid

    def run_all_checks(self) -> bool:
        """Run all validation checks"""
        print(f"{Colors.BOLD}{Colors.CYAN}")
        print("=" * 70)
        print("  KAMIYO Production Secrets Verification")
        print("=" * 70)
        print(f"{Colors.NC}\n")

        checks = [
            ("Environment Configuration", self.check_environment_config),
            ("Core Secrets (NEXTAUTH, CSRF, JWT)", self.check_core_secrets),
            ("Stripe API Keys", self.check_stripe_keys),
            ("x402 Admin Keys", self.check_x402_secrets),
            ("x402 Payment Addresses", self.check_payment_addresses),
            ("x402 RPC Endpoints", self.check_rpc_endpoints),
            ("Database URLs", self.check_database_urls),
        ]

        results = []
        for check_name, check_func in checks:
            print(f"{Colors.BLUE}🔍 Checking: {check_name}{Colors.NC}")
            result = check_func()
            results.append(result)

            if result:
                print(f"{Colors.GREEN}   ✅ Passed{Colors.NC}\n")
            else:
                print(f"{Colors.RED}   ❌ Failed{Colors.NC}\n")

        return all(results)

    def print_summary(self) -> int:
        """Print validation summary and return exit code"""
        print(f"\n{Colors.BOLD}{Colors.CYAN}")
        print("=" * 70)
        print("  VALIDATION SUMMARY")
        print("=" * 70)
        print(f"{Colors.NC}\n")

        # Print all errors
        if self.errors:
            print(f"{Colors.BOLD}{Colors.RED}ERRORS ({len(self.errors)}):{Colors.NC}\n")
            for error in self.errors:
                print(f"  {error}")
            print()

        # Print all warnings
        if self.warnings:
            print(f"{Colors.BOLD}{Colors.YELLOW}WARNINGS ({len(self.warnings)}):{Colors.NC}\n")
            for warning in self.warnings:
                print(f"  {warning}")
            print()

        # Final result
        print(f"{Colors.BOLD}")
        print("=" * 70)
        if self.errors:
            print(f"{Colors.RED}❌ VALIDATION FAILED{Colors.NC}")
            print()
            print(f"{Colors.RED}Production deployment BLOCKED due to {len(self.errors)} error(s).{Colors.NC}")
            print(f"{Colors.YELLOW}Fix all errors above before deploying to production.{Colors.NC}")
            print()
            return 1
        elif self.warnings:
            print(f"{Colors.YELLOW}⚠️  VALIDATION PASSED WITH WARNINGS{Colors.NC}")
            print()
            print(f"{Colors.YELLOW}Found {len(self.warnings)} warning(s).{Colors.NC}")
            print(f"{Colors.GREEN}Production deployment allowed, but review warnings above.{Colors.NC}")
            print()
            return 0
        else:
            print(f"{Colors.GREEN}✅ ALL CHECKS PASSED{Colors.NC}")
            print()
            print(f"{Colors.GREEN}Production secrets are properly configured.{Colors.NC}")
            print(f"{Colors.GREEN}Ready for production deployment!{Colors.NC}")
            print()
            return 0


def main():
    """Main entry point"""
    # Load environment from .env.production if it exists
    env_file = '.env.production'

    if os.path.exists(env_file):
        print(f"{Colors.CYAN}📄 Loading environment from {env_file}{Colors.NC}\n")
        load_dotenv(env_file)
    else:
        print(f"{Colors.YELLOW}⚠️  {env_file} not found, using system environment{Colors.NC}\n")

    # Create validator and run checks
    validator = SecretValidator()
    validator.run_all_checks()

    # Print summary and exit
    exit_code = validator.print_summary()
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
