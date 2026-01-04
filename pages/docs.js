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
        title="Docs - Trust Infrastructure for Autonomous Agents | KAMIYO"
        description="Complete documentation for KAMIYO trust infrastructure: escrow agreements, multi-oracle disputes, agent identity, and x402 payment verification. TypeScript SDK for Solana."
        canonical="https://kamiyo.ai/docs"
      />

      <section className="py-10 px-5 mx-auto max-w-[1400px]">
        <div className="subheading-border mb-12 pb-6">
          <p className="font-light text-sm uppercase tracking-widest gradient-text mb-4 md:mb-8">— &nbsp;Docs ドキュメント</p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-light leading-[1.25]">KAMIYO Protocol</h1>
          <p className="text-gray-400 mt-4">
            Trust infrastructure for autonomous agents. Escrow, disputes, and reputation on Solana.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-500/25 pb-4">
          {['overview', 'escrow', 'disputes', 'agents', 'x402', 'sdks'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-light transition-colors ${
                activeTab === tab
                  ? 'text-white border-b-2 border-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab === 'escrow' ? 'Escrow' :
               tab === 'disputes' ? 'Disputes' :
               tab === 'agents' ? 'Agent Identity' :
               tab === 'x402' ? 'x402 Verification' :
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
                KAMIYO provides trust infrastructure for autonomous agents on Solana. Lock payments in escrow,
                resolve disputes with multi-oracle consensus, and build verifiable reputation.
              </p>
              <div className="text-white text-sm space-y-2">
                <div>• <strong>Escrow Agreements:</strong> PDA-based payment locks with configurable time-locks</div>
                <div>• <strong>Dispute Resolution:</strong> Multi-oracle consensus with quality-based refunds (0-100%)</div>
                <div>• <strong>Agent Identity:</strong> Stake-backed identities with on-chain reputation</div>
                <div>• <strong>x402 Compatible:</strong> Escrow protection for x402 payment flows</div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Program ID</h3>
              <CodeBlock>8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM</CodeBlock>
              <p className="text-gray-400 text-sm mt-2">Deployed on Solana mainnet and devnet.</p>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Installation</h3>
              <CodeBlock>npm install @kamiyo/sdk</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Quick Example</h3>
              <CodeBlock>{`import { KAMIYOClient, AgentType } from '@kamiyo/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.generate();
const client = new KAMIYOClient({ connection, wallet });

// Create agent with stake collateral
await client.createAgent({
  name: 'TradingBot',
  agentType: AgentType.Trading,
  stakeAmount: 500_000_000  // 0.5 SOL
});

// Lock payment in escrow
await client.createAgreement({
  provider: providerPubkey,
  amount: 100_000_000,  // 0.1 SOL
  timeLockSeconds: 86400,
  transactionId: 'order-123'
});

// Release on success or dispute for arbitration
await client.releaseFunds('order-123', providerPubkey);
// or: await client.markDisputed('order-123');`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Fees</h3>
              <div className="border border-gray-800 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-800">
                    <tr>
                      <td className="p-3 text-gray-400">Escrow creation</td>
                      <td className="p-3 text-white">0.1% (min 5,000 lamports)</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-gray-400">Dispute resolution</td>
                      <td className="p-3 text-white">1% protocol + 1% oracle pool</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-gray-400">Successful release</td>
                      <td className="p-3 text-white">No fee</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Escrow */}
        {activeTab === 'escrow' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Escrow Agreements</h2>
            <p className="text-gray-400 mb-6">
              Lock payments in PDA-based escrows with configurable time-locks. Funds release on success or go to dispute resolution.
            </p>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">createAgreement</h3>
              <p className="text-gray-400 text-sm mb-4">Lock funds in escrow before requesting a service.</p>
              <CodeBlock>{`import { KAMIYOClient } from '@kamiyo/sdk';

const client = new KAMIYOClient({ connection, wallet });

const tx = await client.createAgreement({
  provider: providerPubkey,      // Service provider's public key
  amount: 100_000_000,           // Amount in lamports (0.1 SOL)
  timeLockSeconds: 86400,        // 24 hour lock period
  transactionId: 'order-123'     // Unique identifier
});

// PDA derivation
const [agreementPDA] = client.getAgreementPDA(agentPDA, 'order-123');`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">releaseFunds</h3>
              <p className="text-gray-400 text-sm mb-4">Release escrowed funds to the provider after successful service delivery.</p>
              <CodeBlock>{`// Release funds to provider (happy path)
const tx = await client.releaseFunds('order-123', providerPubkey);

// Funds transfer immediately, no fee charged`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Account Structure</h3>
              <div className="border border-gray-800 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 bg-opacity-50">
                    <tr>
                      <th className="text-left p-3 text-gray-400 font-light">Field</th>
                      <th className="text-left p-3 text-gray-400 font-light">Type</th>
                      <th className="text-left p-3 text-gray-400 font-light">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    <tr>
                      <td className="p-3 font-mono text-cyan">agent</td>
                      <td className="p-3 text-gray-400">Pubkey</td>
                      <td className="p-3 text-gray-400">Agent PDA who created the agreement</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">provider</td>
                      <td className="p-3 text-gray-400">Pubkey</td>
                      <td className="p-3 text-gray-400">Service provider's address</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">amount</td>
                      <td className="p-3 text-gray-400">u64</td>
                      <td className="p-3 text-gray-400">Escrowed amount in lamports</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">status</td>
                      <td className="p-3 text-gray-400">enum</td>
                      <td className="p-3 text-gray-400">Active | Released | Disputed | Settled</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">unlock_time</td>
                      <td className="p-3 text-gray-400">i64</td>
                      <td className="p-3 text-gray-400">Unix timestamp when time-lock expires</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gray-900 bg-opacity-30 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-light mb-4">SPL Token Support</h3>
              <p className="text-gray-400 text-sm mb-4">Escrows support SOL and SPL tokens (USDC, USDT).</p>
              <CodeBlock>{`await client.createAgreement({
  provider: providerPubkey,
  amount: 10_000_000,  // 10 USDC (6 decimals)
  timeLockSeconds: 86400,
  transactionId: 'order-456',
  mint: USDC_MINT  // SPL token mint address
});`}</CodeBlock>
            </div>
          </div>
        )}

        {/* Disputes */}
        {activeTab === 'disputes' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Dispute Resolution</h2>
            <p className="text-gray-400 mb-6">
              When service quality is disputed, multi-oracle consensus determines the settlement. Oracles vote on quality (0-100), and funds are split based on the median score.
            </p>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">markDisputed</h3>
              <p className="text-gray-400 text-sm mb-4">Trigger dispute resolution for an active escrow.</p>
              <CodeBlock>{`// Dispute triggers oracle voting
const tx = await client.markDisputed('order-123');

// Agreement status changes to Disputed
// Oracle panel is assembled from registry`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Quality-Based Settlement</h3>
              <p className="text-gray-400 text-sm mb-4">Oracles score service quality from 0-100. The median score determines the refund percentage.</p>
              <div className="border border-gray-800 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 bg-opacity-50">
                    <tr>
                      <th className="text-left p-3 text-gray-400 font-light">Quality Score</th>
                      <th className="text-left p-3 text-gray-400 font-light">Agent Refund</th>
                      <th className="text-left p-3 text-gray-400 font-light">Provider Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    <tr>
                      <td className="p-3 text-white">80-100%</td>
                      <td className="p-3 text-gray-400">0%</td>
                      <td className="p-3 text-cyan">100%</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-white">65-79%</td>
                      <td className="p-3 text-gray-400">35%</td>
                      <td className="p-3 text-cyan">65%</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-white">50-64%</td>
                      <td className="p-3 text-gray-400">75%</td>
                      <td className="p-3 text-cyan">25%</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-white">0-49%</td>
                      <td className="p-3 text-cyan">100%</td>
                      <td className="p-3 text-gray-400">0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Oracle Voting Flow</h3>
              <div className="space-y-4 text-sm">
                <div className="border-l-2 border-gray-800 pl-4">
                  <div className="text-white font-medium">1. Commit Phase</div>
                  <p className="text-gray-400">Oracles submit hash commitments: <code className="text-cyan">Poseidon(score, blinding, escrow_id, oracle_pk)</code></p>
                </div>
                <div className="border-l-2 border-gray-800 pl-4">
                  <div className="text-white font-medium">2. Delay Window</div>
                  <p className="text-gray-400">5-minute window prevents vote copying between oracles</p>
                </div>
                <div className="border-l-2 border-gray-800 pl-4">
                  <div className="text-white font-medium">3. Reveal Phase</div>
                  <p className="text-gray-400">Oracles reveal scores with Groth16 proofs verified on-chain</p>
                </div>
                <div className="border-l-2 border-gray-800 pl-4">
                  <div className="text-white font-medium">4. Settlement</div>
                  <p className="text-gray-400">Funds split automatically based on median score</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 bg-opacity-30 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-light mb-4">Oracle Slashing</h3>
              <p className="text-gray-400 text-sm">
                Oracles stake SOL as collateral. Consistent outlier votes result in 10% slashing per violation.
                Auto-removal after 3 violations protects system integrity.
              </p>
            </div>
          </div>
        )}

        {/* Agent Identity */}
        {activeTab === 'agents' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Agent Identity</h2>
            <p className="text-gray-400 mb-6">
              Agents have PDA-based identities with stake collateral. Reputation scores update based on transaction outcomes.
            </p>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">createAgent</h3>
              <p className="text-gray-400 text-sm mb-4">Create an agent identity with stake collateral.</p>
              <CodeBlock>{`import { KAMIYOClient, AgentType } from '@kamiyo/sdk';

const client = new KAMIYOClient({ connection, wallet });

const tx = await client.createAgent({
  name: 'TradingBot',
  agentType: AgentType.Trading,
  stakeAmount: 500_000_000  // 0.5 SOL stake
});

// PDA derivation
const [agentPDA] = client.getAgentPDA(wallet.publicKey);`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Agent Types</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-gray-800 rounded-lg p-4">
                  <div className="text-white font-medium mb-1">Trading</div>
                  <p className="text-gray-400 text-sm">Autonomous trading agents</p>
                </div>
                <div className="border border-gray-800 rounded-lg p-4">
                  <div className="text-white font-medium mb-1">Data</div>
                  <p className="text-gray-400 text-sm">Data processing and analysis</p>
                </div>
                <div className="border border-gray-800 rounded-lg p-4">
                  <div className="text-white font-medium mb-1">Service</div>
                  <p className="text-gray-400 text-sm">API and service providers</p>
                </div>
                <div className="border border-gray-800 rounded-lg p-4">
                  <div className="text-white font-medium mb-1">Custom</div>
                  <p className="text-gray-400 text-sm">User-defined agent types</p>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Account Structure</h3>
              <div className="border border-gray-800 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 bg-opacity-50">
                    <tr>
                      <th className="text-left p-3 text-gray-400 font-light">Field</th>
                      <th className="text-left p-3 text-gray-400 font-light">Type</th>
                      <th className="text-left p-3 text-gray-400 font-light">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    <tr>
                      <td className="p-3 font-mono text-cyan">owner</td>
                      <td className="p-3 text-gray-400">Pubkey</td>
                      <td className="p-3 text-gray-400">Wallet that controls the agent</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">name</td>
                      <td className="p-3 text-gray-400">String</td>
                      <td className="p-3 text-gray-400">Agent display name (max 32 chars)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">stake</td>
                      <td className="p-3 text-gray-400">u64</td>
                      <td className="p-3 text-gray-400">Staked collateral in lamports</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">reputation</td>
                      <td className="p-3 text-gray-400">u16</td>
                      <td className="p-3 text-gray-400">Trust score (0-10000, basis points)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">total_transactions</td>
                      <td className="p-3 text-gray-400">u32</td>
                      <td className="p-3 text-gray-400">Lifetime transaction count</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gray-900 bg-opacity-30 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-light mb-4">Slashing</h3>
              <p className="text-gray-400 text-sm">
                Agents can be slashed 5% for frivolous disputes. Stake protects providers from bad-faith agents.
                Reputation drops on lost disputes, affecting future trust scores.
              </p>
            </div>
          </div>
        )}

        {/* x402 Verification */}
        {activeTab === 'x402' && (
          <div>
            <h2 className="text-2xl font-light mb-6">x402 Payment Verification</h2>
            <p className="text-gray-400 mb-6">
              Verify USDC payments across multiple chains. Use with escrow for protected agent payments.
            </p>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">X402KAMIYOClient</h3>
              <p className="text-gray-400 text-sm mb-4">Wrap x402 requests with automatic escrow protection.</p>
              <CodeBlock>{`import { X402KAMIYOClient } from '@kamiyo/x402-client';

const client = new X402KAMIYOClient({
  connection,
  wallet,
  programId: KAMIYO_PROGRAM_ID,
  qualityThreshold: 70,  // Auto-dispute below this
  maxPricePerRequest: 0.1,
});

// Request with escrow protection
const response = await client.request('https://api.provider.com/data', {
  useEscrow: true,
  sla: { maxLatencyMs: 5000 },
});

// SLA violation triggers automatic dispute
if (!response.slaResult?.passed) {
  // Funds held in escrow, oracle consensus determines settlement
}`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Supported Chains</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {['Solana', 'Base', 'Ethereum', 'Polygon', 'Arbitrum', 'Optimism', 'Avalanche', 'BSC'].map(chain => (
                  <div key={chain} className="border border-gray-800 rounded-lg p-3 text-center">
                    <span className="text-white text-sm">{chain}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-900 bg-opacity-30 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-light mb-4">How it Works</h3>
              <p className="text-gray-400 text-sm mb-4">
                x402 handles payments. KAMIYO ensures they were earned.
              </p>
              <div className="text-sm text-gray-400 space-y-2">
                <div>1. Agent requests service with x402 payment</div>
                <div>2. Funds locked in KAMIYO escrow</div>
                <div>3. Service delivered, SLA checked</div>
                <div>4. Release on success, dispute on failure</div>
              </div>
            </div>
          </div>
        )}

        {/* SDKs */}
        {activeTab === 'sdks' && (
          <div>
            <h2 className="text-2xl font-light mb-6">Packages</h2>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Core SDK</h3>
              <div className="mb-4">
                <CodeBlock>npm install @kamiyo/sdk</CodeBlock>
              </div>
              <p className="text-gray-400 text-sm mb-4">TypeScript client for all KAMIYO protocol operations.</p>
              <CodeBlock>{`import { KAMIYOClient, AgentType } from '@kamiyo/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.generate();
const client = new KAMIYOClient({ connection, wallet });

// Create agent, escrows, and manage disputes
await client.createAgent({ name: 'Bot', agentType: AgentType.Trading, stakeAmount: 500_000_000 });
await client.createAgreement({ provider, amount, timeLockSeconds, transactionId });
await client.releaseFunds(transactionId, provider);`}</CodeBlock>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-light mb-4">Available Packages</h3>
              <div className="border border-gray-800 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 bg-opacity-50">
                    <tr>
                      <th className="text-left p-3 text-gray-400 font-light">Package</th>
                      <th className="text-left p-3 text-gray-400 font-light">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    <tr>
                      <td className="p-3 font-mono text-cyan">@kamiyo/sdk</td>
                      <td className="p-3 text-gray-400">Core TypeScript client</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">@kamiyo/x402-client</td>
                      <td className="p-3 text-gray-400">x402 payment client with escrow</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">@kamiyo/agent-client</td>
                      <td className="p-3 text-gray-400">Autonomous agent with auto-dispute</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">@kamiyo/middleware</td>
                      <td className="p-3 text-gray-400">Express middleware for HTTP 402</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">@kamiyo/langchain</td>
                      <td className="p-3 text-gray-400">LangChain tools integration</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">@kamiyo/mcp</td>
                      <td className="p-3 text-gray-400">MCP server for Claude/LLM agents</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-cyan">@kamiyo/actions</td>
                      <td className="p-3 text-gray-400">Agent framework actions</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gray-900 bg-opacity-30 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-light mb-4">Source Code</h3>
              <div className="text-sm text-gray-400 space-y-2">
                <div>• <a href="https://github.com/kamiyo-ai/kamiyo-protocol" className="text-cyan" target="_blank" rel="noopener noreferrer">GitHub Repository</a></div>
                <div>• <a href="https://solscan.io/account/8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM" className="text-cyan" target="_blank" rel="noopener noreferrer">Program on Solscan</a></div>
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
