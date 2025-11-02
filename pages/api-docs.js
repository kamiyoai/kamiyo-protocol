import Head from 'next/head';
import { useState } from 'react';
import { PrimaryButton, SecondaryButton, LinkButton } from '../components/Button';

export default function ApiDocs() {
  const [activeTab, setActiveTab] = useState('overview');

  const CodeBlock = ({ children, language = 'bash' }) => (
    <pre className="bg-black border border-gray-500/25 rounded p-4 overflow-x-auto">
      <code className="text-sm text-gray-300 font-mono">{children}</code>
    </pre>
  );

  // JSON-LD Structured Data for API Documentation
  const techArticleSchema = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "headline": "KAMIYO Security Intelligence API Documentation",
    "description": "Complete API documentation for KAMIYO security intelligence platform: MCP integration for AI agents, x402 payment protocol, and crypto exploit data access",
    "url": "https://kamiyo.ai/api-docs",
    "datePublished": "2024-01-01",
    "dateModified": "2025-10-28",
    "author": {
      "@type": "Organization",
      "name": "KAMIYO",
      "url": "https://kamiyo.ai"
    },
    "publisher": {
      "@type": "Organization",
      "name": "KAMIYO",
      "url": "https://kamiyo.ai",
      "logo": {
        "@type": "ImageObject",
        "url": "https://kamiyo.ai/favicon.png"
      }
    },
    "keywords": [
      "security intelligence API",
      "MCP integration",
      "AI agent API",
      "crypto exploit data",
      "x402 API",
      "blockchain security API",
      "exploit detection API",
      "security monitoring API"
    ]
  };

  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "KAMIYO Security Intelligence API",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Web, Node.js, Browser",
    "description": "Security intelligence API for AI agents with MCP integration and x402 payment protocol. Access real-time crypto exploit data from 20+ sources.",
    "url": "https://kamiyo.ai/api-docs",
    "offers": {
      "@type": "Offer",
      "price": "0.01",
      "priceCurrency": "USDC",
      "description": "Pay-per-query API access or MCP subscription for unlimited queries"
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Head>
        <title>Security Intelligence API Documentation | MCP & x402 | KAMIYO</title>
        <meta name="title" content="Security Intelligence API Documentation | MCP & x402 | KAMIYO" />
        <meta name="description" content="Complete KAMIYO API documentation: MCP integration for AI agents, x402 payment protocol, crypto exploit data access. Real-time security intelligence from 20+ sources with unlimited queries via subscription." />
        <meta name="keywords" content="security intelligence API, MCP integration documentation, AI agent API, crypto exploit API, x402 API, blockchain security API, exploit detection API, security monitoring API, AI security tools, protocol risk API" />

        {/* Canonical URL */}
        <link rel="canonical" href="https://kamiyo.ai/api-docs" />

        {/* Robots Meta */}
        <meta name="robots" content="index, follow" />
        <meta name="language" content="English" />
        <meta name="author" content="KAMIYO" />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://kamiyo.ai/api-docs" />
        <meta property="og:title" content="Security Intelligence API Documentation | MCP & x402" />
        <meta property="og:description" content="Complete KAMIYO API documentation: MCP integration for AI agents and x402 payment protocol for crypto exploit intelligence." />
        <meta property="og:image" content="https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png" />
        <meta property="og:site_name" content="KAMIYO" />
        <meta property="og:locale" content="en_US" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://kamiyo.ai/api-docs" />
        <meta name="twitter:title" content="Security Intelligence API Documentation | MCP & x402" />
        <meta name="twitter:description" content="MCP integration for AI agents and x402 payment protocol for crypto exploit intelligence." />
        <meta name="twitter:image" content="https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png" />
        <meta name="twitter:site" content="@KAMIYO" />
        <meta name="twitter:creator" content="@KAMIYO" />

        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(techArticleSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
        />
      </Head>

      <section className="py-10 px-5 md:px-1 mx-auto max-w-[1400px]">
        <div className="border-dotted border-b border-cyan mb-12 pb-6">
          <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;API ドキュメント</p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-light leading-[1.25]">Security Intelligence API</h1>
          <p className="text-gray-400 mt-4">
            Access real-time crypto exploit data via MCP subscription or x402 API. AI agent integration with unlimited queries.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-500/25 pb-4">
          {['overview', 'mcp', 'mcp-setup', 'quickstart', 'authentication', 'payment-flow', 'endpoints', 'sdk', 'errors'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-light transition-colors ${
                activeTab === tab
                  ? 'text-white border-b-2 border-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab === 'mcp' ? 'MCP Integration' :
               tab === 'mcp-setup' ? 'MCP Setup' :
               tab === 'quickstart' ? 'x402 Quick Start' :
               tab === 'payment-flow' ? 'Payment Flow' :
               tab === 'sdk' ? 'JavaScript SDK' :
               tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === 'overview' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Overview</h2>

            <div className="bg-black border border-gray-500/25 rounded-lg p-6 mb-8">
              <div className="text-cyan text-sm mb-2">Security Intelligence Platform</div>
              <p className="text-gray-400 text-sm mb-4">
                KAMIYO provides real-time crypto exploit intelligence from 20+ security researchers. Access via MCP subscription (recommended for AI agents) or x402 API (pay-per-query).
              </p>
              <div className="text-white text-sm space-y-2">
                <div>• <strong>MCP Integration:</strong> Unlimited queries for AI agents via subscription</div>
                <div>• <strong>20+ Sources:</strong> CertiK, PeckShield, BlockSec, SlowMist, Chainalysis, and more</div>
                <div>• <strong>Real-Time Detection:</strong> Exploits indexed within minutes</div>
                <div>• <strong>Alternative Access:</strong> x402 API at $0.01 per query</div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Base URL</h3>
              <CodeBlock>https://api.kamiyo.ai</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Supported Blockchains</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="text-cyan text-sm mb-2">Base</div>
                  <div className="text-gray-400 text-xs mb-1">6 confirmations required</div>
                  <div className="text-gray-400 text-xs">Fast settlement (~30 seconds)</div>
                </div>
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="text-cyan text-sm mb-2">Ethereum</div>
                  <div className="text-gray-400 text-xs mb-1">12 confirmations required</div>
                  <div className="text-gray-400 text-xs">Secure settlement (~3 minutes)</div>
                </div>
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="text-cyan text-sm mb-2">Solana</div>
                  <div className="text-gray-400 text-xs mb-1">32 confirmations required</div>
                  <div className="text-gray-400 text-xs">Fast settlement (~13 seconds)</div>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Pricing</h3>
              <div className="border border-gray-500/25 rounded p-4">
                <div className="text-white mb-2">$0.01 USDC per API call</div>
                <div className="text-gray-400 text-sm space-y-1">
                  <div>• Minimum payment: $0.01 USDC</div>
                  <div>• 100 API calls per $1.00 USDC</div>
                  <div>• Payment tokens valid for 24 hours</div>
                  <div>• No monthly commitments or account signup</div>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Rate Limits</h3>
              <div className="border border-gray-500/25 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-500 bg-opacity-10">
                    <tr>
                      <th className="text-left p-3 text-gray-400 font-light">Endpoint</th>
                      <th className="text-left p-3 text-gray-400 font-light">Rate Limit</th>
                      <th className="text-left p-3 text-gray-400 font-light">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-500 /25">
                    <tr>
                      <td className="p-3 font-mono text-cyan">/x402/pricing</td>
                      <td className="p-3 text-white">30/minute</td>
                      <td className="p-3 text-gray-400">Public endpoint</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">/x402/supported-chains</td>
                      <td className="p-3 text-white">20/minute</td>
                      <td className="p-3 text-gray-400">Lightweight lookup</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">/x402/verify-payment</td>
                      <td className="p-3 text-white">5/minute</td>
                      <td className="p-3 text-gray-400">Blockchain RPC calls</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">/x402/generate-token</td>
                      <td className="p-3 text-white">10/minute</td>
                      <td className="p-3 text-gray-400">Token generation</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">/x402/payment/*</td>
                      <td className="p-3 text-white">30/minute</td>
                      <td className="p-3 text-gray-400">Status queries</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">/x402/stats</td>
                      <td className="p-3 text-white">15/minute</td>
                      <td className="p-3 text-gray-400">Analytics queries</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* MCP Integration */}
        {activeTab === 'mcp' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Option 1: MCP Integration (Recommended for AI Agents)</h2>

            <div className="bg-black border border-gray-500/25 rounded-lg p-6 mb-8">
              <h3 className="text-xl font-light mb-4">Claude Desktop Integration</h3>
              <p className="text-gray-400 mb-4">
                The easiest way to access KAMIYO security intelligence is via MCP subscription.
                Your AI agents get unlimited queries with persistent access through the Model Context Protocol.
              </p>

              <h4 className="font-light mb-2">Quick Setup (5 minutes):</h4>
              <ol className="list-decimal list-inside space-y-2 text-gray-400 text-sm mb-6">
                <li>Subscribe to KAMIYO MCP at <LinkButton href="/pricing">kamiyo.ai/pricing</LinkButton></li>
                <li>Receive your MCP access token via email</li>
                <li>Install the KAMIYO MCP server (Python 3.11+)</li>
                <li>Configure Claude Desktop with your token</li>
                <li>Start querying security intelligence</li>
              </ol>

              <div className="bg-black border border-gray-500/25 rounded p-4 mb-4">
                <div className="text-white text-sm mb-2">Configuration Example (macOS):</div>
                <CodeBlock language="json">{`{
  "mcpServers": {
    "kamiyo-security": {
      "command": "python3.11",
      "args": ["-m", "mcp.server"],
      "cwd": "/Users/yourname/kamiyo-mcp-server",
      "env": {
        "MCP_JWT_SECRET": "eyJhbGciOiJIUzI1NiIs...",
        "KAMIYO_API_URL": "https://api.kamiyo.ai",
        "ENVIRONMENT": "production"
      }
    }
  }
}`}</CodeBlock>
              </div>

              <div className="flex gap-4 mb-6 items-center">
                <PrimaryButton
                  onClick={(e) => { e.preventDefault(); setActiveTab('mcp-setup'); }}
                >
                  Full Setup Guide
                </PrimaryButton>
                <LinkButton
                  href="https://github.com/kamiyo-ai/kamiyo-mcp-server"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download MCP Server
                </LinkButton>
              </div>

              <h4 className="font-light mb-2">Available MCP Tools:</h4>
              <CodeBlock language="javascript">{`// Search exploit database
search_crypto_exploits(
  query: string,        // Protocol, vulnerability type, chain
  limit: number,        // Max results (capped by tier)
  since: string,        // ISO 8601 date filter
  chain: string         // Blockchain filter
)

// Assess protocol security risk
assess_defi_protocol_risk(
  protocol_name: string,
  chain: string,
  time_window_days: number
)

// Monitor wallet interactions (Team+ only)
monitor_wallet(
  wallet_address: string,
  chain: string,
  lookback_days: number
)

// Check server health
health_check()`}</CodeBlock>
            </div>

            <div className="bg-black border border-gray-500/25 rounded-lg p-6 mb-8">
              <h4 className="text-lg font-light mb-3">Example: Claude Checking Protocol Safety</h4>
              <CodeBlock language="text">{`User: "Should I deploy my contract to Uniswap V3 on Arbitrum?"

Claude: Let me check the security history for Uniswap V3 on Arbitrum...
[Calls: assess_protocol_risk(protocol="Uniswap V3", chain="arbitrum")]

KAMIYO returns: {
  "exploits_found": 2,
  "total_lost_usd": 1200000,
  "last_incident_days_ago": 145,
  "risk_score": 0.32,
  "risk_level": "moderate"
}

Claude: Based on KAMIYO data, Uniswap V3 on Arbitrum has moderate risk.
Two exploits totaling $1.2M, but the last incident was 145 days ago.
The protocol has improved security since then. Risk score: 0.32/1.0.

I'd recommend proceeding with caution: thorough audit, start with small
TVL, monitor closely for first 30 days.`}</CodeBlock>
              <p className="text-gray-400 text-sm mt-3">
                Your AI agents make security-aware decisions automatically.
              </p>
            </div>

            <div className="bg-black border border-gray-500/25 rounded-lg p-6 mb-8">
              <h4 className="text-lg font-light mb-3">Subscription Tier Access</h4>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="text-cyan font-medium mb-2">Personal ($19/mo)</div>
                  <ul className="text-gray-400 space-y-1 text-xs">
                    <li>• 1 AI agent</li>
                    <li>• Max 50 search results</li>
                    <li>• Basic risk assessment</li>
                    <li>• Real-time data (20+ sources)</li>
                    <li>• Email support</li>
                  </ul>
                </div>
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="text-cyan font-medium mb-2">Team ($99/mo)</div>
                  <ul className="text-gray-400 space-y-1 text-xs">
                    <li>• 5 concurrent agents</li>
                    <li>• Max 200 search results</li>
                    <li>• + Recent exploit summaries</li>
                    <li>• + Wallet monitoring</li>
                    <li>• Priority support</li>
                  </ul>
                </div>
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="text-cyan font-medium mb-2">Enterprise ($299/mo)</div>
                  <ul className="text-gray-400 space-y-1 text-xs">
                    <li>• Unlimited agents</li>
                    <li>• Max 1000 search results</li>
                    <li>• + Risk recommendations</li>
                    <li>• + Custom MCP tools</li>
                    <li>• Dedicated support, 99.9% SLA</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-black border border-gray-500/25 rounded-lg p-6">
              <h4 className="font-light mb-3">MCP vs x402 API - Which to use?</h4>
              <div className="grid md:grid-cols-2 gap-6 text-sm">
                <div>
                  <strong>Use MCP if:</strong>
                  <ul className="text-gray-400 mt-2 space-y-1">
                    <li>• Running AI agents (Claude, AutoGPT, etc.)</li>
                    <li>• Need unlimited queries</li>
                    <li>• Want persistent connection</li>
                    <li>• Prefer subscription billing</li>
                  </ul>
                </div>
                <div>
                  <strong>Use x402 API if:</strong>
                  <ul className="text-gray-400 mt-2 space-y-1">
                    <li>• Building custom integrations</li>
                    <li>• Making sporadic queries</li>
                    <li>• Don't need AI agent features</li>
                    <li>• Prefer pay-per-use ($0.01/query)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MCP Setup Guide */}
        {activeTab === 'mcp-setup' && (
          <div>
            <h2 className="text-2xl font-light mb-6">MCP Setup for Claude Desktop</h2>

            <div className="bg-black border border-gray-500/25 rounded-lg p-6 mb-8">
              <div className="text-cyan text-sm mb-2">Complete Integration in 5 Steps</div>
              <p className="text-gray-400 text-sm">
                Follow this guide to integrate KAMIYO security intelligence into Claude Desktop via the Model Context Protocol.
              </p>
            </div>

            {/* Step 1 */}
            <div className="mb-8 border-l-2 border-gray-500/25 pl-6">
              <h3 className="text-xl font-light mb-3">Step 1: Subscribe to KAMIYO MCP</h3>
              <p className="text-gray-400 mb-4">
                Choose your subscription tier at <LinkButton href="/pricing">kamiyo.ai/pricing</LinkButton>
              </p>
              <div className="bg-black border border-gray-500/25 rounded p-4">
                <div className="text-sm text-gray-400 space-y-2">
                  <div>• <strong>Personal:</strong> $19/month - 1 agent, unlimited queries</div>
                  <div>• <strong>Team:</strong> $99/month - 5 agents, wallet monitoring</div>
                  <div>• <strong>Enterprise:</strong> $299/month - Unlimited agents, custom tools</div>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="mb-8 border-l-2 border-gray-500/25 pl-6">
              <h3 className="text-xl font-light mb-3">Step 2: Get Your MCP Access Token</h3>
              <p className="text-gray-400 mb-4">
                After subscribing, you'll receive an email with your MCP access token:
              </p>
              <CodeBlock>{`Subject: Your KAMIYO MCP Access Token

Your MCP Access Token:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsInRpZXIiOi...

Subscription Tier: Team
Valid Until: 2026-10-28

Keep this token secure - it provides access to KAMIYO security intelligence.`}</CodeBlock>
              <p className="text-gray-400 mt-4 text-sm">
                Or retrieve it from your dashboard: <LinkButton href="/dashboard/api-keys">kamiyo.ai/dashboard/api-keys</LinkButton>
              </p>
            </div>

            {/* Step 3 */}
            <div className="mb-8 border-l-2 border-gray-500/25 pl-6">
              <h3 className="text-xl font-light mb-3">Step 3: Install the MCP Server</h3>
              <p className="text-gray-400 mb-4">
                Download and install the KAMIYO MCP server (requires Python 3.11+):
              </p>
              <CodeBlock>{`# Clone the repository
git clone https://github.com/kamiyo-ai/kamiyo-mcp-server.git
cd kamiyo-mcp-server

# Install dependencies
pip3.11 install -r requirements-mcp.txt
pip3.11 install -r requirements.txt

# Verify installation
python3.11 -m mcp.server --help`}</CodeBlock>
            </div>

            {/* Step 4 */}
            <div className="mb-8 border-l-2 border-gray-500/25 pl-6">
              <h3 className="text-xl font-light mb-3">Step 4: Configure Claude Desktop</h3>
              <p className="text-gray-400 mb-4">
                Edit your Claude Desktop configuration file:
              </p>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">macOS:</div>
                <code className="text-cyan text-xs">~/Library/Application Support/Claude/claude_desktop_config.json</code>
              </div>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Windows:</div>
                <code className="text-cyan text-xs">%APPDATA%\\Claude\\claude_desktop_config.json</code>
              </div>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Linux:</div>
                <code className="text-cyan text-xs">~/.config/Claude/claude_desktop_config.json</code>
              </div>

              <div className="mt-4">
                <div className="text-sm font-light text-gray-500 mb-2">Configuration (macOS example):</div>
                <CodeBlock language="json">{`{
  "mcpServers": {
    "kamiyo-security": {
      "command": "python3.11",
      "args": ["-m", "mcp.server"],
      "cwd": "/Users/yourname/kamiyo-mcp-server",
      "env": {
        "MCP_JWT_SECRET": "YOUR_TOKEN_HERE",
        "KAMIYO_API_URL": "https://api.kamiyo.ai",
        "ENVIRONMENT": "production"
      }
    }
  }
}`}</CodeBlock>
              </div>

              <div className="mt-4 bg-black border border-gray-500/25 rounded p-4">
                <div className="text-white text-sm mb-2">Important</div>
                <div className="text-gray-400 text-sm space-y-1">
                  <div>• Replace <code className="text-cyan">/Users/yourname/kamiyo-mcp-server</code> with your actual installation path</div>
                  <div>• Replace <code className="text-cyan">YOUR_TOKEN_HERE</code> with your MCP access token from Step 2</div>
                  <div>• Use full path to Python if <code className="text-cyan">python3.11</code> is not in PATH</div>
                </div>
              </div>
            </div>

            {/* Step 5 */}
            <div className="mb-8 border-l-2 border-gray-500/25 pl-6">
              <h3 className="text-xl font-light mb-3">Step 5: Test the Integration</h3>
              <p className="text-gray-400 mb-4">
                Restart Claude Desktop and try these test queries:
              </p>

              <div className="space-y-4">
                <div>
                  <div className="text-sm font-light text-gray-500 mb-2">Test 1: Health Check</div>
                  <CodeBlock>Check KAMIYO MCP server health</CodeBlock>
                  <div className="text-gray-400 text-xs mt-1">Expected: Server status showing "healthy"</div>
                </div>

                <div>
                  <div className="text-sm font-light text-gray-500 mb-2">Test 2: Search Exploits</div>
                  <CodeBlock>Search for recent Uniswap exploits</CodeBlock>
                  <div className="text-gray-400 text-xs mt-1">Expected: List of Uniswap security incidents</div>
                </div>

                <div>
                  <div className="text-sm font-light text-gray-500 mb-2">Test 3: Risk Assessment</div>
                  <CodeBlock>Assess the security risk of Curve Finance on Ethereum</CodeBlock>
                  <div className="text-gray-400 text-xs mt-1">Expected: Risk score and recommendations (varies by tier)</div>
                </div>
              </div>
            </div>

            {/* Troubleshooting */}
            <div className="bg-black border border-gray-500/25 rounded-lg p-6 mb-8">
              <h3 className="text-lg font-light mb-4">Troubleshooting</h3>
              <div className="space-y-4 text-sm">
                <div>
                  <div className="text-white mb-2">MCP server not found</div>
                  <div className="text-gray-400">
                    Use full path to Python: <code className="text-cyan">/usr/local/bin/python3.11</code>
                  </div>
                </div>
                <div>
                  <div className="text-white mb-2">Invalid token error</div>
                  <div className="text-gray-400">
                    Regenerate token at <LinkButton href="/dashboard/api-keys">kamiyo.ai/dashboard/api-keys</LinkButton>
                  </div>
                </div>
                <div>
                  <div className="text-white mb-2">Subscription inactive</div>
                  <div className="text-gray-400">
                    Check billing status at <LinkButton href="/dashboard/billing">kamiyo.ai/dashboard/billing</LinkButton>
                  </div>
                </div>
              </div>
            </div>

            {/* Documentation Links */}
            <div className="bg-black border border-gray-500/25 rounded-lg p-6">
              <h3 className="text-lg font-light mb-4">Additional Resources</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-white mb-2">Documentation</div>
                  <ul className="text-gray-400 space-y-1">
                    <li>• <LinkButton href="https://github.com/kamiyo-ai/kamiyo-mcp-server">GitHub Repository</LinkButton></li>
                    <li>• <LinkButton href="/docs/MCP_SETUP_GUIDE.md">Full Setup Guide (PDF)</LinkButton></li>
                    <li>• <LinkButton onClick={(e) => { e.preventDefault(); setActiveTab('mcp'); }}>MCP Integration Overview</LinkButton></li>
                  </ul>
                </div>
                <div>
                  <div className="text-white mb-2">Support</div>
                  <ul className="text-gray-400 space-y-1">
                    <li>• Email: <LinkButton href="mailto:support@kamiyo.ai">support@kamiyo.ai</LinkButton></li>
                    <li>• Discord: <LinkButton href="https://discord.gg/kamiyo">discord.gg/kamiyo</LinkButton></li>
                    <li>• Status: <LinkButton href="https://status.kamiyo.ai">status.kamiyo.ai</LinkButton></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Start */}
        {activeTab === 'quickstart' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Option 2: x402 API Quick Start (For Direct/Custom Access)</h2>

            <div className="bg-black border border-gray-500/25 rounded-lg p-6 mb-8">
              <div className="text-cyan text-sm mb-2">5-Minute Setup</div>
              <p className="text-gray-400 text-sm">
                Get started with x402 payments in 5 minutes. No account signup, no API keys, just send USDC and start querying security intelligence at $0.01 per query.
              </p>
            </div>

            <div className="space-y-8">
              <div className="border-l-2 border-gray-500/25 pl-6">
                <div className="text-white font-medium mb-2">Step 1: Discover Pricing</div>
                <p className="text-gray-400 text-sm mb-4">
                  Make any API request without authentication to receive pricing information via HTTP 402:
                </p>
                <CodeBlock>{`curl https://api.kamiyo.ai/v1/exploits`}</CodeBlock>
                <div className="mt-4">
                  <div className="text-sm font-light text-gray-500 mb-2">Response: HTTP 402 Payment Required</div>
                  <CodeBlock language="json">{`{
  "error": "payment_required",
  "payment_info": {
    "amount_usdc": 0.01,
    "supported_chains": ["base", "ethereum", "solana"],
    "payment_addresses": {
      "base": "0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7",
      "ethereum": "0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7",
      "solana": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
    }
  }
}`}</CodeBlock>
                </div>
              </div>

              <div className="border-l-2 border-gray-500/25 pl-6">
                <div className="text-white font-medium mb-2">Step 2: Send USDC Payment</div>
                <p className="text-gray-400 text-sm mb-4">
                  Transfer USDC to one of the payment addresses on your preferred chain. Example with Base:
                </p>
                <CodeBlock language="javascript">{`// Using ethers.js
const usdc = new ethers.Contract(USDC_ADDRESS_BASE, USDC_ABI, wallet);
const tx = await usdc.transfer(
  "0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7",
  ethers.utils.parseUnits("1.00", 6) // $1 USDC = 10 API calls
);
await tx.wait();
console.log("Payment sent:", tx.hash);`}</CodeBlock>
              </div>

              <div className="border-l-2 border-gray-500/25 pl-6">
                <div className="text-white font-medium mb-2">Step 3: Verify Payment</div>
                <p className="text-gray-400 text-sm mb-4">
                  Verify your payment and receive a payment token:
                </p>
                <CodeBlock>{`curl -X POST https://api.kamiyo.ai/x402/verify-payment \\
  -H "Content-Type: application/json" \\
  -d '{
    "tx_hash": "0xabc123...",
    "chain": "base",
    "expected_amount": 1.00
  }'`}</CodeBlock>
                <div className="mt-4">
                  <div className="text-sm font-light text-gray-500 mb-2">Response</div>
                  <CodeBlock language="json">{`{
  "is_valid": true,
  "verification": {
    "tx_hash": "0xabc123...",
    "chain": "base",
    "amount_usdc": 1.00,
    "confirmations": 6,
    "risk_score": 0.1
  },
  "payment_id": 42
}`}</CodeBlock>
                </div>
              </div>

              <div className="border-l-2 border-gray-500/25 pl-6">
                <div className="text-white font-medium mb-2">Step 4: Generate Payment Token</div>
                <p className="text-gray-400 text-sm mb-4">
                  Generate a reusable payment token for your verified payment:
                </p>
                <CodeBlock>{`curl -X POST https://api.kamiyo.ai/x402/generate-token/42`}</CodeBlock>
                <div className="mt-4">
                  <div className="text-sm font-light text-gray-500 mb-2">Response</div>
                  <CodeBlock language="json">{`{
  "payment_token": "kmy_a1b2c3d4e5f6g7h8i9j0...",
  "payment_id": 42,
  "expires_at": "2025-10-29T12:00:00Z",
  "requests_remaining": 10
}`}</CodeBlock>
                </div>
              </div>

              <div className="border-l-2 border-gray-500/25 pl-6">
                <div className="text-white font-medium mb-2">Step 5: Make API Calls</div>
                <p className="text-gray-400 text-sm mb-4">
                  Use your payment token to access the API:
                </p>
                <CodeBlock>{`curl -H "x-payment-token: kmy_a1b2c3d4e5f6g7h8i9j0..." \\
  https://api.kamiyo.ai/v1/exploits?chain=ethereum`}</CodeBlock>
                <div className="mt-4 bg-black border border-gray-500/25 rounded-lg p-4">
                  <div className="text-cyan text-sm mb-2">Success!</div>
                  <div className="text-gray-400 text-sm">
                    Your payment token is valid for 24 hours and has 10 API calls remaining. Each call decrements the counter.
                  </div>
                </div>
              </div>
            </div>

            {/* Troubleshooting */}
            <div className="bg-black border border-gray-500/25 rounded-lg p-6 mt-8">
              <h3 className="text-lg font-light mb-4">Common Issues</h3>
              <div className="space-y-4 text-sm">
                <details className="cursor-pointer">
                  <summary className="text-white hover:text-magenta transition-colors font-medium mb-2">
                    Payment verified but token not working
                  </summary>
                  <div className="mt-2 text-gray-400 pl-4 space-y-1">
                    <div>• Check token hasn't expired (24hr limit)</div>
                    <div>• Verify <code className="text-cyan">requests_remaining {'>'} 0</code></div>
                    <div>• Confirm you're using <code className="text-cyan">x-payment-token</code> header (not Authorization)</div>
                    <div>• Check for typos in token - it should start with <code className="text-cyan">kmy_</code></div>
                  </div>
                </details>

                <details className="cursor-pointer">
                  <summary className="text-white hover:text-magenta transition-colors font-medium mb-2">
                    Insufficient confirmations error
                  </summary>
                  <div className="mt-2 text-gray-400 pl-4 space-y-1">
                    <div>• <strong>Base:</strong> Wait ~30 seconds (6 confirmations required)</div>
                    <div>• <strong>Ethereum:</strong> Wait ~3 minutes (12 confirmations required)</div>
                    <div>• <strong>Solana:</strong> Wait ~13 seconds (32 confirmations required)</div>
                    <div>• Check transaction status on block explorer before retrying</div>
                  </div>
                </details>

                <details className="cursor-pointer">
                  <summary className="text-white hover:text-magenta transition-colors font-medium mb-2">
                    Transaction already used error
                  </summary>
                  <div className="mt-2 text-gray-400 pl-4 space-y-1">
                    <div>• Each transaction hash can only be used once</div>
                    <div>• If you need more requests, make a new payment</div>
                    <div>• Check if you already generated a token for this payment</div>
                  </div>
                </details>

                <details className="cursor-pointer">
                  <summary className="text-white hover:text-magenta transition-colors font-medium mb-2">
                    Wrong payment amount sent
                  </summary>
                  <div className="mt-2 text-gray-400 pl-4 space-y-1">
                    <div>• Minimum payment: $0.01 USDC</div>
                    <div>• $1 USDC = 100 queries (not 10)</div>
                    <div>• Cannot refund - make a new payment with correct amount</div>
                  </div>
                </details>

                <details className="cursor-pointer">
                  <summary className="text-white hover:text-magenta transition-colors font-medium mb-2">
                    High risk score rejection
                  </summary>
                  <div className="mt-2 text-gray-400 pl-4 space-y-1">
                    <div>• Payment came from sanctioned or high-risk address</div>
                    <div>• Use a different wallet not associated with sanctioned entities</div>
                    <div>• Contact <LinkButton href="mailto:support@kamiyo.ai">support@kamiyo.ai</LinkButton> if you believe this is an error</div>
                  </div>
                </details>
              </div>
            </div>
          </div>
        )}

        {/* Authentication */}
        {activeTab === 'authentication' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Authentication</h2>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Payment Tokens</h3>
              <p className="text-gray-400 mb-4">
                After verifying your on-chain USDC payment, you'll receive a payment token that grants API access.
              </p>

              <div className="bg-black border border-gray-500/25 rounded-lg p-4 mb-4">
                <div className="text-cyan text-sm mb-2">Token Format</div>
                <div className="text-gray-400 text-sm space-y-1">
                  <div>• Prefix: <code className="text-cyan font-mono">kmy_</code></div>
                  <div>• Length: 64 hexadecimal characters</div>
                  <div>• Total: 68 characters (prefix + hash)</div>
                  <div>• Storage: SHA256 hashed in database</div>
                </div>
              </div>

              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Using Payment Tokens</div>
                <p className="text-gray-400 text-sm mb-2">
                  Include your payment token in the <code className="text-cyan">x-payment-token</code> header:
                </p>
                <CodeBlock>{`curl -H "x-payment-token: kmy_your_token_here" \\
  https://api.kamiyo.ai/v1/exploits`}</CodeBlock>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Token Lifecycle</h3>
              <div className="space-y-4">
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="text-white font-medium mb-2">1. Creation</div>
                  <p className="text-gray-400 text-sm">
                    Tokens are generated after successful payment verification using <code className="text-cyan">/x402/generate-token</code>.
                  </p>
                </div>
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="text-white font-medium mb-2">2. Validation</div>
                  <p className="text-gray-400 text-sm">
                    Each API request validates the token, checks expiry, and verifies remaining requests.
                  </p>
                </div>
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="text-white font-medium mb-2">3. Consumption</div>
                  <p className="text-gray-400 text-sm">
                    Each API call decrements the request counter. When requests reach zero, the token becomes invalid.
                  </p>
                </div>
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="text-white font-medium mb-2">4. Expiration</div>
                  <p className="text-gray-400 text-sm">
                    Tokens expire 24 hours after creation, regardless of remaining requests.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Security Best Practices</h3>
              <div className="space-y-2 text-sm text-gray-400">
                <div>• Never commit payment tokens to version control</div>
                <div>• Store tokens in environment variables</div>
                <div>• Tokens are shown only once - save them securely</div>
                <div>• Each payment can generate only one token</div>
                <div>• Monitor token usage via <code className="text-cyan">/x402/payment/:id</code></div>
                <div>• Tokens are hashed with SHA256 before database storage</div>
              </div>
            </div>
          </div>
        )}

        {/* Payment Flow */}
        {activeTab === 'payment-flow' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Complete Payment Flow</h2>

            <div className="bg-black border border-gray-500/25 rounded-lg p-6 mb-8">
              <div className="text-cyan text-sm mb-2">End-to-End Flow</div>
              <p className="text-gray-400 text-sm">
                Understanding the complete x402 payment flow from discovery to API access.
              </p>
            </div>

            <div className="space-y-6 mb-8">
              <div className="bg-black border border-gray-500/25 rounded p-4">
                <div className="flex items-start gap-3">
                  <div className="text-cyan font-mono text-sm mt-1">1</div>
                  <div>
                    <div className="text-white font-medium mb-2">Price Discovery (HTTP 402)</div>
                    <p className="text-gray-400 text-sm mb-3">
                      AI agent makes API request without payment. Server responds with 402 Payment Required including pricing and payment addresses.
                    </p>
                    <CodeBlock language="http">{`HTTP/1.1 402 Payment Required
X-Payment-Amount: 0.01
X-Payment-Currency: USDC

{
  "error": "payment_required",
  "payment_info": {...}
}`}</CodeBlock>
                  </div>
                </div>
              </div>

              <div className="bg-black border border-gray-500/25 rounded p-4">
                <div className="flex items-start gap-3">
                  <div className="text-cyan font-mono text-sm mt-1">2</div>
                  <div>
                    <div className="text-white font-medium mb-2">On-Chain Payment</div>
                    <p className="text-gray-400 text-sm mb-3">
                      Agent transfers USDC to payment address on chosen chain (Base, Ethereum, or Solana).
                    </p>
                    <CodeBlock language="javascript">{`const tx = await usdc.transfer(paymentAddress, amount);
const txHash = tx.hash; // Save for verification`}</CodeBlock>
                  </div>
                </div>
              </div>

              <div className="bg-black border border-gray-500/25 rounded p-4">
                <div className="flex items-start gap-3">
                  <div className="text-cyan font-mono text-sm mt-1">3</div>
                  <div>
                    <div className="text-white font-medium mb-2">Payment Verification</div>
                    <p className="text-gray-400 text-sm mb-3">
                      Agent calls <code className="text-cyan">/x402/verify-payment</code> with transaction hash. Server verifies on-chain.
                    </p>
                    <div className="bg-black border border-gray-500/25 rounded p-3 text-sm text-gray-400 mb-3">
                      <div className="text-white mb-2">Verification Checks:</div>
                      <div>✓ Transaction exists on blockchain</div>
                      <div>✓ Sufficient confirmations (6-32 depending on chain)</div>
                      <div>✓ Correct payment address</div>
                      <div>✓ Correct USDC amount</div>
                      <div>✓ Not already used for another payment</div>
                      <div>✓ Risk score below threshold</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-black border border-gray-500/25 rounded p-4">
                <div className="flex items-start gap-3">
                  <div className="text-cyan font-mono text-sm mt-1">4</div>
                  <div>
                    <div className="text-white font-medium mb-2">Token Generation</div>
                    <p className="text-gray-400 text-sm mb-3">
                      Agent generates payment token for the verified payment using <code className="text-cyan">/x402/generate-token</code>.
                    </p>
                    <CodeBlock language="json">{`{
  "payment_token": "kmy_...",
  "requests_remaining": 10,
  "expires_at": "2025-10-29T12:00:00Z"
}`}</CodeBlock>
                  </div>
                </div>
              </div>

              <div className="bg-black border border-gray-500/25 rounded p-4">
                <div className="flex items-start gap-3">
                  <div className="text-cyan font-mono text-sm mt-1">5</div>
                  <div>
                    <div className="text-white font-medium mb-2">API Access</div>
                    <p className="text-gray-400 text-sm mb-3">
                      Agent uses payment token to make API requests. Each call decrements the request counter.
                    </p>
                    <CodeBlock>{`curl -H "x-payment-token: kmy_..." \\
  https://api.kamiyo.ai/v1/exploits`}</CodeBlock>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-black border border-gray-500/25 rounded-lg p-4">
              <div className="text-white text-sm mb-2">Important Notes</div>
              <div className="text-gray-400 text-sm space-y-1">
                <div>• Payments must have sufficient confirmations before verification succeeds</div>
                <div>• Each transaction hash can only be used once for payment</div>
                <div>• Payment tokens expire after 24 hours, even if requests remain</div>
                <div>• Monitor remaining requests via <code className="text-cyan">/x402/payment/:id</code></div>
              </div>
            </div>
          </div>
        )}

        {/* Endpoints */}
        {activeTab === 'endpoints' && (
          <div>
            <h2 className="text-2xl font-light mb-6">API Endpoints Reference</h2>

            {/* GET /x402/pricing */}
            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">GET /x402/pricing</h3>
              <p className="text-gray-400 mb-4">Get complete pricing information and payment configuration.</p>
              <CodeBlock>{`curl https://api.kamiyo.ai/x402/pricing`}</CodeBlock>
              <div className="mt-4">
                <div className="text-sm font-light text-gray-500 mb-2">Response</div>
                <CodeBlock language="json">{`{
  "pricing_tiers": {
    "pay_per_use": {
      "price_per_call": 0.01,
      "min_payment": 0.01,
      "requests_per_dollar": 100.0,
      "supported_chains": ["base", "ethereum", "solana"],
      "token_expiry_hours": 24
    },
    "subscription_included": {
      "pro_tier": {
        "monthly_price": 89.00,
        "included_calls": 50000,
        "overage_enabled": false
      },
      "team_tier": {
        "monthly_price": 199.00,
        "included_calls": 100000,
        "overage_enabled": false
      },
      "enterprise_tier": {
        "monthly_price": 499.00,
        "included_calls": "unlimited",
        "overage_enabled": false
      }
    }
  },
  "endpoint_specific_pricing": {
    "/exploits": 0.01,
    "/stats": 0.01,
    "/chains": 0.01,
    "/health": 0.01
  },
  "payment_methods": [
    {
      "type": "onchain",
      "description": "Send USDC payment on supported chains",
      "instructions": "Use /x402/verify-payment after payment"
    },
    {
      "type": "token",
      "description": "Use payment token for multiple requests",
      "instructions": "Use /x402/generate-token after payment verification"
    }
  ],
  "payment_addresses": {
    "base": "0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7",
    "ethereum": "0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7",
    "solana": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  }
}`}</CodeBlock>
              </div>
            </div>

            {/* GET /x402/supported-chains */}
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
  "min_payment_amount": 0.01
}`}</CodeBlock>
              </div>
            </div>

            {/* POST /x402/verify-payment */}
            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">POST /x402/verify-payment</h3>
              <p className="text-gray-400 mb-4">Verify on-chain USDC payment and create payment record.</p>
              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Request Body</div>
                <div className="border border-gray-500/25 rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-500 bg-opacity-10">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-light">Field</th>
                        <th className="text-left p-3 text-gray-400 font-light">Type</th>
                        <th className="text-left p-3 text-gray-400 font-light">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-500 /25">
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
  "tx_hash": "0xabc123...",
  "chain": "base",
  "amount_usdc": 1.00,
  "from_address": "0xdef456...",
  "to_address": "0x742d35...",
  "block_number": 12345678,
  "confirmations": 12,
  "risk_score": 0.1,
  "error_message": null,
  "payment_id": 42
}`}</CodeBlock>
              </div>
              <div className="mt-4">
                <div className="text-sm font-light text-gray-500 mb-2">Response (Insufficient Confirmations)</div>
                <CodeBlock language="json">{`{
  "is_valid": false,
  "tx_hash": "0xabc123...",
  "chain": "ethereum",
  "confirmations": 3,
  "error_message": "Insufficient confirmations: 3/12 required"
}`}</CodeBlock>
              </div>
            </div>

            {/* POST /x402/generate-token/{payment_id} */}
            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">POST /x402/generate-token/:payment_id</h3>
              <p className="text-gray-400 mb-4">Generate payment access token for verified payment.</p>
              <CodeBlock>{`curl -X POST https://api.kamiyo.ai/x402/generate-token/42`}</CodeBlock>
              <div className="mt-4">
                <div className="text-sm font-light text-gray-500 mb-2">Response</div>
                <CodeBlock language="json">{`{
  "payment_token": "kmy_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0...",
  "payment_id": 42,
  "expires_at": "2025-10-29T12:00:00Z",
  "requests_remaining": 10
}`}</CodeBlock>
              </div>
              <div className="mt-4 bg-black border border-gray-500/25 rounded-lg p-4">
                <div className="text-white text-sm mb-2">Important</div>
                <div className="text-gray-400 text-sm">
                  The payment token is only shown once. Store it securely. Tokens are hashed with SHA256 before database storage and cannot be retrieved later.
                </div>
              </div>
            </div>

            {/* GET /x402/payment/{payment_id} */}
            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">GET /x402/payment/:payment_id</h3>
              <p className="text-gray-400 mb-4">Get payment status and remaining requests.</p>
              <CodeBlock>{`curl https://api.kamiyo.ai/x402/payment/42`}</CodeBlock>
              <div className="mt-4">
                <div className="text-sm font-light text-gray-500 mb-2">Response</div>
                <CodeBlock language="json">{`{
  "payment_id": 42,
  "tx_hash": "0xabc123...",
  "chain": "base",
  "amount_usdc": 1.00,
  "from_address": "0xdef456...",
  "status": "verified",
  "risk_score": 0.1,
  "created_at": "2025-10-28T12:00:00Z",
  "expires_at": "2025-10-29T12:00:00Z",
  "requests_remaining": 7
}`}</CodeBlock>
              </div>
            </div>

            {/* GET /x402/stats */}
            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">GET /x402/stats</h3>
              <p className="text-gray-400 mb-4">Get payment analytics and statistics.</p>
              <div className="mb-4">
                <div className="text-sm font-light text-gray-500 mb-2">Query Parameters</div>
                <div className="border border-gray-500/25 rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-500 bg-opacity-10">
                      <tr>
                        <th className="text-left p-3 text-gray-400 font-light">Parameter</th>
                        <th className="text-left p-3 text-gray-400 font-light">Type</th>
                        <th className="text-left p-3 text-gray-400 font-light">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-500 /25">
                      <tr>
                        <td className="p-3 font-mono text-cyan">from_address</td>
                        <td className="p-3 text-gray-400">string</td>
                        <td className="p-3 text-gray-400">Optional: Filter stats by payer address</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <CodeBlock>{`curl https://api.kamiyo.ai/x402/stats`}</CodeBlock>
              <div className="mt-4">
                <div className="text-sm font-light text-gray-500 mb-2">Response</div>
                <CodeBlock language="json">{`{
  "total_payments": 1247,
  "total_amount_usdc": 3542.50,
  "active_payments": 892,
  "average_payment": 2.84,
  "total_requests_used": 28340
}`}</CodeBlock>
              </div>
            </div>
          </div>
        )}

        {/* JavaScript SDK */}
        {activeTab === 'sdk' && (
          <div>
            <h2 className="text-2xl font-light mb-6">JavaScript SDK</h2>

            <div className="bg-black border border-gray-500/25 rounded-lg p-6 mb-8">
              <div className="text-cyan text-sm mb-2">Automated x402 Payment Handling</div>
              <p className="text-gray-400 text-sm">
                Use our JavaScript SDK to automatically handle HTTP 402 responses, make USDC payments, verify on-chain, and retry API requests with payment tokens.
              </p>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Installation</h3>
              <CodeBlock>{`npm install kamiyo-x402-sdk`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Basic Usage</h3>
              <CodeBlock language="javascript">{`const { KamiyoClient } = require('kamiyo-x402-sdk');

// Initialize client with wallet
const client = new KamiyoClient({
  chain: 'base', // or 'ethereum', 'solana'
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY
});

// SDK automatically handles 402 responses and payments
const exploits = await client.getExploits({
  chain: 'ethereum',
  start_date: '2025-01-01',
  min_amount: 1000000
});

console.log(\`Found \${exploits.length} exploits\`);`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">How It Works</h3>
              <div className="space-y-4">
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="text-white font-medium mb-2">1. Automatic 402 Detection</div>
                  <p className="text-gray-400 text-sm">
                    SDK intercepts HTTP 402 responses and extracts payment information.
                  </p>
                </div>
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="text-white font-medium mb-2">2. USDC Payment</div>
                  <p className="text-gray-400 text-sm">
                    Automatically sends USDC payment to the specified address on your preferred chain.
                  </p>
                </div>
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="text-white font-medium mb-2">3. Payment Verification</div>
                  <p className="text-gray-400 text-sm">
                    Waits for required confirmations and verifies payment on-chain.
                  </p>
                </div>
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="text-white font-medium mb-2">4. Token Management</div>
                  <p className="text-gray-400 text-sm">
                    Generates and caches payment token for subsequent requests.
                  </p>
                </div>
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="text-white font-medium mb-2">5. Request Retry</div>
                  <p className="text-gray-400 text-sm">
                    Automatically retries original API request with payment token.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Advanced Configuration</h3>
              <CodeBlock language="javascript">{`const client = new KamiyoClient({
  chain: 'base',
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY,

  // Optional: Configure payment behavior
  payment: {
    maxRetries: 3,
    confirmationWaitTime: 30000, // 30 seconds
    autoPaymentEnabled: true,
    maxPaymentAmount: 10.00 // Max USDC per payment
  },

  // Optional: Configure API behavior
  api: {
    baseURL: 'https://api.kamiyo.ai',
    timeout: 30000,
    retryOn402: true
  }
});

// Manual payment control
client.on('payment_required', async (paymentInfo) => {
  console.log(\`Payment required: \${paymentInfo.amount_usdc} USDC\`);
  // Approve payment
  return true;
});

client.on('payment_sent', (txHash) => {
  console.log(\`Payment sent: \${txHash}\`);
});

client.on('payment_verified', (paymentToken) => {
  console.log(\`Payment verified, token: \${paymentToken}\`);
});`}</CodeBlock>
            </div>

            <div className="bg-black border border-gray-500/25 rounded-lg p-4">
              <div className="text-cyan text-sm mb-2">Coming Soon</div>
              <div className="text-gray-400 text-sm space-y-1">
                <div>• Python SDK for x402 payment automation</div>
                <div>• Go SDK for high-performance AI agents</div>
                <div>• Rust SDK for blockchain-native applications</div>
              </div>
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
  "error_code": "INSUFFICIENT_CONFIRMATIONS",
  "message": "Payment verification failed",
  "details": "Transaction has 3/12 required confirmations",
  "timestamp": "2025-10-28T12:00:00Z"
}`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">HTTP Status Codes</h3>
              <div className="border border-gray-500/25 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-500 bg-opacity-10">
                    <tr>
                      <th className="text-left p-3 text-gray-400 font-light">Code</th>
                      <th className="text-left p-3 text-gray-400 font-light">Status</th>
                      <th className="text-left p-3 text-gray-400 font-light">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-500 /25">
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
                      <td className="p-3 font-mono text-cyan">402</td>
                      <td className="p-3 text-white">Payment Required</td>
                      <td className="p-3 text-gray-400">Payment needed to access resource</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">404</td>
                      <td className="p-3 text-white">Not Found</td>
                      <td className="p-3 text-gray-400">Payment or resource not found</td>
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
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Common Error Codes</h3>

              <div className="space-y-6">
                <div className="border border-gray-500/25 rounded p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-cyan font-mono text-sm">PAYMENT_REQUIRED</span>
                    <span className="text-gray-500 text-sm">(402)</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">Payment needed to access the requested resource.</p>
                  <CodeBlock language="json">{`{
  "error": "payment_required",
  "payment_info": {
    "amount_usdc": 0.01,
    "supported_chains": ["base", "ethereum", "solana"],
    "payment_addresses": {...}
  }
}`}</CodeBlock>
                </div>

                <div className="border border-gray-500/25 rounded p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-cyan font-mono text-sm">INSUFFICIENT_CONFIRMATIONS</span>
                    <span className="text-gray-500 text-sm">(400)</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">Transaction doesn't have enough confirmations yet.</p>
                  <CodeBlock language="json">{`{
  "error": true,
  "error_code": "INSUFFICIENT_CONFIRMATIONS",
  "message": "Transaction has 3/12 required confirmations",
  "details": "Wait for more confirmations and try again"
}`}</CodeBlock>
                </div>

                <div className="border border-gray-500/25 rounded p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-cyan font-mono text-sm">INVALID_PAYMENT_AMOUNT</span>
                    <span className="text-gray-500 text-sm">(400)</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">Payment amount doesn't match expected amount.</p>
                  <CodeBlock language="json">{`{
  "error": true,
  "error_code": "INVALID_PAYMENT_AMOUNT",
  "message": "Payment amount mismatch",
  "details": "Expected 1.00 USDC, received 0.50 USDC"
}`}</CodeBlock>
                </div>

                <div className="border border-gray-500/25 rounded p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-cyan font-mono text-sm">PAYMENT_ALREADY_USED</span>
                    <span className="text-gray-500 text-sm">(400)</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">Transaction hash already used for another payment.</p>
                  <CodeBlock language="json">{`{
  "error": true,
  "error_code": "PAYMENT_ALREADY_USED",
  "message": "Transaction already used for payment",
  "details": "Each transaction can only be used once"
}`}</CodeBlock>
                </div>

                <div className="border border-gray-500/25 rounded p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-cyan font-mono text-sm">PAYMENT_TOKEN_EXPIRED</span>
                    <span className="text-gray-500 text-sm">(401)</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">Payment token has expired or is invalid.</p>
                  <CodeBlock language="json">{`{
  "error": true,
  "error_code": "PAYMENT_TOKEN_EXPIRED",
  "message": "Payment token expired",
  "details": "Token expired at 2025-10-28T12:00:00Z"
}`}</CodeBlock>
                </div>

                <div className="border border-gray-500/25 rounded p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-cyan font-mono text-sm">NO_REQUESTS_REMAINING</span>
                    <span className="text-gray-500 text-sm">(402)</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">Payment token has no remaining requests.</p>
                  <CodeBlock language="json">{`{
  "error": "payment_required",
  "message": "No requests remaining on payment token",
  "payment_info": {...}
}`}</CodeBlock>
                </div>

                <div className="border border-gray-500/25 rounded p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-cyan font-mono text-sm">HIGH_RISK_SCORE</span>
                    <span className="text-gray-500 text-sm">(400)</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">Payment has high risk score (likely from sanctioned address).</p>
                  <CodeBlock language="json">{`{
  "error": true,
  "error_code": "HIGH_RISK_SCORE",
  "message": "Payment rejected due to high risk score",
  "details": "Risk score: 0.95 (threshold: 0.50)"
}`}</CodeBlock>
                </div>

                <div className="border border-gray-500/25 rounded p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-cyan font-mono text-sm">RATE_LIMIT_EXCEEDED</span>
                    <span className="text-gray-500 text-sm">(429)</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">Too many requests to rate-limited endpoint.</p>
                  <CodeBlock language="json">{`{
  "error": true,
  "error_code": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded",
  "details": "5 requests per minute limit reached",
  "retry_after": 45
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
                  <span>For 402 responses, extract payment info and initiate USDC payment</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-cyan">•</span>
                  <span>For INSUFFICIENT_CONFIRMATIONS, wait and retry verification</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-cyan">•</span>
                  <span>For PAYMENT_TOKEN_EXPIRED, make new payment and get new token</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-cyan">•</span>
                  <span>For rate limits (429), implement exponential backoff</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-cyan">•</span>
                  <span>For 5xx errors, retry with increasing delays</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Support Section */}
        <div className="mt-12 bg-black border border-gray-500/25 rounded-lg p-6">
          <h3 className="text-xl font-light mb-4">Need Help?</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <div className="text-gray-400 mb-2">Documentation Issues</div>
              <div className="text-white">Contact <LinkButton href="mailto:support@kamiyo.ai">support@kamiyo.ai</LinkButton></div>
            </div>
            <div>
              <div className="text-gray-400 mb-2">x402 Integration Support</div>
              <div className="text-white">Email <LinkButton href="mailto:integrations@kamiyo.ai">integrations@kamiyo.ai</LinkButton></div>
            </div>
            <div>
              <div className="text-gray-400 mb-2">API Status</div>
              <div className="text-white"><LinkButton href="https://status.kamiyo.ai">status.kamiyo.ai</LinkButton></div>
            </div>
            <div>
              <div className="text-gray-400 mb-2">GitHub Repository</div>
              <div className="text-white"><LinkButton href="https://github.com/kamiyo-ai">github.com/kamiyo-ai</LinkButton></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
