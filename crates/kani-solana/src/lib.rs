//! Reusable Kani formal verification harnesses for Solana program math.
//!
//! This crate is intentionally a no-op in normal builds. Everything is gated
//! behind `cfg(kani)`.

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

#[cfg(kani)]
pub mod risk;
