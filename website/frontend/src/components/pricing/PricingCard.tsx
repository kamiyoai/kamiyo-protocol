/**
 * PricingCard Component
 * Individual pricing tier card with features and CTA
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Check, Star } from 'lucide-react';
import { PricingTier } from '@/types';

interface PricingCardProps {
  tier: PricingTier;
  isAnnual: boolean;
  currentTier?: string;
  onSelect: (tier: string) => void;
}

export const PricingCard: React.FC<PricingCardProps> = ({
  tier,
  isAnnual,
  currentTier,
  onSelect,
}) => {
  const price = isAnnual ? tier.priceAnnual : tier.price;
  const savings = isAnnual && tier.price > 0 ? tier.price * 12 - tier.priceAnnual : 0;
  const isCurrentTier = currentTier === tier.tier;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`pricing-card ${tier.highlighted ? 'highlighted' : ''} ${
        isCurrentTier ? 'current-tier' : ''
      }`}
      whileHover={{ y: -8, boxShadow: '0 12px 24px rgba(0, 0, 0, 0.15)' }}
    >
      {tier.highlighted && (
        <div className="popular-badge">
          <Star size={16} />
          <span>Most Popular</span>
        </div>
      )}

      {isCurrentTier && (
        <div className="current-badge">
          <Check size={16} />
          <span>Current Plan</span>
        </div>
      )}

      <div className="pricing-card-header">
        <h3 className="tier-name">{tier.name}</h3>
        <p className="tier-description">{tier.description}</p>
      </div>

      <div className="pricing-card-price">
        {tier.price === 0 ? (
          <div className="price-free">
            <span className="price-amount">Free</span>
            <span className="price-period">Forever</span>
          </div>
        ) : (
          <>
            <div className="price-main">
              <span className="price-currency">$</span>
              <span className="price-amount">{price}</span>
              <span className="price-period">
                /{isAnnual ? 'year' : 'month'}
              </span>
            </div>
            {isAnnual && savings > 0 && (
              <div className="price-savings">Save ${savings}/year</div>
            )}
          </>
        )}
      </div>

      <div className="pricing-card-features">
        <h4 className="features-title">Features</h4>
        <ul className="features-list">
          {tier.features.map((feature, index) => (
            <li key={index} className="feature-item">
              <Check className="feature-icon" size={20} />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="pricing-card-limits">
        <div className="limit-item">
          <span className="limit-label">API Calls</span>
          <span className="limit-value">{tier.limits.api_calls}</span>
        </div>
        <div className="limit-item">
          <span className="limit-label">Rate Limit</span>
          <span className="limit-value">{tier.limits.rate_limit}</span>
        </div>
        <div className="limit-item">
          <span className="limit-label">Webhooks</span>
          <span className="limit-value">{tier.limits.webhooks}</span>
        </div>
        <div className="limit-item">
          <span className="limit-label">Historical Data</span>
          <span className="limit-value">{tier.limits.historical_data}</span>
        </div>
        <div className="limit-item">
          <span className="limit-label">Support</span>
          <span className="limit-value">{tier.limits.support}</span>
        </div>
      </div>

      <button
        className={`pricing-card-cta ${tier.highlighted ? 'cta-highlighted' : ''} ${
          isCurrentTier ? 'cta-disabled' : ''
        }`}
        onClick={() => !isCurrentTier && onSelect(tier.tier)}
        disabled={isCurrentTier}
      >
        {isCurrentTier ? 'Current Plan' : tier.cta}
      </button>
    </motion.div>
  );
};

export default PricingCard;
