import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ScrambleButton } from '../components/ScrambleButton';

export default function Webhooks() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [subscription, setSubscription] = useState(null);
  const [webhooks, setWebhooks] = useState([]);
  const [webhookLimit, setWebhookLimit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWebhook, setNewWebhook] = useState({
    url: '',
    name: '',
    description: '',
    chains: [],
    minAmount: ''
  });

  // Check authentication and subscription tier
  useEffect(() => {
    if (status === 'loading') return;

    if (status !== 'authenticated' || !session?.user) {
      router.push('/auth/signin?redirect=/webhooks');
      return;
    }

    const checkSubscription = async () => {
      try {
        const response = await fetch(`/api/subscription/status?email=${session.user.email}`);
        const subStatus = await response.json();
        setSubscription(subStatus);

        // Check if user has Team or Enterprise tier
        if (!subStatus.isSubscribed || !['team', 'enterprise'].includes(subStatus.tier?.toLowerCase())) {
          setLoading(false);
          return;
        }

        // User has access - load webhooks
        loadWebhooks();
      } catch (err) {
        console.error('Failed to check subscription:', err);
        setLoading(false);
      }
    };

    checkSubscription();
  }, [status, session]);

  const loadWebhooks = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/webhooks');
      const data = await response.json();

      if (response.ok) {
        setWebhooks(data.webhooks || []);
        setWebhookLimit(data.limit || 0);
      } else {
        console.error('Failed to load webhooks:', data.error);
        setWebhooks([]);
      }
    } catch (err) {
      console.error('Failed to load webhooks:', err);
      setWebhooks([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWebhook = async () => {
    if (!newWebhook.url) {
      alert('URL is required');
      return;
    }

    try {
      const response = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: newWebhook.url,
          name: newWebhook.name || null,
          description: newWebhook.description || null,
          chains: newWebhook.chains.length > 0 ? newWebhook.chains : null,
          minAmount: newWebhook.minAmount ? parseFloat(newWebhook.minAmount) : null
        })
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to create webhook');
        return;
      }

      setShowCreateModal(false);
      setNewWebhook({
        url: '',
        name: '',
        description: '',
        chains: [],
        minAmount: ''
      });
      loadWebhooks();
    } catch (err) {
      console.error('Failed to create webhook:', err);
      alert('Failed to create webhook');
    }
  };

  const handleDeleteWebhook = async (id) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;

    try {
      const response = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });

      if (response.ok || response.status === 204) {
        loadWebhooks();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete webhook');
      }
    } catch (err) {
      console.error('Failed to delete webhook:', err);
      alert('Failed to delete webhook');
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';

    try {
      const response = await fetch(`/api/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        loadWebhooks();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update webhook');
      }
    } catch (err) {
      console.error('Failed to update webhook:', err);
      alert('Failed to update webhook');
    }
  };

  // Show loading state while checking authentication
  if (status === 'loading' || !subscription) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Check if user has access to this feature (Team or Enterprise)
  const hasAccess = subscription?.isSubscribed && ['team', 'enterprise'].includes(subscription.tier?.toLowerCase());

  return (
    <div className="min-h-screen bg-black text-white">
      <Head>
        <title>Webhook Management - KAMIYO</title>
        <meta name="description" content="Manage webhook endpoints for real-time exploit alerts" />
      </Head>

      <section className="py-10 px-5 md:px-10 mx-auto" style={{ maxWidth: '1400px' }}>
        <div className="border-dotted border-b border-cyan mb-12 pb-6">
          <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;Integration</p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">Webhook Management</h1>
          <p className="text-gray-400 mt-4">
            Configure webhook endpoints to receive real-time HTTP notifications when new exploits are detected. Integrate KAMIYO alerts into your monitoring systems, incident response workflows, or custom applications.
          </p>
        </div>

        {/* Access Gate - Show if user doesn't have Team or Enterprise */}
        {!hasAccess && (
          <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-8 text-center">
            <div className="mb-6">
              <svg className="w-16 h-16 mx-auto text-cyan mb-4" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <h2 className="text-2xl font-light mb-4">Team or Enterprise Tier Required</h2>
              <p className="text-gray-400 mb-6 max-w-2xl mx-auto">
                Webhook endpoints are an advanced integration feature for Team and Enterprise subscribers.
              </p>
              {subscription?.isSubscribed ? (
                <div className="mb-6">
                  <p className="text-sm text-gray-500 mb-4">
                    Your current tier: <span className="text-white capitalize">{subscription.tier}</span>
                  </p>
                  <p className="text-gray-400 mb-4">Upgrade to unlock webhook integrations:</p>
                  <ul className="text-sm text-gray-400 text-left max-w-md mx-auto space-y-2 mb-6">
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Team: 5 webhook endpoints</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Enterprise: 50 webhook endpoints</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Filter by chain and minimum amount</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Real-time HTTP POST notifications</span>
                    </li>
                  </ul>
                </div>
              ) : (
                <p className="text-gray-400 mb-6">
                  Subscribe to Team or Enterprise tier to access webhook integrations.
                </p>
              )}
              <ScrambleButton
                text={subscription?.isSubscribed ? 'Upgrade Tier' : 'View Pricing'}
                onClick={() => router.push('/pricing')}
              />
            </div>
          </div>
        )}

        {/* Main Content - Only show if user has access */}
        {hasAccess && (
          <>
            {/* Header Actions */}
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-xl font-light">Your Webhooks</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {webhooks.length} of {webhookLimit} webhook{webhookLimit !== 1 ? 's' : ''} configured
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                disabled={webhooks.length >= webhookLimit}
                className="px-4 py-2 text-sm font-light text-white border border-cyan rounded hover:bg-cyan hover:bg-opacity-10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                + Create Webhook
              </button>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center h-64">
                <div className="text-gray-400">Loading webhooks...</div>
              </div>
            )}

            {/* Webhooks Grid */}
            {!loading && webhooks.length === 0 && (
              <div className="text-center py-16">
                <p className="text-gray-400 mb-6">No webhooks configured yet</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-6 py-3 text-sm font-light text-white border border-cyan rounded hover:bg-cyan hover:bg-opacity-10 transition-colors"
                >
                  Create Your First Webhook
                </button>
              </div>
            )}

            {!loading && webhooks.length > 0 && (
              <div className="grid grid-cols-1 gap-6">
                {webhooks.map((webhook) => {
                  const chains = webhook.chains ? JSON.parse(webhook.chains) : [];
                  return (
                    <div
                      key={webhook.id}
                      className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 hover:border-cyan transition-colors"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-light">{webhook.name || 'Unnamed Webhook'}</h3>
                            <span className={`text-xs px-2 py-1 rounded ${webhook.status === 'active' ? 'bg-green-500 bg-opacity-20 text-green-400' : 'bg-gray-500 bg-opacity-20 text-gray-400'}`}>
                              {webhook.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-400 mb-2">{webhook.description || 'No description'}</p>
                          <p className="text-xs text-gray-500 font-mono break-all">{webhook.url}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleToggleStatus(webhook.id, webhook.status)}
                            className="text-gray-500 hover:text-cyan transition-colors p-1"
                            title={webhook.status === 'active' ? 'Pause' : 'Activate'}
                          >
                            {webhook.status === 'active' ? (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteWebhook(webhook.id)}
                            className="text-gray-500 hover:text-red-400 transition-colors p-1"
                            title="Delete"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 mb-4">
                        {chains.length > 0 && (
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Chains Filter</div>
                            <div className="flex flex-wrap gap-2">
                              {chains.map((chain, idx) => (
                                <span key={idx} className="text-xs bg-cyan bg-opacity-20 text-cyan px-2 py-1 rounded">
                                  {chain}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {webhook.minAmount && (
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Minimum Amount</div>
                            <span className="text-xs bg-gray-500 bg-opacity-20 px-2 py-1 rounded">
                              ${webhook.minAmount.toLocaleString()}+
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between items-center pt-4 border-t border-gray-500 border-opacity-25 text-xs text-gray-500">
                        <span>Created {new Date(webhook.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
              <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
                <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-8 max-w-2xl w-full">
                  <h2 className="text-2xl font-light mb-6">Create New Webhook</h2>

                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Webhook URL *</label>
                      <input
                        type="url"
                        value={newWebhook.url}
                        onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                        className="w-full bg-black border border-gray-500 border-opacity-25 rounded px-4 py-2 text-white font-mono text-sm"
                        placeholder="https://your-domain.com/webhook"
                      />
                      <p className="text-xs text-gray-500 mt-1">This endpoint will receive HTTP POST requests</p>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Name</label>
                      <input
                        type="text"
                        value={newWebhook.name}
                        onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                        className="w-full bg-black border border-gray-500 border-opacity-25 rounded px-4 py-2 text-white"
                        placeholder="e.g., Production Alerts"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Description</label>
                      <textarea
                        value={newWebhook.description}
                        onChange={(e) => setNewWebhook({ ...newWebhook, description: e.target.value })}
                        className="w-full bg-black border border-gray-500 border-opacity-25 rounded px-4 py-2 text-white h-20"
                        placeholder="Brief description of this webhook's purpose"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Minimum Amount (USD)</label>
                      <input
                        type="number"
                        value={newWebhook.minAmount}
                        onChange={(e) => setNewWebhook({ ...newWebhook, minAmount: e.target.value })}
                        className="w-full bg-black border border-gray-500 border-opacity-25 rounded px-4 py-2 text-white"
                        placeholder="e.g., 100000"
                      />
                      <p className="text-xs text-gray-500 mt-1">Only notify for exploits exceeding this amount</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={handleCreateWebhook}
                      className="flex-1 px-6 py-3 text-sm font-light text-white bg-cyan rounded hover:bg-opacity-80 transition-colors"
                    >
                      Create Webhook
                    </button>
                    <button
                      onClick={() => setShowCreateModal(false)}
                      className="flex-1 px-6 py-3 text-sm font-light text-white border border-gray-500 border-opacity-25 rounded hover:border-cyan transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
