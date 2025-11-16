# Security Audit Quick Start Guide

## Run the Audit

```bash
python3 scripts/security_audit.py
```

## View the Report

Open the HTML report in your browser:
```bash
open reports/security_audit.html
```

## Exit Codes

- **0** = Pass (score >= 90%, no critical issues)
- **1** = Fail (score < 90% or critical issues)

## Severity Levels

| Level | Impact | Action |
|-------|--------|--------|
| 🔴 CRITICAL | -20 pts | Fix immediately |
| 🟠 HIGH | -10 pts | Fix soon |
| 🟡 MEDIUM | -5 pts | Review and fix |
| 🔵 LOW | -2 pts | Nice to fix |

## What It Checks

1. **HTTP Security Headers** - CORS, CSP, HSTS, etc.
2. **CSRF Protection** - Token validation and config
3. **Authentication** - JWT secrets, session config
4. **Dependencies** - CVE scanning (pip-audit, npm audit)
5. **Code Patterns** - SQL injection, XSS, secrets, random
6. **API Security** - Rate limiting, auth, validation

## Current Status

**Latest Audit:** October 29, 2025

- **Score:** 0/100 (CRITICAL)
- **Findings:** 37 total
  - 🔴 Critical: 5 (SQL injection)
  - 🟠 High: 22 (XSS patterns)
  - 🟡 Medium: 10 (insecure random)

## Priority Fixes

### 1. SQL Injection (CRITICAL)
Fix these files first:
- `api/discord_routes.py:483`
- `api/user_webhooks/routes.py:330`
- `database/archival.py:145, 316`
- `database/postgres_manager.py:280`

**Fix:** Use parameterized queries
```python
# Bad
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")

# Good
cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
```

### 2. XSS Patterns (HIGH)
Most are legitimate (SEO structured data), but review:
- `pages/about.js`
- `pages/features.js`
- `pages/api-docs.js`

**Fix:** Add safety comments
```jsx
{/* Safe: JSON-LD structured data for SEO */}
<script dangerouslySetInnerHTML={{__html: jsonLd}} />
```

### 3. Insecure Random (MEDIUM)
Replace in security-critical code:
- `api/auth/timing_safe.py`

**Fix:** Use secrets module
```python
# Bad
import random
token = random.randint(1000, 9999)

# Good
import secrets
token = secrets.randbelow(9999) + 1000
```

## Optional: Install Dependency Scanners

```bash
# Python vulnerability scanner
pip install pip-audit

# Re-run audit
python3 scripts/security_audit.py
```

## Integration

### GitHub Actions
```yaml
- name: Security Audit
  run: python3 scripts/security_audit.py
```

### Pre-commit Hook
```bash
#!/bin/bash
python3 scripts/security_audit.py || exit 1
```

## More Info

See detailed documentation:
- `scripts/README_SECURITY_AUDIT.md` - Full guide
- `SECURITY_AUDIT_IMPLEMENTATION.md` - Implementation details
- `reports/security_audit.html` - Visual report

## Support

Questions? Review the findings in the HTML report or check the documentation.
