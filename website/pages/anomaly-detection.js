import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ScrambleButton } from '../components/ScrambleButton';

export default function AnomalyDetection() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [subscription, setSubscription] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated' || !session?.user) {
      router.push('/auth/signin?redirect=/anomaly-detection');
      return;
    }

    const checkSubscription = async () => {
      try {
        const response = await fetch(`/api/subscription/status?email=${session.user.email}`);
        const subStatus = await response.json();
        setSubscription(subStatus);

        if (!subStatus.isSubscribed || subStatus.tier?.toLowerCase() !== 'enterprise') {
          setLoading(false);
          return;
        }

        loadAnomalies();
      } catch (err) {
        console.error('Failed to check subscription:', err);
        setLoading(false);
      }
    };

    checkSubscription();
  }, [status, session]);

  const loadAnomalies = async () => {
    setLoading(true);
    try {
      // Demo data
      setAnomalies([
        {
          id: 'anom-1',
          type: 'unusual_frequency',
          severity: 'high',
          title: 'Spike in Reentrancy Attacks',
          description: '300% increase in reentrancy-based exploits detected in the last 48 hours',
          affectedChains: ['Ethereum', 'Arbitrum'],
          detectedAt: '2024-03-20T14:30:00Z',
          metrics: { baseline: 3, current: 12, deviation: 3.2 }
        },
        {
          id: 'anom-2',
          type: 'new_pattern',
          severity: 'critical',
          title: 'Novel Attack Vector Detected',
          description: 'Previously unseen exploit pattern targeting bridge contracts',
          affectedChains: ['Polygon', 'BSC'],
          detectedAt: '2024-03-20T10:15:00Z',
          metrics: { confidence: 0.94, exploitCount: 5 }
        },
        {
          id: 'anom-3',
          type: 'unusual_loss',
          severity: 'high',
          title: 'Abnormally High Loss Amount',
          description: 'Single exploit with $45M loss detected - 10x above 90-day average',
          affectedChains: ['Ethereum'],
          detectedAt: '2024-03-19T22:45:00Z',
          metrics: { amount: 45000000, avgLoss: 4200000, deviation: 9.7 }
        },
        {
          id: 'anom-4',
          type: 'coordinated_attack',
          severity: 'critical',
          title: 'Coordinated Multi-Chain Attack',
          description: 'Similar exploits executed simultaneously across 4 chains within 10 minutes',
          affectedChains: ['Ethereum', 'BSC', 'Polygon', 'Arbitrum'],
          detectedAt: '2024-03-19T18:20:00Z',
          metrics: { chains: 4, timeWindow: 600, totalLoss: 12000000 }
        }
      ]);
    } catch (err) {
      console.error('Failed to load anomalies:', err);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || !subscription) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const hasAccess = subscription?.isSubscribed && subscription.tier?.toLowerCase() === 'enterprise';

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'text-[#ff008d] bg-[#ff008d]';
      case 'high': return 'text-[#cc11f0] bg-[#cc11f0]';
      case 'medium': return 'text-[#f96363] bg-[#f96363]';
      case 'low': return 'text-[#fee801] bg-[#fee801]';
      default: return 'text-gray-400 bg-gray-400';
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Head>
        <title>Anomaly Detection - KAMIYO</title>
        <meta name="description" content="AI-powered detection of unusual exploit patterns and emerging threats" />
      </Head>

      <section className="py-10 px-5 md:px-10 mx-auto" style={{ maxWidth: '1400px' }}>
        <div className="border-dotted border-b border-cyan mb-12 pb-6">
          <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;Intelligence</p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">Anomaly Detection</h1>
          <p className="text-gray-400 mt-4">
            AI-powered system that identifies unusual exploit patterns, frequency spikes, novel attack vectors, and coordinated threats in real-time.
          </p>
        </div>

        {!hasAccess && (
          <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-8 text-center">
            <div className="mb-6">
              <svg className="w-16 h-16 mx-auto text-cyan mb-4" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <h2 className="text-2xl font-light mb-4">Enterprise Tier Required</h2>
              <p className="text-gray-400 mb-6 max-w-2xl mx-auto">
                Anomaly detection is a premium intelligence feature available exclusively to Enterprise tier subscribers.
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
                      <span>Real-time anomaly detection</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Novel attack vector identification</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Coordinated threat detection</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Priority alerts for emerging threats</span>
                    </li>
                  </ul>
                </div>
              ) : (
                <p className="text-gray-400 mb-6">
                  Subscribe to Enterprise tier to access anomaly detection and other advanced features.
                </p>
              )}
              <ScrambleButton
                text={subscription?.isSubscribed ? 'Upgrade to Enterprise' : 'View Pricing'}
                onClick={() => router.push('/pricing')}
              />
            </div>
          </div>
        )}

        {hasAccess && (
          <>
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-xl font-light">Recent Anomalies</h2>
                <p className="text-sm text-gray-400 mt-1">{anomalies.length} anomalies detected</p>
              </div>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="bg-black border border-gray-500 border-opacity-25 rounded px-3 py-2 text-sm text-white"
              >
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
            </div>

            {loading && (
              <div className="flex items-center justify-center h-64">
                <div className="text-gray-400">Analyzing threat patterns...</div>
              </div>
            )}

            {!loading && (
              <div className="space-y-4">
                {anomalies.map((anomaly) => (
                  <div
                    key={anomaly.id}
                    className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 hover:border-cyan transition-colors"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${getSeverityColor(anomaly.severity)} bg-opacity-100`}></span>
                          <h3 className="text-lg font-light">{anomaly.title}</h3>
                          <span className={`text-xs ${getSeverityColor(anomaly.severity)} bg-opacity-20 px-2 py-1 rounded uppercase`}>
                            {anomaly.severity}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 mb-3">{anomaly.description}</p>
                        <div className="flex flex-wrap gap-2">
                          {anomaly.affectedChains.map((chain, idx) => (
                            <span key={idx} className="text-xs bg-cyan bg-opacity-20 text-cyan px-2 py-1 rounded">
                              {chain}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        {new Date(anomaly.detectedAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-500 border-opacity-25">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        {Object.entries(anomaly.metrics).map(([key, value]) => (
                          <div key={key}>
                            <div className="text-gray-500 text-xs capitalize mb-1">{key.replace('_', ' ')}</div>
                            <div className="text-white">
                              {typeof value === 'number' && value > 1000000
                                ? `$${(value / 1000000).toFixed(1)}M`
                                : typeof value === 'number' && value < 1
                                ? `${(value * 100).toFixed(0)}%`
                                : value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="border border-gray-500 border-opacity-25 rounded-lg p-6">
                <h3 className="text-lg font-light mb-2 gradient-text">Statistical Analysis</h3>
                <p className="text-sm text-gray-400">
                  Baseline models detect deviations in exploit frequency, loss amounts, and attack patterns.
                </p>
              </div>
              <div className="border border-gray-500 border-opacity-25 rounded-lg p-6">
                <h3 className="text-lg font-light mb-2 gradient-text">Machine Learning</h3>
                <p className="text-sm text-gray-400">
                  AI models identify novel attack vectors and predict emerging threat categories.
                </p>
              </div>
              <div className="border border-gray-500 border-opacity-25 rounded-lg p-6">
                <h3 className="text-lg font-light mb-2 gradient-text">Early Warning</h3>
                <p className="text-sm text-gray-400">
                  Get alerted to coordinated attacks and unusual patterns before they become widespread.
                </p>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
