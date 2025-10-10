/**
 * Analytics Configuration
 *
 * Centralized configuration for all analytics tracking including:
 * - Event definitions
 * - Conversion goals
 * - Custom dimensions
 * - Filters and views
 */

// Event definitions
export const ANALYTICS_EVENTS = {
  // Page views
  PAGE_VIEW: 'page_view',

  // User actions
  EXPLOIT_VIEWED: 'exploit_viewed',
  SEARCH_PERFORMED: 'search',
  FILTER_APPLIED: 'filter_applied',
  SORT_CHANGED: 'sort_changed',

  // Conversion funnel
  LANDING_PAGE_VIEW: 'landing_page_view',
  PRICING_PAGE_VIEWED: 'pricing_page_viewed',
  SIGNUP_INITIATED: 'signup_initiated',
  SIGNUP_COMPLETED: 'signup_completed',
  EMAIL_VERIFIED: 'email_verified',

  // Subscription events
  SUBSCRIPTION_STARTED: 'subscription_started',
  SUBSCRIPTION_UPGRADED: 'subscription_upgraded',
  SUBSCRIPTION_DOWNGRADED: 'subscription_downgraded',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  SUBSCRIPTION_PURCHASED: 'purchase',

  // API usage
  API_KEY_CREATED: 'api_key_created',
  API_KEY_DELETED: 'api_key_deleted',
  FIRST_API_CALL: 'first_api_call',
  API_RATE_LIMIT_HIT: 'api_rate_limit_hit',

  // Alerts
  ALERT_CONFIGURED: 'alert_configured',
  ALERT_UPDATED: 'alert_updated',
  ALERT_DELETED: 'alert_deleted',
  FIRST_ALERT_CONFIGURED: 'first_alert_configured',

  // Content engagement
  DOCUMENTATION_VIEWED: 'documentation_viewed',
  BLOG_POST_VIEWED: 'blog_post_viewed',
  VIDEO_PLAYED: 'video_start',
  VIDEO_COMPLETED: 'video_complete',

  // Social actions
  SHARE: 'share',
  NEWSLETTER_SUBSCRIPTION: 'newsletter_subscription',
  CONTACT_FORM_SUBMITTED: 'contact_form_submitted',

  // Downloads
  FILE_DOWNLOAD: 'file_download',

  // Errors
  ERROR_OCCURRED: 'error_occurred',
  API_ERROR: 'api_error',
  PAYMENT_ERROR: 'payment_error',

  // Engagement
  USER_ENGAGEMENT: 'user_engagement',
  SCROLL_DEPTH: 'scroll',

  // A/B Testing
  EXPERIMENT_EXPOSURE: 'experiment_exposure',
  EXPERIMENT_CONVERSION: 'experiment_conversion',

  // Outbound
  OUTBOUND_LINK_CLICK: 'outbound_link_click',

  // Form interactions
  FORM_SUBMISSION: 'form_submission',
  FORM_ERROR: 'form_error',
} as const;

// Conversion goals
export const CONVERSION_GOALS = {
  SIGNUP: {
    name: 'User Signup',
    event: ANALYTICS_EVENTS.SIGNUP_COMPLETED,
    value: 0,
  },
  SUBSCRIPTION_PRO: {
    name: 'Pro Subscription',
    event: ANALYTICS_EVENTS.SUBSCRIPTION_PURCHASED,
    value: 49,
  },
  SUBSCRIPTION_ENTERPRISE: {
    name: 'Enterprise Subscription',
    event: ANALYTICS_EVENTS.SUBSCRIPTION_PURCHASED,
    value: 500,
  },
  API_KEY_CREATED: {
    name: 'API Key Created',
    event: ANALYTICS_EVENTS.API_KEY_CREATED,
    value: 0,
  },
  ALERT_CONFIGURED: {
    name: 'Alert Configured',
    event: ANALYTICS_EVENTS.ALERT_CONFIGURED,
    value: 0,
  },
  NEWSLETTER_SIGNUP: {
    name: 'Newsletter Subscription',
    event: ANALYTICS_EVENTS.NEWSLETTER_SUBSCRIPTION,
    value: 0,
  },
} as const;

// Custom dimensions (for GA4)
export const CUSTOM_DIMENSIONS = {
  USER_TIER: 'user_tier',
  SIGNUP_DATE: 'signup_date',
  API_KEY_COUNT: 'api_key_count',
  ALERTS_CONFIGURED: 'alerts_configured',
  SUBSCRIPTION_STATUS: 'subscription_status',
  EXPERIMENT_VARIANT: 'experiment_variant',
} as const;

// Custom metrics
export const CUSTOM_METRICS = {
  API_CALLS_THIS_MONTH: 'api_calls_this_month',
  EXPLOITS_VIEWED_THIS_SESSION: 'exploits_viewed_this_session',
  TIME_TO_FIRST_API_CALL: 'time_to_first_api_call',
  TIME_TO_CONVERSION: 'time_to_conversion',
} as const;

// Event categories
export const EVENT_CATEGORIES = {
  EXPLOIT: 'Exploit',
  CONVERSION: 'Conversion',
  SUBSCRIPTION: 'Subscription',
  API: 'API',
  ALERT: 'Alert',
  DOCUMENTATION: 'Documentation',
  SOCIAL: 'Social',
  ERROR: 'Error',
  ENGAGEMENT: 'Engagement',
  FORM: 'Form',
  VIDEO: 'Video',
  DOWNLOAD: 'Download',
  SEARCH: 'Search',
  FILTER: 'Filter',
  AB_TEST: 'A/B Test',
  OUTBOUND: 'Outbound',
} as const;

// Conversion funnel steps
export const FUNNEL_STEPS = {
  LANDING: {
    step: 1,
    name: 'Landing Page Visit',
    event: ANALYTICS_EVENTS.LANDING_PAGE_VIEW,
  },
  PRICING: {
    step: 2,
    name: 'Pricing Page View',
    event: ANALYTICS_EVENTS.PRICING_PAGE_VIEWED,
  },
  SIGNUP_INITIATED: {
    step: 3,
    name: 'Signup Initiated',
    event: ANALYTICS_EVENTS.SIGNUP_INITIATED,
  },
  SIGNUP_COMPLETED: {
    step: 4,
    name: 'Signup Completed',
    event: ANALYTICS_EVENTS.SIGNUP_COMPLETED,
  },
  EMAIL_VERIFIED: {
    step: 5,
    name: 'Email Verified',
    event: ANALYTICS_EVENTS.EMAIL_VERIFIED,
  },
  SUBSCRIPTION_CREATED: {
    step: 6,
    name: 'Subscription Created',
    event: ANALYTICS_EVENTS.SUBSCRIPTION_PURCHASED,
  },
  FIRST_API_CALL: {
    step: 7,
    name: 'First API Call',
    event: ANALYTICS_EVENTS.FIRST_API_CALL,
  },
} as const;

// Filters (for excluding internal traffic, etc.)
export const ANALYTICS_FILTERS = {
  EXCLUDE_INTERNAL_IPS: [
    '127.0.0.1',
    '::1',
    // Add your team's IP addresses here
  ],
  EXCLUDE_BOTS: [
    'bot',
    'crawler',
    'spider',
    'scraper',
    'headless',
  ],
  EXCLUDE_PATHS: [
    '/admin',
    '/internal',
    '/_next',
    '/static/private',
  ],
} as const;

// Page groups (for easier analysis)
export const PAGE_GROUPS = {
  HOME: {
    paths: ['/', '/home'],
    name: 'Home Page',
  },
  EXPLOITS: {
    paths: ['/exploits', '/exploit/*'],
    name: 'Exploits',
  },
  PRICING: {
    paths: ['/pricing'],
    name: 'Pricing',
  },
  DOCS: {
    paths: ['/docs', '/docs/*'],
    name: 'Documentation',
  },
  BLOG: {
    paths: ['/blog', '/blog/*'],
    name: 'Blog',
  },
  DASHBOARD: {
    paths: ['/dashboard', '/dashboard/*'],
    name: 'Dashboard',
  },
  AUTH: {
    paths: ['/login', '/signup', '/reset-password', '/verify-email'],
    name: 'Authentication',
  },
  USE_CASES: {
    paths: ['/use-cases/*'],
    name: 'Use Cases',
  },
} as const;

// User segments (for targeted analysis)
export const USER_SEGMENTS = {
  NEW_USERS: {
    name: 'New Users',
    criteria: {
      signup_days_ago: { max: 7 },
    },
  },
  ACTIVE_USERS: {
    name: 'Active Users',
    criteria: {
      last_active_days_ago: { max: 30 },
    },
  },
  POWER_USERS: {
    name: 'Power Users',
    criteria: {
      api_calls_per_day: { min: 100 },
    },
  },
  FREE_TIER: {
    name: 'Free Tier Users',
    criteria: {
      tier: 'free',
    },
  },
  PRO_TIER: {
    name: 'Pro Tier Users',
    criteria: {
      tier: 'pro',
    },
  },
  ENTERPRISE_TIER: {
    name: 'Enterprise Tier Users',
    criteria: {
      tier: 'enterprise',
    },
  },
  AT_RISK: {
    name: 'At-Risk Users',
    criteria: {
      last_active_days_ago: { min: 14 },
      tier: ['pro', 'enterprise'],
    },
  },
} as const;

// Sampling configuration
export const SAMPLING_CONFIG = {
  PRODUCTION: {
    enabled: true,
    rate: 1.0, // 100% sampling in production
  },
  DEVELOPMENT: {
    enabled: false,
    rate: 0.0, // No sampling in development
  },
} as const;

// Debug configuration
export const DEBUG_CONFIG = {
  ENABLED: process.env.NODE_ENV === 'development',
  VERBOSE: process.env.ANALYTICS_DEBUG === 'true',
  CONSOLE_LOG: process.env.NODE_ENV === 'development',
} as const;

// Privacy configuration
export const PRIVACY_CONFIG = {
  ANONYMIZE_IP: true,
  COOKIE_EXPIRATION_DAYS: 365,
  RESPECT_DO_NOT_TRACK: true,
  GDPR_COMPLIANT: true,
  CCPA_COMPLIANT: true,
} as const;

// Provider configuration
export const PROVIDER_CONFIG = {
  GA4: {
    enabled: true,
    measurementId: process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || '',
  },
  GTM: {
    enabled: true,
    containerId: process.env.NEXT_PUBLIC_GTM_CONTAINER_ID || '',
  },
  MIXPANEL: {
    enabled: false,
    projectToken: process.env.NEXT_PUBLIC_MIXPANEL_TOKEN || '',
  },
  AMPLITUDE: {
    enabled: false,
    apiKey: process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY || '',
  },
  CUSTOM: {
    enabled: true,
    endpoint: process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT || '/api/analytics/track',
  },
} as const;

// Export configuration
export const ANALYTICS_CONFIG = {
  events: ANALYTICS_EVENTS,
  goals: CONVERSION_GOALS,
  dimensions: CUSTOM_DIMENSIONS,
  metrics: CUSTOM_METRICS,
  categories: EVENT_CATEGORIES,
  funnel: FUNNEL_STEPS,
  filters: ANALYTICS_FILTERS,
  pageGroups: PAGE_GROUPS,
  userSegments: USER_SEGMENTS,
  sampling: SAMPLING_CONFIG,
  debug: DEBUG_CONFIG,
  privacy: PRIVACY_CONFIG,
  providers: PROVIDER_CONFIG,
} as const;

export default ANALYTICS_CONFIG;
