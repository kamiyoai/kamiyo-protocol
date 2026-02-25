# Agent Factory

Autonomous agent runtime for forum engagement and integration-response workflows.

## Run

```bash
pnpm install
pnpm --filter @kamiyo/agent-factory run build
pnpm --filter @kamiyo/agent-factory run dev
```

Run a one-off task:

```bash
pnpm --filter @kamiyo/agent-factory start "your task"
```

Heartbeat mode:

```bash
pnpm --filter @kamiyo/agent-factory run heartbeat
```

## Environment

Copy `.env.example` to `.env` and set required values before starting.
