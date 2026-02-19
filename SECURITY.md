# Security Policy

## Supported Scope

This policy covers actively maintained code in this repository, including:

- Solana programs under `programs/`
- Rust crates under `crates/`
- Services under `services/`
- TypeScript packages under `packages/`

## Reporting a Vulnerability

Report vulnerabilities privately to:

- security@kamiyo.ai

Do not file public GitHub issues for vulnerabilities.

## Report Format

Include the following:

- Affected component and path
- Impact assessment
- Reproduction steps or proof of concept
- Suggested remediation (if available)

## Response Targets

- Initial acknowledgment: within 2 business days
- Triage and severity classification: within 7 business days
- Remediation timeline: based on severity and exploitability

## Disclosure Policy

- We prefer coordinated disclosure.
- Public disclosure should wait until a fix is available or mitigation guidance is published.

## Out of Scope

The following are usually out of scope unless they demonstrate meaningful security impact:

- Styling or UI-only issues
- Vulnerabilities in third-party dependencies without a repository-specific exploit path
- Denial-of-service claims without reproducible resource-exhaustion details

## Hardening Expectations for Contributors

When contributing security-sensitive changes:

- Add tests that prove the failure mode and the fix
- Document operational impact and rollback strategy
- Avoid introducing hidden configuration defaults
