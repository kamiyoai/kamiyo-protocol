use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Debug, Default)]
pub struct ServiceMetrics {
    ingest_success: AtomicU64,
    ingest_idempotent_replay: AtomicU64,
    ingest_conflict: AtomicU64,
    ingest_bad_request: AtomicU64,
    ingest_internal_error: AtomicU64,
    subject_reads: AtomicU64,
    auth_failures: AtomicU64,
    outbox_published: AtomicU64,
    outbox_retries: AtomicU64,
    outbox_dead_letters: AtomicU64,
}

#[derive(Debug, Clone, Copy)]
pub struct MetricsSnapshot {
    pub ingest_success: u64,
    pub ingest_idempotent_replay: u64,
    pub ingest_conflict: u64,
    pub ingest_bad_request: u64,
    pub ingest_internal_error: u64,
    pub subject_reads: u64,
    pub auth_failures: u64,
    pub outbox_published: u64,
    pub outbox_retries: u64,
    pub outbox_dead_letters: u64,
}

impl ServiceMetrics {
    pub fn inc_ingest_success(&self) {
        self.ingest_success.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_ingest_idempotent_replay(&self) {
        self.ingest_idempotent_replay
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_ingest_conflict(&self) {
        self.ingest_conflict.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_ingest_bad_request(&self) {
        self.ingest_bad_request.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_ingest_internal_error(&self) {
        self.ingest_internal_error.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_subject_reads(&self) {
        self.subject_reads.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_auth_failures(&self) {
        self.auth_failures.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_outbox_published(&self) {
        self.outbox_published.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_outbox_retries(&self) {
        self.outbox_retries.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_outbox_dead_letters(&self) {
        self.outbox_dead_letters.fetch_add(1, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> MetricsSnapshot {
        MetricsSnapshot {
            ingest_success: self.ingest_success.load(Ordering::Relaxed),
            ingest_idempotent_replay: self.ingest_idempotent_replay.load(Ordering::Relaxed),
            ingest_conflict: self.ingest_conflict.load(Ordering::Relaxed),
            ingest_bad_request: self.ingest_bad_request.load(Ordering::Relaxed),
            ingest_internal_error: self.ingest_internal_error.load(Ordering::Relaxed),
            subject_reads: self.subject_reads.load(Ordering::Relaxed),
            auth_failures: self.auth_failures.load(Ordering::Relaxed),
            outbox_published: self.outbox_published.load(Ordering::Relaxed),
            outbox_retries: self.outbox_retries.load(Ordering::Relaxed),
            outbox_dead_letters: self.outbox_dead_letters.load(Ordering::Relaxed),
        }
    }
}
