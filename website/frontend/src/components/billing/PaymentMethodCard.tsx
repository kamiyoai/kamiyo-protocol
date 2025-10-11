/**
 * Payment Method Card Component
 * Displays payment methods with update/remove options
 */

import React from 'react';
import { usePaymentMethods, useCustomerPortal } from '../../hooks/useBilling';
import '../../styles/billing.css';

const PaymentMethodCard: React.FC = () => {
  const { paymentMethods, loading, error } = usePaymentMethods();
  const { openPortal, loading: portalLoading } = useCustomerPortal();

  // Get card brand icon/label
  const getCardBrandDisplay = (brand: string) => {
    const brandMap: Record<string, string> = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express',
      discover: 'Discover',
      diners: 'Diners Club',
      jcb: 'JCB',
      unionpay: 'UnionPay',
    };
    return brandMap[brand.toLowerCase()] || brand;
  };

  // Get card brand color
  const getCardBrandColor = (brand: string) => {
    const colorMap: Record<string, string> = {
      visa: '#1a1f71',
      mastercard: '#eb001b',
      amex: '#006fcf',
      discover: '#ff6000',
      diners: '#0079be',
      jcb: '#0e4c96',
      unionpay: '#e21836',
    };
    return colorMap[brand.toLowerCase()] || '#6b7280';
  };

  if (loading) {
    return (
      <div className="payment-method-card">
        <div className="loading-skeleton">
          <div className="skeleton-payment-method"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="payment-method-card">
        <div className="error-state">
          <h3>Failed to load payment methods</h3>
          <p>{error.message}</p>
        </div>
      </div>
    );
  }

  const defaultPaymentMethod = paymentMethods.find((pm) => pm.is_default);

  return (
    <div className="payment-method-card">
      <div className="card-header">
        <h2>Payment Methods</h2>
        <button
          className="btn btn-secondary"
          onClick={() => openPortal()}
          disabled={portalLoading}
          aria-label="Manage payment methods"
        >
          {portalLoading ? 'Loading...' : 'Manage'}
        </button>
      </div>

      <div className="payment-methods-list">
        {paymentMethods.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <h3>No Payment Methods</h3>
            <p>Add a payment method to subscribe to a paid plan</p>
            <button
              className="btn btn-primary"
              onClick={() => openPortal()}
              disabled={portalLoading}
              aria-label="Add payment method"
            >
              Add Payment Method
            </button>
          </div>
        ) : (
          <>
            {paymentMethods.map((pm) => (
              <div
                key={pm.id}
                className={`payment-method-item ${pm.is_default ? 'default' : ''}`}
              >
                {pm.card && (
                  <>
                    <div
                      className="card-brand-icon"
                      style={{ backgroundColor: getCardBrandColor(pm.card.brand) }}
                    >
                      <span>{getCardBrandDisplay(pm.card.brand)}</span>
                    </div>
                    <div className="card-details">
                      <div className="card-number">
                        <span className="card-dots">••••</span>
                        <span className="card-last4">{pm.card.last4}</span>
                      </div>
                      <div className="card-expiry">
                        Expires {pm.card.exp_month.toString().padStart(2, '0')}/
                        {pm.card.exp_year}
                      </div>
                    </div>
                    {pm.is_default && (
                      <div className="default-badge">
                        <span>Default</span>
                      </div>
                    )}
                    <div className="card-actions">
                      <button
                        className="btn-link"
                        onClick={() => openPortal()}
                        disabled={portalLoading}
                        aria-label="Edit payment method"
                      >
                        Edit
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}

            <div className="add-payment-method">
              <button
                className="btn btn-secondary btn-block"
                onClick={() => openPortal()}
                disabled={portalLoading}
                aria-label="Add another payment method"
              >
                + Add Payment Method
              </button>
            </div>
          </>
        )}
      </div>

      {defaultPaymentMethod && defaultPaymentMethod.card && (
        <div className="payment-info">
          <h3>Payment Information</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Card Type</span>
              <span className="info-value">
                {getCardBrandDisplay(defaultPaymentMethod.card.brand)}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Last 4 Digits</span>
              <span className="info-value">{defaultPaymentMethod.card.last4}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Expiration</span>
              <span className="info-value">
                {defaultPaymentMethod.card.exp_month.toString().padStart(2, '0')}/
                {defaultPaymentMethod.card.exp_year}
              </span>
            </div>
          </div>

          {/* Check if card is expiring soon */}
          {(() => {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1;
            const expYear = defaultPaymentMethod.card.exp_year;
            const expMonth = defaultPaymentMethod.card.exp_month;

            const isExpiring =
              (expYear === currentYear && expMonth - currentMonth <= 2 && expMonth >= currentMonth) ||
              (expYear === currentYear && expMonth < currentMonth);

            if (isExpiring) {
              return (
                <div className="warning-banner">
                  <span className="warning-icon">⚠️</span>
                  <span>
                    Your card is expiring soon. Please update your payment method to avoid service
                    interruption.
                  </span>
                  <button
                    className="btn-link"
                    onClick={() => openPortal()}
                    disabled={portalLoading}
                    aria-label="Update payment method"
                  >
                    Update Now
                  </button>
                </div>
              );
            }
            return null;
          })()}
        </div>
      )}

      <div className="payment-security-notice">
        <div className="security-icon">🔒</div>
        <p>
          All payment information is securely stored and processed by Stripe. Kamiyo never stores
          your complete card details.
        </p>
      </div>
    </div>
  );
};

export default PaymentMethodCard;
