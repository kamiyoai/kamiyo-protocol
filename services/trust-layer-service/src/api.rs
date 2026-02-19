use anyhow::Result;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use kamiyo_trust_layer::{SubjectState, TrustLayer, TrustLayerError, TrustLayerSnapshot};
use sqlx::PgPool;
use std::sync::Arc;

use crate::{
    db,
    metrics::ServiceMetrics,
    model::{
        ApiError, IngestEventRequest, IngestEventResponse, SubjectStateWire, SubjectViewResponse,
    },
    payload,
};

#[derive(Debug, Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub kafka_topic: String,
    pub api_keys: Vec<String>,
    pub metrics: Arc<ServiceMetrics>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/metrics", get(metrics))
        .route("/v1/trust/events", post(ingest_event))
        .route("/v1/trust/subjects/:subject", get(get_subject))
        .with_state(state)
}

async fn healthz() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "ok" }))
}

async fn ingest_event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<IngestEventRequest>,
) -> impl IntoResponse {
    if let Err(problem) = require_api_key(&state, &headers) {
        state.metrics.inc_auth_failures();
        let error = ApiError::new(problem.status, problem.message);
        return (problem.status, Json(error)).into_response();
    }

    match ingest_event_inner(&state, request).await {
        Ok(response) => {
            if response.idempotent_replay {
                state.metrics.inc_ingest_idempotent_replay();
            } else {
                state.metrics.inc_ingest_success();
            }

            (StatusCode::OK, Json(response)).into_response()
        }
        Err(problem) => {
            record_ingest_failure(&state, problem.status);
            let error = ApiError::new(problem.status, problem.message);
            (problem.status, Json(error)).into_response()
        }
    }
}

async fn get_subject(
    Path(subject): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(problem) = require_api_key(&state, &headers) {
        state.metrics.inc_auth_failures();
        let error = ApiError::new(problem.status, problem.message);
        return (problem.status, Json(error)).into_response();
    }

    match get_subject_inner(&state, &subject).await {
        Ok(response) => {
            state.metrics.inc_subject_reads();
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(problem) => {
            let error = ApiError::new(problem.status, problem.message);
            (problem.status, Json(error)).into_response()
        }
    }
}

async fn metrics(State(state): State<AppState>) -> impl IntoResponse {
    let snapshot = state.metrics.snapshot();
    let outbox = match db::load_outbox_counts(&state.pool).await {
        Ok(counts) => counts,
        Err(error) => {
            tracing::error!(error = %error, "failed to load metrics");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let body = format!(
        concat!(
            "# TYPE trust_layer_ingest_success_total counter\n",
            "trust_layer_ingest_success_total {}\n",
            "# TYPE trust_layer_ingest_idempotent_replay_total counter\n",
            "trust_layer_ingest_idempotent_replay_total {}\n",
            "# TYPE trust_layer_ingest_conflict_total counter\n",
            "trust_layer_ingest_conflict_total {}\n",
            "# TYPE trust_layer_ingest_bad_request_total counter\n",
            "trust_layer_ingest_bad_request_total {}\n",
            "# TYPE trust_layer_ingest_internal_error_total counter\n",
            "trust_layer_ingest_internal_error_total {}\n",
            "# TYPE trust_layer_auth_failures_total counter\n",
            "trust_layer_auth_failures_total {}\n",
            "# TYPE trust_layer_subject_reads_total counter\n",
            "trust_layer_subject_reads_total {}\n",
            "# TYPE trust_layer_outbox_published_total counter\n",
            "trust_layer_outbox_published_total {}\n",
            "# TYPE trust_layer_outbox_retries_total counter\n",
            "trust_layer_outbox_retries_total {}\n",
            "# TYPE trust_layer_outbox_dead_letters_total counter\n",
            "trust_layer_outbox_dead_letters_total {}\n",
            "# TYPE trust_layer_outbox_pending gauge\n",
            "trust_layer_outbox_pending {}\n",
            "# TYPE trust_layer_outbox_processing gauge\n",
            "trust_layer_outbox_processing {}\n",
            "# TYPE trust_layer_outbox_published gauge\n",
            "trust_layer_outbox_published {}\n",
            "# TYPE trust_layer_outbox_dead_letter gauge\n",
            "trust_layer_outbox_dead_letter {}\n",
        ),
        snapshot.ingest_success,
        snapshot.ingest_idempotent_replay,
        snapshot.ingest_conflict,
        snapshot.ingest_bad_request,
        snapshot.ingest_internal_error,
        snapshot.auth_failures,
        snapshot.subject_reads,
        snapshot.outbox_published,
        snapshot.outbox_retries,
        snapshot.outbox_dead_letters,
        outbox.pending,
        outbox.processing,
        outbox.published,
        outbox.dead_letter,
    );

    (
        StatusCode::OK,
        [("content-type", "text/plain; version=0.0.4; charset=utf-8")],
        body,
    )
        .into_response()
}

async fn ingest_event_inner(
    state: &AppState,
    request: IngestEventRequest,
) -> ApiResult<IngestEventResponse> {
    if request.event_id.trim().is_empty() {
        return Err(ApiProblem::bad_request("event_id must be non-empty"));
    }
    if request.event_id.len() > 128 {
        return Err(ApiProblem::bad_request(
            "event_id exceeds max length of 128 bytes",
        ));
    }
    if request.subject.trim().is_empty() {
        return Err(ApiProblem::bad_request("subject must be non-empty"));
    }
    if request.subject.len() > 256 {
        return Err(ApiProblem::bad_request(
            "subject exceeds max length of 256 bytes",
        ));
    }

    let incoming_event = request.to_event();
    if let Err(err) = incoming_event.validate() {
        return Err(ApiProblem::bad_request(format!("invalid event: {err}")));
    }

    match ingest_once(state, request.clone()).await {
        Ok(response) => Ok(response),
        Err(err) if is_unique_violation(&err) => {
            if let Some(constraint) = unique_violation_constraint(&err) {
                if constraint == "trust_events_subject_sequence_key" {
                    return Err(ApiProblem::conflict(
                        "subject sequence already exists with a different event",
                    ));
                }
            }

            let existing = db::load_existing_event(&state.pool, &incoming_event.event_id)
                .await
                .map_err(ApiProblem::internal)?;

            if let Some(stored) = existing {
                if events_equivalent(
                    &stored.subject,
                    &request.subject,
                    &stored.event,
                    &incoming_event,
                ) {
                    return Ok(IngestEventResponse {
                        idempotent_replay: true,
                        receipt: stored.receipt.into(),
                    });
                }
                return Err(ApiProblem::conflict(
                    "event_id already exists with a different payload",
                ));
            }

            Err(ApiProblem::internal(err))
        }
        Err(err) => Err(map_ingest_error(err)),
    }
}

async fn ingest_once(state: &AppState, request: IngestEventRequest) -> Result<IngestEventResponse> {
    let mut tx = state.pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)")
        .bind(&request.subject)
        .execute(&mut *tx)
        .await?;

    if let Some(existing) = db::load_existing_event_for_update(&mut tx, &request.event_id).await? {
        let incoming_event = request.to_event();
        if events_equivalent(
            &existing.subject,
            &request.subject,
            &existing.event,
            &incoming_event,
        ) {
            return Ok(IngestEventResponse {
                idempotent_replay: true,
                receipt: existing.receipt.into(),
            });
        }

        return Err(TrustLayerError::EventIdConflict {
            event_id: request.event_id.clone(),
        }
        .into());
    }

    let policy_state = db::load_policy_tx(&mut tx).await?;
    let subject_state = db::load_subject_state_for_update(&mut tx, &request.subject).await?;

    let snapshot = TrustLayerSnapshot {
        policy: policy_state.policy,
        policy_version: policy_state.version,
        subjects: subject_state
            .map(|state| vec![(request.subject.clone(), state)])
            .unwrap_or_default(),
        journal: Vec::new(),
    };

    let mut layer = TrustLayer::from_snapshot(snapshot)?;
    let event = request.to_event();
    let receipt = layer.apply_event(request.subject.clone(), event.clone())?;

    let updated_state = layer
        .subject_state(&request.subject)
        .copied()
        .ok_or_else(|| anyhow::anyhow!("subject state missing after event application"))?;

    let offset = db::insert_event_tx(&mut tx, &request.subject, &event, &receipt).await?;
    db::upsert_subject_state_tx(&mut tx, &request.subject, &updated_state).await?;

    let payload = payload::serialize_outbox_payload(offset, &request.subject, &event, &receipt)
        .map_err(|e| anyhow::anyhow!("failed to serialize outbox payload: {e}"))?;

    db::insert_outbox_tx(
        &mut tx,
        &event.event_id,
        &state.kafka_topic,
        &request.subject,
        &payload,
    )
    .await?;

    tx.commit().await?;

    Ok(IngestEventResponse {
        idempotent_replay: false,
        receipt: receipt.into(),
    })
}

async fn get_subject_inner(state: &AppState, subject: &str) -> ApiResult<SubjectViewResponse> {
    if subject.trim().is_empty() {
        return Err(ApiProblem::bad_request("subject must be non-empty"));
    }

    let policy_state = db::load_policy(&state.pool)
        .await
        .map_err(ApiProblem::internal)?;
    let subject_state = db::load_subject_state(&state.pool, subject)
        .await
        .map_err(ApiProblem::internal)?;

    let snapshot = TrustLayerSnapshot {
        policy: policy_state.policy,
        policy_version: policy_state.version,
        subjects: subject_state
            .map(|state| vec![(subject.to_string(), state)])
            .unwrap_or_default(),
        journal: Vec::new(),
    };

    let layer = TrustLayer::from_snapshot(snapshot).map_err(ApiProblem::internal)?;
    let evaluation = layer.evaluate_subject(subject, db::now_epoch_secs());

    Ok(SubjectViewResponse {
        subject: subject.to_string(),
        evaluation: evaluation.into(),
        state: layer.subject_state(subject).copied().map(state_to_wire),
        policy_version: policy_state.version,
    })
}

fn events_equivalent(
    stored_subject: &str,
    incoming_subject: &str,
    stored: &kamiyo_trust_layer::TrustEvent,
    incoming: &kamiyo_trust_layer::TrustEvent,
) -> bool {
    stored_subject == incoming_subject
        && stored.event_id == incoming.event_id
        && stored.sequence == incoming.sequence
        && stored.observed_at == incoming.observed_at
        && stored.kind == incoming.kind
        && stored.weight == incoming.weight
        && stored.stake_delta == incoming.stake_delta
        && stored.context == incoming.context
}

fn state_to_wire(state: SubjectState) -> SubjectStateWire {
    SubjectStateWire {
        score: state.score,
        stake: state.stake,
        success_count: state.success_count,
        failure_count: state.failure_count,
        last_sequence: state.last_sequence,
        last_event_at: state.last_event_at,
        chain_hash: state.chain_hash.to_string(),
    }
}

fn is_unique_violation(err: &anyhow::Error) -> bool {
    err.downcast_ref::<sqlx::Error>()
        .is_some_and(|sqlx_err| match sqlx_err {
            sqlx::Error::Database(db_err) => db_err.code().as_deref() == Some("23505"),
            _ => false,
        })
}

fn unique_violation_constraint(err: &anyhow::Error) -> Option<String> {
    err.downcast_ref::<sqlx::Error>()
        .and_then(|sqlx_err| match sqlx_err {
            sqlx::Error::Database(db_err) if db_err.code().as_deref() == Some("23505") => {
                db_err.constraint().map(str::to_string)
            }
            _ => None,
        })
}

fn map_ingest_error(err: anyhow::Error) -> ApiProblem {
    if let Some(trust_error) = err.downcast_ref::<TrustLayerError>() {
        return match trust_error {
            TrustLayerError::EventIdConflict { .. }
            | TrustLayerError::NonMonotonicSequence { .. }
            | TrustLayerError::InvalidSequenceStart(_) => {
                ApiProblem::conflict(trust_error.to_string())
            }
            TrustLayerError::InvalidWeight(_)
            | TrustLayerError::InvalidEventId(_)
            | TrustLayerError::InvalidContextField { .. } => {
                ApiProblem::bad_request(trust_error.to_string())
            }
            _ => ApiProblem::internal(err),
        };
    }

    ApiProblem::internal(err)
}

fn require_api_key(state: &AppState, headers: &HeaderMap) -> ApiResult<()> {
    if state.api_keys.is_empty() {
        return Ok(());
    }

    let provided = headers
        .get("x-api-key")
        .and_then(|value| value.to_str().ok());
    if let Some(key) = provided {
        if state.api_keys.iter().any(|expected| expected == key) {
            return Ok(());
        }
    }

    Err(ApiProblem::unauthorized("missing or invalid api key"))
}

fn record_ingest_failure(state: &AppState, status: StatusCode) {
    if status == StatusCode::CONFLICT {
        state.metrics.inc_ingest_conflict();
        return;
    }
    if status == StatusCode::BAD_REQUEST {
        state.metrics.inc_ingest_bad_request();
        return;
    }

    state.metrics.inc_ingest_internal_error();
}

type ApiResult<T> = Result<T, ApiProblem>;

#[derive(Debug)]
struct ApiProblem {
    status: StatusCode,
    message: String,
}

impl ApiProblem {
    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }

    fn conflict(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            message: message.into(),
        }
    }

    fn unauthorized(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            message: message.into(),
        }
    }

    fn internal(error: impl std::fmt::Display) -> Self {
        tracing::error!(error = %error, "request failed");
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: "internal error".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::events_equivalent;
    use kamiyo_trust_layer::{EvidenceKind, TrustEvent};

    #[test]
    fn event_equivalence_requires_subject_match() {
        let left = TrustEvent::new("evt-1", 1, 10, EvidenceKind::ManualCredit, 10, 1_000);
        let right = TrustEvent::new("evt-1", 1, 10, EvidenceKind::ManualCredit, 10, 1_000);

        assert!(events_equivalent("alpha", "alpha", &left, &right));
        assert!(!events_equivalent("alpha", "beta", &left, &right));
    }
}
