/**
 * x402 Infrastructure SaaS Dashboard
 *
 * Tenant dashboard for managing x402 API keys, usage, and billing
 */

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import PayButton from '../../components/PayButton';
import { LinkButton } from '../../components/Button';
// Charts temporarily disabled due to SSR issues
// import {
//   VerificationsTrendChart,
//   VerificationsByChainChart,
//   SuccessRateChart,
//   ResponseTimeChart,
//   generateMockData
// } from '../../components/dashboard/UsageCharts';

export default function X402Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [apiKeys, setApiKeys] = useState([]);
  const [usage, setUsage] = useState(null);
  const [chains, setChains] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedKeyId, setCopiedKeyId] = useState(null);
  const [isCreatingKey, setIsCreatingKey] = useState(false);

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
      const response = await fetch('/api/v1/x402/billing/create-checkout', {
        method: 'POST',
        headers: {
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
      const response = await fetch('/api/v1/x402/billing/portal', {
        method: 'POST',
        headers: {
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

  async function createApiKey() {
    setIsCreatingKey(true);
    try {
      const response = await fetch('/api/v1/x402/keys/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: `API Key ${new Date().toLocaleDateString()}`,
          environment: 'production',
          scopes: ['verify', 'analytics']
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert(`API Key Created!\n\nKey: ${data.api_key}\n\nSave this key now - you won't be able to see it again!`);
        loadDashboardData();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsCreatingKey(false);
    }
  }

  async function copyToClipboard(text, keyId) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKeyId(keyId);
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch (err) {
      alert('Failed to copy to clipboard');
    }
  }

  async function revokeApiKey(keyId) {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/x402/keys/${keyId}/revoke`, {
        method: 'POST'
      });

      if (response.ok) {
        alert('API key revoked successfully');
        loadDashboardData();
      } else {
        const data = await response.json();
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
            <div className="mb-6 bg-black border border-dotted border-cyan p-4">
              <p className="text-cyan">✓ Subscription activated successfully!</p>
            </div>
          )}
          {router.query.checkout === 'cancelled' && (
            <div className="mb-6 bg-black border border-dotted border-gray-500 p-4">
              <p className="text-gray-400">Checkout cancelled. You can try again anytime.</p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-6 bg-black border border-dotted border-red-500 p-4">
              <p className="text-red-400">Error: {error}</p>
            </div>
          )}

          {/* Usage Stats */}
          {usage && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-black border border-dotted border-gray-500/25 p-6">
                <h3 className="text-sm font-medium text-gray-400">Current Tier</h3>
                <p className="mt-2 text-3xl font-light text-white capitalize">{usage.tier}</p>
              </div>

              <div className="bg-black border border-dotted border-gray-500/25 p-6">
                <h3 className="text-sm font-medium text-gray-400">Verifications Used</h3>
                <p className="mt-2 text-3xl font-light text-white">
                  {usage.verifications_used.toLocaleString()}
                  <span className="text-lg text-gray-400">
                    {usage.verifications_limit !== -1 && ` / ${usage.verifications_limit.toLocaleString()}`}
                  </span>
                </p>
                <div className="mt-4 bg-gray-800 h-2">
                  <div
                    className="bg-gradient-to-r from-cyan to-magenta h-2"
                    style={{ width: `${Math.min(usage.usage_percent, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="bg-black border border-dotted border-gray-500/25 p-6">
                <h3 className="text-sm font-medium text-gray-400">Verifications Remaining</h3>
                <p className="mt-2 text-3xl font-light text-white">
                  {usage.verifications_remaining === -1
                    ? 'Unlimited'
                    : usage.verifications_remaining.toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* API Keys Management */}
          <div className="mb-12">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-light text-white">API Keys</h2>
              <PayButton
                textOverride={isCreatingKey ? 'Creating...' : '+ Create New Key'}
                onClickOverride={createApiKey}
                disabled={isCreatingKey}
              />
            </div>

            {apiKeys.length === 0 ? (
              <div className="bg-black border border-dotted border-gray-500/25 p-8 text-center">
                <p className="text-gray-400">No API keys yet. Create one to get started.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {apiKeys.map(key => (
                  <div key={key.id} className="bg-black border border-dotted border-gray-500/25 p-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-white">{key.name}</h3>
                        <div className="mt-2 flex items-center gap-2">
                          <code className="text-sm text-cyan bg-gray-900 px-3 py-1 rounded font-mono">
                            {key.key_prefix}••••••••
                          </code>
                          <button
                            onClick={() => copyToClipboard(key.key_prefix, key.id)}
                            className="text-sm text-gray-400 hover:text-cyan"
                          >
                            {copiedKeyId === key.id ? '✓ Copied' : 'Copy Prefix'}
                          </button>
                        </div>
                        <div className="mt-3 flex gap-4 text-sm text-gray-400">
                          <span>Environment: {key.environment}</span>
                          <span>Created: {new Date(key.created_at).toLocaleDateString()}</span>
                          {key.last_used && (
                            <span>Last used: {new Date(key.last_used).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => revokeApiKey(key.id)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Analytics Summary */}
          {analytics && (
            <div className="mb-12">
              <h2 className="text-2xl font-light mb-6 text-white">Usage Analytics</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-black border border-dotted border-gray-500/25 p-6">
                  <h3 className="text-sm font-medium text-gray-400">Total Verifications</h3>
                  <p className="mt-2 text-3xl font-light text-white">{analytics.total_verifications || 0}</p>
                </div>
                <div className="bg-black border border-dotted border-gray-500/25 p-6">
                  <h3 className="text-sm font-medium text-gray-400">Success Rate</h3>
                  <p className="mt-2 text-3xl font-light text-cyan">{analytics.success_rate || 0}%</p>
                </div>
                <div className="bg-black border border-dotted border-gray-500/25 p-6">
                  <h3 className="text-sm font-medium text-gray-400">Avg Response Time</h3>
                  <p className="mt-2 text-3xl font-light text-cyan">{analytics.avg_response_time_ms || 0}ms</p>
                </div>
              </div>
            </div>
          )}

          {/* Enabled Chains */}
          {chains && (
            <div className="bg-black border border-dotted border-gray-500/25 p-6 mb-8">
              <h2 className="text-lg font-light text-white mb-4">Enabled Chains</h2>
              <div className="flex flex-wrap gap-2">
                {chains.enabled_chains.map(chain => (
                  <span
                    key={chain}
                    className="inline-flex items-center px-3 py-1 text-sm font-medium border border-dotted border-cyan text-cyan"
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
            <div className="bg-black border border-dotted border-gray-500/25 p-6 mb-8">
              <h2 className="text-lg font-light text-white mb-4">Upgrade Your Plan</h2>
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
            <div className="bg-black border border-dotted border-gray-500/25 p-6">
              <h2 className="text-lg font-light text-white mb-4">Billing Management</h2>
              <p className="text-gray-400 mb-4">
                Manage your subscription, payment methods, and invoices.
              </p>
              <PayButton
                textOverride="Open Billing Portal"
                onClickOverride={openBillingPortal}
              />
            </div>
          )}

          {/* Documentation Link */}
          <div className="mt-8 text-center">
            <LinkButton
              href="/api-docs"
              title="View API documentation for x402 Infrastructure"
              aria-label="View API documentation"
            >
              View API Documentation →
            </LinkButton>
          </div>
        </div>
      </div>
    </>
  );
}

function PricingCard({ name, price, verifications, onClick }) {
  return (
    <div className="border border-dotted border-gray-500/25 p-4">
      <h3 className="text-lg font-light text-white">{name}</h3>
      <p className="text-3xl font-light text-white mt-2">${price}<span className="text-sm text-gray-400">/mo</span></p>
      <p className="text-gray-400 mt-2">{verifications} verifications</p>
      <div className="mt-4 flex justify-center">
        <PayButton
          textOverride={`Upgrade to ${name}`}
          onClickOverride={onClick}
        />
      </div>
    </div>
  );
}
