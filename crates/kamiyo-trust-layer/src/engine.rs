use std::collections::HashMap;

use crate::{
    error::TrustLayerError,
    hash::{hash_bytes, hash_i64, hash_u16, hash_u64, hash_u8, new_chain_seed},
    model::{
        apply_score_delta, apply_stake_delta, context_fingerprint, decision_id_hash, failure_bps,
        inactive_secs, is_next_policy_version, is_valid_next_sequence, score_delta, AuditLogRecord,
        DecisionReason, JournalEntry, SubjectState, TrustDecision, TrustEvaluation, TrustEvent,
        TrustLayerSnapshot, TrustPolicy, TrustReceipt, INITIAL_POLICY_VERSION,
    },
};

#[derive(Debug, Clone)]
struct EventRecord {
    subject: String,
    event: TrustEvent,
    receipt: TrustReceipt,
}

#[derive(Debug)]
pub struct TrustLayer {
    policy: TrustPolicy,
    policy_version: u64,
    subjects: HashMap<String, SubjectState>,
    event_index: HashMap<String, EventRecord>,
    journal: Vec<JournalEntry>,
}

impl Default for TrustLayer {
    fn default() -> Self {
        Self {
            policy: TrustPolicy::default(),
            policy_version: INITIAL_POLICY_VERSION,
            subjects: HashMap::new(),
            event_index: HashMap::new(),
            journal: Vec::new(),
        }
    }
}

impl TrustLayer {
    pub fn new(policy: TrustPolicy) -> Result<Self, TrustLayerError> {
        policy.validate()?;
        Ok(Self {
            policy,
            ..Self::default()
        })
    }

    pub fn from_snapshot(snapshot: TrustLayerSnapshot) -> Result<Self, TrustLayerError> {
        snapshot.policy.validate()?;
        if snapshot.policy_version < INITIAL_POLICY_VERSION {
            return Err(TrustLayerError::SnapshotCorrupted(
                "policy_version must be >= INITIAL_POLICY_VERSION",
            ));
        }

        let mut subjects = HashMap::new();
        for (subject, state) in snapshot.subjects {
            if subjects.insert(subject, state).is_some() {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "duplicate subject in snapshot subjects",
                ));
            }
        }

        let mut replayed = HashMap::new();
        let mut event_index = HashMap::new();
        let mut journal = Vec::with_capacity(snapshot.journal.len());

        for (position, entry) in snapshot.journal.into_iter().enumerate() {
            let expected_offset = (position as u64) + 1;
            if entry.offset != expected_offset {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "journal offsets must be contiguous and start at 1",
                ));
            }

            validate_event(&entry.event)?;

            if entry.subject != entry.receipt.subject {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "journal subject does not match receipt subject",
                ));
            }
            if entry.event.event_id != entry.receipt.event_id {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "journal event id does not match receipt event id",
                ));
            }
            if entry.event.sequence != entry.receipt.sequence {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "journal event sequence does not match receipt sequence",
                ));
            }
            if entry.receipt.policy_version != snapshot.policy_version {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "journal receipt policy_version must equal snapshot policy_version",
                ));
            }

            let decision_id = decision_id_hash(
                entry.receipt.policy_version,
                entry.receipt.sequence,
                entry.receipt.event_hash,
                entry.receipt.state_hash,
            );
            if decision_id != entry.receipt.decision_id {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "decision_id does not match receipt hash inputs",
                ));
            }

            if event_index.contains_key(&entry.event.event_id) {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "duplicate event id in journal",
                ));
            }

            let state = replayed
                .entry(entry.subject.clone())
                .or_insert_with(|| SubjectState {
                    chain_hash: new_chain_seed(&entry.subject),
                    ..SubjectState::default()
                });

            if state.last_sequence == 0 && entry.event.sequence != 1 {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "first subject event sequence must be 1",
                ));
            }
            if state.last_sequence != 0
                && !is_valid_next_sequence(state.last_sequence, entry.event.sequence)
            {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "subject event sequence is non-monotonic",
                ));
            }
            if state.last_event_at != 0 && entry.event.observed_at < state.last_event_at {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "subject event timestamps are non-monotonic",
                ));
            }

            state.stake = apply_stake_delta(state.stake, entry.event.stake_delta)?;
            state.score = apply_score_delta(
                state.score,
                score_delta(entry.event.kind, entry.event.weight),
            );

            if entry.event.kind.is_positive() {
                state.success_count = state.success_count.saturating_add(1);
            } else if entry.event.kind.is_negative() {
                state.failure_count = state.failure_count.saturating_add(1);
            }

            state.last_sequence = entry.event.sequence;
            state.last_event_at = entry.event.observed_at;

            let prev_hash = state.chain_hash;
            if entry.receipt.prev_hash != prev_hash {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "receipt prev_hash mismatch while replaying",
                ));
            }

            let event_hash = hash_event(prev_hash, &entry.subject, &entry.event);
            if entry.receipt.event_hash != event_hash {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "receipt event_hash mismatch while replaying",
                ));
            }
            state.chain_hash = event_hash;

            let state_hash = hash_state(&entry.subject, state);
            if entry.receipt.state_hash != state_hash {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "receipt state_hash mismatch while replaying",
                ));
            }
            validate_replayed_receipt(
                &snapshot.policy,
                snapshot.policy_version,
                &entry.subject,
                state,
                &entry.event,
                &entry.receipt,
            )?;

            event_index.insert(
                entry.event.event_id.clone(),
                EventRecord {
                    subject: entry.subject.clone(),
                    event: entry.event.clone(),
                    receipt: entry.receipt.clone(),
                },
            );
            journal.push(entry);
        }

        for (subject, replayed_state) in replayed {
            let Some(snapshot_state) = subjects.get(&subject) else {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "snapshot missing subject state for replayed journal entry",
                ));
            };

            if snapshot_state != &replayed_state {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "snapshot subject state does not match journal replay",
                ));
            }
        }

        for state in subjects.values() {
            if state.last_sequence == 0 && state.chain_hash == 0 {
                continue;
            }
            if state.last_sequence == 0 || state.chain_hash == 0 {
                return Err(TrustLayerError::SnapshotCorrupted(
                    "subject state has inconsistent sequence/hash baseline",
                ));
            }
        }

        Ok(Self {
            policy: snapshot.policy,
            policy_version: snapshot.policy_version,
            subjects,
            event_index,
            journal,
        })
    }

    pub fn policy(&self) -> &TrustPolicy {
        &self.policy
    }

    pub fn policy_version(&self) -> u64 {
        self.policy_version
    }

    pub fn set_policy(&mut self, policy: TrustPolicy) -> Result<(), TrustLayerError> {
        let Some(next_version) = self.policy_version.checked_add(1) else {
            return Err(TrustLayerError::InvalidPolicyVersion {
                current: self.policy_version,
                next: self.policy_version,
            });
        };

        self.set_policy_with_version(policy, next_version)
    }

    pub fn set_policy_with_version(
        &mut self,
        policy: TrustPolicy,
        next_version: u64,
    ) -> Result<(), TrustLayerError> {
        policy.validate()?;

        if !is_next_policy_version(self.policy_version, next_version) {
            return Err(TrustLayerError::InvalidPolicyVersion {
                current: self.policy_version,
                next: next_version,
            });
        }

        self.policy = policy;
        self.policy_version = next_version;
        Ok(())
    }

    pub fn subject_count(&self) -> usize {
        self.subjects.len()
    }

    pub fn journal_len(&self) -> usize {
        self.journal.len()
    }

    pub fn journal(&self) -> &[JournalEntry] {
        &self.journal
    }

    pub fn audit_log_records(&self) -> Vec<AuditLogRecord> {
        self.journal.iter().map(AuditLogRecord::from).collect()
    }

    pub fn snapshot(&self) -> TrustLayerSnapshot {
        let mut subjects: Vec<(String, SubjectState)> = self
            .subjects
            .iter()
            .map(|(subject, state)| (subject.clone(), *state))
            .collect();
        subjects.sort_by(|left, right| left.0.cmp(&right.0));

        TrustLayerSnapshot {
            policy: self.policy,
            policy_version: self.policy_version,
            subjects,
            journal: self.journal.clone(),
        }
    }

    pub fn subject_state(&self, subject: &str) -> Option<&SubjectState> {
        self.subjects.get(subject)
    }

    pub fn seed_subject(&mut self, subject: impl Into<String>, score: u16, stake: u64, now: i64) {
        let subject = subject.into();
        self.subjects.insert(
            subject.clone(),
            SubjectState {
                score: score.min(crate::model::MAX_SCORE),
                stake,
                last_event_at: now,
                chain_hash: new_chain_seed(&subject),
                ..SubjectState::default()
            },
        );
    }

    pub fn apply_event(
        &mut self,
        subject: impl Into<String>,
        event: TrustEvent,
    ) -> Result<TrustReceipt, TrustLayerError> {
        validate_event(&event)?;

        let subject = subject.into();

        if let Some(existing) = self.event_index.get(&event.event_id) {
            if existing.subject == subject && existing.event == event {
                return Ok(existing.receipt.clone());
            }

            return Err(TrustLayerError::EventIdConflict {
                event_id: event.event_id.clone(),
            });
        }

        let state = self
            .subjects
            .entry(subject.clone())
            .or_insert_with(|| SubjectState {
                chain_hash: new_chain_seed(&subject),
                ..SubjectState::default()
            });

        if state.last_sequence == 0 && event.sequence != 1 {
            return Err(TrustLayerError::InvalidSequenceStart(event.sequence));
        }

        if state.last_sequence != 0 && !is_valid_next_sequence(state.last_sequence, event.sequence)
        {
            let expected = state.last_sequence.saturating_add(1);
            return Err(TrustLayerError::NonMonotonicSequence {
                expected,
                actual: event.sequence,
            });
        }

        if state.last_event_at != 0 && event.observed_at < state.last_event_at {
            return Err(TrustLayerError::ClockWentBackwards {
                last: state.last_event_at,
                next: event.observed_at,
            });
        }

        state.stake = apply_stake_delta(state.stake, event.stake_delta)?;
        state.score = apply_score_delta(state.score, score_delta(event.kind, event.weight));

        if event.kind.is_positive() {
            state.success_count = state.success_count.saturating_add(1);
        } else if event.kind.is_negative() {
            state.failure_count = state.failure_count.saturating_add(1);
        }

        state.last_sequence = event.sequence;
        state.last_event_at = event.observed_at;

        let prev_hash = state.chain_hash;
        let event_hash = hash_event(prev_hash, &subject, &event);
        state.chain_hash = event_hash;

        let evaluation = evaluate_state(&self.policy, state, event.observed_at);
        let state_hash = hash_state(&subject, state);
        let decision_id =
            decision_id_hash(self.policy_version, event.sequence, event_hash, state_hash);

        let receipt = TrustReceipt {
            subject: subject.clone(),
            event_id: event.event_id.clone(),
            sequence: event.sequence,
            prev_hash,
            event_hash,
            state_hash,
            policy_version: self.policy_version,
            decision_id,
            evaluation,
            issued_at: event.observed_at,
        };

        let offset = self.journal.len() as u64 + 1;
        self.journal.push(JournalEntry {
            offset,
            subject: subject.clone(),
            event: event.clone(),
            receipt: receipt.clone(),
        });

        self.event_index.insert(
            event.event_id.clone(),
            EventRecord {
                subject,
                event,
                receipt: receipt.clone(),
            },
        );

        Ok(receipt)
    }

    pub fn evaluate_subject(&self, subject: &str, now: i64) -> TrustEvaluation {
        if let Some(state) = self.subjects.get(subject) {
            return evaluate_state(&self.policy, state, now);
        }

        evaluate_state(&self.policy, &SubjectState::default(), now)
    }

    pub fn verify_receipt(&self, receipt: &TrustReceipt) -> bool {
        if receipt.policy_version < INITIAL_POLICY_VERSION
            || receipt.policy_version > self.policy_version
        {
            return false;
        }

        let Some(existing) = self.event_index.get(receipt.event_id.as_str()) else {
            return false;
        };
        if existing.subject != receipt.subject || existing.receipt != *receipt {
            return false;
        }

        let Some(state) = self.subjects.get(receipt.subject.as_str()) else {
            return false;
        };

        if state.last_sequence != receipt.sequence {
            return false;
        }
        if state.chain_hash != receipt.event_hash {
            return false;
        }
        if hash_state(receipt.subject.as_str(), state) != receipt.state_hash {
            return false;
        }

        let expected_decision_id = decision_id_hash(
            receipt.policy_version,
            receipt.sequence,
            receipt.event_hash,
            receipt.state_hash,
        );
        if expected_decision_id != receipt.decision_id {
            return false;
        }
        true
    }
}

fn validate_event(event: &TrustEvent) -> Result<(), TrustLayerError> {
    event.validate()
}

fn validate_replayed_receipt(
    policy: &TrustPolicy,
    policy_version: u64,
    subject: &str,
    state: &SubjectState,
    event: &TrustEvent,
    receipt: &TrustReceipt,
) -> Result<(), TrustLayerError> {
    if receipt.policy_version != policy_version {
        return Err(TrustLayerError::SnapshotCorrupted(
            "journal receipt policy_version must equal snapshot policy_version",
        ));
    }
    if receipt.issued_at != event.observed_at {
        return Err(TrustLayerError::SnapshotCorrupted(
            "receipt issued_at must match event observed_at",
        ));
    }

    let expected = evaluate_state(policy, state, event.observed_at);
    if receipt.evaluation != expected {
        return Err(TrustLayerError::SnapshotCorrupted(
            "journal receipt evaluation mismatch while replaying",
        ));
    }

    if receipt.subject != subject {
        return Err(TrustLayerError::SnapshotCorrupted(
            "journal subject does not match receipt subject",
        ));
    }

    Ok(())
}

pub(crate) fn passes_allow_gate(policy: &TrustPolicy, state: &SubjectState, now: i64) -> bool {
    state.score >= policy.allow_score_floor
        && state.stake >= policy.allow_min_stake
        && failure_bps(state.success_count, state.failure_count) <= policy.allow_max_failure_bps
        && inactive_secs(now, state.last_event_at) <= policy.allow_max_inactive_secs
}

pub(crate) fn passes_review_gate(policy: &TrustPolicy, state: &SubjectState, now: i64) -> bool {
    state.score >= policy.review_score_floor
        && state.stake >= policy.review_min_stake
        && failure_bps(state.success_count, state.failure_count) <= policy.review_max_failure_bps
        && inactive_secs(now, state.last_event_at) <= policy.review_max_inactive_secs
}

pub(crate) fn evaluate_state(
    policy: &TrustPolicy,
    state: &SubjectState,
    now: i64,
) -> TrustEvaluation {
    let mut reasons = Vec::with_capacity(8);

    if state.score < policy.allow_score_floor {
        push_reason(&mut reasons, DecisionReason::ScoreBelowAllow);
    }
    if state.stake < policy.allow_min_stake {
        push_reason(&mut reasons, DecisionReason::StakeBelowAllow);
    }

    let failure = failure_bps(state.success_count, state.failure_count);
    if failure > policy.allow_max_failure_bps {
        push_reason(&mut reasons, DecisionReason::FailureRateTooHighForAllow);
    }

    let inactive = inactive_secs(now, state.last_event_at);
    if inactive > policy.allow_max_inactive_secs {
        push_reason(&mut reasons, DecisionReason::InactiveTooLongForAllow);
    }

    if passes_allow_gate(policy, state, now) {
        return TrustEvaluation {
            decision: TrustDecision::Allow,
            reasons: Vec::new(),
            score: state.score,
            stake: state.stake,
            failure_bps: failure,
            inactive_secs: inactive,
        };
    }

    if state.score < policy.review_score_floor {
        push_reason(&mut reasons, DecisionReason::ScoreBelowReview);
    }
    if state.stake < policy.review_min_stake {
        push_reason(&mut reasons, DecisionReason::StakeBelowReview);
    }
    if failure > policy.review_max_failure_bps {
        push_reason(&mut reasons, DecisionReason::FailureRateTooHighForReview);
    }
    if inactive > policy.review_max_inactive_secs {
        push_reason(&mut reasons, DecisionReason::InactiveTooLongForReview);
    }

    let decision = if passes_review_gate(policy, state, now) {
        TrustDecision::Review
    } else {
        TrustDecision::Deny
    };

    TrustEvaluation {
        decision,
        reasons,
        score: state.score,
        stake: state.stake,
        failure_bps: failure,
        inactive_secs: inactive,
    }
}

fn push_reason(reasons: &mut Vec<DecisionReason>, reason: DecisionReason) {
    if !reasons.contains(&reason) {
        reasons.push(reason);
    }
}

fn hash_event(prev_hash: u64, subject: &str, event: &TrustEvent) -> u64 {
    let mut hash = hash_bytes(prev_hash, subject.as_bytes());
    hash = hash_bytes(hash, event.event_id.as_bytes());
    hash = hash_u64(hash, event.sequence);
    hash = hash_i64(hash, event.observed_at);
    hash = hash_u8(hash, event.kind as u8);
    hash = hash_u16(hash, event.weight);
    hash = hash_i64(hash, event.stake_delta);
    hash_u64(hash, context_fingerprint(&event.context))
}

fn hash_state(subject: &str, state: &SubjectState) -> u64 {
    let mut hash = hash_bytes(0xcbf29ce484222325, subject.as_bytes());
    hash = hash_u16(hash, state.score);
    hash = hash_u64(hash, state.stake);
    hash = hash_u64(hash, state.success_count);
    hash = hash_u64(hash, state.failure_count);
    hash = hash_u64(hash, state.last_sequence);
    hash = hash_i64(hash, state.last_event_at);
    hash_u64(hash, state.chain_hash)
}
