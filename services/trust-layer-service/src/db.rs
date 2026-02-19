use anyhow::{anyhow, bail, Context, Result};
use kamiyo_trust_layer::{
    DecisionReason, EventContext, SubjectState, TrustEvaluation, TrustEvent, TrustPolicy,
    TrustReceipt,
};
use sqlx::{PgPool, Postgres, QueryBuilder, Row, Transaction};

use crate::model::{
    decision_from_code, decision_to_code, evidence_kind_from_code, evidence_kind_to_code,
    reason_from_code, reason_to_code,
};

#[derive(Debug, Clone)]
pub struct PolicyState {
    pub policy: TrustPolicy,
    pub version: u64,
}

#[derive(Debug, Clone)]
pub struct StoredEvent {
    pub offset: i64,
    pub subject: String,
    pub event: TrustEvent,
    pub receipt: TrustReceipt,
}

pub async fn ensure_schema(pool: &PgPool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS trust_policy_state (
            id SMALLINT PRIMARY KEY CHECK (id = 1),
            version BIGINT NOT NULL,
            allow_score_floor INTEGER NOT NULL,
            review_score_floor INTEGER NOT NULL,
            allow_min_stake BIGINT NOT NULL,
            review_min_stake BIGINT NOT NULL,
            allow_max_failure_bps INTEGER NOT NULL,
            review_max_failure_bps INTEGER NOT NULL,
            allow_max_inactive_secs BIGINT NOT NULL,
            review_max_inactive_secs BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS trust_subject_state (
            subject TEXT PRIMARY KEY,
            score INTEGER NOT NULL,
            stake BIGINT NOT NULL,
            success_count BIGINT NOT NULL,
            failure_count BIGINT NOT NULL,
            last_sequence BIGINT NOT NULL,
            last_event_at BIGINT NOT NULL,
            chain_hash TEXT NOT NULL,
            updated_at BIGINT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS trust_events (
            id BIGSERIAL PRIMARY KEY,
            event_id TEXT NOT NULL UNIQUE,
            subject TEXT NOT NULL,
            sequence BIGINT NOT NULL,
            observed_at BIGINT NOT NULL,
            kind SMALLINT NOT NULL,
            weight INTEGER NOT NULL,
            stake_delta BIGINT NOT NULL,
            request_id TEXT,
            trace_id TEXT,
            span_id TEXT,
            receipt_policy_version BIGINT NOT NULL,
            receipt_decision_id TEXT NOT NULL,
            receipt_prev_hash TEXT NOT NULL,
            receipt_event_hash TEXT NOT NULL,
            receipt_state_hash TEXT NOT NULL,
            receipt_decision SMALLINT NOT NULL,
            receipt_reasons SMALLINT[] NOT NULL,
            receipt_score INTEGER NOT NULL,
            receipt_stake BIGINT NOT NULL,
            receipt_failure_bps INTEGER NOT NULL,
            receipt_inactive_secs BIGINT NOT NULL,
            receipt_issued_at BIGINT NOT NULL,
            created_at BIGINT NOT NULL,
            UNIQUE(subject, sequence)
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_trust_events_subject_offset
            ON trust_events (subject, id)
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS trust_outbox (
            id BIGSERIAL PRIMARY KEY,
            event_id TEXT NOT NULL UNIQUE,
            topic TEXT NOT NULL,
            event_key TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'published')),
            attempt_count INTEGER NOT NULL,
            next_attempt_at BIGINT NOT NULL,
            last_error TEXT,
            created_at BIGINT NOT NULL,
            published_at BIGINT,
            updated_at BIGINT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_trust_outbox_pending
            ON trust_outbox (status, next_attempt_at, id)
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS trust_outbox_dead_letter (
            id BIGSERIAL PRIMARY KEY,
            event_id TEXT NOT NULL UNIQUE,
            topic TEXT NOT NULL,
            event_key TEXT NOT NULL,
            payload TEXT NOT NULL,
            attempt_count INTEGER NOT NULL,
            last_error TEXT NOT NULL,
            first_seen_at BIGINT NOT NULL,
            dead_lettered_at BIGINT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_trust_outbox_dead_lettered_at
            ON trust_outbox_dead_letter (dead_lettered_at)
        "#,
    )
    .execute(pool)
    .await?;

    ensure_length_constraints(pool).await?;
    ensure_policy_row(pool).await
}

pub async fn ensure_policy_row(pool: &PgPool) -> Result<()> {
    let policy = TrustPolicy::default();
    let now = now_epoch_secs();

    sqlx::query(
        r#"
        INSERT INTO trust_policy_state (
            id,
            version,
            allow_score_floor,
            review_score_floor,
            allow_min_stake,
            review_min_stake,
            allow_max_failure_bps,
            review_max_failure_bps,
            allow_max_inactive_secs,
            review_max_inactive_secs,
            updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO NOTHING
        "#,
    )
    .bind(1i16)
    .bind(to_i64(policy_version_initial())?)
    .bind(i32::from(policy.allow_score_floor))
    .bind(i32::from(policy.review_score_floor))
    .bind(to_i64(policy.allow_min_stake)?)
    .bind(to_i64(policy.review_min_stake)?)
    .bind(i32::from(policy.allow_max_failure_bps))
    .bind(i32::from(policy.review_max_failure_bps))
    .bind(to_i64(policy.allow_max_inactive_secs)?)
    .bind(to_i64(policy.review_max_inactive_secs)?)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn load_policy_tx(tx: &mut Transaction<'_, Postgres>) -> Result<PolicyState> {
    let row = sqlx::query(
        r#"
        SELECT
            version,
            allow_score_floor,
            review_score_floor,
            allow_min_stake,
            review_min_stake,
            allow_max_failure_bps,
            review_max_failure_bps,
            allow_max_inactive_secs,
            review_max_inactive_secs
        FROM trust_policy_state
        WHERE id = 1
        "#,
    )
    .fetch_one(&mut **tx)
    .await?;

    decode_policy_row(&row)
}

pub async fn load_policy(pool: &PgPool) -> Result<PolicyState> {
    let row = sqlx::query(
        r#"
        SELECT
            version,
            allow_score_floor,
            review_score_floor,
            allow_min_stake,
            review_min_stake,
            allow_max_failure_bps,
            review_max_failure_bps,
            allow_max_inactive_secs,
            review_max_inactive_secs
        FROM trust_policy_state
        WHERE id = 1
        "#,
    )
    .fetch_one(pool)
    .await?;

    decode_policy_row(&row)
}

pub async fn load_existing_event_for_update(
    tx: &mut Transaction<'_, Postgres>,
    event_id: &str,
) -> Result<Option<StoredEvent>> {
    let row = sqlx::query(
        r#"
        SELECT
            id,
            event_id,
            subject,
            sequence,
            observed_at,
            kind,
            weight,
            stake_delta,
            request_id,
            trace_id,
            span_id,
            receipt_policy_version,
            receipt_decision_id,
            receipt_prev_hash,
            receipt_event_hash,
            receipt_state_hash,
            receipt_decision,
            receipt_reasons,
            receipt_score,
            receipt_stake,
            receipt_failure_bps,
            receipt_inactive_secs,
            receipt_issued_at
        FROM trust_events
        WHERE event_id = $1
        FOR UPDATE
        "#,
    )
    .bind(event_id)
    .fetch_optional(&mut **tx)
    .await?;

    row.map(|r| decode_event_row(&r)).transpose()
}

pub async fn load_existing_event(pool: &PgPool, event_id: &str) -> Result<Option<StoredEvent>> {
    let row = sqlx::query(
        r#"
        SELECT
            id,
            event_id,
            subject,
            sequence,
            observed_at,
            kind,
            weight,
            stake_delta,
            request_id,
            trace_id,
            span_id,
            receipt_policy_version,
            receipt_decision_id,
            receipt_prev_hash,
            receipt_event_hash,
            receipt_state_hash,
            receipt_decision,
            receipt_reasons,
            receipt_score,
            receipt_stake,
            receipt_failure_bps,
            receipt_inactive_secs,
            receipt_issued_at
        FROM trust_events
        WHERE event_id = $1
        "#,
    )
    .bind(event_id)
    .fetch_optional(pool)
    .await?;

    row.map(|r| decode_event_row(&r)).transpose()
}

pub async fn load_subject_state_for_update(
    tx: &mut Transaction<'_, Postgres>,
    subject: &str,
) -> Result<Option<SubjectState>> {
    let row = sqlx::query(
        r#"
        SELECT
            score,
            stake,
            success_count,
            failure_count,
            last_sequence,
            last_event_at,
            chain_hash
        FROM trust_subject_state
        WHERE subject = $1
        FOR UPDATE
        "#,
    )
    .bind(subject)
    .fetch_optional(&mut **tx)
    .await?;

    row.map(|r| decode_subject_row(&r)).transpose()
}

pub async fn load_subject_state(pool: &PgPool, subject: &str) -> Result<Option<SubjectState>> {
    let row = sqlx::query(
        r#"
        SELECT
            score,
            stake,
            success_count,
            failure_count,
            last_sequence,
            last_event_at,
            chain_hash
        FROM trust_subject_state
        WHERE subject = $1
        "#,
    )
    .bind(subject)
    .fetch_optional(pool)
    .await?;

    row.map(|r| decode_subject_row(&r)).transpose()
}

pub async fn upsert_subject_state_tx(
    tx: &mut Transaction<'_, Postgres>,
    subject: &str,
    state: &SubjectState,
) -> Result<()> {
    let now = now_epoch_secs();

    sqlx::query(
        r#"
        INSERT INTO trust_subject_state (
            subject,
            score,
            stake,
            success_count,
            failure_count,
            last_sequence,
            last_event_at,
            chain_hash,
            updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (subject) DO UPDATE
        SET
            score = EXCLUDED.score,
            stake = EXCLUDED.stake,
            success_count = EXCLUDED.success_count,
            failure_count = EXCLUDED.failure_count,
            last_sequence = EXCLUDED.last_sequence,
            last_event_at = EXCLUDED.last_event_at,
            chain_hash = EXCLUDED.chain_hash,
            updated_at = EXCLUDED.updated_at
        "#,
    )
    .bind(subject)
    .bind(i32::from(state.score))
    .bind(to_i64(state.stake)?)
    .bind(to_i64(state.success_count)?)
    .bind(to_i64(state.failure_count)?)
    .bind(to_i64(state.last_sequence)?)
    .bind(state.last_event_at)
    .bind(state.chain_hash.to_string())
    .bind(now)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn insert_event_tx(
    tx: &mut Transaction<'_, Postgres>,
    subject: &str,
    event: &TrustEvent,
    receipt: &TrustReceipt,
) -> Result<i64> {
    let reasons: Vec<i16> = receipt
        .evaluation
        .reasons
        .iter()
        .copied()
        .map(reason_to_code)
        .collect();

    let row = sqlx::query(
        r#"
        INSERT INTO trust_events (
            event_id,
            subject,
            sequence,
            observed_at,
            kind,
            weight,
            stake_delta,
            request_id,
            trace_id,
            span_id,
            receipt_policy_version,
            receipt_decision_id,
            receipt_prev_hash,
            receipt_event_hash,
            receipt_state_hash,
            receipt_decision,
            receipt_reasons,
            receipt_score,
            receipt_stake,
            receipt_failure_bps,
            receipt_inactive_secs,
            receipt_issued_at,
            created_at
        )
        VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
        )
        RETURNING id
        "#,
    )
    .bind(&event.event_id)
    .bind(subject)
    .bind(to_i64(event.sequence)?)
    .bind(event.observed_at)
    .bind(evidence_kind_to_code(event.kind))
    .bind(i32::from(event.weight))
    .bind(event.stake_delta)
    .bind(event.context.request_id.as_deref())
    .bind(event.context.trace_id.as_deref())
    .bind(event.context.span_id.as_deref())
    .bind(to_i64(receipt.policy_version)?)
    .bind(receipt.decision_id.to_string())
    .bind(receipt.prev_hash.to_string())
    .bind(receipt.event_hash.to_string())
    .bind(receipt.state_hash.to_string())
    .bind(decision_to_code(receipt.evaluation.decision))
    .bind(&reasons)
    .bind(i32::from(receipt.evaluation.score))
    .bind(to_i64(receipt.evaluation.stake)?)
    .bind(i32::from(receipt.evaluation.failure_bps))
    .bind(to_i64(receipt.evaluation.inactive_secs)?)
    .bind(receipt.issued_at)
    .bind(now_epoch_secs())
    .fetch_one(&mut **tx)
    .await?;

    row.try_get("id").context("missing inserted event id")
}

pub async fn insert_outbox_tx(
    tx: &mut Transaction<'_, Postgres>,
    event_id: &str,
    topic: &str,
    event_key: &str,
    payload: &str,
) -> Result<()> {
    let now = now_epoch_secs();

    sqlx::query(
        r#"
        INSERT INTO trust_outbox (
            event_id,
            topic,
            event_key,
            payload,
            status,
            attempt_count,
            next_attempt_at,
            created_at,
            updated_at
        )
        VALUES ($1,$2,$3,$4,'pending',0,$5,$6,$7)
        "#,
    )
    .bind(event_id)
    .bind(topic)
    .bind(event_key)
    .bind(payload)
    .bind(now)
    .bind(now)
    .bind(now)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

#[derive(Debug, Clone)]
pub struct OutboxMessage {
    pub id: i64,
    pub event_id: String,
    pub topic: String,
    pub event_key: String,
    pub payload: String,
    pub attempt_count: i32,
}

#[derive(Debug, Clone, Copy)]
pub struct OutboxCounts {
    pub pending: i64,
    pub processing: i64,
    pub published: i64,
    pub dead_letter: i64,
}

#[derive(Debug, Clone, Copy)]
pub struct DeadLetterRedriveStats {
    pub selected: i64,
    pub redriven: i64,
    pub skipped_existing: i64,
}

#[derive(Debug, Clone, Copy)]
pub struct DeadLetterSweepStats {
    pub selected: i64,
    pub deleted: i64,
}

pub async fn claim_outbox_batch(
    pool: &PgPool,
    batch_size: i64,
    stuck_timeout_secs: i64,
) -> Result<Vec<OutboxMessage>> {
    let now = now_epoch_secs();
    let stuck_before = now.saturating_sub(stuck_timeout_secs.max(1));

    let rows = sqlx::query(
        r#"
        WITH claimed AS (
            SELECT id
            FROM trust_outbox
            WHERE
                (status = 'pending' AND next_attempt_at <= $1)
                OR (status = 'processing' AND updated_at <= $3)
            ORDER BY id ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
        )
        UPDATE trust_outbox o
        SET
            status = 'processing',
            attempt_count = o.attempt_count + 1,
            updated_at = $1
        FROM claimed c
        WHERE o.id = c.id
        RETURNING o.id, o.event_id, o.topic, o.event_key, o.payload, o.attempt_count
        "#,
    )
    .bind(now)
    .bind(batch_size)
    .bind(stuck_before)
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
            Ok(OutboxMessage {
                id: row.try_get("id")?,
                event_id: row.try_get("event_id")?,
                topic: row.try_get("topic")?,
                event_key: row.try_get("event_key")?,
                payload: row.try_get("payload")?,
                attempt_count: row.try_get("attempt_count")?,
            })
        })
        .collect()
}

pub async fn enqueue_outbox_if_missing(
    pool: &PgPool,
    event_id: &str,
    topic: &str,
    event_key: &str,
    payload: &str,
) -> Result<()> {
    let now = now_epoch_secs();
    sqlx::query(
        r#"
        INSERT INTO trust_outbox (
            event_id,
            topic,
            event_key,
            payload,
            status,
            attempt_count,
            next_attempt_at,
            created_at,
            updated_at
        )
        VALUES ($1,$2,$3,$4,'pending',0,$5,$6,$7)
        ON CONFLICT (event_id) DO NOTHING
        "#,
    )
    .bind(event_id)
    .bind(topic)
    .bind(event_key)
    .bind(payload)
    .bind(now)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn mark_outbox_published(pool: &PgPool, id: i64) -> Result<()> {
    let now = now_epoch_secs();

    sqlx::query(
        r#"
        UPDATE trust_outbox
        SET
            status = 'published',
            published_at = $2,
            updated_at = $2,
            last_error = NULL
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn release_outbox_for_retry(
    pool: &PgPool,
    id: i64,
    attempt_count: i32,
    error: &str,
) -> Result<()> {
    let now = now_epoch_secs();
    let capped = attempt_count.clamp(1, 8);
    let retry_delay = 1_i64 << capped;
    let next_attempt = now.saturating_add(retry_delay);

    sqlx::query(
        r#"
        UPDATE trust_outbox
        SET
            status = 'pending',
            next_attempt_at = $2,
            updated_at = $3,
            last_error = $4
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(next_attempt)
    .bind(now)
    .bind(error)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn move_outbox_to_dead_letter(
    pool: &PgPool,
    message: &OutboxMessage,
    error: &str,
) -> Result<()> {
    let now = now_epoch_secs();

    sqlx::query(
        r#"
        WITH moved AS (
            DELETE FROM trust_outbox
            WHERE id = $1
            RETURNING event_id, topic, event_key, payload, attempt_count, created_at
        )
        INSERT INTO trust_outbox_dead_letter (
            event_id,
            topic,
            event_key,
            payload,
            attempt_count,
            last_error,
            first_seen_at,
            dead_lettered_at
        )
        SELECT
            moved.event_id,
            moved.topic,
            moved.event_key,
            moved.payload,
            moved.attempt_count,
            $2,
            moved.created_at,
            $3
        FROM moved
        ON CONFLICT (event_id) DO UPDATE
        SET
            attempt_count = GREATEST(
                trust_outbox_dead_letter.attempt_count,
                EXCLUDED.attempt_count
            ),
            last_error = EXCLUDED.last_error,
            dead_lettered_at = EXCLUDED.dead_lettered_at
        "#,
    )
    .bind(message.id)
    .bind(error)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn redrive_dead_letters(
    pool: &PgPool,
    limit: i64,
    event_id: Option<&str>,
    dry_run: bool,
) -> Result<DeadLetterRedriveStats> {
    let safe_limit = limit.clamp(1, 100_000);
    let mut tx = pool.begin().await?;

    let selected: i64 = sqlx::query_scalar(
        r#"
        WITH candidates AS (
            SELECT event_id
            FROM trust_outbox_dead_letter
            WHERE ($1::text IS NULL OR event_id = $1)
            ORDER BY dead_lettered_at ASC, id ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
        )
        SELECT COUNT(*)::bigint FROM candidates
        "#,
    )
    .bind(event_id)
    .bind(safe_limit)
    .fetch_one(&mut *tx)
    .await?;

    if dry_run || selected == 0 {
        tx.commit().await?;
        return Ok(DeadLetterRedriveStats {
            selected,
            redriven: 0,
            skipped_existing: 0,
        });
    }

    let row = sqlx::query(
        r#"
        WITH candidates AS (
            SELECT id, event_id, topic, event_key, payload
            FROM trust_outbox_dead_letter
            WHERE ($1::text IS NULL OR event_id = $1)
            ORDER BY dead_lettered_at ASC, id ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
        ),
        inserted AS (
            INSERT INTO trust_outbox (
                event_id,
                topic,
                event_key,
                payload,
                status,
                attempt_count,
                next_attempt_at,
                last_error,
                created_at,
                published_at,
                updated_at
            )
            SELECT
                c.event_id,
                c.topic,
                c.event_key,
                c.payload,
                'pending',
                0,
                $3,
                NULL,
                $3,
                NULL,
                $3
            FROM candidates c
            ON CONFLICT (event_id) DO NOTHING
            RETURNING event_id
        ),
        removed AS (
            DELETE FROM trust_outbox_dead_letter d
            USING inserted i
            WHERE d.event_id = i.event_id
            RETURNING d.event_id
        )
        SELECT
            (SELECT COUNT(*)::bigint FROM inserted) AS redriven,
            (SELECT COUNT(*)::bigint FROM removed) AS removed
        "#,
    )
    .bind(event_id)
    .bind(safe_limit)
    .bind(now_epoch_secs())
    .fetch_one(&mut *tx)
    .await?;

    let redriven: i64 = row.try_get("redriven")?;
    let removed: i64 = row.try_get("removed")?;
    if redriven != removed {
        bail!("dead-letter redrive inconsistency: inserted != removed");
    }

    tx.commit().await?;

    Ok(DeadLetterRedriveStats {
        selected,
        redriven,
        skipped_existing: selected.saturating_sub(redriven),
    })
}

pub async fn sweep_dead_letters(
    pool: &PgPool,
    retention_secs: i64,
    limit: i64,
    dry_run: bool,
) -> Result<DeadLetterSweepStats> {
    let safe_limit = limit.clamp(1, 100_000);
    let cutoff = now_epoch_secs().saturating_sub(retention_secs.max(1));

    let mut tx = pool.begin().await?;

    let selected: i64 = sqlx::query_scalar(
        r#"
        WITH candidates AS (
            SELECT id
            FROM trust_outbox_dead_letter
            WHERE dead_lettered_at < $1
            ORDER BY dead_lettered_at ASC, id ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
        )
        SELECT COUNT(*)::bigint FROM candidates
        "#,
    )
    .bind(cutoff)
    .bind(safe_limit)
    .fetch_one(&mut *tx)
    .await?;

    if dry_run || selected == 0 {
        tx.commit().await?;
        return Ok(DeadLetterSweepStats {
            selected,
            deleted: 0,
        });
    }

    let deleted: i64 = sqlx::query_scalar(
        r#"
        WITH candidates AS (
            SELECT id
            FROM trust_outbox_dead_letter
            WHERE dead_lettered_at < $1
            ORDER BY dead_lettered_at ASC, id ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
        ),
        deleted AS (
            DELETE FROM trust_outbox_dead_letter d
            USING candidates c
            WHERE d.id = c.id
            RETURNING d.id
        )
        SELECT COUNT(*)::bigint FROM deleted
        "#,
    )
    .bind(cutoff)
    .bind(safe_limit)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(DeadLetterSweepStats { selected, deleted })
}

pub async fn load_outbox_counts(pool: &PgPool) -> Result<OutboxCounts> {
    let row = sqlx::query(
        r#"
        SELECT
            COUNT(*) FILTER (WHERE status = 'pending') AS pending,
            COUNT(*) FILTER (WHERE status = 'processing') AS processing,
            COUNT(*) FILTER (WHERE status = 'published') AS published,
            (SELECT COUNT(*) FROM trust_outbox_dead_letter) AS dead_letter
        FROM trust_outbox
        "#,
    )
    .fetch_one(pool)
    .await?;

    Ok(OutboxCounts {
        pending: row.try_get("pending")?,
        processing: row.try_get("processing")?,
        published: row.try_get("published")?,
        dead_letter: row.try_get("dead_letter")?,
    })
}

pub async fn fetch_replay_events(
    pool: &PgPool,
    subject: Option<&str>,
    from_offset: i64,
    limit: i64,
) -> Result<Vec<StoredEvent>> {
    let mut builder = QueryBuilder::<Postgres>::new(
        r#"
        SELECT
            id,
            event_id,
            subject,
            sequence,
            observed_at,
            kind,
            weight,
            stake_delta,
            request_id,
            trace_id,
            span_id,
            receipt_policy_version,
            receipt_decision_id,
            receipt_prev_hash,
            receipt_event_hash,
            receipt_state_hash,
            receipt_decision,
            receipt_reasons,
            receipt_score,
            receipt_stake,
            receipt_failure_bps,
            receipt_inactive_secs,
            receipt_issued_at
        FROM trust_events
        WHERE id >=
        "#,
    );
    builder.push_bind(from_offset);

    if let Some(subject_value) = subject {
        builder.push(" AND subject = ");
        builder.push_bind(subject_value);
    }

    builder.push(" ORDER BY id ASC LIMIT ");
    builder.push_bind(limit);

    let rows = builder.build().fetch_all(pool).await?;

    rows.into_iter().map(|row| decode_event_row(&row)).collect()
}

fn decode_policy_row(row: &sqlx::postgres::PgRow) -> Result<PolicyState> {
    let version = from_i64_u64(row.try_get::<i64, _>("version")?, "policy.version")?;

    let policy = TrustPolicy {
        allow_score_floor: from_i32_u16(
            row.try_get::<i32, _>("allow_score_floor")?,
            "policy.allow_score_floor",
        )?,
        review_score_floor: from_i32_u16(
            row.try_get::<i32, _>("review_score_floor")?,
            "policy.review_score_floor",
        )?,
        allow_min_stake: from_i64_u64(
            row.try_get::<i64, _>("allow_min_stake")?,
            "policy.allow_min_stake",
        )?,
        review_min_stake: from_i64_u64(
            row.try_get::<i64, _>("review_min_stake")?,
            "policy.review_min_stake",
        )?,
        allow_max_failure_bps: from_i32_u16(
            row.try_get::<i32, _>("allow_max_failure_bps")?,
            "policy.allow_max_failure_bps",
        )?,
        review_max_failure_bps: from_i32_u16(
            row.try_get::<i32, _>("review_max_failure_bps")?,
            "policy.review_max_failure_bps",
        )?,
        allow_max_inactive_secs: from_i64_u64(
            row.try_get::<i64, _>("allow_max_inactive_secs")?,
            "policy.allow_max_inactive_secs",
        )?,
        review_max_inactive_secs: from_i64_u64(
            row.try_get::<i64, _>("review_max_inactive_secs")?,
            "policy.review_max_inactive_secs",
        )?,
    };

    policy.validate()?;

    Ok(PolicyState { policy, version })
}

fn decode_subject_row(row: &sqlx::postgres::PgRow) -> Result<SubjectState> {
    Ok(SubjectState {
        score: from_i32_u16(row.try_get::<i32, _>("score")?, "state.score")?,
        stake: from_i64_u64(row.try_get::<i64, _>("stake")?, "state.stake")?,
        success_count: from_i64_u64(
            row.try_get::<i64, _>("success_count")?,
            "state.success_count",
        )?,
        failure_count: from_i64_u64(
            row.try_get::<i64, _>("failure_count")?,
            "state.failure_count",
        )?,
        last_sequence: from_i64_u64(
            row.try_get::<i64, _>("last_sequence")?,
            "state.last_sequence",
        )?,
        last_event_at: row.try_get("last_event_at")?,
        chain_hash: row
            .try_get::<String, _>("chain_hash")?
            .parse::<u64>()
            .context("invalid chain_hash in subject state")?,
    })
}

fn decode_event_row(row: &sqlx::postgres::PgRow) -> Result<StoredEvent> {
    let kind_code: i16 = row.try_get("kind")?;
    let kind = evidence_kind_from_code(kind_code)
        .ok_or_else(|| anyhow!("unknown evidence kind code: {kind_code}"))?;

    let decision_code: i16 = row.try_get("receipt_decision")?;
    let decision = decision_from_code(decision_code)
        .ok_or_else(|| anyhow!("unknown decision code: {decision_code}"))?;

    let reason_codes: Vec<i16> = row.try_get("receipt_reasons")?;
    let reasons: Vec<DecisionReason> = reason_codes
        .into_iter()
        .map(|code| reason_from_code(code).ok_or_else(|| anyhow!("unknown reason code: {code}")))
        .collect::<Result<Vec<_>>>()?;

    let event = TrustEvent::new(
        row.try_get::<String, _>("event_id")?,
        from_i64_u64(row.try_get::<i64, _>("sequence")?, "event.sequence")?,
        row.try_get("observed_at")?,
        kind,
        from_i32_u16(row.try_get::<i32, _>("weight")?, "event.weight")?,
        row.try_get("stake_delta")?,
    )
    .with_context(EventContext {
        request_id: row.try_get("request_id")?,
        trace_id: row.try_get("trace_id")?,
        span_id: row.try_get("span_id")?,
    });

    let subject = row.try_get::<String, _>("subject")?;

    let receipt = TrustReceipt {
        subject: subject.clone(),
        event_id: event.event_id.clone(),
        sequence: event.sequence,
        prev_hash: parse_u64_str(row.try_get("receipt_prev_hash")?, "receipt_prev_hash")?,
        event_hash: parse_u64_str(row.try_get("receipt_event_hash")?, "receipt_event_hash")?,
        state_hash: parse_u64_str(row.try_get("receipt_state_hash")?, "receipt_state_hash")?,
        policy_version: from_i64_u64(
            row.try_get::<i64, _>("receipt_policy_version")?,
            "receipt_policy_version",
        )?,
        decision_id: parse_u64_str(row.try_get("receipt_decision_id")?, "receipt_decision_id")?,
        evaluation: TrustEvaluation {
            decision,
            reasons,
            score: from_i32_u16(row.try_get::<i32, _>("receipt_score")?, "receipt_score")?,
            stake: from_i64_u64(row.try_get::<i64, _>("receipt_stake")?, "receipt_stake")?,
            failure_bps: from_i32_u16(
                row.try_get::<i32, _>("receipt_failure_bps")?,
                "receipt_failure_bps",
            )?,
            inactive_secs: from_i64_u64(
                row.try_get::<i64, _>("receipt_inactive_secs")?,
                "receipt_inactive_secs",
            )?,
        },
        issued_at: row.try_get("receipt_issued_at")?,
    };

    Ok(StoredEvent {
        offset: row.try_get("id")?,
        subject,
        event,
        receipt,
    })
}

async fn ensure_length_constraints(pool: &PgPool) -> Result<()> {
    ensure_check_constraint(
        pool,
        "trust_events",
        "trust_events_event_id_length_ck",
        "length(event_id) BETWEEN 1 AND 128",
    )
    .await?;
    ensure_check_constraint(
        pool,
        "trust_events",
        "trust_events_subject_length_ck",
        "length(subject) BETWEEN 1 AND 256",
    )
    .await?;
    ensure_check_constraint(
        pool,
        "trust_events",
        "trust_events_request_id_length_ck",
        "request_id IS NULL OR length(request_id) <= 128",
    )
    .await?;
    ensure_check_constraint(
        pool,
        "trust_events",
        "trust_events_trace_id_length_ck",
        "trace_id IS NULL OR length(trace_id) <= 128",
    )
    .await?;
    ensure_check_constraint(
        pool,
        "trust_events",
        "trust_events_span_id_length_ck",
        "span_id IS NULL OR length(span_id) <= 128",
    )
    .await?;
    ensure_check_constraint(
        pool,
        "trust_outbox",
        "trust_outbox_event_id_length_ck",
        "length(event_id) BETWEEN 1 AND 128",
    )
    .await?;
    ensure_check_constraint(
        pool,
        "trust_outbox",
        "trust_outbox_topic_length_ck",
        "length(topic) BETWEEN 1 AND 256",
    )
    .await?;
    ensure_check_constraint(
        pool,
        "trust_outbox",
        "trust_outbox_event_key_length_ck",
        "length(event_key) BETWEEN 1 AND 256",
    )
    .await?;

    Ok(())
}

async fn ensure_check_constraint(
    pool: &PgPool,
    table: &str,
    name: &str,
    expression: &str,
) -> Result<()> {
    let sql = format!(
        r#"
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = '{name}'
            ) THEN
                ALTER TABLE {table}
                ADD CONSTRAINT {name} CHECK ({expression});
            END IF;
        END
        $$;
        "#
    );

    sqlx::query(&sql).execute(pool).await?;
    Ok(())
}

fn policy_version_initial() -> u64 {
    1
}

pub fn now_epoch_secs() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => i64::try_from(duration.as_secs()).unwrap_or(i64::MAX),
        Err(_) => 0,
    }
}

fn to_i64(value: u64) -> Result<i64> {
    i64::try_from(value).context("u64 to i64 conversion overflow")
}

fn from_i64_u64(value: i64, field: &str) -> Result<u64> {
    if value < 0 {
        bail!("{field} is negative");
    }
    Ok(value as u64)
}

fn from_i32_u16(value: i32, field: &str) -> Result<u16> {
    if value < 0 {
        bail!("{field} is negative");
    }
    u16::try_from(value).with_context(|| format!("{field} overflows u16"))
}

fn parse_u64_str(value: String, field: &str) -> Result<u64> {
    value
        .parse::<u64>()
        .with_context(|| format!("invalid {field}: {value}"))
}
