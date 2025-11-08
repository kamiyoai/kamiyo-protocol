/**
 * x402 Infrastructure SaaS Dashboard
 *
 * Tenant dashboard for managing x402 API keys, usage, and billing
 */

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import {
  VerificationsTrendChart,
  VerificationsByChainChart,
  SuccessRateChart,
  ResponseTimeChart,
  generateMockData
} from '../../components/dashboard/UsageCharts';

export default function X402Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [apiKeys, setApiKeys] = useState([]);
  const [usage, setUsage] = useState(null);
  const [chains, setChains] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  // Load dashboard data
  useEffect(() => {
    if (status === 'authenticated') {
      loadDashboardData();
    }
  }, [status]);

  async function loadDashboardData() {
    try {
      setLoading(true);
      setError(null);

      // Get user's API keys
      const keysRes = await fetch('/api/v1/x402/keys');
      if (keysRes.ok) {
        const keysData = await keysRes.json();
        setApiKeys(keysData.api_keys || []);
      }

      // Load dashboard data using session auth (no API key needed)
      const [usageRes, chainsRes, analyticsRes] = await Promise.all([
        fetch('/api/v1/x402/usage'),
        fetch('/api/v1/x402/supported-chains'),
        fetch('/api/v1/x402/analytics?days=30')
      ]);

      if (usageRes.ok) {
        const usageData = await usageRes.json();
        setUsage(usageData);
      }

      if (chainsRes.ok) {
        const chainsData = await chainsRes.json();
        setChains(chainsData);
      }

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData);
      } else {
        // Fallback to mock data if API fails
        console.warn('Analytics API failed, using mock data');
        const mockAnalytics = generateMockData();
        setAnalytics(mockAnalytics);
      }

      setLoading(false);

    } catch (err) {
      console.error('Error loading dashboard:', err);
      setError(err.message);
      setLoading(false);
    }
  }

  async function createCheckoutSession(tier) {
    try {
      const apiKey = 'x402_live_placeholder'; // TODO: Get from user account

      const response = await fetch('/api/v1/x402/billing/create-checkout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tier,
          success_url: `${window.location.origin}/dashboard/x402?checkout=success`,
          cancel_url: `${window.location.origin}/dashboard/x402?checkout=cancelled`
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Redirect to Stripe Checkout
        window.location.href = data.checkout_url;
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }

  async function openBillingPortal() {
    try {
      const apiKey = 'x402_live_placeholder'; // TODO: Get from user account

      const response = await fetch('/api/v1/x402/billing/portal', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          return_url: `${window.location.origin}/dashboard/x402`
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Redirect to Stripe Customer Portal
        window.location.href = data.portal_url;
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <>
      <Head>
        <title>x402 Dashboard - KAMIYO</title>
      </Head>

      <div className="min-h-screen bg-black text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8 border-dotted border-b border-cyan pb-6">
            <p className="font-light text-sm uppercase tracking-widest text-cyan mb-4">—  DASHBOARD</p>
            <h1 className="text-3xl font-light text-white">x402 Infrastructure</h1>
            <p className="mt-2 text-gray-400">Payment verification API management</p>
          </div>

          {/* Checkout success/cancel message */}
          {router.query.checkout === 'success' && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800">✓ Subscription activated successfully!</p>
            </div>
          )}
          {router.query.checkout === 'cancelled' && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800">Checkout cancelled. You can try again anytime.</p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">Error: {error}</p>
            </div>
          )}

          {/* Usage Stats */}
          {usage && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-500">Current Tier</h3>
                <p className="mt-2 text-3xl font-bold text-gray-900 capitalize">{usage.tier}</p>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-500">Verifications Used</h3>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {usage.verifications_used.toLocaleString()}
                  <span className="text-lg text-gray-500">
                    {usage.verifications_limit !== -1 && ` / ${usage.verifications_limit.toLocaleString()}`}
                  </span>
                </p>
                <div className="mt-4 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${Math.min(usage.usage_percent, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-500">Verifications Remaining</h3>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {usage.verifications_remaining === -1
                    ? 'Unlimited'
                    : usage.verifications_remaining.toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* Analytics Charts */}
          {analytics && (
            <div className="mb-12">
              <h2 className="text-2xl font-light mb-6 text-white">Usage Analytics</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <VerificationsTrendChart data={analytics.trendData} />
                <VerificationsByChainChart data={analytics.chainData} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SuccessRateChart
                  successRate={analytics.successRate}
                  total={analytics.totalVerifications}
                />
                <ResponseTimeChart data={analytics.responseTimeData} />
              </div>
            </div>
          )}

          {/* Enabled Chains */}
          {chains && (
            <div className="bg-black border border-gray-500/25 rounded-lg p-6 mb-8">
              <h2 className="text-lg font-light text-white mb-4">Enabled Chains</h2>
              <div className="flex flex-wrap gap-2">
                {chains.enabled_chains.map(chain => (
                  <span
                    key={chain}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border border-cyan text-cyan"
                  >
                    {chain.charAt(0).toUpperCase() + chain.slice(1)}
                  </span>
                ))}
              </div>
              {chains.payai_enabled && (
                <p className="mt-4 text-sm text-gray-400">
                  ✓ PayAI network integration enabled
                </p>
              )}
            </div>
          )}

          {/* Upgrade Section */}
          {usage && usage.tier !== 'enterprise' && (
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Upgrade Your Plan</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {usage.tier === 'free' && (
                  <>
                    <PricingCard
                      name="Starter"
                      price={99}
                      verifications="50,000"
                      onClick={() => createCheckoutSession('starter')}
                    />
                    <PricingCard
                      name="Pro"
                      price={299}
                      verifications="500,000"
                      onClick={() => createCheckoutSession('pro')}
                    />
                    <PricingCard
                      name="Enterprise"
                      price={999}
                      verifications="Unlimited"
                      onClick={() => createCheckoutSession('enterprise')}
                    />
                  </>
                )}
                {usage.tier === 'starter' && (
                  <>
                    <PricingCard
                      name="Pro"
                      price={299}
                      verifications="500,000"
                      onClick={() => createCheckoutSession('pro')}
                    />
                    <PricingCard
                      name="Enterprise"
                      price={999}
                      verifications="Unlimited"
                      onClick={() => createCheckoutSession('enterprise')}
                    />
                  </>
                )}
                {usage.tier === 'pro' && (
                  <PricingCard
                    name="Enterprise"
                    price={999}
                    verifications="Unlimited"
                    onClick={() => createCheckoutSession('enterprise')}
                  />
                )}
              </div>
            </div>
          )}

          {/* Billing Portal */}
          {usage && usage.tier !== 'free' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Billing Management</h2>
              <p className="text-gray-600 mb-4">
                Manage your subscription, payment methods, and invoices.
              </p>
              <button
                onClick={openBillingPortal}
                className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800"
              >
                Open Billing Portal
              </button>
            </div>
          )}

          {/* Documentation Link */}
          <div className="mt-8 text-center">
            <a
              href="https://kamiyo.ai/docs/x402"
              className="text-blue-600 hover:underline"
            >
              View API Documentation →
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

function PricingCard({ name, price, verifications, onClick }) {
  return (
    <div className="border rounded-lg p-4">
      <h3 className="text-lg font-semibold">{name}</h3>
      <p className="text-3xl font-bold mt-2">${price}<span className="text-sm text-gray-500">/mo</span></p>
      <p className="text-gray-600 mt-2">{verifications} verifications</p>
      <button
        onClick={onClick}
        className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Upgrade to {name}
      </button>
    </div>
  );
}
