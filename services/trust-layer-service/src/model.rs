use axum::http::StatusCode;
use kamiyo_trust_layer::{
    DecisionReason, EventContext, EvidenceKind, TrustDecision, TrustEvaluation, TrustEvent,
    TrustProvider, TrustReceipt,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct ApiError {
    pub status: u16,
    pub error: String,
}

impl ApiError {
    pub fn new(status: StatusCode, error: impl Into<String>) -> Self {
        Self {
            status: status.as_u16(),
            error: error.into(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct IngestEventRequest {
    pub event_id: String,
    pub subject: String,
    pub sequence: u64,
    pub observed_at: i64,
    pub kind: EvidenceKindWire,
    pub weight: u16,
    pub stake_delta: i64,
    #[serde(default)]
    pub context: EventContextWire,
}

impl IngestEventRequest {
    pub fn to_event(&self) -> TrustEvent {
        TrustEvent::new(
            self.event_id.clone(),
            self.sequence,
            self.observed_at,
            self.kind.into(),
            self.weight,
            self.stake_delta,
        )
        .with_context(self.context.clone().into())
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct IngestEventResponse {
    pub idempotent_replay: bool,
    pub receipt: TrustReceiptWire,
}

#[derive(Debug, Clone, Serialize)]
pub struct SubjectViewResponse {
    pub subject: String,
    pub evaluation: TrustEvaluationWire,
    pub state: Option<SubjectStateWire>,
    pub policy_version: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct TrustReceiptWire {
    pub subject: String,
    pub event_id: String,
    pub sequence: u64,
    pub prev_hash: String,
    pub event_hash: String,
    pub state_hash: String,
    pub policy_version: u64,
    pub decision_id: String,
    pub issued_at: i64,
    pub evaluation: TrustEvaluationWire,
}

impl From<TrustReceipt> for TrustReceiptWire {
    fn from(value: TrustReceipt) -> Self {
        Self {
            subject: value.subject,
            event_id: value.event_id,
            sequence: value.sequence,
            prev_hash: value.prev_hash.to_string(),
            event_hash: value.event_hash.to_string(),
            state_hash: value.state_hash.to_string(),
            policy_version: value.policy_version,
            decision_id: value.decision_id.to_string(),
            issued_at: value.issued_at,
            evaluation: value.evaluation.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TrustEvaluationWire {
    pub decision: TrustDecisionWire,
    pub reasons: Vec<DecisionReasonWire>,
    pub score: u16,
    pub stake: u64,
    pub failure_bps: u16,
    pub inactive_secs: u64,
}

impl From<TrustEvaluation> for TrustEvaluationWire {
    fn from(value: TrustEvaluation) -> Self {
        Self {
            decision: value.decision.into(),
            reasons: value.reasons.into_iter().map(Into::into).collect(),
            score: value.score,
            stake: value.stake,
            failure_bps: value.failure_bps,
            inactive_secs: value.inactive_secs,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SubjectStateWire {
    pub score: u16,
    pub stake: u64,
    pub success_count: u64,
    pub failure_count: u64,
    pub last_sequence: u64,
    pub last_event_at: i64,
    pub chain_hash: String,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TrustDecisionWire {
    Allow,
    Review,
    Deny,
}

impl From<TrustDecision> for TrustDecisionWire {
    fn from(value: TrustDecision) -> Self {
        match value {
            TrustDecision::Allow => Self::Allow,
            TrustDecision::Review => Self::Review,
            TrustDecision::Deny => Self::Deny,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DecisionReasonWire {
    ScoreBelowAllow,
    ScoreBelowReview,
    StakeBelowAllow,
    StakeBelowReview,
    FailureRateTooHighForAllow,
    FailureRateTooHighForReview,
    InactiveTooLongForAllow,
    InactiveTooLongForReview,
}

impl From<DecisionReason> for DecisionReasonWire {
    fn from(value: DecisionReason) -> Self {
        match value {
            DecisionReason::ScoreBelowAllow => Self::ScoreBelowAllow,
            DecisionReason::ScoreBelowReview => Self::ScoreBelowReview,
            DecisionReason::StakeBelowAllow => Self::StakeBelowAllow,
            DecisionReason::StakeBelowReview => Self::StakeBelowReview,
            DecisionReason::FailureRateTooHighForAllow => Self::FailureRateTooHighForAllow,
            DecisionReason::FailureRateTooHighForReview => Self::FailureRateTooHighForReview,
            DecisionReason::InactiveTooLongForAllow => Self::InactiveTooLongForAllow,
            DecisionReason::InactiveTooLongForReview => Self::InactiveTooLongForReview,
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceKindWire {
    VerifiedSuccess,
    DisputeWon,
    DisputeLost,
    Slash,
    ManualCredit,
    ManualDebit,
    PoCHVerified,
    PoCHRejected,
    PoCHDisputed,
}

impl From<EvidenceKindWire> for EvidenceKind {
    fn from(value: EvidenceKindWire) -> Self {
        match value {
            EvidenceKindWire::VerifiedSuccess => EvidenceKind::VerifiedSuccess,
            EvidenceKindWire::DisputeWon => EvidenceKind::DisputeWon,
            EvidenceKindWire::DisputeLost => EvidenceKind::DisputeLost,
            EvidenceKindWire::Slash => EvidenceKind::Slash,
            EvidenceKindWire::ManualCredit => EvidenceKind::ManualCredit,
            EvidenceKindWire::ManualDebit => EvidenceKind::ManualDebit,
            EvidenceKindWire::PoCHVerified => EvidenceKind::PoCHVerified,
            EvidenceKindWire::PoCHRejected => EvidenceKind::PoCHRejected,
            EvidenceKindWire::PoCHDisputed => EvidenceKind::PoCHDisputed,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct EventContextWire {
    pub request_id: Option<String>,
    pub trace_id: Option<String>,
    pub span_id: Option<String>,
    pub provider: Option<TrustProviderWire>,
}

impl From<EventContextWire> for EventContext {
    fn from(value: EventContextWire) -> Self {
        EventContext {
            request_id: value.request_id,
            trace_id: value.trace_id,
            span_id: value.span_id,
            provider: value.provider.map(Into::into),
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub enum TrustProviderWire {
    #[serde(rename = "openclaw")]
    OpenClaw,
    #[serde(rename = "nanoclaw")]
    NanoClaw,
    #[serde(rename = "ironclaw")]
    IronClaw,
    #[serde(rename = "xai")]
    Xai,
    #[serde(rename = "openai")]
    OpenAi,
    #[serde(rename = "anthropic")]
    Anthropic,
    #[serde(rename = "local")]
    Local,
    #[serde(rename = "custom")]
    Custom,
}

impl From<TrustProviderWire> for TrustProvider {
    fn from(value: TrustProviderWire) -> Self {
        match value {
            TrustProviderWire::OpenClaw => TrustProvider::OpenClaw,
            TrustProviderWire::NanoClaw => TrustProvider::NanoClaw,
            TrustProviderWire::IronClaw => TrustProvider::IronClaw,
            TrustProviderWire::Xai => TrustProvider::Xai,
            TrustProviderWire::OpenAi => TrustProvider::OpenAi,
            TrustProviderWire::Anthropic => TrustProvider::Anthropic,
            TrustProviderWire::Local => TrustProvider::Local,
            TrustProviderWire::Custom => TrustProvider::Custom,
        }
    }
}

pub fn evidence_kind_to_code(kind: EvidenceKind) -> i16 {
    kind as i16
}

pub fn evidence_kind_from_code(code: i16) -> Option<EvidenceKind> {
    match code {
        1 => Some(EvidenceKind::VerifiedSuccess),
        2 => Some(EvidenceKind::DisputeWon),
        3 => Some(EvidenceKind::DisputeLost),
        4 => Some(EvidenceKind::Slash),
        5 => Some(EvidenceKind::ManualCredit),
        6 => Some(EvidenceKind::ManualDebit),
        7 => Some(EvidenceKind::PoCHVerified),
        8 => Some(EvidenceKind::PoCHRejected),
        9 => Some(EvidenceKind::PoCHDisputed),
        _ => None,
    }
}

pub fn decision_to_code(decision: TrustDecision) -> i16 {
    decision as i16
}

pub fn decision_from_code(code: i16) -> Option<TrustDecision> {
    match code {
        1 => Some(TrustDecision::Allow),
        2 => Some(TrustDecision::Review),
        3 => Some(TrustDecision::Deny),
        _ => None,
    }
}

pub fn reason_to_code(reason: DecisionReason) -> i16 {
    reason as i16
}

pub fn reason_from_code(code: i16) -> Option<DecisionReason> {
    match code {
        1 => Some(DecisionReason::ScoreBelowAllow),
        2 => Some(DecisionReason::ScoreBelowReview),
        3 => Some(DecisionReason::StakeBelowAllow),
        4 => Some(DecisionReason::StakeBelowReview),
        5 => Some(DecisionReason::FailureRateTooHighForAllow),
        6 => Some(DecisionReason::FailureRateTooHighForReview),
        7 => Some(DecisionReason::InactiveTooLongForAllow),
        8 => Some(DecisionReason::InactiveTooLongForReview),
        _ => None,
    }
}
