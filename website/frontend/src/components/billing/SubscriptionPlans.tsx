/**
 * Subscription Plans Component
 * Pricing table with all tiers and feature comparison
 */

import React, { useState } from 'react';
import {
  useSubscription,
  useSubscriptionTiers,
  useUpgrade,
  useDowngrade,
} from '../../hooks/useBilling';
import '../../styles/billing.css';

interface SubscriptionPlansProps {
  onSuccess?: () => void;
}

const SubscriptionPlans: React.FC<SubscriptionPlansProps> = ({ onSuccess }) => {
  const { subscription } = useSubscription();
  const { tiers, loading, error } = useSubscriptionTiers();
  const { upgrade, loading: upgrading, error: upgradeError, success: upgradeSuccess } = useUpgrade();
  const { downgrade, loading: downgrading, error: downgradeError, success: downgradeSuccess } = useDowngrade();

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'upgrade' | 'downgrade'>('upgrade');

  // Format currency
  const formatPrice = (price: string) => {
    return parseFloat(price).toFixed(2);
  };

  // Get tier order for comparison
  const getTierOrder = (tierName: string): number => {
    const order: Record<string, number> = {
      free: 0,
      basic: 1,
      pro: 2,
      enterprise: 3,
    };
    return order[tierName.toLowerCase()] || 0;
  };

  // Check if tier is current
  const isCurrentTier = (tierName: string): boolean => {
    return subscription?.tier.toLowerCase() === tierName.toLowerCase();
  };

  // Check if tier is upgrade
  const isUpgrade = (tierName: string): boolean => {
    if (!subscription) return false;
    return getTierOrder(tierName) > getTierOrder(subscription.tier);
  };

  // Check if tier is downgrade
  const isDowngrade = (tierName: string): boolean => {
    if (!subscription) return false;
    return getTierOrder(tierName) < getTierOrder(subscription.tier);
  };

  // Handle tier change click
  const handleTierChange = (tierName: string) => {
    setSelectedTier(tierName);
    if (isUpgrade(tierName)) {
      setActionType('upgrade');
    } else if (isDowngrade(tierName)) {
      setActionType('downgrade');
    }
    setShowConfirmModal(true);
  };

  // Confirm tier change
  const confirmTierChange = async () => {
    if (!selectedTier) return;

    try {
      if (actionType === 'upgrade') {
        await upgrade(selectedTier);
      } else {
        await downgrade(selectedTier);
      }

      setShowConfirmModal(false);
      onSuccess?.();
    } catch (err) {
      console.error('Failed to change tier:', err);
    }
  };

  // Get button text
  const getButtonText = (tierName: string): string => {
    if (isCurrentTier(tierName)) return 'Current Plan';
    if (isUpgrade(tierName)) return 'Upgrade';
    if (isDowngrade(tierName)) return 'Downgrade';
    return 'Select';
  };

  // Get button class
  const getButtonClass = (tierName: string): string => {
    if (isCurrentTier(tierName)) return 'btn btn-current';
    if (isUpgrade(tierName)) return 'btn btn-primary';
    if (isDowngrade(tierName)) return 'btn btn-secondary';
    return 'btn btn-primary';
  };

  if (loading) {
    return (
      <div className="subscription-plans">
        <div className="loading-skeleton">
          <div className="skeleton-pricing-card"></div>
          <div className="skeleton-pricing-card"></div>
          <div className="skeleton-pricing-card"></div>
          <div className="skeleton-pricing-card"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="subscription-plans">
        <div className="error-state">
          <h3>Failed to load subscription plans</h3>
          <p>{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="subscription-plans">
      <div className="plans-header">
        <h1>Choose Your Plan</h1>
        <p>Select the plan that best fits your needs</p>
      </div>

      <div className="pricing-grid">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`pricing-card ${isCurrentTier(tier.name) ? 'current-plan' : ''} tier-${tier.name.toLowerCase()}`}
          >
            {isCurrentTier(tier.name) && (
              <div className="current-badge">Current Plan</div>
            )}

            <div className="pricing-header">
              <h2>{tier.display_name}</h2>
              <div className="price">
                <span className="currency">$</span>
                <span className="amount">{formatPrice(tier.price_monthly_usd)}</span>
                <span className="period">/month</span>
              </div>
            </div>

            <div className="pricing-features">
              <h3>Features</h3>
              <ul>
                <li>
                  <span className="feature-icon">✓</span>
                  {tier.api_requests_per_day.toLocaleString()} API requests/day
                </li>
                <li>
                  <span className="feature-icon">✓</span>
                  {tier.historical_data_days} days of historical data
                </li>
                {tier.email_alerts && (
                  <li>
                    <span className="feature-icon">✓</span>
                    Email alerts
                  </li>
                )}
                {tier.discord_alerts && (
                  <li>
                    <span className="feature-icon">✓</span>
                    Discord alerts
                  </li>
                )}
                {tier.telegram_alerts && (
                  <li>
                    <span className="feature-icon">✓</span>
                    Telegram alerts
                  </li>
                )}
                {tier.webhook_alerts && (
                  <li>
                    <span className="feature-icon">✓</span>
                    Webhook alerts
                  </li>
                )}
                {tier.real_time_alerts && (
                  <li>
                    <span className="feature-icon">✓</span>
                    Real-time alerts
                  </li>
                )}
                <li>
                  <span className="feature-icon">✓</span>
                  {tier.support_level} support
                </li>
                {tier.custom_integrations && (
                  <li>
                    <span className="feature-icon">✓</span>
                    Custom integrations
                  </li>
                )}
                {tier.dedicated_account_manager && (
                  <li>
                    <span className="feature-icon">✓</span>
                    Dedicated account manager
                  </li>
                )}
                {tier.sla_guarantee && (
                  <li>
                    <span className="feature-icon">✓</span>
                    SLA guarantee
                  </li>
                )}
                {tier.white_label && (
                  <li>
                    <span className="feature-icon">✓</span>
                    White label option
                  </li>
                )}
              </ul>
            </div>

            <div className="pricing-action">
              <button
                className={getButtonClass(tier.name)}
                onClick={() => handleTierChange(tier.name)}
                disabled={isCurrentTier(tier.name) || upgrading || downgrading}
                aria-label={`${getButtonText(tier.name)} - ${tier.display_name}`}
              >
                {getButtonText(tier.name)}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Feature Comparison Table */}
      <div className="feature-comparison">
        <h2>Feature Comparison</h2>
        <div className="comparison-table-wrapper">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Feature</th>
                {tiers.map((tier) => (
                  <th key={tier.name}>{tier.display_name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>API Requests/Day</td>
                {tiers.map((tier) => (
                  <td key={tier.name}>{tier.api_requests_per_day.toLocaleString()}</td>
                ))}
              </tr>
              <tr>
                <td>API Requests/Hour</td>
                {tiers.map((tier) => (
                  <td key={tier.name}>{tier.api_requests_per_hour.toLocaleString()}</td>
                ))}
              </tr>
              <tr>
                <td>Historical Data</td>
                {tiers.map((tier) => (
                  <td key={tier.name}>{tier.historical_data_days} days</td>
                ))}
              </tr>
              <tr>
                <td>Email Alerts</td>
                {tiers.map((tier) => (
                  <td key={tier.name}>{tier.email_alerts ? '✓' : '—'}</td>
                ))}
              </tr>
              <tr>
                <td>Discord Alerts</td>
                {tiers.map((tier) => (
                  <td key={tier.name}>{tier.discord_alerts ? '✓' : '—'}</td>
                ))}
              </tr>
              <tr>
                <td>Telegram Alerts</td>
                {tiers.map((tier) => (
                  <td key={tier.name}>{tier.telegram_alerts ? '✓' : '—'}</td>
                ))}
              </tr>
              <tr>
                <td>Webhook Alerts</td>
                {tiers.map((tier) => (
                  <td key={tier.name}>{tier.webhook_alerts ? '✓' : '—'}</td>
                ))}
              </tr>
              <tr>
                <td>Real-time Alerts</td>
                {tiers.map((tier) => (
                  <td key={tier.name}>{tier.real_time_alerts ? '✓' : '—'}</td>
                ))}
              </tr>
              <tr>
                <td>Support Level</td>
                {tiers.map((tier) => (
                  <td key={tier.name}>{tier.support_level}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && selectedTier && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm {actionType === 'upgrade' ? 'Upgrade' : 'Downgrade'}</h2>
              <button
                className="modal-close"
                onClick={() => setShowConfirmModal(false)}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to {actionType} to{' '}
                <strong>{selectedTier.toUpperCase()}</strong>?
              </p>
              {actionType === 'upgrade' && (
                <p className="modal-info">
                  You will be charged immediately for the upgraded plan.
                </p>
              )}
              {actionType === 'downgrade' && (
                <p className="modal-info">
                  Your plan will be downgraded at the end of your current billing period.
                </p>
              )}
              {(upgradeError || downgradeError) && (
                <div className="error-message">
                  {(upgradeError || downgradeError)?.message}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowConfirmModal(false)}
                disabled={upgrading || downgrading}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={confirmTierChange}
                disabled={upgrading || downgrading}
              >
                {upgrading || downgrading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {(upgradeSuccess || downgradeSuccess) && (
        <div className="toast toast-success">
          {actionType === 'upgrade'
            ? 'Successfully upgraded your plan!'
            : 'Your plan will be downgraded at the end of the billing period.'}
        </div>
      )}
    </div>
  );
};

export default SubscriptionPlans;
