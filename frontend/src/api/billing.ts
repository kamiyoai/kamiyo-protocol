/**
 * Billing API Client for Kamiyo
 * Handles all billing-related API calls
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const API_VERSION = '/api/v1';

// Types
export interface PortalSessionRequest {
  return_url: string;
}

export interface PortalSessionResponse {
  url: string;
  expires_at: number;
}

export interface Invoice {
  id: string;
  number: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string;
  created: number;
  due_date: number | null;
  period_start: number;
  period_end: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

export interface InvoiceListResponse {
  invoices: Invoice[];
  has_more: boolean;
  total_count: number;
}

export interface PaymentMethodCard {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
}

export interface PaymentMethod {
  id: string;
  type: string;
  card: PaymentMethodCard | null;
  is_default: boolean;
}

export interface PaymentMethodListResponse {
  payment_methods: PaymentMethod[];
}

export interface UpcomingInvoiceLine {
  description: string;
  amount: number;
  currency: string;
  period: {
    start: number;
    end: number;
  };
}

export interface UpcomingInvoiceResponse {
  amount_due: number;
  currency: string;
  period_start: number;
  period_end: number;
  next_payment_attempt: number | null;
  lines: UpcomingInvoiceLine[];
}

export interface Subscription {
  id: number;
  user_id: string;
  tier: string;
  status: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionTier {
  name: string;
  display_name: string;
  price_monthly_usd: string;
  api_requests_per_day: number;
  api_requests_per_hour: number;
  api_requests_per_minute: number;
  email_alerts: boolean;
  discord_alerts: boolean;
  telegram_alerts: boolean;
  webhook_alerts: boolean;
  historical_data_days: number;
  real_time_alerts: boolean;
  support_level: string;
  custom_integrations: boolean;
  dedicated_account_manager: boolean;
  sla_guarantee: boolean;
  white_label: boolean;
  csv_export: boolean;
  json_export: boolean;
  api_access: boolean;
}

export interface UsageStats {
  user_id: string;
  tier: string;
  usage_current_minute: number;
  usage_current_hour: number;
  usage_current_day: number;
  limit_minute: number;
  limit_hour: number;
  limit_day: number;
  remaining_minute: number;
  remaining_hour: number;
  remaining_day: number;
  last_activity: string | null;
  endpoint_breakdown: Record<string, number>;
}

/**
 * Billing API Client Class
 */
class BillingAPIClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${API_BASE_URL}${API_VERSION}`,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token interceptor
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Redirect to login
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Create Stripe Customer Portal session
   */
  async createPortalSession(returnUrl: string): Promise<PortalSessionResponse> {
    const response = await this.client.post<PortalSessionResponse>(
      '/billing/portal',
      { return_url: returnUrl }
    );
    return response.data;
  }

  /**
   * Fetch user's invoices
   */
  async fetchInvoices(limit: number = 10, startingAfter?: string): Promise<InvoiceListResponse> {
    const params: Record<string, any> = { limit };
    if (startingAfter) {
      params.starting_after = startingAfter;
    }

    const response = await this.client.get<InvoiceListResponse>(
      '/billing/invoices',
      { params }
    );
    return response.data;
  }

  /**
   * Fetch a specific invoice
   */
  async fetchInvoice(invoiceId: string): Promise<Invoice> {
    const response = await this.client.get<Invoice>(
      `/billing/invoices/${invoiceId}`
    );
    return response.data;
  }

  /**
   * Fetch payment methods
   */
  async fetchPaymentMethods(): Promise<PaymentMethodListResponse> {
    const response = await this.client.get<PaymentMethodListResponse>(
      '/billing/payment-methods'
    );
    return response.data;
  }

  /**
   * Fetch upcoming invoice
   */
  async fetchUpcomingInvoice(): Promise<UpcomingInvoiceResponse> {
    const response = await this.client.get<UpcomingInvoiceResponse>(
      '/billing/upcoming-invoice'
    );
    return response.data;
  }

  /**
   * Fetch current subscription
   */
  async fetchSubscription(): Promise<Subscription> {
    const response = await this.client.get<Subscription>(
      '/subscriptions/current'
    );
    return response.data;
  }

  /**
   * Fetch all subscription tiers
   */
  async fetchTiers(): Promise<SubscriptionTier[]> {
    const response = await this.client.get<SubscriptionTier[]>(
      '/subscriptions/tiers'
    );
    return response.data;
  }

  /**
   * Fetch usage statistics
   */
  async fetchUsage(): Promise<UsageStats> {
    const response = await this.client.get<UsageStats>(
      '/subscriptions/usage'
    );
    return response.data;
  }

  /**
   * Upgrade subscription
   */
  async upgradeSubscription(tier: string): Promise<Subscription> {
    const response = await this.client.post<Subscription>(
      '/subscriptions/upgrade',
      { tier }
    );
    return response.data;
  }

  /**
   * Downgrade subscription
   */
  async downgradeSubscription(tier: string): Promise<Subscription> {
    const response = await this.client.post<Subscription>(
      '/subscriptions/downgrade',
      { tier }
    );
    return response.data;
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(): Promise<{ success: boolean; message: string }> {
    const response = await this.client.post<{ success: boolean; message: string }>(
      '/subscriptions/cancel'
    );
    return response.data;
  }
}

// Export singleton instance
const billingAPI = new BillingAPIClient();
export default billingAPI;

// Export convenience functions
export const createPortalSession = (returnUrl: string) =>
  billingAPI.createPortalSession(returnUrl);

export const fetchInvoices = (limit?: number, startingAfter?: string) =>
  billingAPI.fetchInvoices(limit, startingAfter);

export const fetchInvoice = (invoiceId: string) =>
  billingAPI.fetchInvoice(invoiceId);

export const fetchPaymentMethods = () =>
  billingAPI.fetchPaymentMethods();

export const fetchUpcomingInvoice = () =>
  billingAPI.fetchUpcomingInvoice();

export const fetchSubscription = () =>
  billingAPI.fetchSubscription();

export const fetchTiers = () =>
  billingAPI.fetchTiers();

export const fetchUsage = () =>
  billingAPI.fetchUsage();

export const upgradeSubscription = (tier: string) =>
  billingAPI.upgradeSubscription(tier);

export const downgradeSubscription = (tier: string) =>
  billingAPI.downgradeSubscription(tier);

export const cancelSubscription = () =>
  billingAPI.cancelSubscription();
