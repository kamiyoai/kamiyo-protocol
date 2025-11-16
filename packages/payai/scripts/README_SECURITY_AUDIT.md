# KAMIYO Security Audit Script

Comprehensive security audit script for the KAMIYO Exploit Intelligence Platform.

## Overview

`security_audit.py` performs automated security checks across the entire codebase, identifying vulnerabilities, misconfigurations, and insecure coding patterns.

## Features

### 1. HTTP Security Headers Check
- Verifies CORS configuration (no wildcard origins)
- Checks for security headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY or SAMEORIGIN`
  - `Strict-Transport-Security` (HSTS)
  - `Content-Security-Policy`
  - `Referrer-Policy`

### 2. CSRF Protection Verification
- Confirms CSRF middleware is enabled
- Validates `CSRF_SECRET_KEY` configuration
- Documents exempt endpoints
- Verifies production configuration validation

### 3. Authentication Security
- Checks NextAuth/JWT configuration
- Verifies `JWT_SECRET` length (>= 32 chars)
- Reviews session configuration
- Validates secure authentication settings

### 4. Dependency Vulnerabilities
- Scans Python dependencies with `pip-audit`
- Scans Node.js dependencies with `npm audit`
- Reports CRITICAL, HIGH, MEDIUM, and LOW severity issues
- Includes CVE references where available

### 5. Code Security Patterns
- **SQL Injection**: Detects unsafe SQL query patterns
  - f-strings in execute()
  - String formatting in SQL
  - String concatenation in queries

- **XSS Risks**: Identifies cross-site scripting vulnerabilities
  - `dangerouslySetInnerHTML` usage
  - Direct `innerHTML` assignments

- **Secrets in Code**: Finds hardcoded credentials
  - Passwords
  - API keys
  - Stripe live keys

- **Insecure Random**: Detects use of `random` instead of `secrets` module

### 6. API Security
- Verifies rate limiting middleware
- Checks authentication on sensitive endpoints
- Validates input validation patterns

## Installation

### Prerequisites

```bash
# Install pip-audit for Python dependency scanning
pip install pip-audit

# npm audit is included with npm (no installation needed)
```

## Usage

### Basic Usage

```bash
# Run from project root
python3 scripts/security_audit.py
```

### Exit Codes

- **0**: Success (score >= 90% and no critical issues)
- **1**: Failure (score < 90% or critical issues found)

### Output

The script produces two outputs:

#### 1. Terminal Output

Color-coded findings with:
- ✓ Passed checks (green)
- ⚠ Warnings (yellow)
- ✗ Failed checks (red)

#### 2. HTML Report

Generated at: `reports/security_audit.html`

Features:
- Interactive dashboard
- Security score visualization
- Detailed findings with severity badges
- Recommendations for remediation
- CVE references for dependency vulnerabilities

## Severity Levels

| Severity | Score Impact | Description |
|----------|--------------|-------------|
| **CRITICAL** | -20 points | Immediate security risk requiring urgent action |
| **HIGH** | -10 points | Significant security concern requiring prompt attention |
| **MEDIUM** | -5 points | Moderate security issue requiring review |
| **LOW** | -2 points | Minor security concern or best practice violation |

## Security Score

The script calculates a security score from 0-100:

- **90-100**: EXCELLENT - Production ready
- **75-89**: GOOD - Minor improvements needed
- **60-74**: NEEDS IMPROVEMENT - Several issues to address
- **0-59**: CRITICAL - Major security concerns

## Example Output

```
================================================================================
KAMIYO SECURITY AUDIT
================================================================================
Started: 2025-10-29 07:50:51
Project: /Users/dennisgoslar/Projekter/kamiyo

[1/6] Checking HTTP Security Headers...
  ✓ CORS: No wildcard origins detected
  ✓ X-Content-Type-Options: nosniff
  ✓ X-Frame-Options: DENY, SAMEORIGIN
  ✓ Strict-Transport-Security: max-age
  ✓ Content-Security-Policy: default-src
  ✓ Referrer-Policy: strict-origin

[2/6] Checking CSRF Protection...
  ✓ CSRF Protection: File exists
  ⚠ CSRF_SECRET_KEY: Default value in .env.example
  ✓ Exempt Endpoints: Documented
  ✓ Production Validation: Implemented

...

================================================================================
AUDIT SUMMARY
================================================================================
Total Findings: 37
  Critical: 5
  High: 22
  Medium: 10
  Low: 0

Security Score: 0/100 (CRITICAL)
```

## Integration with CI/CD

### GitHub Actions

```yaml
name: Security Audit
on: [push, pull_request]
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-python@v2
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install pip-audit
          npm install
      - name: Run security audit
        run: python3 scripts/security_audit.py
      - name: Upload report
        uses: actions/upload-artifact@v2
        with:
          name: security-report
          path: reports/security_audit.html
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running security audit..."
python3 scripts/security_audit.py

if [ $? -ne 0 ]; then
    echo "Security audit failed. Please review findings before committing."
    echo "View report: reports/security_audit.html"
    exit 1
fi
```

## Common Issues and Fixes

### SQL Injection

**Issue**: f-strings or string concatenation in SQL queries

**Fix**: Use parameterized queries
```python
# Bad
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")

# Good
cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
```

### XSS (Cross-Site Scripting)

**Issue**: `dangerouslySetInnerHTML` or direct `innerHTML` usage

**Fix**: Use React's built-in escaping
```jsx
// Bad
<div dangerouslySetInnerHTML={{__html: userInput}} />

// Good
<div>{userInput}</div>
```

### Hardcoded Secrets

**Issue**: API keys, passwords in source code

**Fix**: Use environment variables
```python
# Bad
API_KEY = "sk_live_xxxxxxxxxxxxx"

# Good
API_KEY = os.getenv("STRIPE_SECRET_KEY")
```

### Insecure Random

**Issue**: Using `random` module for security-critical operations

**Fix**: Use `secrets` module
```python
# Bad
import random
token = random.randint(1000, 9999)

# Good
import secrets
token = secrets.randbelow(9999) + 1000
```

## Customization

### Adding Custom Checks

Edit `security_audit.py` and add a new check method:

```python
def check_custom_security(self):
    """Check custom security requirement"""
    print(f"{Colors.OKBLUE}[7/7] Checking Custom Security...{Colors.ENDC}")

    # Your check logic here
    if not some_condition:
        self.add_finding(
            "Custom Security",
            Severity.HIGH,
            "Custom check failed",
            "Description of the issue",
            recommendation="How to fix it"
        )
```

Then add it to the `run_audit()` method:
```python
def run_audit(self) -> int:
    # ... existing checks ...
    self.check_custom_security()
```

### Excluding False Positives

Add patterns to exclude specific findings:

```python
# In scan_files_for_patterns()
if "test" in str(file_path) or "mock" in str(file_path):
    continue  # Skip test files
```

## Troubleshooting

### pip-audit not found

```bash
pip install pip-audit
```

### npm audit timeout

Increase timeout in script or run manually:
```bash
npm audit --json > npm-audit.json
```

### Permission denied

Make script executable:
```bash
chmod +x scripts/security_audit.py
```

## Best Practices

1. **Run regularly**: Schedule weekly security audits
2. **Review findings**: Don't auto-fix without understanding
3. **Track progress**: Monitor score over time
4. **Fix critical first**: Prioritize by severity
5. **Update dependencies**: Keep libraries current
6. **Document exceptions**: Comment legitimate uses of flagged patterns

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [CWE - Common Weakness Enumeration](https://cwe.mitre.org/)
- [CVE - Common Vulnerabilities and Exposures](https://cve.mitre.org/)

## Support

For issues or questions about the security audit script:
- Review this documentation
- Check the script comments for implementation details
- Consult the KAMIYO security team

## Version History

- **v1.0.0** (2025-10-29): Initial release
  - HTTP security headers check
  - CSRF protection verification
  - Authentication security review
  - Dependency vulnerability scanning
  - Code pattern analysis
  - API security validation
  - HTML report generation
