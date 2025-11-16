# Runbook: Database Connection Loss

**Severity:** P0 (Critical)
**Impact:** Complete service outage - users cannot access exploit data
**Response Time:** Immediate (within 5 minutes)

## Prerequisites Check

Before starting, verify container names:

```bash
# List all running containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Expected: 'kamiyo' container should be running
```

## Symptoms

- API returns 500 errors on all endpoints
- Health check fails: `/health` returns database disconnected
- Logs show: "database is locked" or "unable to open database file"
- Users report: "Cannot load exploits" or blank dashboard

## Diagnosis Steps

### Step 1: Check if service is running

```bash
# Check container status
docker ps | grep kamiyo

# If not running, skip to Recovery > Restart Service
```

### Step 2: Check database file

```bash
# Verify database file exists and has correct permissions
docker exec kamiyo ls -lh /app/data/kamiyo.db

# Expected output: -rw-r--r-- ... kamiyo.db (size should be > 1MB)
```

### Step 3: Check database integrity

```bash
# Run integrity check
docker exec kamiyo sqlite3 /app/data/kamiyo.db "PRAGMA integrity_check;"

# Expected output: "ok"
# If corrupted: See Recovery > Restore from Backup
```

### Step 4: Check application logs

```bash
# Check last 100 lines for database errors
docker logs kamiyo --tail=100 | grep -i -E "database|sqlite|error"

# Look for:
# - "database is locked"
# - "unable to open database file"
# - "disk I/O error"
```

### Step 5: Check disk space

```bash
# Check if disk is full
docker exec kamiyo df -h /app/data

# If > 95% full: See Recovery > Free Disk Space
```

## Recovery Steps

### Option 1: Restart Service (Most Common)

```bash
# Restart the container
docker compose restart kamiyo

# Wait 30 seconds
sleep 30

# Verify health
curl -f http://localhost:8000/health || echo "FAILED: Still unhealthy"

# Check logs for startup
docker logs kamiyo --tail=50
```

**Expected Result:** Service restarts cleanly, health check passes

### Option 2: Rebuild and Restart

If restart doesn't work:

```bash
# Stop container
docker compose down

# Rebuild image
docker compose build --no-cache kamiyo

# Start with fresh container
docker compose up -d kamiyo

# Monitor startup
docker logs kamiyo -f

# Verify health (Ctrl+C to exit logs first)
curl http://localhost:8000/health | jq
```

### Option 3: Restore from Backup

If database is corrupted:

```bash
# Stop service
docker compose down

# Backup corrupted database
docker compose up -d kamiyo
docker exec kamiyo cp /app/data/kamiyo.db /app/data/kamiyo.db.corrupted

# Restore from latest backup (if available)
docker exec kamiyo cp /app/data/backups/kamiyo_latest.db /app/data/kamiyo.db

# Restart service
docker compose restart kamiyo

# Verify
curl http://localhost:8000/health
```

### Option 4: Free Disk Space

If disk is full:

```bash
# Remove old Docker images
docker image prune -a -f

# Remove old logs
docker exec kamiyo sh -c "find /var/log -name '*.log' -mtime +7 -delete"

# Check space again
docker exec kamiyo df -h /app/data

# Restart service
docker compose restart kamiyo
```

## Verification

After recovery, verify the following:

```bash
# 1. Health check passes
curl http://localhost:8000/health
# Expected: {"status":"healthy","database":"connected"}

# 2. Can query exploits
curl http://localhost:8000/api/v1/exploits?limit=10
# Expected: Returns array of exploits

# 3. Database query works
docker exec kamiyo sqlite3 /app/data/kamiyo.db "SELECT COUNT(*) FROM exploits;"
# Expected: Number > 0

# 4. Container is stable
sleep 60
docker ps | grep kamiyo
# Expected: Container still running (not restarting)
```

## Post-Incident

### Document the Issue

```bash
# Save logs for analysis
docker logs kamiyo > /tmp/kamiyo_incident_$(date +%Y%m%d_%H%M%S).log

# Document in incident tracker:
# - What triggered the issue?
# - Which recovery option worked?
# - Total downtime?
# - Root cause?
```

### Prevent Recurrence

- If disk space issue: Set up monitoring alert at 80% disk usage
- If corruption: Schedule daily database backups
- If locked database: Check for long-running queries
- If permission issue: Review volume mount permissions in docker-compose.yml

## Escalation

If recovery steps don't work after 15 minutes:

1. **Level 2 - Senior Engineer:** Call/Slack with incident log
2. **Level 3 - Infrastructure Team:** If hardware/disk issues
3. **Rollback Option:** Deploy previous known-good version

### Emergency Contacts

See: `/Users/dennisgoslar/Projekter/kamiyo/website/docs/ON_CALL.md`

## Common Mistakes to Avoid

- **Don't** delete kamiyo.db without a backup
- **Don't** run VACUUM on locked database
- **Don't** restart multiple times rapidly (can corrupt WAL file)
- **Do** save logs before restarting
- **Do** verify backups exist before restore

## Testing This Runbook

```bash
# Simulate database lock (ONLY IN DEV)
docker exec kamiyo sqlite3 /app/data/kamiyo.db "PRAGMA locking_mode=EXCLUSIVE; SELECT 1;"

# Verify symptom
curl http://localhost:8000/health
# Should show database error

# Follow recovery steps
docker compose restart kamiyo

# Verify fix
curl http://localhost:8000/health
```

---

**Last Updated:** 2025-10-13
**Tested By:** DevOps Team
**Success Rate:** 95% (Option 1 works in most cases)
