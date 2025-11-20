# Dashboard Subdomain Setup

## DNS Configuration for dashboard.kamiyo.ai

### Render Configuration

1. Navigate to Render Dashboard
2. Select the kamiyo web service
3. Go to Settings → Custom Domains
4. Add custom domain: `dashboard.kamiyo.ai`
5. Render will provide CNAME target

### DNS Provider Configuration

Add the following DNS record at your DNS provider:

```
Type: CNAME
Name: dashboard
Value: [render-provided-cname]
TTL: 3600 (or automatic)
```

Example for common providers:

#### Cloudflare
```
Type: CNAME
Name: dashboard
Target: kamiyo.onrender.com (or Render-provided value)
Proxy status: DNS only (grey cloud)
```

#### Namecheap
```
Type: CNAME Record
Host: dashboard
Value: kamiyo.onrender.com
TTL: Automatic
```

#### Route 53 (AWS)
```
Record name: dashboard.kamiyo.ai
Record type: CNAME
Value: kamiyo.onrender.com
Routing policy: Simple
TTL: 300
```

### Verification

1. Wait 5-10 minutes for DNS propagation
2. Check DNS propagation: `dig dashboard.kamiyo.ai`
3. Visit https://dashboard.kamiyo.ai
4. Verify SSL certificate is active (Render auto-provisions)

### Next.js Configuration

No code changes required. The Next.js app automatically handles requests from any domain.

If domain-specific logic is needed, update `next.config.js`:

```javascript
module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
        ],
      },
    ];
  },
};
```

### Environment Variables

Ensure the following are set in Render:

```
NEXTAUTH_URL=https://dashboard.kamiyo.ai
DATABASE_URL=[your-database-url]
NEXTAUTH_SECRET=[your-secret]
```

Update `NEXTAUTH_URL` in Render dashboard:
1. Go to Environment section
2. Update NEXTAUTH_URL to `https://dashboard.kamiyo.ai`
3. Save changes (triggers automatic redeployment)

### Testing

```bash
# Check DNS resolution
nslookup dashboard.kamiyo.ai

# Check HTTPS
curl -I https://dashboard.kamiyo.ai

# Verify redirect
curl -L https://kamiyo.ai/dashboard
```

### Routing Strategy

Two options for handling kamiyo.ai/dashboard:

#### Option A: Redirect to subdomain (Recommended)
```javascript
// In kamiyo.ai routing or Cloudflare page rules
if (path === '/dashboard') {
  redirect('https://dashboard.kamiyo.ai');
}
```

#### Option B: Proxy through main domain
Keep current routing, dashboard accessible at both:
- `kamiyo.ai/dashboard`
- `dashboard.kamiyo.ai`

### Security Considerations

1. Enable HSTS on Render
2. Force HTTPS redirects
3. Set secure cookies domain to `.kamiyo.ai`
4. Update CORS configuration if needed

```javascript
// In dashboard app
res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
```

### Monitoring

Add uptime monitoring for subdomain:
- UptimeRobot
- Pingdom
- Custom health check endpoint

Health check endpoint example:
```javascript
// pages/api/health.js
export default function handler(req, res) {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}
```

### Rollback Plan

If issues occur:
1. Remove CNAME record from DNS
2. Keep kamiyo.ai/dashboard as primary
3. Fix issues on Render preview URL
4. Re-add CNAME when resolved
