---
name: kamiyo-trust-layer
description: Comprehensive implementation guide for KAMIYO trust-layer Solana primitives. Use when building or reviewing agent identity, escrow lifecycle, dispute commit-reveal, oracle consensus, reputation scoring, ZK privacy proofs, shield credentials, staking multipliers, governance voting, x402 paid access, trusted token launches, trusted trader sessions, or Kani formal verification coverage for trust invariants.
---

# KAMIYO Trust Layer Solana Guide

Use this skill to implement trust-layer flows with the actual KAMIYO primitive set instead of ad hoc wrappers.

## Scope

This skill covers all trust-layer primitive groups currently exposed in:

- `@kamiyo/sdk`
- `@kamiyo/actions`
- `@kamiyo/solana-reputation`
- `@kamiyo/solana-inference`
- `@kamiyo/solana-privacy`

Load `resources/primitives-map.md` first when implementing any non-trivial flow.

## Core Rule

Map each user requirement to primitive categories before writing code:

1. Identity and trust state (`KamiyoClient`, `AgentManager`, `ReputationManager`)
2. Escrow and disputes (`AgreementManager`, `EscrowDisputeManager`, `QualityOracle`)
3. Privacy and credentials (`PrivateReputation`, `Shield`, `ShieldVerifier`, privacy APIs)
4. Coordination and economics (`StakingClient`, `UnifiedKamiyoClient`, governance and voting)
5. Productized trust flows (`FundryManager`, `ElfaManager`, `X402Client`, `@kamiyo/actions`)
6. Formal trust proofs (`kani-solana`, `kamiyo-trust-layer` Kani harnesses, proof workflows)

If a flow touches multiple categories, compose them explicitly instead of collapsing to one helper.

## Implementation Workflow

1. Identify which primitive families are required.
2. Confirm PDA derivations and status/phase gates before sending transactions.
3. Build with typed clients first, then add fallback helpers only when required.
4. Add quality/dispute logic for any escrowed payment path.
5. Add privacy or shield gating when proof of trust is required.
6. Add reliability controls (`RpcPool`, `CircuitBreaker`, monitor loops) for long-running workers.
7. Run Kani profiles that match the changed trust surface.

## Fast Path Recipes

### Agent + escrow + dispute

- Use `templates/trust-layer-client.ts` for client wiring.
- Follow `examples/end-to-end-escrow/README.md`.
- Ensure the flow covers create -> status checks -> release or dispute.

### ZK reputation + shield credential gating

- Follow `examples/privacy-shield/README.md`.
- Use `PrivateReputation` or `@kamiyo/solana-privacy` proof generation.
- Verify with `ShieldVerifier` and optional on-chain verification helpers.

### Trusted launch and trusted trader sessions

- Follow `examples/trusted-launch-and-trader/README.md`.
- Use `FundryManager.secureLaunch` and `ElfaManager.secureTrade`.
- Record generated session and launch PDAs for reconciliation.

### Kani verification for trust invariants

- Follow `docs/kani-playbook.md`.
- Apply required-profile matrix from `docs/kani-required-matrix.md`.
- Use `scripts/kani-required-profiles.sh` to compute required Kani profiles from git diff.
- Use `examples/kani-verification/README.md` for command selection by change type.
- Use `templates/kani-change-impact.md` to document proof scope in reviews.

## Required Validation

Before finalizing any implementation:

1. Confirm all applicable primitive families from `resources/primitives-map.md` are represented.
2. Confirm phase and status checks exist for disputes and reveals.
3. Confirm transaction-building code uses deterministic PDA derivation.
4. Confirm tests or executable examples cover success path and failure path.
5. Confirm Kani proofs pass for the impacted trust domains.
6. Confirm cover/audit checks pass when running full proof profile.

## References

- Primitive map: `resources/primitives-map.md`
- Integration checklist: `docs/implementation-checklist.md`
- Kani playbook: `docs/kani-playbook.md`
- Kani required matrix: `docs/kani-required-matrix.md`
- Troubleshooting: `docs/troubleshooting.md`
- Templates: `templates/trust-layer-client.ts`, `templates/dispute-oracle-worker.ts`, `templates/zk-shield-gate.ts`, `templates/kani-change-impact.md`
