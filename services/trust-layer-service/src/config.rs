use std::{collections::BTreeSet, time::Duration};

use clap::{Args, Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(name = "trust-layer-service")]
#[command(about = "HTTP gateway + outbox relay for kamiyo-trust-layer")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    Serve(ServeArgs),
    Relay(RelayArgs),
    Replay(ReplayArgs),
    DeadLetter(DeadLetterArgs),
}

#[derive(Debug, Clone, Args, Default)]
pub struct KafkaSecurityArgs {
    #[arg(
        long,
        env = "TRUST_LAYER_KAFKA_COMPRESSION_TYPE",
        default_value = "none"
    )]
    pub compression_type: String,
    #[arg(long, env = "TRUST_LAYER_KAFKA_SECURITY_PROTOCOL")]
    pub security_protocol: Option<String>,
    #[arg(long, env = "TRUST_LAYER_KAFKA_SASL_MECHANISM")]
    pub sasl_mechanism: Option<String>,
    #[arg(long, env = "TRUST_LAYER_KAFKA_SASL_USERNAME")]
    pub sasl_username: Option<String>,
    #[arg(long, env = "TRUST_LAYER_KAFKA_SASL_PASSWORD")]
    pub sasl_password: Option<String>,
    #[arg(long, env = "TRUST_LAYER_KAFKA_SSL_CA_LOCATION")]
    pub ssl_ca_location: Option<String>,
    #[arg(long, env = "TRUST_LAYER_KAFKA_SSL_CERTIFICATE_LOCATION")]
    pub ssl_certificate_location: Option<String>,
    #[arg(long, env = "TRUST_LAYER_KAFKA_SSL_KEY_LOCATION")]
    pub ssl_key_location: Option<String>,
    #[arg(long, env = "TRUST_LAYER_KAFKA_SSL_KEY_PASSWORD")]
    pub ssl_key_password: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct KafkaSecurityConfig {
    pub compression_type: String,
    pub security_protocol: Option<String>,
    pub sasl_mechanism: Option<String>,
    pub sasl_username: Option<String>,
    pub sasl_password: Option<String>,
    pub ssl_ca_location: Option<String>,
    pub ssl_certificate_location: Option<String>,
    pub ssl_key_location: Option<String>,
    pub ssl_key_password: Option<String>,
}

impl From<&KafkaSecurityArgs> for KafkaSecurityConfig {
    fn from(value: &KafkaSecurityArgs) -> Self {
        Self {
            compression_type: value.compression_type.clone(),
            security_protocol: value.security_protocol.clone(),
            sasl_mechanism: value.sasl_mechanism.clone(),
            sasl_username: value.sasl_username.clone(),
            sasl_password: value.sasl_password.clone(),
            ssl_ca_location: value.ssl_ca_location.clone(),
            ssl_certificate_location: value.ssl_certificate_location.clone(),
            ssl_key_location: value.ssl_key_location.clone(),
            ssl_key_password: value.ssl_key_password.clone(),
        }
    }
}

#[derive(Debug, Clone, Args)]
pub struct ServeArgs {
    #[arg(long, env = "DATABASE_URL")]
    pub database_url: String,
    #[arg(long, env = "TRUST_LAYER_KAFKA_BROKERS")]
    pub kafka_brokers: Option<String>,
    #[arg(
        long,
        env = "TRUST_LAYER_KAFKA_TOPIC",
        default_value = "kamiyo.trust.events"
    )]
    pub kafka_topic: String,
    #[arg(long, env = "TRUST_LAYER_API_KEY")]
    pub api_key: Option<String>,
    #[arg(long, env = "TRUST_LAYER_API_KEYS")]
    pub api_keys: Option<String>,
    #[arg(long, env = "TRUST_LAYER_BIND_ADDR", default_value = "0.0.0.0:8095")]
    pub bind_addr: String,
    #[arg(long, env = "TRUST_LAYER_RELAY_BATCH_SIZE", default_value_t = 100)]
    pub relay_batch_size: i64,
    #[arg(long, env = "TRUST_LAYER_RELAY_INTERVAL_MS", default_value_t = 500)]
    pub relay_interval_ms: u64,
    #[arg(
        long,
        env = "TRUST_LAYER_RELAY_STUCK_TIMEOUT_SECS",
        default_value_t = 120
    )]
    pub relay_stuck_timeout_secs: i64,
    #[arg(long, env = "TRUST_LAYER_RELAY_MAX_ATTEMPTS", default_value_t = 16)]
    pub relay_max_attempts: i32,
    #[command(flatten)]
    pub kafka_security: KafkaSecurityArgs,
}

#[derive(Debug, Clone, Args)]
pub struct RelayArgs {
    #[arg(long, env = "DATABASE_URL")]
    pub database_url: String,
    #[arg(long, env = "TRUST_LAYER_KAFKA_BROKERS")]
    pub kafka_brokers: String,
    #[arg(long, env = "TRUST_LAYER_RELAY_BATCH_SIZE", default_value_t = 100)]
    pub batch_size: i64,
    #[arg(long, env = "TRUST_LAYER_RELAY_INTERVAL_MS", default_value_t = 500)]
    pub poll_interval_ms: u64,
    #[arg(
        long,
        env = "TRUST_LAYER_RELAY_STUCK_TIMEOUT_SECS",
        default_value_t = 120
    )]
    pub stuck_timeout_secs: i64,
    #[arg(long, env = "TRUST_LAYER_RELAY_MAX_ATTEMPTS", default_value_t = 16)]
    pub max_attempts: i32,
    #[arg(long, default_value_t = false)]
    pub once: bool,
    #[command(flatten)]
    pub kafka_security: KafkaSecurityArgs,
}

#[derive(Debug, Clone, Args)]
pub struct ReplayArgs {
    #[arg(long, env = "DATABASE_URL")]
    pub database_url: String,
    #[arg(long)]
    pub subject: Option<String>,
    #[arg(long, default_value_t = 1)]
    pub from_offset: i64,
    #[arg(long, default_value_t = 100_000)]
    pub limit: i64,
    #[arg(long, env = "TRUST_LAYER_REPLAY_BATCH_SIZE", default_value_t = 5_000)]
    pub batch_size: i64,
    #[arg(long, default_value_t = false)]
    pub rewrite_subject_state: bool,
    #[arg(long, default_value_t = false)]
    pub enqueue_outbox: bool,
    #[arg(
        long,
        env = "TRUST_LAYER_KAFKA_TOPIC",
        default_value = "kamiyo.trust.events"
    )]
    pub kafka_topic: String,
}

#[derive(Debug, Clone, Args)]
pub struct DeadLetterArgs {
    #[command(subcommand)]
    pub command: DeadLetterCommand,
}

#[derive(Debug, Clone, Subcommand)]
pub enum DeadLetterCommand {
    Redrive(DeadLetterRedriveArgs),
    Sweep(DeadLetterSweepArgs),
}

#[derive(Debug, Clone, Args)]
pub struct DeadLetterRedriveArgs {
    #[arg(long, env = "DATABASE_URL")]
    pub database_url: String,
    #[arg(
        long,
        env = "TRUST_LAYER_DEAD_LETTER_REDRIVE_LIMIT",
        default_value_t = 100
    )]
    pub limit: i64,
    #[arg(long)]
    pub event_id: Option<String>,
    #[arg(long, default_value_t = false)]
    pub dry_run: bool,
}

#[derive(Debug, Clone, Args)]
pub struct DeadLetterSweepArgs {
    #[arg(long, env = "DATABASE_URL")]
    pub database_url: String,
    #[arg(
        long,
        env = "TRUST_LAYER_DEAD_LETTER_RETENTION_SECS",
        default_value_t = 604_800
    )]
    pub retention_secs: i64,
    #[arg(
        long,
        env = "TRUST_LAYER_DEAD_LETTER_SWEEP_LIMIT",
        default_value_t = 1_000
    )]
    pub limit: i64,
    #[arg(long, default_value_t = false)]
    pub dry_run: bool,
}

impl ServeArgs {
    pub fn relay_interval(&self) -> Duration {
        Duration::from_millis(self.relay_interval_ms)
    }

    pub fn relay_max_attempts(&self) -> i32 {
        self.relay_max_attempts.clamp(1, 256)
    }

    pub fn api_keys(&self) -> Vec<String> {
        let mut set = BTreeSet::new();
        parse_keys(self.api_keys.as_deref(), &mut set);
        parse_keys(self.api_key.as_deref(), &mut set);
        set.into_iter().collect()
    }

    pub fn kafka_security(&self) -> KafkaSecurityConfig {
        KafkaSecurityConfig::from(&self.kafka_security)
    }
}

impl RelayArgs {
    pub fn poll_interval(&self) -> Duration {
        Duration::from_millis(self.poll_interval_ms)
    }

    pub fn max_attempts(&self) -> i32 {
        self.max_attempts.clamp(1, 256)
    }

    pub fn kafka_security(&self) -> KafkaSecurityConfig {
        KafkaSecurityConfig::from(&self.kafka_security)
    }
}

impl ReplayArgs {
    pub fn batch_size(&self) -> i64 {
        self.batch_size.clamp(1, 100_000)
    }
}

impl DeadLetterRedriveArgs {
    pub fn limit(&self) -> i64 {
        self.limit.clamp(1, 100_000)
    }
}

impl DeadLetterSweepArgs {
    pub fn limit(&self) -> i64 {
        self.limit.clamp(1, 100_000)
    }

    pub fn retention_secs(&self) -> i64 {
        self.retention_secs.clamp(1, 31_536_000)
    }
}

fn parse_keys(value: Option<&str>, target: &mut BTreeSet<String>) {
    let Some(raw) = value else {
        return;
    };

    for key in raw.split(',') {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            continue;
        }
        target.insert(trimmed.to_string());
    }
}
