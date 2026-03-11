# CDP Onboarding

Reference operator app for Kizuna account setup and control-plane actions.

It covers:

1. agent wallet provisioning
2. spend permission setup
3. base session setup
4. Kizuna account onboarding
5. repayment
6. enterprise funding actions
7. recent transaction review

## Setup

1. Configure a CDP project and allowlist your dev origin in the CDP portal.
2. Create `.env.local` from `.env.example` and set `VITE_CDP_PROJECT_ID`.

## Run

```bash
pnpm --filter @kamiyo/cdp-onboarding dev
```
