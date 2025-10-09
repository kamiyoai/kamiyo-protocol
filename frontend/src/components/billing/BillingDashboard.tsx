/**
 * Billing Dashboard Component
 * Main dashboard showing subscription overview, usage, and quick actions
 */

import React from 'react';
import {
  useSubscription,
  useUsageStats,
  useUpcomingInvoice,
  usePaymentMethods,
  useCustomerPortal,
} from '../../hooks/useBilling';
import '../../styles/billing.css';

interface BillingDashboardProps {
  onNavigate?: (tab: string) => void;
}

const BillingDashboard: React.FC<BillingDashboardProps> = ({ onNavigate }) => {
  const { subscription, loading: subLoading, error: subError } = useSubscription();
  const { usage, loading: usageLoading } = useUsageStats();
  const { upcomingInvoice, loading: invoiceLoading } = useUpcomingInvoice();
  const { paymentMethods, loading: pmLoading } = usePaymentMethods();
  const { openPortal, loading: portalLoading } = useCustomerPortal();

  // Format currency
  const formatCurrency = (cents: number, currency: string = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  };

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Get tier badge color
  const getTierBadgeClass = (tier: string) => {
    switch (tier.toLowerCase()) {
      case 'free':
        return 'tier-badge-free';
      case 'basic':
        return 'tier-badge-basic';
      case 'pro':
        return 'tier-badge-pro';
      case 'enterprise':
        return 'tier-badge-enterprise';
      default:
        return 'tier-badge-free';
    }
  };

  // Loading state
  if (subLoading) {
    return (
      <div className="billing-dashboard">
        <div className="loading-skeleton">
          <div className="skeleton-card"></div>
          <div className="skeleton-card"></div>
          <div className="skeleton-card"></div>
        </div>
      </div>
    );
  }

  // Error state
  if (subError) {
    return (
      <div className="billing-dashboard">
        <div className="error-state">
          <h3>Failed to load billing information</h3>
          <p>{subError.message}</p>
        </div>
      </div>
    );
  }

  const defaultPaymentMethod = paymentMethods?.find((pm) => pm.is_default);

  return (
    <div className="billing-dashboard">
      <div className="dashboard-header">
        <h1>Billing Overview</h1>
        <button
          className="btn btn-secondary"
          onClick={() => openPortal()}
          disabled={portalLoading}
          aria-label="Manage billing in Stripe Customer Portal"
        >
          {portalLoading ? 'Loading...' : 'Manage Billing'}
        </button>
      </div>

      <div className="dashboard-grid">
        {/* Current Plan Card */}
        <div className="dashboard-card">
          <div className="card-header">
            <h2>Current Plan</h2>
            <span className={`tier-badge ${getTierBadgeClass(subscription?.tier || 'free')}`}>
              {subscription?.tier?.toUpperCase() || 'FREE'}
            </span>
          </div>
          <div className="card-body">
            {subscription && (
              <>
                <div className="plan-info">
                  <div className="info-row">
                    <span className="label">Status:</span>
                    <span className={`status status-${subscription.status}`}>
                      {subscription.status}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="label">Billing Period:</span>
                    <span>
                      {formatDate(new Date(subscription.current_period_start).getTime() / 1000)} -{' '}
                      {formatDate(new Date(subscription.current_period_end).getTime() / 1000)}
                    </span>
                  </div>
                  {subscription.cancel_at_period_end && (
                    <div className="info-row">
                      <span className="label warning-text">Cancels on:</span>
                      <span className="warning-text">
                        {formatDate(new Date(subscription.current_period_end).getTime() / 1000)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="card-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => onNavigate?.('plans')}
                    aria-label="View all subscription plans"
                  >
                    Change Plan
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Usage Card */}
        <div className="dashboard-card">
          <div className="card-header">
            <h2>API Usage</h2>
            <button
              className="btn-link"
              onClick={() => onNavigate?.('usage')}
              aria-label="View detailed usage statistics"
            >
              View Details
            </button>
          </div>
          <div className="card-body">
            {usageLoading ? (
              <div className="loading-text">Loading usage data...</div>
            ) : usage ? (
              <>
                <div className="usage-summary">
                  <div className="usage-item">
                    <div className="usage-label">Today</div>
                    <div className="usage-value">
                      {usage.usage_current_day.toLocaleString()} /{' '}
                      {usage.limit_day.toLocaleString()}
                    </div>
                    <div className="usage-bar">
                      <div
                        className="usage-bar-fill"
                        style={{
                          width: `${Math.min((usage.usage_current_day / usage.limit_day) * 100, 100)}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                  <div className="usage-item">
                    <div className="usage-label">This Hour</div>
                    <div className="usage-value">
                      {usage.usage_current_hour.toLocaleString()} /{' '}
                      {usage.limit_hour.toLocaleString()}
                    </div>
                    <div className="usage-bar">
                      <div
                        className="usage-bar-fill"
                        style={{
                          width: `${Math.min((usage.usage_current_hour / usage.limit_hour) * 100, 100)}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
                {usage.remaining_day < usage.limit_day * 0.2 && (
                  <div className="warning-banner">
                    <span>You're approaching your daily limit.</span>
                    <button
                      className="btn-link"
                      onClick={() => onNavigate?.('plans')}
                      aria-label="Upgrade to increase limits"
                    >
                      Upgrade
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">No usage data available</div>
            )}
          </div>
        </div>

        {/* Upcoming Invoice Card */}
        <div className="dashboard-card">
          <div className="card-header">
            <h2>Upcoming Invoice</h2>
            <button
              className="btn-link"
              onClick={() => onNavigate?.('invoices')}
              aria-label="View invoice history"
            >
              View History
            </button>
          </div>
          <div className="card-body">
            {invoiceLoading ? (
              <div className="loading-text">Loading invoice...</div>
            ) : upcomingInvoice ? (
              <>
                <div className="invoice-amount">
                  {formatCurrency(upcomingInvoice.amount_due, upcomingInvoice.currency)}
                </div>
                <div className="invoice-date">
                  Due on {formatDate(upcomingInvoice.period_end)}
                </div>
                {upcomingInvoice.lines && upcomingInvoice.lines.length > 0 && (
                  <div className="invoice-items">
                    {upcomingInvoice.lines.map((line, index) => (
                      <div key={index} className="invoice-item">
                        <span>{line.description}</span>
                        <span>{formatCurrency(line.amount, line.currency)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">No upcoming invoice</div>
            )}
          </div>
        </div>

        {/* Payment Method Card */}
        <div className="dashboard-card">
          <div className="card-header">
            <h2>Payment Method</h2>
            <button
              className="btn-link"
              onClick={() => openPortal()}
              disabled={portalLoading}
              aria-label="Update payment method"
            >
              Update
            </button>
          </div>
          <div className="card-body">
            {pmLoading ? (
              <div className="loading-text">Loading payment methods...</div>
            ) : defaultPaymentMethod && defaultPaymentMethod.card ? (
              <div className="payment-method">
                <div className="card-icon">
                  <span className="card-brand">{defaultPaymentMethod.card.brand}</span>
                </div>
                <div className="card-details">
                  <div>•••• {defaultPaymentMethod.card.last4}</div>
                  <div className="card-expiry">
                    Expires {defaultPaymentMethod.card.exp_month}/{defaultPaymentMethod.card.exp_year}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p>No payment method on file</p>
                <button
                  className="btn btn-secondary"
                  onClick={() => openPortal()}
                  disabled={portalLoading}
                  aria-label="Add payment method"
                >
                  Add Payment Method
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingDashboard;
