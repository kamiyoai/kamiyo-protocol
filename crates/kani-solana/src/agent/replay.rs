//! Counterexample replay helpers for agent proofs.
//!
//! Kani's `--concrete-playback=print` flag auto-generates replay unit tests
//! from counterexamples. This module provides helpers that make the resulting
//! output more readable. Prefer [`labeled_assert`] over raw `assert!` in
//! agent proofs for clearer diagnostics.

/// Assert with a descriptive prefix for readable Kani counterexample output.
pub fn labeled_assert(condition: bool, label: &str) {
    assert!(condition, "AGENT INVARIANT VIOLATION: {}", label);
}
