import Head from 'next/head';
import { useState } from 'react';

export default function ApiDocs() {
  const [activeTab, setActiveTab] = useState('overview');

  const CodeBlock = ({ children, language = 'bash' }) => (
    <pre className="bg-black border border-gray-500 border-opacity-25 rounded p-4 overflow-x-auto">
      <code className="text-sm text-gray-300 font-mono">{children}</code>
    </pre>
  );

  return (
    <div className="min-h-screen bg-black text-white">
      <Head>
        <title>API Documentation - KAMIYO</title>
        <meta name="description" content="Complete API documentation for KAMIYO exploit intelligence platform" />
      </Head>

      <section className="py-10 px-5 md:px-1 mx-auto" style={{ maxWidth: '1400px' }}>
        <div className="border-dotted border-b border-cyan mb-12 pb-6">
          <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;Documentation</p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">API Documentation</h1>
          <p className="text-gray-400 mt-4">
            Integrate KAMIYO's exploit intelligence into your applications, monitoring tools, and security workflows.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-500 border-opacity-25 pb-4">
          {['overview', 'x402', 'authentication', 'exploits', 'analysis', 'websocket', 'errors', 'examples'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-light transition-colors ${
                activeTab === tab
                  ? 'text-white border-b-2 border-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab === 'x402' ? 'x402 Payments' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* x402 Payments */}
        {activeTab === 'x402' && (
          <div>
            <h2 className="text-2xl font-light mb-6">x402 Payment Facilitator</h2>

            <div className="bg-black border border-cyan border-opacity-25 rounded-lg p-6 mb-8">
              <div className="text-cyan text-sm mb-2">On-Chain Payments for AI Agents</div>
              <p className="text-gray-400 text-sm mb-4">
                KAMIYO implements HTTP 402 Payment Required responses, enabling AI agents to discover pricing, pay with USDC, and access APIs without account signup.
              </p>
              <div className="text-white text-sm">Supported chains: Base, Ethereum, Solana</div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">How It Works</h3>
              <div className="space-y-4">
                <div className="bg-black border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="text-white font-medium mb-2">1. Make API Request (No Payment)</div>
                  <CodeBlock>{`curl https://api.kamiyo.ai/v1/exploits`}</CodeBlock>
                </div>
                <div className="bg-black border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="text-white font-medium mb-2">2. Receive 402 Payment Required</div>
                  <CodeBlock language="json">{`HTTP/1.1 402 Payment Required
X-Payment-Amount: 0.10
X-Payment-Currency: USDC

{
  "payment_required": true,
  "amount_usdc": 0.10,
  "payment_methods": [{
    "type": "onchain",
    "supported_chains": ["base", "ethereum", "solana"],
    "payment_addresses": {
      "base": "0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7",
      "ethereum": "0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7",
      "solana": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
    }
  }]
}`}</CodeBlock>
                </div>
                <div className="bg-black border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="text-white font-medium mb-2">3. Send USDC Payment On-Chain</div>
                  <p className="text-gray-400 text-sm mb-2">Transfer USDC to the payment address on your preferred chain.</p>
                </div>
                <div className="bg-black border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="text-white font-medium mb-2">4. Verify Payment & Get Token</div>
                  <CodeBlock>{`curl -X POST https://api.kamiyo.ai/x402/verify-payment \\
  -H "Content-Type: application/json" \\
  -d '{
    "tx_hash": "0xabc123...",
    "chain": "base"
  }'`}</CodeBlock>
                </div>
                <div className="bg-black border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="text-white font-medium mb-2">5. Use Payment Token for API Calls</div>
                  <CodeBlock>{`curl -H "x-payment-token: kmy_..." \\
  https://api.kamiyo.ai/v1/exploits`}</CodeBlock>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">GET /x402/supported-chains</h3>
              <p className="text-gray-400 mb-4">Get list of supported blockchain networks and payment addresses.</p>
              <CodeBlock>{`curl https://api.kamiyo.ai/x402/supported-chains`}</CodeBlock>
              <div className="mt-4">
                <div className="text-sm font-light text-gray-500 mb-2">Response</div>
                <CodeBlock language="json">{`{
  "supported_chains": ["base", "ethereum", "solana"],
  "payment_addresses": {
    "base": "0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7",
    "ethereum": "0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7",
    "solana": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  },
  "min_payment_amount": 0.10
}`}</CodeBlock>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">POST /x402/verify-payment</h3>
              <p className="text-gray-400 mb-4">Verify on-chain USDC payment and create payment record in database.</p>
              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Request Body</div>
                <div className="border border-gray-500 border-opacity-25 rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-500 bg-opacity-10">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-light">Field</th>
                        <th className="text-left p-3 text-gray-400 font-light">Type</th>
                        <th className="text-left p-3 text-gray-400 font-light">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-500 divide-opacity-25">
                      <tr>
                        <td className="p-3 font-mono text-cyan">tx_hash</td>
                        <td className="p-3 text-gray-400">string</td>
                        <td className="p-3 text-gray-400">Transaction hash on specified chain</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-cyan">chain</td>
                        <td className="p-3 text-gray-400">string</td>
                        <td className="p-3 text-gray-400">Blockchain network (base, ethereum, solana)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-cyan">expected_amount</td>
                        <td className="p-3 text-gray-400">number</td>
                        <td className="p-3 text-gray-400">Optional: Expected payment amount in USDC</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <CodeBlock>{`curl -X POST https://api.kamiyo.ai/x402/verify-payment \\
  -H "Content-Type: application/json" \\
  -d '{
    "tx_hash": "0xabc123...",
    "chain": "base",
    "expected_amount": 1.00
  }'`}</CodeBlock>
              <div className="mt-4">
                <div className="text-sm font-light text-gray-500 mb-2">Response (Success)</div>
                <CodeBlock language="json">{`{
  "is_valid": true,
  "verification": {
    "tx_hash": "0xabc123...",
    "chain": "base",
    "amount_usdc": 1.00,
    "from_address": "0xdef456...",
    "to_address": "0x742d35...",
    "block_number": 12345678,
    "confirmations": 12,
    "risk_score": 0.1
  },
  "payment": {
    "id": 42,
    "status": "verified",
    "requests_allocated": 10,
    "requests_used": 0,
    "requests_remaining": 10,
    "expires_at": "2025-10-28T12:00:00Z"
  }
}`}</CodeBlock>
              </div>
              <div className="mt-4">
                <div className="text-sm font-light text-gray-500 mb-2">Response (Insufficient Confirmations)</div>
                <CodeBlock language="json">{`{
  "is_valid": false,
  "error_message": "Insufficient confirmations: 3/12",
  "verification": {
    "tx_hash": "0xabc123...",
    "chain": "ethereum",
    "confirmations": 3,
    "required_confirmations": 12
  }
}`}</CodeBlock>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">POST /x402/generate-token/{payment_id}</h3>
              <p className="text-gray-400 mb-4">Generate payment access token for verified payment stored in database.</p>
              <CodeBlock>{`curl -X POST https://api.kamiyo.ai/x402/generate-token/42`}</CodeBlock>
              <div className="mt-4">
                <div className="text-sm font-light text-gray-500 mb-2">Response</div>
                <CodeBlock language="json">{`{
  "payment_token": "kmy_a1b2c3d4e5f6...",
  "payment_id": 42,
  "expires_at": "2025-10-28T12:00:00Z",
  "requests_allocated": 10,
  "requests_used": 0,
  "requests_remaining": 10
}`}</CodeBlock>
              </div>
              <p className="text-gray-400 mt-4 text-sm">
                <strong className="text-white">Note:</strong> The payment token is only shown once. Store it securely. Tokens are hashed with SHA256 before storage.
              </p>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">GET /x402/payment/{payment_id}</h3>
              <p className="text-gray-400 mb-4">Get payment status and remaining requests from database.</p>
              <CodeBlock>{`curl https://api.kamiyo.ai/x402/payment/42`}</CodeBlock>
              <div className="mt-4">
                <div className="text-sm font-light text-gray-500 mb-2">Response</div>
                <CodeBlock language="json">{`{
  "id": 42,
  "tx_hash": "0xabc123...",
  "chain": "base",
  "amount_usdc": 1.00,
  "from_address": "0xdef456...",
  "to_address": "0x742d35...",
  "status": "verified",
  "risk_score": 0.1,
  "requests_allocated": 10,
  "requests_used": 3,
  "requests_remaining": 7,
  "created_at": "2025-10-27T10:00:00Z",
  "verified_at": "2025-10-27T10:01:00Z",
  "expires_at": "2025-10-28T10:01:00Z"
}`}</CodeBlock>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">GET /x402/stats</h3>
              <p className="text-gray-400 mb-4">Get payment analytics and statistics.</p>
              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Query Parameters</div>
                <div className="border border-gray-500 border-opacity-25 rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-500 bg-opacity-10">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-light">Parameter</th>
                        <th className="text-left p-3 text-gray-400 font-light">Type</th>
                        <th className="text-left p-3 text-gray-400 font-light">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-500 divide-opacity-25">
                      <tr>
                        <td className="p-3 font-mono text-cyan">chain</td>
                        <td className="p-3 text-gray-400">string</td>
                        <td className="p-3 text-gray-400">Optional: Filter by blockchain (base, ethereum, solana)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-cyan">from_address</td>
                        <td className="p-3 text-gray-400">string</td>
                        <td className="p-3 text-gray-400">Optional: Filter by payer address</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <CodeBlock>{`curl https://api.kamiyo.ai/x402/stats?chain=base`}</CodeBlock>
              <div className="mt-4">
                <div className="text-sm font-light text-gray-500 mb-2">Response</div>
                <CodeBlock language="json">{`{
  "total_payments": 1247,
  "total_amount_usdc": 3542.50,
  "total_requests_allocated": 35425,
  "total_requests_used": 28340,
  "unique_payers": 156,
  "average_payment_usdc": 2.84,
  "period_hours": 24
}`}</CodeBlock>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">GET /x402/pricing</h3>
              <p className="text-gray-400 mb-4">Get x402 payment pricing information and configuration.</p>
              <CodeBlock>{`curl https://api.kamiyo.ai/x402/pricing`}</CodeBlock>
              <div className="mt-4">
                <div className="text-sm font-light text-gray-500 mb-2">Response</div>
                <CodeBlock language="json">{`{
  "pricing": {
    "price_per_call": 0.10,
    "min_payment_usd": 0.10,
    "requests_per_dollar": 10.0,
    "token_expiry_hours": 24
  },
  "confirmations_required": {
    "base": 6,
    "ethereum": 12,
    "solana": 32
  },
  "endpoint_specific_pricing": {
    "/exploits": 0.10,
    "/stats": 0.05,
    "/chains": 0.02,
    "/health": 0.01
  }
}`}</CodeBlock>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Using Payment Tokens</h3>
              <p className="text-gray-400 mb-4">Once you have a payment token, include it in the <code className="text-cyan">x-payment-token</code> header:</p>
              <CodeBlock>{`curl -H "x-payment-token: kmy_your_token_here" \\
  https://api.kamiyo.ai/v1/exploits`}</CodeBlock>
              <div className="bg-black border border-cyan border-opacity-25 rounded-lg p-4 mt-4">
                <h4 className="text-white text-sm mb-2">Token Details</h4>
                <ul className="text-gray-400 text-sm space-y-2">
                  <li>• <strong className="text-white">Expiry:</strong> 24 hours from payment verification</li>
                  <li>• <strong className="text-white">Requests:</strong> 10 API calls per $1.00 USDC paid</li>
                  <li>• <strong className="text-white">Storage:</strong> Tokens are hashed with SHA256 and stored in PostgreSQL database</li>
                  <li>• <strong className="text-white">Validation:</strong> Each request checks token validity and decrements request counter</li>
                  <li>• <strong className="text-white">Usage Tracking:</strong> All API calls are logged with endpoint, method, status code, and response time</li>
                </ul>
              </div>
            </div>

            <div className="bg-black border border-cyan border-opacity-25 rounded-lg p-6">
              <h3 className="text-xl font-light mb-4">JavaScript SDK</h3>
              <p className="text-gray-400 mb-4">Use our SDK to handle x402 payments automatically:</p>
              <CodeBlock language="javascript">{`const { KamiyoClient } = require('kamiyo-x402-sdk');

const client = new KamiyoClient({
  chain: 'base',
  walletPrivateKey: process.env.WALLET_KEY
});

// SDK automatically handles 402 responses and USDC payments
const exploits = await client.getExploits({
  chain: 'ethereum',
  start_date: '2025-01-01'
});`}</CodeBlock>
              <p className="text-gray-400 mt-4 text-sm">
                The SDK is available at: <code className="text-cyan">npm install kamiyo-x402-sdk</code>
              </p>
            </div>
          </div>
        )}

        {/* Overview */}
        {activeTab === 'overview' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Overview</h2>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Base URL</h3>
              <CodeBlock>https://api.kamiyo.ai/v1</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">API Versions</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-cyan">v1:</span>
                  <span className="text-gray-400">Production API (stable) - Exploit data, filtering, historical queries</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-magenta">v2:</span>
                  <span className="text-gray-400">Analysis API (Team+) - Fork detection, pattern clustering, advanced features</span>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Rate Limits</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="text-gray-500 text-sm mb-2">Free Tier</div>
                  <div className="text-white mb-1">No API access</div>
                  <div className="text-xs text-gray-400">Web dashboard only</div>
                </div>
                <div className="border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="text-gray-500 text-sm mb-2">Pro Tier ($89/mo)</div>
                  <div className="text-white mb-1">50,000 requests/day</div>
                  <div className="text-xs text-gray-400">35/min • 2,083/hour</div>
                </div>
                <div className="border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="text-gray-500 text-sm mb-2">Team Tier ($199/mo)</div>
                  <div className="text-white mb-1">100,000 requests/day</div>
                  <div className="text-xs text-gray-400">70/min • 4,167/hour</div>
                </div>
                <div className="border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="text-gray-500 text-sm mb-2">Enterprise Tier ($499/mo)</div>
                  <div className="text-white mb-1">Unlimited requests</div>
                  <div className="text-xs text-gray-400">1,000/min • No daily limit</div>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Data Access by Tier</h3>
              <div className="bg-black border border-yellow-500 border-opacity-25 rounded-lg p-4 mb-4">
                <div className="text-yellow-500 text-sm mb-2">Free Tier Limitation</div>
                <div className="text-gray-400 text-sm">
                  Free tier users receive exploit data with a <strong className="text-white">24-hour delay</strong>.
                  Paid tiers (Pro, Team, Enterprise) get <strong className="text-white">real-time data access</strong>.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="text-gray-500 text-sm mb-2">Free Tier</div>
                  <div className="text-white mb-1">24-hour delayed data</div>
                  <div className="text-xs text-gray-400">7 days historical access</div>
                </div>
                <div className="border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="text-gray-500 text-sm mb-2">Pro Tier</div>
                  <div className="text-white mb-1">Real-time data</div>
                  <div className="text-xs text-gray-400">90 days historical access</div>
                </div>
                <div className="border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="text-gray-500 text-sm mb-2">Team Tier</div>
                  <div className="text-white mb-1">Real-time data</div>
                  <div className="text-xs text-gray-400">1 year historical access</div>
                </div>
                <div className="border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="text-gray-500 text-sm mb-2">Enterprise Tier</div>
                  <div className="text-white mb-1">Real-time data</div>
                  <div className="text-xs text-gray-400">Unlimited historical access</div>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Response Format</h3>
              <p className="text-gray-400 mb-4">All API responses are JSON formatted with the following structure:</p>
              <CodeBlock language="json">{`{
  "success": true,
  "data": { ... },
  "meta": {
    "total": 100,
    "page": 1,
    "per_page": 20
  },
  "timestamp": "2025-10-10T12:00:00Z"
}`}</CodeBlock>
            </div>
          </div>
        )}

        {/* Authentication */}
        {activeTab === 'authentication' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Authentication</h2>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">API Keys</h3>
              <p className="text-gray-400 mb-4">
                Most API endpoints support optional authentication. You can access basic exploit data without authentication (free tier with 24h delay), or use an API key for real-time data and advanced features.
              </p>

              <div className="bg-black border border-cyan border-opacity-25 rounded-lg p-4 mb-4">
                <div className="text-cyan text-sm mb-2">Optional Authentication</div>
                <div className="text-gray-400 text-sm space-y-1">
                  <div>• <strong className="text-white">No API key:</strong> Free tier access with 24-hour delayed data</div>
                  <div>• <strong className="text-white">With API key:</strong> Real-time data, higher rate limits, advanced features</div>
                </div>
              </div>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">API Key Format</div>
                <p className="text-gray-400 text-sm mb-2">
                  KAMIYO API keys follow the format: <code className="text-cyan font-mono">kmy_</code> followed by 64 hexadecimal characters
                </p>
                <CodeBlock>kmy_a1b2c3d4e5f6...  (68 characters total)</CodeBlock>
              </div>

              <p className="text-gray-400 mb-4">
                Include your API key in the Authorization header:
              </p>
              <CodeBlock>{`curl -H "Authorization: Bearer kmy_your_api_key_here" \\
  https://api.kamiyo.ai/v1/exploits`}</CodeBlock>

              <p className="text-gray-400 mt-4 text-sm">
                <strong className="text-white">Note:</strong> Some endpoints like v2 Analysis API require Team tier or higher and always need authentication.
              </p>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Getting Your API Key</h3>

              <div className="bg-black border border-cyan border-opacity-25 rounded-lg p-4 mb-4">
                <div className="text-cyan text-sm mb-2">Auto-Generated on Signup</div>
                <div className="text-gray-400 text-sm">
                  New users automatically receive an API key when signing up. You can view and manage your keys in the dashboard.
                </div>
              </div>

              <ol className="list-decimal list-inside space-y-2 text-gray-400">
                <li>Sign up or sign in at <a href="/auth/signin" className="text-cyan hover:opacity-80">kamiyo.ai/auth/signin</a></li>
                <li>Navigate to <a href="/dashboard/api-keys" className="text-cyan hover:opacity-80">Dashboard → API Keys</a></li>
                <li>Your default API key is displayed (auto-generated on signup)</li>
                <li>Click "Create New Key" to generate additional keys (max 5 per account)</li>
                <li>Copy and store your key securely (full key shown only once)</li>
              </ol>

              <p className="text-gray-400 mt-4 text-sm">
                <strong className="text-white">Key Management:</strong> You can create up to 5 API keys per account, view masked keys, revoke compromised keys, and track last usage timestamps.
              </p>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Security Best Practices</h3>
              <div className="space-y-2 text-sm text-gray-400">
                <div>• Never commit API keys to version control (.gitignore them)</div>
                <div>• Use environment variables to store keys (e.g., <code className="text-cyan font-mono">KAMIYO_API_KEY</code>)</div>
                <div>• Rotate keys regularly (every 90 days recommended)</div>
                <div>• Use separate keys for development and production environments</div>
                <div>• Revoke keys immediately if compromised via <a href="/dashboard/api-keys" className="text-cyan hover:opacity-80">Dashboard</a></div>
                <div>• Name your keys descriptively (e.g., "Production API", "Dev Environment")</div>
                <div>• Monitor "Last Used" timestamps to detect unauthorized access</div>
                <div>• Only generate keys when needed (don't create unused keys)</div>
              </div>
            </div>
          </div>
        )}

        {/* Exploits API */}
        {activeTab === 'exploits' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Exploits API (v1)</h2>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">GET /v1/exploits</h3>
              <p className="text-gray-400 mb-4">Retrieve a list of exploits with optional filtering.</p>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Query Parameters</div>
                <div className="border border-gray-500 border-opacity-25 rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-500 bg-opacity-10">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-light">Parameter</th>
                        <th className="text-left p-3 text-gray-400 font-light">Type</th>
                        <th className="text-left p-3 text-gray-400 font-light">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-500 divide-opacity-25">
                      <tr>
                        <td className="p-3 font-mono text-cyan">chain</td>
                        <td className="p-3 text-gray-400">string</td>
                        <td className="p-3 text-gray-400">Filter by blockchain (ethereum, bsc, polygon, etc.)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-cyan">start_date</td>
                        <td className="p-3 text-gray-400">string</td>
                        <td className="p-3 text-gray-400">Start date (YYYY-MM-DD)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-cyan">end_date</td>
                        <td className="p-3 text-gray-400">string</td>
                        <td className="p-3 text-gray-400">End date (YYYY-MM-DD)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-cyan">min_amount</td>
                        <td className="p-3 text-gray-400">number</td>
                        <td className="p-3 text-gray-400">Minimum loss amount in USD</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-cyan">protocol</td>
                        <td className="p-3 text-gray-400">string</td>
                        <td className="p-3 text-gray-400">Filter by protocol name (partial match, case-insensitive)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-cyan">page</td>
                        <td className="p-3 text-gray-400">number</td>
                        <td className="p-3 text-gray-400">Page number (default: 1)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-cyan">page_size</td>
                        <td className="p-3 text-gray-400">number</td>
                        <td className="p-3 text-gray-400">Items per page (default: 100, max: 500)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Example Request</div>
                <CodeBlock>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://api.kamiyo.ai/v1/exploits?chain=ethereum&start_date=2025-01-01&min_amount=1000000"`}</CodeBlock>
              </div>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Example Response</div>
                <CodeBlock language="json">{`{
  "success": true,
  "data": [
    {
      "id": "exp_1234567890",
      "name": "Euler Finance Exploit",
      "chain": "ethereum",
      "protocol": "Euler Finance",
      "exploit_type": "Flash Loan Attack",
      "amount_usd": 197000000,
      "transaction_hash": "0x...",
      "contract_address": "0x...",
      "date": "2023-03-13T08:00:00Z",
      "severity": "critical",
      "verified": true,
      "sources": ["rekt.news", "peckshield"]
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "per_page": 20
  }
}`}</CodeBlock>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">GET /v1/exploits/:tx_hash</h3>
              <p className="text-gray-400 mb-4">Get detailed information about a specific exploit by transaction hash.</p>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Example Request</div>
                <CodeBlock>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  https://api.kamiyo.ai/v1/exploits/0x123abc...`}</CodeBlock>
              </div>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Example Response</div>
                <CodeBlock language="json">{`{
  "id": "exp_1234567890",
  "name": "Euler Finance Exploit",
  "chain": "ethereum",
  "protocol": "Euler Finance",
  "exploit_type": "Flash Loan Attack",
  "amount_usd": 197000000,
  "transaction_hash": "0x123abc...",
  "contract_address": "0xdef456...",
  "date": "2023-03-13T08:00:00Z",
  "severity": "critical",
  "verified": true,
  "sources": ["rekt.news", "peckshield"],
  "description": "Flash loan attack exploiting donation function vulnerability",
  "attacker_address": "0xabc123...",
  "victim_address": "0xdef456..."
}`}</CodeBlock>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">GET /v1/chains</h3>
              <p className="text-gray-400 mb-4">Get list of all blockchains tracked by KAMIYO with exploit counts.</p>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Example Request</div>
                <CodeBlock>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  https://api.kamiyo.ai/v1/chains`}</CodeBlock>
              </div>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Example Response</div>
                <CodeBlock language="json">{`{
  "total_chains": 15,
  "chains": [
    {
      "chain": "ethereum",
      "exploit_count": 487
    },
    {
      "chain": "bsc",
      "exploit_count": 312
    },
    {
      "chain": "polygon",
      "exploit_count": 156
    }
  ]
}`}</CodeBlock>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">GET /v1/stats</h3>
              <p className="text-gray-400 mb-4">Get aggregate statistics about exploits for a specified time period.</p>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Query Parameters</div>
                <div className="border border-gray-500 border-opacity-25 rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-500 bg-opacity-10">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-light">Parameter</th>
                        <th className="text-left p-3 text-gray-400 font-light">Type</th>
                        <th className="text-left p-3 text-gray-400 font-light">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-500 divide-opacity-25">
                      <tr>
                        <td className="p-3 font-mono text-cyan">days</td>
                        <td className="p-3 text-gray-400">number</td>
                        <td className="p-3 text-gray-400">Time period in days (default: 1, max: 365)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Example Request</div>
                <CodeBlock>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://api.kamiyo.ai/v1/stats?days=30"`}</CodeBlock>
              </div>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Example Response</div>
                <CodeBlock language="json">{`{
  "period_days": 30,
  "total_exploits": 87,
  "total_loss_usd": 423000000,
  "chains_affected": 12,
  "protocols_affected": 65,
  "average_loss_usd": 4862069,
  "largest_exploit": {
    "protocol": "Example Protocol",
    "amount_usd": 125000000,
    "chain": "ethereum"
  },
  "exploits_by_chain": {
    "ethereum": 45,
    "bsc": 23,
    "polygon": 19
  },
  "exploits_by_type": {
    "flash_loan": 32,
    "reentrancy": 18,
    "oracle_manipulation": 15
  }
}`}</CodeBlock>
              </div>
            </div>
          </div>
        )}

        {/* Analysis API */}
        {activeTab === 'analysis' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Analysis API (v2) - Team Tier+</h2>

            <div className="bg-black border border-cyan border-opacity-25 rounded-lg p-4 mb-8">
              <div className="text-cyan text-sm mb-2">Team & Enterprise Only</div>
              <div className="text-gray-400 text-sm">
                The Analysis API (v2) requires Team tier or higher. Upgrade at <a href="/pricing" className="text-cyan hover:opacity-80">kamiyo.ai/pricing</a>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">GET /v2/analysis/fork-families</h3>
              <p className="text-gray-400 mb-4">Retrieve fork relationships and exploit families.</p>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Query Parameters</div>
                <div className="border border-gray-500 border-opacity-25 rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-500 bg-opacity-10">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-light">Parameter</th>
                        <th className="text-left p-3 text-gray-400 font-light">Type</th>
                        <th className="text-left p-3 text-gray-400 font-light">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-500 divide-opacity-25">
                      <tr>
                        <td className="p-3 font-mono text-cyan">min_similarity</td>
                        <td className="p-3 text-gray-400">float</td>
                        <td className="p-3 text-gray-400">Minimum similarity score (0.0-1.0, default: 0.7)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-cyan">chain</td>
                        <td className="p-3 text-gray-400">string</td>
                        <td className="p-3 text-gray-400">Filter by blockchain</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-cyan">limit</td>
                        <td className="p-3 text-gray-400">number</td>
                        <td className="p-3 text-gray-400">Max families to return (default: 50)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <CodeBlock>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://api.kamiyo.ai/v2/analysis/fork-families?min_similarity=0.8"`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">GET /v2/analysis/pattern-clusters</h3>
              <p className="text-gray-400 mb-4">Retrieve pattern-based exploit clusters.</p>
              <CodeBlock>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  https://api.kamiyo.ai/v2/analysis/pattern-clusters`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">POST /v2/analysis/features</h3>
              <p className="text-gray-400 mb-4">Extract features from an exploit for analysis.</p>
              <CodeBlock>{`curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"exploit_id": "exp_1234567890"}' \\
  https://api.kamiyo.ai/v2/analysis/features`}</CodeBlock>
            </div>
          </div>
        )}

        {/* WebSocket */}
        {activeTab === 'websocket' && (
          <div>
            <h2 className="text-2xl font-light mb-6">WebSocket API - Pro Tier+</h2>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Connection</h3>
              <p className="text-gray-400 mb-4">Connect to real-time exploit feed via WebSocket:</p>
              <CodeBlock>{`wss://api.kamiyo.ai/v1/ws?token=YOUR_API_KEY`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Subscribe to Events</h3>
              <p className="text-gray-400 mb-4">Send a subscription message after connecting:</p>
              <CodeBlock language="json">{`{
  "action": "subscribe",
  "channels": ["exploits"],
  "filters": {
    "chains": ["ethereum", "bsc"],
    "min_amount": 1000000
  }
}`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Receiving Events</h3>
              <p className="text-gray-400 mb-4">Real-time exploit notifications:</p>
              <CodeBlock language="json">{`{
  "type": "exploit",
  "data": {
    "id": "exp_1234567890",
    "name": "New DeFi Exploit",
    "chain": "ethereum",
    "amount_usd": 5000000,
    "timestamp": "2025-10-10T12:00:00Z"
  }
}`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">JavaScript Example</h3>
              <CodeBlock language="javascript">{`const ws = new WebSocket('wss://api.kamiyo.ai/v1/ws?token=YOUR_API_KEY');

ws.onopen = () => {
  console.log('Connected to KAMIYO WebSocket');

  // Subscribe to exploit feed
  ws.send(JSON.stringify({
    action: 'subscribe',
    channels: ['exploits'],
    filters: { chains: ['ethereum'] }
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('New exploit detected:', data);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};`}</CodeBlock>
            </div>
          </div>
        )}

        {/* Errors */}
        {activeTab === 'errors' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Error Handling</h2>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Error Response Format</h3>
              <p className="text-gray-400 mb-4">All errors return a consistent JSON structure:</p>
              <CodeBlock language="json">{`{
  "error": true,
  "error_code": "UNAUTHORIZED",
  "message": "Invalid API key provided",
  "details": "The API key format is invalid or has been revoked",
  "timestamp": "2025-10-10T12:00:00Z"
}`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">HTTP Status Codes</h3>
              <div className="border border-gray-500 border-opacity-25 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-500 bg-opacity-10">
                    <tr>
                      <th className="text-left p-3 text-gray-400 font-light">Code</th>
                      <th className="text-left p-3 text-gray-400 font-light">Status</th>
                      <th className="text-left p-3 text-gray-400 font-light">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-500 divide-opacity-25">
                    <tr>
                      <td className="p-3 font-mono text-cyan">200</td>
                      <td className="p-3 text-white">OK</td>
                      <td className="p-3 text-gray-400">Request successful</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">400</td>
                      <td className="p-3 text-white">Bad Request</td>
                      <td className="p-3 text-gray-400">Invalid request parameters</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">401</td>
                      <td className="p-3 text-white">Unauthorized</td>
                      <td className="p-3 text-gray-400">Missing or invalid API key</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">403</td>
                      <td className="p-3 text-white">Forbidden</td>
                      <td className="p-3 text-gray-400">Insufficient tier permissions</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">404</td>
                      <td className="p-3 text-white">Not Found</td>
                      <td className="p-3 text-gray-400">Resource does not exist</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">429</td>
                      <td className="p-3 text-white">Too Many Requests</td>
                      <td className="p-3 text-gray-400">Rate limit exceeded</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">500</td>
                      <td className="p-3 text-white">Internal Server Error</td>
                      <td className="p-3 text-gray-400">Server-side error occurred</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">503</td>
                      <td className="p-3 text-white">Service Unavailable</td>
                      <td className="p-3 text-gray-400">API temporarily unavailable</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Common Error Codes</h3>

              <div className="space-y-6">
                <div className="border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-cyan font-mono text-sm">UNAUTHORIZED</span>
                    <span className="text-gray-500 text-sm">(401)</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">Missing or invalid API key.</p>
                  <CodeBlock language="json">{`{
  "error": true,
  "error_code": "UNAUTHORIZED",
  "message": "Missing authorization header"
}`}</CodeBlock>
                </div>

                <div className="border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-cyan font-mono text-sm">RATE_LIMIT_EXCEEDED</span>
                    <span className="text-gray-500 text-sm">(429)</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">You've exceeded your tier's rate limit.</p>
                  <CodeBlock language="json">{`{
  "error": true,
  "error_code": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded",
  "details": "100 requests per day limit reached. Resets at 2025-10-11T00:00:00Z",
  "reset_at": "2025-10-11T00:00:00Z"
}`}</CodeBlock>
                </div>

                <div className="border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-cyan font-mono text-sm">INSUFFICIENT_TIER</span>
                    <span className="text-gray-500 text-sm">(403)</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">Endpoint requires higher subscription tier.</p>
                  <CodeBlock language="json">{`{
  "error": true,
  "error_code": "INSUFFICIENT_TIER",
  "message": "This endpoint requires Team tier or higher",
  "current_tier": "pro",
  "required_tier": "team"
}`}</CodeBlock>
                </div>

                <div className="border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-cyan font-mono text-sm">INVALID_PARAMETER</span>
                    <span className="text-gray-500 text-sm">(400)</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">Invalid or malformed request parameter.</p>
                  <CodeBlock language="json">{`{
  "error": true,
  "error_code": "INVALID_PARAMETER",
  "message": "Invalid parameter: start_date",
  "details": "Date must be in YYYY-MM-DD format"
}`}</CodeBlock>
                </div>

                <div className="border border-gray-500 border-opacity-25 rounded p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-cyan font-mono text-sm">RESOURCE_NOT_FOUND</span>
                    <span className="text-gray-500 text-sm">(404)</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">Requested resource does not exist.</p>
                  <CodeBlock language="json">{`{
  "error": true,
  "error_code": "RESOURCE_NOT_FOUND",
  "message": "Exploit not found",
  "details": "No exploit with ID: exp_1234567890"
}`}</CodeBlock>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Error Handling Best Practices</h3>
              <div className="space-y-3 text-sm text-gray-400">
                <div className="flex items-start gap-2">
                  <span className="text-cyan">•</span>
                  <span>Always check HTTP status codes before parsing response body</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-cyan">•</span>
                  <span>Implement exponential backoff for rate limit (429) errors</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-cyan">•</span>
                  <span>Handle 401 errors by refreshing or regenerating API keys</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-cyan">•</span>
                  <span>Log error_code and details fields for debugging</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-cyan">•</span>
                  <span>For 5xx errors, implement retry logic with increasing delays</span>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-sm font-light text-gray-500 mb-2">Python Example</div>
                <CodeBlock language="python">{`import requests
import time

def make_api_request(url, headers, max_retries=3):
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers)

            if response.status_code == 200:
                return response.json()

            elif response.status_code == 429:
                # Rate limit - exponential backoff
                wait_time = 2 ** attempt
                print(f"Rate limited. Waiting {wait_time}s...")
                time.sleep(wait_time)
                continue

            elif response.status_code == 401:
                print("Unauthorized - check API key")
                return None

            elif response.status_code >= 500:
                # Server error - retry with backoff
                wait_time = 2 ** attempt
                print(f"Server error. Retrying in {wait_time}s...")
                time.sleep(wait_time)
                continue

            else:
                # Client error - don't retry
                error_data = response.json()
                print(f"Error: {error_data.get('message')}")
                return None

        except Exception as e:
            print(f"Request failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            else:
                return None

    return None`}</CodeBlock>
              </div>
            </div>
          </div>
        )}

        {/* Examples */}
        {activeTab === 'examples' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Code Examples</h2>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Python</h3>
              <CodeBlock language="python">{`import requests

API_KEY = "your_api_key_here"
BASE_URL = "https://api.kamiyo.ai/v1"

headers = {
    "Authorization": f"Bearer {API_KEY}"
}

# Get recent exploits
response = requests.get(
    f"{BASE_URL}/exploits",
    headers=headers,
    params={
        "chain": "ethereum",
        "start_date": "2025-01-01",
        "per_page": 10
    }
)

exploits = response.json()
for exploit in exploits['data']:
    name = exploit['name']
    amount = exploit['amount_usd']
    print(f"{name}: $${amount}")`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Node.js</h3>
              <CodeBlock language="javascript">{`const axios = require('axios');

const API_KEY = 'your_api_key_here';
const BASE_URL = 'https://api.kamiyo.ai/v1';

async function getExploits() {
  try {
    const response = await axios.get(\`\${BASE_URL}/exploits\`, {
      headers: {
        'Authorization': \`Bearer \${API_KEY}\`
      },
      params: {
        chain: 'ethereum',
        start_date: '2025-01-01',
        per_page: 10
      }
    });

    console.log(\`Found \${response.data.meta.total} exploits\`);
    return response.data.data;
  } catch (error) {
    console.error('API Error:', error.message);
  }
}

getExploits();`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">cURL</h3>
              <CodeBlock>{`# Get recent Ethereum exploits
curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://api.kamiyo.ai/v1/exploits?chain=ethereum&per_page=5"

# Get specific exploit details
curl -H "Authorization: Bearer YOUR_API_KEY" \\
  https://api.kamiyo.ai/v1/exploits/exp_1234567890

# Get 30-day statistics
curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "https://api.kamiyo.ai/v1/stats?days=30"`}</CodeBlock>
            </div>
          </div>
        )}

        {/* Support Section */}
        <div className="mt-12 bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
          <h3 className="text-xl font-light mb-4">Need Help?</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <div className="text-gray-400 mb-2">Documentation Issues</div>
              <div className="text-white">Contact <a href="mailto:support@kamiyo.ai" className="text-cyan hover:opacity-80">support@kamiyo.ai</a></div>
            </div>
            <div>
              <div className="text-gray-400 mb-2">Rate Limit Increases</div>
              <div className="text-white">Enterprise tier includes custom rate limits</div>
            </div>
            <div>
              <div className="text-gray-400 mb-2">API Status</div>
              <div className="text-white"><a href="/api/health" className="text-cyan hover:opacity-80">Check API Health</a></div>
            </div>
            <div>
              <div className="text-gray-400 mb-2">Feature Requests</div>
              <div className="text-white">Email <a href="mailto:features@kamiyo.ai" className="text-cyan hover:opacity-80">features@kamiyo.ai</a></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
