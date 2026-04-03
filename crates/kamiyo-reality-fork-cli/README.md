# kamiyo-reality-fork-cli

Native Rust CLI for KAMIYO Reality Fork — repo-aware launch stress tests.

No runtime dependencies. No Node.js. Single binary.

## Install

```bash
cargo install kamiyo-reality-fork-cli
```

## Usage

```bash
# score a repo and emit shareable artifacts
reality-fork run launch --repo .

# compare two runs
reality-fork run diff ./before/trace.json ./after/trace.json

# watch mode — re-run on every file change
reality-fork run watch --repo .

# share the latest run as a GitHub gist
reality-fork run share

# open report.html in the browser after a run
reality-fork run launch --repo . --open
```

The flagship workflow writes:

- `decision.md` — structured verdict with branches, evidence, and next moves
- `report.html` — interactive report matching the KAMIYO design system
- `trace.json` — full machine-readable run data

For monorepos, use `--focus <path...>` to pin the product surface you want to score.

## Output

```
reality-fork run launch --repo .

  reality fork 分岐現界

  repo  kamiyo-protocol
  files 234 · TypeScript, Rust, TOML · solana-anchor, turborepo

  Immediacy     ████████████████░░░░   78%
  Clarity       ██████████████░░░░░░   68%
  Proof         ████████████████░░░░   82%
  Distribution  █████████████░░░░░░░   64%
  Shareability  ███████████████░░░░░   73%
  Trust         ██████████████████░░   88%

  Launch one impossible-to-miss workflow
  readiness 76%
```
