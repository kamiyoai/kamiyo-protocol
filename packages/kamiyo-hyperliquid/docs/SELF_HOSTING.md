# Self-Hosting Guide
## Deploy Hyperliquid Monitor on Your Infrastructure

This guide covers self-hosting the open source Hyperliquid Security Monitor.

---

## Prerequisites

### Hardware Requirements
- **CPU:** 2+ cores
- **RAM:** 4GB minimum, 8GB recommended
- **Storage:** 20GB+ (database grows over time)
- **Network:** Stable internet connection

### Software Requirements
- **Docker:** 20.10+
- **Docker Compose:** 2.0+
- **Git:** Any recent version
- **Optional:** PostgreSQL 15+ (if not using Docker)

---

## Installation Methods

### Method 1: Docker Compose (Recommended)

**Quick start for most users:**

```bash
# 1. Clone repository
git clone https://github.com/kamiyo-ai/kamiyo-hyperliquid.git
cd kamiyo-hyperliquid

# 2. Copy environment template
cp .env.example .env

# 3. Edit configuration
nano .env  # or your preferred editor

# 4. Start all services
docker-compose up -d

# 5. Check logs
docker-compose logs -f api

# 6. Verify health
curl http://localhost:8000/health
```

**Services started:**
- API server (port 8000)
- PostgreSQL database (port 5432)
- Redis cache (port 6379)
- WebSocket monitor (background)
- Scheduler (background)

---

### Method 2: Manual Installation

**For advanced users who want more control:**

```bash
# 1. Clone repository
git clone https://github.com/kamiyo-ai/kamiyo-hyperliquid.git
cd kamiyo-hyperliquid

# 2. Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # On Windows: venv\\Scripts\\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set up PostgreSQL
# Create database: kamiyo_hyperliquid
# Run schema: psql -d kamiyo_hyperliquid -f database/schema.sql

# 5. Configure environment
cp .env.example .env
# Edit DATABASE_URL, REDIS_URL, etc.

# 6. Start services
# Terminal 1: API server
python api/main.py

# Terminal 2: WebSocket monitor
python websocket/runner.py

# Terminal 3: Scheduler
python monitors/scheduler.py
```

---

## Configuration

### Essential Settings

Edit `.env` and configure these required variables:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/kamiyo_hyperliquid

# API Server
API_HOST=0.0.0.0
API_PORT=8000

# Redis (optional but recommended)
REDIS_URL=redis://localhost:6379/0

# Monitoring Thresholds
HLP_CRITICAL_LOSS_24H=2000000  # $2M loss triggers critical alert
ORACLE_CRITICAL_DEVIATION_PCT=1.0  # 1% deviation triggers alert
```

### Alert Configuration

Configure at least one alert channel:

**Discord:**
```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK
DISCORD_ALERTS_ENABLED=true
```

**Telegram:**
```bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
TELEGRAM_ALERTS_ENABLED=true
```

**Slack:**
```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR_WEBHOOK
SLACK_ALERTS_ENABLED=true
```

**Email (SendGrid):**
```bash
SENDGRID_API_KEY=your_api_key
ALERT_EMAIL_FROM=alerts@yourdomain.com
ALERT_EMAIL_TO=you@yourdomain.com
EMAIL_ALERTS_ENABLED=true
```

**[Full configuration reference →](CONFIGURATION.md)**

---

## Accessing the API

### API Documentation

Once running, access interactive API documentation:

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

### Key Endpoints

```bash
# Health check
curl http://localhost:8000/health

# Recent exploits
curl http://localhost:8000/exploits?hours=24

# Security dashboard
curl http://localhost:8000/security/dashboard

# HLP vault health
curl http://localhost:8000/security/hlp-vault

# Oracle deviations
curl http://localhost:8000/security/oracle-deviations
```

---

## Monitoring & Maintenance

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f websocket
```

### Database Backups

```bash
# Backup database
docker-compose exec postgres pg_dump -U kamiyo kamiyo_hyperliquid > backup_$(date +%Y%m%d).sql

# Restore database
docker-compose exec -T postgres psql -U kamiyo kamiyo_hyperliquid < backup_20250104.sql
```

### Update to Latest Version

```bash
# Pull latest code
git pull origin main

# Rebuild containers
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Verify health
curl http://localhost:8000/health
```

---

## Production Deployment

### System Requirements

**Minimum (100-1k requests/day):**
- 2 vCPU
- 4GB RAM
- 20GB SSD
- 100Mbps network

**Recommended (10k+ requests/day):**
- 4 vCPU
- 8GB RAM
- 100GB SSD
- 1Gbps network

### Security Hardening

```bash
# 1. Use secrets management (not .env file)
# Store sensitive credentials in:
# - AWS Secrets Manager
# - HashiCorp Vault
# - Kubernetes Secrets

# 2. Enable SSL/TLS
# Use nginx or Caddy as reverse proxy:
server {
    listen 443 ssl http2;
    server_name monitor.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/monitor.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monitor.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# 3. Firewall configuration
# Allow only necessary ports:
ufw allow 443/tcp   # HTTPS
ufw allow 22/tcp    # SSH (restrict to your IP)
ufw deny 8000/tcp   # Block direct API access
ufw enable

# 4. Set up monitoring
# Use Prometheus + Grafana for observability
# Metrics endpoint: http://localhost:8000/metrics
```

### Docker Production Configuration

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  api:
    image: kamiyo-hyperliquid:latest
    restart: always
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - LOG_LEVEL=INFO
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G

  postgres:
    image: postgres:15-alpine
    restart: always
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=kamiyo_hyperliquid
    command:
      - "postgres"
      - "-c"
      - "max_connections=200"
      - "-c"
      - "shared_buffers=256MB"

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru

volumes:
  postgres_data:
```

---

## Troubleshooting

### Common Issues

**Issue: Container won't start**
```bash
# Check logs
docker-compose logs api

# Common causes:
# 1. Port already in use
sudo lsof -i :8000  # Find process using port 8000

# 2. Database connection failed
# Verify DATABASE_URL in .env

# 3. Missing environment variables
docker-compose config  # Validate docker-compose.yml
```

**Issue: API returns 503 Service Unavailable**
```bash
# Check if database is ready
docker-compose exec postgres pg_isready

# Restart services
docker-compose restart api
```

**Issue: No alerts being sent**
```bash
# Verify alert configuration
curl http://localhost:8000/health/alerts

# Test Discord webhook manually
curl -X POST "${DISCORD_WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test alert from kamiyo-hyperliquid"}'

# Check API logs for alert errors
docker-compose logs api | grep -i alert
```

**Issue: High memory usage**
```bash
# Check container stats
docker stats

# Reduce ML model memory:
# In .env, set:
ML_ENABLED=false  # Disable ML models temporarily

# Clear Redis cache
docker-compose exec redis redis-cli FLUSHALL
```

**Issue: Database growing too large**
```bash
# Check database size
docker-compose exec postgres psql -U kamiyo -d kamiyo_hyperliquid -c "SELECT pg_size_pretty(pg_database_size('kamiyo_hyperliquid'));"

# Archive old events (older than 90 days)
docker-compose exec postgres psql -U kamiyo -d kamiyo_hyperliquid -c "DELETE FROM security_events WHERE timestamp < NOW() - INTERVAL '90 days';"

# Vacuum database
docker-compose exec postgres psql -U kamiyo -d kamiyo_hyperliquid -c "VACUUM FULL;"
```

---

## Performance Optimization

### Database Tuning

```sql
-- Add indexes for common queries
CREATE INDEX CONCURRENTLY idx_events_timestamp ON security_events(timestamp DESC);
CREATE INDEX CONCURRENTLY idx_events_severity ON security_events(severity);
CREATE INDEX CONCURRENTLY idx_hlp_metrics_timestamp ON hlp_vault_metrics(timestamp DESC);

-- Analyze tables
ANALYZE security_events;
ANALYZE hlp_vault_metrics;
ANALYZE oracle_deviations;
```

### API Caching

```python
# Enable Redis caching in .env
REDIS_ENABLED=true
CACHE_TTL_SECONDS=60  # Cache responses for 60 seconds
```

### Rate Limiting

```bash
# Configure rate limits to prevent abuse
RATE_LIMIT_PER_MINUTE=100  # 100 requests per minute per IP
```

---

## Monitoring Your Monitor

### Health Checks

```bash
# API health endpoint
curl http://localhost:8000/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-03-15T10:30:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "hyperliquid_api": "reachable",
    "websocket": "running"
  }
}
```

### Prometheus Metrics

```bash
# Scrape metrics endpoint
curl http://localhost:8000/metrics

# Key metrics to monitor:
# - http_requests_total
# - http_request_duration_seconds
# - hlp_vault_account_value
# - security_events_total
# - alert_send_failures_total
```

### Uptime Monitoring

Set up external monitoring with:
- **UptimeRobot** (free tier available)
- **Pingdom**
- **StatusCake**

Monitor these endpoints:
- `http://your-domain.com/health` (every 5 minutes)
- Alert if down for >10 minutes

---

## Scaling

### Horizontal Scaling

For high-traffic deployments:

```yaml
# docker-compose.scale.yml
services:
  api:
    deploy:
      replicas: 3

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    ports:
      - "80:80"
    depends_on:
      - api
```

**nginx.conf:**
```nginx
upstream api_backend {
    least_conn;
    server api_1:8000;
    server api_2:8000;
    server api_3:8000;
}

server {
    listen 80;
    location / {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
    }
}
```

### Database Replication

For read-heavy workloads:

```yaml
services:
  postgres_primary:
    image: postgres:15-alpine
    environment:
      - POSTGRES_REPLICATION_MODE=master

  postgres_replica:
    image: postgres:15-alpine
    environment:
      - POSTGRES_REPLICATION_MODE=slave
      - POSTGRES_MASTER_HOST=postgres_primary
```

---

## Migration to kamiyo.ai Cloud

**When to consider migrating:**
- Traffic exceeds 100k requests/day
- Need multi-protocol monitoring (beyond Hyperliquid)
- Require enterprise features (SSO, RBAC, SLA)
- Want to eliminate DevOps overhead

**Migration process:**
1. Export your data: `pg_dump kamiyo_hyperliquid > export.sql`
2. Sign up: https://kamiyo.ai/signup
3. Contact support@kamiyo.ai for data import assistance
4. Configure alert channels in kamiyo.ai dashboard
5. Update webhook URLs to point to kamiyo.ai
6. Monitor both systems in parallel for 1 week
7. Decommission self-hosted instance

**Your data remains yours** - we provide export tools anytime.

---

## Community Support

**Need help?**
- **GitHub Issues**: https://github.com/kamiyo-ai/kamiyo-hyperliquid/issues
- **GitHub Discussions**: https://github.com/kamiyo-ai/kamiyo-hyperliquid/discussions
- **Discord**: https://github.com/mizuki-tamaki/kamiyo-hyperliquid/discussions
- **Documentation**: https://docs.kamiyo.ai

**Commercial support available** for production deployments: support@kamiyo.ai

---

## License Compliance

This is open source (AGPL-3.0) software. **You must:**

✅ Keep this notice in all copies
✅ Share modifications (if distributed)
✅ Disclose source code (if running as a service)

**Commercial license required for:**
- SaaS/hosted services (>$1M revenue)
- Proprietary forks
- White-label products

Contact licensing@kamiyo.ai for commercial options.

---

**Built with ❤️ by the kamiyo.ai team**

[Back to Main README](../README.md) • [Configuration Guide](CONFIGURATION.md) • [API Reference](API.md)
