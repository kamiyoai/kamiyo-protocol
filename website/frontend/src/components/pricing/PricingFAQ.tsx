/**
 * PricingFAQ Component
 * Accordion-style FAQ section for pricing page
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
  category: 'pricing' | 'billing' | 'features' | 'technical' | 'general';
}

const faqData: FAQItem[] = [
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit cards (Visa, MasterCard, American Express) and bank transfers for Enterprise plans. All payments are processed securely through Stripe.',
    category: 'billing',
  },
  {
    question: 'Can I change my plan at any time?',
    answer: 'Yes, you can upgrade or downgrade your plan at any time. Upgrades take effect immediately, while downgrades take effect at the end of your current billing period.',
    category: 'pricing',
  },
  {
    question: 'What happens if I exceed my API limit?',
    answer: 'Your API requests will be rate-limited according to your plan. You can upgrade to a higher tier for more capacity, or wait until your monthly limit resets.',
    category: 'technical',
  },
  {
    question: 'Is there a free trial for paid plans?',
    answer: 'We offer a 14-day money-back guarantee on all paid plans. Try any plan risk-free, and if you\'re not satisfied, request a full refund within 14 days.',
    category: 'pricing',
  },
  {
    question: 'Do you offer annual discounts?',
    answer: 'Yes! Annual subscriptions receive a 10% discount compared to monthly billing. The savings are automatically calculated when you toggle to annual billing.',
    category: 'pricing',
  },
  {
    question: 'What is your refund policy?',
    answer: 'We offer a 14-day money-back guarantee on all plans. If you\'re not satisfied, contact us within 14 days of purchase for a full refund.',
    category: 'billing',
  },
  {
    question: 'How do webhooks work?',
    answer: 'Webhooks allow real-time notifications when new exploits are detected. You configure a webhook URL, and we send POST requests with exploit data as it happens.',
    category: 'features',
  },
  {
    question: 'What historical data is included?',
    answer: 'Free tier includes 7 days, Starter includes 30 days, Pro includes 1 year, and Enterprise includes unlimited historical data access.',
    category: 'features',
  },
  {
    question: 'Can I cancel my subscription anytime?',
    answer: 'Yes, you can cancel at any time. Your access continues until the end of your current billing period, with no additional charges.',
    category: 'billing',
  },
  {
    question: 'What support channels are available?',
    answer: 'Free tier gets email support (48h response), Starter gets priority email (24h), Pro gets email + Discord (12h), and Enterprise gets dedicated support with SLA.',
    category: 'features',
  },
  {
    question: 'How accurate is the exploit data?',
    answer: 'We aggregate from 20+ verified sources including BlockSec, PeckShield, and Rekt News. All exploits include transaction hashes and are verified before being published.',
    category: 'technical',
  },
  {
    question: 'Can I use the API for commercial purposes?',
    answer: 'Yes, all paid plans allow commercial use. Enterprise plans include custom licensing options for reselling or white-labeling.',
    category: 'general',
  },
  {
    question: 'What chains do you support?',
    answer: 'We track exploits across 15+ chains including Ethereum, BSC, Polygon, Arbitrum, Optimism, Avalanche, Fantom, and more. New chains are added regularly.',
    category: 'technical',
  },
  {
    question: 'How fast are exploit notifications?',
    answer: 'Most exploits are detected and published within 5 minutes of being reported by our sources. WebSocket subscribers receive instant notifications.',
    category: 'technical',
  },
  {
    question: 'Is there a startup or non-profit discount?',
    answer: 'Yes! We offer 50% off Pro plans for verified startups and non-profits. Contact us at support@kamiyo.io with your organization details.',
    category: 'pricing',
  },
  {
    question: 'What happens to my data if I cancel?',
    answer: 'Your API keys are immediately revoked, but your account data is retained for 90 days in case you want to reactivate. After 90 days, all data is permanently deleted.',
    category: 'billing',
  },
];

export const PricingFAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = ['all', 'pricing', 'billing', 'features', 'technical', 'general'];

  const filteredFAQs = faqData.filter((faq) => {
    const matchesSearch =
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === 'all' || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="pricing-faq">
      <div className="faq-header">
        <h2 className="faq-title">Frequently Asked Questions</h2>
        <p className="faq-subtitle">
          Everything you need to know about pricing and plans
        </p>
      </div>

      <div className="faq-controls">
        <div className="faq-search">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder="Search questions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="faq-categories">
          {categories.map((category) => (
            <button
              key={category}
              className={`category-btn ${
                selectedCategory === category ? 'active' : ''
              }`}
              onClick={() => setSelectedCategory(category)}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="faq-list">
        {filteredFAQs.length === 0 ? (
          <div className="faq-empty">
            <p>No questions found matching your search.</p>
          </div>
        ) : (
          filteredFAQs.map((faq, index) => (
            <div key={index} className="faq-item">
              <button
                className={`faq-question ${
                  openIndex === index ? 'open' : ''
                }`}
                onClick={() => toggleFAQ(index)}
              >
                <span className="question-text">{faq.question}</span>
                <motion.div
                  animate={{ rotate: openIndex === index ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={20} />
                </motion.div>
              </button>

              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="faq-answer"
                  >
                    <p>{faq.answer}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>

      <div className="faq-footer">
        <p>Still have questions?</p>
        <a href="mailto:support@kamiyo.io" className="contact-link">
          Contact our support team
        </a>
      </div>
    </div>
  );
};

export default PricingFAQ;
