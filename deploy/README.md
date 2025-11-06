# KAMIYO API - Deployment Guide

Production deployment infrastructure for the KAMIYO exploit intelligence API.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Docker Deployment](#docker-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [Environment Variables](#environment-variables)
6. [Health Checks](#health-checks)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)

## Overview

This deployment infrastructure provides multiple deployment options:
- **Docker Compose**: Quick local/single-server deployment
- **Kubernetes**: Production-grade orchestrated deployment

Key features:
- Multi-stage Docker builds for minimal image size
- Comprehensive health checks
- High availability configuration (Kubernetes)
- Security hardening (non-root user, resource limits)

## Files Structure

```
deploy/
├── Dockerfile                      # Multi-stage production Dockerfile
├── docker-compose.yml              # Docker Compose configuration
└── kubernetes/
    ├── deployment.yaml            # Kubernetes Deployment with probes
    ├── service.yaml               # Kubernetes Service
    ├── configmap.yaml             # Configuration (non-sensitive)
    └── secrets.yaml               # Secrets template
```

## Quick Start

### 1. Environment Setup

Create environment file:

```bash
# Copy example environment file
cp .env.example .env.production

# Edit with your configuration
nano .env.production
```

### 2. Deploy

```bash
# Deploy with Docker Compose
cd deploy
docker-compose up -d

# Check status
docker-compose logs -f
```

## Docker Deployment

### Build Image

```bash
cd /path/to/kamiyo
docker build -f deploy/Dockerfile -t kamiyo/api:latest .
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
kubectl get pods -n kamiyo -l app=kamiyo-api

# Check deployment
kubectl rollout status deployment/kamiyo-api -n kamiyo

# View logs
kubectl logs -f -n kamiyo deployment/kamiyo-api

# Check health
kubectl port-forward -n kamiyo service/kamiyo-api 8000:80
curl http://localhost:8000/health
```

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `KAMIYO_API_KEY` | API authentication key | `your-api-key` |

### x402 Payment Configuration

```bash
# Base Network RPC
BASE_RPC_URL=https://mainnet.base.org

# Ethereum RPC  
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID

# Solana RPC
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Payment addresses
BASE_PAYMENT_ADDRESS=0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7
ETHEREUM_PAYMENT_ADDRESS=0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7
SOLANA_PAYMENT_ADDRESS=7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x
```

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `INFO` | Logging level |
| `REDIS_URL` | - | Redis URL for caching |
| `READ_REPLICA_URL` | - | Read replica database URL |

## Health Checks

### Endpoints

- **`/health`**: Comprehensive health check with database and cache status
- **`/ready`**: Readiness probe for load balancers

### Testing Health Checks

```bash
# Full health check
curl http://localhost:8000/health | jq '.'

# Readiness
curl http://localhost:8000/ready
```

## Monitoring

### Prometheus Metrics

Enable Prometheus metrics:

```bash
PROMETHEUS_ENABLED=true
```

Metrics available at `/metrics` endpoint.

### Logging

Structured JSON logging is enabled by default. View logs:

```bash
# Docker
docker-compose logs -f

# Kubernetes
kubectl logs -f -n kamiyo deployment/kamiyo-api
```

## Troubleshooting

### Service Won't Start

1. Check environment variables:
   ```bash
   docker-compose config
   ```

2. Check logs:
   ```bash
   docker-compose logs
   ```

3. Verify health endpoint:
   ```bash
   curl http://localhost:8000/health
   ```

### Database Connection Issues

1. Check database connectivity:
   ```bash
   psql "$DATABASE_URL" -c "SELECT 1;"
   ```

2. Verify firewall rules allow database connections

### High Memory Usage

Adjust resource limits in:
- Docker: `docker-compose.yml` -> `deploy.resources`
- Kubernetes: `deployment.yaml` -> `resources.limits`

## Security Best Practices

1. **Never commit secrets to git**
   - Use `.env` files (gitignored)
   - Use Kubernetes secrets or external secret managers

2. **Use non-root user**
   - Dockerfile runs as non-root user

3. **Limit resource usage**
   - CPU and memory limits configured
   - Prevents resource exhaustion

4. **Enable TLS**
   - Use HTTPS for API connections
   - Secure webhook URLs

5. **Regular updates**
   - Update base images regularly
   - Monitor security advisories

## Support

For issues or questions:
- Check logs first
- Review this documentation
- Contact: support@kamiyo.ai
- Documentation: https://docs.kamiyo.ai

## License

Copyright (c) 2024 KAMIYO. All rights reserved.
