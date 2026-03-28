# OOBE Partner Integration

Partner-private phase 1 for OOBE.

## Surfaces

### Hosted MCP

- Resource: `/partners/oobe/mcp`
- Authorization metadata: `/partners/oobe/.well-known/oauth-authorization-server`
- Authorize: `/partners/oobe/oauth/authorize`
- Token: `/partners/oobe/oauth/token`
- Dynamic registration: disabled

Provision a client deliberately:

```bash
pnpm --filter kamiyo-companion run provision:oobe-mcp-client -- \
  --redirect-uri https://oobe.example.com/callback
```

Supported tools:

- `meishi_verify_agent`
- `meishi_get_passport`
- `meishi_get_mandate`
- `meishi_get_audit`
- `get_api_reputation`
- `x402_check_pricing`
- `x402_fetch`
- `create_escrow`
- `check_escrow_status`
- `assess_data_quality`
- `estimate_refund`

### Partner HTTP

- Base path: `/api/partners/oobe`
- Auth: `X-API-Key: <OOBE partner api key>` or `?api_key=<OOBE partner api key>`

Supported endpoints:

- `GET /identity/verify?agentIdentity=<pubkey>&attestationProvider=<provider>`
- `GET /passport?passportAddress=<address>&attestationProvider=<provider>`
- `GET /mandate?passportAddress=<address>&version=<n>&attestationProvider=<provider>`
- `GET /audit?passportAddress=<address>&nonce=<n>&attestationProvider=<provider>`
- `GET /reputation?apiProvider=<wallet>`
- `GET /x402/pricing?url=<encoded url>`
- `POST /x402/fetch`
- `POST /escrows`
- `GET /escrows/status?transactionId=<id>&escrowAddress=<address>`
- `POST /quality/assess`
- `POST /quality/refund-estimate`

## Allowed Targets

The x402 routes are restricted to an allowlist.

Defaults:

- `api.kamiyo.ai`
- `x402.kamiyo.ai`

Add partner testing targets with:

```bash
OOBE_ALLOWED_TARGET_HOSTS=api.kamiyo.ai,x402.kamiyo.ai,partner-test.example
```

Requests for other hosts return `403`.

## Runtime Controls

- `OOBE_PARTNER_API_KEY`: API key required for `/api/partners/oobe/*`
- `OOBE_PARTNER_BEARER_TOKEN`: legacy fallback for older bearer-based clients
- `OOBE_ALLOWED_TARGET_HOSTS`: extra comma-separated x402 target hosts
- `X402_MAX_PRICE_USD`: max auto-paid request price for hosted x402 fetches
- `X402_PREFERRED_NETWORK`: preferred x402 requirement network
- `X402_FACILITATOR_POLICY`: facilitator policy passed to hosted x402 tooling

## Example HTTP Calls

Pricing:

```bash
curl -sS \
  -H "X-API-Key: $OOBE_PARTNER_API_KEY" \
  "https://api.kamiyo.ai/api/partners/oobe/x402/pricing?url=https%3A%2F%2Fapi.kamiyo.ai%2Fapi%2Fpaid%2Fmarket"
```

Identity verification:

```bash
curl -sS \
  -H "X-API-Key: $OOBE_PARTNER_API_KEY" \
  "https://api.kamiyo.ai/api/partners/oobe/identity/verify?agentIdentity=<agent-pubkey>"
```

Fetch:

```bash
curl -sS \
  -X POST \
  -H "X-API-Key: $OOBE_PARTNER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://api.kamiyo.ai/api/paid/market","method":"GET"}' \
  https://api.kamiyo.ai/api/partners/oobe/x402/fetch
```

Create escrow:

```bash
curl -sS \
  -X POST \
  -H "X-API-Key: $OOBE_PARTNER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"api":"provider-wallet","amount":0.01,"timeLock":3600}' \
  https://api.kamiyo.ai/api/partners/oobe/escrows
```

Check escrow:

```bash
curl -sS \
  -H "X-API-Key: $OOBE_PARTNER_API_KEY" \
  "https://api.kamiyo.ai/api/partners/oobe/escrows/status?transactionId=tx-123"
```
