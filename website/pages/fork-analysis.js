import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { ScrambleButton } from '../components/ScrambleButton';
import { hasMinimumTier, TierName } from '../lib/tiers';

// Dynamically import the graph component (client-side only due to D3)
const ForkGraphVisualization = dynamic(
  () => import('../frontend/src/components/analysis/ForkGraphVisualization'),
  { ssr: false }
);

export default function ForkAnalysis() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [subscription, setSubscription] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedExploit, setSelectedExploit] = useState(null);
  const [filters, setFilters] = useState({
    chain: 'all',
    minSimilarity: 0.5,
  });

  // Check authentication and subscription tier
  useEffect(() => {
    if (status === 'loading') return;

    if (status !== 'authenticated' || !session?.user) {
      router.push('/auth/signin?redirect=/fork-analysis');
      return;
    }

    const checkSubscription = async () => {
      try {
        const response = await fetch(`/api/subscription/status?email=${session.user.email}`);
        const subStatus = await response.json();
        setSubscription(subStatus);

        // Check if user has Team or Enterprise tier
        if (!subStatus.isSubscribed || !hasMinimumTier(subStatus.tier, TierName.TEAM)) {
          // User doesn't have access - they'll see the upgrade notice
          setLoading(false);
          return;
        }

        // User has access - load the data
        loadForkData();
      } catch (err) {
        console.error('Failed to check subscription:', err);
        setLoading(false);
      }
    };

    checkSubscription();
  }, [status, session]);

  useEffect(() => {
    // Reload data when filters change (only if user has access)
    if (subscription?.isSubscribed && hasMinimumTier(subscription.tier, TierName.TEAM)) {
      loadForkData();
    }
  }, [filters]);

  const loadForkData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch fork families from API v2
      const params = new URLSearchParams({
        min_similarity: filters.minSimilarity.toString(),
      });

      if (filters.chain !== 'all') {
        params.append('chain', filters.chain);
      }

      const response = await fetch(`http://localhost:8000/api/v2/analysis/fork-families?${params}`);

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();

      // Transform API data to graph format
      const graphData = transformToGraphData(data.fork_families || []);
      setGraphData(graphData);
    } catch (err) {
      console.error('Failed to load fork data:', err);
      setError(err.message);

      // Use demo data as fallback
      setGraphData(getDemoData());
    } finally {
      setLoading(false);
    }
  };

  const transformToGraphData = (forkFamilies) => {
    const nodes = [];
    const links = [];
    const nodeIds = new Set();

    forkFamilies.forEach((family, familyIndex) => {
      // Add root contract as a node
      const rootId = family.root_contract || `root-${familyIndex}`;

      if (!nodeIds.has(rootId)) {
        nodes.push({
          id: rootId,
          label: family.root_exploit_name || `Contract ${rootId.substring(0, 8)}`,
          contract_address: rootId,
          chain: family.chain || 'Unknown',
          severity: family.root_severity || 'medium',
          amount_usd: family.total_loss_usd || 0,
          date: family.first_exploit_date || new Date().toISOString(),
          is_root: true,
        });
        nodeIds.add(rootId);
      }

      // Add related contracts
      (family.related_contracts || []).forEach((related, idx) => {
        const nodeId = related.contract_address || `node-${familyIndex}-${idx}`;

        if (!nodeIds.has(nodeId)) {
          nodes.push({
            id: nodeId,
            label: related.exploit_name || `Exploit ${idx + 1}`,
            exploit_id: related.exploit_id,
            contract_address: nodeId,
            chain: related.chain || family.chain || 'Unknown',
            severity: related.severity || 'medium',
            amount_usd: related.amount_usd || 0,
            date: related.date || new Date().toISOString(),
            is_root: false,
          });
          nodeIds.add(nodeId);
        }

        // Add link from root to this contract
        links.push({
          source: rootId,
          target: nodeId,
          similarity_score: related.similarity_score || 0.7,
          relationship_type: related.relationship_type || 'similar_bytecode',
        });
      });
    });

    return { nodes, links };
  };

  const getDemoData = () => {
    // Demo data for visualization when API is unavailable
    return {
      nodes: [
        {
          id: 'root-1',
          label: 'Uniswap V2 Fork',
          contract_address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
          chain: 'Ethereum',
          severity: 'critical',
          amount_usd: 5000000,
          date: '2024-01-15',
          is_root: true,
        },
        {
          id: 'exploit-1',
          label: 'SushiSwap Exploit',
          contract_address: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
          chain: 'Ethereum',
          severity: 'high',
          amount_usd: 3200000,
          date: '2024-02-01',
          is_root: false,
        },
        {
          id: 'exploit-2',
          label: 'PancakeSwap Exploit',
          contract_address: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
          chain: 'BSC',
          severity: 'high',
          amount_usd: 2800000,
          date: '2024-02-10',
          is_root: false,
        },
        {
          id: 'exploit-3',
          label: 'QuickSwap Exploit',
          contract_address: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
          chain: 'Polygon',
          severity: 'medium',
          amount_usd: 1500000,
          date: '2024-02-15',
          is_root: false,
        },
        {
          id: 'root-2',
          label: 'Compound Fork',
          contract_address: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
          chain: 'Ethereum',
          severity: 'critical',
          amount_usd: 8000000,
          date: '2024-01-20',
          is_root: true,
        },
        {
          id: 'exploit-4',
          label: 'Venus Protocol',
          contract_address: '0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63',
          chain: 'BSC',
          severity: 'high',
          amount_usd: 4500000,
          date: '2024-02-05',
          is_root: false,
        },
      ],
      links: [
        { source: 'root-1', target: 'exploit-1', similarity_score: 0.95, relationship_type: 'direct_fork' },
        { source: 'root-1', target: 'exploit-2', similarity_score: 0.92, relationship_type: 'direct_fork' },
        { source: 'root-1', target: 'exploit-3', similarity_score: 0.88, relationship_type: 'similar_bytecode' },
        { source: 'root-2', target: 'exploit-4', similarity_score: 0.94, relationship_type: 'direct_fork' },
        { source: 'exploit-1', target: 'exploit-2', similarity_score: 0.75, relationship_type: 'same_pattern' },
      ],
    };
  };

  const handleNodeClick = (node) => {
    setSelectedExploit(node);
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
  const hasAccess = subscription?.isSubscribed && hasMinimumTier(subscription.tier, TierName.TEAM);
  const hasGraphVisualization = subscription?.tier && hasMinimumTier(subscription.tier, TierName.ENTERPRISE);

  return (
    <div className="min-h-screen bg-black text-white">
      <Head>
        <title>Fork Analysis - KAMIYO</title>
        <meta name="description" content="Interactive fork detection and contract relationship analysis" />
      </Head>

      <section className="py-10 px-5 md:px-1 mx-auto" style={{ maxWidth: '1400px' }}>
        {/* Beta Warning Banner */}
        <div className="bg-yellow-900 bg-opacity-20 border border-yellow-500 border-opacity-40 rounded-lg p-4 mb-8">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-yellow-500 font-medium mb-1">⚠️ Beta Feature - Demo Data</h3>
              <p className="text-sm text-gray-300">
                This fork detection analysis is currently in beta and displays demo/sample data for visualization purposes.
                Real bytecode analysis and fork detection features are under active development.
              </p>
            </div>
          </div>
        </div>

        <div className="border-dotted border-b border-cyan mb-12 pb-6">
          <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;Analysis</p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">Fork Detection & Relationship Mapping <span className="text-yellow-500 text-xl">[BETA]</span></h1>
          <p className="text-gray-400 mt-4">
            Visualize relationships between forked contracts and exploit families. Identify systemic vulnerabilities across the DeFi ecosystem.
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
                Fork detection and relationship mapping is an advanced analysis feature available exclusively to Team and Enterprise tier subscribers.
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
                      <span>Interactive fork graph visualization</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Bytecode similarity analysis</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Pattern clustering and family trees</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>5 webhook endpoints + Slack integration</span>
                    </li>
                  </ul>
                </div>
              ) : (
                <p className="text-gray-400 mb-6">
                  Subscribe to Team tier to access fork detection analysis and other advanced features.
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
            <label className="text-sm text-gray-400">Chain:</label>
            <select
              value={filters.chain}
              onChange={(e) => setFilters({ ...filters, chain: e.target.value })}
              className="bg-black border border-gray-500 border-opacity-25 rounded px-3 py-2 text-sm text-white"
            >
              <option value="all">All Chains</option>
              <option value="ethereum">Ethereum</option>
              <option value="bsc">BSC</option>
              <option value="polygon">Polygon</option>
              <option value="arbitrum">Arbitrum</option>
              <option value="optimism">Optimism</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Min Similarity:</label>
            <select
              value={filters.minSimilarity}
              onChange={(e) => setFilters({ ...filters, minSimilarity: parseFloat(e.target.value) })}
              className="bg-black border border-gray-500 border-opacity-25 rounded px-3 py-2 text-sm text-white"
            >
              <option value="0.5">50%</option>
              <option value="0.6">60%</option>
              <option value="0.7">70%</option>
              <option value="0.8">80%</option>
              <option value="0.9">90%</option>
            </select>
          </div>

          <button
            onClick={loadForkData}
            className="px-4 py-2 text-sm font-light text-white border border-gray-500 border-opacity-25 rounded hover:border-cyan transition-colors"
          >
            Refresh Data
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center h-96">
            <div className="text-gray-400">Loading fork analysis data...</div>
          </div>
        )}

        {/* Error State - Hidden, using demo data seamlessly */}
        {/* {error && !loading && (
          <div className="bg-black border border-red-500 border-opacity-25 rounded-lg p-4 mb-8">
            <div className="text-red-400 mb-2">Failed to load data from API</div>
            <div className="text-sm text-gray-500">Using demo data for visualization. Error: {error}</div>
          </div>
        )} */}

        {/* Graph Visualization - Enterprise Only */}
        {!loading && graphData && hasGraphVisualization && (
          <div className="mb-8">
            <ForkGraphVisualization
              data={graphData}
              width={1200}
              height={800}
              onNodeClick={handleNodeClick}
            />
          </div>
        )}

        {/* Table View - Team Tier */}
        {!loading && graphData && !hasGraphVisualization && (
          <>
            <div className="bg-black border border-cyan border-opacity-25 rounded-lg p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-light mb-2">Fork Detection Analysis</h3>
                  <p className="text-sm text-gray-400">Upgrade to Enterprise for interactive graph visualization</p>
                </div>
                <ScrambleButton
                  text="Upgrade to Enterprise"
                  onClick={() => router.push('/pricing')}
                />
              </div>
            </div>

            <div className="border border-gray-500 border-opacity-25 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-500 bg-opacity-10">
                  <tr>
                    <th className="text-left p-3 text-gray-400 font-light">Contract</th>
                    <th className="text-left p-3 text-gray-400 font-light">Chain</th>
                    <th className="text-left p-3 text-gray-400 font-light">Type</th>
                    <th className="text-left p-3 text-gray-400 font-light">Loss (USD)</th>
                    <th className="text-left p-3 text-gray-400 font-light">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-500 divide-opacity-25">
                  {graphData.nodes.map((node) => (
                    <tr key={node.id} className="hover:bg-gray-500 hover:bg-opacity-5 cursor-pointer" onClick={() => handleNodeClick(node)}>
                      <td className="p-3 text-white">{node.label}</td>
                      <td className="p-3 text-gray-400">{node.chain}</td>
                      <td className="p-3">
                        {node.is_root ? (
                          <span className="text-cyan text-xs">Root</span>
                        ) : (
                          <span className="text-gray-400 text-xs">Fork</span>
                        )}
                      </td>
                      <td className="p-3 text-gray-400">${node.amount_usd.toLocaleString()}</td>
                      <td className="p-3 text-gray-400">{new Date(node.date).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Selected Exploit Details */}
        {selectedExploit && (
          <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 mt-8">
            <h3 className="text-xl font-light mb-4">Exploit Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-gray-500 mb-1">Name</div>
                <div className="text-white">{selectedExploit.label}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1">Chain</div>
                <div className="text-white">{selectedExploit.chain}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1">Contract Address</div>
                <div className="text-white font-mono text-xs">{selectedExploit.contract_address}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1">Severity</div>
                <div className="text-white capitalize">{selectedExploit.severity}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1">Loss Amount</div>
                <div className="text-white">${selectedExploit.amount_usd.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1">Date</div>
                <div className="text-white">{new Date(selectedExploit.date).toLocaleDateString()}</div>
              </div>
              {selectedExploit.is_root && (
                <div className="col-span-2">
                  <div className="inline-block bg-cyan bg-opacity-20 text-cyan px-3 py-1 rounded text-xs">
                    Root Contract (Original Vulnerability)
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Feature Info */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border border-gray-500 border-opacity-25 rounded-lg p-6">
            <h3 className="text-lg font-light mb-2 gradient-text">Bytecode Analysis</h3>
            <p className="text-sm text-gray-400">
              Advanced bytecode comparison detects structural similarities between contracts, even without source code access.
            </p>
          </div>
          <div className="border border-gray-500 border-opacity-25 rounded-lg p-6">
            <h3 className="text-lg font-light mb-2 gradient-text">Pattern Recognition</h3>
            <p className="text-sm text-gray-400">
              Machine learning identifies common attack vectors and shared exploit characteristics across protocols.
            </p>
          </div>
          <div className="border border-gray-500 border-opacity-25 rounded-lg p-6">
            <h3 className="text-lg font-light mb-2 gradient-text">Family Trees</h3>
            <p className="text-sm text-gray-400">
              Track how vulnerabilities propagate through the ecosystem when developers fork vulnerable code.
            </p>
          </div>
        </div>

        </>
        )}
      </section>
    </div>
  );
}
