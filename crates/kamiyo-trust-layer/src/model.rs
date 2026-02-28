use crate::{
    error::TrustLayerError,
    hash::{hash_bytes, FNV_OFFSET_BASIS},
};
use core::str::FromStr;

pub const MAX_SCORE: u16 = 1_000;
pub const BASE_SCORE: u16 = 500;
pub const BASIS_POINTS_DENOMINATOR: u16 = 10_000;
pub const MAX_EVENT_WEIGHT: u16 = 100;
pub const INITIAL_POLICY_VERSION: u64 = 1;
pub const MAX_EVENT_ID_LEN: usize = 128;
pub const MAX_CONTEXT_FIELD_LEN: usize = 128;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum TrustProvider {
    OpenClaw = 1,
    NanoClaw = 2,
    IronClaw = 3,
    Xai = 4,
    OpenAi = 5,
    Anthropic = 6,
    Local = 7,
    Custom = 8,
}

impl TrustProvider {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::OpenClaw => "openclaw",
            Self::NanoClaw => "nanoclaw",
            Self::IronClaw => "ironclaw",
            Self::Xai => "xai",
            Self::OpenAi => "openai",
            Self::Anthropic => "anthropic",
            Self::Local => "local",
            Self::Custom => "custom",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "openclaw" => Some(Self::OpenClaw),
            "nanoclaw" => Some(Self::NanoClaw),
            "ironclaw" => Some(Self::IronClaw),
            "xai" => Some(Self::Xai),
            "openai" => Some(Self::OpenAi),
            "anthropic" => Some(Self::Anthropic),
            "local" => Some(Self::Local),
            "custom" => Some(Self::Custom),
            _ => None,
        }
    }
}

impl FromStr for TrustProvider {
    type Err = ();

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::parse(value).ok_or(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum EvidenceKind {
    VerifiedSuccess = 1,
    DisputeWon = 2,
    DisputeLost = 3,
    Slash = 4,
    ManualCredit = 5,
    ManualDebit = 6,
    PoCHVerified = 7,
    PoCHRejected = 8,
    PoCHDisputed = 9,
}

impl EvidenceKind {
    pub fn is_positive(self) -> bool {
        matches!(
            self,
            Self::VerifiedSuccess | Self::DisputeWon | Self::ManualCredit | Self::PoCHVerified
        )
    }

    pub fn is_negative(self) -> bool {
        matches!(
            self,
            Self::DisputeLost
                | Self::Slash
                | Self::ManualDebit
                | Self::PoCHRejected
                | Self::PoCHDisputed
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct EventContext {
    pub request_id: Option<String>,
    pub trace_id: Option<String>,
    pub span_id: Option<String>,
    pub provider: Option<TrustProvider>,
}

impl EventContext {
    pub fn validate(&self) -> Result<(), TrustLayerError> {
        validate_optional_context("request_id", &self.request_id)?;
        validate_optional_context("trace_id", &self.trace_id)?;
        validate_optional_context("span_id", &self.span_id)?;
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrustEvent {
    pub event_id: String,
    pub sequence: u64,
    pub observed_at: i64,
    pub kind: EvidenceKind,
    pub weight: u16,
    pub stake_delta: i64,
    pub context: EventContext,
}

impl TrustEvent {
    pub fn new(
        event_id: impl Into<String>,
        sequence: u64,
        observed_at: i64,
        kind: EvidenceKind,
        weight: u16,
        stake_delta: i64,
    ) -> Self {
        Self {
            event_id: event_id.into(),
            sequence,
            observed_at,
            kind,
            weight,
            stake_delta,
            context: EventContext::default(),
        }
    }

    pub fn with_context(mut self, context: EventContext) -> Self {
        self.context = context;
        self
    }

    pub fn validate(&self) -> Result<(), TrustLayerError> {
        if !is_valid_event_id(&self.event_id) {
            return Err(TrustLayerError::InvalidEventId(self.event_id.clone()));
        }
        if self.weight == 0 || self.weight > MAX_EVENT_WEIGHT {
            return Err(TrustLayerError::InvalidWeight(self.weight));
        }

        self.context.validate()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TrustPolicy {
    pub allow_score_floor: u16,
    pub review_score_floor: u16,
    pub allow_min_stake: u64,
    pub review_min_stake: u64,
    pub allow_max_failure_bps: u16,
    pub review_max_failure_bps: u16,
    pub allow_max_inactive_secs: u64,
    pub review_max_inactive_secs: u64,
}

impl Default for TrustPolicy {
    fn default() -> Self {
        Self {
            allow_score_floor: 700,
            review_score_floor: 550,
            allow_min_stake: 10_000,
            review_min_stake: 1_000,
            allow_max_failure_bps: 1_500,
            review_max_failure_bps: 3_500,
            allow_max_inactive_secs: 3 * 24 * 60 * 60,
            review_max_inactive_secs: 14 * 24 * 60 * 60,
        }
    }
}

impl TrustPolicy {
    pub fn validate(&self) -> Result<(), TrustLayerError> {
        if self.allow_score_floor > MAX_SCORE {
            return Err(TrustLayerError::InvalidPolicy(
                "allow_score_floor exceeds MAX_SCORE",
            ));
        }
        if self.review_score_floor > MAX_SCORE {
            return Err(TrustLayerError::InvalidPolicy(
                "review_score_floor exceeds MAX_SCORE",
            ));
        }
        if self.allow_score_floor < self.review_score_floor {
            return Err(TrustLayerError::InvalidPolicy(
                "allow_score_floor must be >= review_score_floor",
            ));
        }
        if self.allow_min_stake < self.review_min_stake {
            return Err(TrustLayerError::InvalidPolicy(
                "allow_min_stake must be >= review_min_stake",
            ));
        }
        if self.allow_max_failure_bps > BASIS_POINTS_DENOMINATOR {
            return Err(TrustLayerError::InvalidPolicy(
                "allow_max_failure_bps exceeds basis-point denominator",
            ));
        }
        if self.review_max_failure_bps > BASIS_POINTS_DENOMINATOR {
            return Err(TrustLayerError::InvalidPolicy(
                "review_max_failure_bps exceeds basis-point denominator",
            ));
        }
        if self.allow_max_failure_bps > self.review_max_failure_bps {
            return Err(TrustLayerError::InvalidPolicy(
                "allow_max_failure_bps must be <= review_max_failure_bps",
            ));
        }
        if self.allow_max_inactive_secs > self.review_max_inactive_secs {
            return Err(TrustLayerError::InvalidPolicy(
                "allow_max_inactive_secs must be <= review_max_inactive_secs",
            ));
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum TrustDecision {
    Allow = 1,
    Review = 2,
    Deny = 3,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum DecisionReason {
    ScoreBelowAllow = 1,
    ScoreBelowReview = 2,
    StakeBelowAllow = 3,
    StakeBelowReview = 4,
    FailureRateTooHighForAllow = 5,
    FailureRateTooHighForReview = 6,
    InactiveTooLongForAllow = 7,
    InactiveTooLongForReview = 8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrustEvaluation {
    pub decision: TrustDecision,
    pub reasons: Vec<DecisionReason>,
    pub score: u16,
    pub stake: u64,
    pub failure_bps: u16,
    pub inactive_secs: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SubjectState {
    pub score: u16,
    pub stake: u64,
    pub success_count: u64,
    pub failure_count: u64,
    pub last_sequence: u64,
    pub last_event_at: i64,
    pub chain_hash: u64,
}

impl Default for SubjectState {
    fn default() -> Self {
        Self {
            score: BASE_SCORE,
            stake: 0,
            success_count: 0,
            failure_count: 0,
            last_sequence: 0,
            last_event_at: 0,
            chain_hash: 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrustReceipt {
    pub subject: String,
    pub event_id: String,
    pub sequence: u64,
    pub prev_hash: u64,
    pub event_hash: u64,
    pub state_hash: u64,
    pub policy_version: u64,
    pub decision_id: u64,
    pub evaluation: TrustEvaluation,
    pub issued_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JournalEntry {
    pub offset: u64,
    pub subject: String,
    pub event: TrustEvent,
    pub receipt: TrustReceipt,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrustLayerSnapshot {
    pub policy: TrustPolicy,
    pub policy_version: u64,
    pub subjects: Vec<(String, SubjectState)>,
    pub journal: Vec<JournalEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditLogRecord {
    pub offset: u64,
    pub timestamp: i64,
    pub observed_timestamp: i64,
    pub subject: String,
    pub event_id: String,
    pub sequence: u64,
    pub policy_version: u64,
    pub decision_id: u64,
    pub decision: TrustDecision,
    pub reasons: Vec<DecisionReason>,
    pub trace_id: Option<String>,
    pub span_id: Option<String>,
    pub request_id: Option<String>,
    pub provider: Option<TrustProvider>,
}

impl From<&JournalEntry> for AuditLogRecord {
    fn from(entry: &JournalEntry) -> Self {
        Self {
            offset: entry.offset,
            timestamp: entry.receipt.issued_at,
            observed_timestamp: entry.event.observed_at,
            subject: entry.subject.clone(),
            event_id: entry.event.event_id.clone(),
            sequence: entry.event.sequence,
            policy_version: entry.receipt.policy_version,
            decision_id: entry.receipt.decision_id,
            decision: entry.receipt.evaluation.decision,
            reasons: entry.receipt.evaluation.reasons.clone(),
            trace_id: entry.event.context.trace_id.clone(),
            span_id: entry.event.context.span_id.clone(),
            request_id: entry.event.context.request_id.clone(),
            provider: entry.event.context.provider,
        }
    }
}

pub fn score_delta(kind: EvidenceKind, weight: u16) -> i32 {
    let w = i32::from(weight);
    match kind {
        EvidenceKind::VerifiedSuccess => 4 * w,
        EvidenceKind::DisputeWon => 2 * w,
        EvidenceKind::DisputeLost => -6 * w,
        EvidenceKind::Slash => -8 * w,
        EvidenceKind::ManualCredit => 10 * w,
        EvidenceKind::ManualDebit => -10 * w,
        EvidenceKind::PoCHVerified => 3 * w,
        EvidenceKind::PoCHRejected => -6 * w,
        EvidenceKind::PoCHDisputed => -3 * w,
    }
}

pub fn apply_score_delta(score: u16, delta: i32) -> u16 {
    let base = i64::from(score.min(MAX_SCORE));
    (base + i64::from(delta)).clamp(0, i64::from(MAX_SCORE)) as u16
}

pub fn failure_bps(success_count: u64, failure_count: u64) -> u16 {
    let total = success_count.saturating_add(failure_count);
    if total == 0 {
        return 0;
    }

    let numerator = u128::from(failure_count) * u128::from(BASIS_POINTS_DENOMINATOR);
    let value = numerator / u128::from(total);
    value.min(u128::from(BASIS_POINTS_DENOMINATOR)) as u16
}

pub fn is_valid_next_sequence(last_sequence: u64, next_sequence: u64) -> bool {
    if last_sequence == 0 {
        return next_sequence == 1;
    }

    last_sequence
        .checked_add(1)
        .is_some_and(|expected| next_sequence == expected)
}

pub fn is_next_policy_version(current_version: u64, next_version: u64) -> bool {
    current_version
        .checked_add(1)
        .is_some_and(|expected| expected == next_version)
}

pub fn decision_id_hash(
    policy_version: u64,
    sequence: u64,
    event_hash: u64,
    state_hash: u64,
) -> u64 {
    let mut hash = 0x9e37_79b9_7f4a_7c15u64;

    hash ^= policy_version.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    hash = hash.rotate_left(27).wrapping_mul(0x94d0_49bb_1331_11eb);

    hash ^= sequence.wrapping_mul(0x369d_ea0f_31a5_3f85);
    hash = hash.rotate_left(31).wrapping_mul(0xbf58_476d_1ce4_e5b9);

    hash ^= event_hash.wrapping_mul(0x94d0_49bb_1331_11eb);
    hash = hash.rotate_left(33).wrapping_mul(0x369d_ea0f_31a5_3f85);

    hash ^= state_hash;
    hash.rotate_left(29) ^ 0x27bb_2ee6_87b0_b0fd
}

pub fn apply_stake_delta(stake: u64, delta: i64) -> Result<u64, TrustLayerError> {
    if delta >= 0 {
        return stake
            .checked_add(delta as u64)
            .ok_or(TrustLayerError::StakeOverflow { stake, delta });
    }

    stake
        .checked_sub(delta.unsigned_abs())
        .ok_or(TrustLayerError::StakeUnderflow { stake, delta })
}

pub fn inactive_secs(now: i64, last_event_at: i64) -> u64 {
    if now <= last_event_at {
        return 0;
    }

    (now - last_event_at) as u64
}

pub fn is_valid_event_id(value: &str) -> bool {
    is_valid_identifier(value, MAX_EVENT_ID_LEN)
}

pub fn is_valid_context_field(value: &str) -> bool {
    is_valid_identifier(value, MAX_CONTEXT_FIELD_LEN)
}

fn validate_optional_context(
    field_name: &'static str,
    value: &Option<String>,
) -> Result<(), TrustLayerError> {
    if let Some(current) = value {
        if !is_valid_context_field(current) {
            return Err(TrustLayerError::InvalidContextField {
                field: field_name,
                value: current.clone(),
            });
        }
    }

    Ok(())
}

fn is_valid_identifier(value: &str, max_len: usize) -> bool {
    if value.is_empty() || value.len() > max_len {
        return false;
    }

    value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b':' | b'.'))
}

pub fn context_fingerprint(context: &EventContext) -> u64 {
    let mut hash = FNV_OFFSET_BASIS;

    hash = hash_optional_string(hash, &context.request_id);
    hash = hash_optional_string(hash, &context.trace_id);
    hash = hash_optional_string(hash, &context.span_id);
    if let Some(provider) = context.provider {
        hash = hash_bytes(hash, &[0xff, provider as u8]);
    }
    hash
}

fn hash_optional_string(seed: u64, value: &Option<String>) -> u64 {
    match value {
        Some(v) => hash_bytes(seed, v.as_bytes()),
        None => hash_bytes(seed, &[0u8]),
    }
}
