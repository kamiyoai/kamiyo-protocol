# ADR 004: Prometheus for Observability

**Status**: Accepted

**Date**: 2025-11-05

**Deciders**: DevOps Team, Engineering Team

---

## Context

Security monitoring systems need comprehensive observability to:
1. **Track system health**: Is the monitor itself working correctly?
2. **Measure detection performance**: How many exploits detected? False positive rate?
3. **Monitor latency**: Are alerts sent fast enough?
4. **Debug issues**: What happened when an alert was missed?
5. **Demonstrate value**: Prove the system is working to stakeholders

Without observability:
- Can't prove the system is detecting exploits
- No visibility into false positive rates
- Difficult to debug issues in production
- Can't optimize performance
- No SLA guarantees possible

## Decision

We will implement **Prometheus-based observability** with structured logging and health checks:

### Components

#### 1. Prometheus Metrics (20+ metrics)

**API Metrics**:
- `api_requests_total`: Request count by endpoint, method, status
- `api_request_duration_seconds`: Request latency histogram
- `api_errors_total`: Error count by endpoint and type

**Detection Metrics**:
- `exploits_detected_total`: Exploits by monitor, severity, category
- `detection_latency_seconds`: Time from event to detection
- `false_positive_rate`: Estimated FP rate per monitor

**Monitor Health**:
- `monitor_runs_total`: Execution count by monitor and status
- `monitor_runtime_seconds`: Execution time histogram
- `monitor_last_run_timestamp`: Last successful run time

**ML Metrics**:
- `ml_predictions_total`: Prediction count by model and type
- `ml_model_score`: Model quality metrics
- `ml_feature_importance`: Feature importance scores

**External API Metrics**:
- `external_api_calls_total`: Calls to Hyperliquid, Binance, Coinbase
- `external_api_latency_seconds`: External API response times
- `external_api_errors_total`: External API failures

#### 2. Health Check System

```python
@app.get("/health")
async def health_check():
    return health_checker.check_health()
```

Returns:
```json
{
  "healthy": true,
  "timestamp": "2025-11-05T10:30:00Z",
  "components": {
    "database": {"healthy": true},
    "ml_models": {"healthy": true, "loaded": 2},
    "api": {"healthy": true, "uptime_seconds": 86400}
  }
}
```

#### 3. Structured Logging

```python
logger = StructuredLogger(__name__)
logger.info("Exploit detected",
    severity="CRITICAL",
    monitor="hlp_vault",
    account_value=577023004.33,
    anomaly_score=0.95
)
```

Output:
```
timestamp=2025-11-05T10:30:00Z message="Exploit detected" severity=CRITICAL monitor=hlp_vault account_value=577023004.33 anomaly_score=0.95
```

## Implementation

### File Structure
```
api/
├── observability.py      # Metrics, health checks, logging
└── main.py              # Instrumentation in endpoints
```

### Endpoint Instrumentation

**Before (No Observability)**:
```python
@app.get("/exploits")
async def get_exploits(...):
    exploits = await _fetch_all_exploits()  # No tracking
    return {"exploits": exploits}
```

**After (Fully Instrumented)**:
```python
@app.get("/exploits")
async def get_exploits(...):
    start_time = time.time()

    try:
        # Track request
        api_requests_total.labels(
            endpoint="/exploits",
            method="GET",
            status="200"
        ).inc()

        exploits = await _fetch_all_exploits()

        # Track exploits detected
        exploits_detected_total.labels(
            monitor="aggregate",
            severity="mixed",
            category="all"
        ).inc(len(exploits))

        # Track duration
        duration = time.time() - start_time
        api_request_duration.labels(
            endpoint="/exploits",
            method="GET"
        ).observe(duration)

        return {"exploits": exploits}

    except Exception as e:
        # Track errors
        api_requests_total.labels(
            endpoint="/exploits",
            method="GET",
            status="500"
        ).inc()
        raise
```

## Consequences

### Positive

**Production Readiness**:
- `/metrics` endpoint for Prometheus scraping
- `/health` endpoint for load balancer health checks
- Structured logs for log aggregation (ELK, Datadog)

**Operational Visibility**:
- Real-time dashboards in Grafana
- Alerting on system issues (AlertManager)
- Performance optimization data
- SLA tracking

**Debugging Capability**:
- Trace request flow through system
- Identify bottlenecks
- Correlate errors with events

**Stakeholder Confidence**:
- Prove detection capability with metrics
- Show false positive reduction over time
- Demonstrate system reliability

### Negative

- **Performance overhead**: ~1-2ms per request for metric recording
- **Storage**: Prometheus metrics require storage (mitigated by retention policies)
- **Complexity**: More code to maintain

### Mitigations

**Performance**: Metrics are in-memory counters, minimal overhead
**Storage**: Standard 15-day retention sufficient for security monitoring
**Complexity**: Centralized in `observability.py`, easy to maintain

## Integration Points

### Grafana Dashboards
```yaml
# Example dashboard query
rate(api_requests_total{endpoint="/exploits"}[5m])  # Request rate
histogram_quantile(0.95, api_request_duration_seconds)  # p95 latency
```

### AlertManager Rules
```yaml
# Alert if no exploits checked in 10 minutes
- alert: MonitorStalled
  expr: time() - monitor_last_run_timestamp > 600
  annotations:
    summary: "{{$labels.monitor}} hasn't run in 10+ minutes"
```

### Datadog Integration
Structured logs automatically parsed by Datadog for:
- Error rate tracking
- Custom metrics from logs
- Correlation with infrastructure metrics

## Alternatives Considered

### OpenTelemetry
- **Pros**: Vendor-neutral, supports traces + metrics + logs
- **Cons**: More complex, overhead higher
- **Why not chosen**: Prometheus is simpler and sufficient for our needs

### Custom Logging Only
- **Pros**: Simple, no dependencies
- **Cons**: No standardized metrics format, hard to query
- **Why not chosen**: Can't integrate with standard dashboards

### StatsD
- **Pros**: Simple, widely supported
- **Cons**: No built-in labels, less flexible
- **Why not chosen**: Prometheus labels are essential for multi-dimensional queries

## Validation

### Metrics Populate Correctly

```bash
# Start API
uvicorn api.main:app

# Make requests
curl http://localhost:8000/exploits
curl http://localhost:8000/stats

# Check metrics
curl http://localhost:8000/metrics | grep api_requests_total
# Output: api_requests_total{endpoint="/exploits",method="GET",status="200"} 1.0
```

### Health Checks Work

```bash
curl http://localhost:8000/health
# Output: {"healthy": true, "components": {...}}
```

## Production Deployment

```yaml
# docker-compose.yml
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'

  grafana:
    image: grafana/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=secret
```

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'hyperliquid-monitor'
    static_configs:
      - targets: ['api:8000']
    scrape_interval: 15s
```

## Future Enhancements

- Distributed tracing with OpenTelemetry
- Custom Grafana dashboards
- Automated anomaly detection on metrics
- Integration with PagerDuty for on-call

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Dashboards](https://grafana.com/docs/)
- [FastAPI Prometheus Integration](https://github.com/trallnag/prometheus-fastapi-instrumentator)
