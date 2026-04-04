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

## Agent Commands

Interact with on-chain KAMIYO agents directly from the CLI.

```bash
# query an agent by owner address
reality-fork agent info <owner-pubkey>

# list escrows for an agent
reality-fork agent escrows <owner-pubkey>

# derive the agent PDA for an owner
reality-fork agent pda <owner-pubkey>

# create a new agent on-chain (devnet)
reality-fork agent create --name "my-agent" --type trading --stake 0.1

# create on mainnet with custom keypair
reality-fork --cluster mainnet agent create --name "prod-agent" --type service --stake 1.0 --keypair ~/keys/agent.json

# deactivate an agent and reclaim stake
reality-fork agent deactivate --keypair ~/.config/solana/id.json
```

Use `--cluster` to target devnet (default), mainnet, localnet, or any RPC URL.
All read commands support `--output json` for machine-readable output.

## Configuration

Persist defaults so you don't have to pass flags every time.

```bash
# set default cluster
reality-fork config set cluster mainnet

# set default output format
reality-fork config set output json

# set default keypair path
reality-fork config set keypair ~/keys/agent.json

# view current config
reality-fork config show

# remove a default
reality-fork config unset cluster

# show config file location
reality-fork config path
```

Config is stored at `~/.config/kamiyo/reality-fork-cli/config.json`. CLI flags always override config defaults.

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
