# Analytics & SEO Quick Start Guide

Quick reference for implementing analytics tracking and SEO optimization in the Kamiyo platform.

## Table of Contents
1. [Analytics Setup](#analytics-setup)
2. [Tracking Events](#tracking-events)
3. [SEO Implementation](#seo-implementation)
4. [A/B Testing](#ab-testing)
5. [Performance Monitoring](#performance-monitoring)

---

## Analytics Setup

### 1. Initialize Analytics (App.tsx or main entry point)

```typescript
import analytics from '@/analytics/analytics';
import GA4 from '@/analytics/ga4';
import performanceTracker from '@/analytics/performance';
import { AnalyticsProvider } from '@/analytics/analytics';

// In your main App component
useEffect(() => {
  // Initialize analytics
  analytics.initialize([AnalyticsProvider.GA4]);

  // Initialize performance tracking
  performanceTracker.initialize();

  // Set user properties if logged in
  if (user) {
    analytics.setUserId(user.id);
    analytics.setUserProperties({
      tier: user.tier,
      signupDate: user.created_at,
    });
  }
}, [user]);
```

### 2. Track Page Views (React Router)

```typescript
import { useLocation } from 'react-router-dom';
import analytics from '@/analytics/analytics';

function PageTracker() {
  const location = useLocation();

  useEffect(() => {
    analytics.trackPageView(location.pathname);
  }, [location]);

  return null;
}

// Add to your router
<Router>
  <PageTracker />
  {/* Your routes */}
</Router>
```

---

## Tracking Events

### Basic Event Tracking

```typescript
import analytics from '@/analytics/analytics';

// Simple event
analytics.trackEvent('button_clicked', {
  category: 'User Action',
  label: 'CTA Button',
  customParams: {
    button_location: 'header',
    button_text: 'Sign Up',
  },
});
```

### Common Events

#### Track Exploit Viewed
```typescript
import GA4 from '@/analytics/ga4';

GA4.trackExploitViewed({
  exploit_id: 'exploit_123',
  exploit_name: 'Ronin Bridge Exploit',
  chain: 'Ethereum',
  severity: 'critical',
  amount_usd: 625000000,
  date: '2022-03-23',
});
```

#### Track Subscription
```typescript
import GA4 from '@/analytics/ga4';

// Start subscription
GA4.trackSubscriptionStarted({
  tier: 'pro',
  monthly_price: 49,
});

// Complete purchase
GA4.trackSubscriptionPurchase({
  transaction_id: 'tx_123456',
  tier: 'pro',
  price: 49,
  currency: 'USD',
  payment_method: 'card',
});
```

#### Track Search
```typescript
GA4.trackSearch({
  search_term: 'ethereum exploits',
  results_count: 25,
  filters: {
    chain: 'ethereum',
    severity: 'high',
  },
});
```

#### Track Share
```typescript
GA4.trackShare({
  content_type: 'exploit',
  content_id: 'exploit_123',
  method: 'twitter',
});
```

### Conversion Funnel Tracking

```typescript
import conversionTracker, { FunnelStep } from '@/analytics/conversions';

// Track funnel steps
conversionTracker.trackStep(FunnelStep.LANDING);
conversionTracker.trackStep(FunnelStep.PRICING_VIEW);
conversionTracker.trackStep(FunnelStep.SIGNUP_INITIATED, { tier: 'pro' });
conversionTracker.trackStep(FunnelStep.SIGNUP_COMPLETED, {
  user_id: user.id,
  tier: 'pro',
  signup_method: 'email',
});

// Complete conversion
conversionTracker.completeConversion({
  userId: user.id,
  tier: 'pro',
  revenue: 49,
});
```

---

## SEO Implementation

### Add Meta Tags to Pages

```typescript
import { MetaTags, ExploitMetaTags } from '@/components/SEO/MetaTags';

// Basic page
function MyPage() {
  return (
    <>
      <MetaTags
        title="Page Title"
        description="Page description for search engines"
        keywords={['keyword1', 'keyword2']}
        type="website"
      />
      <div>Page content...</div>
    </>
  );
}

// Exploit detail page
function ExploitDetailPage({ exploit }) {
  return (
    <>
      <ExploitMetaTags
        exploitName={exploit.name}
        chain={exploit.chain}
        amount={exploit.amount_usd.toLocaleString()}
        date={exploit.date}
        description={exploit.description}
        tags={exploit.tags}
      />
      <div>Exploit details...</div>
    </>
  );
}

// Blog post
import { BlogPostMetaTags } from '@/components/SEO/MetaTags';

function BlogPost({ post }) {
  return (
    <>
      <BlogPostMetaTags
        title={post.title}
        description={post.excerpt}
        author={post.author}
        publishedDate={post.published_at}
        modifiedDate={post.updated_at}
        image={post.cover_image}
        tags={post.tags}
      />
      <article>{/* Blog content */}</article>
    </>
  );
}
```

### Generate Sitemaps

```bash
# Generate all sitemaps
python scripts/generate_sitemap.py

# Generate and submit to Google
python scripts/generate_sitemap.py --submit
```

---

## A/B Testing

### Initialize Experiment

```typescript
import abtest from '@/experiments/abtest';

// Define experiment
abtest.registerExperiment({
  id: 'pricing_layout_test',
  name: 'Pricing Page Layout Test',
  description: 'Test different pricing page layouts',
  variants: [
    { id: 'control', name: 'Current Layout', weight: 50 },
    { id: 'variant_a', name: 'Table First', weight: 25 },
    { id: 'variant_b', name: 'Social Proof First', weight: 25 },
  ],
  status: 'running',
});
```

### Use in Component

```typescript
import abtest from '@/experiments/abtest';

function PricingPage() {
  const [variant, setVariant] = useState('control');

  useEffect(() => {
    // Get variant for user
    const userVariant = abtest.getVariant('pricing_layout_test');
    setVariant(userVariant);

    // Track exposure
    abtest.trackExposure('pricing_layout_test', userVariant);
  }, []);

  // Render different layouts based on variant
  if (variant === 'variant_a') {
    return <PricingLayoutA />;
  } else if (variant === 'variant_b') {
    return <PricingLayoutB />;
  }
  return <PricingLayoutControl />;
}

// Track conversion
function handleSubscribe() {
  const variant = abtest.getVariant('pricing_layout_test');
  abtest.trackConversion('pricing_layout_test', variant, 49.00);
  // ... rest of subscription logic
}
```

### Get Results

```typescript
const results = abtest.getResults('pricing_layout_test');
console.log(results);
// [
//   { variant: 'control', exposures: 1000, conversions: 50, conversionRate: 0.05 },
//   { variant: 'variant_a', exposures: 500, conversions: 30, conversionRate: 0.06 },
//   { variant: 'variant_b', exposures: 500, conversions: 35, conversionRate: 0.07 },
// ]
```

---

## Performance Monitoring

### Track Custom Performance Marks

```typescript
import performanceTracker, { PerformanceMark } from '@/analytics/performance';

// Create marks
performanceTracker.mark(PerformanceMark.DATA_FETCH_START);
// ... fetch data
performanceTracker.mark(PerformanceMark.DATA_FETCH_END);

// Measure duration
const duration = performanceTracker.measure(
  'data_fetch',
  PerformanceMark.DATA_FETCH_START,
  PerformanceMark.DATA_FETCH_END
);
```

### Track API Performance

```typescript
import performanceTracker from '@/analytics/performance';

async function fetchExploits() {
  const startTime = performance.now();

  try {
    const response = await fetch('/api/exploits');
    const data = await response.json();
    const duration = performance.now() - startTime;

    // Track performance
    performanceTracker.trackApiRequest({
      endpoint: '/api/exploits',
      method: 'GET',
      duration,
      status: response.status,
      success: response.ok,
    });

    return data;
  } catch (error) {
    const duration = performance.now() - startTime;

    performanceTracker.trackApiRequest({
      endpoint: '/api/exploits',
      method: 'GET',
      duration,
      status: 0,
      success: false,
    });

    throw error;
  }
}
```

### Track Errors

```typescript
import performanceTracker from '@/analytics/performance';
import analytics from '@/analytics/analytics';

// Automatic error tracking is set up, but you can also manually track
try {
  // risky operation
} catch (error) {
  performanceTracker.trackError({
    message: error.message,
    stack: error.stack,
    url: window.location.href,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
  });

  // Also track in analytics
  analytics.trackError(
    'api_error',
    error.message,
    'fetchExploits',
    false // not fatal
  );
}
```

---

## Environment Variables

Required environment variables for analytics:

```bash
# .env.local or .env.production

# Google Analytics 4
VITE_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_GA4_DEBUG=false

# Google Tag Manager
VITE_GTM_CONTAINER_ID=GTM-XXXXXXX

# Custom endpoints
VITE_ANALYTICS_ENDPOINT=/api/analytics/track
VITE_PERFORMANCE_ENDPOINT=/api/monitoring/performance

# App version
VITE_APP_VERSION=1.0.0
```

---

## Privacy Compliance

### Cookie Consent

```typescript
import analytics from '@/analytics/analytics';

function CookieConsent() {
  const handleAccept = () => {
    analytics.updatePrivacySettings({
      analyticsEnabled: true,
      marketingEnabled: true,
    });
  };

  const handleDecline = () => {
    analytics.updatePrivacySettings({
      analyticsEnabled: false,
      marketingEnabled: false,
    });
  };

  return (
    <div className="cookie-banner">
      <p>We use cookies to improve your experience.</p>
      <button onClick={handleAccept}>Accept</button>
      <button onClick={handleDecline}>Decline</button>
    </div>
  );
}
```

---

## Testing Analytics

### Development Mode

Analytics debug mode is automatically enabled in development:

```typescript
// Check debug logs in console
// Look for messages starting with "GA4:", "Analytics:", etc.
```

### Production Testing

Use Google Analytics DebugView:
1. Install Google Analytics Debugger Chrome extension
2. Visit your site
3. Open GA4 property → Admin → DebugView
4. See events in real-time

### Testing Checklist

- [ ] Page views tracked on all pages
- [ ] Custom events fire correctly
- [ ] Conversion funnel steps track properly
- [ ] User properties set correctly
- [ ] Performance metrics sent to backend
- [ ] A/B test variants assigned consistently
- [ ] Cookie consent works
- [ ] Opt-out functions correctly

---

## Common Issues & Solutions

### Issue: Events not showing in GA4
**Solution**:
- Check DebugView in GA4 (takes 1-2 hours to show in reports)
- Verify GA4 measurement ID is correct
- Check cookie consent is given

### Issue: A/B test variant changes on refresh
**Solution**: Variant assignment is stored in localStorage. Clear storage to reset.

### Issue: Performance metrics missing
**Solution**: Some Web Vitals require real user interaction. Check metrics after user navigation.

### Issue: SEO meta tags not rendering
**Solution**: Ensure HelmetProvider wraps your app and pages are using MetaTags component.

---

## Additional Resources

- [Full Analytics Configuration](/config/analytics_config.ts)
- [GA4 Module Documentation](/frontend/src/analytics/ga4.ts)
- [Complete Day 18 Summary](/docs/DAY_18_SEO_ANALYTICS_SUMMARY.md)
- [Google Analytics 4 Docs](https://developers.google.com/analytics/devguides/collection/ga4)
- [Web Vitals Guide](https://web.dev/vitals/)

---

**Last Updated**: October 7, 2025
**Author**: Kamiyo Development Team
