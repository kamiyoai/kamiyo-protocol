/**
 * Performance Tracking Module
 *
 * Tracks web performance metrics including:
 * - Core Web Vitals (CLS, FID, LCP)
 * - Custom performance marks
 * - API response times
 * - JavaScript errors
 * - Resource timing
 *
 * Sends metrics to:
 * - Google Analytics 4
 * - Custom backend for monitoring
 */

import { onCLS, onFID, onLCP, onFCP, onTTFB, Metric } from 'web-vitals';
import GA4 from './ga4';

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  LCP: { good: 2500, needsImprovement: 4000 },
  FID: { good: 100, needsImprovement: 300 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  FCP: { good: 1800, needsImprovement: 3000 },
  TTFB: { good: 800, needsImprovement: 1800 },
};

// Performance mark names
export enum PerformanceMark {
  APP_START = 'app_start',
  APP_READY = 'app_ready',
  DATA_FETCH_START = 'data_fetch_start',
  DATA_FETCH_END = 'data_fetch_end',
  RENDER_START = 'render_start',
  RENDER_END = 'render_end',
  INTERACTION_START = 'interaction_start',
  INTERACTION_END = 'interaction_end',
}

// API performance data
interface ApiPerformance {
  endpoint: string;
  method: string;
  duration: number;
  status: number;
  success: boolean;
  timestamp: number;
}

// Error tracking data
interface ErrorData {
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  lineNumber?: number;
  columnNumber?: number;
  timestamp: number;
  userAgent: string;
}

class PerformanceTracker {
  private apiPerformanceData: ApiPerformance[] = [];
  private errors: ErrorData[] = [];
  private isInitialized = false;

  /**
   * Initialize performance tracking
   */
  initialize(): void {
    if (this.isInitialized) {
      console.log('Performance: Already initialized');
      return;
    }

    // Track Core Web Vitals
    this.trackWebVitals();

    // Track navigation timing
    this.trackNavigationTiming();

    // Track resource timing
    this.trackResourceTiming();

    // Setup error tracking
    this.setupErrorTracking();

    // Track long tasks
    this.trackLongTasks();

    this.isInitialized = true;
    console.log('Performance: Initialized successfully');
  }

  /**
   * Track Core Web Vitals
   */
  private trackWebVitals(): void {
    // Largest Contentful Paint (LCP)
    onLCP((metric: Metric) => {
      this.reportWebVital('LCP', metric);
    });

    // First Input Delay (FID)
    onFID((metric: Metric) => {
      this.reportWebVital('FID', metric);
    });

    // Cumulative Layout Shift (CLS)
    onCLS((metric: Metric) => {
      this.reportWebVital('CLS', metric);
    });

    // First Contentful Paint (FCP)
    onFCP((metric: Metric) => {
      this.reportWebVital('FCP', metric);
    });

    // Time to First Byte (TTFB)
    onTTFB((metric: Metric) => {
      this.reportWebVital('TTFB', metric);
    });
  }

  /**
   * Report Web Vital metric
   */
  private reportWebVital(name: string, metric: Metric): void {
    const rating = this.getRating(name, metric.value);

    // Send to GA4
    GA4.trackTiming({
      name: `web_vital_${name.toLowerCase()}`,
      value: Math.round(metric.value),
      category: 'Web Vitals',
      label: rating,
    });

    // Send to custom backend
    this.sendToBackend('web_vital', {
      name,
      value: metric.value,
      rating,
      id: metric.id,
      delta: metric.delta,
      navigationType: metric.navigationType,
    });

    console.log(`Performance: ${name}`, {
      value: metric.value,
      rating,
    });
  }

  /**
   * Get rating for a metric
   */
  private getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
    const threshold = THRESHOLDS[name as keyof typeof THRESHOLDS];
    if (!threshold) return 'good';

    if (value <= threshold.good) return 'good';
    if (value <= threshold.needsImprovement) return 'needs-improvement';
    return 'poor';
  }

  /**
   * Track navigation timing
   */
  private trackNavigationTiming(): void {
    if (typeof window === 'undefined' || !window.performance) return;

    window.addEventListener('load', () => {
      setTimeout(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (!navigation) return;

        const timings = {
          dns: navigation.domainLookupEnd - navigation.domainLookupStart,
          tcp: navigation.connectEnd - navigation.connectStart,
          request: navigation.responseStart - navigation.requestStart,
          response: navigation.responseEnd - navigation.responseStart,
          dom: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
          load: navigation.loadEventEnd - navigation.loadEventStart,
          total: navigation.loadEventEnd - navigation.fetchStart,
        };

        // Send to GA4
        Object.entries(timings).forEach(([name, value]) => {
          if (value > 0) {
            GA4.trackTiming({
              name: `navigation_${name}`,
              value: Math.round(value),
              category: 'Navigation Timing',
            });
          }
        });

        // Send to backend
        this.sendToBackend('navigation_timing', timings);

        console.log('Performance: Navigation timing', timings);
      }, 0);
    });
  }

  /**
   * Track resource timing
   */
  private trackResourceTiming(): void {
    if (typeof window === 'undefined' || !window.performance) return;

    window.addEventListener('load', () => {
      setTimeout(() => {
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

        // Group by resource type
        const resourcesByType: Record<string, number[]> = {};

        resources.forEach((resource) => {
          const type = this.getResourceType(resource.name);
          if (!resourcesByType[type]) {
            resourcesByType[type] = [];
          }
          resourcesByType[type].push(resource.duration);
        });

        // Calculate averages
        const averages: Record<string, number> = {};
        Object.entries(resourcesByType).forEach(([type, durations]) => {
          averages[type] = durations.reduce((a, b) => a + b, 0) / durations.length;
        });

        // Send to backend
        this.sendToBackend('resource_timing', {
          averages,
          counts: Object.fromEntries(
            Object.entries(resourcesByType).map(([type, durations]) => [
              type,
              durations.length,
            ])
          ),
        });

        console.log('Performance: Resource timing', averages);
      }, 0);
    });
  }

  /**
   * Get resource type from URL
   */
  private getResourceType(url: string): string {
    if (url.match(/\.(js)$/)) return 'script';
    if (url.match(/\.(css)$/)) return 'stylesheet';
    if (url.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)) return 'image';
    if (url.match(/\.(woff|woff2|ttf|otf)$/)) return 'font';
    if (url.includes('/api/')) return 'api';
    return 'other';
  }

  /**
   * Track long tasks (tasks > 50ms)
   */
  private trackLongTasks(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          // Track long task
          GA4.trackEvent('long_task', {
            duration: Math.round(entry.duration),
            start_time: Math.round(entry.startTime),
          });

          console.warn('Performance: Long task detected', {
            duration: entry.duration,
            startTime: entry.startTime,
          });
        });
      });

      observer.observe({ entryTypes: ['longtask'] });
    } catch (error) {
      console.error('Performance: Failed to observe long tasks', error);
    }
  }

  /**
   * Setup error tracking
   */
  private setupErrorTracking(): void {
    if (typeof window === 'undefined') return;

    // Track unhandled errors
    window.addEventListener('error', (event) => {
      this.trackError({
        message: event.message,
        url: event.filename,
        lineNumber: event.lineno,
        columnNumber: event.colno,
        stack: event.error?.stack,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
      });
    });

    // Track unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.trackError({
        message: event.reason?.message || 'Unhandled Promise Rejection',
        stack: event.reason?.stack,
        url: window.location.href,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
      });
    });
  }

  /**
   * Track JavaScript error
   */
  trackError(error: ErrorData): void {
    this.errors.push(error);

    // Keep only last 50 errors
    if (this.errors.length > 50) {
      this.errors.shift();
    }

    // Send to GA4
    GA4.trackError({
      error_type: 'javascript_error',
      error_message: error.message,
      error_location: error.url,
    });

    // Send to backend
    this.sendToBackend('error', error);

    console.error('Performance: Error tracked', error);
  }

  /**
   * Create custom performance mark
   */
  mark(name: string): void {
    if (typeof window === 'undefined' || !window.performance) return;

    try {
      performance.mark(name);
    } catch (error) {
      console.error('Performance: Failed to create mark', error);
    }
  }

  /**
   * Measure time between two marks
   */
  measure(name: string, startMark: string, endMark: string): number | null {
    if (typeof window === 'undefined' || !window.performance) return null;

    try {
      performance.measure(name, startMark, endMark);
      const measure = performance.getEntriesByName(name)[0];

      if (measure) {
        // Send to GA4
        GA4.trackTiming({
          name,
          value: Math.round(measure.duration),
          category: 'Custom Timing',
        });

        return measure.duration;
      }
    } catch (error) {
      console.error('Performance: Failed to measure', error);
    }

    return null;
  }

  /**
   * Track API request performance
   */
  trackApiRequest(params: {
    endpoint: string;
    method: string;
    duration: number;
    status: number;
    success: boolean;
  }): void {
    const data: ApiPerformance = {
      ...params,
      timestamp: Date.now(),
    };

    this.apiPerformanceData.push(data);

    // Keep only last 100 requests
    if (this.apiPerformanceData.length > 100) {
      this.apiPerformanceData.shift();
    }

    // Send to GA4 if slow (> 1 second)
    if (params.duration > 1000) {
      GA4.trackTiming({
        name: 'api_request_slow',
        value: Math.round(params.duration),
        category: 'API Performance',
        label: params.endpoint,
      });
    }

    // Send to backend
    this.sendToBackend('api_performance', data);

    if (import.meta.env.MODE === 'development') {
      console.log('Performance: API request', data);
    }
  }

  /**
   * Get API performance statistics
   */
  getApiPerformanceStats(): {
    averageDuration: number;
    slowestRequest: ApiPerformance | null;
    fastestRequest: ApiPerformance | null;
    successRate: number;
  } {
    if (this.apiPerformanceData.length === 0) {
      return {
        averageDuration: 0,
        slowestRequest: null,
        fastestRequest: null,
        successRate: 0,
      };
    }

    const durations = this.apiPerformanceData.map((d) => d.duration);
    const averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    const slowestRequest = this.apiPerformanceData.reduce((prev, current) =>
      prev.duration > current.duration ? prev : current
    );

    const fastestRequest = this.apiPerformanceData.reduce((prev, current) =>
      prev.duration < current.duration ? prev : current
    );

    const successCount = this.apiPerformanceData.filter((d) => d.success).length;
    const successRate = successCount / this.apiPerformanceData.length;

    return {
      averageDuration,
      slowestRequest,
      fastestRequest,
      successRate,
    };
  }

  /**
   * Send performance data to backend
   */
  private async sendToBackend(type: string, data: any): Promise<void> {
    try {
      const endpoint =
        import.meta.env.VITE_PERFORMANCE_ENDPOINT || '/api/monitoring/performance';

      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          data,
          timestamp: Date.now(),
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
        // Don't wait for response
        keepalive: true,
      });
    } catch (error) {
      // Silently fail - we don't want performance tracking to break the app
      if (import.meta.env.MODE === 'development') {
        console.error('Performance: Failed to send to backend', error);
      }
    }
  }

  /**
   * Get all tracked errors
   */
  getErrors(): ErrorData[] {
    return [...this.errors];
  }

  /**
   * Clear all tracked data
   */
  clear(): void {
    this.apiPerformanceData = [];
    this.errors = [];
  }

  /**
   * Reset tracking
   */
  reset(): void {
    this.clear();
    this.isInitialized = false;
  }
}

// Create singleton instance
const performanceTracker = new PerformanceTracker();

export default performanceTracker;

// Export for testing
export { PerformanceTracker, PerformanceMark };
