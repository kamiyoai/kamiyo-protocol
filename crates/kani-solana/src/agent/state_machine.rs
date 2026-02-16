//! Formal verification helpers for state machine transition proofs.

/// Assert that a transition from `before` to `after` is permitted.
///
/// A no-op (before == after) is always valid. Otherwise at least one
/// entry in `valid_edges` must match the (before, after) pair.
pub fn assert_valid_transition<S: Copy + PartialEq>(
    before: S,
    after: S,
    valid_edges: &[(S, S)],
) {
    if before == after {
        return;
    }

    let mut i = 0;
    let mut found = false;
    while i < valid_edges.len() {
        let (src, dst) = valid_edges[i];
        if src == before && dst == after {
            found = true;
        }
        i += 1;
    }
    kani::assert(found, "transition not in valid_edges");
}

/// Assert that terminal states have no outgoing transitions.
///
/// If `state` is in `terminal_states`, then `next` must equal `state`.
pub fn assert_terminal_state<S: Copy + PartialEq>(
    state: S,
    next: S,
    terminal_states: &[S],
) {
    let mut i = 0;
    let mut is_terminal = false;
    while i < terminal_states.len() {
        if terminal_states[i] == state {
            is_terminal = true;
        }
        i += 1;
    }

    if is_terminal {
        kani::assert(
            next == state,
            "terminal state must not have outgoing transitions",
        );
    }
}
