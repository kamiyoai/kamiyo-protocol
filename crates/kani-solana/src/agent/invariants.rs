//! Agent-specific safety assertions for formal verification.

use super::account::AgentAccount;
use super::cpi::CpiLog;

/// Asserts total lamports are conserved across all accounts.
pub fn assert_lamport_conservation(accounts: &[AgentAccount]) {
    let mut initial_sum: u128 = 0;
    let mut current_sum: u128 = 0;
    let mut i = 0;
    while i < accounts.len() {
        initial_sum += accounts[i].initial_lamports as u128;
        current_sum += accounts[i].lamports as u128;
        i += 1;
    }
    assert_eq!(initial_sum, current_sum, "lamport conservation violated");
}

/// Asserts no account has been re-entered beyond the allowed depth.
pub fn assert_no_reentrancy(accounts: &[AgentAccount]) {
    let mut i = 0;
    while i < accounts.len() {
        assert!(accounts[i].reentry_depth <= 1, "reentrancy detected");
        i += 1;
    }
}

/// Asserts every CPI target is in the allowed program list.
pub fn assert_cpi_authorized(log: &CpiLog, allowed_programs: &[[u8; 32]]) {
    for record in log.iter() {
        let mut authorized = false;
        let mut j = 0;
        while j < allowed_programs.len() {
            if record.target_program == allowed_programs[j] {
                authorized = true;
                break;
            }
            j += 1;
        }
        assert!(authorized, "CPI to unauthorized program");
    }
}

/// Asserts alignment and mutability invariants on a single account.
pub fn assert_account_invariants(account: &AgentAccount) {
    assert!(account.data_len % 8 == 0, "data_len not 8-byte aligned");
    if account.lamports != account.initial_lamports {
        assert!(account.is_writable, "lamport change on read-only account");
    }
}

/// Asserts the account is a signer.
pub fn assert_is_signer(account: &AgentAccount) {
    assert!(account.is_signer, "account is not a signer");
}

/// Asserts the account owner matches the expected key.
pub fn assert_owner(account: &AgentAccount, expected_owner: &[u8; 32]) {
    assert_eq!(account.owner, *expected_owner, "unexpected account owner");
}

/// Asserts the account has a PDA bump seed.
pub fn assert_pda_has_bump(account: &AgentAccount) {
    assert!(account.pda_bump.is_some(), "PDA missing bump seed");
}

/// Runs all agent-level invariants in one call.
pub fn assert_all_agent_invariants(
    accounts: &[AgentAccount],
    cpi_log: &CpiLog,
    allowed_programs: &[[u8; 32]],
) {
    assert_lamport_conservation(accounts);
    assert_no_reentrancy(accounts);
    assert_cpi_authorized(cpi_log, allowed_programs);
    let mut i = 0;
    while i < accounts.len() {
        assert_account_invariants(&accounts[i]);
        i += 1;
    }
}
