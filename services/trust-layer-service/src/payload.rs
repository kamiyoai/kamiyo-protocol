use kamiyo_trust_layer::{TrustEvent, TrustReceipt};
use serde::Serialize;

pub fn serialize_outbox_payload(
    offset: i64,
    subject: &str,
    event: &TrustEvent,
    receipt: &TrustReceipt,
) -> Result<String, serde_json::Error> {
    #[derive(Serialize)]
    struct OutboxPayload<'a> {
        offset: i64,
        subject: &'a str,
        event_id: &'a str,
        sequence: u64,
        observed_at: i64,
        kind: i16,
        weight: u16,
        stake_delta: i64,
        request_id: Option<&'a str>,
        trace_id: Option<&'a str>,
        span_id: Option<&'a str>,
        receipt: OutboxReceipt<'a>,
    }

    #[derive(Serialize)]
    struct OutboxReceipt<'a> {
        event_id: &'a str,
        sequence: u64,
        decision_id: String,
        policy_version: u64,
        decision: i16,
        reasons: Vec<i16>,
        score: u16,
        stake: u64,
        failure_bps: u16,
        inactive_secs: u64,
        event_hash: String,
        state_hash: String,
        prev_hash: String,
        issued_at: i64,
    }

    let payload = OutboxPayload {
        offset,
        subject,
        event_id: &event.event_id,
        sequence: event.sequence,
        observed_at: event.observed_at,
        kind: event.kind as i16,
        weight: event.weight,
        stake_delta: event.stake_delta,
        request_id: event.context.request_id.as_deref(),
        trace_id: event.context.trace_id.as_deref(),
        span_id: event.context.span_id.as_deref(),
        receipt: OutboxReceipt {
            event_id: &receipt.event_id,
            sequence: receipt.sequence,
            decision_id: receipt.decision_id.to_string(),
            policy_version: receipt.policy_version,
            decision: receipt.evaluation.decision as i16,
            reasons: receipt
                .evaluation
                .reasons
                .iter()
                .map(|reason| *reason as i16)
                .collect(),
            score: receipt.evaluation.score,
            stake: receipt.evaluation.stake,
            failure_bps: receipt.evaluation.failure_bps,
            inactive_secs: receipt.evaluation.inactive_secs,
            event_hash: receipt.event_hash.to_string(),
            state_hash: receipt.state_hash.to_string(),
            prev_hash: receipt.prev_hash.to_string(),
            issued_at: receipt.issued_at,
        },
    };

    serde_json::to_string(&payload)
}
