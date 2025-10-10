# Kamiyo Production Deployment Guide

## Overview

This guide covers the complete CI/CD pipeline and deployment process for Kamiyo using GitHub Actions with blue-green deployment strategy.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [GitHub Secrets Setup](#github-secrets-setup)
3. [CI/CD Pipeline](#cicd-pipeline)
4. [Blue-Green Deployment](#blue-green-deployment)
5. [Rollback Process](#rollback-process)
6. [Monitoring](#monitoring)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

### Server Requirements

- Ubuntu 20.04+ or similar Linux distribution
- Docker 20.10+
- Docker Compose 2.0+
- Nginx
- 4GB RAM minimum
- 50GB storage minimum

### GitHub Repository Secrets

Configure the following secrets in your GitHub repository:
Settings → Secrets and variables → Actions → New repository secret

## GitHub Secrets Setup

### Required Secrets

```bash
# SSH Access
SSH_PRIVATE_KEY         # Private key for SSH access to production server
SSH_USER               # Username for SSH access (e.g., 'ubuntu')
SERVER_HOST            # Production server IP or hostname

# Notifications
DISCORD_WEBHOOK_URL    # Discord webhook for deployment notifications

# Optional: Container Registry
GHCR_TOKEN            # GitHub Container Registry token (uses GITHUB_TOKEN by default)
```

### Generating SSH Key

```bash
# On your local machine
ssh-keygen -t ed25519 -C "github-actions-kamiyo" -f ~/.ssh/kamiyo_deploy

# Copy public key to server
ssh-copy-id -i ~/.ssh/kamiyo_deploy.pub $SSH_USER@$SERVER_HOST

# Add private key to GitHub secrets
cat ~/.ssh/kamiyo_deploy
# Copy the entire output to SSH_PRIVATE_KEY secret
```

### Setting Up Discord Webhook

1. Go to your Discord server settings
2. Integrations → Webhooks → New Webhook
3. Name it "Kamiyo Deployments"
4. Copy webhook URL
5. Add to GitHub secret: DISCORD_WEBHOOK_URL

## CI/CD Pipeline

### Workflow: Test (`.github/workflows/test.yml`)

**Triggers:**
- Pull requests to `main` or `develop`
- Pushes to `develop`

**Jobs:**

1. **Lint (Code Quality)**
   - flake8: Critical errors only
   - black: Code formatting check
   - mypy: Type checking (continue on error)

2. **Unit Tests**
   - Services: PostgreSQL 15, Redis 7
   - Coverage report with codecov
   - Pytest with async support

3. **Integration Tests**
   - Full Docker Compose stack
   - End-to-end testing

4. **Security Scan**
   - Trivy: Vulnerability scanner
   - Trufflehog: Secret detection

5. **Build Check**
   - API image build verification
   - Aggregator image build verification

6. **Summary**
   - Aggregates all job results
   - Fails if any critical job fails

### Workflow: Deploy (`.github/workflows/deploy.yml`)

**Triggers:**
- Push to `main` branch (automatic)
- Manual workflow dispatch (choose environment)

**Jobs:**

1. **Build and Push**
   - Builds multi-stage Docker images
   - Pushes to GitHub Container Registry
   - Uses layer caching for speed
   - Tags: branch name, SHA, semver

2. **Deploy Blue-Green**
   - Copies deployment files to server
   - Determines current active environment
   - Deploys to inactive environment
   - Runs health checks (10 retries, 10s interval)
   - Updates nginx to point to new environment
   - Drains traffic from old environment
   - Stops old environment
   - Runs smoke tests
   - Verifies monitoring stack
   - Sends Discord notification

3. **Rollback (on failure)**
   - Automatically triggers on deployment failure
   - Restarts previous environment
   - Updates nginx to previous environment
   - Stops failed environment
   - Sends rollback notification

## Blue-Green Deployment

### How It Works

```
┌─────────────────────────────────────────────────┐
│                    Nginx                         │
│              (Reverse Proxy)                     │
└────────────┬────────────────────────┬────────────┘
             │                        │
             │                        │
    ┌────────▼────────┐      ┌────────▼────────┐
    │  Blue Environment│      │ Green Environment│
    │   (Active)       │      │   (Inactive)     │
    │                 │      │                 │
    │  - API          │      │  - API          │
    │  - Aggregator   │      │  - Aggregator   │
    │  - Workers      │      │  - Workers      │
    └─────────────────┘      └─────────────────┘
```

### Deployment Flow

1. **Identify Active Environment**
   ```bash
   CURRENT_ENV=$(docker ps --filter "name=kamiyo-api" --format "{{.Names}}" | grep -o "blue\|green")
   ```

2. **Deploy to Inactive Environment**
   ```bash
   NEW_ENV="green"  # if current is blue
   export DEPLOY_ENV=$NEW_ENV
   docker-compose -f docker-compose.production.yml up -d
   ```

3. **Health Check**
   - 10 retries with 10-second intervals
   - Checks `/health` endpoint
   - Rollback if health check fails

4. **Switch Traffic**
   ```bash
   sudo sed -i "s/kamiyo-api-$CURRENT_ENV/kamiyo-api-$NEW_ENV/g" /etc/nginx/sites-available/kamiyo
   sudo nginx -t && sudo systemctl reload nginx
   ```

5. **Drain and Stop Old Environment**
   - Wait 10 seconds for traffic to drain
   - Stop old environment containers

### Benefits

- **Zero downtime deployments**
- **Easy rollback** (just switch nginx back)
- **Testing in production environment** before switching traffic
- **Quick recovery** if deployment fails

## Rollback Process

### Automatic Rollback

Triggers automatically if:
- Health checks fail after 10 retries
- Smoke tests fail
- Any deployment step fails

### Manual Rollback

To manually rollback a deployment:

```bash
# SSH to server
ssh $SSH_USER@$SERVER_HOST

cd ~/kamiyo

# Get current environment
CURRENT_ENV=$(docker ps --filter "name=kamiyo-api" --format "{{.Names}}" | grep -o "blue\|green")

# Determine rollback environment
if [ "$CURRENT_ENV" = "blue" ]; then
  ROLLBACK_ENV="green"
else
  ROLLBACK_ENV="blue"
fi

# Start previous environment
export DEPLOY_ENV=$ROLLBACK_ENV
docker-compose -f docker-compose.production.yml up -d

# Wait for startup
sleep 30

# Update nginx
sudo sed -i "s/kamiyo-api-$CURRENT_ENV/kamiyo-api-$ROLLBACK_ENV/g" /etc/nginx/sites-available/kamiyo
sudo nginx -t && sudo systemctl reload nginx

# Stop current environment
export DEPLOY_ENV=$CURRENT_ENV
docker-compose -f docker-compose.production.yml down
```

### GitHub Manual Rollback

Use the manual workflow dispatch:

1. Go to Actions → Deploy to Production
2. Click "Run workflow"
3. Select the environment
4. Enter the previous commit SHA or tag
5. Click "Run workflow"

## Monitoring

### Health Check Endpoints

```bash
# API health
curl https://api.kamiyo.io/health

# Expected response:
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2024-01-07T12:00:00Z",
  "database": "connected",
  "redis": "connected"
}
```

### Prometheus Metrics

Access: `http://SERVER_HOST:9090`

**Key Metrics:**
- `kamiyo_http_requests_total` - Total HTTP requests
- `kamiyo_http_request_duration_seconds` - Request latency
- `kamiyo_active_subscriptions` - Active user subscriptions
- `kamiyo_exploits_total` - Total exploits tracked
- `kamiyo_aggregator_fetch_duration_seconds` - Aggregator performance

### Grafana Dashboards

Access: `http://SERVER_HOST:3000`

**Default Credentials:**
- Username: `admin`
- Password: (set in `.env.production`)

**Dashboards:**
- Kamiyo Overview - System health and performance
- API Performance - Request metrics and errors
- Aggregator Health - Source status and fetch rates
- Database Performance - Query times and connections

### Logs

```bash
# API logs
docker logs kamiyo-api-blue -f

# Aggregator logs
docker logs kamiyo-aggregator-blue -f

# All logs with structured format
docker-compose -f docker-compose.production.yml logs -f
```

## Troubleshooting

### Deployment Fails at Health Check

**Symptoms:**
- Health check retries exhausted
- Automatic rollback triggered

**Debug:**
```bash
# Check container logs
docker logs kamiyo-api-green

# Check container status
docker ps -a | grep kamiyo

# Manual health check
curl http://localhost:8000/health
```

**Common Causes:**
- Database migration failed
- Environment variables missing
- Port conflicts
- Database connection issues

### Nginx Returns 502 Bad Gateway

**Symptoms:**
- Nginx error: "upstream prematurely closed connection"

**Debug:**
```bash
# Check nginx config
sudo nginx -t

# Check nginx logs
sudo tail -f /var/log/nginx/error.log

# Check upstream
curl http://localhost:8000/health
```

**Fix:**
```bash
# Restart nginx
sudo systemctl restart nginx

# Check API is running
docker ps | grep kamiyo-api
```

### Database Migration Issues

**Symptoms:**
- API fails to start
- Logs show "relation does not exist"

**Debug:**
```bash
# Connect to database
docker exec -it kamiyo-postgres psql -U kamiyo -d kamiyo_prod

# Check tables
\dt

# Check migration status
SELECT * FROM schema_migrations;
```

**Fix:**
```bash
# Run migrations manually
docker exec -i kamiyo-postgres psql -U kamiyo -d kamiyo_prod < database/migrations/001_initial_schema.sql
```

### Blue-Green Switch Not Working

**Symptoms:**
- Traffic still going to old environment
- Changes not visible

**Debug:**
```bash
# Check nginx config
cat /etc/nginx/sites-available/kamiyo | grep kamiyo-api

# Check which containers are running
docker ps | grep kamiyo
```

**Fix:**
```bash
# Manually update nginx
sudo sed -i 's/kamiyo-api-blue/kamiyo-api-green/g' /etc/nginx/sites-available/kamiyo
sudo nginx -t && sudo systemctl reload nginx
```

### Container Registry Authentication Failed

**Symptoms:**
- "unauthorized: authentication required"

**Debug:**
```bash
# Check token permissions
# Ensure GITHUB_TOKEN has packages:write scope

# Manually login
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_ACTOR --password-stdin
```

### Disk Space Issues

**Symptoms:**
- "no space left on device"

**Debug:**
```bash
# Check disk usage
df -h

# Check Docker space
docker system df
```

**Fix:**
```bash
# Clean up old images
docker system prune -a

# Remove unused volumes
docker volume prune
```

## Best Practices

### Pre-Deployment Checklist

- [ ] All tests passing on `develop` branch
- [ ] Database migrations tested locally
- [ ] Environment variables updated in `.env.production`
- [ ] Monitoring dashboard reviewed
- [ ] Backup of production database taken
- [ ] Team notified of deployment window

### Post-Deployment Verification

- [ ] Health checks passing
- [ ] Smoke tests completed successfully
- [ ] Prometheus metrics collecting
- [ ] Grafana dashboards loading
- [ ] Error rate within acceptable limits
- [ ] Response times normal
- [ ] No spike in error logs

### Security Considerations

- [ ] SSL certificates valid (check expiry)
- [ ] Fail2ban active and monitoring
- [ ] Rate limiting configured
- [ ] Security headers present
- [ ] No secrets in logs
- [ ] Database not publicly exposed
- [ ] Firewall rules active

## Emergency Contacts

### Escalation Path

1. **Level 1**: Check monitoring dashboards
2. **Level 2**: Review logs and health checks
3. **Level 3**: Manual rollback to previous version
4. **Level 4**: Contact infrastructure team

### Useful Commands

```bash
# Quick status check
docker ps && curl -s https://api.kamiyo.io/health | jq

# Restart all services
cd ~/kamiyo && docker-compose -f docker-compose.production.yml restart

# View recent logs
docker-compose -f docker-compose.production.yml logs --tail=100 -f

# Check resource usage
docker stats

# Force pull and redeploy
docker-compose -f docker-compose.production.yml pull
docker-compose -f docker-compose.production.yml up -d --force-recreate
```

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)

## Support

For deployment issues:
1. Check this guide's troubleshooting section
2. Review GitHub Actions logs
3. Check server logs
4. Contact DevOps team

---

**Last Updated**: 2024-01-07
**Version**: 1.0.0
**Maintained By**: Kamiyo DevOps Team
