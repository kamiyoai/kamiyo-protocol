/**
 * PricingPage Component
 * Main pricing page with tier comparison, FAQ, and testimonials
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Shield, Zap, Clock, TrendingUp, CheckCircle2, Users } from 'lucide-react';
import PricingCard from '@/components/pricing/PricingCard';
import PricingFAQ from '@/components/pricing/PricingFAQ';
import { PricingTier } from '@/types';
import { useAuthStore } from '@/store/appStore';

const pricingTiers: PricingTier[] = [
  {
    name: 'Free',
    tier: 'FREE',
    price: 0,
    priceAnnual: 0,
    description: 'Perfect for trying out Kamiyo',
    features: [
      'Access to latest exploits',
      '7 days historical data',
      'Basic API access',
      'Email notifications',
      'Community support',
    ],
    limits: {
      api_calls: '100/day',
      rate_limit: '10 req/min',
      webhooks: 0,
      historical_data: '7 days',
      support: 'Email (48h)',
    },
    cta: 'Get Started Free',
  },
  {
    name: 'Starter',
    tier: 'STARTER',
    price: 29,
    priceAnnual: 312, // 10% discount
    description: 'For individual developers and small projects',
    features: [
      'Everything in Free',
      '30 days historical data',
      'Priority API access',
      'Discord notifications',
      '1 webhook endpoint',
      'Priority email support',
      'Custom filters',
    ],
    limits: {
      api_calls: '10,000/month',
      rate_limit: '60 req/min',
      webhooks: 1,
      historical_data: '30 days',
      support: 'Email (24h)',
    },
    cta: 'Start Free Trial',
  },
  {
    name: 'Pro',
    tier: 'PRO',
    price: 99,
    priceAnnual: 1068, // 10% discount
    description: 'For growing teams and businesses',
    highlighted: true,
    features: [
      'Everything in Starter',
      '1 year historical data',
      'Unlimited API access',
      'Telegram notifications',
      '5 webhook endpoints',
      'Real-time WebSocket',
      'Advanced filters',
      'Usage analytics',
      'Discord support (12h)',
    ],
    limits: {
      api_calls: 'Unlimited',
      rate_limit: '300 req/min',
      webhooks: 5,
      historical_data: '1 year',
      support: 'Email + Discord (12h)',
    },
    cta: 'Start Free Trial',
  },
  {
    name: 'Enterprise',
    tier: 'ENTERPRISE',
    price: 499,
    priceAnnual: 5388, // 10% discount
    description: 'For organizations requiring maximum performance',
    features: [
      'Everything in Pro',
      'Unlimited historical data',
      'Dedicated infrastructure',
      'Custom integrations',
      'Unlimited webhooks',
      'White-label options',
      'SLA guarantees',
      'Custom data exports',
      'Dedicated support manager',
      'On-premise deployment option',
    ],
    limits: {
      api_calls: 'Unlimited',
      rate_limit: 'Custom',
      webhooks: 999,
      historical_data: 'Unlimited',
      support: 'Dedicated (4h SLA)',
    },
    cta: 'Contact Sales',
  },
];

export const PricingPage: React.FC = () => {
  const [isAnnual, setIsAnnual] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const handleSelectTier = async (tier: string) => {
    if (tier === 'ENTERPRISE') {
      window.location.href = 'mailto:sales@kamiyo.io?subject=Enterprise%20Plan%20Inquiry';
      return;
    }

    if (!user) {
      navigate('/signup', { state: { tier, isAnnual } });
      return;
    }

    // Redirect to Stripe checkout
    const billingPeriod = isAnnual ? 'annual' : 'monthly';
    navigate(`/checkout?tier=${tier}&period=${billingPeriod}`);
  };

  return (
    <div className="pricing-page">
      {/* Hero Section */}
      <section className="pricing-hero">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="hero-content"
        >
          <h1 className="hero-title">
            Simple, Transparent Pricing
          </h1>
          <p className="hero-subtitle">
            Choose the plan that fits your needs. All plans include access to our
            real-time exploit aggregation from 20+ sources.
          </p>

          <div className="billing-toggle">
            <span className={!isAnnual ? 'active' : ''}>Monthly</span>
            <button
              className="toggle-button"
              onClick={() => setIsAnnual(!isAnnual)}
              aria-label="Toggle billing period"
            >
              <motion.div
                className="toggle-slider"
                animate={{ x: isAnnual ? 24 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </button>
            <span className={isAnnual ? 'active' : ''}>
              Annual <span className="savings-badge">Save 10%</span>
            </span>
          </div>
        </motion.div>
      </section>

      {/* Pricing Cards */}
      <section className="pricing-cards">
        <div className="cards-container">
          {pricingTiers.map((tier) => (
            <PricingCard
              key={tier.tier}
              tier={tier}
              isAnnual={isAnnual}
              currentTier={user?.tier}
              onSelect={handleSelectTier}
            />
          ))}
        </div>
      </section>

      {/* Feature Comparison Matrix */}
      <section className="feature-comparison">
        <h2 className="section-title">Feature Comparison</h2>
        <div className="comparison-table">
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Free</th>
                <th>Starter</th>
                <th>Pro</th>
                <th>Enterprise</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>API Calls per Month</td>
                <td>3,000</td>
                <td>10,000</td>
                <td>Unlimited</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>Historical Data Access</td>
                <td>7 days</td>
                <td>30 days</td>
                <td>1 year</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>Webhook Endpoints</td>
                <td>-</td>
                <td>1</td>
                <td>5</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>Real-time WebSocket</td>
                <td>-</td>
                <td>-</td>
                <td>✓</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>Email Notifications</td>
                <td>✓</td>
                <td>✓</td>
                <td>✓</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>Discord Notifications</td>
                <td>-</td>
                <td>✓</td>
                <td>✓</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>Telegram Notifications</td>
                <td>-</td>
                <td>-</td>
                <td>✓</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>Usage Analytics</td>
                <td>Basic</td>
                <td>Basic</td>
                <td>Advanced</td>
                <td>Custom</td>
              </tr>
              <tr>
                <td>Support Response Time</td>
                <td>48h</td>
                <td>24h</td>
                <td>12h</td>
                <td>4h SLA</td>
              </tr>
              <tr>
                <td>White-label Options</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>✓</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="trust-section">
        <div className="trust-badges">
          <div className="trust-badge">
            <Shield size={40} />
            <h3>Bank-Level Security</h3>
            <p>256-bit SSL encryption for all data</p>
          </div>
          <div className="trust-badge">
            <Zap size={40} />
            <h3>99.9% Uptime</h3>
            <p>Guaranteed availability with SLA</p>
          </div>
          <div className="trust-badge">
            <Clock size={40} />
            <h3>Real-time Updates</h3>
            <p>Exploits detected within 5 minutes</p>
          </div>
          <div className="trust-badge">
            <TrendingUp size={40} />
            <h3>20+ Sources</h3>
            <p>Aggregating from verified platforms</p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="testimonials">
        <h2 className="section-title">What Our Customers Say</h2>
        <div className="testimonials-grid">
          <div className="testimonial">
            <div className="testimonial-content">
              <p>
                "Kamiyo has become essential for our security monitoring. The
                real-time alerts helped us prevent a similar exploit on our
                protocol."
              </p>
            </div>
            <div className="testimonial-author">
              <Users size={40} />
              <div>
                <h4>Alex Chen</h4>
                <p>CTO, DeFi Protocol</p>
              </div>
            </div>
          </div>

          <div className="testimonial">
            <div className="testimonial-content">
              <p>
                "The API is incredibly well-documented and easy to integrate. We
                built our internal security dashboard in just a few hours."
              </p>
            </div>
            <div className="testimonial-author">
              <Users size={40} />
              <div>
                <h4>Sarah Johnson</h4>
                <p>Security Engineer, Crypto Exchange</p>
              </div>
            </div>
          </div>

          <div className="testimonial">
            <div className="testimonial-content">
              <p>
                "Best investment we made. The historical data analysis helped us
                identify patterns and improve our security architecture."
              </p>
            </div>
            <div className="testimonial-author">
              <Users size={40} />
              <div>
                <h4>Michael Roberts</h4>
                <p>Head of Security, Web3 Startup</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="faq-section">
        <PricingFAQ />
      </section>

      {/* CTA Section */}
      <section className="pricing-cta">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="cta-content"
        >
          <h2>Ready to Get Started?</h2>
          <p>Join hundreds of teams protecting their protocols with Kamiyo</p>
          <div className="cta-buttons">
            <button
              className="cta-primary"
              onClick={() => handleSelectTier('PRO')}
            >
              Start Free Trial
            </button>
            <button
              className="cta-secondary"
              onClick={() => navigate('/demo')}
            >
              Book a Demo
            </button>
          </div>
          <div className="cta-features">
            <div className="cta-feature">
              <CheckCircle2 size={20} />
              <span>14-day money-back guarantee</span>
            </div>
            <div className="cta-feature">
              <CheckCircle2 size={20} />
              <span>No credit card required for free tier</span>
            </div>
            <div className="cta-feature">
              <CheckCircle2 size={20} />
              <span>Cancel anytime</span>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
};

export default PricingPage;
