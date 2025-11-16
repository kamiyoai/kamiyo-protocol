# Analytics Integration Example

Complete example of how to integrate all analytics components into your React application.

## App Setup (Main Entry Point)

```typescript
// src/App.tsx
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

// Analytics imports
import analytics, { AnalyticsProvider } from './analytics/analytics';
import performanceTracker from './analytics/performance';
import gtm from './analytics/gtm';
import conversionTracker, { FunnelStep } from './analytics/conversions';

// Pages
import HomePage from './pages/landing/HomePage';
import ExploitListPage from './pages/ExploitListPage';
import ExploitDetailPage from './pages/ExploitDetailPage';
import PricingPage from './pages/PricingPage';
import SignupPage from './pages/SignupPage';

// Page view tracker component
function PageViewTracker() {
  const location = useLocation();

  useEffect(() => {
    // Track page view
    analytics.trackPageView(location.pathname + location.search);

    // Also track in GTM
    gtm.trackPageView({
      page_path: location.pathname,
      page_title: document.title,
    });
  }, [location]);

  return null;
}

function App() {
  const [user, setUser] = React.useState(null);

  useEffect(() => {
    // Initialize analytics on app mount
    initializeAnalytics();

    // Load user data
    loadUser();
  }, []);

  useEffect(() => {
    // Update analytics when user changes
    if (user) {
      updateUserAnalytics(user);
    }
  }, [user]);

  const initializeAnalytics = () => {
    // Initialize analytics providers
    analytics.initialize([AnalyticsProvider.GA4]);

    // Initialize GTM
    gtm.initialize();

    // Initialize performance tracking
    performanceTracker.initialize();

    console.log('Analytics initialized');
  };

  const updateUserAnalytics = (user) => {
    // Set user ID
    analytics.setUserId(user.id);
    gtm.setUserId(user.id);

    // Set user properties
    analytics.setUserProperties({
      tier: user.tier,
      signupDate: user.created_at,
      apiKeyCount: user.api_keys?.length || 0,
      alertsConfigured: user.has_alerts,
    });

    gtm.setUserProperties({
      user_tier: user.tier,
      signup_date: user.created_at,
    });

    console.log('User analytics updated', user.id);
  };

  const loadUser = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (error) {
      console.error('Failed to load user', error);
    }
  };

  return (
    <HelmetProvider>
      <Router>
        <PageViewTracker />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/exploits" element={<ExploitListPage />} />
          <Route path="/exploit/:id" element={<ExploitDetailPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Routes>
      </Router>
    </HelmetProvider>
  );
}

export default App;
```

## Page Example with Full Analytics

```typescript
// src/pages/ExploitDetailPage.tsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ExploitMetaTags } from '../components/SEO/MetaTags';
import GA4 from '../analytics/ga4';
import performanceTracker from '../analytics/performance';

function ExploitDetailPage() {
  const { id } = useParams();
  const [exploit, setExploit] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExploit();
  }, [id]);

  const loadExploit = async () => {
    // Track API performance
    const startTime = performance.now();

    try {
      const response = await fetch(`/api/exploits/${id}`);
      const data = await response.json();
      const duration = performance.now() - startTime;

      // Track API performance
      performanceTracker.trackApiRequest({
        endpoint: `/api/exploits/${id}`,
        method: 'GET',
        duration,
        status: response.status,
        success: response.ok,
      });

      setExploit(data);

      // Track exploit viewed
      GA4.trackExploitViewed({
        exploit_id: data.id,
        exploit_name: data.name,
        chain: data.chain,
        severity: data.severity,
        amount_usd: data.amount_usd,
        date: data.date,
      });

    } catch (error) {
      const duration = performance.now() - startTime;

      performanceTracker.trackApiRequest({
        endpoint: `/api/exploits/${id}`,
        method: 'GET',
        duration,
        status: 0,
        success: false,
      });

      // Track error
      performanceTracker.trackError({
        message: error.message,
        stack: error.stack,
        url: window.location.href,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
      });

      GA4.trackError({
        error_type: 'api_error',
        error_message: error.message,
        error_location: 'ExploitDetailPage.loadExploit',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleShare = (platform) => {
    GA4.trackShare({
      content_type: 'exploit',
      content_id: exploit.id,
      method: platform,
    });

    // Open share dialog...
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!exploit) {
    return <div>Exploit not found</div>;
  }

  return (
    <div className="exploit-detail">
      <ExploitMetaTags
        exploitName={exploit.name}
        chain={exploit.chain}
        amount={exploit.amount_usd.toLocaleString()}
        date={exploit.date}
        description={exploit.description}
        tags={exploit.tags}
      />

      <h1>{exploit.name}</h1>
      <div className="exploit-info">
        <span>Chain: {exploit.chain}</span>
        <span>Amount: ${exploit.amount_usd.toLocaleString()}</span>
        <span>Date: {new Date(exploit.date).toLocaleDateString()}</span>
      </div>

      <div className="exploit-description">
        {exploit.description}
      </div>

      <div className="share-buttons">
        <button onClick={() => handleShare('twitter')}>Share on Twitter</button>
        <button onClick={() => handleShare('linkedin')}>Share on LinkedIn</button>
      </div>
    </div>
  );
}

export default ExploitDetailPage;
```

## Signup Page with Conversion Tracking

```typescript
// src/pages/SignupPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MetaTags } from '../components/SEO/MetaTags';
import GA4 from '../analytics/ga4';
import conversionTracker, { FunnelStep } from '../analytics/conversions';
import gtm from '../analytics/gtm';

function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
  });
  const [loading, setLoading] = useState(false);
  const tier = searchParams.get('tier') || 'free';

  useEffect(() => {
    // Track signup initiated
    conversionTracker.trackStep(FunnelStep.SIGNUP_INITIATED, { tier });
    GA4.trackSignupInitiated({ tier });
  }, [tier]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, tier }),
      });

      const data = await response.json();

      if (response.ok) {
        // Track signup completed
        conversionTracker.trackStep(FunnelStep.SIGNUP_COMPLETED, {
          user_id: data.user_id,
          tier,
          signup_method: 'email',
        });

        GA4.trackSignupCompleted({
          user_id: data.user_id,
          tier,
          signup_method: 'email',
          time_to_signup: conversionTracker.getTimeToStep(FunnelStep.SIGNUP_COMPLETED),
        });

        // Track in GTM
        gtm.trackSignup({
          method: 'email',
          tier,
        });

        // Redirect to verification page
        navigate('/verify-email');
      } else {
        // Track error
        GA4.trackError({
          error_type: 'signup_error',
          error_message: data.message || 'Signup failed',
          error_location: 'SignupPage.handleSubmit',
        });
      }
    } catch (error) {
      GA4.trackError({
        error_type: 'signup_error',
        error_message: error.message,
        error_location: 'SignupPage.handleSubmit',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-page">
      <MetaTags
        title="Sign Up - Kamiyo"
        description="Create your free Kamiyo account and start tracking exploits"
        noindex={true}
      />

      <h1>Create Your Account</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Creating Account...' : 'Sign Up'}
        </button>
      </form>
    </div>
  );
}

export default SignupPage;
```

## Pricing Page with A/B Testing

```typescript
// src/pages/PricingPage.tsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PricingMetaTags } from '../components/SEO/MetaTags';
import GA4 from '../analytics/ga4';
import conversionTracker, { FunnelStep } from '../analytics/conversions';
import abtest from '../experiments/abtest';

function PricingPage() {
  const [variant, setVariant] = useState('control');

  useEffect(() => {
    // Track pricing page view
    conversionTracker.trackStep(FunnelStep.PRICING_VIEW);
    GA4.trackPricingPageViewed();

    // Get A/B test variant
    const testVariant = abtest.getVariant('pricing_layout_test');
    setVariant(testVariant);

    // Track exposure
    abtest.trackExposure('pricing_layout_test', testVariant);
  }, []);

  const handleSelectPlan = (tier, price) => {
    // Track button click
    GA4.trackEvent('pricing_plan_selected', {
      tier,
      price,
      variant,
    });

    // Track A/B test conversion
    abtest.trackConversion('pricing_layout_test', variant, price);
  };

  // Render different layouts based on variant
  const renderLayout = () => {
    if (variant === 'variant_a') {
      return <PricingLayoutTableFirst onSelectPlan={handleSelectPlan} />;
    } else if (variant === 'variant_b') {
      return <PricingLayoutSocialProofFirst onSelectPlan={handleSelectPlan} />;
    }
    return <PricingLayoutControl onSelectPlan={handleSelectPlan} />;
  };

  return (
    <div className="pricing-page">
      <PricingMetaTags />
      <h1>Simple, Transparent Pricing</h1>
      {renderLayout()}
    </div>
  );
}

// Example layout component
function PricingLayoutControl({ onSelectPlan }) {
  return (
    <div className="pricing-grid">
      <div className="pricing-card">
        <h2>Free</h2>
        <div className="price">$0/month</div>
        <ul>
          <li>View recent exploits</li>
          <li>Basic search</li>
          <li>Community support</li>
        </ul>
        <Link
          to="/signup?tier=free"
          onClick={() => onSelectPlan('free', 0)}
        >
          Get Started
        </Link>
      </div>

      <div className="pricing-card featured">
        <h2>Pro</h2>
        <div className="price">$49/month</div>
        <ul>
          <li>Real-time alerts</li>
          <li>API access</li>
          <li>Advanced analytics</li>
          <li>Priority support</li>
        </ul>
        <Link
          to="/signup?tier=pro"
          onClick={() => onSelectPlan('pro', 49)}
        >
          Start Free Trial
        </Link>
      </div>

      <div className="pricing-card">
        <h2>Enterprise</h2>
        <div className="price">Custom</div>
        <ul>
          <li>Unlimited API</li>
          <li>Custom integrations</li>
          <li>Dedicated support</li>
          <li>SLA guarantees</li>
        </ul>
        <Link
          to="/contact"
          onClick={() => onSelectPlan('enterprise', 0)}
        >
          Contact Sales
        </Link>
      </div>
    </div>
  );
}

export default PricingPage;
```

## Newsletter Component

```typescript
// src/components/NewsletterSignup.tsx
import React, { useState } from 'react';
import GA4 from '../analytics/ga4';

function NewsletterSignup({ location = 'footer' }) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!consent) {
      setMessage('Please agree to receive newsletter emails');
      return;
    }

    setStatus('loading');

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: location,
          consent: true,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setMessage(data.message);

        // Track newsletter subscription
        GA4.trackNewsletterSubscription({ location });

        // Reset form
        setEmail('');
        setConsent(false);
      } else {
        setStatus('error');
        setMessage(data.detail || 'Subscription failed');
      }
    } catch (error) {
      setStatus('error');
      setMessage('An error occurred. Please try again.');

      GA4.trackError({
        error_type: 'newsletter_error',
        error_message: error.message,
        error_location: 'NewsletterSignup.handleSubmit',
      });
    }
  };

  return (
    <div className="newsletter-signup">
      <h3>Stay Updated</h3>
      <p>Get weekly security updates and exploit alerts</p>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={status === 'loading' || status === 'success'}
        />

        <label>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={status === 'loading' || status === 'success'}
          />
          <span>I agree to receive newsletter emails</span>
        </label>

        <button
          type="submit"
          disabled={status === 'loading' || status === 'success'}
        >
          {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
        </button>
      </form>

      {message && (
        <div className={`message ${status}`}>
          {message}
        </div>
      )}
    </div>
  );
}

export default NewsletterSignup;
```

## Cookie Consent Banner

```typescript
// src/components/CookieConsent.tsx
import React, { useState, useEffect } from 'react';
import analytics from '../analytics/analytics';

function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if user has already made a choice
    const privacySettings = analytics.getPrivacySettings();
    if (!privacySettings.analyticsEnabled && !localStorage.getItem('cookies_declined')) {
      setShow(true);
    }
  }, []);

  const handleAccept = () => {
    analytics.updatePrivacySettings({
      analyticsEnabled: true,
      marketingEnabled: true,
      personalizedAdsEnabled: true,
      thirdPartyEnabled: true,
    });
    setShow(false);
  };

  const handleDecline = () => {
    analytics.updatePrivacySettings({
      analyticsEnabled: false,
      marketingEnabled: false,
      personalizedAdsEnabled: false,
      thirdPartyEnabled: false,
    });
    localStorage.setItem('cookies_declined', 'true');
    setShow(false);
  };

  const handleCustomize = () => {
    // Open settings modal
    // For now, just accept
    handleAccept();
  };

  if (!show) return null;

  return (
    <div className="cookie-consent-banner">
      <div className="cookie-content">
        <p>
          We use cookies to improve your experience and analyze site usage.
          By clicking "Accept", you consent to our use of cookies.
        </p>
        <div className="cookie-buttons">
          <button onClick={handleAccept} className="btn-primary">
            Accept All
          </button>
          <button onClick={handleDecline} className="btn-secondary">
            Decline
          </button>
          <button onClick={handleCustomize} className="btn-link">
            Customize
          </button>
        </div>
      </div>
    </div>
  );
}

export default CookieConsent;
```

## Summary

This complete integration example shows:

1. **App-level initialization** of all analytics systems
2. **Page-level tracking** with SEO meta tags
3. **Event tracking** for user actions
4. **Conversion funnel** tracking through signup
5. **A/B testing** on pricing page
6. **Newsletter subscription** with tracking
7. **Cookie consent** for privacy compliance
8. **Error tracking** throughout
9. **Performance monitoring** for API calls

All components work together to provide comprehensive analytics and SEO optimization while maintaining privacy compliance.
