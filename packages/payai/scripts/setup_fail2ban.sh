#!/bin/bash
# Fail2ban Setup Script for Kamiyo
# Installs and configures fail2ban with custom filters

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Kamiyo Fail2ban Setup${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}\n"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}ERROR: Must run as root (use sudo)${NC}"
    exit 1
fi

echo -e "${GREEN}Step 1: Installing fail2ban${NC}"

# Detect OS and install
if [ -f /etc/debian_version ]; then
    apt-get update
    apt-get install -y fail2ban
elif [ -f /etc/redhat-release ]; then
    yum install -y epel-release
    yum install -y fail2ban fail2ban-systemd
else
    echo -e "${RED}ERROR: Unsupported OS${NC}"
    exit 1
fi

echo -e "  ✓ Fail2ban installed"

echo -e "\n${GREEN}Step 2: Copying configuration files${NC}"

# Copy jail configuration
cp security/fail2ban/jail.local /etc/fail2ban/

# Copy custom filters
cp security/fail2ban/filter.d/kamiyo-api-auth.conf /etc/fail2ban/filter.d/
cp security/fail2ban/filter.d/kamiyo-api-abuse.conf /etc/fail2ban/filter.d/

echo -e "  ✓ Configuration files copied"

echo -e "\n${GREEN}Step 3: Creating log directory${NC}"

# Create log directory
mkdir -p /var/log/kamiyo
chmod 755 /var/log/kamiyo

echo -e "  ✓ Log directory created"

echo -e "\n${GREEN}Step 4: Starting fail2ban${NC}"

# Start and enable fail2ban
systemctl enable fail2ban
systemctl start fail2ban

echo -e "  ✓ Fail2ban started"

echo -e "\n${GREEN}Step 5: Verifying installation${NC}"

# Check status
fail2ban-client status

echo -e "\n${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Fail2ban Setup Complete! ✓${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"

echo -e "\nActive jails:"
fail2ban-client status | grep "Jail list"

echo -e "\nUseful commands:"
echo -e "  Status: fail2ban-client status"
echo -e "  Check jail: fail2ban-client status <jail-name>"
echo -e "  Unban IP: fail2ban-client set <jail-name> unbanip <ip>"
echo -e "  View logs: tail -f /var/log/fail2ban.log"

echo -e "\n${GREEN}Done!${NC}"
