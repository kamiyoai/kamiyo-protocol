use kamiyo_trust_layer::{
    decision_id_hash,
    model::{
        DecisionReason, EventContext, EvidenceKind, TrustDecision, TrustEvent, TrustPolicy,
        TrustProvider,
    },
    TrustLayer, TrustLayerError,
};

fn default_policy() -> TrustPolicy {
    TrustPolicy::default()
}

fn event(
    event_id: &str,
    sequence: u64,
    observed_at: i64,
    kind: EvidenceKind,
    weight: u16,
    stake_delta: i64,
) -> TrustEvent {
    TrustEvent::new(event_id, sequence, observed_at, kind, weight, stake_delta)
}

#[test]
fn happy_path_emits_verifiable_receipt() {
    let mut layer = TrustLayer::new(default_policy()).expect("policy should be valid");

    let receipt = layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-001",
                1,
                1_700_000_000,
                EvidenceKind::ManualCredit,
                20,
                12_000,
            ),
        )
        .expect("event should apply");

    assert_eq!(receipt.evaluation.decision, TrustDecision::Allow);
    assert_eq!(receipt.policy_version, 1);
    assert!(layer.verify_receipt(&receipt));
}

#[test]
fn rejects_non_monotonic_sequence() {
    let mut layer = TrustLayer::new(default_policy()).expect("policy should be valid");

    layer
        .apply_event(
            "agent-alpha",
            event("evt-001", 1, 10, EvidenceKind::VerifiedSuccess, 10, 3_000),
        )
        .expect("first event should apply");

    let err = layer
        .apply_event(
            "agent-alpha",
            event("evt-002", 3, 11, EvidenceKind::VerifiedSuccess, 10, 0),
        )
        .expect_err("out-of-order sequence must fail");

    assert_eq!(
        err,
        TrustLayerError::NonMonotonicSequence {
            expected: 2,
            actual: 3
        }
    );
}

#[test]
fn failure_rate_can_force_deny() {
    let mut layer = TrustLayer::new(default_policy()).expect("policy should be valid");
    layer.seed_subject("agent-alpha", 900, 25_000, 1_700_000_000);

    let receipt = layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-001",
                1,
                1_700_000_050,
                EvidenceKind::DisputeLost,
                40,
                0,
            ),
        )
        .expect("event should apply");

    assert_eq!(receipt.evaluation.decision, TrustDecision::Deny);
    assert!(receipt
        .evaluation
        .reasons
        .contains(&DecisionReason::FailureRateTooHighForReview));
}

#[test]
fn receipt_chain_links_events() {
    let mut layer = TrustLayer::new(default_policy()).expect("policy should be valid");

    let first = layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-001",
                1,
                1_700_000_000,
                EvidenceKind::ManualCredit,
                15,
                8_000,
            ),
        )
        .expect("first event should apply");

    let second = layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-002",
                2,
                1_700_000_010,
                EvidenceKind::VerifiedSuccess,
                10,
                2_000,
            ),
        )
        .expect("second event should apply");

    assert_ne!(first.event_hash, second.event_hash);
    assert_eq!(second.prev_hash, first.event_hash);
}

#[test]
fn old_receipts_become_stale_after_new_events() {
    let mut layer = TrustLayer::new(default_policy()).expect("policy should be valid");

    let first = layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-001",
                1,
                1_700_000_000,
                EvidenceKind::ManualCredit,
                20,
                10_000,
            ),
        )
        .expect("first event should apply");

    let second = layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-002",
                2,
                1_700_000_010,
                EvidenceKind::VerifiedSuccess,
                5,
                0,
            ),
        )
        .expect("second event should apply");

    assert!(!layer.verify_receipt(&first));
    assert!(layer.verify_receipt(&second));
}

#[test]
fn unknown_subject_defaults_to_deny() {
    let layer = TrustLayer::new(default_policy()).expect("policy should be valid");

    let evaluation = layer.evaluate_subject("unknown-agent", 1_700_000_000);
    assert_eq!(evaluation.decision, TrustDecision::Deny);
    assert!(evaluation
        .reasons
        .contains(&DecisionReason::StakeBelowReview));
}

#[test]
fn duplicate_identical_event_is_idempotent() {
    let mut layer = TrustLayer::new(default_policy()).expect("policy should be valid");

    let first = layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-dup",
                1,
                1_700_000_000,
                EvidenceKind::ManualCredit,
                20,
                10_000,
            ),
        )
        .expect("first application should work");

    let second = layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-dup",
                1,
                1_700_000_000,
                EvidenceKind::ManualCredit,
                20,
                10_000,
            ),
        )
        .expect("duplicate should be idempotent");

    assert_eq!(first, second);
    assert_eq!(layer.journal_len(), 1);
}

#[test]
fn duplicate_conflicting_event_is_rejected() {
    let mut layer = TrustLayer::new(default_policy()).expect("policy should be valid");

    layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-dup",
                1,
                1_700_000_000,
                EvidenceKind::ManualCredit,
                20,
                10_000,
            ),
        )
        .expect("first event should apply");

    let err = layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-dup",
                1,
                1_700_000_000,
                EvidenceKind::ManualDebit,
                20,
                10_000,
            ),
        )
        .expect_err("conflicting duplicate must fail");

    assert_eq!(
        err,
        TrustLayerError::EventIdConflict {
            event_id: "evt-dup".to_string(),
        }
    );
}

#[test]
fn snapshot_roundtrip_restores_state() {
    let mut layer = TrustLayer::new(default_policy()).expect("policy should be valid");

    let _ = layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-001",
                1,
                1_700_000_000,
                EvidenceKind::ManualCredit,
                20,
                10_000,
            ),
        )
        .expect("first event should apply");

    let second = layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-002",
                2,
                1_700_000_010,
                EvidenceKind::VerifiedSuccess,
                5,
                0,
            ),
        )
        .expect("second event should apply");

    let snapshot = layer.snapshot();
    let restored = TrustLayer::from_snapshot(snapshot).expect("snapshot should restore");

    assert_eq!(restored.journal_len(), 2);
    assert_eq!(restored.subject_count(), 1);
    assert!(restored.verify_receipt(&second));
}

#[test]
fn verify_receipt_rejects_tampered_body() {
    let mut layer = TrustLayer::new(default_policy()).expect("policy should be valid");

    let receipt = layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-001",
                1,
                1_700_000_000,
                EvidenceKind::ManualCredit,
                20,
                10_000,
            ),
        )
        .expect("event should apply");

    let mut tampered = receipt.clone();
    tampered.evaluation.decision = TrustDecision::Review;

    assert!(!layer.verify_receipt(&tampered));
}

#[test]
fn snapshot_rejects_tampered_evaluation() {
    let mut layer = TrustLayer::new(default_policy()).expect("policy should be valid");

    layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-001",
                1,
                1_700_000_000,
                EvidenceKind::ManualCredit,
                20,
                10_000,
            ),
        )
        .expect("event should apply");

    let mut snapshot = layer.snapshot();
    snapshot.journal[0].receipt.evaluation.decision = TrustDecision::Deny;

    let err = TrustLayer::from_snapshot(snapshot).expect_err("tampered snapshot must fail");
    assert_eq!(
        err,
        TrustLayerError::SnapshotCorrupted("journal receipt evaluation mismatch while replaying")
    );
}

#[test]
fn snapshot_rejects_policy_version_drift() {
    let mut layer = TrustLayer::new(default_policy()).expect("policy should be valid");

    layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-001",
                1,
                1_700_000_000,
                EvidenceKind::ManualCredit,
                20,
                10_000,
            ),
        )
        .expect("event should apply");

    let mut snapshot = layer.snapshot();
    let entry = &mut snapshot.journal[0];
    entry.receipt.policy_version = 2;
    entry.receipt.decision_id = decision_id_hash(
        entry.receipt.policy_version,
        entry.receipt.sequence,
        entry.receipt.event_hash,
        entry.receipt.state_hash,
    );

    let err = TrustLayer::from_snapshot(snapshot).expect_err("policy version drift must fail");
    assert_eq!(
        err,
        TrustLayerError::SnapshotCorrupted(
            "journal receipt policy_version must equal snapshot policy_version"
        )
    );
}

#[test]
fn policy_version_updates_are_strict() {
    let mut layer = TrustLayer::new(default_policy()).expect("policy should be valid");

    let err = layer
        .set_policy_with_version(default_policy(), 3)
        .expect_err("jump version must fail");

    assert_eq!(
        err,
        TrustLayerError::InvalidPolicyVersion {
            current: 1,
            next: 3,
        }
    );

    layer
        .set_policy(default_policy())
        .expect("regular update should increment by one");
    assert_eq!(layer.policy_version(), 2);

    let receipt = layer
        .apply_event(
            "agent-alpha",
            event(
                "evt-003",
                1,
                1_700_000_020,
                EvidenceKind::ManualCredit,
                20,
                10_000,
            ),
        )
        .expect("event should apply");

    assert_eq!(receipt.policy_version, 2);
}

#[test]
fn audit_records_include_context_fields() {
    let mut layer = TrustLayer::new(default_policy()).expect("policy should be valid");

    let contextual_event = event(
        "evt-ctx",
        1,
        1_700_000_000,
        EvidenceKind::ManualCredit,
        20,
        10_000,
    )
    .with_context(EventContext {
        request_id: Some("req-123".to_string()),
        trace_id: Some("trace-abc".to_string()),
        span_id: Some("span-xyz".to_string()),
        provider: Some(TrustProvider::OpenClaw),
    });

    layer
        .apply_event("agent-alpha", contextual_event)
        .expect("event should apply");

    let audit = layer.audit_log_records();
    assert_eq!(audit.len(), 1);
    assert_eq!(audit[0].request_id.as_deref(), Some("req-123"));
    assert_eq!(audit[0].trace_id.as_deref(), Some("trace-abc"));
    assert_eq!(audit[0].span_id.as_deref(), Some("span-xyz"));
    assert_eq!(audit[0].provider, Some(TrustProvider::OpenClaw));
}

#[test]
fn provider_context_changes_event_hash() {
    let mut without_provider = TrustLayer::new(default_policy()).expect("policy should be valid");
    let mut with_provider = TrustLayer::new(default_policy()).expect("policy should be valid");

    let base = event(
        "evt-provider-hash",
        1,
        1_700_000_000,
        EvidenceKind::ManualCredit,
        20,
        10_000,
    );

    let no_provider_receipt = without_provider
        .apply_event("agent-alpha", base.clone())
        .expect("event without provider should apply");

    let provider_receipt = with_provider
        .apply_event(
            "agent-alpha",
            base.with_context(EventContext {
                provider: Some(TrustProvider::NanoClaw),
                ..EventContext::default()
            }),
        )
        .expect("event with provider should apply");

    assert_ne!(no_provider_receipt.event_hash, provider_receipt.event_hash);
}

#[test]
fn decision_id_hash_is_deterministic() {
    let left = decision_id_hash(2, 17, 12345, 67890);
    let right = decision_id_hash(2, 17, 12345, 67890);
    assert_eq!(left, right);
}
