//! CPI contract stubs for formal verification of cross-program invocations.

/// A single recorded CPI call.
#[derive(Clone, Debug)]
pub struct CpiRecord {
    pub target_program: [u8; 32],
    pub instruction_name: &'static str,
    pub lamports_transferred: u64,
    pub accounts_touched: u8,
}

/// Fixed-size CPI call log. No heap allocation.
pub struct CpiLog {
    records: [Option<CpiRecord>; 16],
    count: usize,
}

/// Helper: produces a `[None; 16]` array in const context without requiring
/// nightly `const { None }` syntax.
const fn none_array() -> [Option<CpiRecord>; 16] {
    [
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    ]
}

impl CpiLog {
    /// Creates an empty log.
    pub const fn new() -> Self {
        Self {
            records: none_array(),
            count: 0,
        }
    }

    /// Appends a CPI record. Panics if the log is full.
    pub fn record(&mut self, r: CpiRecord) {
        assert!(self.count < 16, "CpiLog overflow: max 16 records");
        self.records[self.count] = Some(r);
        self.count += 1;
    }

    /// Number of recorded CPI calls.
    pub fn count(&self) -> usize {
        self.count
    }

    /// Iterates over all recorded CPI calls.
    pub fn iter(&self) -> impl Iterator<Item = &CpiRecord> {
        self.records[..self.count]
            .iter()
            .filter_map(|slot| slot.as_ref())
    }
}

/// Generates a CPI contract stub function with pre/post conditions.
///
/// The generated function executes the precondition body, records the CPI
/// call into a [`CpiLog`], then executes the postcondition body.
///
/// # Example
///
/// ```ignore
/// cpi_stub! {
///     name: token_transfer,
///     program: TOKEN_PROGRAM_ID,
///     pre: |from: &mut AgentAccount, to: &mut AgentAccount, amount: u64| {
///         kani::assume(from.lamports >= amount);
///     },
///     post: |from: &mut AgentAccount, to: &mut AgentAccount, amount: u64| {
///         from.lamports -= amount;
///         to.lamports += amount;
///     },
/// }
/// ```
#[macro_export]
macro_rules! cpi_stub {
    (
        name: $name:ident,
        program: $program:expr,
        pre: |$($pre_arg:ident : $pre_ty:ty),* $(,)?| $pre_body:block,
        post: |$($post_arg:ident : $post_ty:ty),* $(,)?| $post_body:block $(,)?
    ) => {
        fn $name(
            $($pre_arg : $pre_ty,)*
            cpi_log: &mut $crate::agent::cpi::CpiLog,
        ) {
            $pre_body
            cpi_log.record($crate::agent::cpi::CpiRecord {
                target_program: $program,
                instruction_name: stringify!($name),
                lamports_transferred: 0,
                accounts_touched: 0,
            });
            $post_body
        }
    };
}
