//! Reusable Kani formal verification harnesses for Solana program math.
//!
//! Pure math primitives are always available; proof harness helpers are only
//! compiled under Kani.
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

#[cfg(all(kani, feature = "kani"))]
pub mod generators;

#[cfg(all(kani, feature = "kani"))]
pub mod token;

#[cfg(all(kani, feature = "kani"))]
pub mod staking;

#[cfg(all(kani, feature = "kani"))]
pub mod bounds;

#[cfg(all(kani, feature = "kani"))]
pub mod math;

pub mod risk;
