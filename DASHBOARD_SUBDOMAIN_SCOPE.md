# Dashboard Subdomain Scope

## URL Structure

### dashboard.kamiyo.ai (Authenticated Dashboard Pages ONLY)
```
dashboard.kamiyo.ai/                 → Dashboard home
dashboard.kamiyo.ai/api-keys         → API key management
dashboard.kamiyo.ai/subscription     → Subscription management
dashboard.kamiyo.ai/usage            → Usage analytics
dashboard.kamiyo.ai/success          → Payment success page
dashboard.kamiyo.ai/x402             → x402 dashboard features
```

### kamiyo.ai (Public Marketing & Documentation)
```
kamiyo.ai/                           → Landing page
kamiyo.ai/pricing                    → Pricing page
kamiyo.ai/api-docs                   → API documentation
kamiyo.ai/docs/mitama                → Mitama documentation
kamiyo.ai/auth/signin                → Sign in page
kamiyo.ai/features                   → Features page
kamiyo.ai/about                      → About page
```

## Automatic Redirects

Main domain dashboard routes redirect to subdomain:
```
kamiyo.ai/dashboard          → 301 redirect to dashboard.kamiyo.ai/
kamiyo.ai/dashboard/*        → 301 redirect to dashboard.kamiyo.ai/*
```

## Implementation

### Navigation Links

**Dashboard pages** use root-level paths:
```javascript
// When on dashboard.kamiyo.ai
router.push('/')              // Dashboard home
router.push('/api-keys')      // API Keys
router.push('/subscription')  // Subscription
router.push('/usage')         // Usage analytics
```

**Marketing pages** use full URLs:
```javascript
// Links to main domain from dashboard
window.location.href = 'https://kamiyo.ai/pricing'
window.location.href = 'https://kamiyo.ai/api-docs'
window.location.href = 'https://kamiyo.ai/docs/mitama'
window.location.href = 'https://kamiyo.ai/auth/signin'
```

### Rewrite Rules (next.config.mjs)

```javascript
// Map dashboard.kamiyo.ai/ to /dashboard
{
    source: '/',
    destination: '/dashboard',
    has: [{ type: 'host', value: 'dashboard.kamiyo.ai' }],
},

// Map specific paths to /dashboard/* on subdomain
{
    source: '/:path(api-keys|subscription|usage|success|x402)',
    destination: '/dashboard/:path',
    has: [{ type: 'host', value: 'dashboard.kamiyo.ai' }],
}
```

### Redirect Rules (next.config.mjs)

```javascript
// Redirect main domain dashboard to subdomain
{
    source: '/dashboard',
    destination: 'https://dashboard.kamiyo.ai/',
    permanent: true,
    statusCode: 301,
},
{
    source: '/dashboard/:path*',
    destination: 'https://dashboard.kamiyo.ai/:path*',
    permanent: true,
    statusCode: 301,
}
```

## File Structure

```
pages/
  dashboard.js              → dashboard.kamiyo.ai/
  dashboard/
    api-keys.js            → dashboard.kamiyo.ai/api-keys
    subscription.js        → dashboard.kamiyo.ai/subscription
    usage.js               → dashboard.kamiyo.ai/usage
    success.js             → dashboard.kamiyo.ai/success
    x402.js                → dashboard.kamiyo.ai/x402

  index.js                 → kamiyo.ai/
  pricing.js               → kamiyo.ai/pricing
  api-docs.js              → kamiyo.ai/api-docs
  features.js              → kamiyo.ai/features
  about.js                 → kamiyo.ai/about
  auth/
    signin.js              → kamiyo.ai/auth/signin
```

## Benefits

1. **Clean separation**: Authenticated vs public pages
2. **SEO**: Marketing pages on main domain
3. **Security**: Dashboard isolated on subdomain
4. **Clarity**: No confusion about dashboard.kamiyo.ai/pricing
5. **Professional**: Matches SaaS industry standard

## What's Fixed

**Before:**
- ❌ dashboard.kamiyo.ai/pricing would load (wrong)
- ❌ dashboard.kamiyo.ai/api-docs would load (wrong)
- ❌ Confusing navigation between domains

**After:**
- ✅ dashboard.kamiyo.ai only serves authenticated pages
- ✅ Marketing pages stay on kamiyo.ai
- ✅ Clear separation with full URL redirects
- ✅ Users automatically sent to correct domain
