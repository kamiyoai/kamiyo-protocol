# KAMIYO x402 Payment Facilitator Deployment Guide

## Overview

This guide covers the deployment of the KAMIYO x402 Payment Facilitator system to production. The system includes:

- **FastAPI Backend** with x402 payment middleware
- **PostgreSQL Database** for payment tracking
- **Redis** for caching and rate limiting
- **Monitoring Stack** (Prometheus + Grafana)
- **Background Workers** for payment processing

## Prerequisites

### Required Services
- **Docker** and **Docker Compose**
- **Blockchain RPC Endpoints** (Base, Ethereum, Solana)
- **Stripe Account** (for subscription payments)
- **Domain Name** with SSL certificate

### Infrastructure Requirements
- **CPU**: 4+ cores
- **RAM**: 8GB+ 
- **Storage**: 50GB+ SSD
- **Network**: Stable internet connection

## Environment Setup

### 1. Environment Variables

Create a `.env.production` file:

```bash
# Database
POSTGRES_DB=kamiyo_x402
POSTGRES_USER=kamiyo_user
POSTGRES_PASSWORD=your_secure_password

# Blockchain RPC URLs
BASE_RPC_URL=https://mainnet.base.org
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Payment Addresses
BASE_PAYMENT_ADDRESS=0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7
ETHEREUM_PAYMENT_ADDRESS=0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7
SOLANA_PAYMENT_ADDRESS=7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x

# Security
ADMIN_API_KEY=your_secure_admin_key

# Stripe (for subscriptions)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Monitoring
GRAFANA_PASSWORD=your_grafana_password

# Application
ENVIRONMENT=production
ALLOWED_ORIGINS=https://kamiyo.ai,https://www.kamiyo.ai,https://api.kamiyo.ai
```

### 2. Database Setup

Run database migrations:

```bash
# Apply initial schema
docker-compose -f deploy/x402-deployment.yml run --rm api python database/apply_migration.py

# Verify database connection
docker-compose -f deploy/x402-deployment.yml run --rm api python -c "from database import get_db; db = get_db(); print(f'Database connected: {db.get_total_exploits()} exploits')"
```

## Deployment Steps

### 1. Infrastructure Deployment

```bash
# Pull latest images
docker-compose -f deploy/x402-deployment.yml pull

# Start services
docker-compose -f deploy/x402-deployment.yml up -d

# Verify all services are running
docker-compose -f deploy/x402-deployment.yml ps
```

### 2. Health Checks

```bash
# API health check
curl http://localhost:8000/health

# Database health check
docker-compose -f deploy/x402-deployment.yml exec postgres pg_isready -U kamiyo_user -d kamiyo_x402

# Redis health check
docker-compose -f deploy/x402-deployment.yml exec redis redis-cli ping
```

### 3. Performance Optimization

```bash
# Warm cache with common transactions
docker-compose -f deploy/x402-deployment.yml run --rm cache-warmer

# Start background workers
docker-compose -f deploy/x402-deployment.yml up -d payment-worker
```

## Monitoring Setup

### 1. Access Monitoring Dashboards

- **Grafana**: http://localhost:3001 (admin/your_grafana_password)
- **Prometheus**: http://localhost:9090

### 2. Key Metrics to Monitor

#### Payment System Metrics
- **Payment verification success rate** (> 99%)
- **Average verification time** (< 2 seconds)
- **Cache hit rate** (> 70%)
- **Concurrent payment requests**

#### API Metrics
- **Response time p95** (< 100ms)
- **Error rate** (< 1%)
- **Rate limit hits**
- **Active connections**

#### Database Metrics
- **Connection pool utilization**
- **Query performance**
- **Lock contention**

## Security Configuration

### 1. Network Security

```bash
# Configure firewall
ufw allow 8000/tcp  # API
ufw allow 5432/tcp  # PostgreSQL
ufw allow 6379/tcp  # Redis
ufw allow 9090/tcp  # Prometheus
ufw allow 3001/tcp  # Grafana
```

### 2. SSL/TLS Configuration

For production, use a reverse proxy with SSL:

```nginx
# nginx configuration
server {
    listen 443 ssl;
    server_name api.kamiyo.ai;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/private.key;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. API Security

- Enable **rate limiting** in production
- Configure **CORS** for allowed origins
- Use **API key authentication** for admin endpoints
- Implement **PCI compliance** for payment processing

## Scaling Strategy

### 1. Horizontal Scaling

```yaml
# docker-compose.scale.yml
services:
  api:
    deploy:
      replicas: 3
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://user:pass@postgres:5432/db
```

### 2. Database Scaling

- Enable **read replicas** for PostgreSQL
- Configure **connection pooling**
- Implement **database sharding** if needed

### 3. Cache Scaling

- Use **Redis Cluster** for distributed caching
- Implement **cache warming** strategies
- Monitor **cache hit rates**

## Backup and Recovery

### 1. Database Backups

```bash
# Daily backup script
#!/bin/bash
BACKUP_FILE="kamiyo_x402_$(date +%Y%m%d_%H%M%S).sql"
docker-compose -f deploy/x402-deployment.yml exec postgres pg_dump -U kamiyo_user kamiyo_x402 > /backups/$BACKUP_FILE

# Keep last 7 days
find /backups -name "kamiyo_x402_*.sql" -mtime +7 -delete
```

### 2. Configuration Backups

```bash
# Backup environment files
cp .env.production /backups/env.production.$(date +%Y%m%d)
cp deploy/x402-deployment.yml /backups/deployment.$(date +%Y%m%d).yml
```

### 3. Disaster Recovery

1. **Restore database** from latest backup
2. **Update environment** configuration
3. **Redeploy services**
4. **Verify system health**

## Performance Tuning

### 1. Database Optimization

```sql
-- Add performance indexes
CREATE INDEX CONCURRENTLY idx_payments_tx_hash ON payment_transactions(tx_hash);
CREATE INDEX CONCURRENTLY idx_payments_from_address ON payment_transactions(from_address);
CREATE INDEX CONCURRENTLY idx_payments_created_at ON payment_transactions(created_at);

-- Configure PostgreSQL
shared_buffers = 1GB
work_mem = 64MB
maintenance_work_mem = 256MB
```

### 2. Redis Optimization

```bash
# Redis configuration
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### 3. Application Optimization

```python
# FastAPI configuration
app = FastAPI(
    title="Kamiyo x402 API",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Enable compression
app.add_middleware(GZipMiddleware, minimum_size=1000)
```

## Troubleshooting

### Common Issues

#### Payment Verification Failures
```bash
# Check blockchain RPC connectivity
curl -X POST $BASE_RPC_URL -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

#### Database Connection Issues
```bash
# Check PostgreSQL logs
docker-compose -f deploy/x402-deployment.yml logs postgres

# Test database connection
docker-compose -f deploy/x402-deployment.yml exec postgres psql -U kamiyo_user -d kamiyo_x402 -c "SELECT 1;"
```

#### Cache Performance Issues
```bash
# Check Redis metrics
docker-compose -f deploy/x402-deployment.yml exec redis redis-cli info memory

# Clear cache if needed
docker-compose -f deploy/x402-deployment.yml exec api python -c "from api.x402.performance_optimizer import performance_optimizer; performance_optimizer.clear_cache()"
```

### Monitoring Commands

```bash
# Check service status
docker-compose -f deploy/x402-deployment.yml ps

# View logs
docker-compose -f deploy/x402-deployment.yml logs -f api

# Check resource usage
docker stats

# Monitor API performance
curl -s http://localhost:8000/health | jq '.sources[] | select(.is_active == true)'
```

## Maintenance

### Regular Tasks

- **Daily**: Check logs for errors
- **Weekly**: Backup database and configurations
- **Monthly**: Update dependencies and security patches
- **Quarterly**: Performance review and optimization

### Update Procedure

1. **Backup** current deployment
2. **Pull** latest code changes
3. **Run** database migrations
4. **Deploy** updated services
5. **Verify** system functionality
6. **Monitor** for any issues

## Support

For deployment support:
- **Documentation**: https://kamiyo.ai/docs/deployment
- **Support Email**: support@kamiyo.ai
- **Monitoring**: Check Grafana dashboards
- **Logs**: Review Docker container logs

## Success Metrics

### Deployment Success Criteria
- ✅ All services running without errors
- ✅ Database migrations applied successfully
- ✅ Payment verification working on all chains
- ✅ Monitoring dashboards accessible
- ✅ API endpoints responding correctly
- ✅ SSL/TLS certificates configured
- ✅ Backup procedures tested

### Performance Targets
- **API Response Time**: < 100ms p95
- **Payment Verification**: < 2 seconds
- **Database Queries**: < 50ms average
- **Cache Hit Rate**: > 70%
- **Uptime**: 99.9%

---

**Next Steps**: After successful deployment, proceed with marketing launch and user onboarding.