# Kamiyo Random Scheduler - Production Deployment Guide

## Overview

The Random Scheduler posts AI-generated quote tweets **twice daily** at **random times**:
- **Morning window**: 8 AM - 12 PM (random time each day)
- **Evening window**: 4 PM - 10 PM (random time each day)

Posts vary in length (short/medium/long) for more natural, organic content.

## Prerequisites

1. **Required Environment Variables**:
   - `ANTHROPIC_API_KEY` - Claude API key for generating content
   - `X_API_KEY` - Twitter/X API key
   - `X_API_SECRET` - Twitter/X API secret
   - `X_ACCESS_TOKEN` - Twitter/X access token
   - `X_ACCESS_SECRET` - Twitter/X access secret
   - `X_BEARER_TOKEN` - Twitter/X bearer token (optional)

2. **System Requirements**:
   - Python 3.8+
   - systemd (Linux)
   - Required Python packages (from requirements.txt)

## Deployment Steps

### Step 1: Set Environment Variables

Create or update your `.env` file in the project root:

```bash
cd /Users/dennisgoslar/Projekter/kamiyo

# Create .env file if it doesn't exist
cat > .env << 'EOF'
ANTHROPIC_API_KEY=your_anthropic_key_here
X_API_KEY=your_x_api_key_here
X_API_SECRET=your_x_api_secret_here
X_ACCESS_TOKEN=your_x_access_token_here
X_ACCESS_SECRET=your_x_access_secret_here
X_BEARER_TOKEN=your_x_bearer_token_here
EOF

# Load environment variables
export $(cat .env | xargs)
```

### Step 2: Run the Deployment Script

```bash
# Navigate to project directory
cd /Users/dennisgoslar/Projekter/kamiyo

# Run deployment script
bash social/deploy_scheduler.sh
```

The script will:
1. Create a customized systemd service file
2. Install it to `/etc/systemd/system/`
3. Enable the service to start on boot
4. Start the service immediately
5. Show the service status

### Step 3: Verify Deployment

Check that the service is running:

```bash
# View service status
sudo systemctl status kamiyo-scheduler

# View live logs
sudo journalctl -u kamiyo-scheduler -f

# Check application logs
tail -f /tmp/kamiyo_ai_agent_poster.log
```

## Service Management

### Common Commands

```bash
# Start service
sudo systemctl start kamiyo-scheduler

# Stop service
sudo systemctl stop kamiyo-scheduler

# Restart service
sudo systemctl restart kamiyo-scheduler

# Check status
sudo systemctl status kamiyo-scheduler

# View logs (live)
sudo journalctl -u kamiyo-scheduler -f

# View logs (last 100 lines)
sudo journalctl -u kamiyo-scheduler -n 100

# Disable service (won't start on boot)
sudo systemctl disable kamiyo-scheduler

# Enable service (will start on boot)
sudo systemctl enable kamiyo-scheduler
```

### Log Files

- **Service logs**: `sudo journalctl -u kamiyo-scheduler`
- **Application logs**: `/tmp/kamiyo_ai_agent_poster.log`
- **Scheduler stdout**: `/tmp/kamiyo_scheduler.log`
- **Scheduler errors**: `/tmp/kamiyo_scheduler.error.log`

## Troubleshooting

### Service Won't Start

1. Check the service status:
   ```bash
   sudo systemctl status kamiyo-scheduler
   ```

2. View detailed logs:
   ```bash
   sudo journalctl -u kamiyo-scheduler -xe
   ```

3. Verify environment variables are set in service file:
   ```bash
   cat /etc/systemd/system/kamiyo-scheduler.service
   ```

### Missing Environment Variables

If you see errors about missing credentials:

1. Edit the service file:
   ```bash
   sudo nano /etc/systemd/system/kamiyo-scheduler.service
   ```

2. Add or update environment variables in the `[Service]` section:
   ```ini
   Environment="ANTHROPIC_API_KEY=your_key_here"
   Environment="X_API_KEY=your_key_here"
   # ... add other variables
   ```

3. Reload and restart:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart kamiyo-scheduler
   ```

### No Tweets Being Posted

1. Check if we're in the posting window (8-12 AM or 4-10 PM)
2. View logs to see when next post is scheduled
3. Verify Twitter API credentials are valid
4. Check rate limits on Twitter API

## Manual Testing

Before deploying to production, test the scheduler manually:

```bash
# Navigate to project directory
cd /Users/dennisgoslar/Projekter/kamiyo

# Load environment variables
export $(cat .env | xargs)

# Run scheduler in foreground (Ctrl+C to stop)
python3 social/random_scheduler.py
```

Watch the logs to verify:
- Random times are being generated correctly
- Posts are created successfully
- Twitter API is responding

## Updating the Service

After making code changes:

```bash
# Pull latest changes
git pull

# Restart the service
sudo systemctl restart kamiyo-scheduler

# Verify it's running
sudo systemctl status kamiyo-scheduler
```

## Uninstalling

To completely remove the service:

```bash
# Stop the service
sudo systemctl stop kamiyo-scheduler

# Disable the service
sudo systemctl disable kamiyo-scheduler

# Remove service file
sudo rm /etc/systemd/system/kamiyo-scheduler.service

# Reload systemd
sudo systemctl daemon-reload
```

## Architecture Notes

- **Continuous Process**: Runs 24/7, checking every 5 minutes
- **Daily Reset**: Automatically resets post tracking at midnight
- **Random Timing**: Generates new random time after each post
- **Auto-Restart**: Systemd automatically restarts on failure
- **Graceful Shutdown**: Handles SIGTERM/SIGINT properly

## Monitoring

Consider setting up monitoring to track:
- Service uptime: `systemctl is-active kamiyo-scheduler`
- Post frequency: Check logs for successful posts
- Error rate: Monitor error logs
- API rate limits: Watch for rate limit errors

## Production Best Practices

1. **Monitor logs regularly** for errors or rate limits
2. **Set up log rotation** to prevent log files from growing too large
3. **Create alerts** for service failures
4. **Test in development** before deploying changes
5. **Backup credentials** securely
6. **Review posted content** periodically for quality
