use anyhow::{bail, Context, Result};
use kamiyo_trust_layer::{TrustLayer, TrustLayerSnapshot, TrustReceipt};
use sqlx::PgPool;
use tracing::{error, info};

use crate::{
    db::{self, StoredEvent},
    payload,
};

#[derive(Debug, Clone)]
pub struct ReplayConfig {
    pub subject: Option<String>,
    pub from_offset: i64,
    pub limit: i64,
    pub batch_size: i64,
    pub rewrite_subject_state: bool,
    pub enqueue_outbox: bool,
    pub kafka_topic: String,
}

pub async fn run(pool: &PgPool, config: ReplayConfig) -> Result<()> {
    let policy_state = db::load_policy(pool).await?;
    let mut layer = TrustLayer::from_snapshot(TrustLayerSnapshot {
        policy: policy_state.policy,
        policy_version: policy_state.version,
        subjects: Vec::new(),
        journal: Vec::new(),
    })?;

    let mut mismatches = 0usize;
    let mut total = 0usize;
    let mut next_offset = config.from_offset.max(1);
    let mut remaining = config.limit.max(1);
    let batch_size = config.batch_size.max(1);

    while remaining > 0 {
        let fetch_limit = remaining.min(batch_size);
        let batch =
            db::fetch_replay_events(pool, config.subject.as_deref(), next_offset, fetch_limit)
                .await?;
        if batch.is_empty() {
            break;
        }

        for stored in &batch {
            total += 1;
            remaining -= 1;
            next_offset = stored.offset.saturating_add(1);

            let valid = match replay_one(&mut layer, stored) {
                Ok(()) => true,
                Err(err) => {
                    mismatches += 1;
                    error!(offset = stored.offset, event_id = %stored.event.event_id, error = %err, "replay mismatch");
                    false
                }
            };

            if valid && config.enqueue_outbox {
                let payload = payload::serialize_outbox_payload(
                    stored.offset,
                    &stored.subject,
                    &stored.event,
                    &stored.receipt,
                )
                .context("failed to serialize replay outbox payload")?;
                db::enqueue_outbox_if_missing(
                    pool,
                    &stored.event.event_id,
                    &config.kafka_topic,
                    &stored.subject,
                    &payload,
                )
                .await?;
            }
        }
    }

    if total == 0 {
        info!("replay found no events");
        return Ok(());
    }

    if config.rewrite_subject_state {
        rewrite_subject_state(pool, &layer).await?;
    }

    info!(
        total,
        mismatches,
        rewrite_subject_state = config.rewrite_subject_state,
        "replay finished"
    );

    if mismatches > 0 {
        bail!("replay detected {mismatches} mismatched events");
    }

    Ok(())
}

fn replay_one(layer: &mut TrustLayer, stored: &StoredEvent) -> Result<()> {
    let produced = layer
        .apply_event(stored.subject.clone(), stored.event.clone())
        .with_context(|| format!("failed to apply event {}", stored.event.event_id))?;

    if !receipts_match(&produced, &stored.receipt) {
        bail!(
            "receipt mismatch for event {} at offset {}",
            stored.event.event_id,
            stored.offset
        );
    }

    Ok(())
}

fn receipts_match(left: &TrustReceipt, right: &TrustReceipt) -> bool {
    left.subject == right.subject
        && left.event_id == right.event_id
        && left.sequence == right.sequence
        && left.prev_hash == right.prev_hash
        && left.event_hash == right.event_hash
        && left.state_hash == right.state_hash
        && left.policy_version == right.policy_version
        && left.decision_id == right.decision_id
        && left.issued_at == right.issued_at
        && left.evaluation == right.evaluation
}

async fn rewrite_subject_state(pool: &PgPool, layer: &TrustLayer) -> Result<()> {
    let snapshot = layer.snapshot();

    let mut tx = pool.begin().await?;

    for (subject, state) in snapshot.subjects {
        if state.last_sequence == 0 && state.chain_hash == 0 {
            continue;
        }

        db::upsert_subject_state_tx(&mut tx, &subject, &state).await?;
    }

    tx.commit().await?;

    Ok(())
}
