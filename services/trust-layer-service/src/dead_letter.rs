use anyhow::Result;
use sqlx::PgPool;
use tracing::info;

use crate::{
    config::{DeadLetterRedriveArgs, DeadLetterSweepArgs},
    db,
};

pub async fn run_redrive(pool: &PgPool, args: DeadLetterRedriveArgs) -> Result<()> {
    let stats =
        db::redrive_dead_letters(pool, args.limit(), args.event_id.as_deref(), args.dry_run)
            .await?;

    info!(
        dry_run = args.dry_run,
        selected = stats.selected,
        redriven = stats.redriven,
        skipped = stats.skipped_existing,
        "dead-letter redrive complete"
    );

    Ok(())
}

pub async fn run_sweep(pool: &PgPool, args: DeadLetterSweepArgs) -> Result<()> {
    let stats =
        db::sweep_dead_letters(pool, args.retention_secs(), args.limit(), args.dry_run).await?;

    info!(
        dry_run = args.dry_run,
        retention_secs = args.retention_secs(),
        selected = stats.selected,
        deleted = stats.deleted,
        "dead-letter sweep complete"
    );

    Ok(())
}
