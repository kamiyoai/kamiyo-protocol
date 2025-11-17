import SEO from '../components/SEO';
import { useState } from 'react';

export default function ApiDocs() {
  const [activeTab, setActiveTab] = useState('overview');

  const CodeBlock = ({ children }) => (
    <pre className="bg-black border border-gray-800 rounded p-4 overflow-x-auto">
      <code className="text-sm text-gray-300 font-mono">{children}</code>
    </pre>
  );

  return (
    <div className="min-h-screen bg-black text-white">
      <SEO
        title="API Documentation - x402 Multi-Chain Payment Verification | KAMIYO"
        description="Complete x402 API documentation for verifying USDC payments across Solana, Base, Ethereum and more. Python SDK, JavaScript SDK, and REST API. Simple payment verification in 10 minutes."
        canonical="https://kamiyo.ai/api-docs"
      />

      <section className="py-10 px-5 mx-auto max-w-[1400px]">
        <div className="border-dotted border-b border-cyan mb-12 pb-6">
          <p className="font-light text-sm uppercase tracking-widest text-cyan mb-4 md:mb-8">— &nbsp;API ドキュメント</p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-light leading-[1.25]">x402 Infrastructure API</h1>
          <p className="text-gray-400 mt-4">
            Multi-chain USDC payment verification for your APIs. 99.9% uptime.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-500/25 pb-4">
          {['overview', 'quickstart', 'verify', 'chains', 'sdks'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-light transition-colors ${
                activeTab === tab
                  ? 'text-white border-b-2 border-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab === 'verify' ? 'Verify Payment' :
               tab === 'chains' ? 'Supported Chains' :
               tab === 'sdks' ? 'SDKs' :
               tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === 'overview' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Overview</h2>

            <div className="bg-gray-900 bg-opacity-30 border border-gray-800 rounded-lg p-6 mb-8">
              <p className="text-gray-400 text-sm mb-4">
                x402 Infrastructure provides a simple API for verifying USDC payments across multiple blockchains.
                Confirm that payments have been made before granting access to your APIs or services.
              </p>
              <div className="text-white text-sm space-y-2">
                <div>• <strong>Multi-chain support:</strong> Verify payments on Solana, Base, Ethereum, Polygon, and more</div>
                <div>• <strong>Production-ready:</strong> 99.9% uptime SLA with sub-500ms response times</div>
                <div>• <strong>Simple integration:</strong> RESTful API with Python and JavaScript SDKs</div>
                <div>• <strong>Free tier:</strong> 1,000 verifications per month included</div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Base URL</h3>
              <CodeBlock>https://api.kamiyo.ai/v1/x402</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Authentication</h3>
              <p className="text-gray-400 mb-4">
                All API requests require an API key. Include your API key in the <code className="text-cyan">x-api-key</code> header.
              </p>
              <CodeBlock>curl -H "x-api-key: x402_live_..." https://api.kamiyo.ai/v1/x402/verify</CodeBlock>
              <p className="text-gray-400 text-sm mt-4">
                Get your API key from the <a href="/dashboard/x402" className="text-cyan">x402 dashboard</a>.
              </p>
            </div>
          </div>
        )}

        {/* Quick Start */}
        {activeTab === 'quickstart' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Quick Start</h2>

            <div className="space-y-8">
              <div className="border-l-2 border-gray-800 pl-6">
                <div className="text-white font-medium mb-2">Step 1: Get API Key</div>
                <p className="text-gray-400 text-sm mb-4">
                  Sign up at <a href="/dashboard/x402" className="text-cyan">kamiyo.ai/dashboard/x402</a> and create an API key from your dashboard.
                </p>
              </div>

              <div className="border-l-2 border-gray-800 pl-6">
                <div className="text-white font-medium mb-2">Step 2: User Sends Payment</div>
                <p className="text-gray-400 text-sm mb-4">
                  Your customer sends USDC to your wallet address on any supported blockchain. They provide you with the transaction hash.
                </p>
                <CodeBlock>// Transaction hash from user's wallet
tx_hash: "0xabc123..."
chain: "solana"</CodeBlock>
              </div>

              <div className="border-l-2 border-gray-800 pl-6">
                <div className="text-white font-medium mb-2">Step 3: Verify Payment</div>
                <p className="text-gray-400 text-sm mb-4">
                  Call the verification endpoint with the transaction hash and chain.
                </p>
                <CodeBlock>{`curl -X POST https://api.kamiyo.ai/v1/x402/verify \\
  -H "x-api-key: x402_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "tx_hash": "0xabc123...",
    "chain": "solana",
    "expected_amount": 10.00,
    "recipient_address": "your_wallet_address"
  }'`}</CodeBlock>
              </div>

              <div className="border-l-2 border-gray-800 pl-6">
                <div className="text-white font-medium mb-2">Step 4: Grant Access</div>
                <p className="text-gray-400 text-sm mb-4">
                  If verification succeeds, grant access to your API or service. If it fails, reject the request.
                </p>
                <CodeBlock>{`{
  "verified": true,
  "amount": 10.00,
  "currency": "USDC",
  "chain": "solana",
  "confirmations": 32,
  "timestamp": "2025-11-08T12:00:00Z"
}`}</CodeBlock>
              </div>
            </div>
          </div>
        )}

        {/* Verify Payment */}
        {activeTab === 'verify' && (
          <div>
            <h2 className="text-2xl font-light mb-6">POST /v1/x402/verify</h2>
            <p className="text-gray-400 mb-6">
              Verify that a USDC payment has been made on-chain with the correct amount and recipient.
            </p>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Request Body</h3>
              <div className="border border-gray-800 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 bg-opacity-50">
                    <tr>
                      <th className="text-left p-3 text-gray-400 font-light">Parameter</th>
                      <th className="text-left p-3 text-gray-400 font-light">Type</th>
                      <th className="text-left p-3 text-gray-400 font-light">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    <tr>
                      <td className="p-3 font-mono text-cyan">tx_hash</td>
                      <td className="p-3 text-gray-400">string</td>
                      <td className="p-3 text-gray-400">Transaction hash on the specified chain</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">chain</td>
                      <td className="p-3 text-gray-400">string</td>
                      <td className="p-3 text-gray-400">Blockchain network (solana, base, ethereum, etc.)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">expected_amount</td>
                      <td className="p-3 text-gray-400">number</td>
                      <td className="p-3 text-gray-400">Expected payment amount in USDC</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">recipient_address</td>
                      <td className="p-3 text-gray-400">string</td>
                      <td className="p-3 text-gray-400">Your wallet address that should receive payment</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Example Request</h3>
              <CodeBlock>{`curl -X POST https://api.kamiyo.ai/v1/x402/verify \\
  -H "x-api-key: x402_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "tx_hash": "3k2j5h3k2j5h3k2j5h3k2j5h...",
    "chain": "solana",
    "expected_amount": 10.00,
    "recipient_address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  }'`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Success Response</h3>
              <CodeBlock>{`{
  "verified": true,
  "tx_hash": "3k2j5h3k2j5h3k2j5h3k2j5h...",
  "chain": "solana",
  "amount": 10.00,
  "currency": "USDC",
  "sender": "9xYZabc...",
  "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "confirmations": 32,
  "block_number": 123456789,
  "timestamp": "2025-11-08T12:00:00Z",
  "verification_id": "ver_abc123..."
}`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Error Response</h3>
              <CodeBlock>{`{
  "verified": false,
  "error": "insufficient_confirmations",
  "message": "Transaction has 5/32 required confirmations",
  "tx_hash": "3k2j5h3k2j5h3k2j5h3k2j5h...",
  "chain": "solana",
  "confirmations": 5,
  "required_confirmations": 32
}`}</CodeBlock>
            </div>
          </div>
        )}

        {/* Supported Chains */}
        {activeTab === 'chains' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Supported Chains</h2>
            <p className="text-gray-400 mb-6">
              x402 Infrastructure supports payment verification across 8+ blockchain networks.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border border-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-medium mb-2">Solana</h3>
                <div className="text-sm text-gray-400 space-y-1">
                  <div>Chain ID: <code className="text-cyan">solana</code></div>
                  <div>Confirmations: 32</div>
                  <div>Avg settlement: ~13 seconds</div>
                </div>
              </div>

              <div className="border border-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-medium mb-2">Base</h3>
                <div className="text-sm text-gray-400 space-y-1">
                  <div>Chain ID: <code className="text-cyan">base</code></div>
                  <div>Confirmations: 6</div>
                  <div>Avg settlement: ~30 seconds</div>
                </div>
              </div>

              <div className="border border-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-medium mb-2">Ethereum</h3>
                <div className="text-sm text-gray-400 space-y-1">
                  <div>Chain ID: <code className="text-cyan">ethereum</code></div>
                  <div>Confirmations: 12</div>
                  <div>Avg settlement: ~3 minutes</div>
                </div>
              </div>

              <div className="border border-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-medium mb-2">Polygon</h3>
                <div className="text-sm text-gray-400 space-y-1">
                  <div>Chain ID: <code className="text-cyan">polygon</code></div>
                  <div>Confirmations: 128</div>
                  <div>Avg settlement: ~5 minutes</div>
                </div>
              </div>

              <div className="border border-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-medium mb-2">Arbitrum</h3>
                <div className="text-sm text-gray-400 space-y-1">
                  <div>Chain ID: <code className="text-cyan">arbitrum</code></div>
                  <div>Confirmations: 10</div>
                  <div>Avg settlement: ~2 minutes</div>
                </div>
              </div>

              <div className="border border-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-medium mb-2">Optimism</h3>
                <div className="text-sm text-gray-400 space-y-1">
                  <div>Chain ID: <code className="text-cyan">optimism</code></div>
                  <div>Confirmations: 10</div>
                  <div>Avg settlement: ~2 minutes</div>
                </div>
              </div>
            </div>

            <div className="mt-8 bg-gray-900 bg-opacity-30 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-light mb-4">GET /v1/x402/chains</h3>
              <p className="text-gray-400 text-sm mb-4">
                Get a programmatic list of all supported chains and their configurations.
              </p>
              <CodeBlock>{`curl -H "x-api-key: x402_live_..." \\
  https://api.kamiyo.ai/v1/x402/chains`}</CodeBlock>
            </div>
          </div>
        )}

        {/* SDKs */}
        {activeTab === 'sdks' && (
          <div>
            <h2 className="text-2xl font-light mb-6">SDKs</h2>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Python SDK</h3>
              <div className="mb-4">
                <CodeBlock>pip install x402</CodeBlock>
              </div>
              <CodeBlock>{`from x402 import X402Client

client = X402Client(api_key="x402_live_...")

result = client.verify_payment(
    tx_hash="3k2j5h3k2j5h...",
    chain="solana",
    expected_amount=10.00,
    recipient_address="7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
)

if result.verified:
    print(f"Payment verified: {result.amount} USDC")
else:
    print(f"Verification failed: {result.error}")`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">JavaScript/TypeScript SDK</h3>
              <div className="mb-4">
                <CodeBlock>npm install @x402/sdk</CodeBlock>
              </div>
              <CodeBlock>{`import { X402Client } from '@x402/sdk';

const client = new X402Client({
  apiKey: 'x402_live_...'
});

const result = await client.verifyPayment({
  txHash: '3k2j5h3k2j5h...',
  chain: 'solana',
  expectedAmount: 10.00,
  recipientAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
});

if (result.verified) {
  console.log(\`Payment verified: \${result.amount} USDC\`);
} else {
  console.log(\`Verification failed: \${result.error}\`);
}`}</CodeBlock>
            </div>

            <div className="bg-gray-900 bg-opacity-30 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-light mb-4">Additional Resources</h3>
              <div className="text-sm text-gray-400 space-y-2">
                <div>• <a href="https://github.com/kamiyo-ai/x402-python" className="text-cyan" target="_blank" rel="noopener noreferrer">Python SDK Documentation</a></div>
                <div>• <a href="https://github.com/kamiyo-ai/x402-js" className="text-cyan" target="_blank" rel="noopener noreferrer">JavaScript SDK Documentation</a></div>
                <div>• <a href="/x402/docs" className="text-cyan">Complete API Reference</a></div>
              </div>
            </div>
          </div>
        )}

        {/* Support Section */}
        <div className="mt-12 bg-gray-900 bg-opacity-30 border border-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-light mb-4">Need Help?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div>
              <div className="text-gray-400 mb-2">General Inquiries</div>
              <div className="text-white"><a href="mailto:kamiyo@kamiyo.ai" className="text-cyan">kamiyo@kamiyo.ai</a></div>
            </div>
            <div>
              <div className="text-gray-400 mb-2">Integration Support</div>
              <div className="text-white"><a href="mailto:support@kamiyo.ai" className="text-cyan">support@kamiyo.ai</a></div>
            </div>
            <div>
              <div className="text-gray-400 mb-2">Partnerships</div>
              <div className="text-white"><a href="mailto:partnerships@kamiyo.ai" className="text-cyan">partnerships@kamiyo.ai</a></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
