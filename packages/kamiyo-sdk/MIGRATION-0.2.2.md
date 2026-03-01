# @kamiyo/sdk 0.2.2 Migration Note (PoCH X)

This release adds the PoCH X client surface and rollout admin/status helpers required for canary operations.

## Required Pin

Pin all PoCH-integrating services to the same SDK artifact:

- npm package: `@kamiyo/sdk@0.2.2`
- GitHub tarball fallback:
  `https://github.com/kamiyo-ai/kamiyo-protocol/releases/download/sdk-v0.2.2/kamiyo-sdk-0.2.2.tgz`

Do not mix 0.1.x and 0.2.x across app/backend PoCH clients.

## New PoCH X Methods

- `submitPoCHXContribution(input)`
- `createPoCHXReferralInvite(input)`
- `claimPoCHXReferralInvite(input)`
- `getPoCHOracleRound(challengeId)`
- `openPoCHDispute(input)`
- `resolvePoCHDispute(input)`
- `getPoCHRolloutStatus()`
- `setPoCHRolloutStage(input)`
- `triggerPoCHRollback(input)`

## Additive Response Fields

- `statusReason` is now included consistently on PoCH status/proof/dispute flows.
- rollout status includes `evaluatorLastRunAt` and `snapshotAgeSeconds`.

## Consumer Actions

1. Upgrade dependency to `@kamiyo/sdk@0.2.2`.
2. Replace raw PoCH fetch calls with SDK methods.
3. Handle `statusReason` values in client UX for deterministic state messages.
