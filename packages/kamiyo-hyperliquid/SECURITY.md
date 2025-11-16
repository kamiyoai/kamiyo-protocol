# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of KAMIYO Hyperliquid seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Reporting Process

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to:

- **Email**: security@kamiyo.ai
- **Subject**: [SECURITY] Brief description of the issue

### What to Include

Please include the following information in your report:

- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Varies based on severity
  - Critical: 1-7 days
  - High: 7-30 days
  - Medium: 30-90 days
  - Low: Best effort

### Disclosure Policy

- We will confirm receipt of your vulnerability report within 48 hours
- We will provide regular updates about our progress
- We will notify you when the vulnerability is fixed
- We will publicly disclose the vulnerability after a fix is released (unless you request otherwise)
- We will credit you for the discovery (unless you prefer to remain anonymous)

## Security Measures

### Application Security

#### Input Validation
- All user inputs are validated and sanitized
- Type checking on all API parameters
- Maximum length enforcement on string inputs
- Regex validation for structured data (addresses, URLs, etc.)

#### SQL Injection Prevention
- Parameterized queries exclusively
- ORM with built-in protections
- Input sanitization before database operations
- Strict type enforcement

#### Cross-Site Scripting (XSS) Prevention
- Output encoding for all user-generated content
- Content Security Policy (CSP) headers
- HTTPOnly cookies
- Secure cookie flags

#### Cross-Site Request Forgery (CSRF) Protection
- CSRF tokens for state-changing operations
- SameSite cookie attribute
- Origin header validation

#### Authentication & Authorization
- API key authentication for write operations
- Rate limiting per API key
- Role-based access control (RBAC)
- Secure session management

### Infrastructure Security

#### Network Security
- HTTPS/TLS 1.3 only
- Strong cipher suites
- HSTS headers
- Certificate pinning for critical connections

#### Data Protection
- Encryption at rest for sensitive data
- Encrypted backups
- Secure key management
- Data retention policies

#### Monitoring & Logging
- Security event logging
- Anomaly detection
- Failed authentication tracking
- Rate limit violation alerts

### Dependencies

#### Dependency Management
- Regular dependency audits
- Automated vulnerability scanning
- Timely security patches
- Minimal dependency footprint

#### Supply Chain Security
- Dependency pinning
- Checksum verification
- Official package sources only
- License compliance

## Security Best Practices

### For Contributors

1. **Never commit secrets**
   - No API keys, passwords, or tokens in code
   - Use environment variables
   - Check with git-secrets before committing

2. **Follow secure coding guidelines**
   - OWASP Top 10 awareness
   - Input validation
   - Least privilege principle
   - Defense in depth

3. **Keep dependencies updated**
   - Regular `pip audit` or `safety check`
   - Update to patched versions promptly
   - Review changelogs for security fixes

4. **Code review requirements**
   - Security review for sensitive changes
   - At least one approval required
   - Automated security scanning

### For Users

1. **API Key Security**
   - Never share API keys
   - Rotate keys regularly
   - Use environment variables
   - Revoke unused keys

2. **Rate Limiting**
   - Implement exponential backoff
   - Respect rate limits
   - Monitor usage patterns

3. **Data Validation**
   - Validate all API responses
   - Don't trust external data
   - Implement client-side rate limiting

## Known Security Considerations

### Rate Limiting
- Default: 100 requests per minute per IP
- Authenticated: 1000 requests per minute per API key
- WebSocket: 10 connections per IP

### Data Retention
- Exploit data: Retained indefinitely
- API logs: 90 days
- Error logs: 30 days
- Audit logs: 1 year

### Third-Party Services
- Hyperliquid API: Official API endpoints only
- GitHub: Read-only access to public data
- CoinGlass: Public data aggregation only

## Vulnerability Disclosure Examples

### Example 1: SQL Injection
```
Type: SQL Injection
Location: /api/main.py:line_number
Severity: Critical

Description:
User-controlled input in the 'chain' parameter is concatenated
directly into SQL query without sanitization.

Reproduction:
1. Send GET /exploits?chain='; DROP TABLE exploits; --
2. Observe SQL error message
3. Exploit confirmed

Impact:
Full database compromise possible

Recommendation:
Use parameterized queries for all database operations
```

### Example 2: Authentication Bypass
```
Type: Authentication Bypass
Location: /api/middleware/auth.py
Severity: High

Description:
API key validation can be bypassed by setting X-API-Key
header to 'null' string

Reproduction:
1. Send request with X-API-Key: null
2. Access protected endpoint without valid key
3. Bypass confirmed

Impact:
Unauthorized access to write operations

Recommendation:
Strict type checking on authentication headers
```

## Security Checklist

Before deploying to production:

- [ ] All dependencies audited and up to date
- [ ] Environment variables configured (no hardcoded secrets)
- [ ] HTTPS/TLS properly configured
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints
- [ ] SQL injection protections verified
- [ ] XSS protections verified
- [ ] CSRF protections enabled
- [ ] Security headers configured
- [ ] Logging and monitoring enabled
- [ ] Backup and recovery tested
- [ ] Incident response plan documented

## Contact

For security concerns, contact:
- **Email**: security@kamiyo.ai
- **PGP Key**: Available on request

For general questions:
- **GitHub Issues**: https://github.com/mizuki-tamaki/kamiyo-hyperliquid/issues
- **Email**: info@kamiyo.ai

## Recognition

We appreciate the security research community's efforts in responsibly disclosing vulnerabilities. Security researchers who report valid vulnerabilities will be:

- Publicly acknowledged (with permission)
- Included in our Hall of Fame
- Provided with swag and bounties (when budget allows)

Thank you for helping keep KAMIYO Hyperliquid and our users safe!
