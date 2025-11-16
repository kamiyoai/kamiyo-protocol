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
- Use type hints and Pydantic models
- Run security linters before commits

## Known Considerations

### PayAI Facilitator
- Third-party dependency
- User addresses visible to PayAI
- Automatic fallback to native on outage

### RPC Endpoints
- Provider rate limits apply
- Use dedicated providers with SLAs
- Implement caching where appropriate

## Contact

security@kamiyo.ai
