# Social Media Monitoring Module

Comprehensive monitoring and observability for Kamiyo's social media posting system.

## Overview

This monitoring module provides:

- **Prometheus Metrics** - Performance and error tracking
- **Structured Logging** - JSON logs for aggregation and analysis
- **Health Checks** - Platform and system health monitoring
- **Alerting** - Automated alerts via Slack, Discord, and PagerDuty

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Social Media Posters                       │
│  (Reddit, Discord, Telegram, Twitter)                        │
└──────────────┬────────────────────────────┬─────────────────┘
               │                            │
               ▼                            ▼
    ┌──────────────────┐         ┌──────────────────┐
    │  Metrics         │         │  Structured      │
    │  (Prometheus)    │         │  Logging         │
    └────────┬─────────┘         └────────┬─────────┘
             │                            │
             ▼                            ▼
    ┌──────────────────┐         ┌──────────────────┐
    │  Prometheus      │         │  Log Aggregation │
    │  Server          │         │  (ELK, Loki)     │
    └────────┬─────────┘         └──────────────────┘
             │
             ▼
    ┌──────────────────┐
    │  Grafana         │
    │  Dashboards      │
    └──────────────────┘
             │
             ▼
    ┌──────────────────┐
    │  Alert Manager   │
    │  (Slack, PD)     │
    └──────────────────┘
```

## Components

### 1. Metrics (`metrics.py`)

Prometheus metrics for tracking:

**Counters:**
- `social_posts_total` - Total posts by platform and status
- `social_api_errors_total` - API errors by platform and type
- `social_retries_total` - Retry attempts
- `social_validation_failures_total` - Content validation failures

**Histograms:**
- `social_post_generation_duration_seconds` - Time to generate content
- `social_post_api_duration_seconds` - API call latency
- `social_queue_processing_duration_seconds` - Queue processing time

**Gauges:**
- `social_platform_authenticated` - Authentication status (1/0)
- `social_rate_limit_remaining` - Remaining API calls
- `social_posts_in_queue` - Posts waiting by status

### 2. Structured Logging (`structured_logging.py`)

JSON-formatted logs with context:

```python
from social.monitoring import get_logger, log_context

logger = get_logger(__name__)

with log_context(request_id="req_123", user_id="user_456"):
    logger.info("processing_request", action="create_post")
```

**Specialized Logger:**

```python
from social.monitoring import social_logger

social_logger.log_post_success(
    platform="reddit",
    exploit_tx_hash="0x123...",
    post_id="post_789",
    duration_seconds=2.5
)
```

### 3. Health Checks (`health_check.py`)

Monitors:
- Platform authentication
- Kamiyo API connectivity
- Database connectivity (optional)
- Disk space
- Memory usage

```python
from social.monitoring import check_health

health = check_health(
    platforms={'reddit': reddit_poster},
    kamiyo_api_url="https://api.kamiyo.ai"
)
# Returns: {'status': 'healthy', 'checks': [...], 'summary': {...}}
```

### 4. Alerting (`alerting.py`)

Automated alerts for:
- Consecutive posting failures (5+)
- Rate limit exhaustion
- Authentication failures
- System health issues

```python
from social.monitoring import AlertManager, Alert, AlertSeverity

alert_manager = AlertManager(
    slack_webhook="https://hooks.slack.com/...",
    discord_webhook="https://discord.com/api/webhooks/..."
)

alert = Alert(
    title="Rate Limit Exhausted",
    message="Reddit rate limit exhausted",
    severity=AlertSeverity.ERROR,
    details={'platform': 'reddit'}
)

alert_manager.send_alert(alert)
```

## Installation

```bash
pip install prometheus_client structlog psutil
```

Or use the project requirements:

```bash
pip install -r requirements.txt
```

## Quick Start

### 1. Initialize Monitoring

```python
from social.monitoring import configure_logging

# Configure structured logging
configure_logging(
    log_level="INFO",
    log_file="/var/log/kamiyo/social.log",
    json_format=True
)
```

### 2. Add to Your Application

```python
from fastapi import FastAPI
from fastapi.responses import Response
from social.monitoring import metrics, check_health

app = FastAPI()

@app.get("/metrics")
def prometheus_metrics():
    return Response(
        content=metrics.get_metrics(),
        media_type=metrics.get_content_type()
    )

@app.get("/health")
def health_check_endpoint():
    return check_health(platforms={'reddit': reddit_poster})
```

### 3. Integrate in Posters

```python
from social.monitoring import track_post, track_api_call, social_logger

def post(self, content, **kwargs):
    social_logger.log_post_attempt(
        platform='reddit',
        exploit_tx_hash=kwargs.get('exploit_tx_hash')
    )

    with track_api_call('reddit'):
        result = self._do_post(content)

    if result['success']:
        track_post('reddit', 'success')
        social_logger.log_post_success(
            platform='reddit',
            exploit_tx_hash=kwargs.get('exploit_tx_hash'),
            post_id=result['post_id']
        )
    else:
        track_post('reddit', 'failed')
        social_logger.log_post_failure(
            platform='reddit',
            exploit_tx_hash=kwargs.get('exploit_tx_hash'),
            error=result['error']
        )

    return result
```

## Configuration

### Environment Variables

```bash
# Alert webhooks
export SLACK_ALERT_WEBHOOK="https://hooks.slack.com/services/..."
export DISCORD_ALERT_WEBHOOK="https://discord.com/api/webhooks/..."
export PAGERDUTY_ROUTING_KEY="your-routing-key"

# API endpoints
export KAMIYO_API_URL="https://api.kamiyo.ai"
```

### Prometheus

Edit `monitoring/prometheus.yml` to set your application's host:port:

```yaml
scrape_configs:
  - job_name: 'kamiyo-social-media'
    static_configs:
      - targets: ['localhost:8001']  # Update this
    metrics_path: '/metrics'
    scrape_interval: 10s
```

Start Prometheus:

```bash
prometheus --config.file=monitoring/prometheus.yml
```

### Grafana

1. Start Grafana:

```bash
docker run -d -p 3000:3000 grafana/grafana
```

2. Add Prometheus data source at http://localhost:3000
3. Import `monitoring/dashboards/social-media-dashboard.json`

## Metrics Reference

### Post Metrics

```promql
# Success rate
sum(rate(social_posts_total{status="success"}[5m])) by (platform)
/ sum(rate(social_posts_total[5m])) by (platform) * 100

# Posts per minute
sum(rate(social_posts_total[1m])) by (platform, status) * 60

# Total posts today
sum(increase(social_posts_total{status="success"}[24h]))
```

### Performance Metrics

```promql
# 95th percentile latency
histogram_quantile(0.95,
  rate(social_post_api_duration_seconds_bucket[5m])
)

# Average generation time
rate(social_post_generation_duration_seconds_sum[5m])
/ rate(social_post_generation_duration_seconds_count[5m])
```

### Error Metrics

```promql
# Error rate by platform
sum(rate(social_api_errors_total[5m])) by (platform, error_type)

# Authentication failures
social_platform_authenticated == 0

# Rate limit status
social_rate_limit_remaining < 10
```

## Alert Rules

Key alerts configured in `monitoring/social_media_alerts.yml`:

- **HighErrorRate** - >10% posts failing
- **CriticalErrorRate** - >50% posts failing
- **PlatformAuthenticationFailed** - Platform not authenticated
- **RateLimitExhausted** - No API calls remaining
- **QueueBackingUp** - >100 posts pending
- **NoPostsBeingSent** - No successful posts in 15 minutes
- **ConsecutiveFailures** - 5+ failures in 5 minutes

## Dashboards

The Grafana dashboard includes:

1. **Overview** - Success rate, authentication status, total posts
2. **Performance** - Latency percentiles, generation time
3. **Errors** - Error rates by platform and type
4. **Rate Limits** - Remaining API calls per platform
5. **Queue** - Queue size and processing time
6. **Retries** - Retry attempts by platform

## Log Format

Example structured log entry:

```json
{
  "timestamp": "2025-10-14T12:34:56.789Z",
  "level": "info",
  "logger": "social.platforms.reddit",
  "event": "post_success",
  "platform": "reddit",
  "exploit_tx_hash": "0x1234567890abcdef...",
  "post_id": "post_abc123",
  "post_url": "https://reddit.com/r/defi/post_abc123",
  "duration_seconds": 2.345
}
```

## Testing

Test monitoring components:

```bash
# Test metrics
python social/monitoring/metrics.py

# Test logging
python social/monitoring/structured_logging.py

# Test health checks
python social/monitoring/health_check.py

# Test alerting
python social/monitoring/alerting.py
```

## Troubleshooting

### Metrics not showing

1. Check `/metrics` endpoint: `curl http://localhost:8000/metrics`
2. Verify Prometheus targets: http://localhost:9090/targets
3. Check Prometheus config syntax: `promtool check config prometheus.yml`

### Logs not structured

1. Ensure `json_format=True` in `configure_logging()`
2. Verify structlog is installed: `pip show structlog`
3. Check log file permissions

### Alerts not firing

1. Verify alert rules syntax: `promtool check rules social_media_alerts.yml`
2. Check alert manager configuration
3. Test webhook URLs manually
4. Check AlertManager logs: `docker logs alertmanager`

### Health checks failing

1. Verify API URLs are reachable
2. Check platform credentials
3. Ensure sufficient disk space and memory
4. Check network connectivity

## Best Practices

1. **Log exploit_tx_hash** - Links posts to specific exploits
2. **Use context managers** - Automatically track durations
3. **Reset failure counts** - Prevent alert fatigue
4. **Monitor health regularly** - Catch issues early
5. **Set meaningful labels** - Makes metrics easier to query
6. **Use appropriate severities** - Info < Warning < Error < Critical
7. **Test alerts** - Verify webhooks work before production

## Contributing

When adding new metrics:

1. Choose appropriate metric type (Counter, Histogram, Gauge)
2. Use consistent label names
3. Add to Grafana dashboard
4. Document in this README
5. Add alert rules if needed

## License

Part of Kamiyo Exploit Intelligence Aggregator

## Support

For issues or questions:
- GitHub Issues: https://github.com/kamiyo/issues
- Documentation: https://docs.kamiyo.ai
- Email: support@kamiyo.ai
