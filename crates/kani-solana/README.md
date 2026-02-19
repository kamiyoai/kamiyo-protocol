# kani-solana

Reusable Kani harnesses for Solana protocol math: bounds, value conservation, monotonicity, and Percolator-style risk primitives (haircut ratio and profit haircut math).

Everything is gated behind `cfg(kani)`, so normal builds are unaffected.

## 30-second Usage

Add as a dev dependency:

```toml
[dev-dependencies]
kani-solana = { git = "https://github.com/kamiyo-ai/kani-solana.git", rev = "a9fc18fe2067c83e4c409fcc50133ea0b05f74ac" }
```

Use in your own proofs:

```rust
#![cfg(kani)]

use kani_solana::risk::{effective_pnl, haircut_ratio};

#[kani::proof]
fn payout_is_bounded_by_profit() {
    let vault: u128 = kani::any();
    let principal_total: u128 = kani::any();
    let insurance: u128 = kani::any();
    let pnl_pos_total: u128 = kani::any();
    let my_pnl: i128 = kani::any();

    let (h_num, h_den) = haircut_ratio(vault, principal_total, insurance, pnl_pos_total);
    let payout = effective_pnl(my_pnl, h_num, h_den);

    kani::assert(payout <= my_pnl.max(0) as u128);
}
```

Run:

```bash
cargo install --locked kani-verifier
cargo kani setup
cargo kani
```

## Solana AccountInfo Generators

`kani-solana` also exposes a Kani-only `AccountInfo` helper module (aligned with the RFC in [Kani issue #4550](https://github.com/model-checking/kani/issues/4550)):

```rust
#![cfg(kani)]

use kani_solana::account_info::{any_agent_account, AccountConfig, LamportSnapshot};

#[kani::proof]
fn release_policy_example() {
    let payer = any_agent_account::<0>(AccountConfig::new().payer());
    let escrow = any_agent_account::<128>(AccountConfig::new().writable());
    let before = LamportSnapshot::new(&[&payer, &escrow]);
    kani::assert(before.unchanged(&[&payer, &escrow]), "unchanged without mutation");
}
```

Run these harnesses with:

```bash
cargo kani -p kani-solana --features solana-account-info
```

## License

MIT
