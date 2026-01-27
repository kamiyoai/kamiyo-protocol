# KAMIYO Privacy Policy

Last updated: January 27, 2025

## Overview

KAMIYO operates the MCP server at api.kamiyo.ai. This policy describes what data we collect, how we use it, and your rights.

## Data Collection

### Authentication Data
- OAuth client identifiers
- OAuth tokens (stored as SHA256 hashes)
- Solana wallet addresses (optional, only if you connect one)

### Session Data
- Session identifiers
- Request timestamps
- Tool invocation logs (tool name, success/failure status)

### Technical Data
- IP addresses (for rate limiting, not stored long-term)
- Request metrics (aggregated, anonymized)

## Data Usage

We use collected data to:
- Authenticate and authorize MCP requests
- Rate limit to prevent abuse
- Monitor service health and performance
- Debug issues when they occur

## Data Storage

- OAuth tokens: Stored as SHA256 hashes, not plaintext
- Session data: Retained for 24 hours, then deleted
- Aggregated metrics: Retained for 30 days

## Data Sharing

We do not sell or share your data with third parties. Data may be disclosed:
- To comply with legal obligations
- To protect our rights or safety
- With your explicit consent

## On-Chain Data

KAMIYO Protocol operates on Solana blockchain. On-chain data includes:
- Escrow transactions (amounts, parties, timestamps)
- Dispute records
- Reputation scores

Blockchain data is public and permanent by nature. We do not control on-chain data once submitted.

## Your Rights

You may:
- Request deletion of session data
- Disconnect your wallet to stop wallet address association
- Revoke OAuth tokens at any time

To exercise these rights, contact privacy@kamiyo.ai.

## Security

- All API traffic encrypted via TLS 1.3
- Tokens stored as cryptographic hashes
- PKCE required for OAuth flows
- Rate limiting prevents abuse

## Changes

We may update this policy. Significant changes will be communicated via our GitHub repository.

## Contact

Privacy questions: privacy@kamiyo.ai
General support: support@kamiyo.ai
GitHub: https://github.com/kamiyo-ai/kamiyo-protocol
