# kamiyo-reality-fork-cli

`kamiyo-reality-fork-cli` provides a native `cargo install` entry point for the KAMIYO Reality Fork CLI.

The binary launches a bundled copy of the working Reality Fork Node CLI and forwards all arguments and stdio.

## Requirements

- Node.js 20 or newer available as `node`

If your Node binary is not on `PATH`, set `KAMIYO_REALITY_FORK_NODE` before running the command.

## Usage

```bash
kamiyo-reality-fork-cli doctor
kamiyo-reality-fork-cli fixtures list
kamiyo-reality-fork-cli shell
```
