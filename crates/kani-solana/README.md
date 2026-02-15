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

## License

MIT
