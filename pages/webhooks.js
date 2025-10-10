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
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWebhook, setNewWebhook] = useState({
    name: '',
    url: '',
    events: [],
    chains: [],
    secret: ''
  });

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

        const allowedTiers = ['team', 'enterprise'];
        if (!subStatus.isSubscribed || !allowedTiers.includes(subStatus.tier?.toLowerCase())) {
          setLoading(false);
          return;
        }

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
      // Demo data
      setWebhooks([
        {
          id: 'wh-1',
          name: 'Slack Notifications',
          url: 'https://hooks.slack.com/services/...',
          events: ['exploit.created', 'exploit.high_severity'],
          chains: ['Ethereum', 'BSC'],
          status: 'active',
          createdAt: '2024-02-15',
          lastTriggered: '2024-03-20T14:30:00Z',
          deliveryRate: 98.5
        },
        {
          id: 'wh-2',
          name: 'Internal API',
          url: 'https://api.example.com/webhooks/kamiyo',
          events: ['exploit.created', 'anomaly.detected'],
          chains: ['all'],
          status: 'active',
          createdAt: '2024-01-10',
          lastTriggered: '2024-03-20T12:15:00Z',
          deliveryRate: 99.8
        }
      ]);
    } catch (err) {
      console.error('Failed to load webhooks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWebhook = async () => {
    try {
      // TODO: API call
      setShowCreateModal(false);
      setNewWebhook({ name: '', url: '', events: [], chains: [], secret: '' });
      loadWebhooks();
    } catch (err) {
      console.error('Failed to create webhook:', err);
    }
  };

  const handleDeleteWebhook = async (id) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;
    try {
      // TODO: API call
      loadWebhooks();
    } catch (err) {
      console.error('Failed to delete webhook:', err);
    }
  };

  const handleTestWebhook = async (id) => {
    try {
      // TODO: API call
      alert('Test payload sent successfully!');
    } catch (err) {
      console.error('Failed to test webhook:', err);
    }
  };

  if (status === 'loading' || !subscription) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const hasAccess = subscription?.isSubscribed && ['team', 'enterprise'].includes(subscription.tier?.toLowerCase());
  const webhookLimit = subscription.tier?.toLowerCase() === 'enterprise' ? 50 : 5;

  const eventTypes = [
    { id: 'exploit.created', label: 'New Exploit Detected' },
    { id: 'exploit.high_severity', label: 'High/Critical Severity' },
    { id: 'anomaly.detected', label: 'Anomaly Detected' },
    { id: 'pattern.identified', label: 'Pattern Identified' },
    { id: 'fork.detected', label: 'Fork Detected' }
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <Head>
        <title>Webhook Management - KAMIYO</title>
        <meta name="description" content="Configure webhooks for real-time exploit notifications" />
      </Head>

      <section className="py-10 px-5 md:px-10 mx-auto" style={{ maxWidth: '1400px' }}>
        <div className="border-dotted border-b border-cyan mb-12 pb-6">
          <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;Integration</p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">Webhook Management</h1>
          <p className="text-gray-400 mt-4">
            Configure webhooks to receive real-time notifications when new exploits are detected, anomalies occur, or patterns are identified.
          </p>
        </div>

        {!hasAccess && (
          <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-8 text-center">
            <div className="mb-6">
              <svg className="w-16 h-16 mx-auto text-cyan mb-4" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <h2 className="text-2xl font-light mb-4">Team Tier Required</h2>
              <p className="text-gray-400 mb-6 max-w-2xl mx-auto">
                Webhook integration is available to Team and Enterprise tier subscribers for automated alert routing.
              </p>
              {subscription?.isSubscribed ? (
                <div className="mb-6">
                  <p className="text-sm text-gray-500 mb-4">
                    Your current tier: <span className="text-white capitalize">{subscription.tier}</span>
                  </p>
                </div>
              ) : null}
              <ScrambleButton
                text={subscription?.isSubscribed ? 'Upgrade to Team' : 'View Pricing'}
                onClick={() => router.push('/pricing')}
              />
            </div>
          </div>
        )}

        {hasAccess && (
          <>
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-xl font-light">Your Webhooks</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {webhooks.length} of {webhookLimit} webhooks configured
                </p>
              </div>
              {webhooks.length < webhookLimit && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 text-sm font-light text-white border border-cyan rounded hover:bg-cyan hover:bg-opacity-10 transition-colors"
                >
                  + Add Webhook
                </button>
              )}
            </div>

            {loading && (
              <div className="flex items-center justify-center h-64">
                <div className="text-gray-400">Loading webhooks...</div>
              </div>
            )}

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
              <div className="space-y-4">
                {webhooks.map((webhook) => (
                  <div
                    key={webhook.id}
                    className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 hover:border-cyan transition-colors"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-light">{webhook.name}</h3>
                          <span className={`text-xs px-2 py-1 rounded ${
                            webhook.status === 'active'
                              ? 'bg-green-400 bg-opacity-20 text-green-400'
                              : 'bg-gray-500 bg-opacity-20 text-gray-400'
                          }`}>
                            {webhook.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 font-mono mb-3">{webhook.url}</p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {webhook.events.map((event, idx) => (
                            <span key={idx} className="text-xs bg-cyan bg-opacity-20 text-cyan px-2 py-1 rounded">
                              {event}
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-4 text-xs text-gray-500">
                          <span>Delivery Rate: <span className="text-white">{webhook.deliveryRate}%</span></span>
                          <span>Last Triggered: <span className="text-white">{new Date(webhook.lastTriggered).toLocaleString()}</span></span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleTestWebhook(webhook.id)}
                          className="px-3 py-1 text-xs text-gray-400 border border-gray-500 border-opacity-25 rounded hover:border-cyan hover:text-white transition-colors"
                        >
                          Test
                        </button>
                        <button
                          onClick={() => handleDeleteWebhook(webhook.id)}
                          className="px-3 py-1 text-xs text-gray-400 border border-gray-500 border-opacity-25 rounded hover:border-red-400 hover:text-red-400 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
              <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
                <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  <h2 className="text-2xl font-light mb-6">Create New Webhook</h2>

                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Name</label>
                      <input
                        type="text"
                        value={newWebhook.name}
                        onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                        className="w-full bg-black border border-gray-500 border-opacity-25 rounded px-4 py-2 text-white"
                        placeholder="e.g., Slack Alerts"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Webhook URL</label>
                      <input
                        type="url"
                        value={newWebhook.url}
                        onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                        className="w-full bg-black border border-gray-500 border-opacity-25 rounded px-4 py-2 text-white font-mono text-sm"
                        placeholder="https://your-service.com/webhook"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Event Types</label>
                      <div className="space-y-2">
                        {eventTypes.map((event) => (
                          <label key={event.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={newWebhook.events.includes(event.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewWebhook({ ...newWebhook, events: [...newWebhook.events, event.id] });
                                } else {
                                  setNewWebhook({ ...newWebhook, events: newWebhook.events.filter(ev => ev !== event.id) });
                                }
                              }}
                              className="rounded"
                            />
                            <span className="text-gray-300">{event.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={handleCreateWebhook}
                      disabled={!newWebhook.name || !newWebhook.url || newWebhook.events.length === 0}
                      className="flex-1 px-6 py-3 text-sm font-light text-white bg-cyan rounded hover:bg-opacity-80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

            <div className="mt-12 bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
              <h3 className="text-lg font-light mb-4">Webhook Payload Example</h3>
              <pre className="bg-gray-500 bg-opacity-10 rounded p-4 text-xs overflow-x-auto">
                <code className="text-gray-300">{`{
  "event": "exploit.created",
  "timestamp": "2024-03-20T14:30:00Z",
  "data": {
    "id": "exploit-123",
    "protocol": "Example DEX",
    "chain": "ethereum",
    "severity": "high",
    "amount_usd": 5000000,
    "tx_hash": "0x...",
    "description": "Flash loan attack on lending pool"
  }
}`}</code>
              </pre>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
