/**
 * Google Analytics 4 Integration
 *
 * Comprehensive GA4 tracking implementation with:
 * - Page view tracking
 * - Custom event tracking
 * - User properties
 * - E-commerce tracking (subscriptions)
 * - Enhanced measurement
 * - Debug mode for development
 *
 * Configuration via environment variables:
 * - VITE_GA4_MEASUREMENT_ID: GA4 measurement ID (G-XXXXXXXXXX)
 * - VITE_GA4_DEBUG: Enable debug mode
 */

import ReactGA from 'react-ga4';
import Cookies from 'js-cookie';

// GA4 Configuration
const GA4_CONFIG = {
  measurementId: import.meta.env.VITE_GA4_MEASUREMENT_ID || '',
  debug: import.meta.env.VITE_GA4_DEBUG === 'true',
  testMode: import.meta.env.MODE === 'development',
};

// Check if user has consented to analytics
const hasAnalyticsConsent = (): boolean => {
  return Cookies.get('analytics_consent') === 'true';
};

// Check if GA4 is initialized
let isInitialized = false;

/**
 * Initialize Google Analytics 4
 */
export const initializeGA4 = (): void => {
  if (!GA4_CONFIG.measurementId) {
    console.warn('GA4: Measurement ID not configured');
    return;
  }

  if (!hasAnalyticsConsent()) {
    console.log('GA4: User has not consented to analytics');
    return;
  }

  if (isInitialized) {
    console.log('GA4: Already initialized');
    return;
  }

  try {
    ReactGA.initialize(GA4_CONFIG.measurementId, {
      gaOptions: {
        debug_mode: GA4_CONFIG.debug,
        send_page_view: false, // We'll send page views manually
      },
      gtagOptions: {
        debug_mode: GA4_CONFIG.debug,
      },
    });

    isInitialized = true;
    console.log('GA4: Initialized successfully');

    // Set default user properties
    setUserProperties({
      platform: 'web',
      app_version: import.meta.env.VITE_APP_VERSION || '1.0.0',
    });
  } catch (error) {
    console.error('GA4: Initialization failed', error);
  }
};

/**
 * Track page view
 */
export const trackPageView = (path?: string, title?: string): void => {
  if (!isInitialized || !hasAnalyticsConsent()) return;

  const pagePath = path || window.location.pathname + window.location.search;
  const pageTitle = title || document.title;

  try {
    ReactGA.send({
      hitType: 'pageview',
      page: pagePath,
      title: pageTitle,
    });

    if (GA4_CONFIG.debug) {
      console.log('GA4: Page view tracked', { pagePath, pageTitle });
    }
  } catch (error) {
    console.error('GA4: Failed to track page view', error);
  }
};

/**
 * Set user properties
 */
export const setUserProperties = (properties: Record<string, any>): void => {
  if (!isInitialized || !hasAnalyticsConsent()) return;

  try {
    ReactGA.set(properties);

    if (GA4_CONFIG.debug) {
      console.log('GA4: User properties set', properties);
    }
  } catch (error) {
    console.error('GA4: Failed to set user properties', error);
  }
};

/**
 * Set user ID (for logged-in users)
 */
export const setUserId = (userId: string | null): void => {
  if (!isInitialized || !hasAnalyticsConsent()) return;

  try {
    if (userId) {
      ReactGA.gtag('set', 'user_id', userId);
    } else {
      ReactGA.gtag('set', 'user_id', undefined);
    }

    if (GA4_CONFIG.debug) {
      console.log('GA4: User ID set', userId);
    }
  } catch (error) {
    console.error('GA4: Failed to set user ID', error);
  }
};

/**
 * Track custom event
 */
export const trackEvent = (
  eventName: string,
  parameters?: Record<string, any>
): void => {
  if (!isInitialized || !hasAnalyticsConsent()) return;

  try {
    ReactGA.event(eventName, parameters);

    if (GA4_CONFIG.debug) {
      console.log('GA4: Event tracked', { eventName, parameters });
    }
  } catch (error) {
    console.error('GA4: Failed to track event', error);
  }
};

// ============================================================================
// Custom Events
// ============================================================================

/**
 * Track exploit viewed
 */
export const trackExploitViewed = (params: {
  exploit_id: string;
  exploit_name: string;
  chain: string;
  severity: string;
  amount_usd: number;
  date: string;
}): void => {
  trackEvent('exploit_viewed', {
    ...params,
    event_category: 'Exploit',
    event_label: params.exploit_name,
    value: Math.floor(params.amount_usd),
  });
};

/**
 * Track subscription started
 */
export const trackSubscriptionStarted = (params: {
  tier: 'free' | 'pro' | 'enterprise';
  monthly_price?: number;
}): void => {
  trackEvent('subscription_started', {
    ...params,
    event_category: 'Subscription',
    event_label: params.tier,
    value: params.monthly_price || 0,
  });
};

/**
 * Track subscription upgraded
 */
export const trackSubscriptionUpgraded = (params: {
  from_tier: string;
  to_tier: string;
  monthly_price: number;
}): void => {
  trackEvent('subscription_upgraded', {
    ...params,
    event_category: 'Subscription',
    event_label: `${params.from_tier} to ${params.to_tier}`,
    value: params.monthly_price,
  });
};

/**
 * Track subscription purchased (e-commerce event)
 */
export const trackSubscriptionPurchase = (params: {
  transaction_id: string;
  tier: string;
  price: number;
  currency: string;
  payment_method: string;
}): void => {
  // Standard e-commerce purchase event
  ReactGA.event('purchase', {
    transaction_id: params.transaction_id,
    value: params.price,
    currency: params.currency,
    items: [
      {
        item_id: `subscription_${params.tier}`,
        item_name: `${params.tier.charAt(0).toUpperCase() + params.tier.slice(1)} Subscription`,
        item_category: 'Subscription',
        price: params.price,
        quantity: 1,
      },
    ],
    payment_method: params.payment_method,
  });

  if (GA4_CONFIG.debug) {
    console.log('GA4: Purchase tracked', params);
  }
};

/**
 * Track API key created
 */
export const trackApiKeyCreated = (params: {
  tier: string;
  rate_limit: number;
}): void => {
  trackEvent('api_key_created', {
    ...params,
    event_category: 'API',
    event_label: params.tier,
  });
};

/**
 * Track alert configured
 */
export const trackAlertConfigured = (params: {
  channels: string[]; // ['email', 'discord', 'telegram']
  filters: {
    chains?: string[];
    min_amount?: number;
    severity?: string[];
  };
}): void => {
  trackEvent('alert_configured', {
    channels: params.channels.join(','),
    num_chains: params.filters.chains?.length || 0,
    min_amount: params.filters.min_amount || 0,
    num_severities: params.filters.severity?.length || 0,
    event_category: 'Alert',
  });
};

/**
 * Track documentation viewed
 */
export const trackDocumentationViewed = (params: {
  page: string;
  section: string;
}): void => {
  trackEvent('documentation_viewed', {
    ...params,
    event_category: 'Documentation',
    event_label: params.page,
  });
};

/**
 * Track pricing page viewed
 */
export const trackPricingPageViewed = (params?: {
  source?: string; // Where they came from
  campaign?: string;
}): void => {
  trackEvent('pricing_page_viewed', {
    ...params,
    event_category: 'Conversion',
    event_label: 'Pricing Page',
  });
};

/**
 * Track signup initiated
 */
export const trackSignupInitiated = (params?: {
  source?: string;
  tier?: string;
}): void => {
  trackEvent('signup_initiated', {
    ...params,
    event_category: 'Conversion',
    event_label: 'Signup Started',
  });
};

/**
 * Track signup completed
 */
export const trackSignupCompleted = (params: {
  user_id: string;
  tier: string;
  signup_method: 'email' | 'google' | 'github';
  time_to_signup?: number; // milliseconds
}): void => {
  trackEvent('signup_completed', {
    ...params,
    event_category: 'Conversion',
    event_label: 'Signup Completed',
  });

  // Also track as a conversion event
  ReactGA.event('sign_up', {
    method: params.signup_method,
  });
};

/**
 * Track search performed
 */
export const trackSearch = (params: {
  search_term: string;
  results_count: number;
  filters?: Record<string, any>;
}): void => {
  trackEvent('search', {
    search_term: params.search_term,
    results_count: params.results_count,
    event_category: 'Search',
  });
};

/**
 * Track filter applied
 */
export const trackFilterApplied = (params: {
  filter_type: string; // 'chain', 'severity', 'date_range', etc.
  filter_value: string;
  results_count: number;
}): void => {
  trackEvent('filter_applied', {
    ...params,
    event_category: 'Filter',
    event_label: `${params.filter_type}: ${params.filter_value}`,
  });
};

/**
 * Track share action
 */
export const trackShare = (params: {
  content_type: 'exploit' | 'blog' | 'page';
  content_id: string;
  method: 'twitter' | 'linkedin' | 'facebook' | 'copy_link';
}): void => {
  trackEvent('share', {
    ...params,
    event_category: 'Social',
    event_label: `${params.content_type} via ${params.method}`,
  });
};

/**
 * Track newsletter subscription
 */
export const trackNewsletterSubscription = (params?: {
  location: string; // 'footer', 'modal', 'blog'
}): void => {
  trackEvent('newsletter_subscription', {
    ...params,
    event_category: 'Lead Generation',
    event_label: 'Newsletter Signup',
  });
};

/**
 * Track outbound link click
 */
export const trackOutboundLink = (params: {
  url: string;
  link_text?: string;
}): void => {
  trackEvent('outbound_link_click', {
    ...params,
    event_category: 'Outbound',
    event_label: params.url,
  });
};

/**
 * Track file download
 */
export const trackFileDownload = (params: {
  file_name: string;
  file_type: string;
  file_size?: number;
}): void => {
  trackEvent('file_download', {
    ...params,
    event_category: 'Download',
    event_label: params.file_name,
  });
};

/**
 * Track video play
 */
export const trackVideoPlay = (params: {
  video_title: string;
  video_duration?: number;
  video_provider?: string;
}): void => {
  trackEvent('video_start', {
    ...params,
    event_category: 'Video',
    event_label: params.video_title,
  });
};

/**
 * Track form submission
 */
export const trackFormSubmission = (params: {
  form_id: string;
  form_name: string;
  success: boolean;
  error_message?: string;
}): void => {
  trackEvent('form_submission', {
    ...params,
    event_category: 'Form',
    event_label: params.form_name,
  });
};

/**
 * Track error
 */
export const trackError = (params: {
  error_type: string; // 'api_error', 'validation_error', 'network_error', etc.
  error_message: string;
  error_location: string; // Component or page where error occurred
  user_tier?: string;
}): void => {
  trackEvent('error_occurred', {
    ...params,
    event_category: 'Error',
    event_label: params.error_type,
    non_interaction: true, // Don't affect bounce rate
  });
};

/**
 * Track engagement time
 */
export const trackEngagement = (params: {
  engagement_time_msec: number;
  page: string;
}): void => {
  trackEvent('user_engagement', {
    ...params,
    event_category: 'Engagement',
  });
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Track timing (for performance measurement)
 */
export const trackTiming = (params: {
  name: string;
  value: number; // milliseconds
  category?: string;
  label?: string;
}): void => {
  if (!isInitialized || !hasAnalyticsConsent()) return;

  try {
    ReactGA.gtag('event', 'timing_complete', {
      name: params.name,
      value: params.value,
      event_category: params.category || 'Performance',
      event_label: params.label,
    });

    if (GA4_CONFIG.debug) {
      console.log('GA4: Timing tracked', params);
    }
  } catch (error) {
    console.error('GA4: Failed to track timing', error);
  }
};

/**
 * Track exception
 */
export const trackException = (params: {
  description: string;
  fatal?: boolean;
}): void => {
  if (!isInitialized || !hasAnalyticsConsent()) return;

  try {
    ReactGA.gtag('event', 'exception', {
      description: params.description,
      fatal: params.fatal || false,
    });

    if (GA4_CONFIG.debug) {
      console.log('GA4: Exception tracked', params);
    }
  } catch (error) {
    console.error('GA4: Failed to track exception', error);
  }
};

/**
 * Enable/disable analytics based on user consent
 */
export const setAnalyticsConsent = (consent: boolean): void => {
  if (consent) {
    Cookies.set('analytics_consent', 'true', { expires: 365 });
    if (!isInitialized) {
      initializeGA4();
    }
  } else {
    Cookies.remove('analytics_consent');
    isInitialized = false;
    console.log('GA4: Analytics disabled by user');
  }
};

/**
 * Get current analytics consent status
 */
export const getAnalyticsConsent = (): boolean => {
  return hasAnalyticsConsent();
};

export default {
  initialize: initializeGA4,
  trackPageView,
  trackEvent,
  setUserProperties,
  setUserId,
  setAnalyticsConsent,
  getAnalyticsConsent,
  // Custom events
  trackExploitViewed,
  trackSubscriptionStarted,
  trackSubscriptionUpgraded,
  trackSubscriptionPurchase,
  trackApiKeyCreated,
  trackAlertConfigured,
  trackDocumentationViewed,
  trackPricingPageViewed,
  trackSignupInitiated,
  trackSignupCompleted,
  trackSearch,
  trackFilterApplied,
  trackShare,
  trackNewsletterSubscription,
  trackOutboundLink,
  trackFileDownload,
  trackVideoPlay,
  trackFormSubmission,
  trackError,
  trackEngagement,
  trackTiming,
  trackException,
};
