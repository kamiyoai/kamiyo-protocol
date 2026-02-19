use std::{sync::Arc, time::Duration};

use anyhow::{bail, Context, Result};
use rdkafka::{
    producer::{FutureProducer, FutureRecord},
    ClientConfig,
};
use sqlx::PgPool;
use tracing::{error, info, warn};

use crate::{
    config::KafkaSecurityConfig,
    db::{self, OutboxMessage},
    metrics::ServiceMetrics,
};

#[derive(Debug, Clone)]
pub struct RelayConfig {
    pub batch_size: i64,
    pub poll_interval: Duration,
    pub stuck_timeout_secs: i64,
    pub max_attempts: i32,
    pub metrics: Arc<ServiceMetrics>,
    pub once: bool,
}

pub fn build_producer(brokers: &str, security: &KafkaSecurityConfig) -> Result<FutureProducer> {
    if security.sasl_mechanism.is_some()
        && (security.sasl_username.is_none() || security.sasl_password.is_none())
    {
        bail!("kafka sasl configuration requires both username and password");
    }

    let compression = security.compression_type.trim().to_ascii_lowercase();
    match compression.as_str() {
        "none" | "gzip" | "snappy" | "lz4" | "zstd" => {}
        _ => {
            bail!(
                "invalid kafka compression type '{}'; expected one of: none,gzip,snappy,lz4,zstd",
                security.compression_type
            );
        }
    }

    let mut config = ClientConfig::new();
    config
        .set("bootstrap.servers", brokers)
        .set("enable.idempotence", "true")
        .set("acks", "all")
        .set("max.in.flight.requests.per.connection", "5")
        .set("compression.type", &compression)
        .set("message.timeout.ms", "10000");

    if let Some(value) = security.security_protocol.as_deref() {
        config.set("security.protocol", value);
    }
    if let Some(value) = security.sasl_mechanism.as_deref() {
        config.set("sasl.mechanism", value);
    }
    if let Some(value) = security.sasl_username.as_deref() {
        config.set("sasl.username", value);
    }
    if let Some(value) = security.sasl_password.as_deref() {
        config.set("sasl.password", value);
    }
    if let Some(value) = security.ssl_ca_location.as_deref() {
        config.set("ssl.ca.location", value);
    }
    if let Some(value) = security.ssl_certificate_location.as_deref() {
        config.set("ssl.certificate.location", value);
    }
    if let Some(value) = security.ssl_key_location.as_deref() {
        config.set("ssl.key.location", value);
    }
    if let Some(value) = security.ssl_key_password.as_deref() {
        config.set("ssl.key.password", value);
    }

    config.create().with_context(|| {
        format!(
            "failed to construct kafka producer (compression.type={})",
            compression
        )
    })
}

pub async fn run(pool: PgPool, producer: FutureProducer, config: RelayConfig) -> Result<()> {
    loop {
        let processed = relay_once(
            &pool,
            &producer,
            config.batch_size,
            config.stuck_timeout_secs,
            config.max_attempts,
            &config.metrics,
        )
        .await?;
        if processed > 0 {
            info!(processed, "published outbox batch");
        }

        if config.once {
            break;
        }

        tokio::time::sleep(config.poll_interval).await;
    }

    Ok(())
}

pub async fn relay_once(
    pool: &PgPool,
    producer: &FutureProducer,
    batch_size: i64,
    stuck_timeout_secs: i64,
    max_attempts: i32,
    metrics: &ServiceMetrics,
) -> Result<usize> {
    let claimed = db::claim_outbox_batch(pool, batch_size, stuck_timeout_secs).await?;
    if claimed.is_empty() {
        return Ok(0);
    }

    let mut published = 0usize;

    for message in claimed {
        let record = FutureRecord::to(&message.topic)
            .key(&message.event_key)
            .payload(&message.payload);

        match producer.send(record, Duration::from_secs(10)).await {
            Ok(_) => {
                db::mark_outbox_published(pool, message.id).await?;
                metrics.inc_outbox_published();
                published += 1;
            }
            Err((err, _msg)) => {
                let text = err.to_string();
                if message.attempt_count >= max_attempts {
                    dead_letter(pool, &message, &text).await?;
                    metrics.inc_outbox_dead_letters();
                    continue;
                }

                warn!(
                    outbox_id = message.id,
                    event_id = %message.event_id,
                    attempt = message.attempt_count,
                    max_attempts,
                    error = %text,
                    "kafka publish failed; scheduling retry"
                );
                db::release_outbox_for_retry(pool, message.id, message.attempt_count, &text)
                    .await?;
                metrics.inc_outbox_retries();
            }
        }
    }

    Ok(published)
}

pub async fn run_relay_task(pool: PgPool, producer: FutureProducer, config: RelayConfig) {
    if let Err(err) = run(pool, producer, config).await {
        error!(error = %err, "relay loop exited with failure");
    }
}

async fn dead_letter(pool: &PgPool, message: &OutboxMessage, error: &str) -> Result<()> {
    warn!(
        outbox_id = message.id,
        event_id = %message.event_id,
        attempt = message.attempt_count,
        error = %error,
        "kafka publish exceeded retry limit; moving to dead letter"
    );

    db::move_outbox_to_dead_letter(pool, message, error).await
}
