import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ScrambleButton } from '../components/ScrambleButton';

export default function FeatureExtraction() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedFeature, setSelectedFeature] = useState('bytecode');
  const [apiKey, setApiKey] = useState('sk_live_••••••••••••••••');

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated' || !session?.user) {
      router.push('/auth/signin?redirect=/feature-extraction');
      return;
    }

    const checkSubscription = async () => {
      try {
        const response = await fetch(`/api/subscription/status?email=${session.user.email}`);
        const subStatus = await response.json();
        setSubscription(subStatus);
        setLoading(false);
      } catch (err) {
        console.error('Failed to check subscription:', err);
        setLoading(false);
      }
    };

    checkSubscription();
  }, [status, session]);

  if (status === 'loading' || !subscription) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const hasAccess = subscription?.isSubscribed && ['pro', 'team', 'enterprise'].includes(subscription.tier?.toLowerCase());

  const features = [
    {
      id: 'bytecode',
      name: 'Bytecode Analysis',
      endpoint: '/api/v2/features/bytecode',
      description: 'Extract bytecode patterns, opcodes, and structural features from contract addresses',
      example: {
        request: '{"contract_address": "0x...", "chain": "ethereum"}',
        response: '{"opcodes": [...], "patterns": [...], "similarity_score": 0.92}'
      }
    },
    {
      id: 'transaction',
      name: 'Transaction Patterns',
      endpoint: '/api/v2/features/transactions',
      description: 'Analyze transaction patterns, gas usage, and call traces for exploit detection',
      example: {
        request: '{"tx_hash": "0x...", "chain": "ethereum"}',
        response: '{"gas_pattern": {...}, "call_trace": [...], "risk_score": 0.78}'
      }
    },
    {
      id: 'contract',
      name: 'Contract Metadata',
      endpoint: '/api/v2/features/contracts',
      description: 'Extract contract metadata, verification status, and deployment information',
      example: {
        request: '{"address": "0x...", "chain": "ethereum"}',
        response: '{"verified": true, "compiler": "0.8.20", "optimizer": true}'
      }
    }
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <Head>
        <title>Feature Extraction API - KAMIYO</title>
        <meta name="description" content="Programmatic access to exploit data features and analysis" />
      </Head>

      <section className="py-10 px-5 md:px-10 mx-auto" style={{ maxWidth: '1400px' }}>
        <div className="border-dotted border-b border-cyan mb-12 pb-6">
          <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;API Access</p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">Feature Extraction API</h1>
          <p className="text-gray-400 mt-4">
            Programmatic access to extract contract bytecode patterns, transaction features, and exploit characteristics for custom analysis and ML models.
          </p>
        </div>

        {!hasAccess && (
          <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-8 text-center">
            <div className="mb-6">
              <svg className="w-16 h-16 mx-auto text-cyan mb-4" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <h2 className="text-2xl font-light mb-4">Pro Tier Required</h2>
              <p className="text-gray-400 mb-6 max-w-2xl mx-auto">
                Feature extraction API access is available to Pro, Team, and Enterprise tier subscribers.
              </p>
              {subscription?.isSubscribed ? (
                <div className="mb-6">
                  <p className="text-sm text-gray-500 mb-4">
                    Your current tier: <span className="text-white capitalize">{subscription.tier}</span>
                  </p>
                </div>
              ) : null}
              <ScrambleButton
                text={subscription?.isSubscribed ? 'Upgrade to Pro' : 'View Pricing'}
                onClick={() => router.push('/pricing')}
              />
            </div>
          </div>
        )}

        {hasAccess && (
          <>
            {/* API Key Section */}
            <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 mb-8">
              <h2 className="text-xl font-light mb-4">Your API Key</h2>
              <div className="flex gap-4">
                <input
                  type="text"
                  value={apiKey}
                  readOnly
                  className="flex-1 bg-gray-500 bg-opacity-10 border border-gray-500 border-opacity-25 rounded px-4 py-2 text-white font-mono text-sm"
                />
                <button className="px-4 py-2 text-sm font-light text-white border border-cyan rounded hover:bg-cyan hover:bg-opacity-10 transition-colors">
                  Regenerate
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">Keep your API key secure. It provides full access to your account.</p>
            </div>

            {/* Feature Tabs */}
            <div className="mb-8">
              <div className="flex border-b border-gray-500 border-opacity-25 mb-6">
                {features.map((feature) => (
                  <button
                    key={feature.id}
                    onClick={() => setSelectedFeature(feature.id)}
                    className={`px-4 py-2 text-sm font-light transition-colors ${
                      selectedFeature === feature.id
                        ? 'text-white border-b-2 border-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {feature.name}
                  </button>
                ))}
              </div>

              {features.filter(f => f.id === selectedFeature).map((feature) => (
                <div key={feature.id}>
                  <div className="mb-6">
                    <h3 className="text-lg font-light mb-2">{feature.name}</h3>
                    <p className="text-sm text-gray-400 mb-4">{feature.description}</p>
                    <div className="bg-gray-500 bg-opacity-10 rounded px-4 py-2 font-mono text-sm text-cyan">
                      POST {feature.endpoint}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-light text-gray-300 mb-2">Request Example</h4>
                      <pre className="bg-black border border-gray-500 border-opacity-25 rounded p-4 text-xs overflow-x-auto">
                        <code className="text-gray-300">{feature.example.request}</code>
                      </pre>
                    </div>
                    <div>
                      <h4 className="text-sm font-light text-gray-300 mb-2">Response Example</h4>
                      <pre className="bg-black border border-gray-500 border-opacity-25 rounded p-4 text-xs overflow-x-auto">
                        <code className="text-gray-300">{feature.example.response}</code>
                      </pre>
                    </div>
                  </div>

                  <div className="mt-6 bg-cyan bg-opacity-10 border border-cyan border-opacity-25 rounded p-4">
                    <h4 className="text-sm font-light mb-2">cURL Example</h4>
                    <pre className="text-xs font-mono text-gray-300 overflow-x-auto">
{`curl -X POST ${feature.endpoint} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${feature.example.request}'`}
                    </pre>
                  </div>
                </div>
              ))}
            </div>

            {/* Rate Limits */}
            <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
              <h3 className="text-lg font-light mb-4">Rate Limits - {subscription.tier?.charAt(0).toUpperCase() + subscription.tier?.slice(1)} Tier</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="text-2xl font-light gradient-text mb-1">
                    {subscription.tier === 'pro' ? '50K' : subscription.tier === 'team' ? '200K' : 'Unlimited'}
                  </div>
                  <div className="text-sm text-gray-400">Requests per day</div>
                </div>
                <div>
                  <div className="text-2xl font-light gradient-text mb-1">
                    {subscription.tier === 'pro' ? '100' : subscription.tier === 'team' ? '500' : '1000'}
                  </div>
                  <div className="text-sm text-gray-400">Requests per minute</div>
                </div>
                <div>
                  <div className="text-2xl font-light gradient-text mb-1">
                    {subscription.tier === 'pro' ? '90' : subscription.tier === 'team' ? '365' : '730+'} days
                  </div>
                  <div className="text-sm text-gray-400">Historical data access</div>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
