# Kamiyo Social Media Module - Deployment Infrastructure Summary

## Overview

Production-ready deployment infrastructure has been created for the Kamiyo social media posting module. This infrastructure supports multiple deployment methods with comprehensive security, monitoring, and operational features.

## Files Created

### 1. Docker Infrastructure

#### `/deploy/Dockerfile`
- **Multi-stage build** for minimal image size
- **Security hardening**: Non-root user (kamiyo:1000), minimal base image
- **Production-ready**: Python 3.11-slim, only runtime dependencies
- **Health check**: Built-in container health monitoring
- **Size optimization**: Build dependencies in separate stage

**Key Features:**
- Base image: `python:3.11-slim`
- Non-root user: `kamiyo` (UID 1000)
- Working directory: `/app`
- Health check endpoint on port 8000
- Labels for container metadata

#### `/deploy/docker-compose.yml`
- **Complete orchestration** with environment variables
- **Resource limits**: CPU (1.0) and memory (512MB) limits
- **Health checks**: Automatic restart on failure
- **Volumes**: Persistent logs and data storage
- **Redis integration**: Optional caching layer
- **Logging**: JSON format with rotation

**Configuration Highlights:**
- Environment-based configuration
- Port mapping for health checks (8000)
- Network isolation
- Automatic restart policy

### 2. Kubernetes Manifests

#### `/deploy/kubernetes/deployment.yaml`
- **High availability**: 2 replicas with anti-affinity
- **Rolling updates**: Zero-downtime deployments
- **Resource management**: Requests and limits defined
- **Health probes**: Liveness, readiness, and startup probes
- **Security context**: Non-root, read-only root filesystem options
- **Init containers**: Wait for dependencies

**Resource Allocation:**
- Requests: 250m CPU, 256Mi memory
- Limits: 1000m CPU, 512Mi memory

**Probes:**
- Liveness: `/health/liveness` every 10s
- Readiness: `/health/readiness` every 10s
- Startup: 12 retries × 5s = 60s startup time

#### `/deploy/kubernetes/service.yaml`
- **ClusterIP service** for internal access
- **Headless service** for StatefulSet support
- **Load balancer annotations** for cloud providers

#### `/deploy/kubernetes/configmap.yaml`
- **Non-sensitive configuration** externalized
- **Feature flags**: Enable/disable platforms
- **Operational parameters**: Polling intervals, rate limits
- **Environment-specific settings**

**Key Configurations:**
- Watcher mode (poll/websocket)
- Minimum exploit amount threshold
- Enabled blockchain chains
- Platform enable flags

#### `/deploy/kubernetes/secrets.yaml`
- **Template file** with examples (DO NOT commit with real values)
- **All platform credentials**: Reddit, Discord, Telegram, X/Twitter
- **API keys**: Kamiyo API authentication
- **Monitoring credentials**: Sentry DSN

**Security Note:** Use Sealed Secrets or External Secrets Operator in production

### 3. Systemd Service

#### `/deploy/kamiyo-social.service`
- **Traditional Linux service** deployment
- **Docker Compose integration** via systemd
- **Automatic restart** on failure
- **Resource limits**: File descriptors, processes
- **Security hardening**: PrivateTmp, ProtectSystem
- **Logging**: journald integration

**Features:**
- Depends on docker.service
- Environment file support
- Graceful shutdown handling
- Start limit burst protection

### 4. Health Check Endpoint

#### `/social/health.py`
- **FastAPI application** with multiple endpoints
- **Comprehensive health checks**:
  - Kamiyo API connectivity and authentication
  - Platform authentication status (all social media)
  - Rate limiting status
  - Service uptime
- **Three endpoints**:
  - `/health` - Full health status (detailed JSON)
  - `/health/liveness` - Simple alive check (Kubernetes)
  - `/health/readiness` - Ready to serve traffic (Kubernetes)

**Health Status Response:**
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "ISO8601",
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

### 5. Deployment Scripts

#### `/scripts/deploy_social.sh`
- **Automated deployment** with validation
- **Multi-environment support**: development, staging, production
- **Two deployment types**: Docker and Kubernetes
- **Pre-flight checks**: Docker/kubectl availability
- **Health verification**: Post-deployment validation
- **Backup creation**: Before deployment
- **Color-coded output**: Better UX

**Usage:**
```bash
./scripts/deploy_social.sh [environment] [docker|kubernetes]
```

**Features:**
- Environment variable validation
- Docker image building with versioning
- Health check waiting with retries
- Automatic rollout monitoring (K8s)
- Post-deployment verification

#### `/scripts/rollback_social.sh`
- **Safe rollback** to previous versions
- **Confirmation prompt**: Prevents accidental rollbacks
- **Version listing**: Shows available versions
- **Health verification**: After rollback
- **Support for both** Docker and Kubernetes

**Usage:**
```bash
./scripts/rollback_social.sh [docker|kubernetes] [version]
```

**Features:**
- List available versions/revisions
- Rollback to previous or specific version
- Health check after rollback
- Automatic cleanup

#### `/scripts/validate_social_env.sh`
- **Comprehensive validation** of all environment variables
- **Type checking**: URLs, booleans, numbers
- **Platform-specific validation**: Only checks enabled platforms
- **Detailed reporting**: Pass/Warn/Fail counts
- **Color-coded output**: Easy to read

**Validates:**
- Required variables (Kamiyo API credentials)
- Platform-specific credentials (only if enabled)
- URL formats (API endpoints, webhooks)
- Boolean values (enable flags)
- Numeric values (intervals, limits)
- At least one platform enabled

**Output Summary:**
```
Total Checks:    45
Passed:          38
Warnings:        5
Failed:          2
```

### 6. Docker Ignore File

#### `/.dockerignore`
- **Minimizes image size** by excluding unnecessary files
- **Security**: Excludes secrets and credentials
- **Development files**: Excludes .git, .vscode, etc.
- **Build artifacts**: Excludes Python cache, logs
- **Only includes**: social/ module and requirements.txt

**Excluded:**
- Git files and CI/CD
- Documentation and README files
- Development tools (.vscode, .idea)
- Python cache and build artifacts
- Virtual environments
- Secrets and credentials
- Logs and databases
- Test files and coverage reports
- Backup files
- Other Kamiyo modules (website, backend, aggregators)

## Deployment Options

### Option 1: Docker Compose (Recommended for single server)

**Pros:**
- Simple setup and management
- Easy local development
- Quick deployment
- Built-in orchestration

**Best for:**
- Development environments
- Small-scale deployments
- Single-server production

**Commands:**
```bash
# Deploy
cd deploy
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Option 2: Kubernetes (Recommended for production)

**Pros:**
- High availability (2+ replicas)
- Automatic scaling
- Self-healing
- Rolling updates
- Advanced networking

**Best for:**
- Production environments
- Multi-server deployments
- Cloud platforms (GKE, EKS, AKS)
- Enterprise deployments

**Commands:**
```bash
# Deploy
kubectl apply -f deploy/kubernetes/

# View status
kubectl get pods -n kamiyo

# View logs
kubectl logs -f -n kamiyo deployment/kamiyo-social
```

### Option 3: Systemd (Traditional Linux service)

**Pros:**
- Native Linux integration
- System boot integration
- Service management via systemctl
- Familiar to sysadmins

**Best for:**
- Traditional server environments
- Non-containerized deployments
- Hybrid setups

**Commands:**
```bash
# Start
sudo systemctl start kamiyo-social

# Status
sudo systemctl status kamiyo-social

# Logs
sudo journalctl -u kamiyo-social -f
```

## Security Features

### 1. Non-Root Execution
- Container runs as user `kamiyo` (UID 1000)
- No root privileges inside container
- Prevents privilege escalation

### 2. Resource Limits
- CPU limits prevent resource hogging
- Memory limits prevent OOM issues
- PID limits in systemd service

### 3. Read-Only Filesystem (Optional)
- Can enable read-only root filesystem
- Write directories explicitly mounted
- Prevents container tampering

### 4. Network Security
- No exposed ports except health check
- Internal network communication
- TLS for API connections

### 5. Secrets Management
- Environment-based secrets
- Support for Kubernetes secrets
- Integration points for Sealed Secrets
- Template files prevent accidental commits

### 6. Security Contexts (Kubernetes)
- seccompProfile: RuntimeDefault
- capabilities dropped
- allowPrivilegeEscalation: false
- runAsNonRoot: true

## Monitoring and Observability

### Health Checks
- **Liveness probe**: Is the service running?
- **Readiness probe**: Can it accept traffic?
- **Startup probe**: Has it finished starting?

### Metrics
- Prometheus integration (optional)
- Custom metrics from health endpoint
- Platform-specific metrics (rate limits, post counts)

### Logging
- Structured JSON logging
- Log level configuration
- Rotation and retention
- Centralized logging support (journald, Kubernetes)

### Error Tracking
- Sentry integration (optional)
- Exception tracking
- Performance monitoring

## High Availability Features

### Kubernetes Deployment
- **Multiple replicas**: 2 by default, scalable
- **Pod anti-affinity**: Spread across nodes
- **Rolling updates**: Zero downtime
- **Automatic restart**: On failure
- **Health-based routing**: Only healthy pods receive traffic

### Docker Compose
- **Automatic restart**: `unless-stopped` policy
- **Health checks**: Automatic container restart
- **Volume persistence**: Data survives restarts

## Operational Features

### Deployment
- Automated scripts with validation
- Pre-flight checks
- Post-deployment verification
- Backup before deployment

### Rollback
- Safe rollback to previous versions
- Confirmation prompts
- Health verification after rollback
- Version history

### Validation
- Comprehensive environment variable checking
- Type validation (URL, boolean, number)
- Platform-specific validation
- Clear error messages

### Logging
- Structured JSON format
- Multiple log levels
- Persistent log storage
- Log rotation

## Quick Start Guide

### 1. Validate Environment
```bash
./scripts/validate_social_env.sh
```

### 2. Deploy (Docker)
```bash
./scripts/deploy_social.sh production docker
```

### 3. Deploy (Kubernetes)
```bash
./scripts/deploy_social.sh production kubernetes
```

### 4. Check Health
```bash
curl http://localhost:8000/health | jq '.'
```

### 5. View Logs
```bash
# Docker
docker-compose logs -f

# Kubernetes
kubectl logs -f -n kamiyo deployment/kamiyo-social
```

### 6. Rollback (if needed)
```bash
./scripts/rollback_social.sh docker
```

## Environment Variables Required

### Core (Required)
- `KAMIYO_API_URL` - Kamiyo API endpoint
- `KAMIYO_API_KEY` - API authentication key

### Platform Credentials (Required if platform enabled)
- **Reddit**: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`
- **Discord**: `DISCORD_SOCIAL_WEBHOOKS` (format: `name=url,name2=url2`)
- **Telegram**: `TELEGRAM_SOCIAL_BOT_TOKEN`, `TELEGRAM_SOCIAL_CHATS` (format: `name=id,name2=id2`)
- **X/Twitter**: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`, `X_BEARER_TOKEN`

### Optional
- `WATCHER_MODE` (default: `poll`)
- `POLL_INTERVAL_SECONDS` (default: `60`)
- `SOCIAL_MIN_AMOUNT_USD` (default: `100000`)
- `LOG_LEVEL` (default: `INFO`)

## Documentation

Full documentation available in:
- `/deploy/README.md` - Comprehensive deployment guide
- `/deploy/kubernetes/` - Kubernetes manifests with comments
- `/scripts/` - Script usage and examples

## Next Steps

1. **Review environment variables**: Ensure all required credentials are available
2. **Choose deployment method**: Docker Compose (simple) or Kubernetes (production)
3. **Run validation**: `./scripts/validate_social_env.sh`
4. **Deploy**: `./scripts/deploy_social.sh production [docker|kubernetes]`
5. **Monitor**: Check health endpoint and logs
6. **Configure monitoring**: Set up Prometheus/Sentry (optional)

## Support

For issues or questions:
- Check logs first
- Review deployment documentation
- Verify environment variables
- Contact: support@kamiyo.ai

---

**Generated:** 2024-10-14  
**Version:** 1.0.0  
**Infrastructure Type:** Production-ready deployment infrastructure
