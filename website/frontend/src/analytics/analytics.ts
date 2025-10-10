/**
 * Unified Analytics Interface
 *
 * Provides a single interface for multiple analytics providers:
 * - Google Analytics 4 (primary)
 * - Mixpanel (user behavior tracking)
 * - Amplitude (product analytics)
 * - Custom backend analytics
 *
 * Supports:
 * - Multi-provider event tracking
 * - User journey tracking
 * - Privacy compliance (GDPR, CCPA)
 * - Event batching and queuing
 * - Offline support
 */

import GA4 from './ga4';
import Cookies from 'js-cookie';

// Analytics providers
export enum AnalyticsProvider {
  GA4 = 'ga4',
  MIXPANEL = 'mixpanel',
  AMPLITUDE = 'amplitude',
  CUSTOM = 'custom',
}

// Event types
export enum EventType {
  PAGE_VIEW = 'page_view',
  CLICK = 'click',
  FORM_SUBMIT = 'form_submit',
  CONVERSION = 'conversion',
  ERROR = 'error',
  CUSTOM = 'custom',
}

// User properties
export interface UserProperties {
  userId?: string;
  email?: string;
  tier?: 'free' | 'pro' | 'enterprise';
  signupDate?: string;
  lastLoginDate?: string;
  apiKeyCount?: number;
  alertsConfigured?: boolean;
  customAttributes?: Record<string, any>;
}

// Event parameters
export interface EventParameters {
  category?: string;
  label?: string;
  value?: number;
  customParams?: Record<string, any>;
}

// Privacy settings
export interface PrivacySettings {
  analyticsEnabled: boolean;
  marketingEnabled: boolean;
  personalizedAdsEnabled: boolean;
  thirdPartyEnabled: boolean;
}

// Event queue for offline support
interface QueuedEvent {
  timestamp: number;
  provider: AnalyticsProvider;
  eventName: string;
  parameters?: EventParameters;
}

class Analytics {
  private enabledProviders: Set<AnalyticsProvider> = new Set();
  private userProperties: UserProperties = {};
  private eventQueue: QueuedEvent[] = [];
  private isInitialized = false;
  private privacySettings: PrivacySettings = {
    analyticsEnabled: false,
    marketingEnabled: false,
    personalizedAdsEnabled: false,
    thirdPartyEnabled: false,
  };

  /**
   * Initialize analytics
   */
  initialize(providers: AnalyticsProvider[] = [AnalyticsProvider.GA4]): void {
    if (this.isInitialized) {
      console.log('Analytics: Already initialized');
      return;
    }

    // Load privacy settings
    this.loadPrivacySettings();

    if (!this.privacySettings.analyticsEnabled) {
      console.log('Analytics: User has not consented to analytics');
      return;
    }

    // Initialize each provider
    providers.forEach((provider) => {
      this.initializeProvider(provider);
    });

    // Process queued events
    this.processEventQueue();

    this.isInitialized = true;
    console.log('Analytics: Initialized successfully', providers);
  }

  /**
   * Initialize a specific provider
   */
  private initializeProvider(provider: AnalyticsProvider): void {
    try {
      switch (provider) {
        case AnalyticsProvider.GA4:
          GA4.initialize();
          this.enabledProviders.add(provider);
          break;

        case AnalyticsProvider.MIXPANEL:
          // TODO: Initialize Mixpanel
          console.log('Mixpanel initialization not implemented yet');
          break;

        case AnalyticsProvider.AMPLITUDE:
          // TODO: Initialize Amplitude
          console.log('Amplitude initialization not implemented yet');
          break;

        case AnalyticsProvider.CUSTOM:
          // Custom backend analytics
          this.enabledProviders.add(provider);
          break;

        default:
          console.warn('Analytics: Unknown provider', provider);
      }
    } catch (error) {
      console.error(`Analytics: Failed to initialize ${provider}`, error);
    }
  }

  /**
   * Track page view
   */
  trackPageView(path?: string, title?: string): void {
    if (!this.isInitialized) {
      this.queueEvent(AnalyticsProvider.GA4, 'page_view', {
        customParams: { path, title },
      });
      return;
    }

    this.enabledProviders.forEach((provider) => {
      try {
        switch (provider) {
          case AnalyticsProvider.GA4:
            GA4.trackPageView(path, title);
            break;

          case AnalyticsProvider.CUSTOM:
            this.sendToCustomBackend('page_view', { path, title });
            break;
        }
      } catch (error) {
        console.error(`Analytics: Failed to track page view on ${provider}`, error);
      }
    });
  }

  /**
   * Track custom event
   */
  trackEvent(
    eventName: string,
    parameters?: EventParameters,
    providers?: AnalyticsProvider[]
  ): void {
    if (!this.isInitialized) {
      this.queueEvent(AnalyticsProvider.GA4, eventName, parameters);
      return;
    }

    const targetProviders = providers || Array.from(this.enabledProviders);

    targetProviders.forEach((provider) => {
      try {
        switch (provider) {
          case AnalyticsProvider.GA4:
            GA4.trackEvent(eventName, parameters?.customParams);
            break;

          case AnalyticsProvider.CUSTOM:
            this.sendToCustomBackend(eventName, parameters);
            break;
        }
      } catch (error) {
        console.error(`Analytics: Failed to track event on ${provider}`, error);
      }
    });
  }

  /**
   * Set user properties
   */
  setUserProperties(properties: UserProperties): void {
    this.userProperties = { ...this.userProperties, ...properties };

    if (!this.isInitialized) return;

    this.enabledProviders.forEach((provider) => {
      try {
        switch (provider) {
          case AnalyticsProvider.GA4:
            GA4.setUserProperties({
              user_tier: properties.tier,
              signup_date: properties.signupDate,
              api_key_count: properties.apiKeyCount,
              alerts_configured: properties.alertsConfigured,
              ...properties.customAttributes,
            });
            break;
        }
      } catch (error) {
        console.error(`Analytics: Failed to set user properties on ${provider}`, error);
      }
    });
  }

  /**
   * Set user ID
   */
  setUserId(userId: string | null): void {
    this.userProperties.userId = userId || undefined;

    if (!this.isInitialized) return;

    this.enabledProviders.forEach((provider) => {
      try {
        switch (provider) {
          case AnalyticsProvider.GA4:
            GA4.setUserId(userId);
            break;
        }
      } catch (error) {
        console.error(`Analytics: Failed to set user ID on ${provider}`, error);
      }
    });
  }

  /**
   * Track user journey step
   */
  trackJourneyStep(step: string, metadata?: Record<string, any>): void {
    const journey = this.getUserJourney();
    journey.push({
      step,
      timestamp: Date.now(),
      metadata,
    });

    // Keep only last 50 steps
    if (journey.length > 50) {
      journey.shift();
    }

    sessionStorage.setItem('user_journey', JSON.stringify(journey));

    this.trackEvent('journey_step', {
      label: step,
      customParams: { step, ...metadata },
    });
  }

  /**
   * Get user journey
   */
  getUserJourney(): Array<{
    step: string;
    timestamp: number;
    metadata?: Record<string, any>;
  }> {
    const stored = sessionStorage.getItem('user_journey');
    return stored ? JSON.parse(stored) : [];
  }

  /**
   * Clear user journey
   */
  clearUserJourney(): void {
    sessionStorage.removeItem('user_journey');
  }

  /**
   * Track conversion
   */
  trackConversion(
    conversionType: string,
    value?: number,
    currency: string = 'USD'
  ): void {
    this.trackEvent('conversion', {
      category: 'Conversion',
      label: conversionType,
      value,
      customParams: {
        conversion_type: conversionType,
        value,
        currency,
      },
    });
  }

  /**
   * Track error
   */
  trackError(
    errorType: string,
    errorMessage: string,
    errorLocation: string,
    fatal: boolean = false
  ): void {
    this.trackEvent('error_occurred', {
      category: 'Error',
      label: errorType,
      customParams: {
        error_type: errorType,
        error_message: errorMessage,
        error_location: errorLocation,
        fatal,
        user_tier: this.userProperties.tier,
      },
    });

    // Also track as exception in GA4
    if (this.enabledProviders.has(AnalyticsProvider.GA4)) {
      GA4.trackException({
        description: `${errorType}: ${errorMessage}`,
        fatal,
      });
    }
  }

  /**
   * Load privacy settings from cookies
   */
  private loadPrivacySettings(): void {
    const analyticsConsent = Cookies.get('analytics_consent') === 'true';
    const marketingConsent = Cookies.get('marketing_consent') === 'true';
    const personalizedAdsConsent = Cookies.get('personalized_ads_consent') === 'true';
    const thirdPartyConsent = Cookies.get('third_party_consent') === 'true';

    this.privacySettings = {
      analyticsEnabled: analyticsConsent,
      marketingEnabled: marketingConsent,
      personalizedAdsEnabled: personalizedAdsConsent,
      thirdPartyEnabled: thirdPartyConsent,
    };
  }

  /**
   * Update privacy settings
   */
  updatePrivacySettings(settings: Partial<PrivacySettings>): void {
    this.privacySettings = { ...this.privacySettings, ...settings };

    // Update cookies
    if (settings.analyticsEnabled !== undefined) {
      if (settings.analyticsEnabled) {
        Cookies.set('analytics_consent', 'true', { expires: 365 });
        GA4.setAnalyticsConsent(true);
        if (!this.isInitialized) {
          this.initialize([AnalyticsProvider.GA4]);
        }
      } else {
        Cookies.remove('analytics_consent');
        GA4.setAnalyticsConsent(false);
        this.isInitialized = false;
        this.enabledProviders.clear();
      }
    }

    if (settings.marketingEnabled !== undefined) {
      Cookies.set('marketing_consent', settings.marketingEnabled.toString(), {
        expires: 365,
      });
    }

    if (settings.personalizedAdsEnabled !== undefined) {
      Cookies.set(
        'personalized_ads_consent',
        settings.personalizedAdsEnabled.toString(),
        { expires: 365 }
      );
    }

    if (settings.thirdPartyEnabled !== undefined) {
      Cookies.set('third_party_consent', settings.thirdPartyEnabled.toString(), {
        expires: 365,
      });
    }
  }

  /**
   * Get current privacy settings
   */
  getPrivacySettings(): PrivacySettings {
    return { ...this.privacySettings };
  }

  /**
   * Queue event for later processing (offline support)
   */
  private queueEvent(
    provider: AnalyticsProvider,
    eventName: string,
    parameters?: EventParameters
  ): void {
    this.eventQueue.push({
      timestamp: Date.now(),
      provider,
      eventName,
      parameters,
    });

    // Keep queue size under control
    if (this.eventQueue.length > 100) {
      this.eventQueue.shift();
    }
  }

  /**
   * Process queued events
   */
  private processEventQueue(): void {
    if (this.eventQueue.length === 0) return;

    console.log(`Analytics: Processing ${this.eventQueue.length} queued events`);

    const queue = [...this.eventQueue];
    this.eventQueue = [];

    queue.forEach((event) => {
      try {
        if (event.eventName === 'page_view') {
          this.trackPageView(
            event.parameters?.customParams?.path,
            event.parameters?.customParams?.title
          );
        } else {
          this.trackEvent(event.eventName, event.parameters, [event.provider]);
        }
      } catch (error) {
        console.error('Analytics: Failed to process queued event', error);
      }
    });
  }

  /**
   * Send event to custom backend
   */
  private async sendToCustomBackend(
    eventName: string,
    parameters?: EventParameters | Record<string, any>
  ): Promise<void> {
    try {
      const endpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT || '/api/analytics/track';

      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event: eventName,
          parameters,
          userId: this.userProperties.userId,
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        }),
      });
    } catch (error) {
      console.error('Analytics: Failed to send to custom backend', error);
    }
  }

  /**
   * Reset analytics (for testing)
   */
  reset(): void {
    this.enabledProviders.clear();
    this.userProperties = {};
    this.eventQueue = [];
    this.isInitialized = false;
    this.clearUserJourney();
  }
}

// Create singleton instance
const analytics = new Analytics();

// Export singleton
export default analytics;

// Export for testing
export { Analytics };
