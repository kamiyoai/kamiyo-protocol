# Production Audit: kamiyo-trust-layer skill

**Audit Date**: 2026-02-22 (UTC)  
**Scope**: `skills/kamiyo-trust-layer/**`  
**Verdict**: SHIP WITH FIXES APPLIED

## Executive Summary

The skill package was structurally sound but not production-safe in one critical area: the Kani profile resolver script. The script had cross-platform breakage on macOS default bash, relied on `eval`, assumed repo-root execution, and could miss local uncommitted changes when computing required proof profiles. Those issues are now fixed. Documentation now matches runtime behavior, and the resolver has deterministic, CI-parity execution paths.

## Critical Findings Count

| Severity | Count | Status |
| --- | --- | --- |
| Critical (P0) | 0 | none |
| High (P1) | 4 | fixed |
| Medium (P2) | 2 | fixed |
| Low (P3) | 1 | fixed |

## Detailed Findings

### [P1] macOS compatibility break (`mapfile` unavailable in bash 3)
**Location**: `skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh`  
**Impact**: Resolver fails immediately on default macOS shells, blocking the verification workflow.  
**Fix**: Replaced `mapfile` usage with bash-3-compatible `while read` loops.

### [P1] Unsafe command execution via `eval`
**Location**: `skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh`  
**Impact**: Avoidable execution risk and less deterministic behavior.  
**Fix**: Replaced `eval` with explicit `env ... ./scripts/kani.sh ...` execution.

### [P1] CWD-coupled execution
**Location**: `skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh`  
**Impact**: Running outside repo root caused wrong path resolution for Kani scripts.  
**Fix**: Added repo-root auto-detection from script path and `cd` to repo root.

### [P1] Required-profile computation missed local uncommitted changes
**Location**: `skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh`  
**Impact**: False-negative profile requirements during active development.  
**Fix**: Resolver now merges committed range diff with staged, unstaged, and untracked files when `--head HEAD`.

### [P2] CI parity did not use resolved profile flags/package set
**Location**: `skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh`  
**Impact**: Local CI-parity checks could diverge from selected risk profile.  
**Fix**: CI mode now forwards resolved flags and package targets to `scripts/kani-ci.sh`.

### [P2] Weak CLI argument validation
**Location**: `skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh`  
**Impact**: Incomplete args could cause shift/runtime failures.  
**Fix**: Added strict `--base/--head/--files` value validation and explicit ref existence checks.

### [P3] Docs drift against resolver behavior
**Location**: `skills/kamiyo-trust-layer/docs/kani-required-matrix.md`, `skills/kamiyo-trust-layer/docs/kani-playbook.md`  
**Impact**: Operational confusion for maintainers.  
**Fix**: Documented repo-root execution behavior and local-change inclusion semantics.

## Security Assessment

No direct secret-leak or trust-boundary break was found in the skill content. Primary risk was command execution hygiene (`eval`), now removed.

## Performance Assessment

Resolver remains linear in changed-file count and rule count. Current complexity is acceptable for repo-scale usage.

## Observability Assessment

The resolver provides explicit output for:

- repo root
- diff range
- changed files
- required flags/packages
- exact run command

This is adequate for local and CI traceability.

## Recommended Architecture Changes

1. Keep rule surface centralized in `docs/kani-required-matrix.md` and script pattern table; update both in the same PR.
2. Add a lightweight CI check that executes resolver in dry mode on PRs to detect future script regressions.

## Test Coverage Gaps

- No automated unit tests exist for resolver path-rule mapping logic.
- No scripted regression test suite for command computation matrix.

## Action Plan

### Immediate (completed)

- [x] Hardening rewrite of resolver script.
- [x] Cross-platform compatibility fix (bash 3).
- [x] CI parity command alignment.
- [x] Documentation alignment.

### Short-term

- [ ] Add matrix regression tests for resolver output (fixtures -> expected commands).

### Medium-term

- [ ] Add CI gate that fails when resolver script and matrix docs diverge.

## Verification Performed

- `skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh --help` (pass)
- Resolver dry-runs with synthetic changed-file lists (pass)
- Resolver dry-run with local repo state (pass)
- SKILL frontmatter validation (pass)
- ASCII validation of skill package files (pass)
