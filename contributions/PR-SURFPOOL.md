# PR: Escrow testing example

**Repo:** https://github.com/txtx/surfpool
**Path:** `examples/payment-escrow-testing/`

## Title

Add escrow testing example

## Description

Example showing how to test time-locked escrows with Surfpool.

Files:
- `README.md`
- `escrow-lifecycle.ts` - create, release, dispute, expire
- `time-lock-scenarios.ts` - boundary conditions, snapshots

Testing payment escrows normally means waiting for lock periods. This uses `surfnet_advanceSlots` to skip time.

```bash
surfpool
npx ts-node escrow-lifecycle.ts
```
