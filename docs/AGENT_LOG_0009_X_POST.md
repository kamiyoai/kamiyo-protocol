Protocol update from this release:

We fixed the biggest blocker for live demos: config drift across CDP and Paranet.

What shipped:
- unified env resolution across MCP/API/agent-paranet (`PARANET_*`, `DKG_*`, `KAMIYO_DKG_*`)
- stronger CDP env checks with explicit missing-key output
- new `paranet_env_status` + upgraded `cdp_env_status` for real readiness reporting
- one-command live preflight: `pnpm --filter @kamiyo/mcp-server run test:live-config`

Current state:
- Paranet read path resolves and connects with existing operator config
- write paths now fail clearly instead of failing ambiguously

Still required for true production calls:
- real `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`
- Paranet UAL + operator/attestor global IDs

Code is on `main`; once those secrets are injected, live flows are ready to run end-to-end.
