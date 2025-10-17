# Social Media Monitoring Integration Guide

This guide shows how to integrate the monitoring system into your social media posting code.

## Quick Start

### 1. Configure Logging

In your application startup:

```python
from social.monitoring import configure_logging

# Configure structured logging
configure_logging(
    log_level="INFO",
    log_file="/var/log/kamiyo/social_media.log",
    json_format=True  # Use JSON for production
)
```

### 2. Integrate Metrics in Platform Posters

Update your platform posters to emit metrics. Here's an example for Reddit:

```python
# In social/platforms/reddit.py
import time
from social.monitoring import (
    metrics,
    track_post,
    track_api_call,
    track_api_error,
    set_platform_authentication,
    social_logger
)

class RedditPoster(BasePlatformPoster):

    def authenticate(self) -> bool:
        """Authenticate with Reddit API"""
        start_time = time.time()
        try:
            self.reddit = praw.Reddit(
                client_id=self.client_id,
                client_secret=self.client_secret,
                user_agent=self.user_agent,
                username=self.username,
                password=self.password
            )

            # Test authentication
            self.reddit.user.me()
            self._authenticated = True

            # Update metrics
            set_platform_authentication('reddit', True)

            # Log success
            social_logger.log_authentication(
                platform='reddit',
                success=True,
                duration_seconds=time.time() - start_time
            )

            return True

        except Exception as e:
            self._authenticated = False

            # Update metrics
            set_platform_authentication('reddit', False)
            track_api_error('reddit', 'auth_failed')

            # Log failure
            social_logger.log_authentication(
                platform='reddit',
                success=False,
                error=str(e),
                duration_seconds=time.time() - start_time
            )

            return False

    def post(self, content: str, **kwargs) -> Dict:
        """Post to Reddit with monitoring"""
        exploit_tx_hash = kwargs.get('exploit_tx_hash', 'unknown')

        # Log attempt
        social_logger.log_post_attempt(
            platform='reddit',
            exploit_tx_hash=exploit_tx_hash
        )

        start_time = time.time()

        try:
            # Track API call duration
            with track_api_call('reddit'):
                # ... existing post logic ...
                submission = subreddit.submit(title=title, selftext=content)

            duration = time.time() - start_time

            # Track success
            track_post('reddit', 'success')

            # Log success
            social_logger.log_post_success(
                platform='reddit',
                exploit_tx_hash=exploit_tx_hash,
                post_id=submission.id,
                post_url=f"https://reddit.com{submission.permalink}",
                duration_seconds=duration
            )

            return {
                'success': True,
                'post_id': submission.id,
                'url': f"https://reddit.com{submission.permalink}"
            }

        except RedditAPIException as e:
            duration = time.time() - start_time

            # Determine error type
            error_type = 'api_error'
            if 'RATELIMIT' in str(e):
                error_type = 'rate_limit'

            # Track failure
            track_post('reddit', 'failed')
            track_api_error('reddit', error_type)

            # Log failure
            social_logger.log_post_failure(
                platform='reddit',
                exploit_tx_hash=exploit_tx_hash,
                error=str(e),
                error_type=error_type
            )

            return {'success': False, 'error': str(e)}
```

### 3. Add Health Checks

Create a health check endpoint:

```python
# In your FastAPI app
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from social.monitoring import check_health

app = FastAPI()

@app.get("/health")
async def health_check():
    """Comprehensive health check"""
    platforms = {
        'reddit': reddit_poster,
        'discord': discord_poster,
        'telegram': telegram_poster,
        'twitter': twitter_poster
    }

    health_result = check_health(
        platforms=platforms,
        kamiyo_api_url="https://api.kamiyo.ai"
    )

    status_code = 200 if health_result['status'] == 'healthy' else 503
    return JSONResponse(content=health_result, status_code=status_code)
```

### 4. Add Metrics Endpoint

Expose Prometheus metrics:

```python
from fastapi.responses import Response
from social.monitoring import metrics

@app.get("/metrics")
async def prometheus_metrics():
    """Prometheus metrics endpoint"""
    return Response(
        content=metrics.get_metrics(),
        media_type=metrics.get_content_type()
    )
```

### 5. Configure Alerting

Set up alert manager in your application:

```python
from social.monitoring import AlertManager, AlertSeverity

# Initialize with webhooks
alert_manager = AlertManager(
    slack_webhook=os.getenv('SLACK_ALERT_WEBHOOK'),
    discord_webhook=os.getenv('DISCORD_ALERT_WEBHOOK'),
    pagerduty_routing_key=os.getenv('PAGERDUTY_ROUTING_KEY')
)

# Track failures and auto-alert
def post_with_failure_tracking(poster, content, **kwargs):
    result = poster.post(content, **kwargs)

    if result['success']:
        # Reset failure count on success
        alert_manager.reset_failure_count(f"{poster.platform}_post")
    else:
        # Track failure - will alert after threshold
        alert_manager.track_failure(
            f"{poster.platform}_post",
            details={
                'platform': poster.platform,
                'error': result.get('error'),
                'exploit_tx': kwargs.get('exploit_tx_hash')
            }
        )

    return result
```

## Environment Variables

Set these environment variables for alerting:

```bash
# Slack alerting
export SLACK_ALERT_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

# Discord alerting
export DISCORD_ALERT_WEBHOOK="https://discord.com/api/webhooks/YOUR/WEBHOOK/URL"

# PagerDuty alerting
export PAGERDUTY_API_KEY="your-api-key"
export PAGERDUTY_ROUTING_KEY="your-routing-key"

# Kamiyo API
export KAMIYO_API_URL="https://api.kamiyo.ai"
```

## Running Prometheus

1. Update `monitoring/prometheus.yml` with your app's host/port
2. Start Prometheus:

```bash
prometheus --config.file=monitoring/prometheus.yml
```

3. Access Prometheus at: http://localhost:9090

## Setting Up Grafana

1. Start Grafana:

```bash
docker run -d -p 3000:3000 grafana/grafana
```

2. Access Grafana at: http://localhost:3000 (admin/admin)

3. Add Prometheus data source:
   - URL: http://localhost:9090
   - Access: Server (default)

4. Import dashboard:
   - Go to Dashboards → Import
   - Upload `monitoring/dashboards/social-media-dashboard.json`

## Metrics Available

### Counters
- `social_posts_total{platform, status}` - Total posts by platform and status
- `social_api_errors_total{platform, error_type}` - API errors by platform and type
- `social_retries_total{platform}` - Retry attempts by platform
- `social_validation_failures_total{platform, reason}` - Validation failures

### Histograms
- `social_post_generation_duration_seconds{platform}` - Post generation time
- `social_post_api_duration_seconds{platform}` - API call duration
- `social_queue_processing_duration_seconds` - Queue processing time

### Gauges
- `social_platform_authenticated{platform}` - Authentication status (1=yes, 0=no)
- `social_rate_limit_remaining{platform}` - Remaining API calls
- `social_posts_in_queue{status}` - Posts waiting in queue

## Log Fields

Structured logs include:

- `timestamp` - ISO 8601 timestamp
- `level` - Log level (info, warning, error, critical)
- `event` - Event type (post_success, post_failure, authentication_failure, etc.)
- `platform` - Social media platform
- `exploit_tx_hash` - Transaction hash of exploit
- `post_id` - Platform-specific post ID
- `duration_seconds` - Operation duration
- `error` - Error message (if applicable)

## Example Queries

### Prometheus Queries

```promql
# Success rate by platform
sum(rate(social_posts_total{status="success"}[5m])) by (platform)
/ sum(rate(social_posts_total[5m])) by (platform) * 100

# 95th percentile API latency
histogram_quantile(0.95,
  rate(social_post_api_duration_seconds_bucket[5m])
)

# Error rate
sum(rate(social_api_errors_total[5m])) by (platform, error_type)

# Queue backlog
social_posts_in_queue{status="pending"}
```

### Log Queries (for log aggregation systems)

```json
# All post failures
{"event": "post_failure"}

# Rate limit errors
{"event": "post_failure", "error_type": "rate_limit"}

# Slow posts (>5 seconds)
{"event": "post_success", "duration_seconds": {"$gte": 5}}
```

## Best Practices

1. **Always log exploit_tx_hash** - Links posts to specific exploits
2. **Track both success and failure** - Important for calculating rates
3. **Use structured logging** - Makes log aggregation easier
4. **Set meaningful error types** - Helps categorize issues
5. **Reset failure counts on success** - Prevents false alerts
6. **Monitor health checks** - Catches issues before they impact users
7. **Set up alerts** - Be notified of issues immediately
8. **Use context managers** - Automatically track durations

## Troubleshooting

### Metrics not appearing in Prometheus

1. Check metrics endpoint is accessible: `curl http://localhost:8000/metrics`
2. Verify Prometheus is scraping: Check Targets in Prometheus UI
3. Check firewall rules

### Logs not structured

1. Verify `json_format=True` in `configure_logging()`
2. Check log output format
3. Ensure structlog is installed: `pip install structlog`

### Alerts not sending

1. Verify webhook URLs are set in environment variables
2. Test webhooks manually: `curl -X POST $SLACK_ALERT_WEBHOOK -d '{"text":"test"}'`
3. Check alert manager logs for errors
4. Verify alert threshold is being reached

## Next Steps

1. Set up log aggregation (ELK, Loki, CloudWatch Logs)
2. Configure alert routing rules
3. Create runbooks for common alerts
4. Set up dashboards for different teams
5. Implement SLOs (Service Level Objectives)
