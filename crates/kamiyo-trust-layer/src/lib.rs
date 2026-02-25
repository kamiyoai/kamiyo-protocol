//! Standalone trust layer with deterministic policy evaluation and receipts.

pub mod engine;
pub mod error;
pub mod hash;
pub mod model;

pub use engine::TrustLayer;
pub use error::TrustLayerError;
pub use model::{
    decision_id_hash, is_next_policy_version, is_valid_context_field, is_valid_event_id,
    AuditLogRecord, DecisionReason, EventContext, EvidenceKind, JournalEntry, SubjectState,
    TrustDecision, TrustEvaluation, TrustEvent, TrustLayerSnapshot, TrustPolicy, TrustProvider,
    TrustReceipt, BASE_SCORE, BASIS_POINTS_DENOMINATOR, INITIAL_POLICY_VERSION,
    MAX_CONTEXT_FIELD_LEN, MAX_EVENT_ID_LEN, MAX_EVENT_WEIGHT, MAX_SCORE,
};

#[cfg(kani)]
mod proofs;
