#!/bin/bash
# Deploy Kamiyo Random Scheduler as systemd service

set -e

echo "Kamiyo Random Scheduler - Systemd Deployment"
echo "============================================="
echo ""

# Get current directory
CURRENT_DIR="$(pwd)"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Detect current user
CURRENT_USER="$(whoami)"

echo "Current directory: $CURRENT_DIR"
echo "Project directory: $PROJECT_DIR"
echo "Current user: $CURRENT_USER"
echo ""

# Check if running with sudo
if [ "$EUID" -eq 0 ]; then
    echo "⚠️  Running as root. Service will be installed system-wide."
    INSTALL_USER="$SUDO_USER"
else
    echo "⚠️  Not running as root. You may need to enter your password."
    INSTALL_USER="$CURRENT_USER"
fi

echo "Service will run as user: $INSTALL_USER"
echo ""

# Create customized service file
SERVICE_FILE="/tmp/kamiyo-scheduler.service"

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Kamiyo AI Agent Quote Tweet Random Scheduler
After=network.target

[Service]
Type=simple
User=$INSTALL_USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$(which python3) $PROJECT_DIR/social/random_scheduler.py
Restart=always
RestartSec=10
StandardOutput=append:/tmp/kamiyo_scheduler.log
StandardError=append:/tmp/kamiyo_scheduler.error.log

# Environment variables
Environment="ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
Environment="X_API_KEY=$X_API_KEY"
Environment="X_API_SECRET=$X_API_SECRET"
Environment="X_ACCESS_TOKEN=$X_ACCESS_TOKEN"
Environment="X_ACCESS_SECRET=$X_ACCESS_SECRET"
Environment="X_BEARER_TOKEN=$X_BEARER_TOKEN"

[Install]
WantedBy=multi-user.target
EOF

echo "✓ Created service file: $SERVICE_FILE"
echo ""

# Show the service file
echo "Service file contents:"
echo "======================"
cat "$SERVICE_FILE"
echo ""
echo "======================"
echo ""

# Install the service
echo "Installing systemd service..."
sudo cp "$SERVICE_FILE" /etc/systemd/system/kamiyo-scheduler.service
sudo chmod 644 /etc/systemd/system/kamiyo-scheduler.service
echo "✓ Service file installed"
echo ""

# Reload systemd
echo "Reloading systemd daemon..."
sudo systemctl daemon-reload
echo "✓ Systemd reloaded"
echo ""

# Enable the service
echo "Enabling service to start on boot..."
sudo systemctl enable kamiyo-scheduler.service
echo "✓ Service enabled"
echo ""

# Start the service
echo "Starting kamiyo-scheduler service..."
sudo systemctl start kamiyo-scheduler.service
echo "✓ Service started"
echo ""

# Show status
echo "Service Status:"
echo "==============="
sudo systemctl status kamiyo-scheduler.service --no-pager
echo ""

echo "============================================="
echo "✓ Deployment Complete!"
echo ""
echo "Useful commands:"
echo "  View status:  sudo systemctl status kamiyo-scheduler"
echo "  View logs:    sudo journalctl -u kamiyo-scheduler -f"
echo "  Stop service: sudo systemctl stop kamiyo-scheduler"
echo "  Restart:      sudo systemctl restart kamiyo-scheduler"
echo "  Disable:      sudo systemctl disable kamiyo-scheduler"
echo ""
echo "Log files:"
echo "  stdout: /tmp/kamiyo_scheduler.log"
echo "  stderr: /tmp/kamiyo_scheduler.error.log"
echo "  app:    /tmp/kamiyo_ai_agent_poster.log"
echo ""
