import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ScrambleButton } from '../components/ScrambleButton';

export default function PatternClustering() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [subscription, setSubscription] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [filters, setFilters] = useState({
    timeRange: '90d',
    minClusterSize: 3,
    similarityThreshold: 0.7
  });

  // Check authentication and subscription tier
  useEffect(() => {
    if (status === 'loading') return;

    if (status !== 'authenticated' || !session?.user) {
      router.push('/auth/signin?redirect=/pattern-clustering');
      return;
    }

    const checkSubscription = async () => {
      try {
        const response = await fetch(`/api/subscription/status?email=${session.user.email}`);
        const subStatus = await response.json();
        setSubscription(subStatus);

        // Check if user has Team or Enterprise tier
        const allowedTiers = ['team', 'enterprise'];
        if (!subStatus.isSubscribed || !allowedTiers.includes(subStatus.tier?.toLowerCase())) {
          setLoading(false);
          return;
        }

        // User has access - load clusters
        loadClusters();
      } catch (err) {
        console.error('Failed to check subscription:', err);
        setLoading(false);
      }
    };

    checkSubscription();
  }, [status, session]);

  useEffect(() => {
    // Reload clusters when filters change
    if (subscription?.isSubscribed && ['team', 'enterprise'].includes(subscription.tier?.toLowerCase())) {
      loadClusters();
    }
  }, [filters]);

  const loadClusters = async () => {
    setLoading(true);
    try {
      // TODO: Replace with actual API call
      // const response = await fetch(`/api/analysis/patterns?${new URLSearchParams(filters)}`);
      // const data = await response.json();
      // setClusters(data.clusters);

      // Demo data for now
      setClusters([
        {
          id: 'cluster-1',
          name: 'Reentrancy Attacks',
          patternType: 'vulnerability',
          exploitCount: 24,
          totalLoss: 45000000,
          avgSimilarity: 0.89,
          chains: ['Ethereum', 'BSC', 'Polygon'],
          recentExploits: [
            { name: 'Uniswap Fork Attack', date: '2024-03-15', loss: 8000000 },
            { name: 'DEX Exploit', date: '2024-03-10', loss: 5200000 },
            { name: 'Lending Protocol', date: '2024-03-05', loss: 3500000 }
          ],
          commonCharacteristics: [
            'External call before state update',
            'Missing nonReentrant modifier',
            'Lack of checks-effects-interactions pattern'
          ]
        },
        {
          id: 'cluster-2',
          name: 'Flash Loan Exploits',
          patternType: 'attack_vector',
          exploitCount: 18,
          totalLoss: 32000000,
          avgSimilarity: 0.85,
          chains: ['Ethereum', 'Arbitrum', 'Optimism'],
          recentExploits: [
            { name: 'AMM Price Manipulation', date: '2024-03-18', loss: 6500000 },
            { name: 'Oracle Attack', date: '2024-03-12', loss: 4800000 },
            { name: 'Arbitrage Exploit', date: '2024-03-08', loss: 3200000 }
          ],
          commonCharacteristics: [
            'Price oracle manipulation',
            'Atomic transaction arbitrage',
            'Liquidity pool exploitation'
          ]
        },
        {
          id: 'cluster-3',
          name: 'Access Control Failures',
          patternType: 'vulnerability',
          exploitCount: 15,
          totalLoss: 28000000,
          avgSimilarity: 0.92,
          chains: ['Ethereum', 'BSC'],
          recentExploits: [
            { name: 'Bridge Compromise', date: '2024-03-14', loss: 12000000 },
            { name: 'Admin Key Exploit', date: '2024-03-06', loss: 8500000 },
            { name: 'Ownership Transfer', date: '2024-02-28', loss: 4200000 }
          ],
          commonCharacteristics: [
            'Missing access control modifiers',
            'Unprotected initialization functions',
            'Weak ownership validation'
          ]
        },
        {
          id: 'cluster-4',
          name: 'Integer Overflow/Underflow',
          patternType: 'vulnerability',
          exploitCount: 12,
          totalLoss: 18000000,
          avgSimilarity: 0.88,
          chains: ['Ethereum', 'Polygon', 'Arbitrum'],
          recentExploits: [
            { name: 'Token Minting Exploit', date: '2024-03-16', loss: 6000000 },
            { name: 'Balance Manipulation', date: '2024-03-09', loss: 5500000 },
            { name: 'Reward Pool Drain', date: '2024-03-02', loss: 3800000 }
          ],
          commonCharacteristics: [
            'Arithmetic operations without SafeMath',
            'Unchecked balance calculations',
            'Overflow in reward computations'
          ]
        }
      ]);
    } catch (err) {
      console.error('Failed to load clusters:', err);
    } finally {
      setLoading(false);
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

  // Check if user has access to this feature
  const hasAccess = subscription?.isSubscribed && ['team', 'enterprise'].includes(subscription.tier?.toLowerCase());

  return (
    <div className="min-h-screen bg-black text-white">
      <Head>
        <title>Pattern Clustering - KAMIYO</title>
        <meta name="description" content="Identify common attack patterns and vulnerability clusters across exploits" />
      </Head>

      <section className="py-10 px-5 md:px-10 mx-auto" style={{ maxWidth: '1400px' }}>
        <div className="border-dotted border-b border-cyan mb-12 pb-6">
          <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;Analysis</p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">Pattern Clustering</h1>
          <p className="text-gray-400 mt-4">
            Machine learning-powered analysis that groups exploits by attack patterns, vulnerability types, and common characteristics. Identify systemic risks across the ecosystem.
          </p>
        </div>

        {/* Access Gate - Show if user doesn't have Team/Enterprise */}
        {!hasAccess && (
          <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-8 text-center">
            <div className="mb-6">
              <svg className="w-16 h-16 mx-auto text-cyan mb-4" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <h2 className="text-2xl font-light mb-4">Team Tier Required</h2>
              <p className="text-gray-400 mb-6 max-w-2xl mx-auto">
                Pattern clustering is an advanced analysis feature available exclusively to Team and Enterprise tier subscribers.
              </p>
              {subscription?.isSubscribed ? (
                <div className="mb-6">
                  <p className="text-sm text-gray-500 mb-4">
                    Your current tier: <span className="text-white capitalize">{subscription.tier}</span>
                  </p>
                  <p className="text-gray-400 mb-4">Upgrade to Team tier to unlock:</p>
                  <ul className="text-sm text-gray-400 text-left max-w-md mx-auto space-y-2 mb-6">
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>ML-powered pattern recognition</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Vulnerability clustering by type</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Common characteristic identification</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Fork detection analysis</span>
                    </li>
                  </ul>
                </div>
              ) : (
                <p className="text-gray-400 mb-6">
                  Subscribe to Team tier to access pattern clustering and other advanced features.
                </p>
              )}
              <ScrambleButton
                text={subscription?.isSubscribed ? 'Upgrade to Team' : 'View Pricing'}
                onClick={() => router.push('/pricing')}
              />
            </div>
          </div>
        )}

        {/* Main Content - Only show if user has access */}
        {hasAccess && (
          <>
            {/* Filters */}
            <div className="mb-8 flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400">Time Range:</label>
                <select
                  value={filters.timeRange}
                  onChange={(e) => setFilters({ ...filters, timeRange: e.target.value })}
                  className="bg-black border border-gray-500 border-opacity-25 rounded px-3 py-2 text-sm text-white"
                >
                  <option value="30d">Last 30 Days</option>
                  <option value="90d">Last 90 Days</option>
                  <option value="180d">Last 6 Months</option>
                  <option value="365d">Last Year</option>
                  <option value="all">All Time</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400">Min Cluster Size:</label>
                <select
                  value={filters.minClusterSize}
                  onChange={(e) => setFilters({ ...filters, minClusterSize: parseInt(e.target.value) })}
                  className="bg-black border border-gray-500 border-opacity-25 rounded px-3 py-2 text-sm text-white"
                >
                  <option value="2">2+ exploits</option>
                  <option value="3">3+ exploits</option>
                  <option value="5">5+ exploits</option>
                  <option value="10">10+ exploits</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400">Similarity:</label>
                <select
                  value={filters.similarityThreshold}
                  onChange={(e) => setFilters({ ...filters, similarityThreshold: parseFloat(e.target.value) })}
                  className="bg-black border border-gray-500 border-opacity-25 rounded px-3 py-2 text-sm text-white"
                >
                  <option value="0.6">60%+</option>
                  <option value="0.7">70%+</option>
                  <option value="0.8">80%+</option>
                  <option value="0.9">90%+</option>
                </select>
              </div>

              <button
                onClick={loadClusters}
                className="px-4 py-2 text-sm font-light text-white border border-gray-500 border-opacity-25 rounded hover:border-cyan transition-colors"
              >
                Refresh Data
              </button>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center h-64">
                <div className="text-gray-400">Analyzing patterns...</div>
              </div>
            )}

            {/* Clusters Grid */}
            {!loading && (
              <div className="space-y-6">
                {clusters.map((cluster) => (
                  <div
                    key={cluster.id}
                    className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 hover:border-cyan transition-colors cursor-pointer"
                    onClick={() => setSelectedCluster(cluster.id === selectedCluster ? null : cluster.id)}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-light mb-2">{cluster.name}</h3>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <span className="capitalize">{cluster.patternType.replace('_', ' ')}</span>
                          <span>•</span>
                          <span>{cluster.exploitCount} exploits</span>
                          <span>•</span>
                          <span>${(cluster.totalLoss / 1000000).toFixed(1)}M total loss</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-light gradient-text">{Math.round(cluster.avgSimilarity * 100)}%</div>
                        <div className="text-xs text-gray-500">avg similarity</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {cluster.chains.map((chain, idx) => (
                        <span key={idx} className="text-xs bg-cyan bg-opacity-20 text-cyan px-2 py-1 rounded">
                          {chain}
                        </span>
                      ))}
                    </div>

                    {selectedCluster === cluster.id && (
                      <div className="mt-6 pt-6 border-t border-gray-500 border-opacity-25 space-y-6">
                        {/* Common Characteristics */}
                        <div>
                          <h4 className="text-sm font-light text-gray-300 mb-3">Common Characteristics</h4>
                          <ul className="space-y-2">
                            {cluster.commonCharacteristics.map((char, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-sm text-gray-400">
                                <svg className="w-4 h-4 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                                <span>{char}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Recent Exploits */}
                        <div>
                          <h4 className="text-sm font-light text-gray-300 mb-3">Recent Exploits in Cluster</h4>
                          <div className="space-y-2">
                            {cluster.recentExploits.map((exploit, idx) => (
                              <div key={idx} className="flex justify-between items-center p-3 bg-gray-500 bg-opacity-5 rounded">
                                <div>
                                  <div className="text-sm text-white">{exploit.name}</div>
                                  <div className="text-xs text-gray-500">{new Date(exploit.date).toLocaleDateString()}</div>
                                </div>
                                <div className="text-sm text-magenta">${(exploit.loss / 1000000).toFixed(1)}M</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Info Cards */}
            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="border border-gray-500 border-opacity-25 rounded-lg p-6">
                <h3 className="text-lg font-light mb-2 gradient-text">Pattern Recognition</h3>
                <p className="text-sm text-gray-400">
                  Machine learning algorithms identify similar attack vectors and vulnerability types across different exploits.
                </p>
              </div>
              <div className="border border-gray-500 border-opacity-25 rounded-lg p-6">
                <h3 className="text-lg font-light mb-2 gradient-text">Risk Assessment</h3>
                <p className="text-sm text-gray-400">
                  Understand which vulnerability patterns are most prevalent and costly in the current threat landscape.
                </p>
              </div>
              <div className="border border-gray-500 border-opacity-25 rounded-lg p-6">
                <h3 className="text-lg font-light mb-2 gradient-text">Proactive Defense</h3>
                <p className="text-sm text-gray-400">
                  Use pattern insights to audit your contracts for similar vulnerabilities before they're exploited.
                </p>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
