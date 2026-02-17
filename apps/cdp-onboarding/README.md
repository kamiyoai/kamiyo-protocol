# CDP Onboarding (Reference)

Web reference app for CDP embedded end-user onboarding, Kamiyo wallet control plane provisioning, and Base session auth.

## Setup

1. Configure a CDP project and allowlist your dev origin in the CDP portal.
2. Create `.env.local` from `.env.example` and set `VITE_CDP_PROJECT_ID`.

## Run

```bash
pnpm --filter @kamiyo/cdp-onboarding dev
```
