/**
 * Conversion Tracking Module
 *
 * Tracks user conversion funnel with detailed step tracking:
 * 1. Landing page visit
 * 2. Pricing page view
 * 3. Signup initiated
 * 4. Email verified
 * 5. Subscription created
 * 6. First API call
 *
 * Features:
 * - Funnel visualization data
 * - Drop-off analysis
 * - Time-to-conversion tracking
 * - A/B test integration
 * - Attribution tracking
 */

import analytics from './analytics';
import GA4 from './ga4';
import Cookies from 'js-cookie';

// Conversion funnel steps
export enum FunnelStep {
  LANDING = 'landing',
  PRICING_VIEW = 'pricing_view',
  SIGNUP_INITIATED = 'signup_initiated',
  SIGNUP_COMPLETED = 'signup_completed',
  EMAIL_VERIFIED = 'email_verified',
  SUBSCRIPTION_CREATED = 'subscription_created',
  FIRST_API_CALL = 'first_api_call',
  FIRST_ALERT_CONFIGURED = 'first_alert_configured',
}

// Funnel step metadata
interface FunnelStepData {
  step: FunnelStep;
  timestamp: number;
  metadata?: Record<string, any>;
  source?: string;
  campaign?: string;
  medium?: string;
}

// Conversion data
interface ConversionData {
  steps: FunnelStepData[];
  startTime: number;
  lastStepTime: number;
  totalDuration?: number;
  completed: boolean;
  userId?: string;
  tier?: string;
  revenue?: number;
}

// Attribution data
interface AttributionData {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  referrer?: string;
  landingPage?: string;
  firstTouch?: {
    source: string;
    timestamp: number;
  };
  lastTouch?: {
    source: string;
    timestamp: number;
  };
}

class ConversionTracker {
  private conversionData: ConversionData | null = null;
  private attribution: AttributionData | null = null;

  constructor() {
    this.loadConversionData();
    this.loadAttribution();
    this.trackAttribution();
  }

  /**
   * Track funnel step
   */
  trackStep(
    step: FunnelStep,
    metadata?: Record<string, any>
  ): void {
    // Initialize conversion tracking if not started
    if (!this.conversionData) {
      this.initializeConversion();
    }

    const stepData: FunnelStepData = {
      step,
      timestamp: Date.now(),
      metadata,
      source: this.attribution?.lastTouch?.source,
      campaign: this.attribution?.campaign,
      medium: this.attribution?.medium,
    };

    this.conversionData!.steps.push(stepData);
    this.conversionData!.lastStepTime = Date.now();

    // Save to storage
    this.saveConversionData();

    // Track in analytics
    analytics.trackJourneyStep(step, {
      ...metadata,
      step_number: this.conversionData!.steps.length,
      time_since_start: Date.now() - this.conversionData!.startTime,
    });

    // Track specific events based on step
    this.trackStepEvent(step, metadata);

    console.log('Conversion: Tracked step', step, metadata);
  }

  /**
   * Track specific event based on funnel step
   */
  private trackStepEvent(step: FunnelStep, metadata?: Record<string, any>): void {
    switch (step) {
      case FunnelStep.LANDING:
        analytics.trackEvent('funnel_landing', {
          category: 'Conversion Funnel',
          label: 'Landing Page',
          customParams: {
            ...metadata,
            ...this.getAttributionParams(),
          },
        });
        break;

      case FunnelStep.PRICING_VIEW:
        GA4.trackPricingPageViewed({
          source: this.attribution?.lastTouch?.source,
          campaign: this.attribution?.campaign,
        });
        break;

      case FunnelStep.SIGNUP_INITIATED:
        GA4.trackSignupInitiated({
          source: this.attribution?.lastTouch?.source,
          tier: metadata?.tier,
        });
        break;

      case FunnelStep.SIGNUP_COMPLETED:
        GA4.trackSignupCompleted({
          user_id: metadata?.user_id || '',
          tier: metadata?.tier || 'free',
          signup_method: metadata?.signup_method || 'email',
          time_to_signup: this.getTimeToStep(FunnelStep.SIGNUP_COMPLETED),
        });
        break;

      case FunnelStep.EMAIL_VERIFIED:
        analytics.trackEvent('email_verified', {
          category: 'Conversion Funnel',
          label: 'Email Verified',
          customParams: {
            time_to_verify: this.getTimeBetweenSteps(
              FunnelStep.SIGNUP_COMPLETED,
              FunnelStep.EMAIL_VERIFIED
            ),
          },
        });
        break;

      case FunnelStep.SUBSCRIPTION_CREATED:
        analytics.trackConversion('subscription', metadata?.revenue);
        break;

      case FunnelStep.FIRST_API_CALL:
        analytics.trackEvent('first_api_call', {
          category: 'Conversion Funnel',
          label: 'First API Call',
          customParams: {
            time_to_api: this.getTimeToStep(FunnelStep.FIRST_API_CALL),
          },
        });
        break;

      case FunnelStep.FIRST_ALERT_CONFIGURED:
        analytics.trackEvent('first_alert_configured', {
          category: 'Conversion Funnel',
          label: 'First Alert Configured',
          customParams: {
            time_to_alert: this.getTimeToStep(FunnelStep.FIRST_ALERT_CONFIGURED),
          },
        });
        break;
    }
  }

  /**
   * Mark conversion as completed
   */
  completeConversion(params: {
    userId: string;
    tier: string;
    revenue?: number;
  }): void {
    if (!this.conversionData) {
      console.warn('Conversion: No conversion data to complete');
      return;
    }

    this.conversionData.completed = true;
    this.conversionData.userId = params.userId;
    this.conversionData.tier = params.tier;
    this.conversionData.revenue = params.revenue;
    this.conversionData.totalDuration = Date.now() - this.conversionData.startTime;

    this.saveConversionData();

    // Track conversion completion
    analytics.trackConversion('complete', params.revenue);

    // Send conversion data to backend for analysis
    this.sendConversionData();

    console.log('Conversion: Completed', this.conversionData);
  }

  /**
   * Get funnel data
   */
  getFunnelData(): ConversionData | null {
    return this.conversionData;
  }

  /**
   * Get conversion rate for a specific step
   */
  getConversionRate(fromStep: FunnelStep, toStep: FunnelStep): number {
    if (!this.conversionData) return 0;

    const fromStepExists = this.conversionData.steps.some(s => s.step === fromStep);
    const toStepExists = this.conversionData.steps.some(s => s.step === toStep);

    if (!fromStepExists) return 0;
    return toStepExists ? 1 : 0;
  }

  /**
   * Get time to reach a specific step
   */
  getTimeToStep(step: FunnelStep): number {
    if (!this.conversionData) return 0;

    const stepData = this.conversionData.steps.find(s => s.step === step);
    if (!stepData) return 0;

    return stepData.timestamp - this.conversionData.startTime;
  }

  /**
   * Get time between two steps
   */
  getTimeBetweenSteps(fromStep: FunnelStep, toStep: FunnelStep): number {
    if (!this.conversionData) return 0;

    const fromStepData = this.conversionData.steps.find(s => s.step === fromStep);
    const toStepData = this.conversionData.steps.find(s => s.step === toStep);

    if (!fromStepData || !toStepData) return 0;

    return toStepData.timestamp - fromStepData.timestamp;
  }

  /**
   * Get drop-off points
   */
  getDropOffPoints(): FunnelStep[] {
    if (!this.conversionData) return [];

    const expectedSteps = Object.values(FunnelStep);
    const completedSteps = this.conversionData.steps.map(s => s.step);

    return expectedSteps.filter(step => !completedSteps.includes(step));
  }

  /**
   * Initialize conversion tracking
   */
  private initializeConversion(): void {
    this.conversionData = {
      steps: [],
      startTime: Date.now(),
      lastStepTime: Date.now(),
      completed: false,
    };

    this.saveConversionData();
  }

  /**
   * Track attribution data
   */
  private trackAttribution(): void {
    // Parse UTM parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    const utmSource = urlParams.get('utm_source');
    const utmMedium = urlParams.get('utm_medium');
    const utmCampaign = urlParams.get('utm_campaign');
    const utmTerm = urlParams.get('utm_term');
    const utmContent = urlParams.get('utm_content');

    // If we have UTM parameters, update attribution
    if (utmSource || utmMedium || utmCampaign) {
      const currentAttribution = {
        source: utmSource || 'direct',
        timestamp: Date.now(),
      };

      // Update last touch
      this.attribution = {
        ...this.attribution,
        source: utmSource || this.attribution?.source,
        medium: utmMedium || this.attribution?.medium,
        campaign: utmCampaign || this.attribution?.campaign,
        term: utmTerm || this.attribution?.term,
        content: utmContent || this.attribution?.content,
        lastTouch: currentAttribution,
      };

      // Set first touch if not set
      if (!this.attribution.firstTouch) {
        this.attribution.firstTouch = currentAttribution;
      }

      this.saveAttribution();
    }

    // Track referrer
    if (document.referrer && !this.attribution?.referrer) {
      this.attribution = {
        ...this.attribution,
        referrer: document.referrer,
      };
      this.saveAttribution();
    }

    // Track landing page
    if (!this.attribution?.landingPage) {
      this.attribution = {
        ...this.attribution,
        landingPage: window.location.pathname,
      };
      this.saveAttribution();
    }
  }

  /**
   * Get attribution parameters for tracking
   */
  private getAttributionParams(): Record<string, any> {
    return {
      source: this.attribution?.source,
      medium: this.attribution?.medium,
      campaign: this.attribution?.campaign,
      term: this.attribution?.term,
      content: this.attribution?.content,
      referrer: this.attribution?.referrer,
      landing_page: this.attribution?.landingPage,
      first_touch_source: this.attribution?.firstTouch?.source,
      last_touch_source: this.attribution?.lastTouch?.source,
    };
  }

  /**
   * Load conversion data from storage
   */
  private loadConversionData(): void {
    const stored = localStorage.getItem('conversion_data');
    if (stored) {
      try {
        this.conversionData = JSON.parse(stored);
      } catch (error) {
        console.error('Conversion: Failed to load conversion data', error);
      }
    }
  }

  /**
   * Save conversion data to storage
   */
  private saveConversionData(): void {
    if (this.conversionData) {
      localStorage.setItem('conversion_data', JSON.stringify(this.conversionData));
    }
  }

  /**
   * Load attribution data from storage
   */
  private loadAttribution(): void {
    const stored = localStorage.getItem('attribution_data');
    if (stored) {
      try {
        this.attribution = JSON.parse(stored);
      } catch (error) {
        console.error('Conversion: Failed to load attribution data', error);
      }
    }
  }

  /**
   * Save attribution data to storage
   */
  private saveAttribution(): void {
    if (this.attribution) {
      localStorage.setItem('attribution_data', JSON.stringify(this.attribution));
    }
  }

  /**
   * Send conversion data to backend for analysis
   */
  private async sendConversionData(): Promise<void> {
    if (!this.conversionData) return;

    try {
      const endpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT || '/api/analytics/conversion';

      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversion: this.conversionData,
          attribution: this.attribution,
          timestamp: Date.now(),
        }),
      });
    } catch (error) {
      console.error('Conversion: Failed to send conversion data', error);
    }
  }

  /**
   * Clear conversion data (after completion or for testing)
   */
  clearConversionData(): void {
    this.conversionData = null;
    localStorage.removeItem('conversion_data');
  }

  /**
   * Clear attribution data (for testing)
   */
  clearAttribution(): void {
    this.attribution = null;
    localStorage.removeItem('attribution_data');
  }

  /**
   * Reset all data
   */
  reset(): void {
    this.clearConversionData();
    this.clearAttribution();
  }
}

// Create singleton instance
const conversionTracker = new ConversionTracker();

// Export singleton
export default conversionTracker;

// Export for testing
export { ConversionTracker };
