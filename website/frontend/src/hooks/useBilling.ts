/**
 * Custom React Hooks for Billing Operations
 * Provides state management and data fetching for billing dashboard
 */

import { useState, useEffect, useCallback } from 'react';
import billingAPI, {
  Subscription,
  SubscriptionTier,
  UsageStats,
  Invoice,
  InvoiceListResponse,
  PaymentMethodListResponse,
  UpcomingInvoiceResponse,
} from '../api/billing';

/**
 * Hook for managing subscription data
 */
export function useSubscription() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSubscription = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await billingAPI.fetchSubscription();
      setSubscription(data);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch subscription:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  return {
    subscription,
    loading,
    error,
    refetch: fetchSubscription,
  };
}

/**
 * Hook for managing subscription tiers
 */
export function useSubscriptionTiers() {
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTiers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await billingAPI.fetchTiers();
      setTiers(data);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch tiers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTiers();
  }, [fetchTiers]);

  return {
    tiers,
    loading,
    error,
    refetch: fetchTiers,
  };
}

/**
 * Hook for managing usage statistics
 */
export function useUsageStats() {
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await billingAPI.fetchUsage();
      setUsage(data);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch usage:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchUsage();
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchUsage]);

  return {
    usage,
    loading,
    error,
    refetch: fetchUsage,
  };
}

/**
 * Hook for managing invoices
 */
export function useInvoices(limit: number = 10) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchInvoices = useCallback(async (startingAfter?: string) => {
    try {
      setLoading(true);
      setError(null);
      const data: InvoiceListResponse = await billingAPI.fetchInvoices(limit, startingAfter);

      if (startingAfter) {
        // Append to existing invoices (pagination)
        setInvoices((prev) => [...prev, ...data.invoices]);
      } else {
        // Replace invoices (initial load)
        setInvoices(data.invoices);
      }

      setHasMore(data.has_more);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch invoices:', err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading && invoices.length > 0) {
      const lastInvoice = invoices[invoices.length - 1];
      fetchInvoices(lastInvoice.id);
    }
  }, [hasMore, loading, invoices, fetchInvoices]);

  return {
    invoices,
    hasMore,
    loading,
    error,
    refetch: () => fetchInvoices(),
    loadMore,
  };
}

/**
 * Hook for managing payment methods
 */
export function usePaymentMethods() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodListResponse['payment_methods']>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPaymentMethods = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await billingAPI.fetchPaymentMethods();
      setPaymentMethods(data.payment_methods);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch payment methods:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPaymentMethods();
  }, [fetchPaymentMethods]);

  return {
    paymentMethods,
    loading,
    error,
    refetch: fetchPaymentMethods,
  };
}

/**
 * Hook for managing upcoming invoice
 */
export function useUpcomingInvoice() {
  const [upcomingInvoice, setUpcomingInvoice] = useState<UpcomingInvoiceResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUpcomingInvoice = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await billingAPI.fetchUpcomingInvoice();
      setUpcomingInvoice(data);
    } catch (err) {
      // 404 is expected for free tier users
      if ((err as any).response?.status === 404) {
        setUpcomingInvoice(null);
      } else {
        setError(err as Error);
        console.error('Failed to fetch upcoming invoice:', err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUpcomingInvoice();
  }, [fetchUpcomingInvoice]);

  return {
    upcomingInvoice,
    loading,
    error,
    refetch: fetchUpcomingInvoice,
  };
}

/**
 * Hook for upgrading subscription
 */
export function useUpgrade() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  const upgrade = useCallback(async (tier: string) => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);
      await billingAPI.upgradeSubscription(tier);
      setSuccess(true);
      return true;
    } catch (err) {
      setError(err as Error);
      console.error('Failed to upgrade subscription:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setSuccess(false);
  }, []);

  return {
    upgrade,
    loading,
    error,
    success,
    reset,
  };
}

/**
 * Hook for downgrading subscription
 */
export function useDowngrade() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  const downgrade = useCallback(async (tier: string) => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);
      await billingAPI.downgradeSubscription(tier);
      setSuccess(true);
      return true;
    } catch (err) {
      setError(err as Error);
      console.error('Failed to downgrade subscription:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setSuccess(false);
  }, []);

  return {
    downgrade,
    loading,
    error,
    success,
    reset,
  };
}

/**
 * Hook for canceling subscription
 */
export function useCancel() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  const cancel = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);
      await billingAPI.cancelSubscription();
      setSuccess(true);
      return true;
    } catch (err) {
      setError(err as Error);
      console.error('Failed to cancel subscription:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setSuccess(false);
  }, []);

  return {
    cancel,
    loading,
    error,
    success,
    reset,
  };
}

/**
 * Hook for opening Stripe Customer Portal
 */
export function useCustomerPortal() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const openPortal = useCallback(async (returnUrl?: string) => {
    try {
      setLoading(true);
      setError(null);

      const url = returnUrl || window.location.href;
      const session = await billingAPI.createPortalSession(url);

      // Redirect to portal
      window.location.href = session.url;
    } catch (err) {
      setError(err as Error);
      console.error('Failed to open customer portal:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    openPortal,
    loading,
    error,
  };
}
