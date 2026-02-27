# Kamiyo Operator

Autonomous operator runtime for execution policy enforcement, swarm coordination, and operator proof artifacts.

## Run

```bash
pnpm install
pnpm --filter @kamiyo/kamiyo-operator run build
pnpm --filter @kamiyo/kamiyo-operator run dev
```

Production start:

```bash
pnpm --filter @kamiyo/kamiyo-operator start
```

## Operations

Useful operational commands:

```bash
pnpm --filter @kamiyo/kamiyo-operator run check:alerts
pnpm --filter @kamiyo/kamiyo-operator run proof:24h
```

## Environment

Use `services/kamiyo-operator/.env.example` as the baseline config.

Validate env contract and runtime values:

```bash
pnpm --filter @kamiyo/kamiyo-operator run preflight:contract
pnpm --filter @kamiyo/kamiyo-operator run preflight:env
```

Run runtime boot smoke (starts operator in isolated run-once mode, verifies RPC init, then exits):

```bash
pnpm --filter @kamiyo/kamiyo-operator run smoke:boot
```
