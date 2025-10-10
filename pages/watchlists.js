import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ScrambleButton } from '../components/ScrambleButton';

export default function Watchlists() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [subscription, setSubscription] = useState(null);
  const [watchlists, setWatchlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWatchlist, setNewWatchlist] = useState({
    name: '',
    description: '',
    protocols: [],
    chains: [],
    alertThreshold: 'all'
  });

  // Check authentication and subscription tier
  useEffect(() => {
    if (status === 'loading') return;

    if (status !== 'authenticated' || !session?.user) {
      router.push('/auth/signin?redirect=/watchlists');
      return;
    }

    const checkSubscription = async () => {
      try {
        const response = await fetch(`/api/subscription/status?email=${session.user.email}`);
        const subStatus = await response.json();
        setSubscription(subStatus);

        // Check if user has Enterprise tier
        if (!subStatus.isSubscribed || subStatus.tier?.toLowerCase() !== 'enterprise') {
          setLoading(false);
          return;
        }

        // User has access - load watchlists
        loadWatchlists();
      } catch (err) {
        console.error('Failed to check subscription:', err);
        setLoading(false);
      }
    };

    checkSubscription();
  }, [status, session]);

  const loadWatchlists = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/watchlists');
      const data = await response.json();

      if (response.ok) {
        setWatchlists(data.watchlists || []);
      } else {
        console.error('Failed to load watchlists:', data.error);
        setWatchlists([]);
      }
    } catch (err) {
      console.error('Failed to load watchlists:', err);
      setWatchlists([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWatchlist = async () => {
    try {
      const response = await fetch('/api/watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol: newWatchlist.name,  // Using name as protocol for now
          chain: newWatchlist.chains[0] || null,
          notes: newWatchlist.description,
          alertOnNew: true
        })
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to create watchlist');
        return;
      }

      setShowCreateModal(false);
      setNewWatchlist({
        name: '',
        description: '',
        protocols: [],
        chains: [],
        alertThreshold: 'all'
      });
      loadWatchlists();
    } catch (err) {
      console.error('Failed to create watchlist:', err);
      alert('Failed to create watchlist');
    }
  };

  const handleDeleteWatchlist = async (id) => {
    if (!confirm('Are you sure you want to delete this watchlist?')) return;

    try {
      const response = await fetch(`/api/watchlists/${id}`, { method: 'DELETE' });

      if (response.ok || response.status === 204) {
        loadWatchlists();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete watchlist');
      }
    } catch (err) {
      console.error('Failed to delete watchlist:', err);
      alert('Failed to delete watchlist');
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

  // Check if user has access to this feature (Enterprise only)
  const hasAccess = subscription?.isSubscribed && subscription.tier?.toLowerCase() === 'enterprise';

  return (
    <div className="min-h-screen bg-black text-white">
      <Head>
        <title>Protocol Watchlists - KAMIYO</title>
        <meta name="description" content="Monitor specific protocols and receive targeted alerts" />
      </Head>

      <section className="py-10 px-5 md:px-10 mx-auto" style={{ maxWidth: '1400px' }}>
        <div className="border-dotted border-b border-cyan mb-12 pb-6">
          <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;Monitoring</p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">Protocol Watchlists</h1>
          <p className="text-gray-400 mt-4">
            Create custom watchlists to monitor specific protocols, chains, or contract addresses. Receive targeted alerts when exploits affect your watched items.
          </p>
        </div>

        {/* Access Gate - Show if user doesn't have Enterprise */}
        {!hasAccess && (
          <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-8 text-center">
            <div className="mb-6">
              <svg className="w-16 h-16 mx-auto text-cyan mb-4" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <h2 className="text-2xl font-light mb-4">Enterprise Tier Required</h2>
              <p className="text-gray-400 mb-6 max-w-2xl mx-auto">
                Protocol watchlists are an advanced monitoring feature available exclusively to Enterprise tier subscribers.
              </p>
              {subscription?.isSubscribed ? (
                <div className="mb-6">
                  <p className="text-sm text-gray-500 mb-4">
                    Your current tier: <span className="text-white capitalize">{subscription.tier}</span>
                  </p>
                  <p className="text-gray-400 mb-4">Upgrade to Enterprise tier to unlock:</p>
                  <ul className="text-sm text-gray-400 text-left max-w-md mx-auto space-y-2 mb-6">
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Unlimited custom watchlists</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Monitor specific protocols or addresses</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Targeted alert routing by watchlist</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>50 webhook endpoints for automation</span>
                    </li>
                  </ul>
                </div>
              ) : (
                <p className="text-gray-400 mb-6">
                  Subscribe to Enterprise tier to access protocol watchlists and other advanced features.
                </p>
              )}
              <ScrambleButton
                text={subscription?.isSubscribed ? 'Upgrade to Enterprise' : 'View Pricing'}
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
                <h2 className="text-xl font-light">Your Watchlists</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {watchlists.length} watchlist{watchlists.length !== 1 ? 's' : ''} active
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 text-sm font-light text-white border border-cyan rounded hover:bg-cyan hover:bg-opacity-10 transition-colors"
              >
                + Create Watchlist
              </button>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center h-64">
                <div className="text-gray-400">Loading watchlists...</div>
              </div>
            )}

            {/* Watchlists Grid */}
            {!loading && watchlists.length === 0 && (
              <div className="text-center py-16">
                <p className="text-gray-400 mb-6">No watchlists created yet</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-6 py-3 text-sm font-light text-white border border-cyan rounded hover:bg-cyan hover:bg-opacity-10 transition-colors"
                >
                  Create Your First Watchlist
                </button>
              </div>
            )}

            {!loading && watchlists.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {watchlists.map((watchlist) => (
                  <div
                    key={watchlist.id}
                    className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 hover:border-cyan transition-colors"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-light mb-1">{watchlist.name}</h3>
                        <p className="text-sm text-gray-400">{watchlist.description}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteWatchlist(watchlist.id)}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>

                    <div className="space-y-3 mb-4">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Protocols</div>
                        <div className="flex flex-wrap gap-2">
                          {watchlist.protocols.map((protocol, idx) => (
                            <span key={idx} className="text-xs bg-gray-500 bg-opacity-20 px-2 py-1 rounded">
                              {protocol}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Chains</div>
                        <div className="flex flex-wrap gap-2">
                          {watchlist.chains.map((chain, idx) => (
                            <span key={idx} className="text-xs bg-cyan bg-opacity-20 text-cyan px-2 py-1 rounded">
                              {chain}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t border-gray-500 border-opacity-25 text-xs text-gray-500">
                      <span>{watchlist.alertCount} alerts received</span>
                      <span>Created {new Date(watchlist.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
              <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
                <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-8 max-w-2xl w-full">
                  <h2 className="text-2xl font-light mb-6">Create New Watchlist</h2>

                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Name</label>
                      <input
                        type="text"
                        value={newWatchlist.name}
                        onChange={(e) => setNewWatchlist({ ...newWatchlist, name: e.target.value })}
                        className="w-full bg-black border border-gray-500 border-opacity-25 rounded px-4 py-2 text-white"
                        placeholder="e.g., DeFi Protocols"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Description</label>
                      <textarea
                        value={newWatchlist.description}
                        onChange={(e) => setNewWatchlist({ ...newWatchlist, description: e.target.value })}
                        className="w-full bg-black border border-gray-500 border-opacity-25 rounded px-4 py-2 text-white h-20"
                        placeholder="Brief description of what you're monitoring"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Alert Threshold</label>
                      <select
                        value={newWatchlist.alertThreshold}
                        onChange={(e) => setNewWatchlist({ ...newWatchlist, alertThreshold: e.target.value })}
                        className="w-full bg-black border border-gray-500 border-opacity-25 rounded px-4 py-2 text-white"
                      >
                        <option value="all">All Exploits</option>
                        <option value="critical">Critical Only</option>
                        <option value="high">High & Critical</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={handleCreateWatchlist}
                      className="flex-1 px-6 py-3 text-sm font-light text-white bg-cyan rounded hover:bg-opacity-80 transition-colors"
                    >
                      Create Watchlist
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
