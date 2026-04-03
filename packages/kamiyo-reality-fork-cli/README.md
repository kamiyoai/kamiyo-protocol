# `@kamiyo/reality-fork-cli`

Focused CLI for Reality Fork fixtures and remote project operations.

It keeps the `r44` operator ergonomics that are worth stealing:

- named profiles
- `doctor`
- shared parser for direct commands and `shell`
- local workflows
- local pre/post hooks
- JSONL session logs and replay

## Commands

```bash
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
