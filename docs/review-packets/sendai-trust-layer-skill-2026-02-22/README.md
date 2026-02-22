# Sendai Review Packet: KAMIYO Trust Layer Skill

## Scope

This packet contains the new `kamiyo-trust-layer` skill and its production hardening pass.
The goal is to get a focused technical review from Sendai dev on:

1. Primitive coverage completeness for trust-layer Solana flows.
2. Kani profile resolver correctness and safety.
3. Documentation clarity and operational usability.

## Included Deliverables

- New skill package under `skills/kamiyo-trust-layer/`.
- Kani-first verification docs and resolver script.
- Production audit report documenting findings and fixes.
- Review checklist, validation notes, and file manifest.
- Ready-to-send handoff template for reviewer outreach.

## High-Impact Changes

- Added a full trust-layer implementation skill covering identity, escrow/dispute, privacy/shield, staking/governance, and trusted product flows.
- Elevated Kani to a required verification domain with:
  - required-profile matrix,
  - playbook,
  - change-impact template,
  - resolver script for automatic profile selection.
- Hardened resolver behavior:
  - removed unsafe command execution patterns,
  - improved argument/ref validation,
  - made execution independent of caller working directory,
  - included local staged/unstaged/untracked changes when resolving profiles,
  - aligned CI mode with resolved packages and flags.

## What Reviewers Should Focus On

1. Path-to-profile mapping logic in `scripts/kani-required-profiles.sh`.
2. Rule coverage consistency between resolver and `docs/kani-required-matrix.md`.
3. Practicality of the workflow described in `SKILL.md` and `docs/kani-playbook.md`.
4. Any missing trust-layer primitives or bad coupling assumptions.

## Quick Verification Commands

```bash
bash skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh --help

# Example resolver run from repo root
bash skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh

# Example resolver run using explicit file list
printf '%s\n' 'programs/kamiyo/src/lib.rs' 'packages/kamiyo-sdk/src/privacy/shield.ts' > /tmp/kani-changed.txt
bash skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh --files /tmp/kani-changed.txt
```

## Artifacts

See `artifacts/` in this packet for:

- `.patch` file for line-by-line code review in diff tools
- `.tar.gz` bundle of review files
- `.zip` bundle of review files
- `sha256` checksum file
