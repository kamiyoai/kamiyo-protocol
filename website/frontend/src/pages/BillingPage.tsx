/**
 * Billing Page Component
 * Main billing page with tabbed interface for all billing features
 */

import React, { useState } from 'react';
import BillingDashboard from '../components/billing/BillingDashboard';
import SubscriptionPlans from '../components/billing/SubscriptionPlans';
import UsageChart from '../components/billing/UsageChart';
import InvoiceHistory from '../components/billing/InvoiceHistory';
import PaymentMethodCard from '../components/billing/PaymentMethodCard';
import '../styles/billing.css';

type TabType = 'overview' | 'plans' | 'usage' | 'invoices' | 'payment';

const BillingPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Handle navigation from dashboard
  const handleNavigate = (tab: string) => {
    setActiveTab(tab as TabType);
  };

  // Render active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <BillingDashboard onNavigate={handleNavigate} />;
      case 'plans':
        return <SubscriptionPlans onSuccess={() => setActiveTab('overview')} />;
      case 'usage':
        return <UsageChart />;
      case 'invoices':
        return <InvoiceHistory />;
      case 'payment':
        return <PaymentMethodCard />;
      default:
        return <BillingDashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="billing-page">
      {/* Breadcrumbs */}
      <nav className="breadcrumbs" aria-label="Breadcrumb navigation">
        <ol>
          <li>
            <a href="/">Home</a>
          </li>
          <li>
            <a href="/dashboard">Dashboard</a>
          </li>
          <li aria-current="page">Billing</li>
        </ol>
      </nav>

      {/* Page Header */}
      <div className="page-header">
        <div className="header-content">
          <h1>Billing & Subscription</h1>
          <p className="header-description">
            Manage your subscription, view usage, and access billing information
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <nav className="tabs" role="tablist" aria-label="Billing sections">
          <button
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            role="tab"
            aria-selected={activeTab === 'overview'}
            aria-controls="overview-panel"
          >
            <span className="tab-icon">📊</span>
            <span>Overview</span>
          </button>
          <button
            className={`tab ${activeTab === 'plans' ? 'active' : ''}`}
            onClick={() => setActiveTab('plans')}
            role="tab"
            aria-selected={activeTab === 'plans'}
            aria-controls="plans-panel"
          >
            <span className="tab-icon">💎</span>
            <span>Plans</span>
          </button>
          <button
            className={`tab ${activeTab === 'usage' ? 'active' : ''}`}
            onClick={() => setActiveTab('usage')}
            role="tab"
            aria-selected={activeTab === 'usage'}
            aria-controls="usage-panel"
          >
            <span className="tab-icon">📈</span>
            <span>Usage</span>
          </button>
          <button
            className={`tab ${activeTab === 'invoices' ? 'active' : ''}`}
            onClick={() => setActiveTab('invoices')}
            role="tab"
            aria-selected={activeTab === 'invoices'}
            aria-controls="invoices-panel"
          >
            <span className="tab-icon">📄</span>
            <span>Invoices</span>
          </button>
          <button
            className={`tab ${activeTab === 'payment' ? 'active' : ''}`}
            onClick={() => setActiveTab('payment')}
            role="tab"
            aria-selected={activeTab === 'payment'}
            aria-controls="payment-panel"
          >
            <span className="tab-icon">💳</span>
            <span>Payment</span>
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        <div
          id="overview-panel"
          role="tabpanel"
          aria-labelledby="overview-tab"
          hidden={activeTab !== 'overview'}
        >
          {activeTab === 'overview' && renderTabContent()}
        </div>
        <div
          id="plans-panel"
          role="tabpanel"
          aria-labelledby="plans-tab"
          hidden={activeTab !== 'plans'}
        >
          {activeTab === 'plans' && renderTabContent()}
        </div>
        <div
          id="usage-panel"
          role="tabpanel"
          aria-labelledby="usage-tab"
          hidden={activeTab !== 'usage'}
        >
          {activeTab === 'usage' && renderTabContent()}
        </div>
        <div
          id="invoices-panel"
          role="tabpanel"
          aria-labelledby="invoices-tab"
          hidden={activeTab !== 'invoices'}
        >
          {activeTab === 'invoices' && renderTabContent()}
        </div>
        <div
          id="payment-panel"
          role="tabpanel"
          aria-labelledby="payment-tab"
          hidden={activeTab !== 'payment'}
        >
          {activeTab === 'payment' && renderTabContent()}
        </div>
      </div>

      {/* Support Footer */}
      <div className="billing-footer">
        <div className="footer-content">
          <h3>Need Help?</h3>
          <p>
            If you have questions about billing or subscriptions, check out our{' '}
            <a href="/docs/billing-guide" className="link">
              Billing Guide
            </a>{' '}
            or{' '}
            <a href="/support" className="link">
              contact support
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
};

export default BillingPage;
