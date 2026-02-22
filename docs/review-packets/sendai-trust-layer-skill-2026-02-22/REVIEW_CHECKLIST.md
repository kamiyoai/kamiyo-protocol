# Sendai Review Checklist

## Functional correctness

- [ ] Resolver selects required package set for each rule family.
- [ ] Resolver emits required env flags (`KANI_FULL`, `KANI_AGENT`, `KANI_ACCOUNT_INFO`) correctly.
- [ ] Resolver output command matches actual execution path for `--run` and `--ci`.
- [ ] Resolver works when invoked outside repo root.
- [ ] Resolver includes local staged/unstaged/untracked changes with default `--head HEAD`.

## Security and safety

- [ ] No unsafe command construction patterns.
- [ ] Input refs and file paths are validated before use.
- [ ] Failure modes produce explicit, actionable errors.

## Documentation quality

- [ ] `SKILL.md` usage instructions are clear and unambiguous.
- [ ] Kani matrix and playbook are consistent with resolver behavior.
- [ ] Troubleshooting and checklist sections are operationally useful.

## Coverage and architecture

- [ ] Primitive map covers all intended trust-layer domains.
- [ ] Kani coverage requirements are strict enough for high-risk changes.
- [ ] Suggested next-step CI gates are sensible.

## Final reviewer output

- [ ] Approve
- [ ] Approve with nits
- [ ] Request changes

