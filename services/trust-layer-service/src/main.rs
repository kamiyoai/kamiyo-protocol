mod api;
mod config;
mod db;
mod dead_letter;
mod metrics;
mod model;
mod outbox;
mod payload;
mod replay;

use std::{net::SocketAddr, sync::Arc};

use anyhow::{Context, Result};
use axum::serve;
use clap::Parser;
use config::{Cli, Command, DeadLetterCommand};
use outbox::RelayConfig;
use sqlx::postgres::PgPoolOptions;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    init_tracing();

    let cli = Cli::parse();

    match cli.command {
        Command::Serve(args) => run_serve(args).await,
        Command::Relay(args) => run_relay(args).await,
        Command::Replay(args) => run_replay(args).await,
        Command::DeadLetter(args) => run_dead_letter(args).await,
    }
}

async fn run_serve(args: config::ServeArgs) -> Result<()> {
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .connect(&args.database_url)
        .await
        .context("failed to connect to postgres")?;

    db::ensure_schema(&pool).await?;

    let metrics = Arc::new(metrics::ServiceMetrics::default());
    let api_keys = args.api_keys();
    if api_keys.is_empty() {
        warn!("TRUST_LAYER_API_KEY/TRUST_LAYER_API_KEYS not set; endpoints are unauthenticated");
    }

    let state = api::AppState {
        pool: pool.clone(),
        kafka_topic: args.kafka_topic.clone(),
        api_keys,
        metrics: metrics.clone(),
    };

    if let Some(brokers) = args.kafka_brokers.as_ref() {
        let producer = outbox::build_producer(brokers, &args.kafka_security())?;
        let relay_cfg = RelayConfig {
            batch_size: args.relay_batch_size.max(1),
            poll_interval: args.relay_interval(),
            stuck_timeout_secs: args.relay_stuck_timeout_secs.max(1),
            max_attempts: args.relay_max_attempts(),
            metrics,
            once: false,
        };
        tokio::spawn(outbox::run_relay_task(pool.clone(), producer, relay_cfg));
        info!("background outbox relay started");
    } else {
        warn!("kafka brokers not configured; outbox relay is disabled");
    }

    let app = api::router(state);
    let addr: SocketAddr = args.bind_addr.parse().context("invalid bind address")?;

    info!(address = %addr, "trust-layer-service listening");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .context("failed to bind tcp listener")?;

    serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("http server failed")?;

    Ok(())
}

async fn run_relay(args: config::RelayArgs) -> Result<()> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&args.database_url)
        .await
        .context("failed to connect to postgres")?;

    db::ensure_schema(&pool).await?;

    let producer = outbox::build_producer(&args.kafka_brokers, &args.kafka_security())?;
    let config = RelayConfig {
        batch_size: args.batch_size.max(1),
        poll_interval: args.poll_interval(),
        stuck_timeout_secs: args.stuck_timeout_secs.max(1),
        max_attempts: args.max_attempts(),
        metrics: Arc::new(metrics::ServiceMetrics::default()),
        once: args.once,
    };

    outbox::run(pool, producer, config).await
}

async fn run_replay(args: config::ReplayArgs) -> Result<()> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&args.database_url)
        .await
        .context("failed to connect to postgres")?;

    db::ensure_schema(&pool).await?;
    let batch_size = args.batch_size();

    let config = replay::ReplayConfig {
        subject: args.subject,
        from_offset: args.from_offset,
        limit: args.limit,
        batch_size,
        rewrite_subject_state: args.rewrite_subject_state,
        enqueue_outbox: args.enqueue_outbox,
        kafka_topic: args.kafka_topic,
    };

    replay::run(&pool, config).await
}

async fn run_dead_letter(args: config::DeadLetterArgs) -> Result<()> {
    let database_url = match &args.command {
        DeadLetterCommand::Redrive(cmd) => cmd.database_url.clone(),
        DeadLetterCommand::Sweep(cmd) => cmd.database_url.clone(),
    };

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .context("failed to connect to postgres")?;

    db::ensure_schema(&pool).await?;

    match args.command {
        DeadLetterCommand::Redrive(cmd) => dead_letter::run_redrive(&pool, cmd).await,
        DeadLetterCommand::Sweep(cmd) => dead_letter::run_sweep(&pool, cmd).await,
    }
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .compact()
        .init();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{signal, SignalKind};

        if let Ok(mut sigterm) = signal(SignalKind::terminate()) {
            sigterm.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
