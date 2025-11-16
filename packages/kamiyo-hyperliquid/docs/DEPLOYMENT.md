# Production Deployment Guide

Complete guide for deploying KAMIYO Hyperliquid Security Monitoring to production.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (Docker)](#quick-start-docker)
3. [Manual Deployment](#manual-deployment)
4. [Configuration](#configuration)
5. [Database Setup](#database-setup)
6. [Monitoring & Observability](#monitoring--observability)
7. [Security Hardening](#security-hardening)
8. [Scaling](#scaling)
9. [Backup & Recovery](#backup--recovery)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

**Minimum (Development/Testing):**
- 2 CPU cores
- 4 GB RAM
- 20 GB storage
- Ubuntu 20.04+ / Debian 11+ / RHEL 8+

**Recommended (Production):**
- 4+ CPU cores
- 8+ GB RAM
- 100 GB SSD storage
- Ubuntu 22.04 LTS

### Software Dependencies

- Docker 24.0+ and Docker Compose 2.0+
- **OR** for manual deployment:
  - Python 3.9+
  - PostgreSQL 14+
  - Redis 7+ (optional, for caching)
  - Nginx (recommended as reverse proxy)

---

## Quick Start (Docker)

The fastest way to get running is with Docker Compose:

### 1. Clone and Configure

```bash
# Clone repository
git clone https://github.com/mizuki-tamaki/kamiyo-hyperliquid.git
cd kamiyo-hyperliquid

# Create environment file
cp .env.example .env

# Edit configuration (see Configuration section)
nano .env
```

### 2. Set Secure Passwords

```bash
# Generate secure passwords
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
GRAFANA_PASSWORD=$(openssl rand -base64 32)

# Add to .env
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" >> .env
echo "REDIS_PASSWORD=$REDIS_PASSWORD" >> .env
echo "GRAFANA_PASSWORD=$GRAFANA_PASSWORD" >> .env
```

### 3. Launch Services

```bash
# Start core services (API + Database)
docker-compose up -d

# Verify services are healthy
docker-compose ps

# View logs
docker-compose logs -f api
```

### 4. Initialize Database

```bash
# Run database migrations
docker-compose exec api python -c "
from database import init_database
init_database(create_tables=True)
"

# Verify database
docker-compose exec postgres psql -U kamiyo -d kamiyo_hyperliquid -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"
```

### 5. Test API

```bash
# Health check
curl http://localhost:8000/health

# Security dashboard
curl http://localhost:8000/security/dashboard

# HLP vault health
curl http://localhost:8000/security/hlp-vault
```

### 6. Optional: Start Monitoring Stack

```bash
# Start Prometheus + Grafana
docker-compose --profile monitoring up -d

# Access Grafana: http://localhost:3000
# Default credentials: admin / (your GRAFANA_PASSWORD)
```

---

## Manual Deployment

For production deployments without Docker:

### 1. Install Dependencies

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3-pip postgresql-14 redis-server nginx

# Start services
sudo systemctl start postgresql
sudo systemctl start redis-server
sudo systemctl enable postgresql redis-server
```

### 2. Create Database

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE kamiyo_hyperliquid;
CREATE USER kamiyo WITH ENCRYPTED PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE kamiyo_hyperliquid TO kamiyo;
\q

# Initialize schema
psql -U kamiyo -d kamiyo_hyperliquid -f database/schema.sql
```

### 3. Install Application

```bash
# Create application directory
sudo mkdir -p /opt/kamiyo
sudo chown $USER:$USER /opt/kamiyo
cd /opt/kamiyo

# Clone repository
git clone https://github.com/mizuki-tamaki/kamiyo-hyperliquid.git .

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Configure Environment

```bash
# Create .env file
cp .env.example .env
nano .env

# Set DATABASE_URL
DATABASE_URL=postgresql://kamiyo:your_secure_password_here@localhost:5432/kamiyo_hyperliquid
```

### 5. Create Systemd Service

```bash
sudo nano /etc/systemd/system/kamiyo-api.service
```

```ini
[Unit]
Description=KAMIYO Hyperliquid Security API
After=network.target postgresql.service redis.service

[Service]
Type=notify
User=kamiyo
Group=kamiyo
WorkingDirectory=/opt/kamiyo
Environment="PATH=/opt/kamiyo/venv/bin"
EnvironmentFile=/opt/kamiyo/.env
ExecStart=/opt/kamiyo/venv/bin/uvicorn api.main:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable kamiyo-api
sudo systemctl start kamiyo-api

# Check status
sudo systemctl status kamiyo-api
```

### 6. Configure Nginx Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/kamiyo
```

```nginx
upstream kamiyo_api {
    server 127.0.0.1:8000;
}

server {
    listen 80;
    server_name kamiyo.yourdomain.com;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=kamiyo:10m rate=10r/s;
    limit_req zone=kamiyo burst=20 nodelay;

    location / {
        proxy_pass http://kamiyo_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (for future)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/kamiyo /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. SSL with Let's Encrypt

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d kamiyo.yourdomain.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

---

## Configuration

### Critical Environment Variables

```bash
# Database (REQUIRED)
DATABASE_URL=postgresql://user:password@host:port/database

# API Configuration
ALLOWED_ORIGINS=https://yourfrontend.com,https://app.yourfrontend.com
RATE_LIMIT=60/minute

# Security Thresholds
CRITICAL_LOSS_24H=2000000
ORACLE_CRITICAL_DEVIATION=1.0

# Alerts (HIGHLY RECOMMENDED)
WEBHOOK_URL=https://your-webhook.com/alerts
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### Security Configuration

```bash
# Change default passwords
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)

# Restrict CORS
ALLOWED_ORIGINS=https://yourdomain.com

# Enable rate limiting
RATE_LIMIT=30/minute

# Set production environment
ENVIRONMENT=production
DEBUG=false
ENABLE_DOCS=false  # Disable Swagger in production
```

---

## Database Setup

### Initial Setup

```bash
# Using Docker
docker-compose exec postgres psql -U kamiyo -d kamiyo_hyperliquid -f /docker-entrypoint-initdb.d/01-schema.sql

# Manual
psql -U kamiyo -d kamiyo_hyperliquid -f database/schema.sql
```

### Verify Schema

```bash
# List tables
psql -U kamiyo -d kamiyo_hyperliquid -c "\dt"

# Check table structure
psql -U kamiyo -d kamiyo_hyperliquid -c "\d hlp_vault_snapshots"

# Verify triggers
psql -U kamiyo -d kamiyo_hyperliquid -c "SELECT * FROM pg_trigger;"
```

### Database Backups

```bash
# Create backup
pg_dump -U kamiyo -d kamiyo_hyperliquid -F c -b -v -f backup_$(date +%Y%m%d_%H%M%S).dump

# Restore from backup
pg_restore -U kamiyo -d kamiyo_hyperliquid -v backup_20250315_120000.dump

# Automated daily backups (crontab)
0 2 * * * /usr/bin/pg_dump -U kamiyo -d kamiyo_hyperliquid -F c -f /backup/kamiyo_$(date +\%Y\%m\%d).dump && find /backup -mtime +7 -delete
```

---

## Monitoring & Observability

### Prometheus Metrics

Access metrics at: `http://localhost:9090`

Key metrics to monitor:
- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request latency
- `security_events_total` - Security events by severity
- `hlp_vault_anomaly_score` - HLP vault anomaly score
- `oracle_deviations_total` - Oracle price deviations

### Grafana Dashboards

Access Grafana at: `http://localhost:3000`

**Pre-configured dashboards:**
1. Security Overview
2. API Performance
3. Database Metrics
4. Alert Activity

### Application Logs

```bash
# Docker
docker-compose logs -f api

# Systemd
sudo journalctl -u kamiyo-api -f

# Log rotation (logrotate)
sudo nano /etc/logrotate.d/kamiyo
```

```
/var/log/kamiyo/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 kamiyo kamiyo
    sharedscripts
    postrotate
        systemctl reload kamiyo-api > /dev/null 2>&1 || true
    endscript
}
```

### Health Checks

```bash
# API health
curl http://localhost:8000/health

# Database health
docker-compose exec api python -c "from database import get_database; print(get_database().health_check())"

# Comprehensive system check
./scripts/health_check.sh
```

---

## Security Hardening

### 1. Firewall Configuration

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Block direct database access
sudo ufw deny 5432/tcp
sudo ufw deny 6379/tcp
```

### 2. Database Security

```bash
# PostgreSQL: Edit /etc/postgresql/14/main/pg_hba.conf
local   all             all                                     peer
host    kamiyo_hyperliquid    kamiyo    127.0.0.1/32          md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### 3. Application Security

```bash
# Run as non-root user
sudo useradd -r -s /bin/false kamiyo
sudo chown -R kamiyo:kamiyo /opt/kamiyo

# Restrict file permissions
chmod 600 .env
chmod 700 /opt/kamiyo
```

### 4. Regular Updates

```bash
# System updates
sudo apt update && sudo apt upgrade -y

# Application updates
cd /opt/kamiyo
git pull
source venv/bin/activate
pip install --upgrade -r requirements.txt
sudo systemctl restart kamiyo-api
```

---

## Scaling

### Horizontal Scaling

**Load Balancer (Nginx):**

```nginx
upstream kamiyo_cluster {
    least_conn;
    server api-1:8000;
    server api-2:8000;
    server api-3:8000;
}
```

**Docker Compose Scaling:**

```bash
docker-compose up -d --scale api=3
```

### Vertical Scaling

```bash
# Increase worker processes
WORKERS=8

# Tune database pool
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=40
```

### Performance Optimization

```bash
# Enable async aggregators
ASYNC_AGGREGATORS=true

# Increase concurrent requests
MAX_CONCURRENT_REQUESTS=50

# Add Redis caching
REDIS_URL=redis://localhost:6379/0
```

---

## Backup & Recovery

### Automated Backup Script

```bash
#!/bin/bash
# /opt/kamiyo/scripts/backup.sh

BACKUP_DIR="/backup/kamiyo"
DATE=$(date +%Y%m%d_%H%M%S)

# Database backup
pg_dump -U kamiyo -d kamiyo_hyperliquid -F c -f "$BACKUP_DIR/db_$DATE.dump"

# Configuration backup
tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" /opt/kamiyo/.env /opt/kamiyo/monitoring/

# Clean old backups (keep 30 days)
find "$BACKUP_DIR" -mtime +30 -delete

echo "Backup completed: $DATE"
```

### Disaster Recovery

```bash
# 1. Stop application
docker-compose down
# OR
sudo systemctl stop kamiyo-api

# 2. Restore database
pg_restore -U kamiyo -d kamiyo_hyperliquid -c backup.dump

# 3. Restore configuration
tar -xzf config_backup.tar.gz -C /

# 4. Start application
docker-compose up -d
# OR
sudo systemctl start kamiyo-api
```

---

## Troubleshooting

### Common Issues

**1. Database Connection Failed**

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Verify credentials
psql -U kamiyo -d kamiyo_hyperliquid

# Check DATABASE_URL in .env
echo $DATABASE_URL
```

**2. API Not Responding**

```bash
# Check service status
docker-compose ps
# OR
sudo systemctl status kamiyo-api

# Check logs
docker-compose logs api
# OR
sudo journalctl -u kamiyo-api -n 100
```

**3. High Memory Usage**

```bash
# Reduce worker processes
WORKERS=2

# Reduce database pool
DATABASE_POOL_SIZE=3

# Enable connection limits
DATABASE_MAX_OVERFLOW=5
```

**4. Slow API Responses**

```bash
# Check database query performance
docker-compose exec postgres psql -U kamiyo -d kamiyo_hyperliquid -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"

# Enable query caching
REDIS_URL=redis://localhost:6379/0

# Add database indexes (see schema.sql)
```

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=DEBUG
DATABASE_ECHO=true

# Restart with verbose output
docker-compose up api
```

### Getting Help

- **Documentation:** https://github.com/mizuki-tamaki/kamiyo-hyperliquid/tree/main/docs
- **Issues:** https://github.com/mizuki-tamaki/kamiyo-hyperliquid/issues
- **Security:** security@kamiyo.ai

---

## Production Checklist

Before going live, verify:

- [ ] Secure passwords set for all services
- [ ] CORS configured to specific domains
- [ ] SSL/TLS certificates installed
- [ ] Database backups automated
- [ ] Monitoring and alerts configured
- [ ] Rate limiting enabled
- [ ] Firewall rules in place
- [ ] Application runs as non-root user
- [ ] Logs rotating properly
- [ ] Health checks passing
- [ ] Load testing completed
- [ ] Disaster recovery plan tested

---

## Next Steps

1. **Configure Alerts:** Set up Telegram/Discord/Webhook notifications
2. **Tune Thresholds:** Adjust detection thresholds based on your risk tolerance
3. **Add Monitoring:** Connect to your existing monitoring infrastructure
4. **Scale:** Add more workers/instances as needed
5. **Optimize:** Profile and optimize based on actual usage patterns

For additional features and commercial support, contact: licensing@kamiyo.ai
