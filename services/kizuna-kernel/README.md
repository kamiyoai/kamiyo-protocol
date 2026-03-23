# Kizuna Kernel v2

Hosted decision authority for Kizuna approvals.

It owns:

- policy pack activation
- risk graph state
- abuse actions
- signed decision envelopes

The facilitator remains the source of truth for reservations, settlement, and debt.

## Deploy Setup

Deploy the service with `services/kizuna-kernel/render.yaml`.

Required env:

- `DATABASE_URL`
- `KIZUNA_KERNEL_INTERNAL_TOKEN`
- `KIZUNA_KERNEL_OPERATOR_TOKEN`
- `KIZUNA_KERNEL_SIGNING_BACKEND`
- `KIZUNA_KERNEL_ACTIVE_SIGNING_KID`
- `KIZUNA_KERNEL_ACTIVE_POLICY_PACKS`

Signing options:

- `local-pem`
  Set `KIZUNA_KERNEL_LOCAL_PRIVATE_KEYS` to a JSON object keyed by `kid`.
- `aws-kms`
  Set `KIZUNA_KERNEL_AWS_REGION` and `KIZUNA_KERNEL_AWS_KMS_KEY_IDS` to JSON keyed by `kid`.

Production default should be `aws-kms`.

`KIZUNA_KERNEL_ACTIVE_POLICY_PACKS` must be JSON with:

```json
{
  "enterprise": "enterprise-default-v1",
  "crypto-fast": "fastpath-default-v1"
}
```

## Facilitator Cutover

The facilitator must be configured with:

- `KIZUNA_KERNEL_URL`
- `KIZUNA_KERNEL_INTERNAL_TOKEN`
- `KIZUNA_KERNEL_PUBLIC_KEYS`
- `KIZUNA_KERNEL_FAIL_CLOSED=true`

During the migration window, keep `KIZUNA_KERNEL_SIGNING_KEYS` populated so settle can still verify v1 envelopes. Remove it after the last v1 reservation expires and settle no longer needs dual-read support.

`KIZUNA_KERNEL_PUBLIC_KEYS` must be a JSON object keyed by `kid` and containing PEM public keys that match the kernel signer.

## Rollout Order

1. Deploy the kernel with active policy packs and signing configured.
2. Read the kernel public key for the active `kid` and publish it into `KIZUNA_KERNEL_PUBLIC_KEYS` on the facilitator.
3. Keep `KIZUNA_KERNEL_SIGNING_KEYS` on the facilitator for the dual-read window.
4. Deploy the facilitator.
5. Verify `/supported` advertises `kamiyo-kizuna-kernel-v1` and `kamiyo-kizuna-kernel-v2`.
6. Verify new approvals return `kizuna-envelope-v2`.
7. Verify settle accepts both v1 and v2 during the migration window.
8. Remove `KIZUNA_KERNEL_SIGNING_KEYS` once the v1 window is closed.

## Repo Split

If the kernel moves into its own private repo, keep the runtime contract unchanged:

- preserve the `/v2` endpoint surface
- preserve the env names above
- preserve the envelope format and `kid` mapping
- preserve the internal token boundary between facilitator and kernel

The easiest split is to lift `services/kizuna-kernel` into the new repo root and reuse the same Render blueprint and env contract.
