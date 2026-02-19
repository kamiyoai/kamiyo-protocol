# trust-layer-service

Production HTTP gateway for `kamiyo-trust-layer` with durable Postgres state and Kafka outbox relay.

## Capabilities

- Idempotent ingest endpoint: `POST /v1/trust/events`
- Read endpoint: `GET /v1/trust/subjects/:subject`
- Metrics endpoint: `GET /metrics` (Prometheus text format)
- Durable writes: events, subject state, outbox entries in one Postgres transaction
- Concurrency control:
  - `event_id` uniqueness for idempotent writes
  - per-subject advisory transaction lock
  - `UNIQUE(subject, sequence)` integrity guard
- Kafka publishing via transactional outbox relay (at-least-once publish, idempotent keying)
- Retry cap + dead-letter queue for poison events
- Dead-letter operational CLI:
  - re-drive back into outbox (`dead-letter redrive`)
  - retention sweeper (`dead-letter sweep`)
- Replay tooling to verify hash-chain/receipt determinism and optionally re-enqueue outbox events

## Semantics

- Exactly-once for durable DB writes per `event_id`
- At-least-once for Kafka publish with idempotent producer settings and stable key (`subject`)
- Duplicate `event_id` with identical payload returns existing receipt (`idempotent_replay=true`)
- Duplicate `event_id` with conflicting payload returns conflict
- Auth key rotation via `TRUST_LAYER_API_KEYS` (comma-separated keys)

## Run

```bash
cargo run -p trust-layer-service -- serve \
  --database-url postgresql://localhost:5432/kamiyo \
  --kafka-brokers localhost:9092 \
  --kafka-topic kamiyo.trust.events \
  --api-keys current-key,next-key \
  --relay-max-attempts 16
```

Relay-only mode:

```bash
cargo run -p trust-layer-service -- relay \
  --database-url postgresql://localhost:5432/kamiyo \
  --kafka-brokers localhost:9092 \
  --max-attempts 16
```

Kafka compression can be set with `TRUST_LAYER_KAFKA_COMPRESSION_TYPE` (`none`, `gzip`, `snappy`, `lz4`, `zstd`). The default is `none` for maximum runtime compatibility.

Replay mode:

```bash
cargo run -p trust-layer-service -- replay \
  --database-url postgresql://localhost:5432/kamiyo \
  --from-offset 1 \
  --batch-size 5000 \
  --limit 50000 \
  --rewrite-subject-state \
  --enqueue-outbox
```

Dead-letter re-drive:

```bash
cargo run -p trust-layer-service -- dead-letter redrive \
  --database-url postgresql://localhost:5432/kamiyo \
  --limit 500
```

Dead-letter retention sweep:

```bash
cargo run -p trust-layer-service -- dead-letter sweep \
  --database-url postgresql://localhost:5432/kamiyo \
  --retention-secs 604800 \
  --limit 1000
```

## API Example

```bash
curl -X POST http://127.0.0.1:8095/v1/trust/events \
  -H "content-type: application/json" \
  -H "x-api-key: change-me" \
  -d '{
    "event_id": "evt-123",
    "subject": "agent-alpha",
    "sequence": 1,
    "observed_at": 1700000000,
    "kind": "manual_credit",
    "weight": 20,
    "stake_delta": 10000,
    "context": {"request_id": "req-1", "trace_id": "trace-1", "span_id": "span-1"}
  }'
```

## Validation

```bash
cargo check -p trust-layer-service
cargo test -p trust-layer-service
```

## Dockerized Fault-Injection E2E

The E2E harness starts Postgres and Redpanda via Docker Compose, injects a Kafka outage by pausing the broker container, verifies dead-letter behavior, re-drives records, and validates retention sweeping.

```bash
./services/trust-layer-service/e2e/run-fault-injection.sh
```

## Observability Assets

- Prometheus alert rules: `services/trust-layer-service/observability/prometheus/alerts.yaml`
- Grafana dashboard JSON: `services/trust-layer-service/observability/grafana/trust-layer-service-dashboard.json`
