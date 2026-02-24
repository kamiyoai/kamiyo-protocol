# Production Audit: Keiro Mobile + Solana Mobile Resubmission

## Executive Summary
Core mobile/API quality gates are green, dApp publishing metadata is valid with `kamiyo-ai@users.noreply.github.com`, and release minting now works on mainnet. Resubmission is still blocked because the store already has a pending review for Android `version_code` 1, and the freshly minted release uses the same APK version.

## Critical Issues (P0 - Block Release)
- [x] Resubmission blocked by signer wallet funding. | Impact: release mint could not be created. | Fix: funded authority key and successfully minted a new release.
- [ ] Existing review already has `version_code: 1`; portal rejects another submission of the same version. | Impact: `publish update` cannot be accepted yet. | Fix: build/sign APK with incremented Android version code and mint/submit that release, or have reviewer/support replace pending review.

## High Priority (P1 - Fix Before Launch)
- [x] Submission contact/support email mismatch across metadata. | Impact: inconsistent reviewer contact details. | Fix: normalized to `kamiyo-ai@users.noreply.github.com`.
- [x] Production defaults pointed to local/dev infra (`localhost`, `devnet`). | Impact: broken runtime in review/production builds without env overrides. | Fix: production-safe defaults with dev fallback.
- [x] Expo dependency drift and duplicate native module graph. | Impact: risk of native build/runtime instability. | Fix: aligned package versions and removed unused duplicate dependency; `expo-doctor` now passes.

## Medium Priority (P2 - Fix Soon After Launch)
- [x] Wallet identity/website URL pointed at host not resolvable in current environment. | Impact: degraded wallet identity and publishing metadata quality. | Fix: moved to stable `https://kamiyo.ai`.
- [x] Missing `.env.example` despite README instructions. | Impact: higher setup/config drift risk. | Fix: added `.env.example` with release defaults.

## Low Priority (P3 - Technical Debt)
- [ ] Add a checked-in release automation wrapper for `dapp-store-cli` so `config.yaml/files/media` path aliasing is not manual.

## Security Assessment
- No new security regressions introduced by this pass.
- Kept strict explicit handling for wallet/auth flows; removed noisy console logging from user-facing paths.

## Performance Assessment
- No meaningful runtime performance regressions from changes.
- Dependency dedupe reduces risk of native module duplication overhead in builds.

## Observability Assessment
- Client-side console noise was reduced; centralized structured telemetry is still minimal.
- Recommend wiring error events to a remote sink before scale launch.

## Test Coverage Gaps
- Mobile app has lint/typecheck gates but no automated UI/integration suite.
- No automated preflight that enforces release mint + publish flow in CI.

## Validation Results
- `apps/keiro`: lint passed.
- `apps/keiro`: typecheck passed.
- `apps/keiro`: `expo-doctor` passed (17/17 checks).
- `services/keiro-api`: tests passed (68/68), build passed.
- `dapp-store-cli validate`: passed.
- `dapp-store-cli create release` (mainnet, real): success.
- New release mint: `7CcUzu5dH5yPyQwDtS8y6Zpmm24rTovycZtXCLDYtuXy`.
- Mint tx: `4qTeqig5kX6LhwqyuxxMa3TSAYtBb239WMdaiYa6xhAECBsQS3uW2cpwQ4AzVSUheQYK7KbCkXFMqaZ6Lz7g71hY`.
- `dapp-store-cli publish update` (mainnet, real): rejected with "You've already submitted this version for review."
- `dapp-store-cli publish support`: success (support request sent to replace pending package with the new release mint).

## Action Plan
1. Build a new APK with incremented Android `version_code` (e.g. 2) using the same signing cert.
2. Mint another release from that APK with `dapp-store-cli create release`.
3. Keep `dapp-store/config.yaml` release pointers on the new mint and run `publish update`.
4. If reviewer team can replace the currently pending review via support, skip step 1-3 and wait for their response.
