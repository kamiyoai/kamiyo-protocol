# KAMIYO Custom Domain Setup Guide

## Overview

This guide provides comprehensive instructions for configuring custom domains for the KAMIYO production environment on Render.com. You'll learn how to set up custom domains for both the API and frontend services, configure DNS records, enable HTTPS, and troubleshoot common issues.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Domain Architecture](#domain-architecture)
3. [DNS Provider Setup](#dns-provider-setup)
4. [API Domain Configuration](#api-domain-configuration)
5. [Frontend Domain Configuration](#frontend-domain-configuration)
6. [SSL Certificate Setup](#ssl-certificate-setup)
7. [HTTPS Enforcement](#https-enforcement)
8. [Domain Verification](#domain-verification)
9. [DNS Propagation](#dns-propagation)
10. [Troubleshooting](#troubleshooting)
11. [Advanced Configuration](#advanced-configuration)

---

## Prerequisites

Before setting up custom domains, ensure you have:

- [ ] **Domain purchased and registered**
  - Domain: `kamiyo.ai`
  - Registrar: (e.g., Namecheap, GoDaddy, Google Domains, Cloudflare)
  - Domain unlocked (not under registrar lock)

- [ ] **Access to DNS management**
  - DNS provider credentials
  - Ability to add/modify DNS records
  - Know your DNS provider's TTL settings

- [ ] **Render.com account with services deployed**
  - API service: `api-kamiyo-ai`
  - Frontend service: `frontend-kamiyo-ai`
  - Both services must be on paid plans for custom domains
  - Services must be running and healthy

- [ ] **Understanding of DNS concepts**
  - A records (IPv4 addresses)
  - CNAME records (aliases)
  - ALIAS/ANAME records (root domain aliases)
  - TTL (Time To Live)

---

## Domain Architecture

### Recommended Domain Structure

```
kamiyo.ai                    → Frontend (root domain)
www.kamiyo.ai                → Frontend (www subdomain)
api.kamiyo.ai                → API Backend
status.kamiyo.ai             → Status page (optional)
docs.kamiyo.ai               → Documentation (optional)
```

### Service Mapping

| Domain | Service | Purpose | Record Type |
|--------|---------|---------|-------------|
| kamiyo.ai | Frontend | Main website | ALIAS/A |
| www.kamiyo.ai | Frontend | WWW variant | CNAME |
| api.kamiyo.ai | API Backend | API endpoints | CNAME |
| status.kamiyo.ai | UptimeRobot | Status page | CNAME |

### Why This Structure?

**Root Domain (kamiyo.ai):**
- Most memorable and professional
- Used for main website/landing page
- Handles users who don't type "www"

**WWW Subdomain (www.kamiyo.ai):**
- Traditional web convention
- Some users expect it
- Can redirect to root or serve same content

**API Subdomain (api.kamiyo.ai):**
- Clearly separates API from frontend
- Allows independent scaling and management
- Standard industry practice
- Enables CORS configuration

**Status Subdomain (status.kamiyo.ai):**
- Public transparency
- Separate from main service
- Won't go down if main service does

---

## DNS Provider Setup

### Identifying Your DNS Provider

Your DNS might be managed by:
1. **Your domain registrar** (where you bought the domain)
   - Namecheap, GoDaddy, Google Domains
2. **A separate DNS service**
   - Cloudflare, Route53, DNSimple
3. **Your hosting provider**
   - If you previously hosted elsewhere

**To find out:**
1. Visit https://www.whatsmydns.net
2. Enter your domain: `kamiyo.ai`
3. Check the NS (nameserver) records
4. The nameservers indicate who manages your DNS

### Common DNS Providers

#### Cloudflare (Recommended)

**Advantages:**
- Free tier with excellent features
- Fast DNS propagation
- Built-in DDoS protection
- Analytics and caching
- Easy to use interface

**Setup:**
1. Create account at https://cloudflare.com
2. Add your domain
3. Cloudflare will scan existing records
4. Update nameservers at registrar to Cloudflare's
5. Wait for nameserver propagation (up to 48 hours)

**Nameserver Format:**
```
Name servers:
  ada.ns.cloudflare.com
  cash.ns.cloudflare.com
```

#### Namecheap

**If domain registered with Namecheap:**
1. Log in to Namecheap account
2. Go to "Domain List"
3. Click "Manage" next to kamiyo.ai
4. Navigate to "Advanced DNS" tab
5. Add/modify records as needed

**Nameserver Format:**
```
Name servers (default):
  dns1.registrar-servers.com
  dns2.registrar-servers.com
```

#### GoDaddy

**If domain registered with GoDaddy:**
1. Log in to GoDaddy account
2. Go to "My Products"
3. Find kamiyo.ai and click "DNS"
4. Modify DNS records

#### Google Domains

**If domain registered with Google:**
1. Log in to Google Domains
2. Find kamiyo.ai
3. Click "DNS"
4. Navigate to "Custom resource records"
5. Add/modify records

#### AWS Route53

**If using AWS Route53:**
1. Log in to AWS Console
2. Navigate to Route53
3. Find Hosted Zone for kamiyo.ai
4. Create/modify records

### DNS Management Best Practices

**Before making changes:**
1. Document current DNS records (take screenshots)
2. Lower TTL values to 300 seconds (5 minutes)
3. Wait for old TTL to expire before making changes
4. Make changes during low-traffic periods

**After making changes:**
1. Wait for propagation
2. Test from multiple locations
3. Increase TTL back to 3600+ seconds (1 hour+)
4. Update documentation

---

## API Domain Configuration

### Step 1: Get Render DNS Information

1. **Log in to Render Dashboard:**
   - Visit https://dashboard.render.com
   - Navigate to your API service (`api-kamiyo-ai`)

2. **Access Custom Domain Settings:**
   - Click on your API service
   - Navigate to "Settings" tab
   - Scroll to "Custom Domains" section
   - Click "Add Custom Domain"

3. **Enter Domain:**
   - Domain: `api.kamiyo.ai`
   - Click "Save"

4. **Note the DNS target:**
   - Render will provide a CNAME target
   - Format: `[service-name].onrender.com`
   - Example: `api-kamiyo-ai.onrender.com`
   - **Copy this value** - you'll need it for DNS configuration

### Step 2: Configure DNS Records

Add the following record in your DNS provider:

**Record Configuration:**
```yaml
Type: CNAME
Name: api
Value: api-kamiyo-ai.onrender.com
TTL: 3600 (or Auto)
```

**Provider-Specific Instructions:**

**Cloudflare:**
```
Type: CNAME
Name: api
Target: api-kamiyo-ai.onrender.com
Proxy status: DNS only (click to turn off orange cloud)
TTL: Auto
```

**Important:** For Cloudflare, disable the proxy (orange cloud) during initial setup. You can enable it later once domain is verified.

**Namecheap:**
```
Type: CNAME Record
Host: api
Value: api-kamiyo-ai.onrender.com
TTL: Automatic
```

**GoDaddy:**
```
Type: CNAME
Name: api
Value: api-kamiyo-ai.onrender.com
TTL: 1 Hour
```

**Google Domains:**
```
Name: api
Type: CNAME
TTL: 1H
Data: api-kamiyo-ai.onrender.com
```

### Step 3: Verify DNS Configuration

**Using command line:**

```bash
# Check if CNAME is set correctly
dig api.kamiyo.ai CNAME +short
# Expected output: api-kamiyo-ai.onrender.com

# Check full DNS resolution
dig api.kamiyo.ai +short
# Expected output: IP address(es)
```

**Using online tools:**
- https://www.whatsmydns.net/#CNAME/api.kamiyo.ai
- Check from multiple global locations
- Verify CNAME points to Render

**Using browser:**
```bash
# Once DNS propagates, test:
curl https://api.kamiyo.ai/health
# Should return health check response
```

### Step 4: Wait for Render Verification

1. **Render will automatically verify:**
   - DNS propagation detected
   - SSL certificate provisioned
   - Domain becomes active

2. **Verification time:**
   - Usually 1-10 minutes after DNS propagates
   - Can take up to 1 hour
   - Check "Custom Domains" section for status

3. **Status indicators:**
   - ⏳ Pending: Waiting for DNS propagation
   - ⚠️ Verification Failed: DNS not configured correctly
   - ✅ Active: Domain is live with SSL

### Step 5: Test API Domain

```bash
# Test health endpoint
curl https://api.kamiyo.ai/health

# Should return:
{
  "status": "healthy",
  "timestamp": "2025-10-29T12:00:00Z"
}

# Test ready endpoint
curl https://api.kamiyo.ai/ready

# Test HTTPS redirect (should redirect HTTP to HTTPS)
curl -I http://api.kamiyo.ai/health

# Should return:
HTTP/1.1 301 Moved Permanently
Location: https://api.kamiyo.ai/health
```

### Step 6: Update Application Configuration

After API domain is verified, update your application to use the custom domain:

**Environment Variables (if needed):**
```bash
# In Render dashboard, update environment variables
API_BASE_URL=https://api.kamiyo.ai
CORS_ORIGINS=https://kamiyo.ai,https://www.kamiyo.ai
```

**Frontend API Calls:**

Update your frontend code to use the custom API domain:

```javascript
// Before (using Render default domain)
const API_BASE = 'https://api-kamiyo-ai.onrender.com';

// After (using custom domain)
const API_BASE = 'https://api.kamiyo.ai';
```

**CORS Configuration:**

Ensure your API allows requests from your frontend domains:

```python
# api/main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://kamiyo.ai",
        "https://www.kamiyo.ai",
        "http://localhost:3000",  # For local development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Frontend Domain Configuration

### Overview

Frontend configuration requires two domains:
1. Root domain: `kamiyo.ai`
2. WWW subdomain: `www.kamiyo.ai`

Both will point to the same Render service, and Render will handle both.

### Step 1: Get Render DNS Information

1. **Navigate to Frontend Service:**
   - Dashboard → Frontend service (`frontend-kamiyo-ai`)
   - Settings → Custom Domains

2. **Add Root Domain:**
   - Click "Add Custom Domain"
   - Enter: `kamiyo.ai`
   - Click "Save"
   - Note the provided DNS target

3. **Add WWW Subdomain:**
   - Click "Add Custom Domain" again
   - Enter: `www.kamiyo.ai`
   - Click "Save"
   - Note the provided DNS target

4. **DNS Targets:**
   - Render provides CNAME-like targets
   - Format: `[service-name].onrender.com`
   - Example: `frontend-kamiyo-ai.onrender.com`

### Step 2: Configure DNS for Root Domain

**Challenge:** CNAME records cannot be used for root domains per DNS specification.

**Solution:** Use ALIAS or ANAME records (if supported), or A records.

#### Option A: ALIAS Record (Recommended - if supported)

**Supported by:**
- Cloudflare
- DNSimple
- DNS Made Easy
- Route53 (as "Alias" records)

**Configuration:**
```yaml
Type: ALIAS (or ANAME)
Name: @ (or leave blank for root)
Target: frontend-kamiyo-ai.onrender.com
TTL: Auto
```

**Cloudflare Example:**
```
Type: CNAME
Name: @ (or kamiyo.ai)
Target: frontend-kamiyo-ai.onrender.com
Proxy status: DNS only (disable orange cloud initially)
TTL: Auto
```

Note: Cloudflare allows CNAME at root via DNS flattening.

**Route53 Example:**
```
Type: A - Alias
Name: [leave blank]
Alias Target: frontend-kamiyo-ai.onrender.com
```

#### Option B: A Records (If ALIAS not supported)

**If your DNS provider doesn't support ALIAS:**

You'll need to get Render's IP addresses and create A records.

**Get Render IPs:**

```bash
# Resolve Render's service to get IPs
dig frontend-kamiyo-ai.onrender.com +short

# Example output:
216.24.57.1
216.24.57.2
```

**Configure A Records:**
```yaml
Type: A
Name: @ (or leave blank)
Value: 216.24.57.1
TTL: 3600

Type: A
Name: @ (or leave blank)
Value: 216.24.57.2
TTL: 3600
```

**Drawback:** If Render changes IPs, you'll need to update manually. ALIAS is strongly preferred.

### Step 3: Configure DNS for WWW Subdomain

This is straightforward - use a CNAME:

```yaml
Type: CNAME
Name: www
Target: frontend-kamiyo-ai.onrender.com
TTL: 3600
```

**Provider-Specific:**

**Cloudflare:**
```
Type: CNAME
Name: www
Target: frontend-kamiyo-ai.onrender.com
Proxy status: DNS only (initially)
TTL: Auto
```

**Namecheap:**
```
Type: CNAME Record
Host: www
Value: frontend-kamiyo-ai.onrender.com
TTL: Automatic
```

**Google Domains:**
```
Name: www
Type: CNAME
TTL: 1H
Data: frontend-kamiyo-ai.onrender.com
```

### Step 4: Complete DNS Configuration Example

Here's a complete DNS configuration for KAMIYO:

```
# Root domain - Frontend
Type: ALIAS (or CNAME with Cloudflare)
Name: @
Target: frontend-kamiyo-ai.onrender.com
TTL: Auto

# WWW subdomain - Frontend
Type: CNAME
Name: www
Target: frontend-kamiyo-ai.onrender.com
TTL: 3600

# API subdomain - API Backend
Type: CNAME
Name: api
Target: api-kamiyo-ai.onrender.com
TTL: 3600

# Status page - UptimeRobot (optional)
Type: CNAME
Name: status
Target: stats.uptimerobot.com
TTL: 3600
```

### Step 5: Verify DNS Propagation

**Check root domain:**
```bash
# Check if root domain resolves
dig kamiyo.ai +short
# Should show IP address(es)

# Check ALIAS/CNAME chain
dig kamiyo.ai CNAME +short
# May show frontend-kamiyo-ai.onrender.com (if CNAME/ALIAS)
```

**Check www subdomain:**
```bash
# Check CNAME
dig www.kamiyo.ai CNAME +short
# Should show: frontend-kamiyo-ai.onrender.com

# Check resolution
dig www.kamiyo.ai +short
# Should show IP address(es)
```

**Check globally:**
- Visit https://www.whatsmydns.net/#A/kamiyo.ai
- Check from 10+ global locations
- Verify consistent results

### Step 6: Wait for Render Verification

1. **Monitor Custom Domains section in Render:**
   - Both domains should show "Pending"
   - SSL certificates will be provisioned automatically
   - Status will change to "Active" when ready

2. **Timeframe:**
   - DNS propagation: 5 minutes to 48 hours (usually < 1 hour)
   - SSL provisioning: 1-10 minutes after DNS verified
   - Total: Usually 15-60 minutes

3. **Status Updates:**
   - ⏳ Pending: Waiting for DNS
   - 🔄 Provisioning SSL: DNS verified, getting certificate
   - ✅ Active: Domain live with HTTPS
   - ❌ Failed: DNS issue (check configuration)

### Step 7: Test Frontend Domains

```bash
# Test root domain
curl -I https://kamiyo.ai
# Should return: HTTP/2 200

# Test www subdomain
curl -I https://www.kamiyo.ai
# Should return: HTTP/2 200

# Test HTTP to HTTPS redirect
curl -I http://kamiyo.ai
# Should return: HTTP/1.1 301 Moved Permanently
# Location: https://kamiyo.ai

# Test with browser
# Visit both https://kamiyo.ai and https://www.kamiyo.ai
# Both should load your site with valid SSL
```

### Step 8: Configure WWW Redirect (Optional)

You may want to redirect one domain to the other (common practice):

**Option 1: Redirect www to root (Recommended)**
```
www.kamiyo.ai → redirects to → kamiyo.ai
```

**Option 2: Redirect root to www**
```
kamiyo.ai → redirects to → www.kamiyo.ai
```

**Implementation:**

Render automatically handles both domains serving the same content. To set up a redirect, you can:

**A. Use Cloudflare Page Rules (if using Cloudflare):**

1. In Cloudflare dashboard:
2. Page Rules → Create Page Rule
3. URL: `www.kamiyo.ai/*`
4. Setting: Forwarding URL (301 Permanent Redirect)
5. Destination: `https://kamiyo.ai/$1`
6. Save and Deploy

**B. Use Render Redirects (in render.yaml):**

```yaml
# render.yaml
services:
  - type: web
    name: frontend-kamiyo-ai
    # ... other settings ...
    headers:
      - path: /*
        name: X-Robots-Tag
        value: index

# Or use Next.js redirects in next.config.js:
async redirects() {
  return [
    {
      source: '/:path*',
      has: [
        {
          type: 'host',
          value: 'www.kamiyo.ai',
        },
      ],
      destination: 'https://kamiyo.ai/:path*',
      permanent: true,
    },
  ]
}
```

**C. Use Next.js Middleware:**

```javascript
// middleware.js
import { NextResponse } from 'next/server';

export function middleware(request) {
  const host = request.headers.get('host');

  // Redirect www to non-www
  if (host?.startsWith('www.')) {
    const newHost = host.replace('www.', '');
    const newUrl = new URL(request.url);
    newUrl.host = newHost;
    return NextResponse.redirect(newUrl, 301);
  }

  return NextResponse.next();
}
```

---

## SSL Certificate Setup

### Automatic SSL with Render

Render automatically provisions and manages SSL certificates via Let's Encrypt.

**Features:**
- Free SSL certificates
- Automatic renewal (every 60 days)
- No manual intervention required
- Supports wildcard certificates (on higher plans)
- Perfect Forward Secrecy
- TLS 1.2 and 1.3 support

### Verification Process

1. **DNS Verification:**
   - Render verifies you control the domain via DNS
   - Creates ACME challenge records automatically
   - Validates against Let's Encrypt

2. **Certificate Issuance:**
   - Let's Encrypt issues certificate
   - Certificate valid for 90 days
   - Automatically renewed at 60 days

3. **Installation:**
   - Render automatically installs certificate
   - Configures HTTPS endpoints
   - Sets up HTTP → HTTPS redirects

### Checking Certificate Status

**Via Render Dashboard:**
1. Navigate to service
2. Settings → Custom Domains
3. Check SSL status for each domain
4. Should show: "SSL Certificate: Active"

**Via Browser:**
1. Visit your domain in browser
2. Click padlock icon in address bar
3. View certificate details
4. Verify:
   - Issued to: Your domain
   - Issued by: Let's Encrypt
   - Valid from/to dates
   - Subject Alternative Names (should include both kamiyo.ai and www.kamiyo.ai)

**Via Command Line:**

```bash
# Check certificate details
openssl s_client -connect kamiyo.ai:443 -servername kamiyo.ai < /dev/null 2>/dev/null | openssl x509 -noout -text

# Or simpler:
echo | openssl s_client -servername kamiyo.ai -connect kamiyo.ai:443 2>/dev/null | openssl x509 -noout -dates -subject

# Check certificate expiry
echo | openssl s_client -servername kamiyo.ai -connect kamiyo.ai:443 2>/dev/null | openssl x509 -noout -enddate

# Expected output:
notAfter=Jan 27 12:00:00 2026 GMT
```

**Via Online Tools:**
- SSL Labs: https://www.ssllabs.com/ssltest/analyze.html?d=kamiyo.ai
  - Should get A or A+ rating
- Check My SSL: https://www.checkmyssl.net/

### SSL Certificate Monitoring

**Automated Monitoring:**

Set up monitoring for certificate expiry (should auto-renew, but good to verify):

1. **Via UptimeRobot:**
   - Already configured if following uptime monitoring guide
   - Alerts 7 days before expiry

2. **Via Certificate Monitoring Service:**
   - SSL Labs monitoring
   - Better Uptime
   - CertBot monitoring

3. **Via Custom Script:**

```bash
#!/bin/bash
# check_ssl_expiry.sh

DOMAIN="kamiyo.ai"
DAYS_WARNING=15

# Get expiry date
EXPIRY=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)

# Convert to timestamp
EXPIRY_TIMESTAMP=$(date -d "$EXPIRY" +%s)
NOW_TIMESTAMP=$(date +%s)

# Calculate days remaining
DAYS_REMAINING=$(( ($EXPIRY_TIMESTAMP - $NOW_TIMESTAMP) / 86400 ))

if [ $DAYS_REMAINING -lt $DAYS_WARNING ]; then
  echo "WARNING: SSL certificate for $DOMAIN expires in $DAYS_REMAINING days"
  # Send alert (email, Slack, etc.)
else
  echo "OK: SSL certificate for $DOMAIN valid for $DAYS_REMAINING more days"
fi
```

### SSL Troubleshooting

**Issue: Certificate Not Provisioning**

**Symptoms:**
- Domain shows "Pending" for more than 1 hour
- SSL status shows error

**Solutions:**

1. **Verify DNS is correct:**
   ```bash
   dig kamiyo.ai +short
   # Should resolve to Render IPs
   ```

2. **Check DNS propagation globally:**
   - Use https://www.whatsmydns.net
   - Verify 90%+ locations resolve correctly

3. **Remove and re-add domain:**
   - In Render dashboard: Delete custom domain
   - Wait 5 minutes
   - Re-add custom domain

4. **Check for conflicting DNS records:**
   - Remove duplicate A/CNAME records
   - Ensure only one record per name

5. **Verify domain ownership:**
   - Ensure domain is not in use elsewhere
   - Check no CAA records blocking Let's Encrypt

**Issue: Mixed Content Warnings**

**Symptoms:**
- Padlock shows warning
- Console shows "Mixed Content" errors
- Some resources loading over HTTP

**Solution:**

Update all resources to use HTTPS:

```javascript
// Before (insecure)
<img src="http://example.com/image.jpg" />
<script src="http://example.com/script.js"></script>

// After (secure)
<img src="https://example.com/image.jpg" />
<script src="https://example.com/script.js"></script>

// Or use protocol-relative URLs
<img src="//example.com/image.jpg" />
```

**Issue: Certificate Shows Wrong Domain**

**Symptoms:**
- Certificate issued to Render's domain, not yours
- Name mismatch error

**Solution:**
- Wait for custom domain SSL to provision
- May take up to 1 hour after DNS verification
- Check "Custom Domains" section in Render dashboard

---

## HTTPS Enforcement

### Automatic HTTPS Redirect

Render automatically redirects HTTP to HTTPS for all custom domains.

**Default Behavior:**
```
http://kamiyo.ai → redirects to → https://kamiyo.ai (301)
http://www.kamiyo.ai → redirects to → https://www.kamiyo.ai (301)
http://api.kamiyo.ai → redirects to → https://api.kamiyo.ai (301)
```

### Testing HTTPS Enforcement

```bash
# Test that HTTP redirects to HTTPS
curl -I http://kamiyo.ai

# Expected response:
HTTP/1.1 301 Moved Permanently
Location: https://kamiyo.ai/
...

# Test that HTTPS works
curl -I https://kamiyo.ai

# Expected response:
HTTP/2 200
...
```

### HSTS (HTTP Strict Transport Security)

For enhanced security, enable HSTS headers:

**Add HSTS Header in Next.js:**

```javascript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
        ],
      },
    ];
  },
};
```

**Or in Render Configuration:**

```yaml
# render.yaml
services:
  - type: web
    name: frontend-kamiyo-ai
    headers:
      - path: /*
        name: Strict-Transport-Security
        value: max-age=63072000; includeSubDomains; preload
```

**HSTS Preload (Optional but Recommended):**

Submit your domain to the HSTS Preload list:
1. Ensure HSTS header includes `preload` directive
2. Visit https://hstspreload.org
3. Enter domain: `kamiyo.ai`
4. Check requirements
5. Submit for inclusion
6. Wait for inclusion (can take weeks)

**Benefits:**
- Browsers always use HTTPS for your domain
- Prevents protocol downgrade attacks
- No HTTP request ever sent

### Content Security Policy

For additional security, add CSP headers:

```javascript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://api.kamiyo.ai",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests"
            ].join('; ')
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ],
      },
    ];
  },
};
```

---

## Domain Verification

### Render Domain Verification Process

Render verifies domain ownership through DNS resolution:

1. **Add Custom Domain in Render:**
   - Render shows you what DNS records to create

2. **Configure DNS Records:**
   - Add CNAME/ALIAS/A records as specified

3. **Render Polls DNS:**
   - Checks every few minutes
   - Looks for correct DNS records
   - Verifies records point to Render infrastructure

4. **Verification Success:**
   - Domain status changes to "Active"
   - SSL certificate automatically provisioned
   - Domain becomes live

### Verification Timeline

**Typical timeline:**
```
0 min:    Add domain in Render, configure DNS
5-10 min: DNS propagates to Render's nameservers
10-15 min: Render verifies DNS and requests SSL certificate
15-20 min: Let's Encrypt issues SSL certificate
20-25 min: Render installs certificate and activates domain
```

**Total time:** Usually 20-30 minutes, can be up to 2 hours.

### Checking Verification Status

**In Render Dashboard:**
1. Navigate to service
2. Settings → Custom Domains
3. Check status next to each domain:
   - ⏳ Pending - Waiting for DNS
   - 🔄 Provisioning - Getting SSL
   - ✅ Active - Live
   - ❌ Failed - Error (check DNS)

**Verification Logs:**

Render may show verification logs:
```
Verifying DNS for api.kamiyo.ai...
DNS verified successfully
Requesting SSL certificate...
SSL certificate issued
Domain is now active
```

### Manual Verification

Verify yourself that DNS is correct before Render checks:

```bash
# Check your domain resolves to Render
dig kamiyo.ai +short

# Expected: IP addresses belonging to Render
# Compare to:
dig frontend-kamiyo-ai.onrender.com +short

# Should see same or similar IPs

# Check CNAME (for subdomains)
dig www.kamiyo.ai CNAME +short
# Expected: frontend-kamiyo-ai.onrender.com

dig api.kamiyo.ai CNAME +short
# Expected: api-kamiyo-ai.onrender.com
```

### Troubleshooting Verification Failures

**Failure: "DNS not configured correctly"**

**Solution:**
1. Verify DNS records exactly match Render's instructions
2. Wait longer - DNS can take up to 48 hours
3. Check from multiple locations: https://www.whatsmydns.net
4. Ensure no typos in DNS records
5. Remove any conflicting records (duplicate A/CNAME)

**Failure: "Domain already in use"**

**Solution:**
1. Domain might be added to another Render service
2. Remove from other service first
3. Ensure domain isn't being used elsewhere (old hosting)

**Failure: "SSL certificate provisioning failed"**

**Solution:**
1. Check for CAA DNS records blocking Let's Encrypt:
   ```bash
   dig kamiyo.ai CAA
   # If CAA records exist, ensure letsencrypt.org is allowed
   ```
2. Wait and retry - temporary Let's Encrypt issues happen
3. Remove and re-add domain in Render

---

## DNS Propagation

### What is DNS Propagation?

DNS propagation is the time it takes for DNS changes to spread across the internet.

**Timeline:**
- Local ISP: 5-15 minutes
- Global: 1-4 hours
- Full propagation: Up to 48 hours (maximum)
- Typical: 30 minutes to 2 hours

### Factors Affecting Propagation Time

**TTL (Time To Live):**
- Lower TTL = Faster propagation
- Higher TTL = Slower propagation
- Recommended: 3600 seconds (1 hour) for production
- For migrations: Lower to 300 seconds (5 minutes) temporarily

**DNS Provider:**
- Cloudflare: Very fast (minutes)
- Traditional DNS: Slower (hours)
- Quality of nameserver network matters

**Caching:**
- ISPs cache DNS records
- Browsers cache DNS
- Operating systems cache DNS
- Each has different expiration times

### Checking DNS Propagation

**Tool 1: What's My DNS**
- https://www.whatsmydns.net
- Enter your domain
- Select record type (A, CNAME, etc.)
- Check from 20+ global locations
- Green checkmarks = propagated
- Red X = not yet propagated

**Tool 2: DNS Checker**
- https://dnschecker.org
- Similar to What's My DNS
- Shows more locations
- Includes NS record checking

**Tool 3: Command Line (Multiple DNS Servers)**

```bash
# Check from Google DNS
dig @8.8.8.8 kamiyo.ai +short

# Check from Cloudflare DNS
dig @1.1.1.1 kamiyo.ai +short

# Check from Quad9 DNS
dig @9.9.9.9 kamiyo.ai +short

# Check from local DNS (what your system sees)
dig kamiyo.ai +short

# All should return same result when fully propagated
```

**Tool 4: Online Dig Tools**
- https://toolbox.googleapps.com/apps/dig/
- https://www.digwebinterface.com/

### Speeding Up Propagation

**Before making changes:**
1. **Lower TTL values:**
   ```
   Current TTL: 86400 (24 hours)
   Lower to: 300 (5 minutes)
   ```
2. **Wait for old TTL to expire** (24 hours in example above)
3. **Then make DNS changes**
4. **New changes will propagate in 5 minutes**
5. **After verified, raise TTL back to 3600**

**Clear local DNS cache:**

```bash
# macOS
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# Linux
sudo systemd-resolve --flush-caches

# Windows
ipconfig /flushdns
```

**Clear browser DNS cache:**

**Chrome:**
1. Visit `chrome://net-internals/#dns`
2. Click "Clear host cache"

**Firefox:**
1. Type `about:networking#dns` in address bar
2. Click "Clear DNS Cache"

### Monitoring Propagation

**Script to Monitor Propagation:**

```bash
#!/bin/bash
# monitor_dns_propagation.sh

DOMAIN="kamiyo.ai"
EXPECTED_IP="216.24.57.1"  # Replace with expected IP

echo "Monitoring DNS propagation for $DOMAIN"
echo "Expected IP: $EXPECTED_IP"
echo ""

DNS_SERVERS=(
  "8.8.8.8"      # Google
  "1.1.1.1"      # Cloudflare
  "9.9.9.9"      # Quad9
  "208.67.222.222" # OpenDNS
)

while true; do
  echo "Checking at $(date)"
  ALL_MATCH=true

  for DNS in "${DNS_SERVERS[@]}"; do
    RESULT=$(dig @$DNS $DOMAIN +short | head -n1)
    if [ "$RESULT" = "$EXPECTED_IP" ]; then
      echo "  ✓ $DNS: $RESULT"
    else
      echo "  ✗ $DNS: $RESULT (expected $EXPECTED_IP)"
      ALL_MATCH=false
    fi
  done

  if [ "$ALL_MATCH" = true ]; then
    echo ""
    echo "✅ DNS fully propagated!"
    exit 0
  fi

  echo "  Waiting 60 seconds before next check..."
  echo ""
  sleep 60
done
```

Usage:
```bash
chmod +x monitor_dns_propagation.sh
./monitor_dns_propagation.sh
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: Domain Not Resolving

**Symptoms:**
- `dig domain.com` returns no results
- Browser shows "DNS_PROBE_FINISHED_NXDOMAIN"
- Domain doesn't load

**Diagnosis:**

```bash
# Check if domain exists
dig kamiyo.ai +short

# Check nameservers
dig kamiyo.ai NS +short

# Check if nameservers respond
dig @[nameserver] kamiyo.ai +short
```

**Solutions:**

1. **Verify nameservers are correct:**
   - Log in to domain registrar
   - Check nameserver configuration
   - Ensure pointing to correct DNS provider

2. **Verify DNS records exist:**
   - Log in to DNS provider
   - Confirm A/ALIAS/CNAME records are created
   - Check for typos

3. **Wait for propagation:**
   - DNS changes can take up to 48 hours
   - Check propagation: https://www.whatsmydns.net

4. **Check domain status:**
   - Ensure domain is not expired
   - Ensure domain is not locked
   - Verify domain is active at registrar

#### Issue 2: SSL Certificate Error

**Symptoms:**
- Browser shows "Your connection is not private"
- Certificate warning: "NET::ERR_CERT_COMMON_NAME_INVALID"
- Render shows certificate as invalid or pending

**Diagnosis:**

```bash
# Check certificate details
openssl s_client -connect kamiyo.ai:443 -servername kamiyo.ai

# Check what domain certificate is issued for
echo | openssl s_client -connect kamiyo.ai:443 2>/dev/null | openssl x509 -noout -subject
```

**Solutions:**

1. **Wait for SSL provisioning:**
   - Can take 10-30 minutes after DNS verification
   - Check status in Render dashboard

2. **Verify DNS is correct:**
   - SSL won't provision until DNS is verified
   - Check DNS resolution globally

3. **Remove and re-add domain:**
   - In Render: Delete custom domain
   - Wait 5 minutes
   - Re-add domain

4. **Check for CAA records:**
   ```bash
   dig kamiyo.ai CAA
   # If CAA exists, ensure it allows letsencrypt.org
   ```

5. **Clear browser SSL cache:**
   - Chrome: Settings → Privacy → Clear browsing data → Cached images and files
   - Try incognito mode

#### Issue 3: "ERR_TOO_MANY_REDIRECTS"

**Symptoms:**
- Browser shows infinite redirect loop
- Page never loads, keeps redirecting

**Diagnosis:**

```bash
# Check redirect chain
curl -I -L http://kamiyo.ai
# Look for circular redirects
```

**Solutions:**

1. **Check Cloudflare proxy settings:**
   - If using Cloudflare proxy (orange cloud)
   - Ensure SSL/TLS mode is "Full" or "Full (Strict)"
   - Not "Flexible"

   Steps:
   - Cloudflare dashboard → SSL/TLS
   - Change mode to "Full"

2. **Check redirect rules:**
   - Remove conflicting redirect rules
   - In Next.js, check redirects in next.config.js
   - In Cloudflare, check Page Rules

3. **Temporarily disable Cloudflare proxy:**
   - Click orange cloud to make it gray (DNS only)
   - Test if issue persists
   - If resolved, issue is Cloudflare configuration

#### Issue 4: API CORS Errors

**Symptoms:**
- Browser console shows CORS errors
- API requests fail with CORS policy errors
- Works with curl but not from browser

**Error Message:**
```
Access to fetch at 'https://api.kamiyo.ai' from origin 'https://kamiyo.ai'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header
is present on the requested resource.
```

**Solutions:**

1. **Update CORS configuration in API:**

```python
# api/main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://kamiyo.ai",
        "https://www.kamiyo.ai",
        "http://localhost:3000",  # Development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

2. **Redeploy API after changes**

3. **Verify CORS headers:**
```bash
curl -I -X OPTIONS https://api.kamiyo.ai/some-endpoint \
  -H "Origin: https://kamiyo.ai" \
  -H "Access-Control-Request-Method: GET"

# Should return:
Access-Control-Allow-Origin: https://kamiyo.ai
Access-Control-Allow-Methods: GET, POST, ...
```

4. **Check for mixed content:**
   - Frontend using HTTPS but API using HTTP
   - Ensure API endpoint uses https://api.kamiyo.ai

#### Issue 5: Slow DNS Resolution

**Symptoms:**
- Domain takes long time to load (first request)
- DNS lookup time is high in browser dev tools
- Intermittent timeouts

**Diagnosis:**

```bash
# Measure DNS lookup time
time dig kamiyo.ai +short

# Check from multiple DNS servers
for dns in 8.8.8.8 1.1.1.1 9.9.9.9; do
  echo "Testing $dns:"
  time dig @$dns kamiyo.ai +short
done
```

**Solutions:**

1. **Use faster DNS provider:**
   - Switch to Cloudflare (1.1.1.1)
   - Or Google (8.8.8.8)
   - These have better global performance

2. **Optimize TTL:**
   - Increase TTL to 3600 or higher
   - Reduces frequency of DNS lookups
   - Better caching

3. **Use DNS prefetching:**
   ```html
   <!-- In your HTML head -->
   <link rel="dns-prefetch" href="//api.kamiyo.ai">
   <link rel="preconnect" href="https://api.kamiyo.ai">
   ```

4. **Check nameserver performance:**
   - Some DNS providers are slow
   - Consider switching DNS provider

#### Issue 6: Domain Works on Desktop but Not Mobile

**Symptoms:**
- Domain loads fine on computer
- Doesn't work on phone or some devices

**Diagnosis:**

```bash
# Check DNS from mobile network
# Use online tools that check from mobile networks
# https://www.whatsmydns.net
```

**Solutions:**

1. **DNS propagation not complete:**
   - Mobile networks may cache DNS longer
   - Wait 24-48 hours for full propagation

2. **Mobile DNS cache:**
   - On iPhone: Settings → General → Reset → Reset Network Settings
   - On Android: Settings → Apps → Chrome → Clear Cache

3. **Mobile carrier DNS:**
   - Some carriers use slow/cached DNS
   - Try switching to mobile data or WiFi
   - Or vice versa

4. **IPv6 issues:**
   ```bash
   # Check if domain has IPv6 records
   dig kamiyo.ai AAAA +short

   # If issues, temporarily disable IPv6 or add AAAA records
   ```

#### Issue 7: Old Site Still Showing

**Symptoms:**
- Domain resolves correctly (confirmed with dig)
- But browser shows old/previous website
- Happens after migrating from another host

**Solutions:**

1. **Clear browser cache:**
   - Hard refresh: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)
   - Or clear all browsing data

2. **Check DNS is actually updated:**
   ```bash
   # Force query without cache
   dig kamiyo.ai +trace
   ```

3. **Check for service worker cache:**
   - Old site may have installed service worker
   - Chrome DevTools → Application → Service Workers → Unregister

4. **Wait for CDN/Proxy cache to expire:**
   - If using Cloudflare or CDN
   - May need to purge cache manually
   - Cloudflare: Caching → Purge Everything

5. **Verify no redirects to old site:**
   ```bash
   curl -I -L https://kamiyo.ai
   # Check redirect chain doesn't go to old site
   ```

---

## Advanced Configuration

### Custom Nameservers (Optional)

For more control, you can use custom nameservers:

**Why?**
- Branded nameservers (ns1.kamiyo.ai)
- More control over DNS
- Can use your own DNS server

**Setup:**
1. Register nameservers with registrar
2. Set up DNS server (BIND, PowerDNS, or service like NS1)
3. Point glue records to your DNS servers
4. Configure DNS zones

**Note:** This is advanced and not required for most deployments.

### DNSSEC (Domain Name System Security Extensions)

For enhanced security:

**What is DNSSEC?**
- Cryptographically signs DNS records
- Prevents DNS spoofing and cache poisoning
- Adds authenticity to DNS responses

**Setup:**
1. Check if DNS provider supports DNSSEC
2. Enable DNSSEC in DNS provider dashboard
3. Get DS records
4. Add DS records to domain registrar
5. Verify: https://dnssec-debugger.verisignlabs.com/

**Cloudflare DNSSEC:**
1. Cloudflare dashboard → DNS → DNSSEC
2. Enable DNSSEC
3. Copy DS record
4. Add to registrar

**Note:** Let's Encrypt SSL works fine without DNSSEC, but DNSSEC adds extra security.

### Multiple Environments

Setup separate domains for different environments:

```
Production:
  kamiyo.ai
  www.kamiyo.ai
  api.kamiyo.ai

Staging:
  staging.kamiyo.ai
  api-staging.kamiyo.ai

Development:
  dev.kamiyo.ai
  api-dev.kamiyo.ai
```

**DNS Configuration:**

```
# Production
@ → frontend-kamiyo-ai.onrender.com (ALIAS)
www → frontend-kamiyo-ai.onrender.com (CNAME)
api → api-kamiyo-ai.onrender.com (CNAME)

# Staging
staging → frontend-kamiyo-ai-staging.onrender.com (CNAME)
api-staging → api-kamiyo-ai-staging.onrender.com (CNAME)

# Dev
dev → frontend-kamiyo-ai-dev.onrender.com (CNAME)
api-dev → api-kamiyo-ai-dev.onrender.com (CNAME)
```

### Wildcard SSL Certificates

For subdomains like `*.kamiyo.ai`:

**Availability:**
- Render automatically provisions wildcard certs
- When you add `*.kamiyo.ai` as custom domain
- Available on Pro plans and above

**Use Cases:**
- User subdomains: `user123.kamiyo.ai`
- Dynamic subdomains
- Multi-tenant architecture

**Setup:**
1. Add `*.kamiyo.ai` in Render custom domains
2. Configure DNS:
   ```
   Type: CNAME
   Name: *
   Value: [render-service].onrender.com
   ```
3. Render provisions wildcard certificate

### Internationalized Domain Names (IDN)

For non-ASCII domain names:

**Example:**
- 日本.kamiyo.ai (Japanese)
- münchen.kamiyo.ai (German)

**Note:** Convert to Punycode for DNS:
- 日本 → xn--wgv71a
- münchen → xn--mnchen-3ya

### Email Configuration

Configure email for your domain:

**MX Records (for receiving email):**

```
Type: MX
Name: @
Priority: 10
Value: mail.youremailprovider.com
```

**SPF Record (prevent spoofing):**

```
Type: TXT
Name: @
Value: v=spf1 include:_spf.google.com ~all
```

**DKIM Record (email authentication):**

```
Type: TXT
Name: default._domainkey
Value: [provided by email provider]
```

**DMARC Record (policy):**

```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@kamiyo.ai
```

**Common Email Providers:**
- Google Workspace (G Suite)
- Microsoft 365
- ProtonMail
- FastMail

---

## Checklist

Use this checklist to verify your domain setup:

### Pre-Setup
- [ ] Domain purchased and registered
- [ ] DNS provider access confirmed
- [ ] Render services deployed and running
- [ ] Render services on paid plans (required for custom domains)

### DNS Configuration
- [ ] Nameservers updated (if changing DNS provider)
- [ ] TTL lowered before changes
- [ ] ALIAS/CNAME for root domain configured
- [ ] CNAME for www subdomain configured
- [ ] CNAME for api subdomain configured
- [ ] No duplicate or conflicting records
- [ ] DNS records saved and published

### Render Configuration
- [ ] Custom domain added for frontend (kamiyo.ai)
- [ ] Custom domain added for frontend (www.kamiyo.ai)
- [ ] Custom domain added for API (api.kamiyo.ai)
- [ ] All domains show "Active" status
- [ ] SSL certificates provisioned for all domains

### Verification
- [ ] DNS resolves correctly (dig commands)
- [ ] DNS propagated globally (whatsmydns.net)
- [ ] Root domain loads (https://kamiyo.ai)
- [ ] WWW subdomain loads (https://www.kamiyo.ai)
- [ ] API endpoint accessible (https://api.kamiyo.ai/health)
- [ ] HTTP redirects to HTTPS for all domains
- [ ] SSL certificates valid (check in browser)
- [ ] No mixed content warnings
- [ ] API CORS working from frontend

### Application Updates
- [ ] Frontend API calls updated to use custom domain
- [ ] Environment variables updated
- [ ] CORS configuration updated with new domains
- [ ] Any hardcoded URLs updated

### Monitoring
- [ ] Uptime monitors updated with custom domains
- [ ] SSL expiry monitoring configured
- [ ] DNS monitoring set up (optional)

### Post-Setup
- [ ] TTL increased back to 3600+ seconds
- [ ] Documentation updated
- [ ] Team notified of new domains
- [ ] Old domains (if any) redirected or deprecated

### Optional Enhancements
- [ ] WWW redirect configured (if desired)
- [ ] HSTS header added
- [ ] HSTS preload submitted
- [ ] CSP headers configured
- [ ] Status page custom domain (status.kamiyo.ai)
- [ ] Email DNS records configured (MX, SPF, DKIM, DMARC)

---

## Support Resources

### Render.com Documentation
- Custom Domains: https://render.com/docs/custom-domains
- SSL Certificates: https://render.com/docs/tls
- DNS Configuration: https://render.com/docs/dns-configuration

### DNS Tools
- DNS Lookup: https://www.whatsmydns.net
- DNS Checker: https://dnschecker.org
- Dig Web Interface: https://www.digwebinterface.com
- DNS Propagation: https://www.dnsstuff.com

### SSL Tools
- SSL Labs: https://www.ssllabs.com/ssltest/
- SSL Checker: https://www.sslshopper.com/ssl-checker.html
- Certificate Decoder: https://www.sslshopper.com/certificate-decoder.html

### DNS Provider Support
- Cloudflare: https://support.cloudflare.com
- Namecheap: https://www.namecheap.com/support/
- GoDaddy: https://www.godaddy.com/help
- Google Domains: https://support.google.com/domains

### General Support
- Render Support: support@render.com
- Render Status: https://status.render.com
- KAMIYO Documentation: /docs/
- Engineering Team: engineering@kamiyo.ai

---

## Frequently Asked Questions

**Q: How long does DNS propagation take?**
A: Typically 30 minutes to 2 hours, maximum 48 hours. Use https://www.whatsmydns.net to check progress.

**Q: Do I need to use Cloudflare?**
A: No, Cloudflare is optional but recommended for its speed, security features, and free tier.

**Q: Can I use a subdomain as my main domain?**
A: Yes, you can use `app.kamiyo.ai` or any subdomain as your primary domain. Just configure DNS accordingly.

**Q: What happens if I change DNS providers?**
A: Update nameservers at your registrar, wait for propagation (up to 48 hours), then configure DNS records in new provider.

**Q: Do SSL certificates renew automatically?**
A: Yes, Render automatically renews Let's Encrypt certificates every 60 days. No action required.

**Q: Can I use my own SSL certificate?**
A: Render uses Let's Encrypt automatically. Custom certificates are not supported on standard plans.

**Q: What if my domain registrar doesn't support ALIAS records?**
A: Use A records with Render's IP addresses, or consider transferring DNS management to a provider that supports ALIAS (like Cloudflare).

**Q: Can I have multiple domains point to the same site?**
A: Yes, add multiple custom domains in Render. Configure DNS for each, and they'll all serve the same content.

**Q: How do I redirect www to non-www (or vice versa)?**
A: Use Cloudflare Page Rules, or configure redirects in your Next.js application. See "Configure WWW Redirect" section.

**Q: What's the difference between CNAME and ALIAS?**
A: CNAME is standard but can't be used for root domains. ALIAS is an extension that allows root domain aliases. Both point to another domain.

**Q: Do I need separate SSL certificates for www and root?**
A: No, Render provisions a single certificate that covers both (using Subject Alternative Names).

---

**Document Version:** 1.0
**Last Updated:** 2025-10-29
**Owner:** DevOps Team
**Review Cycle:** Quarterly or when significant DNS/domain changes occur
**Next Review:** 2026-01-29
