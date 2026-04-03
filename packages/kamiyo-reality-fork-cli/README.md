# `@kamiyo/reality-fork-cli`

Reality Fork is most compelling when it does one job fast:

```bash
reality-fork run launch --repo .
```

That command inspects a repo, forks the launch decision into competing paths, and writes:

- `decision.md`
- `report.html`
- `trace.json`

The rest of the CLI supports that flagship workflow and keeps the useful `r44` operator ergonomics.

## Flagship Flow

```bash
reality-fork run launch --repo .
```

For monorepos, pin the product surface explicitly:

```bash
reality-fork run launch --repo . \
  --focus packages/kamiyo-reality-fork-cli \
  --focus packages/kamiyo-reality-fork \
  --focus crates/kamiyo-reality-fork-cli
```

The report is meant to answer one hard question quickly:

- should we ship this now
- should we narrow the launch
- should we delay for proof
- should we kill the product push

## Operator Surface

Reality Fork still keeps the parts of `r44` that are actually worth stealing:

- named profiles
- `doctor`
- shared parser for direct commands and `shell`
- local workflows
- local pre/post hooks
- JSONL session logs and replay

## Commands

```bash
reality-fork run launch --repo .

reality-fork setup
reality-fork doctor
reality-fork profile list
reality-fork config set-url http://127.0.0.1:3000

reality-fork fixtures list
reality-fork fixtures show ship-or-delay
reality-fork fixtures replay ship-or-delay

reality-fork projects list
reality-fork projects create --prompt "Should we ship?" --title "Ship check"
reality-fork projects watch <project-id>

reality-fork workflow list
reality-fork session export --limit 20
reality-fork shell
```

## Profiles

Profiles store the API base URL and default output mode in local config:

- config path: `~/.config/kamiyo/reality-fork-cli/config.json`
- session log: `~/.config/kamiyo/reality-fork-cli/sessions.jsonl`

Override the active profile per command with `--profile <name>`.

## Remote API

Remote project and upload commands expect a Reality Fork API route at:

```text
<base-url>/api/reality-fork
```

This package does not require the API to be present for local fixture browsing, workflows, shell use, or session replay.
