//! Formal verification primitives for autonomous Solana agent programs.
//!
//! Provides symbolic account generation, CPI contract stubs, and
//! auto-assertions for agent-specific safety properties:
//! lamport conservation, reentrancy prevention, CPI authorization,
//! and state machine validity.

pub mod account;
pub mod cpi;
pub mod invariants;
pub mod state_machine;
pub mod pda;
pub mod replay;

pub use account::{AgentAccount, AgentConfig, any_agent_account};
pub use cpi::{CpiLog, CpiRecord};
pub use invariants::{
    assert_all_agent_invariants, assert_cpi_authorized, assert_lamport_conservation,
    assert_no_reentrancy,
};
