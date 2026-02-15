//! Reusable Kani formal verification harnesses for Solana program math.
//!
//! All public items are gated behind `#[cfg(kani)]`. Under normal compilation
//! this crate is a no-op with zero overhead.
//!
//! # Quick Start
//!
//! ```toml
//! [dev-dependencies]
//! kani-solana = "0.1"
//! ```
//!
//! ```ignore
//! use kani_solana::token::assert_two_way_split_conserves;
//!
//! #[kani::proof]
//! fn my_fee_split_is_sound() {
//!     assert_two_way_split_conserves(my_calculate_fee_split);
//! }
//! ```

#[cfg(kani)]
pub mod generators;

#[cfg(kani)]
pub mod token;

#[cfg(kani)]
pub mod staking;

#[cfg(kani)]
pub mod bounds;

#[cfg(kani)]
pub mod math;

pub mod risk;
