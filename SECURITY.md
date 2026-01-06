# Security Policy

## Reporting Vulnerabilities

Report security vulnerabilities privately to **security@kamiyo.ai**.

Do not open public issues for security concerns. We will acknowledge receipt within 48 hours and provide a detailed response within 7 days.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x.x   | Yes       |
| < 1.0   | No        |

## Security Best Practices

### Solana Program Security

1. **PDA Validation**: Always validate PDA seeds and bumps
2. **Signer Checks**: Verify all required signers for sensitive operations
3. **Account Ownership**: Validate account ownership before mutation
4. **Arithmetic**: Use checked math to prevent overflow/underflow
5. **Reentrancy**: Complete all state changes before external calls

### SDK/Client Security

1. **Private Keys**: Never expose private keys in logs or error messages
2. **RPC Endpoints**: Use trusted RPC providers, validate responses
3. **Transaction Signing**: Verify transaction contents before signing
4. **Input Validation**: Sanitize all user inputs before on-chain operations

### API/Middleware Security

1. **Input Validation**: Validate all request parameters
2. **Rate Limiting**: Implement rate limiting for all endpoints
3. **Authentication**: Verify payment proofs cryptographically
4. **HTTPS**: Always use TLS in production
5. **Headers**: Set security headers (CORS, CSP, etc.)

### Environment Variables

Never commit secrets. Use environment variables for:

- Private keys
- RPC endpoints with API keys
- Database credentials
- API tokens

Example `.env.example`:
```bash
SOLANA_RPC_URL=https://api.devnet.solana.com
WALLET_PATH=/path/to/wallet.json
# Never commit actual values
```

## Secure Development Checklist

### Before Deployment

- [ ] All tests pass
- [ ] No private keys in codebase
- [ ] Input validation on all endpoints
- [ ] Rate limiting configured
- [ ] HTTPS/TLS enabled
- [ ] Logging excludes sensitive data
- [ ] Dependencies audited (`npm audit`, `cargo audit`)

### Solana Program

- [ ] All accounts validated
- [ ] Signer checks present
- [ ] PDAs use correct seeds
- [ ] No unchecked arithmetic
- [ ] State changes before CPIs
- [ ] Error messages don't leak data

### Smart Contract Audit

For mainnet deployment, we recommend third-party security audits. Contact us for audit recommendations.

## Known Security Considerations

### Oracle Trust

The dispute resolution system relies on oracles for quality scoring. Oracles should be:

- Trusted third parties or decentralized oracle networks
- Registered with sufficient stake
- Subject to slashing for malicious behavior

### Time-Lock Periods

Agreements have configurable time-locks (1 hour to 30 days). Consider:

- Shorter locks for low-value transactions
- Longer locks for complex dispute resolution
- Clock drift on Solana (~0.4 seconds)

### SPL Token Support

When using SPL tokens (USDC, USDT):

- Verify token mint addresses
- Handle decimal differences (6 for USDC vs 9 for SOL)
- Check token account ownership

## Security Updates

Security patches are released as soon as possible after discovery. Subscribe to GitHub releases for notifications.
