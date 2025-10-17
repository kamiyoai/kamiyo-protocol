#!/bin/bash
# Security Audit Script for Kamiyo
# Checks security configuration and identifies vulnerabilities

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ISSUES=0

echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Kamiyo Security Audit${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}\n"

# Check 1: Environment file security
echo -e "${GREEN}[1/10] Checking environment file security...${NC}"

if [ -f ".env.production" ]; then
    PERMS=$(stat -c %a .env.production 2>/dev/null || stat -f %A .env.production 2>/dev/null)
    if [ "$PERMS" != "600" ]; then
        echo -e "  ${RED}✗ .env.production has permissive permissions: $PERMS${NC}"
        echo -e "    Fix: chmod 600 .env.production"
        ((ISSUES++))
    else
        echo -e "  ${GREEN}✓ Environment file permissions correct${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠ .env.production not found${NC}"
fi

# Check 2: SSL/TLS certificates
echo -e "\n${GREEN}[2/10] Checking SSL certificates...${NC}"

if [ -d "nginx/ssl" ]; then
    if [ -f "nginx/ssl/fullchain.pem" ] && [ -f "nginx/ssl/privkey.pem" ]; then
        # Check expiry
        EXPIRY=$(openssl x509 -enddate -noout -in nginx/ssl/fullchain.pem 2>/dev/null | cut -d= -f2)
        echo -e "  ${GREEN}✓ SSL certificates present${NC}"
        echo -e "    Expiry: $EXPIRY"
    else
        echo -e "  ${RED}✗ SSL certificates not found${NC}"
        echo -e "    Run: sudo ./scripts/setup_ssl.sh"
        ((ISSUES++))
    fi
else
    echo -e "  ${YELLOW}⚠ SSL directory not found${NC}"
fi

# Check 3: Docker secrets
echo -e "\n${GREEN}[3/10] Checking Docker secrets...${NC}"

if [ -d "secrets" ]; then
    if [ -f "secrets/db_password.txt" ]; then
        PERMS=$(stat -c %a secrets/db_password.txt 2>/dev/null || stat -f %A secrets/db_password.txt 2>/dev/null)
        if [ "$PERMS" != "600" ]; then
            echo -e "  ${RED}✗ Secret file has permissive permissions: $PERMS${NC}"
            ((ISSUES++))
        else
            echo -e "  ${GREEN}✓ Secret file permissions correct${NC}"
        fi
    else
        echo -e "  ${YELLOW}⚠ Database password secret not found${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠ Secrets directory not found${NC}"
fi

# Check 4: Fail2ban
echo -e "\n${GREEN}[4/10] Checking fail2ban...${NC}"

if systemctl is-active --quiet fail2ban 2>/dev/null; then
    echo -e "  ${GREEN}✓ Fail2ban is running${NC}"

    # Check if custom jails are active
    if fail2ban-client status | grep -q "kamiyo"; then
        echo -e "  ${GREEN}✓ Kamiyo jails are active${NC}"
    else
        echo -e "  ${YELLOW}⚠ Kamiyo jails not configured${NC}"
    fi
else
    echo -e "  ${RED}✗ Fail2ban is not running${NC}"
    echo -e "    Run: sudo ./scripts/setup_fail2ban.sh"
    ((ISSUES++))
fi

# Check 5: Database security
echo -e "\n${GREEN}[5/10] Checking database security...${NC}"

if docker ps | grep -q kamiyo-postgres; then
    # Check if postgres is exposed
    PORT=$(docker port kamiyo-postgres 5432 2>/dev/null | grep "0.0.0.0")
    if [ -n "$PORT" ]; then
        echo -e "  ${RED}✗ PostgreSQL is exposed on public interface${NC}"
        echo -e "    Risk: Database accessible from internet"
        ((ISSUES++))
    else
        echo -e "  ${GREEN}✓ PostgreSQL not publicly exposed${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠ PostgreSQL container not running${NC}"
fi

# Check 6: API security headers
echo -e "\n${GREEN}[6/10] Checking API security headers...${NC}"

if docker ps | grep -q kamiyo-api; then
    # Test security headers
    RESPONSE=$(curl -s -I http://localhost:8000/health 2>/dev/null)

    if echo "$RESPONSE" | grep -q "X-Content-Type-Options"; then
        echo -e "  ${GREEN}✓ Security headers present${NC}"
    else
        echo -e "  ${RED}✗ Security headers missing${NC}"
        echo -e "    Add security middleware to API"
        ((ISSUES++))
    fi
else
    echo -e "  ${YELLOW}⚠ API container not running${NC}"
fi

# Check 7: Rate limiting
echo -e "\n${GREEN}[7/10] Checking rate limiting...${NC}"

if docker ps | grep -q kamiyo-redis; then
    echo -e "  ${GREEN}✓ Redis (rate limiting) is running${NC}"
else
    echo -e "  ${RED}✗ Redis is not running${NC}"
    echo -e "    Rate limiting disabled without Redis"
    ((ISSUES++))
fi

# Check 8: Log file permissions
echo -e "\n${GREEN}[8/10] Checking log file permissions...${NC}"

if [ -d "logs" ]; then
    INSECURE_LOGS=$(find logs -type f ! -perm 600 2>/dev/null)
    if [ -n "$INSECURE_LOGS" ]; then
        echo -e "  ${RED}✗ Some log files have insecure permissions${NC}"
        echo "$INSECURE_LOGS"
        ((ISSUES++))
    else
        echo -e "  ${GREEN}✓ Log file permissions correct${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠ Logs directory not found${NC}"
fi

# Check 9: Docker security
echo -e "\n${GREEN}[9/10] Checking Docker security...${NC}"

# Check if containers run as non-root
ROOT_CONTAINERS=$(docker ps --format '{{.Names}}' | while read name; do
    USER=$(docker inspect --format='{{.Config.User}}' $name 2>/dev/null)
    if [ -z "$USER" ] || [ "$USER" = "root" ]; then
        echo $name
    fi
done)

if [ -n "$ROOT_CONTAINERS" ]; then
    echo -e "  ${RED}✗ Some containers run as root:${NC}"
    echo "$ROOT_CONTAINERS"
    ((ISSUES++))
else
    echo -e "  ${GREEN}✓ All containers run as non-root users${NC}"
fi

# Check 10: Firewall
echo -e "\n${GREEN}[10/10] Checking firewall...${NC}"

if command -v ufw &> /dev/null; then
    if ufw status | grep -q "Status: active"; then
        echo -e "  ${GREEN}✓ UFW firewall is active${NC}"
    else
        echo -e "  ${RED}✗ UFW firewall is inactive${NC}"
        ((ISSUES++))
    fi
elif command -v firewalld &> /dev/null; then
    if systemctl is-active --quiet firewalld; then
        echo -e "  ${GREEN}✓ Firewalld is active${NC}"
    else
        echo -e "  ${RED}✗ Firewalld is inactive${NC}"
        ((ISSUES++))
    fi
else
    echo -e "  ${YELLOW}⚠ No firewall detected${NC}"
fi

# Summary
echo -e "\n${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Audit Summary${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}\n"

if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}✓ No security issues found!${NC}"
    echo -e "\nYour Kamiyo installation is secure."
else
    echo -e "${RED}✗ Found $ISSUES security issue(s)${NC}"
    echo -e "\nPlease address the issues above."
    echo -e "\nRecommended actions:"
    echo -e "  1. Review all ${RED}✗${NC} items above"
    echo -e "  2. Fix environment file permissions"
    echo -e "  3. Setup SSL certificates"
    echo -e "  4. Configure fail2ban"
    echo -e "  5. Enable firewall"
    echo -e "  6. Run audit again"
fi

echo -e "\n${GREEN}Done!${NC}"

exit $ISSUES
