#!/bin/bash
# SSL Certificate Setup for Kamiyo
# Uses Let's Encrypt (Certbot) for free SSL certificates

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Kamiyo SSL Certificate Setup${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}\n"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}ERROR: Must run as root (use sudo)${NC}"
    exit 1
fi

# Load configuration
if [ ! -f ".env.production" ]; then
    echo -e "${RED}ERROR: .env.production not found${NC}"
    exit 1
fi

export $(cat .env.production | grep -v '^#' | xargs)

# Check required variables
if [ -z "$DOMAIN" ]; then
    echo -e "${RED}ERROR: DOMAIN not set in .env.production${NC}"
    exit 1
fi

if [ -z "$ADMIN_EMAIL_SSL" ]; then
    echo -e "${RED}ERROR: ADMIN_EMAIL_SSL not set in .env.production${NC}"
    exit 1
fi

echo -e "Domain: ${GREEN}$DOMAIN${NC}"
echo -e "Email: ${GREEN}$ADMIN_EMAIL_SSL${NC}"
echo ""

# Confirm
read -p "Proceed with SSL setup? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Cancelled"
    exit 0
fi

echo -e "\n${GREEN}Step 1: Installing Certbot${NC}"

# Detect OS and install certbot
if [ -f /etc/debian_version ]; then
    # Debian/Ubuntu
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
elif [ -f /etc/redhat-release ]; then
    # RHEL/CentOS
    yum install -y certbot python3-certbot-nginx
else
    echo -e "${YELLOW}WARNING: Unknown OS, attempting generic install${NC}"
    pip3 install certbot certbot-nginx
fi

echo -e "  ✓ Certbot installed"

echo -e "\n${GREEN}Step 2: Stopping Nginx (if running)${NC}"

# Stop nginx to free port 80
if systemctl is-active --quiet nginx; then
    systemctl stop nginx
    echo -e "  ✓ Nginx stopped"
elif docker ps | grep -q kamiyo-nginx; then
    docker-compose -f docker-compose.production.yml stop nginx
    echo -e "  ✓ Docker Nginx stopped"
else
    echo -e "  ✓ Nginx not running"
fi

echo -e "\n${GREEN}Step 3: Obtaining SSL Certificate${NC}"

# Run certbot
certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$ADMIN_EMAIL_SSL" \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"

if [ $? -eq 0 ]; then
    echo -e "  ✓ SSL certificate obtained"
else
    echo -e "${RED}ERROR: Failed to obtain certificate${NC}"
    exit 1
fi

echo -e "\n${GREEN}Step 4: Copying certificates to Nginx${NC}"

# Create nginx ssl directory
mkdir -p nginx/ssl

# Copy certificates
cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem nginx/ssl/

# Set permissions
chmod 644 nginx/ssl/fullchain.pem
chmod 600 nginx/ssl/privkey.pem

echo -e "  ✓ Certificates copied"

echo -e "\n${GREEN}Step 5: Setting up auto-renewal${NC}"

# Create renewal hook script
cat > /etc/letsencrypt/renewal-hooks/deploy/kamiyo-reload.sh << 'EOF'
#!/bin/bash
# Reload Nginx after certificate renewal

DOMAIN=$(cat /etc/letsencrypt/renewal/*.conf | grep "domains =" | head -1 | sed 's/domains = //')
NGINX_SSL_DIR="/path/to/kamiyo/nginx/ssl"

# Copy new certificates
cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $NGINX_SSL_DIR/
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem $NGINX_SSL_DIR/

# Reload Nginx
if docker ps | grep -q kamiyo-nginx; then
    docker-compose -f /path/to/kamiyo/docker-compose.production.yml exec nginx nginx -s reload
elif systemctl is-active --quiet nginx; then
    systemctl reload nginx
fi

echo "SSL certificates renewed and Nginx reloaded"
EOF

# Update paths in hook script
sed -i "s|/path/to/kamiyo|$(pwd)|g" /etc/letsencrypt/renewal-hooks/deploy/kamiyo-reload.sh

# Make executable
chmod +x /etc/letsencrypt/renewal-hooks/deploy/kamiyo-reload.sh

# Test renewal (dry run)
certbot renew --dry-run

echo -e "  ✓ Auto-renewal configured"

echo -e "\n${GREEN}Step 6: Creating renewal cron job${NC}"

# Add cron job for renewal check (twice daily)
(crontab -l 2>/dev/null; echo "0 0,12 * * * certbot renew --quiet") | crontab -

echo -e "  ✓ Cron job created"

echo -e "\n${GREEN}Step 7: Verifying SSL setup${NC}"

# Check certificate expiry
certbot certificates | grep "$DOMAIN"

echo -e "\n${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  SSL Setup Complete! ✓${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"

echo -e "\nCertificate details:"
echo -e "  Domain: $DOMAIN"
echo -e "  Location: /etc/letsencrypt/live/$DOMAIN/"
echo -e "  Expiry: 90 days (auto-renewal enabled)"
echo -e "  Renewal: Checked twice daily"

echo -e "\nNext steps:"
echo -e "  1. Start Nginx: docker-compose -f docker-compose.production.yml up -d nginx"
echo -e "  2. Test HTTPS: https://$DOMAIN"
echo -e "  3. Check renewal: sudo certbot renew --dry-run"

echo -e "\n${GREEN}Done!${NC}"
