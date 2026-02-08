# BabyAGI3 Tool Pack Scaffold (KAMIYO)

This scaffold is the Phase 1 starting point for KAMIYO trust-backed paid execution in BabyAGI3.

It provides 5 BabyAGI tools in `tools/optional/kamiyo.py`:

1. `kamiyo_create_escrow_call`
2. `kamiyo_execute_paid_call`
3. `kamiyo_assess_quality`
4. `kamiyo_settle_or_dispute`
5. `kamiyo_get_provider_reputation`

## Current Modes

- `KAMIYO_MODE=mock` (default): deterministic local demo mode
- `KAMIYO_MODE=live`: calls backend HTTP endpoints under `KAMIYO_BASE_URL`

## Drop-in Steps (BabyAGI3)

## Option A: Apply Script

```bash
./apply_to_babyagi3.sh /path/to/babyagi3
```

## Option B: Manual Drop-in

1. Copy `tools/optional/kamiyo.py` into your BabyAGI3 checkout.
2. Add loader entry in `tools/optional/__init__.py`:

```python
_OPTIONAL_MODULES = {
    # ...existing modules...
    "tools.optional.kamiyo": ["KAMIYO_ENABLED"],
}
```

3. Export environment variables:

```bash
export KAMIYO_ENABLED=1
export KAMIYO_MODE=mock
# For live mode:
# export KAMIYO_MODE=live
# export KAMIYO_BASE_URL=https://your-kamiyo-service
# export KAMIYO_API_KEY=...
```

4. Start BabyAGI3 and verify tools are visible.

## Patch File (PR-Ready)

`babyagi3-kamiyo.patch` contains a ready-to-apply diff for BabyAGI3:

```bash
cd /path/to/babyagi3
git apply /path/to/babyagi3-kamiyo.patch
```

## Phase 1 Demo Prompt

Use this prompt after startup:

```text
Create an escrow for provider alpha, execute a paid call to https://example-good, assess quality with expected field data.result, then settle.
```

Then run the unhappy path:

```text
Create an escrow for provider beta, execute a paid call to https://example-bad, assess quality with expected field data.result and max latency 500, then settle or dispute.
```

## Notes

- In mock mode, URLs containing `bad` or `fail` simulate degraded quality.
- Idempotency behavior is implemented for `kamiyo_settle_or_dispute`.
- Live backend routes are defined in `docs/BABYAGI3_KAMIYO_TECH_SPEC.md`.

## Local Live Bridge Server

This repo includes a minimal bridge server for `/babyagi/v1/*` endpoints:

```bash
pnpm -C services/api babyagi:dev
```

Then set:

```bash
export KAMIYO_ENABLED=1
export KAMIYO_MODE=live
export KAMIYO_BASE_URL=http://localhost:8787
```

## Solana-Backed Escrow (Optional)

If you want real escrow + release/dispute transactions on Solana (instead of in-memory demo state), enable Solana mode on the bridge server:

```bash
export BABYAGI_SOLANA_ENABLED=true
export SOLANA_RPC_URL=...
export MCP_PROGRAM_ID=...
export MCP_AGENT_KEYPAIR=...
```

In Solana mode:

- `kamiyo_create_escrow_call` must use `currency="SOL"` (amounts are SOL).
- `provider_id` should be the provider's base58 Solana pubkey.

For the included `smoke_test.py` in live mode, you can set:

```bash
export KAMIYO_PROVIDER_ID=<base58 pubkey>
export KAMIYO_CURRENCY=SOL
```
