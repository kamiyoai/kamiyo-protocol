# Security Policy

## Reporting Vulnerabilities

**Email:** security@kamiyo.ai

Do not open public issues for security vulnerabilities.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if available)

### Response Timeline

- Initial response: 48 hours
- Status update: 7 days
- Fix timeline: Depends on severity

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

## Security Features

- Fail-closed design (unauthorized requests return 402)
- Payment replay prevention
- Transaction age validation (7 day limit)
- Minimum payment threshold ($0.10)
- No credential storage
- Read-only RPC operations

## Best Practices

### Users

- Keep dependencies updated
- Use environment variables for secrets
- Enable rate limiting
- Monitor payment activity

### Developers

- Never commit `.env` files
- Validate all inputs
- Use TypeScript strict mode and validate inputs with schemas
- Run security linters before commits

## Known Considerations
### RPC Endpoints
- Provider rate limits apply
- Use dedicated providers with SLAs
- Implement caching where appropriate

## Bug Bounty

Scope: Solana programs (kamiyo, kamiyo-escrow, kamiyo-staking, kamiyo-governance, kamiyo-transfer-hook, kamiyo-fast-voting, hive, meishi), ZK circuits, EVM contracts.

| Severity | Bounty | Example |
|----------|--------|---------|
| Critical | Up to $5,000 | Fund drain, unauthorized withdrawals |
| High | Up to $2,000 | Logic errors affecting user funds |
| Medium | Up to $500 | DoS, griefing attacks |
| Low | $100 | Informational, best practices |

Exclusions:
- Frontend/UI issues
- Third-party dependencies (unless in scope)
- Known issues documented in code

Contact: security@kamiyo.ai

## Contact

security@kamiyo.ai
