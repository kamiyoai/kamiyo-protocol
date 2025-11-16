# Kamiyo Social Media Module - Deployment Guide

Production deployment infrastructure for the Kamiyo social media posting module.

## Table of Contents

1. [Overview](#overview)
2. [Files Structure](#files-structure)
3. [Quick Start](#quick-start)
4. [Docker Deployment](#docker-deployment)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [Systemd Service](#systemd-service)
7. [Environment Variables](#environment-variables)
8. [Health Checks](#health-checks)
9. [Monitoring](#monitoring)
10. [Rollback](#rollback)
11. [Troubleshooting](#troubleshooting)

## Overview

This deployment infrastructure provides multiple deployment options:
- **Docker Compose**: Quick local/single-server deployment
- **Kubernetes**: Production-grade orchestrated deployment
- **Systemd**: Traditional Linux service deployment

Key features:
- Multi-stage Docker builds for minimal image size
- Comprehensive health checks
- Automated rollback capabilities
- Environment validation
- Security hardening (non-root user, resource limits)
- High availability configuration (Kubernetes)

## Files Structure

```
deploy/
├── Dockerfile                      # Multi-stage production Dockerfile
├── docker-compose.yml              # Docker Compose configuration
├── kamiyo-social.service          # Systemd service file
├── kubernetes/
│   ├── deployment.yaml            # Kubernetes Deployment with probes
│   ├── service.yaml               # Kubernetes Service
│   ├── configmap.yaml             # Configuration (non-sensitive)
│   └── secrets.yaml               # Secrets template
└── README.md                       # This file

scripts/
├── deploy_social.sh               # Automated deployment script
├── rollback_social.sh             # Rollback to previous version
└── validate_social_env.sh         # Environment validation

social/
└── health.py                       # FastAPI health check endpoint
```

## Quick Start

### 1. Environment Setup

Create environment file:

```bash
# Copy example environment file
cp .env.example .env.production

# Edit with your credentials
nano .env.production
```

### 2. Validate Configuration

```bash
# Validate all required environment variables
./scripts/validate_social_env.sh
```

### 3. Deploy

```bash
# Deploy with Docker Compose (recommended for single server)
./scripts/deploy_social.sh production docker

# Or deploy to Kubernetes (recommended for production)
./scripts/deploy_social.sh production kubernetes
```

## Docker Deployment

### Build Image

```bash
cd /path/to/kamiyo
docker build -f deploy/Dockerfile -t kamiyo/social:latest .
```

### Deploy with Docker Compose

```bash
cd deploy
docker-compose up -d
```

### Check Status

```bash
# View logs
docker-compose logs -f

# Check health
curl http://localhost:8000/health

# View container status
docker-compose ps
```

### Stop Service

```bash
docker-compose down
```

## Kubernetes Deployment

### Prerequisites

- kubectl configured for your cluster
- Namespace created: `kubectl create namespace kamiyo`

### 1. Create Secrets

```bash
# Copy template and fill in values
cp deploy/kubernetes/secrets.yaml deploy/kubernetes/secrets-production.yaml
nano deploy/kubernetes/secrets-production.yaml

# Apply secrets
kubectl apply -f deploy/kubernetes/secrets-production.yaml
```

**Note**: For production, use [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) or [External Secrets Operator](https://external-secrets.io/).

### 2. Apply Configuration

```bash
cd deploy/kubernetes

# Apply ConfigMap
kubectl apply -f configmap.yaml

# Apply Service
kubectl apply -f service.yaml

# Apply Deployment
kubectl apply -f deployment.yaml
```

### 3. Verify Deployment

```bash
# Check pods
kubectl get pods -n kamiyo -l app=kamiyo-social

# Check deployment
kubectl rollout status deployment/kamiyo-social -n kamiyo

# View logs
kubectl logs -f -n kamiyo deployment/kamiyo-social

# Check health
kubectl port-forward -n kamiyo service/kamiyo-social 8000:80
curl http://localhost:8000/health
```

### 4. Scale Deployment

```bash
# Scale to 3 replicas
kubectl scale deployment/kamiyo-social -n kamiyo --replicas=3
```

## Systemd Service

For traditional Linux server deployment.

### 1. Install Service File

```bash
# Copy service file
sudo cp deploy/kamiyo-social.service /etc/systemd/system/

# Copy environment file
sudo mkdir -p /etc/kamiyo
sudo cp .env.production /etc/kamiyo/social.env
sudo chmod 600 /etc/kamiyo/social.env

# Reload systemd
sudo systemctl daemon-reload
```

### 2. Manage Service

```bash
# Start service
sudo systemctl start kamiyo-social

# Enable on boot
sudo systemctl enable kamiyo-social

# Check status
sudo systemctl status kamiyo-social

# View logs
sudo journalctl -u kamiyo-social -f

# Stop service
sudo systemctl stop kamiyo-social
```

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `KAMIYO_API_URL` | Kamiyo API base URL | `https://api.kamiyo.ai` |
| `KAMIYO_API_KEY` | API authentication key | `your-api-key` |

### Platform Configuration

#### Reddit
```bash
REDDIT_ENABLED=true
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USERNAME=your_username
REDDIT_PASSWORD=your_password
REDDIT_SUBREDDITS=defi,CryptoCurrency
```

#### Discord
```bash
DISCORD_SOCIAL_ENABLED=true
DISCORD_SOCIAL_WEBHOOKS=alerts=https://discord.com/api/webhooks/...
```

#### Telegram
```bash
TELEGRAM_SOCIAL_ENABLED=true
TELEGRAM_SOCIAL_BOT_TOKEN=your_bot_token
TELEGRAM_SOCIAL_CHATS=alerts=your_chat_id
```

#### X/Twitter
```bash
X_TWITTER_ENABLED=true
X_API_KEY=your_api_key
X_API_SECRET=your_api_secret
X_ACCESS_TOKEN=your_access_token
X_ACCESS_SECRET=your_access_secret
X_BEARER_TOKEN=your_bearer_token
```

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WATCHER_MODE` | `poll` | Mode: `poll` or `websocket` |
| `POLL_INTERVAL_SECONDS` | `60` | Polling interval |
| `SOCIAL_MIN_AMOUNT_USD` | `100000` | Minimum exploit amount to post |
| `LOG_LEVEL` | `INFO` | Logging level |
| `HEALTH_CHECK_PORT` | `8000` | Health check endpoint port |

## Health Checks

### Endpoints

- **`/health`**: Comprehensive health check with platform status
- **`/health/liveness`**: Simple liveness probe (Kubernetes)
- **`/health/readiness`**: Readiness probe (Kubernetes)

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2024-10-14T10:30:00Z",
  "version": "1.0.0",
  "kamiyo_api": {
    "status": "healthy",
    "reachable": true,
    "authenticated": true,
    "response_time_ms": 150
  },
  "platforms": {
    "discord": {
      "enabled": true,
      "authenticated": true,
      "can_post": true,
      "rate_limit": "2/10 posts/hour",
      "status": "healthy"
    }
  },
  "uptime_seconds": 3600
}
```

### Testing Health Checks

```bash
# Full health check
curl http://localhost:8000/health | jq '.'

# Liveness
curl http://localhost:8000/health/liveness

# Readiness
curl http://localhost:8000/health/readiness
```

## Monitoring

### Prometheus Metrics

Enable Prometheus metrics:

```bash
PROMETHEUS_ENABLED=true
```

Metrics available at `/metrics` endpoint.

### Sentry Error Tracking

Configure Sentry DSN:

```bash
SENTRY_DSN=your_sentry_dsn
```

### Logging

Structured JSON logging is enabled by default. View logs:

```bash
# Docker
docker-compose logs -f

# Kubernetes
kubectl logs -f -n kamiyo deployment/kamiyo-social

# Systemd
sudo journalctl -u kamiyo-social -f
```

## Rollback

### Docker Rollback

```bash
# Rollback to previous version
./scripts/rollback_social.sh docker

# Rollback to specific version
./scripts/rollback_social.sh docker v1.2.3
```

### Kubernetes Rollback

```bash
# Rollback to previous revision
./scripts/rollback_social.sh kubernetes

# Rollback to specific revision
kubectl rollout undo deployment/kamiyo-social -n kamiyo --to-revision=2

# View rollout history
kubectl rollout history deployment/kamiyo-social -n kamiyo
```

## Troubleshooting

### Service Won't Start

1. Check environment variables:
   ```bash
   ./scripts/validate_social_env.sh
   ```

2. Check logs:
   ```bash
   docker-compose logs
   # or
   kubectl logs -n kamiyo deployment/kamiyo-social
   ```

3. Verify health endpoint:
   ```bash
   curl http://localhost:8000/health
   ```

### Platform Authentication Failures

Check platform status in health endpoint:

```bash
curl http://localhost:8000/health | jq '.platforms'
```

Verify credentials are correct in environment file.

### High Memory Usage

Adjust resource limits in:
- Docker: `docker-compose.yml` -> `deploy.resources`
- Kubernetes: `deployment.yaml` -> `resources.limits`

### Connection Issues

1. Check Kamiyo API connectivity:
   ```bash
   curl -H "Authorization: Bearer YOUR_API_KEY" https://api.kamiyo.ai/exploits
   ```

2. Verify firewall rules allow outbound connections

3. Check DNS resolution

### Rate Limiting

Adjust rate limits in ConfigMap:

```yaml
RATE_LIMIT_POSTS_PER_HOUR: "10"
```

## Security Best Practices

1. **Never commit secrets to git**
   - Use `.env` files (gitignored)
   - Use Kubernetes secrets or external secret managers

2. **Use non-root user**
   - Dockerfile runs as `kamiyo` user (UID 1000)

3. **Limit resource usage**
   - CPU and memory limits configured
   - Prevents resource exhaustion

4. **Enable TLS**
   - Use HTTPS for API connections
   - Secure webhook URLs

5. **Regular updates**
   - Update base images regularly
   - Monitor security advisories

6. **Access control**
   - Restrict health endpoint access if needed
   - Use Kubernetes RBAC

## Support

For issues or questions:
- Check logs first
- Review this documentation
- Contact: support@kamiyo.ai
- Documentation: https://docs.kamiyo.ai

## License

Copyright (c) 2024 Kamiyo. All rights reserved.
