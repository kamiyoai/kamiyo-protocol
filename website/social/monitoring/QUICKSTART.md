# Quick Start Guide - Social Media Monitoring

Get monitoring up and running in 5 minutes.

## Prerequisites

```bash
# Install dependencies
pip install prometheus_client structlog psutil
# Or use requirements.txt
pip install -r requirements.txt
```

## Step 1: Test the Monitoring System (2 minutes)

```bash
# Navigate to project root
cd ~/project/Projekter/kamiyo

# Run example script to see monitoring in action
python3 social/monitoring/example_usage.py
```

You should see:
- ✅ Structured logs (JSON format)
- ✅ Metrics being tracked
- ✅ Health checks running
- ✅ Alert examples

## Step 2: Add to Your Application (3 minutes)

### A. Initialize Logging

Add to your application startup (e.g., `poster.py` or `kamiyo_watcher.py`):

```python
from social.monitoring import configure_logging

# At the top of your main() or __init__()
configure_logging(
    log_level="INFO",
    log_file="/var/log/kamiyo/social_media.log",  # Optional
    json_format=True  # Use True for production, False for dev
)
```

### B. Add Endpoints

If using FastAPI:

```python
from fastapi import FastAPI
from fastapi.responses import Response, JSONResponse
from social.monitoring import metrics, check_health

app = FastAPI()

@app.get("/metrics")
def prometheus_metrics():
    """Prometheus metrics endpoint"""
    return Response(
        content=metrics.get_metrics(),
        media_type=metrics.get_content_type()
    )

@app.get("/health")
def health_check():
    """Health check endpoint"""
    result = check_health(
        platforms={'reddit': reddit_poster, 'discord': discord_poster},
        kamiyo_api_url="https://api.kamiyo.ai"
    )
    status_code = 200 if result['status'] == 'healthy' else 503
    return JSONResponse(content=result, status_code=status_code)
```

If using Flask:

```python
from flask import Flask, Response
from social.monitoring import metrics, check_health

app = Flask(__name__)

@app.route("/metrics")
def prometheus_metrics():
    return Response(metrics.get_metrics(), mimetype=metrics.get_content_type())

@app.route("/health")
def health_check():
    result = check_health(platforms={'reddit': reddit_poster})
    return result
```

### C. Integrate into Platform Posters

Minimal integration in your `post()` method:

```python
from social.monitoring import track_post, social_logger

def post(self, content, **kwargs):
    exploit_tx_hash = kwargs.get('exploit_tx_hash', 'unknown')

    try:
        # Your existing post logic
        result = self._do_post(content)

        # Track success
        track_post('reddit', 'success')
        social_logger.log_post_success(
            platform='reddit',
            exploit_tx_hash=exploit_tx_hash,
            post_id=result['post_id']
        )

        return result

    except Exception as e:
        # Track failure
        track_post('reddit', 'failed')
        social_logger.log_post_failure(
            platform='reddit',
            exploit_tx_hash=exploit_tx_hash,
            error=str(e)
        )
        raise
```

For full integration example, see: `social/platforms/reddit_monitored.py`

## Step 3: Verify It Works

```bash
# Start your application
python3 your_app.py

# In another terminal, check metrics
curl http://localhost:8000/metrics

# Check health
curl http://localhost:8000/health | jq

# You should see metrics like:
# social_posts_total{platform="reddit",status="success"} 5
# social_platform_authenticated{platform="reddit"} 1
# ...and health status
```

## Step 4: Optional - Set Up Alerting

Set environment variables for alerts:

```bash
export SLACK_ALERT_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK"
export DISCORD_ALERT_WEBHOOK="https://discord.com/api/webhooks/YOUR/WEBHOOK"
```

Test alerting:

```python
from social.monitoring import alert_manager, Alert, AlertSeverity

alert = Alert(
    title="Test Alert",
    message="Testing alert system",
    severity=AlertSeverity.INFO
)

alert_manager.send_alert(alert)
# Check Slack/Discord for alert
```

## Step 5: Optional - Set Up Prometheus + Grafana

### Start Prometheus:

```bash
cd ~/project/Projekter/kamiyo
prometheus --config.file=monitoring/prometheus.yml
# Access at http://localhost:9090
```

### Start Grafana:

```bash
docker run -d -p 3000:3000 grafana/grafana
# Access at http://localhost:3000 (login: admin/admin)
```

### Import Dashboard:

1. Go to http://localhost:3000
2. Add Prometheus data source (URL: http://localhost:9090)
3. Import dashboard from `monitoring/dashboards/social-media-dashboard.json`

## Common Issues

### Issue: "ModuleNotFoundError: No module named 'structlog'"

**Solution:**
```bash
pip install structlog psutil
```

### Issue: Metrics endpoint returns 404

**Solution:** Make sure you added the `/metrics` endpoint to your app (see Step 2B)

### Issue: Health checks show "unhealthy"

**Solution:** Check platform credentials and API connectivity
```bash
curl https://api.kamiyo.ai/health  # Verify API is reachable
```

### Issue: Alerts not sending

**Solution:**
1. Verify webhook URLs are set: `echo $SLACK_ALERT_WEBHOOK`
2. Test webhook manually: `curl -X POST $SLACK_ALERT_WEBHOOK -d '{"text":"test"}'`
3. Check webhook permissions

## What to Monitor

### Key Metrics to Watch:

1. **Success Rate**: Should be >95%
   ```promql
   sum(rate(social_posts_total{status="success"}[5m])) / sum(rate(social_posts_total[5m])) * 100
   ```

2. **API Latency**: p95 should be <5 seconds
   ```promql
   histogram_quantile(0.95, rate(social_post_api_duration_seconds_bucket[5m]))
   ```

3. **Error Rate**: Should be <5%
   ```promql
   sum(rate(social_api_errors_total[5m]))
   ```

4. **Authentication Status**: Should always be 1
   ```promql
   social_platform_authenticated
   ```

5. **Rate Limit**: Should be >10
   ```promql
   social_rate_limit_remaining
   ```

## Next Steps

1. ✅ **You're monitoring!** - Metrics and logs are being collected
2. 📊 **Explore Grafana** - View dashboards and create custom views
3. 🔔 **Configure Alerts** - Set up Slack/Discord/PagerDuty webhooks
4. 📚 **Read Full Docs** - See `README.md` and `INTEGRATION_GUIDE.md`
5. 🎯 **Optimize** - Fine-tune thresholds and add custom metrics

## Resources

- **Full Documentation**: `social/monitoring/README.md`
- **Integration Guide**: `social/monitoring/INTEGRATION_GUIDE.md`
- **Implementation Details**: `social/monitoring/IMPLEMENTATION_SUMMARY.md`
- **Example Code**: `social/monitoring/example_usage.py`
- **Monitored Platform Example**: `social/platforms/reddit_monitored.py`

## Support

Need help? Check:
1. Run example: `python3 social/monitoring/example_usage.py`
2. Check logs for errors
3. Verify endpoints are accessible
4. Review documentation

## Monitoring Checklist

- [ ] Dependencies installed (`pip install structlog psutil`)
- [ ] Logging configured in application
- [ ] `/metrics` endpoint added
- [ ] `/health` endpoint added
- [ ] Platform posters integrated
- [ ] Tested metrics endpoint (`curl http://localhost:8000/metrics`)
- [ ] Tested health endpoint (`curl http://localhost:8000/health`)
- [ ] Prometheus running (optional)
- [ ] Grafana dashboard imported (optional)
- [ ] Alert webhooks configured (optional)

---

**Congratulations!** 🎉 You now have comprehensive monitoring for your social media posting system.

Start with the basics (Steps 1-3), then add Prometheus/Grafana and alerting as needed.
