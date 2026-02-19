use core::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TrustLayerError {
    InvalidPolicy(&'static str),
    InvalidPolicyVersion { current: u64, next: u64 },
    InvalidWeight(u16),
    InvalidEventId(String),
    InvalidContextField { field: &'static str, value: String },
    EventIdConflict { event_id: String },
    InvalidSequenceStart(u64),
    NonMonotonicSequence { expected: u64, actual: u64 },
    ClockWentBackwards { last: i64, next: i64 },
    StakeUnderflow { stake: u64, delta: i64 },
    StakeOverflow { stake: u64, delta: i64 },
    SnapshotCorrupted(&'static str),
}

impl fmt::Display for TrustLayerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidPolicy(reason) => write!(f, "invalid trust policy: {reason}"),
            Self::InvalidPolicyVersion { current, next } => write!(
                f,
                "invalid policy version transition (current {current}, next {next})"
            ),
            Self::InvalidWeight(weight) => write!(f, "invalid event weight: {weight}"),
            Self::InvalidEventId(event_id) => write!(f, "invalid event id: {event_id}"),
            Self::InvalidContextField { field, value } => {
                write!(f, "invalid context field {field}: {value}")
            }
            Self::EventIdConflict { event_id } => {
                write!(f, "event id conflict for id {event_id}")
            }
            Self::InvalidSequenceStart(actual) => {
                write!(f, "first event sequence must be 1, got {actual}")
            }
            Self::NonMonotonicSequence { expected, actual } => write!(
                f,
                "event sequence must be monotonic (expected {expected}, got {actual})"
            ),
            Self::ClockWentBackwards { last, next } => write!(
                f,
                "event timestamp must be monotonic (last {last}, got {next})"
            ),
            Self::StakeUnderflow { stake, delta } => {
                write!(f, "stake underflow for stake {stake} with delta {delta}")
            }
            Self::StakeOverflow { stake, delta } => {
                write!(f, "stake overflow for stake {stake} with delta {delta}")
            }
            Self::SnapshotCorrupted(reason) => write!(f, "snapshot corrupted: {reason}"),
        }
    }
}

impl std::error::Error for TrustLayerError {}
