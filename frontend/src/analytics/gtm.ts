/**
 * Google Tag Manager Integration
 *
 * Provides GTM integration with:
 * - DataLayer push for events
 * - Custom dimensions and metrics
 * - E-commerce tracking
 * - User properties
 * - Enhanced e-commerce
 *
 * Configuration:
 * - VITE_GTM_CONTAINER_ID: GTM container ID (GTM-XXXXXXX)
 */

interface DataLayerEvent {
  event: string;
  [key: string]: any;
}

interface GTMConfig {
  containerId: string;
  debug: boolean;
  enabled: boolean;
}

class GoogleTagManager {
  private config: GTMConfig;
  private dataLayer: DataLayerEvent[] = [];

  constructor() {
    this.config = {
      containerId: process.env.NEXT_PUBLIC_GTM_CONTAINER_ID || '',
      debug: process.env.NEXT_PUBLIC_GTM_DEBUG === 'true',
      enabled: !!process.env.NEXT_PUBLIC_GTM_CONTAINER_ID,
    };

    // Initialize dataLayer array
    if (typeof window !== 'undefined') {
      (window as any).dataLayer = (window as any).dataLayer || [];
      this.dataLayer = (window as any).dataLayer;
    }
  }

  /**
   * Initialize GTM
   */
  initialize(): void {
    if (!this.config.enabled) {
      console.warn('GTM: Container ID not configured');
      return;
    }

    if (typeof window === 'undefined') {
      console.warn('GTM: Window object not available');
      return;
    }

    // Check if GTM is already loaded
    if ((window as any).google_tag_manager) {
      console.log('GTM: Already initialized');
      return;
    }

    // Add GTM script
    this.loadGTMScript();

    console.log('GTM: Initialized successfully', this.config.containerId);
  }

  /**
   * Load GTM script
   */
  private loadGTMScript(): void {
    const script = document.createElement('script');
    script.innerHTML = `
      (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
      new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
      j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
      'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
      })(window,document,'script','dataLayer','${this.config.containerId}');
    `;
    document.head.appendChild(script);

    // Add noscript iframe
    const noscript = document.createElement('noscript');
    noscript.innerHTML = `
      <iframe src="https://www.googletagmanager.com/ns.html?id=${this.config.containerId}"
              height="0" width="0" style="display:none;visibility:hidden"></iframe>
    `;
    document.body.insertBefore(noscript, document.body.firstChild);
  }

  /**
   * Push event to dataLayer
   */
  push(event: DataLayerEvent): void {
    if (!this.config.enabled) return;

    try {
      this.dataLayer.push(event);

      if (this.config.debug) {
        console.log('GTM: Event pushed', event);
      }
    } catch (error) {
      console.error('GTM: Failed to push event', error);
    }
  }

  /**
   * Track page view
   */
  trackPageView(params: {
    page_path: string;
    page_title: string;
    page_location?: string;
  }): void {
    this.push({
      event: 'page_view',
      page_path: params.page_path,
      page_title: params.page_title,
      page_location: params.page_location || window.location.href,
    });
  }

  /**
   * Track custom event
   */
  trackEvent(params: {
    event: string;
    category?: string;
    action?: string;
    label?: string;
    value?: number;
    [key: string]: any;
  }): void {
    const { event, category, action, label, value, ...otherParams } = params;
    this.push({
      event,
      event_category: category,
      event_action: action,
      event_label: label,
      event_value: value,
      ...otherParams,
    });
  }

  /**
   * Set user properties
   */
  setUserProperties(properties: Record<string, any>): void {
    this.push({
      event: 'user_properties',
      user_properties: properties,
    });
  }

  /**
   * Set user ID
   */
  setUserId(userId: string | null): void {
    this.push({
      event: 'user_id',
      user_id: userId,
    });
  }

  // ============================================================================
  // E-commerce Tracking
  // ============================================================================

  /**
   * Track product view
   */
  trackProductView(params: {
    item_id: string;
    item_name: string;
    item_category: string;
    price: number;
    currency?: string;
  }): void {
    this.push({
      event: 'view_item',
      ecommerce: {
        currency: params.currency || 'USD',
        value: params.price,
        items: [
          {
            item_id: params.item_id,
            item_name: params.item_name,
            item_category: params.item_category,
            price: params.price,
          },
        ],
      },
    });
  }

  /**
   * Track add to cart
   */
  trackAddToCart(params: {
    item_id: string;
    item_name: string;
    item_category: string;
    price: number;
    quantity?: number;
    currency?: string;
  }): void {
    this.push({
      event: 'add_to_cart',
      ecommerce: {
        currency: params.currency || 'USD',
        value: params.price * (params.quantity || 1),
        items: [
          {
            item_id: params.item_id,
            item_name: params.item_name,
            item_category: params.item_category,
            price: params.price,
            quantity: params.quantity || 1,
          },
        ],
      },
    });
  }

  /**
   * Track checkout initiation
   */
  trackBeginCheckout(params: {
    items: Array<{
      item_id: string;
      item_name: string;
      item_category: string;
      price: number;
      quantity?: number;
    }>;
    value: number;
    currency?: string;
  }): void {
    this.push({
      event: 'begin_checkout',
      ecommerce: {
        currency: params.currency || 'USD',
        value: params.value,
        items: params.items,
      },
    });
  }

  /**
   * Track purchase
   */
  trackPurchase(params: {
    transaction_id: string;
    value: number;
    currency?: string;
    tax?: number;
    shipping?: number;
    items: Array<{
      item_id: string;
      item_name: string;
      item_category: string;
      price: number;
      quantity?: number;
    }>;
  }): void {
    this.push({
      event: 'purchase',
      ecommerce: {
        transaction_id: params.transaction_id,
        value: params.value,
        currency: params.currency || 'USD',
        tax: params.tax || 0,
        shipping: params.shipping || 0,
        items: params.items,
      },
    });
  }

  /**
   * Track refund
   */
  trackRefund(params: {
    transaction_id: string;
    value?: number;
    currency?: string;
  }): void {
    this.push({
      event: 'refund',
      ecommerce: {
        transaction_id: params.transaction_id,
        value: params.value,
        currency: params.currency || 'USD',
      },
    });
  }

  // ============================================================================
  // Custom Dimensions & Metrics
  // ============================================================================

  /**
   * Set custom dimension
   */
  setCustomDimension(index: number, value: string): void {
    this.push({
      event: 'custom_dimension',
      [`dimension${index}`]: value,
    });
  }

  /**
   * Set custom metric
   */
  setCustomMetric(index: number, value: number): void {
    this.push({
      event: 'custom_metric',
      [`metric${index}`]: value,
    });
  }

  // ============================================================================
  // Conversion Tracking
  // ============================================================================

  /**
   * Track conversion
   */
  trackConversion(params: {
    conversion_id: string;
    conversion_label: string;
    value?: number;
    currency?: string;
  }): void {
    this.push({
      event: 'conversion',
      send_to: `${params.conversion_id}/${params.conversion_label}`,
      value: params.value,
      currency: params.currency || 'USD',
    });
  }

  /**
   * Track signup
   */
  trackSignup(params: {
    method: string;
    tier: string;
  }): void {
    this.push({
      event: 'sign_up',
      method: params.method,
      tier: params.tier,
    });
  }

  /**
   * Track login
   */
  trackLogin(params: {
    method: string;
  }): void {
    this.push({
      event: 'login',
      method: params.method,
    });
  }

  // ============================================================================
  // Utility Functions
  // ============================================================================

  /**
   * Clear ecommerce data
   */
  clearEcommerce(): void {
    this.push({
      event: 'clear_ecommerce',
      ecommerce: null,
    });
  }

  /**
   * Get configuration
   */
  getConfig(): GTMConfig {
    return { ...this.config };
  }

  /**
   * Check if GTM is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

// Create singleton instance
const gtm = new GoogleTagManager();

export default gtm;

// Export for testing
export { GoogleTagManager };
