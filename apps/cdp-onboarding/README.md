# CDP Onboarding (Reference)

Web reference app for CDP embedded onboarding plus Kizuna operator controls:
1. Agent wallet provisioning
2. Spend permission setup
3. Base session setup
4. Kizuna account onboarding, repayment, enterprise funding, and transaction review

## Setup

1. Configure a CDP project and allowlist your dev origin in the CDP portal.
2. Create `.env.local` from `.env.example` and set `VITE_CDP_PROJECT_ID`.

## Run

```bash
pnpm --filter @kamiyo-org/cdp-onboarding dev
```
