# Validation Notes

## Commands executed

```bash
bash skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh --help
bash skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh --files <synthetic-file-list>
```

## Observed results

- Help output renders expected options.
- Synthetic changed-file test resolves package/flag set correctly.
- Identity marker scan for this scope is clean.
- Cleanup marker scan for this scope is clean.

## Known limits

- Full Kani proof execution (`--run --ci`) was not executed in this packaging step.
- Unrelated working-tree changes exist elsewhere in repo and are intentionally excluded from artifacts.

